"""
Run this once to generate all PWA icon sizes from garbylogoicon.png.
Requires: pip install Pillow

Usage: python generate_icons.py
Output: frontend/public/icons/*.png
"""

from PIL import Image
import os

SRC   = "../detection_engine/garbylogoicon.png"  # adjust path if needed
SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
OUTDIR = "../frontend/public/icons"

os.makedirs(OUTDIR, exist_ok=True)

# Load source icon
img = Image.open(SRC).convert("RGBA")

for size in SIZES:
    # Create a dark background canvas
    canvas = Image.new("RGBA", (size, size), (7, 8, 26, 255))  # Garby Black

    # Scale icon to fit with 15% padding
    pad    = int(size * 0.15)
    inner  = size - pad * 2
    scaled = img.resize((inner, inner), Image.LANCZOS)

    # Paste centred on canvas
    canvas.paste(scaled, (pad, pad), scaled)

    # Save as PNG
    out_path = os.path.join(OUTDIR, f"icon-{size}.png")
    canvas.save(out_path, "PNG")
    print(f"  Generated: icon-{size}.png")

print(f"\nAll icons saved to {OUTDIR}/")
print("Copy the icons/ folder into frontend/public/")
