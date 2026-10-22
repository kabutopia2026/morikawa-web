import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };

/* ================= 読み込み画面（大きな数字が100まで進む） ================= */
const loader = document.getElementById('loader');
const loaderNum = loader.querySelector('.loader-num');
const loaderBar = loader.querySelector('.loader-bar i');
let loadTarget = 0, loadShown = 0;
function setProgress(v) { loadTarget = v; }
(function countUp() {
  loadShown += (loadTarget - loadShown) * .12;
  if (loadTarget - loadShown < .5) loadShown = loadTarget;
  loaderNum.textContent = String(Math.round(loadShown)).padStart(3, '0');
  loaderBar.style.transform = `scaleX(${loadShown / 100})`;
  if (!loader.classList.contains('done')) requestAnimationFrame(countUp);
})();

function lightTitle() {
  document.querySelectorAll('.hero .ch').forEach((ch, i) => {
    if (reduceMotion) { ch.classList.add('on'); return; }
    setTimeout(() => ch.classList.add('on'), 250 + i * 170 + Math.random() * 120);
  });
}

/* ================= メールの件名と本文 ================= */
const mailBtn = document.getElementById('mail-btn');
mailBtn.href = 'mailto:mahmoris98@gmail.com?subject=' + encodeURIComponent('試作の依頼') +
  '&body=' + encodeURIComponent('お店・会社の名前：\n今のホームページのアドレス（なければGoogleマップのリンク）：\nご担当者さまのお名前：\n');

/* ================= カーソル ================= */
if (finePointer) {
  const cursor = document.getElementById('cursor');
  const label = cursor.querySelector('span');
  let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
  addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; });
  document.addEventListener('pointerover', e => {
    const t = e.target.closest('a, button, summary');
    cursor.classList.toggle('big', !!t);
    label.textContent = t && t.dataset.shop ? '入る' : '';
  });
  (function loop() {
    cx += (tx - cx) * .22; cy += (ty - cy) * .22;
    cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(loop);
  })();
}

/* ================= なめらかなスクロール ================= */
let lenis = null;
if (!reduceMotion && window.Lenis) {
  lenis = new window.Lenis({ lerp: .085 });
  (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
}
document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href');
  const el = id.length > 1 && document.querySelector(id);
  if (!el || !lenis) return;
  e.preventDefault();
  const dist = Math.abs(el.getBoundingClientRect().top);
  lenis.scrollTo(el, { duration: Math.min(3.2, 1 + dist / 4000) });
}));

/* ================= 雨音（Web Audioで合成） ================= */
const soundBtn = document.getElementById('sound');
let audio = null;
function makeRain() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
  const gain = ctx.createGain(); gain.gain.value = 0;
  src.connect(hp).connect(lp).connect(gain).connect(ctx.destination);
  src.start();
  const a = { ctx, gain, on: false };
  (function drip() {
    if (a.on) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.frequency.setValueAtTime(1600 + Math.random() * 2000, t);
      o.frequency.exponentialRampToValueAtTime(380, t + .07);
      g.gain.setValueAtTime(.012 + Math.random() * .02, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + .09);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + .1);
    }
    setTimeout(drip, 70 + Math.random() * 420);
  })();
  return a;
}
soundBtn.addEventListener('click', () => {
  if (!audio) audio = makeRain();
  audio.on = !audio.on;
  const t = audio.ctx.currentTime;
  if (audio.on) audio.ctx.resume();
  audio.gain.gain.cancelScheduledValues(t);
  audio.gain.gain.setValueAtTime(audio.gain.gain.value, t);
  audio.gain.gain.linearRampToValueAtTime(audio.on ? .1 : 0, t + 1);
  soundBtn.setAttribute('aria-pressed', audio.on);
  soundBtn.querySelector('.sound-label').textContent = audio.on ? '雨音 ON' : '雨音 OFF';
});

/* ================= ネオンのように灯る文字 ================= */
const neonIO = new IntersectionObserver(entries => entries.forEach(en => {
  if (en.isIntersecting) { en.target.classList.add('lit'); neonIO.unobserve(en.target); }
}), { threshold: .6 });
document.querySelectorAll('.neon').forEach(el => neonIO.observe(el));

/* ================= スクロールと場面 ================= */
const sections = [...document.querySelectorAll('[data-cam]')];
let anchors = [], panels = [];
let portrait = innerWidth / innerHeight < .85;
let scrollVel = 0, lastY = scrollY;

function measure() {
  const vh = innerHeight;
  anchors = []; panels = [];
  portrait = innerWidth / innerHeight < .85;
  sections.forEach(el => {
    const top = el.getBoundingClientRect().top + scrollY, key = el.dataset.cam;
    if (key === 'end') { anchors.push({ s: top - vh * .3, key }); return; }
    const span = Math.max(1, el.offsetHeight - vh);
    anchors.push({ s: top + span * .2, key }, { s: top + span * .8, key });
    panels.push({ el, panel: el.querySelector('.panel'), hint: el.querySelector('.scroll-hint'), top, span, hero: key === 'hero' });
  });
}

