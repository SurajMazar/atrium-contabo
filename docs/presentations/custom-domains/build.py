"""Builds index.html (a standalone, offline-friendly viewer) from source/deck.json and source/slides/*.html."""
import json, re, html, pathlib
root = pathlib.Path(__file__).resolve().parent
deck = json.loads((root/'source/deck.json').read_text())
ICONS = {
 'Globe': '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"/>',
 'Lock': '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
 'Verified': '<path d="M12 2l2.4 2.2 3.2-.4.8 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.8 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.8-3.1-2.8-1.6 1.2-3-1.2-3 2.8-1.6.8-3.1 3.2.4z"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
}
def icon(m):
    attrs = m.group(1)
    name = re.search(r'name="([^"]+)"', attrs).group(1)
    style = re.search(r'style="([^"]*)"', attrs)
    return f'<svg class="x-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="{style.group(1) if style else ""}" aria-hidden="true">{ICONS.get(name, "")}</svg>'
def connector(m):
    attrs = m.group(1)
    g = lambda k, d=None: (re.search(rf'\b{k}="([^"]*)"', attrs) or [None, d])[1]
    x1, y1, x2, y2 = (float(g(k)) for k in ('x1', 'y1', 'x2', 'y2'))
    route = g('route', 'straight')
    style = g('style', '')
    color = (re.search(r'color:([^;]+)', style) or [None, '#2F5BD8'])[1]
    width = float((re.search(r'border-width:(\d+)', style) or [None, '2'])[1])
    pts = [(x1, y1)]
    if route == 'vh': pts.append((x1, y2))
    elif route == 'hv': pts.append((x2, y1))
    pts.append((x2, y2))
    d = 'M ' + ' L '.join(f'{x} {y}' for x, y in pts)
    mid = f'm{abs(hash((x1,y1,x2,y2)))%100000}'
    build = g('data-build-in')
    b = f' data-build-in="{build}"' if build else ''
    return (f'<svg class="x-connector"{b} width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">'
            f'<defs><marker id="{mid}" orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z" fill="{color}"/></marker></defs>'
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#{mid})"/></svg>')
def embed(m):
    style, body = m.group(1), m.group(2)
    return f'<iframe class="x-embed" style="{style};border:0" sandbox="allow-scripts" srcdoc="{html.escape(body, quote=True)}" title="Animated diagram"></iframe>'
slides = []
for sid in deck['order']:
    s = (root/f'source/slides/{sid}.html').read_text()
    s = re.sub(r'<x-embed style="([^"]*)">(.*?)</x-embed>', embed, s, flags=re.S)
    s = re.sub(r'<x-icon([^>]*)></x-icon>', icon, s)
    s = re.sub(r'<x-connector([^>]*)></x-connector>', connector, s)
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    slides.append(s)
fonts = '&'.join(f['href'].split('?', 1)[1].replace('&display=swap', '') for f in deck['faces'].values())
page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(deck['title'])}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{fonts}&display=swap">
<style>
html,body{{margin:0;height:100%;background:#05080d;overflow:hidden;font-family:'IBM Plex Sans',Arial,sans-serif}}
#stage{{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:0 0}}
section{{position:absolute;inset:0;width:1920px;height:1080px;box-sizing:border-box;overflow:hidden}}
section:not(.on){{display:none!important}}
section *{{box-sizing:border-box}}
section p,section h1,section h2,section h3,section table{{margin:0}}
section h1{{font-size:96px;font-weight:600;line-height:1.1}}
section h2{{font-size:64px;font-weight:600;line-height:1.15}}
section h3{{font-size:44px;font-weight:600;line-height:1.2}}
section p{{font-size:32px;line-height:1.4}}
section div{{display:flex;flex-direction:column}}
section div[style*="display:grid"]{{display:grid}}
section table{{border-collapse:collapse}}
section th,section td{{padding:.35em .6em;border-bottom:1px solid rgba(128,128,128,.35);vertical-align:top;text-align:left}}
section aside{{display:none}}
x-shape{{display:block;flex:none}}
x-shape[kind=arrow-right]{{clip-path:polygon(0 30%,60% 30%,60% 0,100% 50%,60% 100%,60% 70%,0 70%)}}
x-shape[kind=arrow-down]{{clip-path:polygon(30% 0,70% 0,70% 60%,100% 60%,50% 100%,0 60%,30% 60%)}}
.x-icon{{flex:none}}
.x-connector{{position:absolute;left:0;top:0;pointer-events:none}}
#bar{{position:fixed;left:0;right:0;bottom:0;display:flex;gap:12px;align-items:center;justify-content:center;padding:10px;color:#BFC9D9;font:14px system-ui,sans-serif;background:rgba(5,8,13,.75);opacity:.2;transition:opacity .2s}}
#bar:hover{{opacity:1}}
#bar button{{background:#172235;color:#F6F4EF;border:1px solid #26344D;border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit}}
#notes{{position:fixed;left:16px;right:16px;bottom:56px;max-width:900px;margin:0 auto;background:#F6F4EF;color:#16202E;border-radius:12px;padding:16px 20px;font:16px/1.5 system-ui,sans-serif;display:none;box-shadow:0 8px 30px rgba(0,0,0,.4)}}
</style></head><body>
<div id="stage">
{chr(10).join(slides)}
</div>
<div id="notes"></div>
<div id="bar"><button id="prev" aria-label="Previous slide">←</button><span id="count"></span><button id="next" aria-label="Next slide">→</button><button id="nb">Notes (N)</button><button id="fs">Full screen (F)</button></div>
<script>
var S=[].slice.call(document.querySelectorAll('#stage > section')),i=0,notes=false,stage=document.getElementById('stage'),nEl=document.getElementById('notes');
function fit(){{var k=Math.min(innerWidth/1920,innerHeight/1080);stage.style.transform='scale('+k+') translate(-50%,-50%)';}}
function show(n){{i=Math.max(0,Math.min(S.length-1,n));S.forEach(function(s,j){{s.classList.toggle('on',j===i);}});
document.getElementById('count').textContent=(i+1)+' / '+S.length;var a=S[i].querySelector('aside');nEl.textContent=a?a.textContent:'No notes for this slide.';nEl.style.display=notes?'block':'none';
try{{history.replaceState(null,'','#'+S[i].id);}}catch(e){{}}}}
addEventListener('resize',fit);
addEventListener('keydown',function(e){{if(['ArrowRight','PageDown',' '].indexOf(e.key)>=0){{show(i+1);e.preventDefault();}}else if(['ArrowLeft','PageUp'].indexOf(e.key)>=0)show(i-1);else if(e.key==='Home')show(0);else if(e.key==='End')show(S.length-1);else if(e.key==='n'||e.key==='N'){{notes=!notes;show(i);}}else if(e.key==='f'||e.key==='F'){{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}}}});
document.getElementById('prev').onclick=function(){{show(i-1);}};document.getElementById('next').onclick=function(){{show(i+1);}};
document.getElementById('nb').onclick=function(){{notes=!notes;show(i);}};document.getElementById('fs').onclick=function(){{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}};
var start=S.findIndex(function(s){{return '#'+s.id===location.hash;}});fit();show(start>0?start:0);
</script>
</body></html>
'''
(root/'index.html').write_text(page)
print(len(page), len(slides))
