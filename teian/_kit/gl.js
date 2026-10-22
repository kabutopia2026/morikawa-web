/* 写真をWebGLで描く層。DOMの写真と同じ位置に板を置き、スクロールでしなり、触れると揺れ、墨のようににじんで現れる */
import * as THREE from 'three';

const qa = /[?&]qa/.test(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const imgs = [...document.querySelectorAll('img[data-gl]')];

const VERT = `
  uniform float uVel;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec3 p = position;
    p.y += sin(uv.x * 3.14159) * uVel * .045;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const FRAG = `
  uniform sampler2D uTex;
  uniform vec4 uWrap; uniform vec4 uImg; uniform vec2 uNat; uniform vec2 uPos;
  uniform float uTime, uVel, uHover, uReveal, uFx, uDark;
  uniform vec2 uMouse, uPar;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0.0, a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= .5; } return v; }
  void main(){
    // 外枠の座標から写真本体の座標へ（DOM側の拡大や視差をそのまま反映）
    vec2 px = vec2(uWrap.x + vUv.x * uWrap.z, uWrap.y + (1.0 - vUv.y) * uWrap.w);
    vec2 iu = (px - uImg.xy) / uImg.zw;
    iu.y = 1.0 - iu.y;
    // object-fit: cover
    float pr = uImg.z / uImg.w, ir = uNat.x / uNat.y;
    vec2 sc = pr > ir ? vec2(1.0, ir / pr) : vec2(pr / ir, 1.0);
    vec2 uv = iu * sc + (1.0 - sc) * uPos;
    float zoom = 1.0 - .05 * uHover - .1 * (1.0 - uReveal);
    uv = (uv - .5) * zoom + .5 + uPar;
    float d = distance(vUv, uMouse);
    uv += (vUv - uMouse) * sin(d * 34.0 - uTime * 5.0) * .012 * uHover * smoothstep(.5, 0.0, d);
    if (uFx > 2.5) uv += (vec2(fbm(uv * 3.0 + uTime * .05), fbm(uv * 3.0 - uTime * .04)) - .5) * .012;
    float s = uVel * .012 + uHover * .0025;
    vec3 c = vec3(texture2D(uTex, uv + vec2(s, 0)).r, texture2D(uTex, uv).g, texture2D(uTex, uv - vec2(s, 0)).b);
    if (uFx > 2.5) c += vec3(1.0, .82, .6) * pow(fbm(uv * 2.4 + vec2(0, -uTime * .08)), 3.0) * .35;
    c *= 1.0 - uDark;
    // にじむように現れる
    float n = fbm(vUv * 5.0 + 3.0);
    float v = uFx > 1.5 && uFx < 2.5 ? distance(vUv, vec2(.5)) * 1.15 + n * .45 : (1.0 - vUv.y) * .8 + n * .3;
    float a = 1.0 - smoothstep(uReveal * 1.35 - .14, uReveal * 1.35, v);
    gl_FragColor = vec4(c, a);
  }`;

if (imgs.length && !reduce) {
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) {}
  if (renderer && renderer.getContext()) start(renderer);
}

function start(renderer) {
  const canvas = renderer.domElement;
  canvas.className = 'gl-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  const geo = new THREE.PlaneGeometry(1, 1, 24, 24);
  const loader = new THREE.TextureLoader();
  const FX = { wipe: 1, ink: 2, steam: 3 };

  function size() {
    renderer.setSize(innerWidth, innerHeight);
    camera.left = 0; camera.right = innerWidth; camera.top = 0; camera.bottom = -innerHeight;
    camera.updateProjectionMatrix();
  }
  size(); addEventListener('resize', size);

  const items = imgs.map(img => {
    const wrap = img.closest('[data-gl-wrap]') || img.parentElement;
    const pos = (getComputedStyle(img).objectPosition || '50% 50%').split(' ').map(v => parseFloat(v) / 100);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true,
      uniforms: {
        uTex: { value: null }, uWrap: { value: new THREE.Vector4() }, uImg: { value: new THREE.Vector4() },
        uNat: { value: new THREE.Vector2(1, 1) }, uPos: { value: new THREE.Vector2(pos[0] || .5, 1 - (pos[1] || .5)) },
        uTime: { value: 0 }, uVel: { value: 0 }, uHover: { value: 0 }, uReveal: { value: qa ? 1 : 0 },
        uFx: { value: FX[img.dataset.gl] || 1 }, uDark: { value: +(img.dataset.glDark || 0) },
        uMouse: { value: new THREE.Vector2(.5, .5) }, uPar: { value: new THREE.Vector2() },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    const it = { img, wrap, mesh, mat, reveal: qa ? 1 : 0, target: qa ? 1 : 0, hover: 0, hoverT: 0, hero: img.hasAttribute('data-gl-hero'), ready: false };
    loader.load(img.getAttribute('src'), tex => {
      mat.uniforms.uTex.value = tex;
      mat.uniforms.uNat.value.set(tex.image.width, tex.image.height);
      it.ready = true;
      img.classList.add('gl-hidden');
    });
    return it;
  });

  // 画面に入ったら現れる。最初の写真は読み込み画面が終わってから
  const io = new IntersectionObserver(es => es.forEach(e => {
    const it = items.find(x => x.wrap === e.target || x.img === e.target);
    if (it && e.isIntersecting && !it.hero) it.target = 1;
  }), { threshold: .15 });
  items.forEach(it => io.observe(it.wrap));
  const showHero = () => items.forEach(it => { if (it.hero) it.target = 1; });
  if (document.documentElement.classList.contains('ready')) showHero(); else addEventListener('kit:ready', showHero);

  const mouse = { x: -1, y: -1, gx: 0, gy: 0 };
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.gx = e.clientX / innerWidth - .5; mouse.gy = e.clientY / innerHeight - .5; }, { passive: true });

  let lastY = scrollY, vel = 0;
  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    const dy = scrollY - lastY; lastY = scrollY;
    vel += (Math.max(-1, Math.min(1, dy / 60)) - vel) * .12;
    let any = false;
    for (const it of items) {
      if (!it.ready) continue;
      const w = it.wrap.getBoundingClientRect();
      const vis = w.bottom > -50 && w.top < innerHeight + 50 && w.width > 0;
      it.mesh.visible = vis;
      if (!vis) continue;
      any = true;
      const r = it.img.getBoundingClientRect();
      const u = it.mat.uniforms;
      it.mesh.position.set(w.left + w.width / 2, -(w.top + w.height / 2), 0);
      it.mesh.scale.set(w.width, w.height, 1);
      u.uWrap.value.set(w.left, w.top, w.width, w.height);
      u.uImg.value.set(r.left, r.top, r.width, r.height);
      const inside = mouse.x >= w.left && mouse.x <= w.right && mouse.y >= w.top && mouse.y <= w.bottom;
      it.hoverT = inside && !it.hero ? 1 : 0;
      it.hover += (it.hoverT - it.hover) * .08;
      if (inside) u.uMouse.value.set((mouse.x - w.left) / w.width, 1 - (mouse.y - w.top) / w.height);
      it.reveal += (it.target - it.reveal) * (qa ? 1 : .035);
      u.uReveal.value = it.reveal;
      u.uHover.value = it.hover;
      u.uVel.value = vel;
      u.uTime.value = t;
      if (it.hero) u.uPar.value.set(-mouse.gx * .018, mouse.gy * .018);
    }
    canvas.style.visibility = any ? "visible" : "hidden";
    if (any) renderer.render(scene, camera);
  })();
}
