/* 暖簾の3D。風と指で揺れ、スクロールすると人がくぐるように左右へ分かれて、奥の店内が見えてくる */
import * as THREE from 'three';

const VERT = `
  uniform float uTime, uPart, uSide, uPhase, uH, uMouseK;
  uniform vec2 uMouse;
  varying vec2 vUv; varying vec3 vPos;
  void main(){
    vUv = uv;
    vec3 p = position;
    float hang = clamp((uH * .5 - p.y) / uH, 0., 1.);
    float t = uTime + uPhase;
    p.z += (sin(p.x * 2.6 + t * 1.5) * .07 + sin(p.y * 2.1 - t * 1.05 + p.x * 1.3) * .05) * hang;
    p.x += sin(t * .9 + p.y * 1.5) * .02 * hang;
    vec4 w = modelMatrix * vec4(p, 1.);
    float d = distance(w.xy, uMouse);
    p.z -= uMouseK * exp(-d * d * 5.) * hang * .45;
    // くぐる：下ほど大きく、奥へ・外側へ持ち上がる
    float bend = hang * hang, belly = sin(hang * 3.1416);
    p.x += uSide * uPart * (bend * 1.15 + belly * .18);
    p.z -= uPart * (bend * 1.7 + belly * .4 + uSide * (p.x / .55) * .25 * hang);
    p.y += uPart * bend * .65;
    vPos = (modelMatrix * vec4(p, 1.)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.);
  }`;

const FRAG = `
  uniform sampler2D uTex;
  uniform vec3 uCloth, uInk;
  uniform vec2 uSlice; uniform float uPattern;
  varying vec2 vUv; varying vec3 vPos;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  void main(){
    float ink = texture2D(uTex, vec2(uSlice.x + vUv.x * uSlice.y, vUv.y)).r;
    vec3 col = uPattern > .5 ? texture2D(uTex, vec2(uSlice.x + vUv.x * uSlice.y, vUv.y)).rgb : mix(uCloth, uInk, ink);
    // 平織りの目と、染めむら
    col *= .94 + .06 * sin(vUv.x * 1400.) * sin(vUv.y * 1800.);
    col *= .96 + .08 * hash(floor(vUv * vec2(90., 140.)));
    vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
    float l = .5 + .5 * abs(dot(n, normalize(vec3(-.35, .45, 1.))));
    col *= l;
    col *= .82 + .18 * smoothstep(0., .06, vUv.y);       // 裾の影
    col *= .8 + .2 * smoothstep(1., .9, vUv.y);           // 竿の影
    gl_FragColor = vec4(col, 1.);
    #include <colorspace_fragment>
  }`;

/**
 * opts: canvas, section, chars（布ごとの文字）, sub（裾の小さな文字）, cloth, ink, font, mark（中央の紋：文字）
 * onProgress(p, heroK) で、ページ側の文字の出し入れをする
 */
