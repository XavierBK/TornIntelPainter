#!/usr/bin/env node
'use strict';

/*
 * graffiti-painter — paint a PNG onto torn-intel.com's graffiti walls.
 *
 * Protocol (reverse-engineered from the torn-intel client, 2026-10-11):
 *   POST /api/auth/login              { apiKey }                -> session cookie
 *   GET  /api/factions/<id>/graffiti  -> { pixels: [{x,y,color,...}], playerStats }
 *   GET  /api/public-graffiti         -> same shape (public wall)
 *   POST <canvas url>                 { x, y, color }           -> { ok: true }
 *   Colors are hex strings; the standard palette is 10 colors, and accounts
 *   with custom colors can send any hex. Canvas size grows via tiers:
 *   64 -> 128 -> 256 -> 512 -> 1024 -> 2048, unlocked by painted-pixel count.
 *   No cooldown field is returned; we pace ourselves and back off on errors.
 *
 * Just point it at the FULL artwork at (0,0): anything beyond the current
 * canvas is skipped quietly, and re-running the same command after a tier
 * upgrade paints the newly available area. See README.md.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const BASE = 'https://torn-intel.com';
const PALETTE = ['#E50000', '#0000EA', '#02BE01', '#94E044', '#0083C7', '#FF0000', '#E4E4E4', '#888888', '#222222', '#FFFFFF'];

// Canvas tier table, lifted from torn-intel's own client. The wall grows to
// the largest tier whose unlockAt is <= the number of painted pixels.
const TIERS = [
  { size: 64, unlockAt: 0 },
  { size: 128, unlockAt: 2703 },
  { size: 256, unlockAt: 10813 },
  { size: 512, unlockAt: 43253 },
  { size: 1024, unlockAt: 173015 },
  { size: 2048, unlockAt: 692060 },
];

// --- tiny argv parser ---
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1 || i + 1 >= process.argv.length) return def;
  return process.argv[i + 1];
}
function flag(name) {
  return process.argv.includes('--' + name);
}

function loadKey() {
  if (process.env.TORN_KEY) return process.env.TORN_KEY;
  const envPath = path.join(__dirname, '..', '..', '.env');
  const m = fs.readFileSync(envPath, 'utf8').match(/^TORN_KEY=(.+)$/m);
  if (!m) throw new Error('No TORN_KEY found (env or faction-intel/.env)');
  return m[1].trim();
}

function help() {
  console.log(`Usage: node painter.js --image <file.png> [options]

Required:
  --image <file.png>       PNG to paint (other formats: convert first)

Placement:
  --x <n> --y <n>          top-left placement (default 0,0)
  --canvas <faction|public>  which wall (default: faction)
  --faction-id <id>        faction wall id (default: 50170)
  --canvas-size <n>        override auto-detected canvas size (rarely needed)
  --width <n> --height <n> resize the image (nearest neighbor; default native size)

Painting:
  --confirm                actually paint (WITHOUT this: dry run only)
  --overwrite              paint over existing pixels (default: skip painted pixels)
  --custom-colors          send the image's own hex colors (needs custom-color
                           perk on your account; default: nearest palette color)
  --delay-ms <n>           delay between paints (default 300)
  --state <file>           resume/progress file (default: <image>.state.json)
  --resume                 resume an interrupted run from the state file

Auth:
  --key <torn key>         default: TORN_KEY env or faction-intel/.env
`);
}

async function jsonFetch(url, opts = {}, cookie = null) {
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'graffiti-painter/1.0 (own-account automation)' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { ...opts, headers });
  const setCookie = res.headers.get('set-cookie') || '';
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { res, body, setCookie };
}

async function login(key) {
  const { res, body, setCookie } = await jsonFetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ apiKey: key }),
  });
  if (!res.ok || !setCookie) {
    throw new Error(`login failed: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  const m = setCookie.match(/torn-intel-session=[^;]+/);
  if (!m) throw new Error('login ok but no session cookie returned');
  return m[0];
}

function canvasUrl(canvas, factionId) {
  return canvas === 'public' ? `${BASE}/api/public-graffiti` : `${BASE}/api/factions/${factionId}/graffiti`;
}

function nearestPalette(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  let best = PALETTE[0], bestD = Infinity;
  for (const p of PALETTE) {
    const pr = parseInt(p.slice(1, 3), 16), pg = parseInt(p.slice(3, 5), 16), pb = parseInt(p.slice(5, 7), 16);
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function readImageResized(file, targetW, targetH) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const w = targetW || png.width, h = targetH || png.height;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(png.width - 1, Math.floor((x * png.width) / w));
      const sy = Math.min(png.height - 1, Math.floor((y * png.height) / h));
      const si = (sy * png.width + sx) * 4, di = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = png.data[si + c];
    }
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (flag('help') || !arg('image')) { help(); process.exit(flag('help') ? 0 : 1); }

  const image = arg('image');
  const canvas = arg('canvas', 'faction');
  const factionId = arg('faction-id', '50170');
  const ox = parseInt(arg('x', '0'), 10) || 0;
  const oy = parseInt(arg('y', '0'), 10) || 0;
  const sizeOverride = arg('canvas-size') ? parseInt(arg('canvas-size'), 10) : null;
  const width = arg('width') ? parseInt(arg('width'), 10) : null;
  const height = arg('height') ? parseInt(arg('height'), 10) : null;
  const confirm = flag('confirm');
  const overwrite = flag('overwrite');
  const customColors = flag('custom-colors');
  const delayMs = parseInt(arg('delay-ms', '300'), 10);
  const stateFile = arg('state', image.replace(/\.(png|PNG)$/, '') + '.state.json');
  const resume = flag('resume');
  const key = arg('key') || loadKey();

  const url = canvasUrl(canvas, factionId);
  console.log(`Painter: ${canvas} wall (${url}) at (${ox},${oy})`);

  const cookie = await login(key);
  console.log('logged in.');

  // current wall state + tier detection
  const { res: cres, body: cur } = await jsonFetch(url, {}, cookie);
  if (!cres.ok) throw new Error(`cannot read canvas: HTTP ${cres.status}`);
  const existing = new Map();
  let observedMax = -1;
  for (const p of cur.pixels || []) {
    existing.set(`${p.x},${p.y}`, (p.color || '').toUpperCase());
    observedMax = Math.max(observedMax, p.x, p.y);
  }
  const paintedCount = (cur.pixels || []).length;
  const canvasSize = sizeOverride || Math.max(...TIERS.filter((t) => paintedCount >= t.unlockAt).map((t) => t.size), 64);
  console.log(`canvas read: ${paintedCount} painted pixels, observed extent ${observedMax + 1}, canvas size ${canvasSize}${sizeOverride ? ' (override)' : ' (auto-detected)'}.`);

  // plan
  let todo = null;
  if (resume && fs.existsSync(stateFile)) {
    todo = JSON.parse(fs.readFileSync(stateFile, 'utf8')).todo;
    console.log(`resuming: ${todo.length} pixels left from state file.`);
  } else {
    const img = readImageResized(image, width, height);
    console.log(`image: ${img.width}x${img.height} -> placed at (${ox},${oy})`);
    todo = [];
    const counts = { skippedExisting: 0, skippedTransparent: 0, outOfBounds: 0 };
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        if (img.data[i + 3] < 128) { counts.skippedTransparent++; continue; }
        const hex = '#' + [img.data[i], img.data[i + 1], img.data[i + 2]]
          .map((v) => v.toString(16).padStart(2, '0')).join('');
        const color = customColors ? hex.toLowerCase() : nearestPalette(hex);
        const cx = ox + x, cy = oy + y;
        if (cx < 0 || cy < 0 || cx >= canvasSize || cy >= canvasSize) { counts.outOfBounds++; continue; }
        const curColor = existing.get(`${cx},${cy}`);
        if (curColor === color.toUpperCase()) continue;            // already right
        if (!overwrite && curColor !== undefined) { counts.skippedExisting++; continue; }
        todo.push([cx, cy, color]);
      }
    }
    console.log(`plan: ${todo.length} paints (${counts.skippedExisting} already-colored skipped, ${counts.skippedTransparent} transparent skipped, ${counts.outOfBounds} beyond canvas skipped)`);
  }

  if (!todo.length) { console.log('nothing to paint. re-run this same command after the canvas grows.'); return; }
  const summary = {};
  for (const [, , c] of todo) summary[c] = (summary[c] || 0) + 1;
  const topColors = Object.entries(summary).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('top colors:', topColors.map(([c, n]) => `${c}×${n}`).join(' ') + (Object.keys(summary).length > 8 ? ' …' : ''));

  if (!confirm) {
    console.log('\nDRY RUN — nothing painted. Add --confirm to paint, --resume to continue later.');
    fs.writeFileSync(stateFile, JSON.stringify({ todo }, null, 0));
    console.log(`plan saved to ${stateFile} (run again with --resume --confirm to execute)`);
    return;
  }

  // paint loop with adaptive backoff.
  // Pixels beyond the wall's observed extent are attempted once: if the server
  // rejects them the rest of that region is skipped quietly for this run (the
  // tier isn't live yet) — a later re-run picks it up. If accepted, painting
  // proceeds into the new territory normally.
  let backoff = 2000;
  let expansionBlocked = false;
  let skippedLocked = 0;
  const started = Date.now();
  let done = 0;
  const total = todo.length;
  const saveState = () => fs.writeFileSync(stateFile, JSON.stringify({ todo }));
  process.on('SIGINT', () => { saveState(); console.error(`\ninterrupted — ${todo.length} left (resume with --resume --confirm)`); process.exit(130); });
  while (todo.length) {
    const [x, y, color] = todo[0];
    if (expansionBlocked && (x > observedMax || y > observedMax)) {
      todo.shift(); skippedLocked++; continue;
    }
    for (;;) {
      let res, body;
      try {
        ({ res, body } = await jsonFetch(url, { method: 'POST', body: JSON.stringify({ x, y, color }) }, cookie));
      } catch (e) {
        // network-level failure (connection reset, DNS blip, ...) — same as a 5xx
        console.warn(`paint (${x},${y}) -> network error: ${e.message}; backing off ${backoff}ms`);
        await sleep(Math.min(backoff, 120000));
        backoff *= 2;
        continue;
      }
      if (res.ok && body && body.ok) {
        backoff = 2000;
        break;
      }
      if (res.status === 403 && body && /pro required/i.test(body.error || '')) {
        console.error(`\n${body.error} — your torn-intel subscription has lapsed. renew, then re-run this exact command to resume (${todo.length} paints left, state saved).`);
        saveState();
        process.exit(2);
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 429 && (x > observedMax || y > observedMax)) {
        // tier not live yet on the server — stop trying this region
        expansionBlocked = true;
        break;
      }
      const wait = Math.min(backoff, 120000);
      console.warn(`paint (${x},${y}) -> HTTP ${res.status} ${JSON.stringify(body) || ''}; backing off ${wait}ms`);
      await sleep(wait);
      backoff *= 2;
      if (backoff > 120000 && res.status >= 400 && res.status < 500 && res.status !== 429) {
        console.error('persistent client error — stopping. state file kept for --resume.');
        saveState();
        process.exit(1);
      }
    }
    if (expansionBlocked && (x > observedMax || y > observedMax)) {
      // the failed probe counts as skipped; the loop head skips its siblings
      todo.shift(); skippedLocked++;
    } else {
      todo.shift();
    }
    done++;
    if (done % 25 === 0 || !todo.length) {
      saveState();
      const elapsed = (Date.now() - started) / 1000;
      const rate = done / elapsed;
      const etaMin = todo.length / rate / 60;
      process.stdout.write(`\r${done}/${total} painted (${rate.toFixed(1)}/s, ~${etaMin < 60 ? Math.round(etaMin) + 'm' : (etaMin / 60).toFixed(1) + 'h'} left${skippedLocked ? `, ${skippedLocked} locked` : ''})   `);
    }
    await sleep(delayMs);
  }
  saveState();
  console.log(`\ndone in ${((Date.now() - started) / 1000).toFixed(0)}s.${skippedLocked ? ` (${skippedLocked} pixels skipped — canvas tier not live yet; re-run the same command after the upgrade.)` : ''}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
