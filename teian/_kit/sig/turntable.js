/* 器や道具を3Dで回して見る台。ドラッグで回り、スクロールやボタンで品物が切り替わる */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 断面（半径, 高さ）。外側を底から口へ、内側を口から底へ
export const PROFILES = {
  chawan: [[0, 0], [.5, 0], [.56, .06], [.52, .13], [.64, .15], [.98, .46], [1.14, .9], [1.2, 1.24], [1.17, 1.3], [1.1, 1.26], [1.04, .92], [.86, .5], [.44, .26], [0, .23]],
  plate: [[0, 0], [.7, 0], [.74, .05], [.8, .08], [1.5, .2], [1.62, .3], [1.6, .34], [1.48, .26], [.82, .14], [0, .12]],
  guinomi: [[0, 0], [.42, 0], [.46, .06], [.44, .1], [.62, .2], [.72, .6], [.74, .86], [.7, .88], [.66, .62], [.56, .26], [0, .2]],
  tokkuri: [[0, 0], [.6, 0], [.66, .06], [.62, .1], [.78, .5], [.8, .9], [.66, 1.3], [.34, 1.62], [.26, 1.86], [.3, 2.02], [.36, 2.08], [.3, 2.1], [.22, 2.04], [.2, 1.86], [0, 1.86]],
  tumbler: [[0, 0], [.62, 0], [.66, .04], [.72, 1.5], [.68, 1.52], [.62, .12], [0, .1]],
  wine: [[0, 0], [.62, 0], [.64, .03], [.1, .06], [.07, .2], [.06, .9], [.12, 1.02], [.5, 1.3], [.62, 1.7], [.56, 2.25], [.53, 2.26], [.58, 1.72], [.46, 1.33], [.1, 1.08], [0, 1.06]],
  pot: [[0, 0], [1.05, 0], [1.12, .06], [1.14, 1.0], [1.2, 1.04], [1.18, 1.08], [1.08, 1.04], [1.06, .1], [0, .08]],
  donabe: [[0, 0], [.7, 0], [.76, .05], [.74, .1], [1.2, .3], [1.36, .7], [1.32, .9], [1.24, .94], [1.22, .74], [1.08, .38], [.6, .16], [0, .14]],
  lantern: [[0, 0], [.35, 0], [.36, .08], [.82, .3], [1.02, .9], [.82, 1.5], [.36, 1.72], [.35, 1.8], [0, 1.8]],
};