function updatePanels(sy) {
  for (const p of panels) {
    const l = (sy - p.top) / p.span;
    const o = p.hero ? 1 - smooth((l - .5) / .4) : Math.min(smooth((l + .1) / .25), 1 - smooth((l - .8) / .25));
    p.panel.style.opacity = o.toFixed(3);
    p.panel.style.transform = `translate3d(0, ${((1 - o) * 28).toFixed(1)}px, 0)`;
    p.panel.style.pointerEvents = o > .5 ? 'auto' : 'none';
    p.panel.classList.toggle('in', o > .6);
    if (p.hint) p.hint.style.opacity = (1 - smooth(l / .25)).toFixed(3);
  }
}

sections.forEach(el => el.addEventListener('focusin', () => {
  const p = panels.find(q => q.el === el);
  if (p) { const s = p.top + p.span * .5; if (Math.abs(scrollY - s) > p.span * .3) scrollTo({ top: s, behavior: reduceMotion ? 'auto' : 'smooth' }); }
}));

measure();
updatePanels(scrollY);
addEventListener('scroll', () => updatePanels(scrollY), { passive: true });

/* ================= 見本へ入る演出 ================= */
const wipe = document.getElementById('wipe');
const SHOP_COLORS = { miyama: '#17120E', lune: '#1C1726', hinata: '#F5F4EE' };
let world = null;
document.querySelectorAll('a[data-shop]').forEach(a => a.addEventListener('click', e => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  const key = a.dataset.shop, href = a.href;
  if (lenis) lenis.stop();
  wipe.style.background = SHOP_COLORS[key];
  if (world) world.dive(key);
  setTimeout(() => wipe.classList.add('on'), reduceMotion ? 0 : 520);
  setTimeout(() => { location.href = href; }, reduceMotion ? 150 : 1250);
}));
addEventListener('pageshow', () => {
  wipe.classList.remove('on');
  if (lenis) lenis.start();
  if (world) world.undive();
});

/* ================= 3Dの街 ================= */
let seed = 20261022;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rand() * a.length)];
const range = (a, b) => a + rand() * (b - a);

const WORDS = ['珈琲', '喫茶', '居酒屋', '中華そば', '質', '薬', '書店', '理容', '酒', '焼鳥', '餃子', '寿司', '銭湯', '純喫茶', 'カラオケ', 'スナック', 'うどん', 'たばこ', '整体', '学習塾', '花屋', '古着', '洋食', '甘味'];
const FONTS = ['800 {s}px "Shippori Mincho B1"', '900 {s}px "Zen Kaku Gothic New"', '400 {s}px "Dela Gothic One"'];
const STYLES = [
  { bg: '#f3eee2', fg: '#c62a2f', border: '#c62a2f' },
  { bg: '#c62a2f', fg: '#fff4e0', border: '#fff4e0' },
  { bg: '#1c4fa6', fg: '#ffffff', border: '#ffffff' },
  { bg: '#ffd23f', fg: '#1b1b1b', border: '#1b1b1b' },
  { bg: '#0f6b50', fg: '#f6f1e4', border: '#f6f1e4' },
  { bg: '#16121f', fg: '#ff5e9c', border: '#ff5e9c', neon: true },
  { bg: '#16121f', fg: '#5fe3d6', border: '#5fe3d6', neon: true },
  { bg: '#ffffff', fg: '#1b1b1b', border: '#c62a2f' },
];
const SIGN_TEXT = WORDS.join('') + '食堂みやま定食めしひなた工務店リフォーム修繕新築見積無料森川ウェブホームページ制作';

const FX = 5.8;
const SHOPS = [[-1, -26], [1, -51], [-1, -77]];
const nearShop = (side, z, r) => SHOPS.some(([s, sz]) => s === side && Math.abs(sz - z) < r);
const faceY = side => (side < 0 ? Math.PI / 2 : -Math.PI / 2);

const CAM = {
  hero:   { p: [0, 2.3, 12],      l: [0, 3.6, -20],    fog: .034, exp: 1 },
  intro:  { p: [0, 1.8, 2],       l: [0, 2.8, -30],    fog: .032, exp: .95 },
  miyama: { p: [1.7, 1.8, -18.5], l: [-5.8, 2.4, -36], fog: .03, exp: .78, pm: [3, 1.8, -18.5], lm: [-5.8, 1.7, -26.3] },
  lune:   { p: [-1.7, 1.8, -43.5], l: [5.8, 2.4, -61], fog: .03, exp: .82, pm: [-3, 1.8, -43.5], lm: [5.8, 1.7, -51.3] },
  hinata: { p: [1.7, 1.8, -69.5], l: [-5.8, 2.4, -87], fog: .03, exp: .78, pm: [3, 1.8, -69.5], lm: [-5.8, 1.7, -77.3] },
  skills: { p: [0, 5.2, -86],     l: [0, 5, -128],     fog: .02, exp: .95 },
  end:    { p: [0, 17, -56],      l: [0, 3, -124],     fog: .012, exp: 1 },
};
const DOORS = {
  miyama: { p: [-2.6, 1.55, -26], l: [-7, 1.4, -26] },
  lune:   { p: [2.6, 1.55, -51],  l: [7, 1.4, -51] },
  hinata: { p: [-2.6, 1.55, -77], l: [-7, 1.4, -77] },
};

