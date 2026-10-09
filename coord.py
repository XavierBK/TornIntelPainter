import time
import pyautogui

print("Move your mouse to the target button. Press Ctrl+C to stop.")
try:
    while True:
        x, y = pyautogui.position()
        position_str = f"X: {x.str().rjust(4)} Y: {y.str().rjust(4)}" if hasattr(x, 'str') else f"X: {str(x).rjust(4)} Y: {str(y).rjust(4)}"
        print(f"\rX: {x}, Y: {y}   ", end="")
        time.sleep(0.1)
except KeyboardInterrupt:
    print("\nDone.")