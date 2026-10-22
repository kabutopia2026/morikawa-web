/* 和包丁の3D。刃に指をすべらせると研いだように光が走り、スクロールで包丁の種類が替わる */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 刃の形（峰と刃先の線）。x: 0=あご、1=切っ先。長さに対する高さの比
export const BLADES = {
  gyuto:   { len: 4.2, h: .95, tip: .12, belly: .55 },
  santoku: { len: 3.4, h: 1.05, tip: .42, belly: .3, sheep: true },
  yanagiba:{ len: 5.2, h: .7, tip: .05, belly: .75, single: true },
  deba:    { len: 3.2, h: 1.15, tip: .2, belly: .6, thick: true },
  nakiri:  { len: 3.3, h: 1.1, square: true },
  kama:    { len: 2.6, h: 1.7, kama: true, hy: .1, thin: true },
};

function bladeShape(b) {
  const s = new THREE.Shape(), L = b.len, H = b.h;
  s.moveTo(0, 0);                                   // あごの刃元
  if (b.kama) {
    // 鎌：内側が刃。三日月のように反る
    // 背（外側）はあごから前へ伸びて、切っ先へ反り上がる。刃（内側）は切っ先からあごへ戻る
    s.bezierCurveTo(L * .45, -H * .02, L * .85, H * .05, L * .98, H * .42);
    s.bezierCurveTo(L * 1.04, H * .66, L * .96, H * .9, L * .84, H);
    s.bezierCurveTo(L * .8, H * .72, L * .7, H * .4, L * .46, H * .3);
    s.bezierCurveTo(L * .3, H * .24, L * .12, H * .24, 0, H * .26);
    s.lineTo(0, 0);
    return s;
  }
  if (b.square) {
    s.lineTo(L, 0); s.lineTo(L, H * .98); s.lineTo(0, H);
  } else {
    // 刃の線：あごから、切っ先に向かって反り上がる
    s.bezierCurveTo(L * b.belly, 0, L * .92, H * .02, L, H * b.tip);
    // 峰：切っ先から、あごへ
    if (b.sheep) s.bezierCurveTo(L * .9, H * .8, L * .7, H, L * .45, H);
    else s.bezierCurveTo(L * .82, H * .55, L * .6, H, L * .35, H);
    s.lineTo(0, H);
  }
  s.lineTo(0, 0);
  return s;
}