// 濡れた路面（映り込み・小さな波紋・霧）
const WetShader = {
  name: 'WetShader',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uTime: { value: 0 }, uFog: { value: new THREE.Color() }, uFogDensity: { value: .03 }, uBase: { value: new THREE.Color('#0d1024') },
  },
  vertexShader: `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime; uniform vec3 uFog; uniform float uFogDensity; uniform vec3 uBase;
    varying vec4 vUv; varying vec3 vWorld;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
    void main(){
      vec2 p = vWorld.xz;
      float n = noise(p * 1.7) * .55 + noise(p * 5.3) * .3 + noise(p * 17.0) * .15;
      float puddle = smoothstep(.42, .68, noise(p * .28 + vec2(3.1, 7.7)));
      vec4 uv = vUv;
      vec2 ripple = vec2(noise(p * 9.0 + uTime * .9), noise(p * 9.0 - uTime * .9)) - .5;
      uv.xy += ripple * uv.w * mix(.035, .006, puddle);
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 col = uBase * (.55 + n * .6) + refl * mix(.16, .7, puddle);
      float d = length(vWorld - cameraPosition);
      col = mix(col, uFog, 1.0 - exp(-uFogDensity * uFogDensity * d * d));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// 仕上げ（周辺減光・粒子・スクロールの速さに応じた色ずれ）
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVel: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVel; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5;
      vec2 off = c * (.0018 + uVel * .014);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(.5, 1.0, smoothstep(.9, .25, length(c * vec2(1.0, .85))));
      col += (rnd(vUv * 900.0 + fract(uTime * 7.0) * 50.0) - .5) * .05;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

async function initWebGL() {
  const canvas = document.getElementById('webgl');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
  catch (e) { return null; }

  setProgress(22);
  await Promise.race([
    Promise.all(FONTS.map(f => document.fonts.load(f.replace('{s}', 64), SIGN_TEXT))),
    new Promise(r => setTimeout(r, 3500)),
  ]).catch(() => {});
  setProgress(58);

  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.3 : 1.75));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const SKY = new THREE.Color('#141b3d');
  scene.background = SKY;
  scene.fog = new THREE.FogExp2(SKY, CAM.hero.fog);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 320);

  scene.add(new THREE.HemisphereLight('#7f8fd6', '#1a1530', .9));
  const moon = new THREE.DirectionalLight('#8aa0ff', .45);
  moon.position.set(6, 20, 8);
  scene.add(moon);

  /* ---------- テクスチャ ---------- */
  function tex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  }
  const font = (f, s) => f.replace('{s}', Math.round(s));

  function windowsTex() {
    const t = tex(256, 320, (g, w, h) => {
      g.fillStyle = pick(['#151a33', '#1a1e35', '#181c2c', '#1d2240']);
      g.fillRect(0, 0, w, h);
      const lit = range(.28, .6);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const x = c * 32 + 5, y = r * 40 + 7;
        if (rand() < lit) {
          g.fillStyle = pick(['#ffd9a0', '#ffe7c2', '#ffc77a', '#cfe1ff', '#f4f1ff', '#ffd9a0']);
          g.fillRect(x, y, 22, 28);
          if (rand() < .4) { g.fillStyle = 'rgba(20,20,34,.5)'; g.fillRect(x, y, 22, 28 * rand()); }
        } else {
          g.fillStyle = '#0b0f1e';
          g.fillRect(x, y, 22, 28);
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function interiorTex(top, bottom) {
    return tex(256, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, top); gr.addColorStop(1, bottom);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(40,28,20,.5)';
      for (let i = 0; i < 6; i++) g.fillRect(range(10, w - 40), range(h * .42, h * .7), range(12, 40), h);
      g.fillStyle = '#1b1d2a';
      g.fillRect(0, 0, w, 7); g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h);
      for (let x = w / 4; x < w; x += w / 4) g.fillRect(x - 3, 0, 6, h);
      g.fillRect(0, h * .3, w, 4);
    });
  }

  function vSignTex(word, st, f, hpx) {
    return tex(128, hpx, (g, w, h) => {
      g.fillStyle = st.bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = st.border; g.lineWidth = 6; g.strokeRect(9, 9, w - 18, h - 18);
      const chars = [...word], n = chars.length, cs = Math.min(92, (h - 44) / n);
      g.fillStyle = st.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = font(f, cs * .84);
      if (st.neon) { g.shadowColor = st.fg; g.shadowBlur = 16; }
      const y0 = h / 2 - cs * n / 2;
      chars.forEach((ch, i) => g.fillText(ch, w / 2, y0 + cs * (i + .54)));
    });
  }

  function hSignTex(text, st, f, sub) {
    return tex(512, 128, (g, w, h) => {
      g.fillStyle = st.bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = st.border; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = st.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (st.neon) { g.shadowColor = st.fg; g.shadowBlur = 14; }
      let size = sub ? 64 : 76;
      g.font = font(f, size);
      while (g.measureText(text).width > w - 70 && size > 20) { size -= 4; g.font = font(f, size); }
      g.fillText(text, w / 2, sub ? h * .42 : h / 2 + 3);
      if (sub) { g.font = '700 22px "Zen Kaku Gothic New"'; g.fillText(sub, w / 2, h * .8); }
    });
  }

  const poolTex = tex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(.35, 'rgba(255,255,255,.4)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });

  const shutterTex = tex(64, 64, (g) => {
    g.fillStyle = '#30364f'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#252a42';
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
  });
  shutterTex.wrapS = shutterTex.wrapT = THREE.RepeatWrapping;

  const vendTex = tex(128, 232, (g, w, h) => {
    g.fillStyle = '#eef3ff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a6bd8'; g.fillRect(0, 0, w, 34);
    const cols = ['#e8452c', '#2e9b4f', '#f4b63f', '#5a3a22', '#1c4fa6', '#ffffff', '#ff5e9c'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      g.fillStyle = pick(cols);
      g.fillRect(8 + c * 19, 44 + r * 46, 13, 30);
      g.fillStyle = '#c9d2e6'; g.fillRect(8 + c * 19, 78 + r * 46, 13, 4);
    }
    g.fillStyle = '#20263d'; g.fillRect(14, h - 46, w - 28, 30);
  });

  /* ---------- 点灯の仕組み ---------- */
  const lamps = [];
  const lampColor = (mat, scale) => {
    const on = new THREE.Color(1, 1, 1).multiplyScalar(scale), off = new THREE.Color(.09, .09, .11);
    mat.color.copy(off);
    return k => mat.color.copy(off).lerp(on, k);
  };
  const lampOpacity = (mat, max) => { mat.opacity = 0; return k => { mat.opacity = max * k; }; };
  const lampLight = (light, max) => { light.intensity = 0; return k => { light.intensity = max * k; }; };
  const addLamp = (z, entries, reach = 30) => lamps.push({ z, entries, reach, delay: rand() * .5, t0: -1, last: -1 });

  function flicker(t) {
    if (t < 0) return 0;
    if (reduceMotion) return 1;
    const seq = [[0, 0], [.06, 1], [.12, .12], [.2, .9], [.27, .25], [.42, 1]];
    let v = 0;
    for (const [tt, vv] of seq) if (t >= tt) v = vv;
    return v;
  }

  /* ---------- まとめて描く静的なもの ---------- */
  const statics = new Map();
  const addStatic = (mat, geo) => { if (!statics.has(mat)) statics.set(mat, []); statics.get(mat).push(geo); };
  const scaleUV = (geo, su, sv) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); };

  const bodyMat = new THREE.MeshLambertMaterial({ color: '#141a38' });
  const darkMat = new THREE.MeshLambertMaterial({ color: '#0f1328' });
  const poleMat = new THREE.MeshLambertMaterial({ color: '#272d4a' });
  const vendBodyMat = new THREE.MeshLambertMaterial({ color: '#b9c1d6' });
  const shutterMat = new THREE.MeshLambertMaterial({ map: shutterTex });
  const winMats = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({ map: windowsTex(), color: new THREE.Color(.48, .48, .5) }));
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 2) });
  const INTERIORS = [interiorTex('#ffe2b0', '#ff9f4a'), interiorTex('#f4f7ff', '#b9c8ff'), interiorTex('#fff2d6', '#ffc46b')];

  function plane(mat, w, h, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    scene.add(m);
    return m;
  }
  function pool(x, z, size, color) {
    const m = new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, .16, z);
    scene.add(mesh);
    return m;
  }

  /* ---------- 地面と濡れた路面 ---------- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 320), new THREE.MeshStandardMaterial({ color: '#1b2142', roughness: .55, metalness: .15 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -120;
  scene.add(ground);

  let road = null;
  if (!coarse) {
    const pr = renderer.getPixelRatio();
    road = new Reflector(new THREE.PlaneGeometry(7.8, 150), {
      textureWidth: Math.round(innerWidth * pr * .5), textureHeight: Math.round(innerHeight * pr * .5),
      clipBias: .003, shader: WetShader,
    });
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, .01, -60);
    road.material.uniforms.uFog.value.copy(SKY);
    scene.add(road);
  }

  const walkMat = new THREE.MeshStandardMaterial({ color: '#252b4d', roughness: .8 });
  const lineMat = new THREE.MeshBasicMaterial({ color: '#5f6684' });
  for (const side of [-1, 1]) {
    const w = new THREE.BoxGeometry(1.9, .14, 150); w.translate(side * 4.85, .07, -60); addStatic(walkMat, w);
  }
  for (let z = 10; z > -130; z -= 4.5) {
    const d = new THREE.PlaneGeometry(.12, 2); d.rotateX(-Math.PI / 2); d.translate(0, .02, z); addStatic(lineMat, d);
  }
  for (const cz of [-38.5, -64]) for (let x = -3.2; x <= 3.2; x += .9) {
    const s = new THREE.PlaneGeometry(.45, 3); s.rotateX(-Math.PI / 2); s.translate(x, .021, cz); addStatic(lineMat, s);
  }

  /* ---------- 建物と店先 ---------- */
  function storefront(side, zc, w) {
    const ry = faceY(side);
    const mat = new THREE.MeshBasicMaterial({ map: pick(INTERIORS) });
    plane(mat, w - .5, 2.4, side * (FX - .02), 1.35, zc, ry);
    const entries = [lampColor(mat, .62)];
    entries.push(lampOpacity(pool(side * (FX - 1.7), zc, 5.5, '#ffb35c'), .26));
    if (rand() < .6) {
      const st = pick(STYLES);
      const smat = new THREE.MeshBasicMaterial({ map: hSignTex(pick(WORDS), st, pick(FONTS)) });
      plane(smat, Math.min(w - .6, 3.4), .64, side * (FX - .03), 2.95, zc, ry);
      entries.push(lampColor(smat, st.neon ? 2 : 1.4));
    }
    addLamp(zc, entries);
  }

  function shutter(side, zc, w) {
    const g = new THREE.PlaneGeometry(w - .5, 3);
    scaleUV(g, (w - .5) / 2, 1.5);
    g.rotateY(faceY(side)); g.translate(side * (FX - .02), 1.65, zc);
    addStatic(shutterMat, g);
  }

  function verticalSign(side, z, y) {
    const st = pick(STYLES), word = pick(WORDS), f = pick(FONTS);
    const n = [...word].length, wd = .66, hgt = Math.min(3.2, .66 * n + .5);
    const x = side * (FX - 1.05);
    for (const dy of [hgt / 2 - .15, -hgt / 2 + .15]) {
      const br = new THREE.BoxGeometry(.75, .06, .06); br.translate(side * (FX - .38), y + dy, z); addStatic(darkMat, br);
    }
    const box = new THREE.BoxGeometry(wd + .08, hgt + .08, .14); box.translate(x, y, z); addStatic(darkMat, box);
    const mat = new THREE.MeshBasicMaterial({ map: vSignTex(word, st, f, Math.round(128 * hgt / wd)) });
    plane(mat, wd, hgt, x, y, z + .075);
    plane(mat, wd, hgt, x, y, z - .075, Math.PI);
    addLamp(z, [lampColor(mat, st.neon ? 2.2 : 1.6)]);
  }

  function vending(side, z) {
    const body = new THREE.BoxGeometry(.75, 1.85, .95); body.translate(side * (FX - .4), 1.07, z); addStatic(vendBodyMat, body);
    const mat = new THREE.MeshBasicMaterial({ map: vendTex });
    plane(mat, .82, 1.5, side * (FX - .785), 1.18, z, faceY(side));
    addLamp(z, [lampColor(mat, 1.3), lampOpacity(pool(side * (FX - 1.6), z, 3.6, '#bcd6ff'), .4)]);
  }

  for (const side of [-1, 1]) {
    let z = 14;
    while (z > -121) {
      const w = range(4.2, 8), h = range(6.5, 17), d = range(7, 11), zc = z - w / 2;
      const ry = faceY(side), shop = nearShop(side, zc, w / 2 + 2.6);
      const body = new THREE.BoxGeometry(d, h, w); body.translate(side * (FX + d / 2), h / 2, zc); addStatic(bodyMat, body);
      const fh = h - 3.7;
      const fac = new THREE.PlaneGeometry(w - .25, fh - .25);
      scaleUV(fac, (w - .25) / 11.2, (fh - .25) / 20);
      fac.rotateY(ry); fac.translate(side * (FX - .01), 3.7 + fh / 2, zc);
      addStatic(pick(winMats), fac);
      if (rand() < .35) { const tank = new THREE.CylinderGeometry(.7, .7, 1.4, 10); tank.translate(side * (FX + d * .6), h + .7, zc); addStatic(poleMat, tank); }
      if (!shop) {
        const eave = new THREE.BoxGeometry(.9, .12, w - .3); eave.translate(side * (FX - .45), 3.35, zc); addStatic(darkMat, eave);
        if (rand() < .5) storefront(side, zc, w); else shutter(side, zc, w);
        const sz = z - range(.7, w - .7);
        if (rand() < .65 && !nearShop(side, sz, 4)) verticalSign(side, sz, range(5, Math.min(h - 1.8, 8.5)));
      }
      z -= w + range(.05, .4);
    }
  }
  for (const [side, z] of [[1, -9], [-1, -35], [1, -66], [-1, -99], [1, -112]]) if (!nearShop(side, z, 4)) vending(side, z);

  /* ---------- 見本の3軒（まぶしすぎない明るさに） ---------- */
  function shopBase(side, z, top, bottom, lightColor) {
    const ry = faceY(side);
    const imat = new THREE.MeshBasicMaterial({ map: interiorTex(top, bottom) });
    plane(imat, 5, 2.5, side * (FX - .02), 1.4, z, ry);
    const eave = new THREE.BoxGeometry(1.1, .14, 6.2); eave.translate(side * (FX - .55), 3.85, z); addStatic(darkMat, eave);
    const light = new THREE.PointLight(lightColor, 0, 14, 2);
    light.position.set(side * (FX - 1.6), 2.6, z);
    scene.add(light);
    return [lampColor(imat, .62), lampLight(light, 14), lampOpacity(pool(side * (FX - 2.2), z, 8, lightColor), .26)];
  }

  const swingers = [];

  // 食堂 みやま
  {
    const side = -1, z = -26, ry = faceY(side);
    const entries = shopBase(side, z, '#ffe6b8', '#ff9a3d', '#ff9a4a');
    const smat = new THREE.MeshBasicMaterial({ map: hSignTex('食堂 みやま', { bg: '#f6f0e2', fg: '#b3262c', border: '#b3262c' }, FONTS[0], '定食・めし') });
    plane(smat, 4.4, 1.1, side * (FX - .03), 3.15, z, ry);
    entries.push(lampColor(smat, 1.05));
    ['み', 'や', 'ま'].forEach((c, i) => {
      const nt = tex(128, 176, (g, w, h) => {
        g.fillStyle = '#22325A'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#1a2746'; g.fillRect(0, h - 14, w, 14);
        g.fillStyle = '#F1E8D8'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = font(FONTS[0], 86); g.fillText(c, w / 2, h * .48);
      });
      const m = new THREE.MeshBasicMaterial({ map: nt, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(1.02, 1.4); geo.translate(0, -.7, 0);
      const pivot = new THREE.Group(); pivot.rotation.y = ry;
      pivot.position.set(side * (FX - .32), 2.62, z + (1 - i) * 1.07);
      const mesh = new THREE.Mesh(geo, m); pivot.add(mesh); scene.add(pivot);
      swingers.push({ obj: mesh, axis: 'x', amp: .05, speed: 1.2, phase: i * .7 });
      entries.push(lampColor(m, 1.1));
    });
    const lt = tex(512, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#c2321f'); gr.addColorStop(.5, '#ff5a30'); gr.addColorStop(1, '#c2321f');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1210'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(FONTS[0], 44);
      for (const u of [.125, .375, .625, .875]) { g.fillText('め', u * w, h * .33); g.fillText('し', u * w, h * .7); }
    });
    for (const dz of [2.9, -2.9]) {
      const m = new THREE.MeshBasicMaterial({ map: lt });
      const pivot = new THREE.Group();
      pivot.position.set(side * (FX - .55), 3.75, z + dz);
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .72, 24, 1, true), m);
      lantern.position.y = -.62;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .08, 16), darkMat);
      cap.position.y = -.24;
      const cap2 = cap.clone(); cap2.position.y = -1;
      pivot.add(lantern, cap, cap2); scene.add(pivot);
      swingers.push({ obj: pivot, axis: 'z', amp: .06, speed: 1.4, phase: dz });
      entries.push(lampColor(m, 1.5));
    }
    addLamp(z, entries);
  }

  // hair salon lune
  {
    const side = 1, z = -51, ry = faceY(side);
    const entries = shopBase(side, z, '#e9e3fb', '#8f7ee6', '#a99bff');
    const nt = tex(512, 200, (g) => {
      g.strokeStyle = '#efe9ff'; g.lineWidth = 5; g.lineJoin = 'round';
      g.shadowColor = '#a99bff'; g.shadowBlur = 24;
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        g.arc(96, 100, 54, Math.PI * .28, Math.PI * 1.72);
        g.arc(122, 100, 44, Math.PI * 1.6, Math.PI * .4, true);
        g.closePath(); g.stroke();
        g.font = 'italic 600 132px "Shippori Mincho B1"';
        g.textBaseline = 'middle'; g.textAlign = 'left';
        g.strokeText('lune', 176, 104);
      }
    });
    const nmat = new THREE.MeshBasicMaterial({ map: nt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    plane(nmat, 3.4, 1.33, side * (FX - .05), 3.2, z, ry);
    entries.push(lampColor(nmat, 2));
    addLamp(z, entries);
  }

  // ひなた工務店
  {
    const side = -1, z = -77, ry = faceY(side);
    const entries = shopBase(side, z, '#fff1cf', '#ffc65c', '#ffd28a');
    const st = tex(512, 150, (g, w, h) => {
      g.fillStyle = '#7a4e2a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(40,22,10,.35)'; g.lineWidth = 2;
      for (let y = 6; y < h; y += 9) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * .3, y + 4, w * .6, y - 4, w, y + 2); g.stroke(); }
      g.strokeStyle = '#f6e7c8'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#f4b63f'; g.beginPath(); g.arc(70, 66, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff3dc'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.font = font(FONTS[1], 60); g.fillText('ひなた工務店', 112, 64);
      g.font = '700 21px "Zen Kaku Gothic New"'; g.fillText('リフォーム・修繕・新築', 116, 116);
    });
    const smat = new THREE.MeshBasicMaterial({ map: st });
    plane(smat, 4.3, 1.26, side * (FX - .03), 3.15, z, ry);
    entries.push(lampColor(smat, 1.05));
    const at = tex(128, 192, (g, w, h) => {
      g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2f5e3e'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#2f5e3e'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = font(FONTS[1], 40);
      ['見', '積', '無', '料'].forEach((c, i) => g.fillText(c, w / 2, 34 + i * 41));
    });
    const amat = new THREE.MeshBasicMaterial({ map: at });
    const a = plane(amat, .55, .82, side * (FX - 2.3), .6, z - 2.7, ry - .5 * side);
    a.rotation.x = -.12;
    entries.push(lampColor(amat, .9));
    addLamp(z, entries);
  }

  /* ---------- 電柱・電線・街灯 ---------- */
  const wirePts = [];
  const sagPt = (a, b, t, sag) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const wire = (a, b, sag) => { for (let i = 0; i < 12; i++) wirePts.push(...sagPt(a, b, i / 12, sag), ...sagPt(a, b, (i + 1) / 12, sag)); };
  const tops = { '-1': [], '1': [] };
  for (const side of [-1, 1]) {
    const xs = side * 4.25;
    let prev = null;
    for (let z = side < 0 ? 8 : 0; z > -126; z -= 16) {
      if (nearShop(side, z, 5.5)) continue;
      const pole = new THREE.CylinderGeometry(.12, .15, 9.6, 8); pole.translate(xs, 4.8, z); addStatic(poleMat, pole);
      for (const y of [8.7, 8.1]) { const arm = new THREE.BoxGeometry(1.7, .09, .09); arm.translate(xs, y, z); addStatic(poleMat, arm); }
      if (rand() < .5) { const tr = new THREE.CylinderGeometry(.28, .28, .8, 10); tr.translate(xs + side * .42, 7.1, z); addStatic(poleMat, tr); }
      const arm = new THREE.BoxGeometry(1.4, .07, .07); arm.translate(xs - side * .7, 6.3, z); addStatic(poleMat, arm);
      const head = new THREE.BoxGeometry(.5, .1, .24); head.translate(xs - side * 1.3, 6.24, z); addStatic(lampHeadMat, head);
      pool(xs - side * 1.3, z, 7, '#9fb6ff').opacity = .18;
      const pts = [[xs - .75, 8.75, z], [xs, 8.75, z], [xs + .75, 8.75, z], [xs - .6, 8.15, z], [xs + .6, 8.15, z]];
      if (prev) pts.forEach((p, i) => wire(prev[i], p, range(.35, .7)));
      prev = pts;
      tops[side].push(pts[1]);
    }
  }
  tops['-1'].forEach((p, i) => { if (i % 2 === 0 && tops['1'][i]) wire(p, tops['1'][i], .9); });
  scene.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3)),
    new THREE.LineBasicMaterial({ color: '#05070f' })
  ));

  /* ---------- 突き当たりのビルと屋上の看板 ---------- */
  {
    const end = new THREE.BoxGeometry(26, 11, 8); end.translate(0, 5.5, -128); addStatic(bodyMat, end);
    const fac = new THREE.PlaneGeometry(25, 7);
    scaleUV(fac, 25 / 11.2, 7 / 20);
    fac.translate(0, 7.3, -123.99); addStatic(winMats[0], fac);
    for (const x of [-4.2, 0, 4.2]) { const leg = new THREE.BoxGeometry(.12, 1.4, .12); leg.translate(x, 11.7, -126); addStatic(poleMat, leg); }
    const bt = tex(1024, 256, (g, w, h) => {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ffb547'; g.shadowBlur = 30;
      g.fillStyle = '#ffe2b0';
      g.font = font(FONTS[0], 150);
      g.fillText('森川ウェブ', w / 2, h * .42);
      g.font = '700 40px "Zen Kaku Gothic New"';
      g.fillText('ホームページ制作', w / 2, h * .86);
    });
    const bmat = new THREE.MeshBasicMaterial({ map: bt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    plane(bmat, 10, 2.5, 0, 13.1, -125.9);
    addLamp(-128, [lampColor(bmat, 2.4)], 52);

    for (let i = 0; i < 12; i++) {
      const hgt = range(22, 50), x = range(-40, 40), z = range(-150, -210);
      const b = new THREE.BoxGeometry(range(8, 16), hgt, range(8, 14)); b.translate(x, hgt / 2, z); addStatic(darkMat, b);
    }
  }

  for (const [mat, geos] of statics) scene.add(new THREE.Mesh(mergeGeometries(geos), mat));
  setProgress(84);

  /* ---------- 雨 ---------- */
  const RAIN = reduceMotion ? 0 : (coarse ? 320 : 700);
  const rainPos = new Float32Array(RAIN * 6), rainVel = new Float32Array(RAIN);
  const drop = (i, cz, top) => {
    const x = (Math.random() - .5) * 18, y = top ? 9 + Math.random() * 5 : Math.random() * 14, z = cz - 38 + Math.random() * 44, len = .25 + Math.random() * .3;
    rainPos.set([x, y, z, x, y - len, z], i * 6);
    rainVel[i] = 14 + Math.random() * 6;
  };
  for (let i = 0; i < RAIN; i++) drop(i, CAM.hero.p[2], false);
  const rainGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  if (RAIN) scene.add(new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#8ea2dc', transparent: true, opacity: .3 })));

  /* ---------- 画面の後処理 ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .6, .5, .84);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  function resize() {
    measure();
    camera.aspect = innerWidth / innerHeight;
    camera.fov = portrait ? 64 : 50;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    bloom.resolution.set(innerWidth / 2, innerHeight / 2);
    if (road) { const pr = renderer.getPixelRatio(); road.getRenderTarget().setSize(Math.round(innerWidth * pr * .5), Math.round(innerHeight * pr * .5)); }
  }
  addEventListener('resize', resize);
  resize();

  /* ---------- カメラ ---------- */
  const P = new THREE.Vector3(), L = new THREE.Vector3();
  const Pa = new THREE.Vector3(), La = new THREE.Vector3(), Pb = new THREE.Vector3(), Lb = new THREE.Vector3();
  const curP = new THREE.Vector3(), curL = new THREE.Vector3();
  let tgtFog = 0, tgtExp = 1;
  const preset = (key, outP, outL) => {
    const c = CAM[key], m = portrait && c.pm;
    outP.fromArray(m ? c.pm : c.p); outL.fromArray(m ? c.lm : c.l);
    return c;
  };
  function target(sy) {
    let a = anchors[0], b = a, t = 0;
    const last = anchors[anchors.length - 1];
    if (sy >= last.s) { a = b = last; }
    else for (let i = 0; i < anchors.length - 1; i++) {
      if (sy < anchors[i + 1].s) { a = anchors[i]; b = anchors[i + 1]; t = sy <= a.s ? 0 : smooth((sy - a.s) / (b.s - a.s)); break; }
    }
    const ca = preset(a.key, Pa, La), cb = preset(b.key, Pb, Lb);
    P.lerpVectors(Pa, Pb, t); L.lerpVectors(La, Lb, t);
    tgtFog = ca.fog + (cb.fog - ca.fog) * t;
    tgtExp = ca.exp + (cb.exp - ca.exp) * t;
  }
  target(scrollY);
  let fogD = tgtFog, expo = tgtExp;
  curP.copy(P); curL.copy(L);

  const mouse = { x: 0, y: 0 }, par = new THREE.Vector3();
  if (finePointer) addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; });

  let started = false, dive = null, lastPanelY = -1;
  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), .05), now = clock.elapsedTime;
    target(scrollY);
    if (dive) {
      const k = smooth((now - dive.t0) / 1.1);
      P.lerpVectors(dive.fromP, dive.toP, k); L.lerpVectors(dive.fromL, dive.toL, k);
    }
    const k = dive ? 1 : 1 - Math.pow(.0012, dt);
    curP.lerp(P, k); curL.lerp(L, k);
    fogD += (tgtFog - fogD) * k; expo += (tgtExp - expo) * k;
    par.x += (mouse.x * .45 - par.x) * .05;
    par.y += (-mouse.y * .22 - par.y) * .05;
    camera.position.copy(curP).add(dive ? par.multiplyScalar(.9) : par);
    camera.lookAt(curL);
    scene.fog.density = fogD;
    renderer.toneMappingExposure = expo;

    const v = (scrollY - lastY) / Math.max(dt, .001);
    lastY = scrollY;
    scrollVel += (Math.min(1, Math.abs(v) / 5000) - scrollVel) * .1;
    finish.uniforms.uVel.value = reduceMotion ? 0 : scrollVel;
    finish.uniforms.uTime.value = now;
    if (road) { road.material.uniforms.uTime.value = now; road.material.uniforms.uFogDensity.value = fogD; }

    for (const l of lamps) {
      if (l.t0 < 0) {
        if (started && camera.position.z < l.z + l.reach) l.t0 = now + l.delay;
        else continue;
      }
      const val = flicker(now - l.t0);
      if (val !== l.last) { l.entries.forEach(fn => fn(val)); l.last = val; }
    }

    if (!reduceMotion) for (const s of swingers) s.obj.rotation[s.axis] = Math.sin(now * s.speed + s.phase) * s.amp;

    if (RAIN) {
      const cz = camera.position.z;
      for (let i = 0; i < RAIN; i++) {
        const dy = rainVel[i] * dt, o = i * 6;
        rainPos[o + 1] -= dy; rainPos[o + 4] -= dy;
        if (rainPos[o + 4] < 0 || rainPos[o + 2] > cz + 8) drop(i, cz, true);
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    if (scrollY !== lastPanelY) { lastPanelY = scrollY; updatePanels(scrollY); }
    composer.render();
    requestAnimationFrame(frame);
  }

  composer.render();
  setProgress(100);
  return {
    start() { started = true; clock.getDelta(); requestAnimationFrame(frame); },
    dive(key) {
      const d = DOORS[key];
      dive = { t0: clock.elapsedTime, fromP: curP.clone(), fromL: curL.clone(), toP: new THREE.Vector3(...d.p), toL: new THREE.Vector3(...d.l) };
    },
    undive() { dive = null; },
  };
}

/* ================= 起動 ================= */
setProgress(8);
initWebGL().then(w => {
  world = w;
  if (!w) document.documentElement.classList.add('no-webgl');
  setTimeout(() => {
    loader.classList.add('done');
    if (w) w.start();
    lightTitle();
  }, w ? 700 : 0);
}).catch(err => {
  console.error(err);
  document.documentElement.classList.add('no-webgl');
  loader.classList.add('done');
  lightTitle();
});
