"""Per-band visual difference between original and Atrium screenshots (mean abs RGB diff, 0-255).
Usage: python3 diffbands.py <site> [threshold]"""
import sys, os
from PIL import Image, ImageChops, ImageStat
site = sys.argv[1]; thr = float(sys.argv[2]) if len(sys.argv) > 2 else 12
pages = ['home','about','venue','weddings','events','packages','gallery','contact','not-a-page']
rows = []
for p in pages:
    for vp in ['desktop','mobile']:
        fo, fa = f'out/shots/orig-{site}/{p}-{vp}.png', f'out/shots/atrium-{site}/{p}-{vp}.png'
        if not (os.path.exists(fo) and os.path.exists(fa)): continue
        a, b = Image.open(fo).convert('RGB'), Image.open(fa).convert('RGB')
        h = min(a.height, b.height); band = 300 if vp == 'desktop' else 400
        scores = []
        for y in range(0, h, band):
            d = ImageChops.difference(a.crop((0, y, a.width, min(h, y + band))), b.crop((0, y, b.width, min(h, y + band))))
            scores.append(round(sum(ImageStat.Stat(d).mean) / 3, 1))
        overall = round(sum(scores) / len(scores), 1)
        hot = [(i * band, s) for i, s in enumerate(scores) if s > thr]
        rows.append((p, vp, a.height, b.height, overall, hot))
        print(f'{p:11s} {vp:7s} h {a.height}/{b.height}  mean {overall:5.1f}  hot: {hot}')
