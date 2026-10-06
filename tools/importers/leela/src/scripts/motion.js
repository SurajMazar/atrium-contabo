/*
 * Leela Garden / Vilasa by Leela — site motion layer for the Atrium build.
 *
 * Ports the behaviour of the original Next.js app that Atrium's built-in animation presets do
 * not cover: Lenis smooth scroll, the header docking off the dark hero, the hero's scroll
 * hand-over, the sticky wedding story crossfade, the gallery filter, the film facade, the brass
 * cursor ring, magnetic buttons, the page-transition veil and ?package= prefill on /contact.
 *
 * Everything is feature-detected, honours prefers-reduced-motion, runs only on the published
 * site (Atrium does not execute site scripts in the editor) and re-initialises after Atrium's
 * client-side navigation (history.pushState / popstate).
 */
(function () {
  'use strict';
  if (window.__lgMotion) return;
  window.__lgMotion = true;

  var CFG = __CONFIG__;
  var doc = document;
  var root = doc.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var cleanups = [];
  var lenis = null;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function on(el, type, fn, opts) { el.addEventListener(type, fn, opts); cleanups.push(function () { el.removeEventListener(type, fn, opts); }); }
  function navH() { return parseInt(getComputedStyle(doc.body).getPropertyValue('--lg-nav-h'), 10) || 88; }
  function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }

  /* ── Lenis smooth scroll (useSmoothScroll.ts) ───────────────────────── */
  function startLenis() {
    if (reduced || lenis || !window.Lenis) return;
    lenis = new window.Lenis({ lerp: CFG.lerp, orientation: 'vertical', gestureOrientation: 'vertical', smoothWheel: true, syncTouch: false, touchMultiplier: 1.6, wheelMultiplier: 1, autoRaf: true,
      prevent: function (node) { return !!(node.closest && node.closest('.a-lightbox,[role=dialog],.a-header__drawer')); } });
    // Overlays lock the page: the header drawer sets <html style="overflow:hidden">, the lightbox a dialog.
    new MutationObserver(function () {
      var locked = root.style.overflow === 'hidden' || !!$('.a-lightbox[open], .a-lightbox.is-open');
      if (locked) lenis.stop(); else lenis.start();
    }).observe(root, { attributes: true, attributeFilter: ['style'] });
    // In-page anchors land clear of the fixed header, with the same easing as the page.
    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      var a = e.target.closest && e.target.closest('a[href*="#"]');
      if (!a) return;
      var url = new URL(a.href, location.href);
      if (url.pathname !== location.pathname || !url.hash || url.hash === '#') return;
      var target = doc.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -navH(), duration: CFG.anchorDuration });
      history.replaceState(history.state, '', url.hash);
    });
  }
  function loadLenis() {
    if (reduced) return;
    if (window.Lenis) return startLenis();
    var s = doc.createElement('script');
    s.src = CFG.lenisSrc;
    s.async = true;
    s.onload = startLenis;
    doc.head.appendChild(s);
  }

  /* ── header docking (Header.tsx): transparent while the bar sits over the dark hero ── */
  function initHeader() {
    var header = $('.a-header');
    var hero = $('main section[class*="a-n-lg-hero"], main section[class*="a-n-lg-pagehero"]');
    if (!header) return;
    if (!hero) { header.classList.add('lg-docked'); return; }
    var update = function () { header.classList.toggle('lg-docked', hero.getBoundingClientRect().bottom <= navH()); };
    update();
    on(window, 'scroll', update, { passive: true });
    on(window, 'resize', update, { passive: true });
  }

  /* ── hero scroll hand-over (Hero.tsx / PageHero.tsx) ─────────────────── */
  function initHeroes() {
    if (reduced) return;
    var home = $('main section[class*="a-n-lg-hero"]');
    var page = $('main section[class*="a-n-lg-pagehero"]');
    var tick = function () {
      if (home) {
        var r = home.getBoundingClientRect();
        var p = clamp(-r.top / Math.max(1, r.height), 0, 1);
        home.style.setProperty('--lg-p', p.toFixed(4));
        home.style.setProperty('--lg-p70', clamp(-r.top / Math.max(1, r.height * 0.7), 0, 1).toFixed(4));
      }
      if (page) {
        var rp = page.getBoundingClientRect();
        page.style.setProperty('--lg-p', clamp(-rp.top / Math.max(1, rp.height), 0, 1).toFixed(4));
      }
    };
    var raf = 0;
    var schedule = function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; tick(); }); };
    tick();
    on(window, 'scroll', schedule, { passive: true });
    on(window, 'resize', schedule, { passive: true });
  }

  /* ── wedding story (ScrollStory.tsx): the stage owning the viewport centre owns the photograph ── */
  function initStories() {
    $$('main [class*="a-n-lg-story-"]').forEach(function (story) {
      if (!/a-n-lg-story-\d+(\s|$)/.test(story.className)) return;
      var images = $$('[class*="-img-"]', story).filter(function (el) { return /a-n-lg-story-\d+-img-\d+/.test(el.className); });
      var stages = $$('[class*="-stage-"]', story).filter(function (el) { return /a-n-lg-story-\d+-stage-\d+/.test(el.className); });
      if (!images.length || images.length !== stages.length) return;
      // Every photograph is needed as soon as its stage arrives: start them all loading now.
      images.forEach(function (fig) { $$('img', fig).forEach(function (img) { img.loading = 'eager'; }); });
      var active = -1;
      var activate = function (index) {
        if (index === active) return;
        active = index;
        images.forEach(function (img, i) { img.style.opacity = i === index ? '1' : '0'; img.style.scale = i === index ? '1' : '1.04'; });
      };
      // Whichever stage owns the middle of the viewport owns the photograph; above the story the
      // first one shows, below it the last (ScrollTrigger's onEnter / onEnterBack in the original).
      var update = function () {
        var mid = window.innerHeight / 2;
        var index = -1;
        for (var i = 0; i < stages.length; i++) {
          var r = stages[i].getBoundingClientRect();
          if (r.top <= mid && r.bottom > mid) { index = i; break; }
        }
        if (index < 0) index = stages[0].getBoundingClientRect().top > mid ? 0 : stages.length - 1;
        activate(index);
      };
      var raf = 0;
      var schedule = function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; update(); }); };
      update();
      on(window, 'scroll', schedule, { passive: true });
      on(window, 'resize', schedule, { passive: true });
    });
  }

  /* ── gallery filter (GalleryGrid.tsx) ────────────────────────────────── */
  function initGallery() {
    var grid = $('main .a-gallery__masonry');
    if (!grid || grid.previousElementSibling && grid.previousElementSibling.classList.contains('lg-filters')) return;
    var items = $$('.a-gallery__item', grid);
    if (!items.length) return;
    var count = $('main [class*="a-n-lg-gallery-count"]');
    // data-category comes from each image's `category` (Atrium gallery items); older renderers
    // drop that field, so fall back to the source site's caption → category table.
    items.forEach(function (it) {
      if (it.getAttribute('data-category')) return;
      var cap = it.querySelector('.a-caption');
      var c = cap && CFG.captionCategories[cap.textContent.trim()];
      if (c) it.setAttribute('data-category', c);
    });
    var cats = [];
    items.forEach(function (it) { var c = it.getAttribute('data-category'); if (c && cats.indexOf(c) < 0) cats.push(c); });
    if (!cats.length) return;
    cats.sort(function (a, b) {
      var ia = CFG.categories.indexOf(a), ib = CFG.categories.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var bar = doc.createElement('div');
    bar.className = 'lg-filters';
    var h = doc.createElement('h2');
    h.className = 'a-sr';
    h.textContent = 'Filter gallery by category';
    var ul = doc.createElement('ul');
    bar.appendChild(h);
    bar.appendChild(ul);
    var buttons = [];
    var select = function (cat) {
      var shown = 0;
      items.forEach(function (it, i) {
        var hit = cat === 'All' || it.getAttribute('data-category') === cat;
        it.classList.toggle('lg-filtered-out', !hit);
        if (hit) {
          shown++;
          if (!reduced && it.animate) it.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: Math.min(shown, 20) * 50, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'backwards' });
        }
      });
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cat === cat)); });
      if (count) count.textContent = 'Showing ' + shown + ' of ' + items.length + ' photographs';
    };
    ['All'].concat(cats).forEach(function (cat) {
      var li = doc.createElement('li');
      var b = doc.createElement('button');
      b.type = 'button';
      b.dataset.cat = cat;
      b.setAttribute('aria-pressed', String(cat === 'All'));
      var n = cat === 'All' ? items.length : items.filter(function (it) { return it.getAttribute('data-category') === cat; }).length;
      b.innerHTML = '<span></span><span class="lg-filters__n"></span>';
      b.firstChild.textContent = cat;
      b.lastChild.textContent = String(n);
      b.addEventListener('click', function () { select(cat); });
      buttons.push(b);
      li.appendChild(b);
      ul.appendChild(li);
    });
    grid.parentNode.insertBefore(bar, grid);
  }

  /* ── films (VideoGallery.tsx): poster + play button until pressed ────── */
  function initFilms() {
    $$('main [class*="a-n-lg-film"] video').forEach(function (video) {
      var frame = video.parentElement;
      if (!frame || frame.querySelector('.lg-video-facade')) return;
      video.controls = false;
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'lg-video-facade';
      btn.innerHTML = '<img alt="" decoding="async"><span class="lg-video-play" aria-hidden="true"></span><span class="a-sr"></span>';
      if (video.poster) btn.firstChild.src = video.poster; else btn.firstChild.remove();
      btn.lastChild.textContent = 'Play “' + (video.getAttribute('aria-label') || 'film') + '”';
      btn.addEventListener('click', function () {
        btn.remove();
        video.controls = true;
        video.preload = 'auto';
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      });
      frame.appendChild(btn);
    });
  }

  /* ── the pointer ring (Cursor.tsx) ───────────────────────────────────── */
  var cursor = null;
  function initCursor() {
    if (cursor || reduced || !finePointer || window.innerWidth < 1024) return;
    cursor = doc.createElement('div');
    cursor.className = 'lg-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = '<span>View</span>';
    doc.body.appendChild(cursor);
    if (CFG.hideNativeCursor) doc.body.dataset.customCursor = 'active';
    var label = cursor.firstChild;
    var mode = '';
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      cursor.classList.add('is-visible');
      cursor.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) translate(-50%,-50%)';
      var t = e.target;
      var next = 'default';
      var text = 'View';
      if (t && t.closest) {
        if (t.closest('.a-gallery__open')) { next = 'view'; }
        else if (t.closest('[class*="a-n-lg-cardlink"]')) { next = 'view'; text = 'Explore'; }
        else if (t.closest('main .a-image__link')) { next = 'view'; text = 'Gallery'; }
        else if (t.closest('a, button, [role="button"], label')) { next = 'link'; }
      }
      if (next !== mode) {
        mode = next;
        cursor.classList.toggle('is-link', mode === 'link');
        cursor.classList.toggle('is-view', mode === 'view');
      }
      if (mode === 'view' && label.textContent !== text) label.textContent = text;
    }, { passive: true });
    doc.addEventListener('pointerleave', function () { cursor.classList.remove('is-visible'); });
    window.addEventListener('blur', function () { cursor.classList.remove('is-visible'); });
  }

  /* ── magnetic buttons (MagneticButton.tsx) ───────────────────────────── */
  function initMagnetic() {
    if (reduced || !finePointer) return;
    $$('main .a-hero__actions .a-btn:first-child, main [class*="a-n-lg-magnetic"]').forEach(function (el) {
      var x = 0, y = 0, tx = 0, ty = 0, raf = 0;
      var loop = function () {
        x += (tx - x) * 0.12;
        y += (ty - y) * 0.12;
        el.style.translate = x.toFixed(2) + 'px ' + y.toFixed(2) + 'px';
        raf = Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05 ? requestAnimationFrame(loop) : 0;
      };
      var kick = function () { if (!raf) raf = requestAnimationFrame(loop); };
      on(el, 'pointermove', function (e) {
        var b = el.getBoundingClientRect();
        tx = clamp((e.clientX - (b.left + b.width / 2)) / (b.width / 2), -1, 1) * 10;
        ty = clamp((e.clientY - (b.top + b.height / 2)) / (b.height / 2), -1, 1) * 6;
        kick();
      });
      on(el, 'pointerleave', function () { tx = 0; ty = 0; kick(); });
    });
  }

  /* ── /contact?package=… and ?type=… (contact/page.tsx) ───────────────── */
  function initContact() {
    var form = $('main [class*="a-n-lg-inquiry"]');
    if (!form) return;
    var params = new URLSearchParams(location.search);
    var tries = 0;
    var apply = function () {
      var pack = params.get('package');
      var type = params.get('type');
      var match = null;
      if (pack) {
        var choice = CFG.packages.filter(function (p) { return p.slug === pack; })[0];
        if (choice) {
          var input = form.querySelector('input[name="package"][value="' + choice.name + '"]');
          if (!input) { if (tries++ < 40) return setTimeout(apply, 100); return; }
          if (!input.checked) input.click();
          match = choice;
        }
      }
      if (type) {
        var t = form.querySelector('input[name="eventType"]');
        $$('input[name="eventType"]', form).forEach(function (r) { if (r.value.toLowerCase() === type.toLowerCase() && !r.checked) r.click(); });
        void t;
      }
      var lead = $('main [class*="a-n-lg-contact-direct"]');
      if (match && lead && !$('.lg-package-note')) {
        var note = doc.createElement('p');
        note.className = 'lg-package-note';
        note.innerHTML = 'You are enquiring about the <strong></strong> menu. Mention any changes you would like in the message.';
        note.querySelector('strong').textContent = match.name;
        lead.parentNode.insertBefore(note, lead);
      }
    };
    if (params.get('package') || params.get('type')) apply();
  }

  /* ── mobile app bar: current page (BottomNav.tsx) ────────────────────── */
  function initAppBar() {
    $$('[class*="a-n-lg-bottom-nav"] a').forEach(function (a) {
      var here = new URL(a.href, location.href).pathname === location.pathname;
      if (here) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ── page transition veil (PageTransition.tsx) ───────────────────────── */
  var veil = null;
  function transition() {
    if (reduced) return;
    if (!veil) {
      veil = doc.createElement('div');
      veil.className = 'lg-veil';
      veil.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(veil);
    }
    veil.classList.add('is-on');
    requestAnimationFrame(function () { requestAnimationFrame(function () { veil.classList.remove('is-on'); }); });
    var main = $('main');
    if (main && main.animate) main.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(0.4,0,0.2,1)' });
  }

  /* ── lifecycle ───────────────────────────────────────────────────────── */
  function init() {
    initHeader();
    initHeroes();
    initStories();
    initGallery();
    initFilms();
    initMagnetic();
    initContact();
    initAppBar();
    if (window.__lgAtmosphere) window.__lgAtmosphere.mount();
  }
  function teardown() {
    while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ignore */ } }
    if (window.__lgAtmosphere) window.__lgAtmosphere.unmount();
  }

  // The new page must be caught before the browser paints it: re-running the veil a frame late
  // shows the page, blanks it and fades it in again (a visible "double refresh"). Mutation
  // observers and microtasks both run in the same task as React's commit, so whichever sees the
  // new route first takes over before paint.
  var lastPath = location.pathname;
  var marker = null;
  var fallback = 0;
  function markPage() { var m = $('main'); marker = m && m.firstElementChild; }
  function swapped() { var m = $('main'); var f = m && m.firstElementChild; return !!f && f !== marker; }
  function onRoute(force) {
    if (location.pathname === lastPath) return;
    if (!force && !swapped()) {
      // URL first, DOM later: the observer picks it up; never wait forever.
      clearTimeout(fallback);
      fallback = setTimeout(function () { onRoute(true); }, 2000);
      return;
    }
    clearTimeout(fallback);
    lastPath = location.pathname;
    teardown();
    if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0);
    transition();
    init();
    markPage();
  }
  ['pushState', 'replaceState'].forEach(function (k) {
    var orig = history[k];
    history[k] = function () {
      var r = orig.apply(this, arguments);
      queueMicrotask(function () { onRoute(false); });
      return r;
    };
  });
  window.addEventListener('popstate', function () { onRoute(false); });
  // Any change inside <main> once the URL has moved is the new page landing (React may keep the
  // first section's node when both pages start with the same kind of section).
  new MutationObserver(function (records) {
    if (location.pathname === lastPath) return;
    var main = $('main');
    onRoute(records.some(function (r) { return main && (main === r.target || main.contains(r.target)) || r.addedNodes.length && Array.prototype.indexOf.call(r.addedNodes, main) >= 0; }));
  }).observe(doc.body, { childList: true, subtree: true });

  function boot() {
    loadLenis();
    initCursor();
    init();
    markPage();
  }
  // Atrium pages are server-rendered React that hydrates after this script runs. Mutating the
  // DOM before hydration makes React discard it, so wait until the tree is live.
  function hydrated() {
    var el = $('main') || doc.body;
    for (var k in el) if (k.indexOf('__reactFiber') === 0 || k.indexOf('__reactContainer') === 0) return true;
    return false;
  }
  var waited = 0;
  (function waitForHydration() {
    if (hydrated() || waited > 8000) return requestAnimationFrame(function () { requestAnimationFrame(boot); });
    waited += 50;
    setTimeout(waitForHydration, 50);
  })();
})();
