// Tutorial overlay: fake cursor, click ripple, highlight box, captions, chapter tag.
// Injected into every top-level page during recording (not into iframes).
(() => {
  if (window.top !== window || window.__tut) return;
  const css = `
  #__tut-root{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  #__tut-cursor{position:absolute;left:0;top:0;width:26px;height:26px;opacity:0;transform:translate(960px,540px);transition:transform var(--d,600ms) cubic-bezier(.22,.8,.24,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
  #__tut-cursor svg{width:26px;height:26px}
  .__tut-ripple{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid rgba(43,79,216,.9);background:rgba(43,79,216,.18);animation:__tutr .55s ease-out forwards}
  @keyframes __tutr{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
  #__tut-hl{position:absolute;border:2px solid #2b4fd8;border-radius:8px;box-shadow:0 0 0 9999px rgba(15,17,23,.38);transition:all .45s cubic-bezier(.22,.8,.24,1);opacity:0}
  #__tut-hl-label{position:absolute;left:0;top:-34px;background:#2b4fd8;color:#fff;font-size:15px;font-weight:600;padding:5px 10px;border-radius:6px;white-space:nowrap}
  #__tut-cap{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);max-width:1280px;background:rgba(14,15,18,.86);color:#f4f4f2;font-size:25px;line-height:1.38;padding:12px 22px;border-radius:10px;text-align:center;opacity:0;transition:opacity .25s}
  #__tut-tag{position:absolute;left:28px;top:24px;background:rgba(14,15,18,.82);color:#fff;font-size:15px;font-weight:600;letter-spacing:.02em;padding:7px 12px;border-radius:7px;opacity:0;transition:opacity .3s}
  #__tut-tag span{opacity:.6;font-weight:500;margin-right:8px}`;
  const boot = () => {
    if (document.getElementById('__tut-root')) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
    const root = document.createElement('div');
    root.id = '__tut-root';
    root.innerHTML = `<div id="__tut-hl"><div id="__tut-hl-label"></div></div><div id="__tut-tag"></div><div id="__tut-cap"></div>
      <div id="__tut-cursor"><svg viewBox="0 0 24 24"><path d="M4 2.5v17.2l4.6-4.3 3 6.6 3.1-1.4-3-6.4 6.3-.4z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg></div>`;
    document.documentElement.appendChild(root);
    const pos = window.__tutPos || { x: 960, y: 540 };
    const cur = document.getElementById('__tut-cursor');
    cur.style.transform = `translate(${pos.x}px,${pos.y}px)`;
    if (window.__tutPos) cur.style.opacity = '1';
  };
  window.__tut = {
    boot,
    move(x, y, ms = 600) {
      boot();
      const c = document.getElementById('__tut-cursor');
      if (c.style.opacity !== '1') { c.style.transition = 'none'; c.style.transform = `translate(${x}px,${y + 80}px)`; void c.offsetWidth; c.style.transition = ''; c.style.opacity = '1'; }
      c.style.setProperty('--d', `${ms}ms`);
      c.style.transform = `translate(${x}px,${y}px)`;
      window.__tutPos = { x, y };
      try { sessionStorage.setItem('__tutPos', JSON.stringify({ x, y })); } catch {}
    },
    ripple(x, y) {
      boot();
      const r = document.createElement('div');
      r.className = '__tut-ripple';
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
      document.getElementById('__tut-root').appendChild(r);
      setTimeout(() => r.remove(), 600);
    },
    highlight(rect, label) {
      boot();
      const h = document.getElementById('__tut-hl');
      if (!rect) { h.style.opacity = '0'; return; }
      const pad = 8;
      Object.assign(h.style, { left: `${rect.x - pad}px`, top: `${rect.y - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px`, opacity: '1' });
      const l = document.getElementById('__tut-hl-label');
      l.textContent = label || '';
      l.style.display = label ? 'block' : 'none';
      l.style.top = rect.y < 60 ? `${rect.height + pad * 2 + 8}px` : '-34px';
    },
    caption(text) {
      boot();
      const c = document.getElementById('__tut-cap');
      c.textContent = text || '';
      c.style.opacity = text ? '1' : '0';
    },
    tag(chapter, title) {
      boot();
      const t = document.getElementById('__tut-tag');
      t.innerHTML = chapter ? `<span>${chapter}</span>${title}` : '';
      t.style.opacity = chapter ? '1' : '0';
    },
  };
  try { const p = JSON.parse(sessionStorage.getItem('__tutPos') || 'null'); if (p) window.__tutPos = p; } catch {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
