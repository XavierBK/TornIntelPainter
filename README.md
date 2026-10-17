<<<<<<< HEAD
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
=======
# Faction Pixel Painter Bot 🎨

Welcome to the faction pixel art team! To conquer the canvas faster, we are breaking down massive images into smaller, manageable chunks (like 64x64 pixel squares). Each person will be assigned a chunk to paint. 

Because everyone has different monitor sizes and screen resolutions, **you must configure the bot for your specific screen before you can run it.**

---

## 🛠️ Step 1: Installation
You need Python installed on your computer. Once installed, open your terminal (or command prompt) and run this command to install the required libraries:
```bash
pip install pyautogui Pillow
```

---

## 📍 Step 2: Finding Your Coordinates (`coords.py`)
The bot needs to know exactly where to click on your screen. Because of different zooms and monitors, we use a helper script `coords.py` to find these numbers.

**How to use it:**
1. Run `coords.py` in your terminal. It will start printing out your mouse's X and Y coordinates every second.
2. Open the browser with the game canvas.
3. Hover your mouse perfectly over the following **four** spots and write down the X and Y numbers for each:
   * **Top-Left Canvas Pixel:** The very first pixel square in the top-left corner of the drawing board.
   * **Bottom-Right Canvas Pixel:** The very last pixel square in the bottom-right corner.
   * **Rainbow Button:** The button that opens the custom hex color palette.
   * **Hex Input Box:** The text box where you type the color code.

---

## ⚙️ Step 3: Configuring the Bot (`pixel_bot.py`)
Open `painter.py` in a text editor (like Notepad or VS Code) and look at the `--- CONFIGURATION ---` section at the top. 

Update the variables using the numbers you just wrote down:

```python
TOP_LEFT_X = 450      # Replace with your top-left X
TOP_LEFT_Y = 350      # Replace with your top-left Y
BOTTOM_RIGHT_X = 962  # Replace with your bottom-right X
BOTTOM_RIGHT_Y = 862  # Replace with your bottom-right Y

RAINBOW_BTN_X = 645   # Replace with your rainbow button X
RAINBOW_BTN_Y = 35    # Replace with your rainbow button Y
HEX_INPUT_X = 720     # Replace with your hex input box X
HEX_INPUT_Y = 80      # Replace with your hex input box Y
```

### Canvas Size vs. Chunk Size
You also need to tell the bot how big the *entire game board* is right now, not just your image chunk.
- You can set it to a small chunk if you are zoomed in for better precision
* If the faction is currently working on the level 3 canvas, set it to:
  ```python
  CANVAS_GRID_WIDTH = 256
  CANVAS_GRID_HEIGHT = 256
  ```

---

## 🧩 Step 4: Placing Your Chunk
When faction leadership gives you a smaller chunk of an image (e.g., a 64x64 PNG), save it to the same folder as the script and update the filename in the config:
```python
IMAGE_PATH = 'my_assigned_chunk.jpg'
```

**Positioning your chunk:**
If you are assigned to paint the top-left corner of the canvas, you can leave `START_X = 0` and `START_Y = 0`. 

However, if you are assigned a chunk that goes somewhere else on the board, you need to use the **Start Offsets**. For example, if you are assigned the 64x64 square that sits in the top-right quadrant, you would set:
```python
START_X = 192  # Shifts your image 192 pixels to the right
START_Y = 0    # Keeps it at the top
```
*Note: If your bot crashes or you need to pause, you can also use `START_X` and `START_Y` to resume exactly where you left off!*

---

## 🚀 Step 5: Running the Bot
Once configured, run the script!
```bash
python painter.py
```
1. It will ask you for your **current cooldown**. Enter it (e.g., `0.5`, `1.5`, `2.5`) and press Enter.
2. You will have **5 seconds** to switch to your browser window.
3. Let go of the mouse and watch it work!

### 🛑 EMERGENCY STOP (Failsafe)
If the bot messes up or you need to stop it instantly, **move your mouse into any of the 4 corners of your computer monitor.** The `pyautogui` library has a built-in failsafe that will instantly stop the script if the mouse hits the very edge of the screen.

---

### Tips for Faction Mates
* **Browser Zoom:** Do not change your browser zoom or scroll the page after finding your coordinates. If you scroll, your coordinates will be completely wrong and the bot will click the wrong things!
>>>>>>> d6e1e5606da96e123bdd311ab2e11b72f08f8b8d
