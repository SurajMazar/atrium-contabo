/*
 * The hero's WebGL atmosphere (AtmosphereLayer / HeroAtmosphere / GardenLight / GoldMotes),
 * ported from React Three Fiber to plain three.js.
 *
 * Same gate as the original (lib/three.ts detectDeviceProfile): only desktops with a fine
 * pointer, ≥1024px wide, WebGL available and motion allowed; "reduced" tier on ≤4 cores or
 * ≤4 GB. three.js is fetched from the CDN only once a device passes the gate.
 */
(function () {
  'use strict';
  if (window.__lgAtmosphere) return;
  var CFG = __CONFIG__;
  var THREE_URL = CFG.threeSrc;
  var state = null;

  function profile() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    try {
      var c = document.createElement('canvas');
      if (!(c.getContext('webgl2') || c.getContext('webgl'))) return null;
    } catch (e) { return null; }
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.innerWidth < 1024) return null;
    var cores = navigator.hardwareConcurrency || 4;
    var mem = navigator.deviceMemory;
    var low = cores <= 4 || (mem !== undefined && mem <= 4);
    return low ? { dpr: 1.5, count: 90, intensity: 0.14 } : { dpr: 2, count: 340, intensity: 0.22 };
  }

  var LIGHT_V = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
  var LIGHT_F = [
    'precision mediump float;uniform float uTime;uniform vec2 uPointer;uniform vec3 uWarm;uniform float uIntensity;uniform float uAspect;varying vec2 vUv;',
    'void main(){vec2 uv=vUv;float t=uTime*0.09;',
    'float bands=sin(uv.x*2.6+t)*cos(uv.y*1.9-t*0.8);bands+=sin(uv.y*4.1+t*1.3)*0.5;bands=bands*0.25+0.35;',
    'vec2 toPointer=uv-(uPointer*0.5+0.5);toPointer.x*=uAspect;float bloom=1.0-smoothstep(0.0,0.55,length(toPointer));bloom=pow(bloom,2.2)*0.5;',
    'float edge=smoothstep(0.0,0.28,uv.y)*smoothstep(1.0,0.72,uv.y);float amount=(bands+bloom)*edge*uIntensity;gl_FragColor=vec4(uWarm*amount,amount);}',
  ].join('');
  var MOTE_V = [
    'uniform float uTime;uniform vec2 uPointer;uniform float uPixelRatio;attribute float aScale;attribute float aSpeed;attribute float aPhase;varying float vAlpha;',
    'void main(){vec3 pos=position;float rise=mod(pos.y+uTime*aSpeed*0.06,2.0)-1.0;pos.y=rise;',
    'pos.x+=sin(uTime*0.25*aSpeed+aPhase)*0.06;pos.z+=cos(uTime*0.2*aSpeed+aPhase)*0.04;',
    'float depth=(pos.z+1.0)*0.5;pos.x+=uPointer.x*0.16*depth;pos.y+=uPointer.y*0.10*depth;',
    'vec4 mvPosition=modelViewMatrix*vec4(pos,1.0);gl_Position=projectionMatrix*mvPosition;gl_PointSize=aScale*uPixelRatio*(36.0/-mvPosition.z);',
    'float edge=1.0-abs(rise);float twinkle=0.55+0.45*sin(uTime*0.8*aSpeed+aPhase);vAlpha=smoothstep(0.0,0.35,edge)*twinkle;}',
  ].join('');
  var MOTE_F = 'uniform vec3 uColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-vec2(0.5));float mask=smoothstep(0.5,0.05,d);gl_FragColor=vec4(uColor,mask*vAlpha*0.55);}';

  function build(THREE, hero, p) {
    var host = document.createElement('div');
    host.className = 'lg-atmosphere';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;mix-blend-mode:screen';
    var media = hero.querySelector('.a-hero__media');
    hero.insertBefore(host, media ? media.nextSibling : hero.firstChild);

    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.dpr));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    camera.position.set(0, 0, 5);

    var lightU = { uTime: { value: 0 }, uPointer: { value: new THREE.Vector2() }, uWarm: { value: new THREE.Color(CFG.goldLight) }, uIntensity: { value: p.intensity }, uAspect: { value: 1 } };
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), new THREE.ShaderMaterial({ vertexShader: LIGHT_V, fragmentShader: LIGHT_F, uniforms: lightU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    plane.position.z = -1;
    scene.add(plane);

    var n = p.count;
    var pos = new Float32Array(n * 3), sc = new Float32Array(n), sp = new Float32Array(n), ph = new Float32Array(n);
    var seed = 20260823;
    var rnd = function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (var i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 9; pos[i * 3 + 1] = rnd() * 2 - 1; pos[i * 3 + 2] = (rnd() - 0.5) * 2;
      sc[i] = 0.8 + rnd() * 2.2; sp[i] = 0.5 + rnd() * 1.6; ph[i] = rnd() * Math.PI * 2;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(sc, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(sp, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    var moteU = { uTime: { value: 0 }, uPointer: { value: new THREE.Vector2() }, uPixelRatio: { value: renderer.getPixelRatio() }, uColor: { value: new THREE.Color(CFG.gold) } };
    var points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: MOTE_V, fragmentShader: MOTE_F, uniforms: moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    points.frustumCulled = false;
    scene.add(points);

    var size = function () {
      var w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // The plane sits at z=-1, six units from the camera: size it to the frame at that depth (×1.2).
      var vh = 2 * Math.tan((75 * Math.PI) / 360) * 6;
      plane.scale.set(vh * camera.aspect * 1.2, vh * 1.2, 1);
      lightU.uAspect.value = camera.aspect;
    };
    size();

    var pointer = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    var onMove = function (e) { if (e.pointerType !== 'mouse') return; target.x = (e.clientX / window.innerWidth) * 2 - 1; target.y = -((e.clientY / window.innerHeight) * 2 - 1); };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', size, { passive: true });

    var visible = true, raf = 0, start = performance.now();
    var io = new IntersectionObserver(function (en) { visible = !!(en[0] && en[0].isIntersecting); if (visible && !raf) raf = requestAnimationFrame(frame); }, { threshold: 0 });
    io.observe(host);
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      pointer.x += (target.x - pointer.x) * 0.045;
      pointer.y += (target.y - pointer.y) * 0.045;
      var t = (now - start) / 1000;
      lightU.uTime.value = t; moteU.uTime.value = t;
      lightU.uPointer.value.set(pointer.x, pointer.y); moteU.uPointer.value.set(pointer.x, pointer.y);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    var onVis = function () { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame); };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(frame);

    return function dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', size);
      document.removeEventListener('visibilitychange', onVis);
      geo.dispose(); points.material.dispose(); plane.geometry.dispose(); plane.material.dispose();
      renderer.dispose();
      host.remove();
    };
  }

  var threePromise = null;
  window.__lgAtmosphere = {
    mount: function () {
      var hero = document.querySelector('main section[class*="a-n-lg-hero"]');
      if (!hero || state) return;
      var p = profile();
      if (!p) return;
      state = { dispose: null, cancelled: false };
      var mine = state;
      threePromise = threePromise || import(THREE_URL);
      threePromise.then(function (THREE) {
        if (mine.cancelled || !hero.isConnected) return;
        mine.dispose = build(THREE, hero, p);
      }).catch(function (err) { console.warn('[atmosphere] unavailable', err); });
    },
    unmount: function () {
      if (!state) return;
      state.cancelled = true;
      if (state.dispose) state.dispose();
      state = null;
    },
  };
})();
