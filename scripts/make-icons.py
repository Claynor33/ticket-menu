# Génère les icônes PNG (192, 512, 180 pour iOS) à partir du même dessin que icon.svg.
from PIL import Image, ImageDraw
import os
out = os.path.join(os.path.dirname(__file__), '..', 'server', 'public')
def icon(size):
    s = size / 512
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(96 * s), fill=(201, 61, 38, 255))
    # Contour du ticket : haut plat, bord inférieur dentelé (8 dents de 27 px).
    pts = [(148, 96), (364, 96), (364, 416)] + [(364 - 27 * k - (13.5 if j == 0 else 27), 396 if j == 0 else 416) for k in range(8) for j in (0, 1)]
    d.polygon([(px * s, py * s) for px, py in pts], fill=(255, 244, 228, 255))
    for y in (168, 224, 280):
        x2 = 316 if y < 280 else 268
        d.line([(196 * s, y * s), (x2 * s, y * s)], fill=(201, 61, 38, 255), width=int(18 * s))
    return im
os.makedirs(out, exist_ok=True)
icon(192).save(os.path.join(out, 'icon-192.png'))
icon(512).save(os.path.join(out, 'icon-512.png'))
bg = Image.new('RGB', (180, 180), (201, 61, 38))
bg.paste(icon(180), (0, 0), icon(180))
bg.save(os.path.join(out, 'apple-touch-icon.png'))
print('Icônes générées')