export function noren(opts) {
  const { canvas, section } = opts;
  const qa = /[?&]qa/.test(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 50);
  camera.position.set(0, 0, 6);

  const chars = opts.chars || [], N = opts.panels || chars.length;
  const PW = opts.pw || 1.05, GAP = .035, H = opts.h || 2.7, W = N * PW + (N - 1) * GAP;

  // 染め抜きの文字（白）を一枚の絵に描き、布ごとに切り分けて使う
  const tex = new THREE.CanvasTexture(document.createElement('canvas'));
  if (opts.paint) tex.colorSpace = THREE.SRGBColorSpace;
  function paint() {
    const c = tex.image, s = 512;
    c.width = s * N; c.height = Math.round(s * H / PW);
    const g = c.getContext('2d');
    if (opts.paint) { opts.paint(g, c.width, c.height); tex.needsUpdate = true; return; }
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = s * .62;
    g.font = `${opts.weight || 700} ${fs}px ${opts.font}`;
    chars.forEach((ch, i) => {
      // にじみ：少しずつずらして重ねる
      for (let k = 0; k < 6; k++) {
        g.globalAlpha = k ? .12 : 1;
        g.fillText(ch, s * (i + .5) + (k ? (Math.random() - .5) * 6 : 0), c.height * .42 + (k ? (Math.random() - .5) * 6 : 0));
      }
    });
    g.globalAlpha = 1;
    if (opts.mark) {
      // 中央上の紋
      const cx = c.width / 2, cy = c.height * .13, r = s * .2;
      g.lineWidth = s * .03; g.strokeStyle = '#fff';
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      g.font = `${opts.weight || 700} ${r * 1.15}px ${opts.font}`; g.fillText(opts.mark, cx, cy + r * .05);
    }
    if (opts.sub) {
      g.font = `500 ${s * .085}px ${opts.font}`;
      g.fillText(opts.sub, c.width / 2, c.height * .86);
    }
    tex.needsUpdate = true;
  }
  paint();
  (document.fonts ? document.fonts.load(`700 40px ${opts.font}`) : Promise.resolve()).then(paint).catch(() => {});

  const group = new THREE.Group(); scene.add(group);
  const panels = Array.from({ length: N }, (_, i) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: {
        uTex: { value: tex }, uCloth: { value: new THREE.Color(opts.cloth || '#1d2a4d') }, uInk: { value: new THREE.Color(opts.ink || '#f3efe6') },
        uSlice: { value: new THREE.Vector2(i / N, 1 / N) }, uTime: { value: 0 }, uPart: { value: 0 },
        uSide: { value: i < (N - 1) / 2 ? -1 : i > (N - 1) / 2 ? 1 : 0 }, uPhase: { value: i * 1.7 }, uH: { value: H },
        uMouse: { value: new THREE.Vector2(99, 99) }, uMouseK: { value: 0 }, uPattern: { value: opts.paint ? 1 : 0 },
      },
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(PW, H, 24, 48), mat);
    m.position.x = -W / 2 + PW / 2 + i * (PW + GAP);
    group.add(m);
    return m;
  });
  // 中央の布は、まっすぐ奥へ持ち上がる
  if (N % 2) panels[(N - 1) / 2].material.uniforms.uSide.value = 0;

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, W + .5, 16), new THREE.MeshBasicMaterial({ color: opts.rod || '#2a1a10' }));
  rod.rotation.z = Math.PI / 2; rod.position.y = H / 2 + .03; group.add(rod);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);

  const mouse = new THREE.Vector2(99, 99), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  let mk = 0, mkT = 0, last = 0;
  addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    if (ray.ray.intersectPlane(plane, hit)) mouse.set(hit.x, hit.y);
    mkT = Math.min(1, Math.hypot(e.movementX || 0, e.movementY || 0) / 18 + .35); last = performance.now();
  }, { passive: true });

  let visible = true, cur = 0;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(section);
  const clock = new THREE.Clock();
  const c01 = x => Math.max(0, Math.min(1, x));
  (function loop() {
    requestAnimationFrame(loop);
    if (!visible && !qa) return;
    const t = reduce ? 0 : clock.getElapsedTime();
    const r = section.getBoundingClientRect();
    const p = qa ? +(new URLSearchParams(location.search).get('p') || 0) : c01(-r.top / Math.max(1, r.height - innerHeight));
    cur += (p - cur) * (reduce || qa ? 1 : .08);
    if (performance.now() - last > 600) mkT = 0;
    mk += (mkT - mk) * .08;
    const part = opts.noPart ? 0 : THREE.MathUtils.smoothstep(cur, .12, .62);
    const portrait = camera.aspect < .9;
    // 縦長の画面では暖簾を上に、横長では右に寄せる
    const s = portrait ? Math.min(1, camera.aspect * 2.1) : 1;
    group.scale.setScalar(s);
    group.position.set(portrait ? 0 : (opts.offsetX ?? 1.25), portrait ? .55 : .05, 0);
    panels.forEach(m => {
      const u = m.material.uniforms;
      u.uTime.value = t; u.uPart.value = part; u.uMouseK.value = mk;
      u.uMouse.value.copy(mouse);
    });
    camera.position.x = reduce ? 0 : Math.sin(t * .2) * .05;
    renderer.render(scene, camera);
    if (opts.onProgress) opts.onProgress(cur, part);
  })();
  return { repaint(fn) { opts.paint = fn; paint(); } };
}
