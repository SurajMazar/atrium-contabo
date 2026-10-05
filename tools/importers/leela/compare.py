"""Side-by-side comparison images: original (left) vs Atrium (right), cut into viewable chunks.
Usage: python3 compare.py <site> [page ...]   (site = leela | vilasa)"""
import sys, os
from PIL import Image, ImageDraw
site = sys.argv[1]
pages = sys.argv[2:] or ['home','about','venue','weddings','events','packages','gallery','contact']
src_o, src_a = f'out/shots/orig-{site}', f'out/shots/atrium-{site}'
dst = 'out/compare'; os.makedirs(dst, exist_ok=True)
for p in pages:
    for vp in ['desktop','mobile']:
        fo, fa = f'{src_o}/{p}-{vp}.png', f'{src_a}/{p}-{vp}.png'
        if not (os.path.exists(fo) and os.path.exists(fa)): continue
        a, b = Image.open(fo).convert('RGB'), Image.open(fa).convert('RGB')
        gap = 24
        h = max(a.height, b.height)
        out = Image.new('RGB', (a.width + b.width + gap, h + 40), (255, 0, 255))
        out.paste(a, (0, 40)); out.paste(b, (a.width + gap, 40))
        d = ImageDraw.Draw(out)
        d.rectangle((0,0,out.width,40), fill=(0,0,0))
        d.text((10, 12), f'ORIGINAL {site} /{p} {vp} ({a.height}px)', fill=(255,255,255))
        d.text((a.width + gap + 10, 12), f'ATRIUM {site} /{p} {vp} ({b.height}px)', fill=(255,255,255))
        name = f'{dst}/{site}-{p}-{vp}.png'
        out.save(name, optimize=True)
        print(name, a.size, b.size)
