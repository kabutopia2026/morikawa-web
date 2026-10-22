/* 各店の演出に共通の土台：描画の準備、画面サイズ、スクロールの進み具合、マウス、画面外での停止 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const qa = /[?&]qa/.test(location.search);
export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const c01 = x => Math.max(0, Math.min(1, x));
export const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const span = (p, a, b) => c01((p - a) / (b - a));

// セクションの中をどこまでスクロールしたか（0〜1）。確認用に ?qa&p=0.5 で固定できる
export function progress(section) {
  if (qa) return +(new URLSearchParams(location.search).get('p') || 0);
  const r = section.getBoundingClientRect();
  return c01(-r.top / Math.max(1, r.height - innerHeight));
}

export const mouse = { x: 0, y: 0, px: -1, py: -1, down: false, moved: 0 };
addEventListener('pointermove', e => {
  mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5;
  mouse.px = e.clientX; mouse.py = e.clientY; mouse.moved = performance.now();
}, { passive: true });
addEventListener('pointerdown', () => { mouse.down = true; });
addEventListener('pointerup', () => { mouse.down = false; });

function watch(section) {
  const s = { visible: true };
  new IntersectionObserver(e => { s.visible = e[0].isIntersecting; }).observe(section);
  return s;
}

/** three.js の舞台。frame({t, dt, p, portrait}) を毎フレーム呼ぶ */
export function stage3d({ canvas, section, fov = 32, env = .03, exposure = 1, smooth = .08, frame }) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  const scene = new THREE.Scene();
  if (env) scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), env).texture;
  const camera = new THREE.PerspectiveCamera(fov, 1, .05, 200);
  const st = { renderer, scene, camera, THREE, portrait: false };
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); st.portrait = camera.aspect < .9;
  };
  resize(); addEventListener('resize', resize);
  const vis = watch(section), clock = new THREE.Clock();
  let cur = qa ? progress(section) : 0;
  st.start = () => {
    requestAnimationFrame(function loop() {
      requestAnimationFrame(loop);
      if (!vis.visible && !qa) return;
      const dt = Math.min(clock.getDelta(), .05), t = reduce ? 0 : clock.elapsedTime;
      const p = progress(section);
      cur += (p - cur) * (reduce || qa ? 1 : smooth);
      frame({ t, dt, p: cur, portrait: st.portrait });
      renderer.render(scene, camera);
    });
  };
  return st;
}

/** 2Dキャンバスの舞台。draw(g, w, h, {t, dt, p}) を毎フレーム呼ぶ */
export function stage2d({ canvas, section, smooth = .08, draw }) {
  const g = canvas.getContext('2d');
  const st = { g, w: 0, h: 0, dpr: 1 };
  const resize = () => {
    st.dpr = Math.min(devicePixelRatio, 2); st.w = canvas.clientWidth; st.h = canvas.clientHeight;
    canvas.width = st.w * st.dpr; canvas.height = st.h * st.dpr;
  };
  resize(); addEventListener('resize', resize);
  const vis = watch(section);
  let cur = qa ? progress(section) : 0, last = performance.now(), t0 = last;
  requestAnimationFrame(function loop(now) {
    requestAnimationFrame(loop);
    if (!vis.visible && !qa) return;
    now = now || performance.now();
    const dt = Math.min((now - last) / 1000, .05); last = now;
    const p = progress(section);
    cur += (p - cur) * (reduce || qa ? 1 : smooth);
    g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    draw(g, st.w, st.h, { t: reduce ? 0 : (now - t0) / 1000, dt, p: cur });
  });
  return st;
}

/** 最初の画面の見出しを、スクロールに合わせて消し、説明を出す */
export function heroFade(p, a = .12) {
  const k = 1 - c01(p / a);
  const hero = document.getElementById('hs-copy');
  if (hero) hero.style.opacity = k;
  return k;
}

export function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// 木目
export function woodTexture(base = '#b88a5a', dark = 'rgba(70,40,20,', w = 1024, h = 512) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = dark + (.05 + Math.random() * .16) + ')'; g.lineWidth = 1 + Math.random() * 2.5;
      const y = Math.random() * h; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 24) g.lineTo(x, y + Math.sin(x / 90 + i) * 6 + Math.sin(x / 23 + i * 3) * 1.5);
      g.stroke();
    }
  });
}
