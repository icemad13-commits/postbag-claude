/* 「주인 잃은 우편가방」 게임 엔진
   - 내용(문장·정답 해시)은 data.js, 정답 비교는 hash.js, 반 공통 설정은 config.js
   - 진행 상황은 기기의 localStorage에만 저장하고, 엔딩 때 최종 결과만 Apps Script로 보낸다. */
(() => {
  'use strict';
  const D = window.MB_DATA, HX = window.MBHash, CFG = window.MB_CONFIG || {};
  const LS = 'mailbag1_';
  const $ = (q) => document.querySelector(q);
  const NUM = ['①', '②', '③', '④'];
  const ARW = { U: '↑', D: '↓', L: '←', R: '→' };
  const JAMO = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ'.split('');
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 저장 ---------------- */
  const load = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 기기는 그냥 진행 */ } };
  const deob = (s) => { try { return Array.from(decodeURIComponent(escape(atob(s)))).reverse().join(''); } catch (e) { return ''; } };
  const ob = (s) => btoa(unescape(encodeURIComponent(Array.from(s).reverse().join(''))));
  function merge(a, b) {
    const o = JSON.parse(JSON.stringify(a));
    for (const k in b || {}) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && o[k] && typeof o[k] === 'object') o[k] = merge(o[k], b[k]);
      else if (b[k] !== undefined) o[k] = b[k];
    }
    return o;
  }
  const DEF = {
    part: CFG.part === 'p2' ? 'p2' : 'p1', box1: deob(D.def.box1), place: deob(D.def.place), virtual: false,
    v: { p1: { dir: deob(D.def.v.p1.dir), word: deob(D.def.v.p1.word) }, p2: { dir: deob(D.def.v.p2.dir), word: deob(D.def.v.p2.word) } },
    pw: D.def.pw, gas: '', cls: '', sound: true
  };
  let S = merge(DEF, load('set', {}));
  let ALL = load('game', {});
  let G, P;
  const fresh = () => ({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), team: '', t0: 0, extra: 0, hints: 5, ticket: 0,
    note: false, warned: 0, screen: 'start', pi: 0, ei: 0, cur: -1, show: null, L: [0, 0, 0, 0], stamps: [0, 0, 0, 0],
    rot: [0, 0, 0, 0], meta: false, end: 0, wrong: {}, hl: {}, used: 0, lt: [0, 0, 0, 0], ls: 0, reply: ''
  });
  function sync() { P = D.parts[S.part]; G = ALL[S.part] || (ALL[S.part] = fresh()); }
  const persist = () => save('game', ALL);
  const gasUrl = () => (S.gas || CFG.gasUrl || '').trim();
  const clsName = () => (S.cls || CFG.className || '').trim();
  const wordChanged = () => S.v[S.part].word.toUpperCase() !== deob(D.def.v[S.part].word);
  const ok = (ans, v) => [].concat(ans).indexOf(HX.hash(v)) >= 0;

  /* ---------------- DOM 도우미 ---------------- */
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => add(e, x));
    else e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  function h(tag, a, ...kids) {
    const e = document.createElement(tag);
    for (const k in a || {}) {
      const v = a[k];
      if (k === 'on') for (const ev in v) e.addEventListener(ev, v[ev]);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'cls') e.className = v;
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    add(e, kids);
    return e;
  }
  function sv(tag, a, kids) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in a || {}) if (a[k] != null) e.setAttribute(k, a[k]);
    (kids || []).forEach((c) => { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function pic(name, cls, alt) {
    const i = h('img', { src: 'img/' + name + '.png', cls: cls || '', alt: alt || '', draggable: 'false' });
    i.onerror = () => i.remove();
    return i;
  }
  function svimg(name, x, y, w, hh, op) {
    const i = sv('image', { href: 'img/' + name + '.png', x, y, width: w, height: hh, preserveAspectRatio: 'xMidYMid slice', opacity: op });
    i.addEventListener('error', () => i.remove());
    return i;
  }
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const btn = (label, fn, cls) => h('button', { type: 'button', cls: 'btn ' + (cls || ''), on: { click: fn } }, label);
  const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------------- 소리 ---------------- */
  let AC = null;
  function ac() {
    if (!S.sound) return null;
    try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; }
  }
  function tone(f, t, d, type, v) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), s = a.currentTime + t;
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(v || 0.12, s); g.gain.exponentialRampToValueAtTime(0.001, s + d);
    o.connect(g); g.connect(a.destination); o.start(s); o.stop(s + d + 0.02);
  }
  const sfx = {
    click: () => tone(520, 0, 0.05, 'triangle', 0.06),
    ok: () => { tone(523, 0, 0.15, 'triangle'); tone(659, 0.12, 0.15, 'triangle'); tone(784, 0.24, 0.32, 'triangle'); },
    bad: () => { tone(196, 0, 0.18, 'sine', 0.1); tone(174, 0.12, 0.25, 'sine', 0.1); },
    open: () => { tone(880, 0, 0.06, 'square', 0.05); tone(1320, 0.07, 0.14, 'square', 0.05); },
    thud: () => {
      const a = ac(); if (!a) return;
      const n = Math.floor(a.sampleRate * 0.12), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
      const src = a.createBufferSource(), g = a.createGain(); src.buffer = buf; g.gain.value = 0.5;
      src.connect(g); g.connect(a.destination); src.start();
      tone(70, 0, 0.28, 'sine', 0.5);
    }
  };

  /* ---------------- 창, 알림 ---------------- */
  function closeModal() { const m = $('#modal'); if (m) m.remove(); }
  function modal(title, body, btns, cls) {
    closeModal();
    const box = h('div', { cls: 'mbox ' + (cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '알림' },
      title && h('h2', null, title), h('div', { cls: 'mbody' }, body),
      h('div', { cls: 'mbtns' }, (btns || [['닫기', closeModal]]).map((b) => btn(b[0], b[1], b[2]))));
    document.body.appendChild(h('div', { id: 'modal', cls: 'overlay' }, box));
    const f = box.querySelector('input,select,textarea') || box.querySelector('.mbtns button');
    if (f) f.focus();
    return box;
  }
  let toastT = 0;
  function toast(msg) {
    let t = $('#toast'); if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'on'; clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 3200);
  }
  function typeInto(el, text) {
    if (REDUCED) { el.textContent = text; return; }
    let i = 0; el.textContent = '';
    const id = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(id); }, 28);
    el.addEventListener('click', () => { clearInterval(id); el.textContent = text; }, { once: true });
  }

  /* ---------------- 시간 · 상단 띠 ---------------- */
  const elapsed = () => (G.t0 ? (G.end || Date.now()) - G.t0 : 0);
  const remain = () => P.minutes * 60000 + G.extra - elapsed();
  const grade = () => (G.hints >= 5 ? ['gold', '금'] : G.hints >= 3 ? ['silver', '은'] : ['bronze', '동']);
  let topEl = {};
  function drawTop() {
    const top = $('#top'); top.innerHTML = '';
    topEl.time = h('span', { cls: 't-time', 'aria-label': '남은 시간' }, '40:00');
    topEl.hint = h('span', { cls: 't-hint', 'aria-label': '남은 힌트 우표' });
    topEl.team = h('span', { cls: 't-team' });
    topEl.snd = h('button', { type: 'button', cls: 't-snd', 'aria-label': '소리 켜고 끄기', on: { click: () => { S.sound = !S.sound; save('set', S); tickTop(); if (S.sound) sfx.click(); } } });
    let taps = [];
    const secret = h('div', { cls: 't-secret', 'aria-hidden': 'true', on: { click: () => { const n = Date.now(); taps = taps.filter((t) => n - t < 3000); taps.push(n); if (taps.length >= 5) { taps = []; askPw(); } } } });
    add(top, [h('span', { cls: 't-title' }, D.title, h('small', null, ' ' + P.no)), topEl.team, topEl.time, topEl.hint, topEl.snd, secret]);
    tickTop();
  }
  function tickTop() {
    if (!topEl.time) return;
    const r = remain();
    topEl.team.textContent = G.team || '';
    topEl.time.textContent = G.t0 ? (r >= 0 ? '⏳ ' + fmt(r) : '⏳ +' + fmt(-r)) : '⏳ ' + P.minutes + ':00';
    topEl.time.classList.toggle('late', G.t0 && r < 5 * 60000);
    topEl.hint.innerHTML = '';
    add(topEl.hint, [pic('hint_stamp', 't-stamp'), '우표 ' + G.hints + (G.ticket ? ' +무료 ' + G.ticket : '')]);
    topEl.snd.textContent = S.sound ? '🔔' : '🔕';
  }
  function tick() {
    tickTop();
    if (!G.t0 || G.end || ['start', 'ending'].includes(G.screen) || $('#modal')) return;
    const e = elapsed(), r = remain();
    if (!G.note && e >= 22 * 60000) {
      G.note = true; G.ticket += 1; persist(); sfx.open();
      modal('복동의 쪽지', h('div', null, pic(P.bokdong, 'note-face'), h('p', null, '벌써 시간이 꽤 흘렀소. 막힌 곳이 있으면 망설이지 말고 물으시오. 두 번째 귀띔을 한 번은 우표 없이 드리리다.'), h('p', { cls: 'dim' }, '두 번째 귀띔 무료권 1장을 받았습니다.')), [['고맙소', () => { closeModal(); tickTop(); }]]);
    } else if (G.warned < 1 && r < 5 * 60000 && r > 0) { G.warned = 1; persist(); toast('복동: 5분 남았소. 서두릅시다!'); }
    else if (G.warned < 2 && r <= 0) { G.warned = 2; persist(); toast('복동: 약속한 시간이 다 되었소. 그래도 끝까지 배달합시다!'); }
  }

  /* ---------------- 화면 전환 ---------------- */
  const app = () => $('#app');
  function setBg(name) {
    const b = $('#bg'); if (b.dataset.n === name) return; b.dataset.n = name || ''; b.innerHTML = '';
    if (name) b.appendChild(pic(name, 'bgimg'));
  }
  function go(sc, cur) {
    const now = Date.now();
    if (G.screen === 'letter' && G.cur >= 0 && G.ls) G.lt[G.cur] += now - G.ls;
    G.screen = sc; if (cur != null) G.cur = cur; G.ls = sc === 'letter' ? now : 0;
    persist(); render(); window.scrollTo(0, 0);
  }
  function render() {
    closeModal(); sync();
    const a = app(); a.innerHTML = ''; a.className = 'sc-' + G.screen + ' ' + S.part;
    ({ start: vStart, prologue: vPrologue, gate: vGate, hub: vHub, letter: vLetter, meta: vMeta, final: vFinal, ending: vEnding }[G.screen] || vStart)(a);
    tickTop();
  }

  /* ---------------- 시작 · 프롤로그 · 관문 ---------------- */
  function vStart(a) {
    setBg(P.hubBg);
    const inp = h('input', { type: 'text', cls: 'ans', maxlength: '12', placeholder: '예: 3모둠', 'aria-label': '모둠 이름', autocomplete: 'off' });
    const start = (e) => {
      e.preventDefault(); const v = inp.value.trim();
      if (!v) { inp.focus(); toast('모둠 이름을 먼저 쓰시오.'); return; }
      G.team = v; G.t0 = Date.now(); sfx.open(); go('prologue');
    };
    add(a, h('section', { cls: 'card title-card' },
      pic('bag_locked', 'title-bag'),
      h('p', { cls: 'kicker' }, P.no + ' · ' + P.years + (clsName() ? ' · ' + clsName() : '')),
      h('h1', null, D.title), h('p', { cls: 'sub' }, P.name),
      h('div', { cls: 'roles' }, D.roles.map((r) => h('div', { cls: 'role pair-' + (r.pair === '가' ? 'a' : 'b') }, pic(r.img, 'role-img'), h('b', null, r.name), h('small', null, r.pair + '짝 · ' + r.does)))),
      h('form', { cls: 'row', on: { submit: start } }, inp, h('button', { cls: 'btn big', type: 'submit' }, '배달 시작')),
      h('p', { cls: 'dim' }, '시작을 누르면 ' + P.minutes + '분 타이머가 움직입니다. 진행 상황은 이 기기에 저장됩니다.')));
  }
  function vPrologue(a) {
    const pages = P.prologue, pg = pages[Math.min(G.pi, pages.length - 1)];
    setBg(pg.bg);
    const txt = h('p', { cls: 'say' });
    const card = h('section', { cls: 'card dialog' },
      h('div', { cls: 'stage' }, pg.char && pic(pg.char, 'char'), pg.prop && pic(pg.prop, 'prop')),
      pg.pre && h('p', { cls: 'narr' }, pg.pre),
      pg.mission ? [h('h2', null, '미션'), h('p', { cls: 'mission' }, pg.mission), h('h3', null, '규칙'), h('ul', { cls: 'rules' }, pg.rules.map((r) => h('li', null, r)))]
        : [pg.who && h('b', { cls: 'who' }, pg.who), txt],
      h('div', { cls: 'nav' },
        G.pi > 0 ? btn('이전', () => { G.pi--; persist(); render(); }, 'ghost') : h('span'),
        h('span', { cls: 'dim' }, (G.pi + 1) + ' / ' + pages.length),
        btn(G.pi < pages.length - 1 ? '다음' : '가방 앞으로', () => { sfx.click(); if (G.pi < pages.length - 1) { G.pi++; persist(); render(); } else go('gate'); })));
    add(a, card);
    if (!pg.mission) typeInto(txt, pg.text);
  }
  function dialUI(n, chars, cb, label) {
    const vals = Array(n).fill(0), cells = [];
    const wrap = h('div', { cls: 'dial' + (n > 4 ? ' wide' : '') });
    for (let i = 0; i < n; i++) {
      const cell = h('span', { cls: 'dval', 'aria-live': 'polite' }, chars[0]); cells.push(cell);
      const mv = (d) => () => { vals[i] = (vals[i] + d + chars.length) % chars.length; cell.textContent = chars[vals[i]]; sfx.click(); };
      wrap.appendChild(h('div', { cls: 'dcol' }, h('button', { type: 'button', cls: 'dbtn', 'aria-label': (i + 1) + '번째 칸 올리기', on: { click: mv(1) } }, '▲'), cell,
        h('button', { type: 'button', cls: 'dbtn', 'aria-label': (i + 1) + '번째 칸 내리기', on: { click: mv(-1) } }, '▼')));
    }
    return h('div', { cls: 'dialwrap' }, wrap, btn(label || '자물쇠 열기', () => cb(vals.map((v) => chars[v]).join(''))));
  }
  function vGate(a) {
    setBg(P.hubBg);
    const g = P.gate, fb = h('div', { cls: 'fb', 'aria-live': 'polite' });
    if (G.gate) {
      add(a, h('section', { cls: 'card center' }, pic('bag_open', 'bigprop'), h('div', { cls: 'okbox' }, g.ok), btn('편지 꺼내기', () => go('hub'), 'big')));
      return;
    }
    add(a, h('section', { cls: 'card center' },
      h('span', { cls: 'tag web' }, '웹 자물쇠'), h('h2', null, '관문: 우편가방의 자물쇠'), pic('bag_locked', 'bigprop'),
      h('p', { cls: 'clue' }, g.clue),
      dialUI(4, '0123456789', (v) => {
        if (ok(g.ans, v)) { G.gate = true; persist(); sfx.open(); sfx.ok(); render(); }
        else { miss('gate', fb, g.bad); }
      }), fb,
      btn('복동에게 묻기 (무료)', () => modal('복동의 귀띔', h('p', null, g.hint)), 'ghost')));
  }
  function miss(key, fb, text) {
    G.wrong[key] = (G.wrong[key] || 0) + 1; persist(); sfx.bad();
    fb.className = 'fb bad'; fb.textContent = '';
    add(fb, [h('b', null, '복동: '), text || "아직 아니오. 편지와 사료를 다시 살펴보시오.", G.wrong[key] >= 3 ? " 막히면 '복동에게 묻기'를 눌러 보시오." : '']);
    if (!REDUCED) { fb.classList.remove('shake'); void fb.offsetWidth; fb.classList.add('shake'); }
  }

  /* ---------------- 허브 ---------------- */
  function vHub(a) {
    setBg(P.hubBg);
    const got = G.stamps.reduce((x, y) => x + y, 0);
    add(a, h('section', { cls: 'card bokline' }, pic(P.bokdong, 'face'), h('p', null, h('b', null, '복동 '), got === 4 ? '도장 네 개가 다 모였소! 이제 겹쳐 찍어 봅시다.' : P.hubLine)));
    add(a, h('div', { cls: 'envs' }, P.letters.map((L, i) => {
      const n = G.L[i], done = n >= 3, st = done ? '배달 완료' : n > 0 ? '읽는 중 ' + n + '/3' : '봉인됨';
      return h('button', { type: 'button', cls: 'env ' + (done ? 'done' : n ? 'open' : 'sealed') + ' pair-' + (L.pair === '가' ? 'a' : 'b'), on: { click: () => { sfx.click(); go('letter', i); } } },
        h('span', { cls: 'env-pic' }, pic(n ? 'envelope_open' : 'envelope_sealed', ''), done && h('span', { cls: 'mini-stamp' }, NUM[i])),
        h('span', { cls: 'env-t' }, h('b', null, '편지 ' + NUM[i] + ' ' + L.title), h('small', null, L.years + ' · ' + L.from)),
        h('span', { cls: 'env-pair' }, L.pairNote), h('span', { cls: 'env-st' }, st),
        done && h('span', { cls: 'env-code' }, '배달 확인 암호: ' + deob(L.codeShow)));
    })));
    add(a, h('section', { cls: 'card' }, h('h3', null, '배달 연표 · ' + P.years),
      h('ol', { cls: 'tl' }, P.letters.map((L, i) => h('li', { cls: G.L[i] >= 3 ? 'lit' : '' }, h('span', { cls: 'tl-y' }, L.years), h('span', { cls: 'tl-n' }, G.L[i] >= 3 ? L.title : '？？？')))),
      h('p', { cls: 'dim' }, '편지를 배달할 때마다 연표가 채워집니다. 다른 짝 기기에 도장을 불러올 때는 위의 배달 확인 암호를 알려 주세요.')));
    add(a, btn('도장 겹쳐 찍기 (' + got + '/4)', () => go('meta'), 'big wide' + (got === 4 ? ' glow' : ' ghost')));
  }

  /* ---------------- 편지 ---------------- */
  function vLetter(a) {
    const i = G.cur, L = P.letters[i], n = G.L[i], key = S.part + ':' + (i + 1) + ':';
    setBg(L.bg);
    add(a, btn('← 우편가방으로', () => go('hub'), 'ghost small'));
    add(a, h('section', { cls: 'card lhead' }, pic(L.face, 'face'),
      h('div', null, h('p', { cls: 'kicker' }, L.years + ' · ' + L.pairNote), h('h2', null, '편지 ' + NUM[i] + ' ' + L.title), h('p', { cls: 'dim' }, '보낸 이: ' + L.from)),
      h('ol', { cls: 'steps', 'aria-label': '단계' }, [0, 1, 2].map((k) => h('li', { cls: k < n ? 'done' : k === n ? 'now' : '' }, k < n ? '✓' : String(k + 1))))));
    add(a, h('details', { cls: 'letter', open: n === 0 && G.show == null }, h('summary', null, '편지 본문 펼치기 / 접기'),
      h('div', { cls: 'paper' }, L.body.map((p) => typeof p === 'string' ? h('p', null, p) : p.c ? h('p', { cls: 'cipherline' }, p.c) : h('p', { cls: 'sign' }, '— ' + p.sign)))));
    if (G.show != null) {
      const st = L.steps[G.show], last = G.L[i] >= 3;
      add(a, h('section', { cls: 'card okcard' }, h('div', { cls: 'okbox' }, h('b', null, '복동: '), st.okAlt && wordChanged() ? st.okAlt : st.ok,
        st.okMore && h('p', { cls: 'okmore' }, deob(st.okMore))),
        st.order && h('div', { cls: 'orderbox' }, st.order),
        btn(last ? '배달 도장 받기' : '다음 단계', () => {
          G.show = null;
          if (last) { G.stamps[i] = 1; persist(); go('hub'); stampModal(i); } else { persist(); render(); window.scrollTo(0, 0); }
        }, 'big')));
      return;
    }
    if (n >= 3) { add(a, h('section', { cls: 'card center' }, h('div', { cls: 'okbox' }, '이 편지는 배달을 마쳤소. 배달 확인 암호: ' + deob(L.codeShow)))); return; }
    const st = L.steps[n], k = key + (n + 1), fb = h('div', { cls: 'fb', 'aria-live': 'polite' });
    const done = () => { G.L[i] = n + 1; G.show = n; persist(); sfx.ok(); render(); window.scrollTo(0, 0); };
    const tag = { web: ['web', '웹'], real: ['real', '교실 실물'], mix: ['real', '교실 실물 → 웹'] }[st.w];
    add(a, h('section', { cls: 'card step ' + tag[0] },
      h('div', { cls: 'step-h' }, h('span', { cls: 'tag ' + tag[0] }, tag[1]), h('h3', null, (n + 1) + '단계 · ' + st.title), st.tool && h('small', null, '쓰는 도구: ' + st.tool)),
      st.quote && h('blockquote', { cls: 'quote', html: st.quote }),
      st.q && h('p', { cls: 'q' }, st.q),
      R[st.t](st, done, (t) => miss(k, fb, t || st.bad)), fb,
      btn('복동에게 묻기', () => hintModal(k, st), 'ghost')));
  }
  function stampModal(i) {
    sfx.thud();
    const L = P.letters[i];
    modal('편지 ' + NUM[i] + ' 배달 완료!', h('div', { cls: 'center' }, h('div', { cls: 'stampin' }, stampSvg(i, null, 0)),
      h('p', null, '배달 도장 ' + NUM[i] + '을 받았소.'), h('p', { cls: 'dim' }, '배달 확인 암호: ' + deob(L.codeShow) + ' (다른 기기에 이 도장을 불러올 때 씁니다)')), [['우편가방으로', closeModal]]);
  }
  function hintModal(k, st) {
    const lv = G.hl[k] || 0, body = h('div');
    const draw = () => {
      body.innerHTML = '';
      add(body, [h('p', null, h('b', null, '첫 번째 귀띔 '), st.hints[0]),
        (G.hl[k] || 0) >= 2 ? h('p', null, h('b', null, '두 번째 귀띔 '), st.hints[1])
          : btn(G.ticket ? '두 번째 귀띔 보기 (무료권 사용)' : '두 번째 귀띔 보기 (우표 1장)', () => {
            if (G.ticket) G.ticket--; else if (G.hints > 0) G.hints--; else { toast('힌트 우표가 다 떨어졌소.'); return; }
            G.hl[k] = 2; G.used++; persist(); tickTop(); draw();
          }, 'ghost')]);
    };
    if (lv < 1) { G.hl[k] = 1; persist(); }
    draw(); modal('복동의 귀띔', body);
  }

  /* ---------------- 퍼즐 유형 ---------------- */
  const R = {};
  function uvBox(text) {
    const t = h('p', { cls: 'uvt' }, text);
    return h('div', { cls: 'uv' }, h('small', null, '가상 모드: 편지 맨 아래 빈칸'), t, btn('UV 펜 비추기', (e) => { t.classList.toggle('on'); e.target.textContent = t.classList.contains('on') ? 'UV 펜 끄기' : 'UV 펜 비추기'; }, 'uvbtn'));
  }
  R.input = (st, done, bad) => {
    const inp = h('input', { type: 'text', cls: 'ans', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': '정답', placeholder: st.ph || '정답을 쓰시오' });
    return h('div', null, st.uv && S.virtual && uvBox(deob(st.uv)),
      h('form', { cls: 'row', on: { submit: (e) => { e.preventDefault(); if (!inp.value.trim()) return; ok(st.ans, inp.value) ? done() : bad(); } } }, inp, h('button', { cls: 'btn', type: 'submit' }, '확인')));
  };
  R.dial = (st, done, bad) => dialUI(st.n, '0123456789', (v) => (ok(st.ans, v) ? done() : bad()));
  R.match = (st, done, bad) => {
    const sel = st.items.map(() => '');
    return h('div', null, st.items.map((t, i) => {
      const bs = st.opts.map((o) => h('button', { type: 'button', cls: 'chip', 'aria-pressed': 'false', on: { click: (e) => { sel[i] = o[0]; bs.forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); sfx.click(); } } }, o[1]));
      return h('div', { cls: 'mrow' }, h('p', null, t), h('div', { cls: 'chips' }, bs));
    }), btn('확인', () => { if (sel.some((x) => !x)) { toast('세 고민 모두 골라 주시오.'); return; } ok(st.ans, sel.join('')) ? done() : bad(); }));
  };
  R.order = (st, done, bad) => {
    let line = []; const cards = shuffle(st.cards), pool = h('div', { cls: 'pool' }), out = h('ol', { cls: 'line' });
    const draw = () => {
      pool.innerHTML = ''; out.innerHTML = '';
      cards.forEach((c) => { if (!line.includes(c)) pool.appendChild(h('button', { type: 'button', cls: 'pcard', on: { click: () => { line.push(c); sfx.click(); draw(); } } }, c[1])); });
      line.forEach((c) => out.appendChild(h('li', null, c[1])));
      if (!line.length) out.appendChild(h('li', { cls: 'dim empty' }, '카드를 누른 순서대로 여기에 놓입니다.'));
    };
    draw();
    return h('div', null, pool, out, h('div', { cls: 'row' }, btn('다시', () => { line = []; draw(); }, 'ghost'),
      btn('확인', () => { if (line.length < cards.length) { toast('카드를 모두 놓으시오.'); return; } ok(st.ans, line.map((c) => c[0]).join('')) ? done() : bad(); })));
  };
  R.sort = (st, done, bad) => {
    const where = {}; let pickd = null; const cards = shuffle(st.cards), pool = h('div', { cls: 'pool' });
    const bask = st.baskets.map((name, b) => h('button', { type: 'button', cls: 'basket b' + b, on: { click: (e) => { if (e.target.closest('.pcard')) return; if (!pickd) { toast('먼저 카드를 누르시오.'); return; } where[pickd] = b; pickd = null; sfx.click(); draw(); } } }));
    const draw = () => {
      pool.innerHTML = ''; bask.forEach((el, b) => { el.innerHTML = ''; el.appendChild(h('b', null, st.baskets[b])); });
      cards.forEach((c) => {
        const el = h('span', { cls: 'pcard' + (pickd === c[0] ? ' sel' : ''), role: 'button', tabindex: '0', on: { click: () => { if (where[c[0]] != null) { delete where[c[0]]; pickd = c[0]; } else pickd = pickd === c[0] ? null : c[0]; sfx.click(); draw(); }, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } } } }, c[1]);
        (where[c[0]] != null ? bask[where[c[0]]] : pool).appendChild(el);
      });
      if (!pool.children.length) pool.appendChild(h('span', { cls: 'dim' }, '모두 담았소. 바구니 속 카드를 누르면 다시 꺼냅니다.'));
    };
    draw();
    return h('div', null, pool, h('div', { cls: 'baskets' }, bask),
      btn('확인', () => { if (st.cards.some((c) => where[c[0]] == null)) { toast('카드를 모두 바구니에 넣으시오.'); return; } ok(st.ans, st.cards.map((c) => where[c[0]]).join('')) ? done() : bad(); }));
  };
  R.pick = (st, done, bad) => {
    const sel = new Set(), cards = shuffle(st.cards), cnt = h('span', { cls: 'dim' }, '0 / ' + st.n);
    return h('div', null, h('div', { cls: 'pool grid' }, cards.map((c) => h('button', { type: 'button', cls: 'pcard', 'aria-pressed': 'false', on: { click: (e) => {
      if (sel.has(c[0])) sel.delete(c[0]); else if (sel.size < st.n) sel.add(c[0]); else { toast(st.n + '장만 고를 수 있소.'); return; }
      e.currentTarget.setAttribute('aria-pressed', sel.has(c[0]) ? 'true' : 'false'); cnt.textContent = sel.size + ' / ' + st.n; sfx.click();
    } } }, c[1]))), h('div', { cls: 'row' }, cnt, btn('확인', () => { if (sel.size < st.n) { toast(st.n + '장을 고르시오.'); return; } ok(st.ans, Array.from(sel).sort().join('')) ? done() : bad(); })));
  };
  R.ana = (st, done, bad) => {
    const t = sv('text', { x: 200, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 46, 'font-weight': 700, class: 'anatext' }, [st.text]);
    const g = sv('g', { transform: 'translate(0,70) scale(1,7)' }, [t]);
    const svg = sv('svg', { viewBox: '0 0 400 140', class: 'ana', role: 'img', 'aria-label': '세로로 늘어난 글자' }, [g]);
    const sl = h('input', { type: 'range', min: '0', max: '100', value: '0', 'aria-label': '보는 각도', on: { input: () => { g.setAttribute('transform', 'translate(0,70) scale(1,' + (7 - 6 * sl.value / 100).toFixed(2) + ')'); } } });
    return h('div', null, svg, h('label', { cls: 'slider' }, '보는 각도 ', sl), R.input(st, done, bad));
  };
  R.cipher = (st, done, bad) => {
    const text = st.text.split(''), slots = text.map(() => ''); let k = 0, selJ = -1;
    const ORD = ['첫째', '둘째', '셋째', '넷째'];
    const C = 170, svg = sv('svg', { viewBox: '0 0 340 340', class: 'wheel', role: 'img', 'aria-label': '자모 암호 원판' });
    const info = h('p', { cls: 'cinfo', 'aria-live': 'polite' }, '암호 글자를 누르면 원판에서 짝을 알려 주오.');
    const slotRow = h('div', { cls: 'slots' }), inp = h('input', { type: 'text', cls: 'ans', placeholder: '모아 쓴 낱말(써도 되고 안 써도 되오)', 'aria-label': '모아 쓴 낱말', autocomplete: 'off' });
    const pos = (i, r) => { const an = (i * 15 - 90) * Math.PI / 180; return [C + r * Math.cos(an), C + r * Math.sin(an)]; };
    const drawWheel = () => {
      svg.innerHTML = '';
      const hi = selJ >= 0 ? JAMO.indexOf(text[selJ]) : -1;
      add(svg, [svimg('cipher_ring', 0, 0, 340, 340, 0.35), sv('circle', { cx: C, cy: C, r: 164, class: 'w-out' }), sv('circle', { cx: C, cy: C, r: 127, class: 'w-in' }), sv('circle', { cx: C, cy: C, r: 88, class: 'w-core' })]);
      for (let i = 0; i < 24; i++) {
        const [x1, y1] = pos(i - 0.5, 127), [x2, y2] = pos(i - 0.5, 164); svg.appendChild(sv('line', { x1, y1, x2, y2, class: 'w-tick' }));
        const [ox, oy] = pos(i, 146), [ix, iy] = pos(i, 107);
        if (i === hi) { svg.appendChild(sv('circle', { cx: ox, cy: oy, r: 16, class: 'w-hi' })); svg.appendChild(sv('circle', { cx: ix, cy: iy, r: 15, class: 'w-hi2' })); }
        const o = sv('text', { x: ox, y: oy, class: 'w-o' }, [JAMO[i]]);
        svg.appendChild(o); svg.appendChild(sv('text', { x: ix, y: iy, class: 'w-i' }, [JAMO[((i - k) % 24 + 24) % 24]]));
      }
      add(svg, [sv('text', { x: C, y: C - 8, class: 'w-k' }, [k + '칸']), sv('text', { x: C, y: C + 22, class: 'w-ks' }, ['안쪽 원판'])]);
    };
    const drawSlots = () => { slotRow.innerHTML = ''; slots.forEach((s) => slotRow.appendChild(h('span', { cls: 'slot' + (s ? ' f' : '') }, s || '·'))); };
    const row = h('div', { cls: 'crow' }, text.map((ch, j) => h('button', { type: 'button', cls: 'cbtn', on: { click: () => {
      selJ = j; const inner = JAMO[((JAMO.indexOf(ch) - k) % 24 + 24) % 24]; slots[j] = inner;
      info.textContent = (j + 1) + '번째 글자 · 지금 ' + k + '칸: 바깥 ' + ch + ' → 안쪽 ' + inner; sfx.click();
      Array.from(row.children).forEach((b, x) => b.classList.toggle('sel', x === j)); drawWheel(); drawSlots();
    } } }, h('b', null, ch), st.multi && h('small', null, ORD[j % 4] + ' 숫자'))));
    const turn = (d) => () => { k = ((k + d) % 24 + 24) % 24; sfx.click(); drawWheel(); };
    drawWheel(); drawSlots();
    return h('div', { cls: 'cipher' }, h('p', { cls: 'dim' }, '암호문'), row, svg,
      h('div', { cls: 'row center' }, btn('◀ 한 칸', turn(-1), 'ghost'), btn('한 칸 ▶', turn(1), 'ghost')), info,
      h('p', { cls: 'dim' }, '받아 적은 자모'), slotRow,
      h('form', { cls: 'row', on: { submit: (e) => { e.preventDefault(); const v = inp.value.trim() || slots.join(''); if (!v) return; ok(st.ans, v) ? done() : bad(); } } }, inp, h('button', { cls: 'btn', type: 'submit' }, '확인')));
  };
  function dirLock(target, done, bad) {
    let seq = ''; const show = h('div', { cls: 'dirshow', 'aria-live': 'polite' }, '…');
    const push = (c) => () => { if (seq.length < 12) seq += c; show.textContent = seq.split('').map((x) => ARW[x]).join(' ') || '…'; sfx.click(); };
    const b = (c) => h('button', { type: 'button', cls: 'dbtn arrow', 'aria-label': ARW[c], on: { click: push(c) } }, ARW[c]);
    return h('div', { cls: 'dirlock' }, show, h('div', { cls: 'cross' }, h('span'), b('U'), h('span'), b('L'), h('span', { cls: 'hub' }), b('R'), h('span'), b('D'), h('span')),
      h('div', { cls: 'row center' }, btn('지우기(초기화)', () => { seq = ''; show.textContent = '…'; }, 'ghost'), btn('열기', () => (seq === target ? done() : bad('방향이 맞지 않소. 지우고 처음부터 다시 넣으시오.')))));
  }
  R.real = (st, done, bad) => {
    const kids = [h('ol', { cls: 'todo' }, st.todo.map((t) => h('li', null, t)))];
    if (S.virtual && st.lock === 'dir') kids.push(h('p', { cls: 'vnote' }, '가상 자물쇠 모드: 화살표를 순서대로 누르시오.'), dirLock(S.v[S.part].dir, done, bad));
    else if (S.virtual && st.lock === 'word') {
      const word = S.v[S.part].word.toUpperCase(), cs = deob(st.cards).split('|');
      const chips = shuffle(cs.map((c, i) => [c, word[i] || '?'])).map((c) => h('span', { cls: 'pcard uvcard' }, c[0], h('b', { cls: 'uvt' }, c[1])));
      const box = h('div', { cls: 'pool' }, chips);
      kids.push(h('p', { cls: 'vnote' }, '가상 자물쇠 모드: 카드를 순서대로 읽고, UV 글자 다섯 개로 자물쇠를 여시오.'), box,
        btn('UV 펜 비추기', () => box.classList.toggle('uvon'), 'uvbtn'),
        dialUI(5, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', (v) => (v === word ? done() : bad('글자가 맞지 않소. 카드 순서를 다시 확인하시오.'))));
    } else kids.push(btn(st.btn, () => { sfx.open(); done(); }, 'big real'));
    return h('div', null, kids);
  };

  /* ---------------- 레이어드 스탬프 ---------------- */
  const stampAns = (i) => { for (let p = 0; p < 4; p++) if (HX.hash(S.part + 'm' + i + ':' + p) === P.meta.stamps[i].ans) return (4 - p) % 4; return 0; };
  function stampSvg(i, opts, rot) {
    const svg = sv('svg', { viewBox: '0 0 160 160', class: 'stamp' });
    add(svg, [svimg('stamp_ring', 0, 0, 160, 160, 0.9), sv('circle', { cx: 80, cy: 80, r: 74, class: 's-ring' }), sv('circle', { cx: 80, cy: 80, r: 67, class: 's-ring thin' }),
      sv('text', { x: 80, y: 82, class: 's-num' }, [NUM[i]])]);
    if (opts) svg.appendChild(sv('defs', null, [sv('path', { id: 'arc' + i, d: 'M 33.2 53 A 54 54 0 0 1 126.8 53' })]));
    (opts || []).forEach((w, p) => svg.appendChild(sv('text', { class: 's-word' + (w.length > 7 ? ' long' : ''), transform: 'rotate(' + p * 90 + ' 80 80)' },
      [sv('textPath', { href: '#arc' + i, startOffset: '50%' }, [w])])));
    svg.style.transform = 'rotate(' + (rot || 0) * 90 + 'deg)';
    return svg;
  }
  function clips(svg, W, H) {
    const defs = sv('defs');
    for (let i = 0; i < 4; i++) { const cp = sv('clipPath', { id: 'lay' + i }); for (let y = i * 3.5; y < H; y += 14) cp.appendChild(sv('rect', { x: 0, y, width: W, height: 3.6 })); defs.appendChild(cp); }
    svg.appendChild(defs);
  }
  function mapBase(svg, big) {
    add(svg, [svimg('map_paper', 0, 0, 400, 300, 1),
      sv('path', { d: 'M132 52 L250 40 L318 82 L336 170 L292 246 L182 258 L122 212 L110 112 Z', class: 'm-wall' }),
      sv('path', { d: 'M118 140 L332 140 M190 82 L190 140 M215 140 L215 246 M95 132 L122 138', class: 'm-road' }),
      sv('text', { x: 268, y: 276, class: 'm-cap' }, ['한성 약도'])]);
    add(svg, [sv('rect', { x: 284, y: 151, width: 16, height: 11, class: 'm-po' }), sv('path', { d: 'M284 151 L292 158 L300 151', class: 'm-po2' }), sv('text', { x: 292, y: 176, class: 'm-lab po' }, ['한성 우체사'])]);
    D.places.forEach((pl) => add(svg, [sv('circle', { cx: pl.x, cy: pl.y, r: big ? 5 : 4.5, class: 'm-dot' }), sv('text', { x: pl.x, y: pl.y - 9, class: 'm-lab' }, [pl.name])]));
  }
  function metaPic(solved) {
    const diff = [0, 1, 2, 3].map((i) => (G.stamps[i] ? (G.rot[i] - stampAns(i) + 4) % 4 : -1));
    let svg;
    if (P.meta.kind === 'number') {
      svg = sv('svg', { viewBox: '0 0 300 200', class: 'metapic' + (solved ? ' solved' : '') });
      clips(svg, 300, 200);
      add(svg, [sv('rect', { x: 1, y: 1, width: 298, height: 198, rx: 6, class: 'mp-paper' }), svimg('postcard_blank', 0, 0, 300, 200, 1)]);
      diff.forEach((d, i) => {
        if (d < 0) return;
        const num = S.box1.split('').map((c, p) => (d ? (Number(c) + d * 2 + (p % 2) + 1) % 10 : c)).join('');
        svg.appendChild(sv('g', { 'clip-path': 'url(#lay' + i + ')' }, [sv('text', { x: 150, y: 104, class: 'mp-num' }, [num])]));
      });
    } else {
      svg = sv('svg', { viewBox: '0 0 400 300', class: 'metapic' + (solved ? ' solved' : '') });
      clips(svg, 400, 300); svg.appendChild(sv('rect', { x: 1, y: 1, width: 398, height: 298, rx: 6, class: 'mp-paper' })); mapBase(svg);
      const idx = Math.max(0, D.places.findIndex((p) => p.name === S.place));
      diff.forEach((d, i) => {
        if (d < 0) return;
        const pl = D.places[(idx + d) % D.places.length];
        svg.appendChild(sv('g', { 'clip-path': 'url(#lay' + i + ')' }, [
          sv('path', { d: 'M292 156 L' + pl.x + ' 156 L' + pl.x + ' ' + pl.y, class: 'mp-route' }),
          sv('path', { d: 'M' + (pl.x - 12) + ' ' + (pl.y - 12) + ' l24 24 m0 -24 l-24 24', class: 'mp-x' })]));
      });
    }
    svg.appendChild(sv('rect', { x: 2, y: 2, width: P.meta.kind === 'number' ? 296 : 396, height: P.meta.kind === 'number' ? 196 : 296, rx: 6, class: 'mp-edge' }));
    return svg;
  }
  function vMeta(a) {
    setBg(P.hubBg);
    const M = P.meta, picBox = h('div', { cls: 'picbox' }), doneBox = h('div');
    const solved = () => [0, 1, 2, 3].every((i) => G.stamps[i] && G.rot[i] === stampAns(i));
    const refresh = (first) => {
      const s = solved(); picBox.innerHTML = ''; picBox.appendChild(metaPic(s)); doneBox.innerHTML = '';
      if (s) {
        if (!G.meta) { G.meta = true; persist(); if (!first) { sfx.thud(); sfx.ok(); } }
        add(doneBox, [h('div', { cls: 'okbox' }, h('b', null, '복동: '), M.done), btn('나무상자 앞으로', () => go('final'), 'big glow')]);
      }
    };
    add(a, btn('← 우편가방으로', () => go('hub'), 'ghost small'));
    add(a, h('section', { cls: 'card' }, h('span', { cls: 'tag web' }, '웹'), h('h2', null, M.title), h('p', null, M.intro), picBox, doneBox));
    add(a, h('div', { cls: 'stamps' }, M.stamps.map((st, i) => {
      if (!G.stamps[i]) {
        const inp = h('input', { type: 'text', cls: 'ans', placeholder: '배달 확인 암호', 'aria-label': '편지 ' + NUM[i] + ' 배달 확인 암호', autocomplete: 'off' });
        return h('section', { cls: 'card scell empty' }, h('div', { cls: 'ghoststamp' }, NUM[i]), h('p', { cls: 'dim' }, '편지 ' + NUM[i] + '의 도장이 아직 없소. 다른 기기에서 배달했다면 그 편지의 배달 확인 암호를 넣으시오.'),
          h('form', { cls: 'row', on: { submit: (e) => { e.preventDefault(); if (!inp.value.trim()) return; if (ok(P.letters[i].code, inp.value)) { G.stamps[i] = 1; persist(); sfx.thud(); render(); } else { sfx.bad(); toast('암호가 맞지 않소. 편지 ' + NUM[i] + '의 마지막 답이오.'); } } } }, inp, h('button', { cls: 'btn', type: 'submit' }, '불러오기')));
      }
      let turns = G.rot[i];
      const svg = stampSvg(i, st.opts, turns), now = h('p', { cls: 'nowans' });
      const say = () => { now.textContent = '▲ 지금 답: ' + st.opts[(4 - G.rot[i]) % 4]; };
      say();
      return h('section', { cls: 'card scell' }, h('p', { cls: 'sq' }, h('b', null, NUM[i] + ' '), st.q),
        h('button', { type: 'button', cls: 'stampbtn', 'aria-label': '도장 ' + NUM[i] + ' 돌리기', on: { click: () => { turns++; G.rot[i] = turns % 4; persist(); svg.style.transform = 'rotate(' + turns * 90 + 'deg)'; sfx.click(); say(); refresh(); } } }, h('span', { cls: 'tri' }, '▲'), svg), now);
    })));
    refresh(true);
  }

  /* ---------------- 최종 · 엔딩 ---------------- */
  function finish() { G.end = Date.now(); G.ei = 0; persist(); queueResult(); sfx.ok(); go('ending'); }
  function vFinal(a) {
    setBg(P.hubBg);
    const F = P.fin, fb = h('div', { cls: 'fb', 'aria-live': 'polite' }), kids = [];
    if (!S.virtual) {
      const inp = h('input', { type: 'text', cls: 'ans', placeholder: '엔딩 암호', 'aria-label': '엔딩 암호', autocomplete: 'off' });
      kids.push(h('span', { cls: 'tag real' }, '교실 실물 → 웹'), h('h2', null, '기록 상자'), pic('record_box_closed', 'bigprop'), h('p', { cls: 'q' }, F.text),
        h('form', { cls: 'row', on: { submit: (e) => { e.preventDefault(); if (!inp.value.trim()) return; ok(F.ans, inp.value) ? finish() : miss('final', fb, '상자 속 쪽지를 다시 읽어 보시오.'); } } }, inp, h('button', { cls: 'btn', type: 'submit' }, '확인')), fb);
    } else if (P.meta.kind === 'number') {
      kids.push(h('span', { cls: 'tag web' }, '가상 자물쇠'), h('h2', null, '기록 상자'), pic('record_box_closed', 'bigprop'), h('p', { cls: 'q' }, '엽서에서 읽은 번호로 상자를 여시오.'),
        dialUI(4, '0123456789', (v) => (v === S.box1 ? opened() : miss('final', fb, '도장을 다시 겹쳐 번호를 확인하시오.'))), fb);
    } else {
      const svg = sv('svg', { viewBox: '0 0 400 300', class: 'metapic tap' }); mapBase(svg);
      D.places.forEach((pl) => { const c = sv('circle', { cx: pl.x, cy: pl.y, r: 17, class: 'm-tap', tabindex: 0, role: 'button', 'aria-label': pl.name }); c.addEventListener('click', () => (pl.name === S.place ? opened() : miss('final', fb, '여기가 아닐세. 도장을 겹쳐 ✕를 다시 확인하시오.'))); svg.appendChild(c); });
      kids.push(h('span', { cls: 'tag web' }, '가상 자물쇠'), h('h2', null, '복동이 기록을 숨긴 곳'), h('p', { cls: 'q' }, '약도에서 ✕가 있던 장소를 누르시오.'), svg, fb);
    }
    kids.push(btn('← 도장 다시 보기', () => go('meta'), 'ghost small'));
    add(a, h('section', { cls: 'card center' }, kids));
    function opened() { sfx.open(); modal('상자가 열렸소!', h('div', { cls: 'center' }, pic('record_box_open', 'bigprop'), h('p', null, '상자 속 쪽지: 엔딩 암호 「' + deob(F.show) + '」')), [['엔딩으로', () => { closeModal(); finish(); }]]); }
  }
  function vEnding(a) {
    const E = P.endings, pg = E[Math.min(G.ei, E.length - 1)], lastPg = G.ei >= E.length - 1, gr = grade(), kids = [];
    setBg(pg.bg);
    if (pg.char || pg.prop) kids.push(h('div', { cls: 'stage' }, pg.char && pic(pg.char, 'char'), pg.prop && pic(pg.prop, 'prop')));
    const txt = h('p', { cls: 'say' });
    if (pg.who) kids.push(h('b', { cls: 'who' }, pg.who), txt);
    else if (pg.text && !pg.grade && !pg.reply) kids.push(h('p', { cls: 'narr bigline' }, pg.text));
    if (pg.text2 && !pg.reply) kids.push(h('p', { cls: 'narr' }, pg.text2));
    if (pg.card) kids.push(h('div', { cls: 'quotecard' }, h('p', { cls: 'qc-q' }, '"' + pg.card.quote + '"'), h('p', { cls: 'qc-s' }, '— ' + pg.card.src), h('p', { cls: 'qc-a' }, pg.card.ask)));
    if (pg.grade) kids.push(h('div', { cls: 'gradebox ' + gr[0] }, pic('medal_' + gr[0], 'medal'), h('h2', null, '배달 등급: ' + gr[1]),
      h('p', null, G.team + ' · 걸린 시간 ' + fmt(G.end - G.t0) + ' · 남은 우표 ' + G.hints + '장'), h('p', { cls: 'dim', id: 'sendst' }, sendState())));
    if (pg.reply) {
      const ta = h('textarea', { cls: 'ans', rows: '3', maxlength: '300', placeholder: '(선택) 답장의 한 줄을 여기에도 남기면 선생님께 함께 전해집니다.', 'aria-label': '복동에게 보내는 답장' }, G.reply || '');
      kids.push(h('h2', null, '복동에게 보내는 답장'), h('p', null, pg.text), pg.text2 && h('p', null, pg.text2), ta,
        btn('답장 남기기', () => { G.reply = ta.value.trim(); persist(); queueResult(); toast('답장을 맡았소. 고맙소!'); }, 'ghost'),
        h('details', { cls: 'recap' }, h('summary', null, '오늘 배달한 편지 다시 보기'), P.letters.map((L, i) => h('div', null, h('h4', null, '편지 ' + NUM[i] + ' ' + L.title + ' (' + L.years + ')'), h('ul', null, L.steps.map((s) => h('li', null, s.okAlt && wordChanged() ? s.okAlt : s.ok)))))),
        gasUrl() && h('div', { cls: 'board' }, btn('우리 반 배달 게시판 보기', (e) => loadBoard(e.target.parentNode), 'ghost')));
    }
    if (pg.notice) kids.push(h('p', { cls: 'notice' }, D.notice));
    kids.push(h('div', { cls: 'nav' }, G.ei > 0 ? btn('이전', () => { G.ei--; persist(); render(); }, 'ghost') : h('span'), h('span', { cls: 'dim' }, (G.ei + 1) + ' / ' + E.length),
      lastPg ? h('span', { cls: 'dim' }, '끝') : btn('다음', () => { G.ei++; persist(); sfx.click(); render(); window.scrollTo(0, 0); })));
    add(a, h('section', { cls: 'card dialog ending' }, kids));
    if (pg.who) typeInto(txt, pg.text);
  }

  /* ---------------- 결과 전송 (Apps Script) ---------------- */
  function payload() {
    const g = grade();
    return { id: G.id, ts: Date.now(), cls: clsName(), team: G.team, part: P.no, start: new Date(G.t0).toISOString(), end: new Date(G.end).toISOString(), sec: Math.round((G.end - G.t0) / 1000),
      hints: G.hints, grade: g[1], wrong: Object.values(G.wrong).reduce((x, y) => x + y, 0), hintUsed: G.used, lt: G.lt.map((x) => Math.round(x / 1000)),
      wrongDetail: JSON.stringify(G.wrong), reply: G.reply || '', virtual: S.virtual ? 'Y' : '', device: (navigator.userAgent.match(/CrOS|Android|iPad|iPhone|Windows|Mac/) || ['기타'])[0] };
  }
  function queueResult() { const p = payload(); save('outbox', load('outbox', []).filter((x) => x.id !== p.id).concat([p])); flush(); }
  const sendState = () => { const n = load('outbox', []).length; return !gasUrl() ? '기록은 이 기기에만 저장되었습니다.' : n ? '기록 전송 대기 중 (' + n + '건) · 인터넷에 연결되면 자동으로 보냅니다.' : '기록을 선생님께 보냈습니다.'; };
  let flushing = false;
  async function flush() {
    const url = gasUrl(); if (!url || flushing) return; flushing = true;
    const head = { 'Content-Type': 'text/plain;charset=utf-8' };
    for (const it of load('outbox', [])) {
      let sent = false; const body = JSON.stringify(it);
      try { const r = await fetch(url, { method: 'POST', headers: head, body }); const j = await r.json(); sent = !!(j && j.ok); }
      catch (e) { try { await fetch(url, { method: 'POST', mode: 'no-cors', headers: head, body }); sent = true; } catch (e2) { sent = false; } }
      if (sent) save('outbox', load('outbox', []).filter((x) => !(x.id === it.id && x.ts === it.ts)));
    }
    flushing = false; const s = $('#sendst'); if (s) s.textContent = sendState();
  }
  async function loadBoard(box) {
    box.innerHTML = ''; box.appendChild(h('p', { cls: 'dim' }, '게시판을 불러오는 중…'));
    try {
      const r = await fetch(gasUrl() + '?action=board&cls=' + encodeURIComponent(clsName()) + '&part=' + encodeURIComponent(P.no)); const j = await r.json();
      box.innerHTML = '';
      add(box, [h('h4', null, '우리 반 배달 게시판 · ' + P.no), h('table', { cls: 'tbl' }, h('tr', null, h('th', null, '모둠'), h('th', null, '등급'), h('th', null, '걸린 시간'), h('th', null, '남은 우표')),
        (j.rows || []).map((x) => h('tr', { cls: x.team === G.team ? 'me' : '' }, h('td', null, x.team), h('td', null, x.grade), h('td', null, fmt(x.sec * 1000)), h('td', null, String(x.hints)))))]);
    } catch (e) { box.innerHTML = ''; box.appendChild(h('p', { cls: 'dim' }, '게시판을 불러오지 못했습니다.')); }
  }

  /* ---------------- 교사 화면 ---------------- */
  function askPw() {
    const inp = h('input', { type: 'password', inputmode: 'numeric', cls: 'ans', 'aria-label': '교사 비밀번호', autocomplete: 'off' });
    const tryIt = () => { if (HX.hash(inp.value) === S.pw) teacher(); else { inp.value = ''; toast('비밀번호가 다릅니다.'); } };
    modal('교사 화면', h('form', { on: { submit: (e) => { e.preventDefault(); tryIt(); } } }, h('p', null, '비밀번호를 넣으세요.'), inp), [['취소', closeModal, 'ghost'], ['열기', tryIt]]);
  }
  const parseDir = (s) => String(s).toUpperCase().replace(/→/g, 'R').replace(/←/g, 'L').replace(/↑/g, 'U').replace(/↓/g, 'D').replace(/[^UDLR]/g, '');
  const showDir = (s) => s.split('').map((x) => ARW[x]).join('');
  function teacher() {
    const f = {}, fld = (label, el, note) => h('label', { cls: 'fld' }, h('span', null, label), el, note && h('small', null, note));
    const txt = (k, v, extra) => (f[k] = h('input', Object.assign({ type: 'text', cls: 'ans', value: v, autocomplete: 'off' }, extra || {})));
    f.part = h('select', { cls: 'ans' }, ['p1', 'p2'].map((p) => h('option', { value: p, selected: S.part === p }, D.parts[p].no + ' ' + D.parts[p].name)));
    f.place = h('select', { cls: 'ans' }, D.places.map((p) => h('option', { value: p.name, selected: S.place === p.name }, p.name)));
    f.virtual = h('input', { type: 'checkbox', checked: S.virtual });
    const out = h('pre', { cls: 'tout' }), st = h('p', { cls: 'dim' }, '전송 대기: ' + load('outbox', []).length + '건');
    let resetArmed = false;
    const apply = () => {
      S.part = f.part.value; S.cls = f.cls.value.trim(); S.gas = f.gas.value.trim(); S.place = f.place.value; S.virtual = f.virtual.checked;
      const b = f.box1.value.replace(/\D/g, ''); if (b.length === 4) S.box1 = b;
      ['p1', 'p2'].forEach((p) => { const d = parseDir(f['dir' + p].value); if (d) S.v[p].dir = d; const w = f['word' + p].value.toUpperCase().replace(/[^A-Z]/g, ''); if (w.length === 5) S.v[p].word = w; });
      save('set', S); sync(); persist();
    };
    const body = h('div', { cls: 'tpanel' },
      h('p', { cls: 'warn' }, '설정은 기기마다 저장됩니다. 모든 모둠 기기에서 같게 맞추세요. (아래 「설정 공유 링크」를 쓰면 한 번에 맞출 수 있습니다.)'),
      h('h3', null, '수업'), fld('오늘 차시', f.part), fld('반 이름', txt('cls', S.cls, { placeholder: CFG.className || '예: 3학년 2반' }), '결과 시트에서 반을 구분합니다.'),
      h('h3', null, '결과 연동 (Google Apps Script)'),
      fld('웹 앱 URL', txt('gas', S.gas, { placeholder: CFG.gasUrl ? 'config.js 값 사용 중' : 'https://script.google.com/macros/s/…/exec', inputmode: 'url' }), '붙여 넣고 저장하면 엔딩 때 최종 결과가 자동으로 시트에 기록됩니다. 비워 두면 config.js의 주소를 씁니다.'),
      h('div', { cls: 'row' }, btn('연결 시험', async () => { apply(); const u = gasUrl(); if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) { out.textContent = '주소가 https://script.google.com/…/exec 꼴인지 확인하세요.'; return; } out.textContent = '시험 중…'; try { const r = await fetch(u + '?action=ping'); const j = await r.json(); out.textContent = j.ok ? '연결 성공! 시트에 기록할 준비가 되었습니다.' : '응답이 이상합니다: ' + JSON.stringify(j); } catch (e) { out.textContent = '응답을 읽지 못했습니다. 배포할 때 액세스 권한을 「모든 사용자」로 했는지, 주소가 /exec 로 끝나는지 확인하세요.'; } }, 'ghost'),
        btn('대기 중인 기록 다시 보내기', async () => { apply(); await flush(); st.textContent = '전송 대기: ' + load('outbox', []).length + '건'; }, 'ghost')), st,
      h('h3', null, '자물쇠'), fld('1부 상자 번호 (엽서에 새겨짐)', txt('box1', S.box1, { inputmode: 'numeric', maxlength: '4' })), fld('2부 ✕ 장소', f.place),
      h('label', { cls: 'chk' }, f.virtual, ' 가상 자물쇠 모드 (실물 자물쇠 없이 웹에서 열기)'),
      fld('1부 방향', txt('dirp1', showDir(S.v.p1.dir)), '화살표(→↓←↑)나 RDLU로 입력'), fld('1부 영어 단어', txt('wordp1', S.v.p1.word, { maxlength: '5' }), '5글자. 바꾸면 성공 문장의 단어 풀이는 생략됩니다.'),
      fld('2부 방향', txt('dirp2', showDir(S.v.p2.dir))), fld('2부 영어 단어', txt('wordp2', S.v.p2.word, { maxlength: '5' })),
      h('h3', null, '진행 도움 (지금 차시)'),
      h('div', { cls: 'row wrap' }, NUM.map((n, i) => btn('도장 ' + n + ' 지급', () => { apply(); G.stamps[i] = 1; G.L[i] = 3; G.show = null; persist(); toast('도장 ' + n + ' 지급'); }, 'ghost')),
        btn('우표 +1', () => { G.hints = Math.min(9, G.hints + 1); persist(); tickTop(); }, 'ghost'), btn('우표 −1', () => { G.hints = Math.max(0, G.hints - 1); persist(); tickTop(); }, 'ghost'),
        btn('시간 +5분', () => { G.extra += 5 * 60000; G.warned = 0; persist(); tickTop(); toast('5분을 더했습니다.'); }, 'ghost')),
      h('div', { cls: 'row wrap' }, btn('진행 상황 보기', () => { out.textContent = ['p1', 'p2'].map((p) => { const g = ALL[p]; if (!g) return D.parts[p].no + ': 시작 전'; return D.parts[p].no + ' [' + (g.team || '이름 없음') + '] 화면 ' + g.screen + ' · 편지 단계 ' + g.L.join('/') + ' · 도장 ' + g.stamps.join('') + ' · 우표 ' + g.hints + ' · 오답 ' + Object.values(g.wrong).reduce((x, y) => x + y, 0) + ' · ' + (g.t0 ? fmt((g.end || Date.now()) - g.t0) + ' 경과' : '타이머 전'); }).join('\n'); }, 'ghost'),
        btn('설정 공유 링크 만들기', () => { apply(); const c = { part: S.part, box1: S.box1, place: S.place, virtual: S.virtual, v: S.v, gas: S.gas, cls: S.cls }; const link = location.href.split('#')[0] + '#cfg=' + encodeURIComponent(ob(JSON.stringify(c))); out.textContent = '이 주소를 모둠 기기에서 열면 같은 설정이 들어갑니다(QR로 만들어 두면 편합니다):\n' + link; if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => toast('링크를 복사했습니다.'), () => {}); }, 'ghost')),
      h('div', { cls: 'row wrap' }, btn('한성 약도 크게 보기 (A3 인쇄)', () => { apply(); closeModal(); printView('map'); }, 'ghost'), btn('장소 봉투 카드 6장 (인쇄)', () => { apply(); closeModal(); printView('cards'); }, 'ghost')),
      out,
      h('h3', null, '관리'),
      h('div', { cls: 'row wrap' }, btn('비밀번호 변경', () => { const v = f.npw.value.trim(); if (v.length < 4) { toast('새 비밀번호를 4자 이상 쓰세요.'); return; } S.pw = HX.hash(v); save('set', S); f.npw.value = ''; toast('비밀번호를 바꿨습니다.'); }, 'ghost'), (f.npw = h('input', { type: 'password', cls: 'ans narrow', placeholder: '새 비밀번호', autocomplete: 'new-password' })),
        btn('처음부터 (지금 차시)', (e) => { if (!resetArmed) { resetArmed = true; e.target.textContent = '한 번 더 누르면 지웁니다'; return; } apply(); ALL[S.part] = fresh(); persist(); closeModal(); drawTop(); render(); toast('처음으로 돌렸습니다.'); }, 'danger')));
    modal('교사 화면', body, [['저장하고 닫기', () => { apply(); closeModal(); drawTop(); render(); toast('설정을 저장했습니다.'); }]], 'wide');
  }
  function printView(kind) {
    const old = $('#print'); if (old) old.remove();
    const close = () => { pv.remove(); document.body.classList.remove('pv'); };
    let content;
    if (kind === 'map') {
      const svg = sv('svg', { viewBox: '0 0 400 300', class: 'metapic printmap' }); svg.appendChild(sv('rect', { x: 0, y: 0, width: 400, height: 300, class: 'mp-paper' })); mapBase(svg, true); content = svg;
    } else {
      content = h('div', { cls: 'pcards' }, D.places.map((pl) => h('div', { cls: 'pc' }, h('h2', null, pl.name),
        pl.name === S.place ? [h('p', { cls: 'pc-t' }, '복동의 기록 상자 번호'), h('div', { cls: 'pc-box' })] : h('p', { cls: 'pc-no' }, '여기가 아닐세'), h('p', { cls: 'pc-l' }, pl.line))));
    }
    const pv = h('div', { id: 'print' }, h('style', null, '@page{size:' + (kind === 'map' ? 'A3 landscape' : 'A4 portrait') + ';margin:10mm}'),
      h('div', { cls: 'noprint pbar' }, btn('인쇄', () => window.print()), btn('닫기', close, 'ghost'), h('span', null, kind === 'map' ? '코르크 보드용 한성 약도 · A3 가로로 인쇄하세요.' : '정답 장소(' + S.place + ') 카드의 빈칸에 상자 번호를 손으로 적으세요. 가위선을 따라 잘라 봉투에 넣습니다.')), content);
    document.body.appendChild(pv); document.body.classList.add('pv');
  }

  /* ---------------- 시작 ---------------- */
  function importCfg() {
    const m = location.hash.match(/cfg=([^&]+)/); if (!m) return;
    try {
      const c = JSON.parse(deob(decodeURIComponent(m[1]))), keep = ['part', 'box1', 'place', 'virtual', 'v', 'gas', 'cls'], o = {};
      keep.forEach((k) => { if (c[k] !== undefined) o[k] = c[k]; });
      S = merge(S, o); save('set', S); setTimeout(() => toast('교사 설정을 불러왔습니다.'), 400);
    } catch (e) { /* 잘못된 링크는 무시 */ }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
  }
  importCfg(); sync();
  if (G.screen === 'letter') G.ls = Date.now();
  drawTop(); render();
  setInterval(tick, 1000);
  window.addEventListener('online', flush); flush();
  window.MB = { hash: HX.hash };
})();
