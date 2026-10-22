/* 提案用の試作ページの共通の動き */
(function () {
  // 確認用：?qa を付けると動きを止めて最終状態を表示する
  if (/[?&]qa/.test(location.search)) document.documentElement.classList.add('qa');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('qa');
  var clamp01 = function (x) { return Math.max(0, Math.min(1, x)); };
  var lang = 'ja';

  /* なめらかなスクロール */
  if (!reduce && window.Lenis) {
    var lenis = new Lenis({ lerp: .09 });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id.length < 2) return;
        e.preventDefault(); lenis.scrollTo(id, { offset: -70 });
      });
    });
  }

  /* 画面に入ったら表示 */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .18 });
  document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });

  /* 創業年などの数字を数え上げる */
  var cio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      cio.unobserve(e.target);
      var el = e.target.querySelector('[data-count]') || e.target, to = +el.dataset.count, from = +(el.dataset.from || 0), t0 = performance.now();
      (function tick(now) {
        var k = reduce ? 1 : clamp01((now - t0) / 1600), v = from + (to - from) * (1 - Math.pow(1 - k, 4));
        el.textContent = Math.round(v);
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }, { threshold: .5 });
  document.querySelectorAll('[data-count]').forEach(function (el) { cio.observe(el); });

  /* 写真の視差 */
  var para = document.querySelectorAll('[data-speed]');
  function onScroll() {
    para.forEach(function (el) {
      var r = el.parentNode.getBoundingClientRect(), mid = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      el.style.transform = 'translate3d(0,' + (mid * -100 * +el.dataset.speed - 8) + '%,0)';
    });
    var top = document.querySelector('.top'), bar = document.querySelector('.proposal-bar');
    var barH = bar ? bar.getBoundingClientRect().bottom : 0;
    top.style.setProperty('--top-offset', Math.max(0, barH) + 'px');
    top.classList.toggle('stuck', scrollY > 40);
  }
  (function follow(y) { if (scrollY !== y) onScroll(); var n = scrollY; requestAnimationFrame(function () { follow(n); }); })(-1);
  addEventListener('resize', onScroll);

  /* 見出しを一文字ずつ。改行は文節の切れ目だけにして、句読点が行頭に来ないようにする */
  var SPLIT = '.sec-head h2,.story h2,.cta h2,.st-copy h2,.sb-copy h2,.sz-panel h2,.sw-copy h2,.sp-copy h2,.sh-copy h2,.ss-panel h2,.sl-copy h2:not(#sl-h),.tz-head h2';
  var HIRA = /[ぁ-ゟー]/, CLOSE = /[、。，．・：；？！）」』】〕〉》”’…]/, OPEN = /[（「『【〔〈《“‘]/;
  function phrases(text) {
    var out = [], prev = '';
    Array.from(text).forEach(function (ch) {
      var cont = false;
      if (out.length && !/\s/.test(ch) && !/\s/.test(prev)) {
        if (CLOSE.test(ch) || OPEN.test(prev)) cont = true;                       // 句読点は前に、括弧の中身は括弧に付ける
        else if (HIRA.test(ch)) cont = !/[、。，．！？]/.test(prev);                // ひらがなは前の語に続ける（送り仮名・助詞）
        else cont = !OPEN.test(ch) && !HIRA.test(prev) && !CLOSE.test(prev);       // 漢字やカタカナの続き
      }
      if (cont) out[out.length - 1] += ch; else out.push(ch);
      prev = ch;
    });
    return out;
  }
  document.querySelectorAll(SPLIT).forEach(function (h) {
    var n = 0;
    (function walk(node) {
      [].slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          phrases(c.textContent).forEach(function (w) {
            var g = document.createElement('span'); g.className = 'w';
            Array.from(w).forEach(function (ch) {
              var s = document.createElement('span'); s.className = 'c'; s.style.setProperty('--i', n++); s.textContent = ch; g.appendChild(s);
            });
            frag.appendChild(g);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
      });
    })(h);
    h.classList.add('split');
    io.observe(h);
  });

  /* 読み込み画面 */
  var root = document.documentElement, pre = document.querySelector('.preloader');
  function ready() {
    if (root.classList.contains('ready')) return;
    root.classList.remove('loading'); root.classList.add('ready');
    if (pre) pre.classList.add('done');
    dispatchEvent(new Event('kit:ready'));
  }
  if (reduce || !pre) ready();
  else {
    var shown = 0, target = 0, t0 = performance.now(), num = pre.querySelector('.pl-num'), bar = pre.querySelector('.pl-bar i');
    var waits = [].slice.call(document.images).filter(function (i) { return i.loading !== 'lazy'; }), total = waits.length + 1, done = 0;
    var bump = function () { done++; target = Math.min(100, done / total * 100); };
    waits.forEach(function (i) { if (i.complete) bump(); else { i.addEventListener('load', bump, { once: true }); i.addEventListener('error', bump, { once: true }); } });
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(bump);
    setTimeout(function () { target = 100; }, 3800);
    setTimeout(ready, 6000); // 描画が止まっていても、必ず本編を開く
    var last = performance.now();
    (function tick() {
      var now = performance.now();
      shown += (target - shown) * (1 - Math.exp(-(now - last) / 240)); last = now;
      num.textContent = Math.round(shown);
      bar.style.transform = 'scaleX(' + (shown / 100) + ')';
      if (shown > 99.4 && performance.now() - t0 > 1200) { num.textContent = 100; setTimeout(ready, 260); return; }
      requestAnimationFrame(tick);
    })();
  }

  /* カーソルと、吸い付くボタン */
  if (matchMedia('(pointer: fine)').matches && !reduce) {
    var cur = document.createElement('div'); cur.className = 'cursor'; cur.innerHTML = '<span></span>'; document.body.appendChild(cur);
    var lab = cur.firstChild, cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    var LABELS = [['img[data-gl]', '見る'], ['#bowl3d', '回す'], ['.tz', 'めくる'], ['.spot', '押す'], ['.sz-opts button', '選ぶ'], ['#walk', '歩く'], ['#ss-push', '押す'], ['#tatami3d,#ring3d', 'スクロール']];
    addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      var t = e.target, label = '';
      LABELS.forEach(function (l) { if (!label && t.closest && t.closest(l[0])) label = l[1]; });
      cur.classList.toggle('big', !!(t.closest && t.closest('a,button,summary,input,label')) || !!label);
      cur.classList.toggle('label', !!label);
      lab.textContent = label;
    });
    (function loop() { cx += (tx - cx) * .2; cy += (ty - cy) * .2; cur.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)'; requestAnimationFrame(loop); })();
    document.querySelectorAll('.btn,.call,.ss-push,.top .name').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .22) + 'px,' + ((e.clientY - r.top - r.height / 2) * .3) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }

  /* 流れる言葉の帯（スクロールの速さで加速） */
  var mq = document.querySelector('.mq-track');
  if (mq && !reduce) {
    var mx = 0, ly = scrollY, sp = 0;
    (function loop() {
      var d = scrollY - ly; ly = scrollY; sp += (Math.min(40, Math.abs(d)) - sp) * .1;
      mx -= .6 + sp * .5;
      var half = mq.scrollWidth / 2; if (-mx > half) mx += half;
      mq.style.transform = 'translate3d(' + mx + 'px,0,0)';
      requestAnimationFrame(loop);
    })();
  }

  /* 営業中かどうか（東京時間） */
  var S = window.SCHEDULE;
  function tokyo() {
    var o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
    return { wd: wd, date: +o.day, min: (+o.hour % 24) * 60 + (+o.minute) };
  }
  function hm(m) { return Math.floor(m / 60) + ':' + ('0' + m % 60).slice(-2); }
  function dur(m) { var h = Math.floor(m / 60), r = m % 60; return lang === 'en' ? (h ? h + 'h ' : '') + r + 'min' : (h ? h + '時間' : '') + r + '分'; }
  function renderStatus() {
    if (!S) return;
    var el = document.getElementById('status'); if (!el) return;
    var t = tokyo(), slots = S.days[t.wd] || [], nth = Math.ceil(t.date / 7), msg, open = false;
    if (S.closedNth && S.closedNth.day === t.wd && S.closedNth.n.indexOf(nth) >= 0) slots = [];
    if (!slots.length) msg = lang === 'en' ? 'Closed today' : '本日は定休日です';
    else {
      msg = lang === 'en' ? 'Closed for today' : '本日の営業は終了しました';
      for (var i = 0; i < slots.length; i++) {
        if (t.min < slots[i][0]) { msg = lang === 'en' ? 'Opens in ' + dur(slots[i][0] - t.min) : '開店まで、あと' + dur(slots[i][0] - t.min); break; }
        if (t.min < slots[i][1]) { open = true; msg = lang === 'en' ? 'Open now · until ' + hm(slots[i][1]) : 'ただいま営業中・' + hm(slots[i][1]) + 'まで'; break; }
      }
    }
    el.classList.toggle('open', open);
    el.querySelector('b').textContent = msg;
    document.querySelectorAll('.hours tr[data-wd]').forEach(function (tr) {
      tr.classList.toggle('today', tr.dataset.wd.split(',').indexOf(String(t.wd)) >= 0);
    });
  }
  renderStatus(); setInterval(renderStatus, 30000);

  /* 日本語と英語の切り替え（英語のある店だけ） */
  var items = document.querySelectorAll('[data-en]');
  if (items.length) {
    items.forEach(function (el) { el.dataset.ja = el.innerHTML; });
    document.querySelectorAll('.lang button').forEach(function (b) {
      b.addEventListener('click', function () {
        lang = b.dataset.lang;
        document.documentElement.lang = lang;
        document.querySelectorAll('.lang button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        items.forEach(function (el) { if (lang === 'en') el.textContent = el.dataset.en; else el.innerHTML = el.dataset.ja; });
        renderStatus();
      });
    });
  }
})();