const tex = (draw, w = 1024, h = 512, color = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (color) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t;
};
// 槌目（ハンマーで叩いた跡）の凹凸
const hammered = () => tex((g, w, h) => {
  g.fillStyle = '#8080ff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 5 + Math.random() * 7, gr = g.createRadialGradient(x - r * .3, y - r * .3, 1, x, y, r);
    gr.addColorStop(0, 'rgba(160,160,255,.9)'); gr.addColorStop(1, 'rgba(100,100,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
}, 1024, 512, false);

function material(m) {
  const base = { side: THREE.DoubleSide, envMapIntensity: m.env ?? 1 };
  if (m.kind === 'glass') return new THREE.MeshPhysicalMaterial({ ...base, color: m.tint || '#dfe8ea', metalness: 0, roughness: m.roughness ?? .02, transparent: true, opacity: .32, depthWrite: false, clearcoat: 1, envMapIntensity: 2.4, specularIntensity: 1 });
  if (m.kind === 'metal') { const mt = new THREE.MeshPhysicalMaterial({ ...base, color: m.color || '#d08850', metalness: 1, roughness: m.roughness ?? .34, clearcoat: .2, envMapIntensity: 1.6 }); if (m.hammer) { mt.normalMap = hammered(); mt.normalScale.set(.22, .22); mt.normalMap.repeat.set(3, 1); mt.normalMap.wrapT = THREE.RepeatWrapping; } return mt; }
  const mt = new THREE.MeshPhysicalMaterial({ ...base, color: m.color || '#ffffff', roughness: m.roughness ?? .2, clearcoat: m.clearcoat ?? .8, clearcoatRoughness: .1, metalness: 0 });
  if (m.paint) mt.map = tex(m.paint);
  return mt;
}

/**
 * opts: canvas, section, items: [{ profile: 'chawan' | [[r,y],...], mat: {kind, color, paint(g,w,h), ...}, scale }],
 *       place(portrait, heroK) → {x, y, lookX, lookY, s}, onItem(i), onProgress(p)
 */
export function turntable(opts) {
  const { canvas, section } = opts;
  const qa = /[?&]qa/.test(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .03).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);

  const stage = new THREE.Group(); scene.add(stage);
  const meshes = opts.items.map(it => {
    const prof = typeof it.profile === 'string' ? PROFILES[it.profile] : it.profile;
    const top = Math.max(...prof.map(p => p[1]));
    // 断面をなめらかにつなぐ
    const pts = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(160).map(v => new THREE.Vector2(Math.max(0, v.x), v.y));
    const geo = new THREE.LatheGeometry(pts, 160);
    geo.translate(0, -top / 2, 0);
    const m = new THREE.Mesh(geo, material(it.mat));
    m.userData.top = top; m.userData.s = it.scale || 1;
    m.visible = false; stage.add(m);
    return m;
  });
  const shadowTex = tex((g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 8, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(10,15,25,.45)'); r.addColorStop(1, 'rgba(10,15,25,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, 256, 256);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: opts.shadow ?? 1 }));
  shadow.rotation.x = -Math.PI / 2; stage.add(shadow);
  const key = new THREE.DirectionalLight('#ffffff', 1.4); key.position.set(3, 5, 4); scene.add(key);

  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); addEventListener('resize', resize);

  let cur = 0, item = -1, pop = 1, manual = 0, rotY = 0, vel = .004, drag = null;
  function show(i) {
    if (i === item) return;
    item = i; meshes.forEach((m, k) => { m.visible = k === i; }); pop = .88;
    if (opts.onItem) opts.onItem(i);
  }
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; drag.x = e.clientX; vel = dx * .004; rotY += dx * .008; });
  const end = () => { drag = null; }; canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  let visible = true;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(section);
  const api = {
    select(i) { manual = performance.now(); show(i); },
    scrollTo(i) {
      const r = section.getBoundingClientRect(), span = r.height - innerHeight, a = opts.start ?? .15;
      scrollTo({ top: scrollY + r.top + span * (a + (1 - a) * (i + .5) / meshes.length), behavior: 'smooth' });
    },
  };
  show(0);
  (function loop() {
    requestAnimationFrame(loop);
    if (!visible && !qa) return;
    const r = section.getBoundingClientRect();
    const p = qa ? +(new URLSearchParams(location.search).get('p') || 0) : Math.max(0, Math.min(.999, -r.top / Math.max(1, r.height - innerHeight)));
    cur += (p - cur) * (reduce || qa ? 1 : .1);
    const a = opts.start ?? .15, heroK = 1 - Math.max(0, Math.min(1, cur / a));
    if (performance.now() - manual > 1200) show(Math.min(meshes.length - 1, Math.floor(Math.max(0, cur - a) / (1 - a) * meshes.length)));
    if (!drag) { vel += (.004 - vel) * .02; rotY += reduce ? 0 : vel; }
    pop += (1 - pop) * .12;
    const m = meshes[item], portrait = camera.aspect < .9;
    const pl = opts.place ? opts.place(portrait, heroK) : { x: 0, y: 0, lookX: portrait ? 0 : -1.2, lookY: portrait ? -1.2 : 0, s: 1 };
    m.rotation.set(.12, rotY, 0);
    stage.position.set(pl.x, pl.y, 0);
    stage.scale.setScalar(pop * pl.s * m.userData.s);
    shadow.position.y = -m.userData.top / 2 - .01;
    camera.position.set(0, portrait ? 3 : 2.3, portrait ? 10.5 : 6.6);
    camera.lookAt(pl.lookX, pl.lookY, 0);
    renderer.render(scene, camera);
    if (opts.onProgress) opts.onProgress(cur, heroK);
  })();
  return api;
}
