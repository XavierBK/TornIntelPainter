import pyautogui
import time
from PIL import Image

# --- CONFIGURATION ---
# 1. Screen coordinates for the edges of the game's drawing canvas
TOP_LEFT_X = 1264     # Left edge of the canvas on your monitor
TOP_LEFT_Y = 464      # Top edge of the canvas on your monitor
BOTTOM_RIGHT_X = 2380 # Right edge of the canvas
BOTTOM_RIGHT_Y = 1580 # Bottom edge of the canvas
START_X = 140 
START_Y = 8

# 2. How many game-pixels wide/tall is the canvas right now?
CANVAS_GRID_WIDTH  = 128
CANVAS_GRID_HEIGHT = 128

# 3. UI Buttons
RAINBOW_BTN_X = 2193
RAINBOW_BTN_Y = 185
HEX_INPUT_X = 2313
HEX_INPUT_Y = 263

IMAGE_PATH = 'nw128-tr.jpg' #nw128, nw256, nw512, nw1024, nw2048, nw4096, nw8192, nw16384, nw32768

def rgb_to_hex(r, g, b):
    return '{:02x}{:02x}{:02x}'.format(r, g, b).upper()

def set_color(hex_code):
    """Automates clicking the rainbow button and entering the hex code."""
    pyautogui.click(RAINBOW_BTN_X, RAINBOW_BTN_Y)
    time.sleep(0.2)
    pyautogui.doubleClick(HEX_INPUT_X, HEX_INPUT_Y)
    time.sleep(0.1)
    pyautogui.typewrite(hex_code)
    time.sleep(0.1)
    pyautogui.press('enter')
    time.sleep(0.2)

def draw_image(cooldown_seconds):
    try:
        img = Image.open(IMAGE_PATH).convert('RGB')
    except FileNotFoundError:
        print(f"Error: Could not find {IMAGE_PATH}")
        return

    img_width, img_height = img.size
    current_hex = ""

    # Calculate exactly how many monitor pixels make up one game pixel
    step_x = (BOTTOM_RIGHT_X - TOP_LEFT_X) / CANVAS_GRID_WIDTH
    step_y = (BOTTOM_RIGHT_Y - TOP_LEFT_Y) / CANVAS_GRID_HEIGHT

    print("\nStarting in 5 seconds. Switch to the canvas window now...")
    time.sleep(5)

    # Loop through the image pixels (only up to the canvas limit if the image is too big)
    max_x = min(img_width, CANVAS_GRID_WIDTH)
    max_y = min(img_height, CANVAS_GRID_HEIGHT)

    for y in range(max_y):
        if y < START_Y:
            continue
        
        for x in range(max_x):
            if y == START_Y and x < START_X:
                continue
            
            r, g, b = img.getpixel((x, y))
            target_hex = rgb_to_hex(r, g, b)

            if target_hex != current_hex:
                set_color(target_hex)
                current_hex = target_hex

            # Calculate exact center of the target cell on your monitor
            # We add (step / 2) to ensure the click hits the middle of the square, not the corner
            screen_x = round(TOP_LEFT_X + (x * step_x) + (step_x / 2))
            screen_y = round(TOP_LEFT_Y + (y * step_y) + (step_y / 2))

            pyautogui.click(screen_x, screen_y)
            print(f"Placed ({x}, {y}) | Color: {target_hex}")

            time.sleep(cooldown_seconds)

if __name__ == "__main__":
    pyautogui.FAILSAFE = True 
    
    # Prompt the user for the current cooldown before launching
    user_input = input("Enter your current cooldown in seconds (e.g., 0.5): ")
    try:
        cooldown = float(user_input)
    except ValueError:
        print("Invalid input. Defaulting to 1.0 seconds.")
        cooldown = 1.0

    draw_image(cooldown)