const VERT_HOOK = (shader, U) => {
  shader.uniforms.uSharp = U.uSharp; shader.uniforms.uTime = U.uTime; shader.uniforms.uLen = U.uLen; shader.uniforms.uH = U.uH; shader.uniforms.uHeat = U.uHeat;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vLocal; uniform float uSharp, uTime, uLen, uH, uHeat;
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      // 鍛え肌（ダマスカス）の模様：刃の高さ方向に積み重なった波
      float yy = vLocal.y / uH, xx = vLocal.x / uLen;
      float wv = yy * 15. + sin(xx * 9. + n2(vec2(xx * 6., yy * 3.)) * 4.) * 1.3 + n2(vec2(xx * 18., yy * 8.)) * 1.6;
      float band = smoothstep(.35, .65, abs(fract(wv) - .5) * 2.);
      float zone = smoothstep(.18, .4, yy);         // 刃先は鏡のように研がれている
      diffuseColor.rgb *= mix(1., .62 + .38 * band, zone);
      // 研いだ光：刃先に沿って走る
      float edge = smoothstep(.12, .0, yy);
      float run = smoothstep(.08, 0., abs(xx - fract(uTime * .35)));
      diffuseColor.rgb += edge * (uSharp * .35 + run * uSharp * 1.1) * vec3(1., .97, .9);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.6, .55, .12) * (.75 + .5 * n2(vec2(xx * 9., yy * 4.) + uTime)), uHeat);`);
};

/** opts: canvas, section, kinds: ['gyuto', ...], handle: '#5a3a24', onItem(i), place(portrait, heroK) */
export function knife(opts) {
  const { canvas, section } = opts;
  const qa = /[?&]qa/.test(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .02).texture;
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);

  // 木の柄（和包丁の八角柄）
  const woodTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = opts.handle || '#6b4a2e'; g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(30,18,8,${.08 + Math.random() * .15})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * 128; g.moveTo(0, y); for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 4); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const handleMat = new THREE.MeshPhysicalMaterial({ map: woodTex, roughness: .55, clearcoat: .4 });
  const hornMat = new THREE.MeshPhysicalMaterial({ color: '#141210', roughness: .25, clearcoat: 1 });

  const U = { uSharp: { value: 0 }, uTime: { value: 0 }, uLen: { value: 1 }, uH: { value: 1 }, uHeat: { value: 0 } };
  const steel = new THREE.MeshPhysicalMaterial({ color: opts.steel || '#b4bac2', metalness: 1, roughness: .3, clearcoat: .4, envMapIntensity: .95 });
  steel.onBeforeCompile = s => VERT_HOOK(s, U);

  const knives = opts.kinds.map(k => {
    const b = BLADES[k], g = new THREE.Group();
    const thick = b.thick ? .07 : b.thin ? .025 : .035;
    const geo = new THREE.ExtrudeGeometry(bladeShape(b), { depth: thick, bevelEnabled: true, bevelThickness: thick * .9, bevelSize: .035, bevelSegments: 3, curveSegments: 48 });
    geo.translate(0, 0, -thick / 2);
    const blade = new THREE.Mesh(geo, steel); g.add(blade);
    const hl = 2.1, hr = .2;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(hr * .9, hr, hl, 8), handleMat);
    handle.rotation.z = Math.PI / 2; handle.position.set(-hl / 2 - .32, b.h * (b.hy ?? .62), 0); g.add(handle);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(hr * 1.02, hr * 1.02, .32, 8), hornMat);
    horn.rotation.z = Math.PI / 2; horn.position.set(-.16, b.h * (b.hy ?? .62), 0); g.add(horn);
    // 中心を刃の真ん中に
    g.children.forEach(c => { c.position.x -= (b.len - hl - .32) / 2; c.position.y -= b.h / 2; });
    g.userData = Object.assign({ handle, horn, hx: handle.position.x, rx: horn.position.x }, b); g.visible = false; scene.add(g);
    return g;
  });

  const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(-2, 4, 5); scene.add(key);
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); addEventListener('resize', resize);

  // 刃に沿って指を動かすほど、よく研げる
  let sharp = qa ? 1 : 0, lastX = null;
  const onMove = e => {
    if (lastX !== null) sharp = Math.min(1, sharp + Math.abs(e.clientX - lastX) / 1400);
    lastX = e.clientX;
  };
  canvas.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerleave', () => { lastX = null; });

  let item = -1, cur = 0, visible = true;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(section);
  const show = i => { if (i === item) return; item = i; knives.forEach((k, j) => { k.visible = j === i; }); const b = knives[i].userData; U.uLen.value = b.len; U.uH.value = b.h; if (opts.onItem) opts.onItem(i); };
  show(0);
  const clock = new THREE.Clock();
  const mouse = { x: 0, y: 0 };
  addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; }, { passive: true });
  (function loop() {
    requestAnimationFrame(loop);
    if (!visible && !qa) return;
    const t = clock.getElapsedTime();
    const r = section.getBoundingClientRect();
    const p = qa ? +(new URLSearchParams(location.search).get('p') || 0) : Math.max(0, Math.min(.999, -r.top / Math.max(1, r.height - innerHeight)));
    cur += (p - cur) * (reduce || qa ? 1 : .09);
    const a = opts.start ?? .15, heroK = 1 - Math.max(0, Math.min(1, cur / a));
    if (!opts.stages) show(Math.min(knives.length - 1, Math.floor(Math.max(0, cur - a) / (1 - a) * knives.length)));
    else {
      // 鍛冶（赤く焼ける）→ 刃付け（研ぎの光が走る）→ 柄付け（柄が差し込まれる）
      const q = Math.max(0, cur - a) / (1 - a), kd = knives[item].userData;
      U.uHeat.value = 1 - Math.min(1, Math.max(0, (q - .12) / .2));
      sharp = qa ? (q > .34 && q < .66 ? 1 : 0) : Math.max(sharp, q > .36 && q < .66 ? 1 : 0);
      const hs = Math.min(1, Math.max(0, (q - .66) / .14));
      kd.handle.position.x = kd.hx - (1 - hs) * 3; kd.horn.position.x = kd.rx - (1 - hs) * 3;
      kd.handle.visible = kd.horn.visible = hs > .01;
      if (opts.onStage) opts.onStage(q < .34 ? 0 : q < .66 ? 1 : 2);
    }
    if (!qa) sharp = Math.max(0, sharp - .0015);
    U.uSharp.value = Math.max(sharp, reduce ? .6 : 0); U.uTime.value = t;
    const k = knives[item], portrait = camera.aspect < .9;
    const pl = opts.place ? opts.place(portrait, heroK) : { x: portrait ? 0 : 1.1, y: portrait ? 1 : 0, s: portrait ? .5 : .78 };
    k.position.set(pl.x, pl.y, 0);
    k.scale.setScalar(pl.s);
    // ゆっくり傾いて、刃の面に光を受ける
    k.rotation.set(-.25 + mouse.y * .3 + (reduce ? 0 : Math.sin(t * .4) * .06), -.35 + mouse.x * .5 + (reduce ? 0 : Math.sin(t * .3) * .1), -.08);
    camera.position.set(0, 0, 9);
    renderer.render(scene, camera);
    if (opts.onProgress) opts.onProgress(cur, heroK, sharp);
  })();
}
