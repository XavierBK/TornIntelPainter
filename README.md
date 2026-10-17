# graffiti-painter

Paint a PNG onto torn-intel.com's graffiti walls (your faction's wall or the
public wall) using your own account.

## How it works (protocol notes)

- Login: `POST /api/auth/login` with `{"apiKey": ...}` → `torn-intel-session` cookie.
- Canvas: `GET /api/factions/<id>/graffiti` or `GET /api/public-graffiti` →
  `{ pixels: [{x, y, color, playerId, playerName, placedAt}], playerStats }`.
- Canvas size grows via tiers (64 → 128 → 256 → 512 → 1024 → 2048, unlocked at
  66% fill — table lifted from their client). The painter **auto-detects** the
  current size from the wall, and paints beyond the observed area only if the
  server accepts it — rejected pixels are skipped as "locked" for that run.
- Paint: `POST <canvas url>` with `{"x": n, "y": n, "color": "#E50000"}` → `{"ok": true}`.
  (The site's own client uses the same REST call as its offline fallback.)
- No cooldown field is returned; pacing is on us. The painter sends one pixel
  per request with a delay (default 300 ms) and backs off exponentially on any
  error, saving progress for `--resume`.

The standard palette is 10 colors (see `PALETTE` in painter.js). Accounts with
the custom-color perk can send any hex with `--custom-colors`.

## Setup

```
cd tools/graffiti
npm install
```

The Torn key comes from `TORN_KEY` in the project `.env` (or pass `--key`).
Note: it logs in as **you** — everything painted is attributed to your name.

## Use

Point it at the **full artwork** once and re-run the same command after every
canvas upgrade — out-of-bounds areas are skipped quietly until the tier is
live, and already-correct pixels are skipped too, so restarts are nearly free:

```
node painter.js --image nw1024.png --x 0 --y 0 --custom-colors --overwrite --confirm --delay-ms 100
```

(Add `--canvas public` for the public wall; `--resume --confirm` to continue
an interrupted run.)

Options that matter:

- `--canvas public` — the public wall instead of your faction's.
- `--width/--height` — resize (nearest-neighbor) before painting.
- `--overwrite` — paint over existing pixels (default skips them so you don't
  stomp other people's art).
- `--custom-colors` — skip palette mapping (requires the perk; otherwise use
  the default nearest-palette mapping).
- `--delay-ms 1000` — slower, politer.

Transparent pixels are skipped, so PNGs with alpha work as stencils.

## Etiquette / safety

- Dry run by default; nothing paints without `--confirm`.
- It refuses to overwrite other players' pixels unless you pass `--overwrite`.
- Backs off hard on errors instead of hammering — a 4xx that persists stops
  the run cleanly (state kept for resume).
- It's your account and your key; respect torn-intel's terms and don't use
  this to grief other people's art.