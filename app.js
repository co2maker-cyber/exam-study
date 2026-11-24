(function () {
  "use strict";

  /*
   * 학습 엔진 개요 (근거는 '학습 원리' 페이지 참고)
   *  - 인출 연습: 읽기보다 문제 풀기로 기억을 꺼내게 함
   *  - 간격 반복: 맞힐수록 1→3→7→16→35→80일 간격으로 다시 냄
   *  - 연속 재학습: 틀린 문제는 같은 회차 안에서 몇 문제 뒤 한 번 더
   *  - 교차 학습: 오늘의 학습은 여러 단원을 섞어서 냄
   *  - 확신도: 확신했는데 틀린 문제(착각)를 따로 표시, 찍어서 맞힌 문제는 곧 다시
   */
  const BANK = (window.QUESTION_BANK || []).filter(q => q && q.id && q.question);
  const BY_ID = Object.fromEntries(BANK.map(q => [q.id, q]));
  const STORE_KEY = "examStudy.v1";
  const CLEAR_STREAK = 2; // 오답노트: 서로 다른 날 이만큼 연속으로 맞히면 졸업
  const NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  const app = document.getElementById("app");

  // ---------- 날짜 · 간격 ----------
  const DAY = 86400000;
  const dayNum = (t = Date.now()) => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY);
  const dayKey = n => new Date(n * DAY).toISOString().slice(0, 10);
  const IV = [0, 1, 3, 7, 16, 35, 80];           // 단계별 다음 복습까지 일수
  const MEM = ["새 문제", "학습 중", "익숙해짐", "장기 기억"];
  const memLevel = r => !r ? 0 : r.lv <= 2 ? 1 : r.lv <= 4 ? 2 : 3;
  const RELEARN_GAP = 4;                          // 틀린 문제를 몇 문제 뒤에 다시 낼지
  const SESSION_DUE_MAX = 30;                     // 한 번에 내는 복습 문제 최대 수
  const CONF = { sure: "확실해요", mid: "애매해요", guess: "찍었어요" };

  // ---------- 저장소 ----------
  function blank() {
    return { stats: {}, wrong: {}, known: {}, custom: [], srs: {}, days: {}, settings: { conf: true, recall: false, newPerDay: 10, abbr: true } };
  }
  function normalize(s) {
    const b = blank();
    if (!s || typeof s !== "object") return b;
    const o = {};
    for (const k of ["stats", "wrong", "known", "srs", "days"]) o[k] = s[k] && typeof s[k] === "object" ? s[k] : {};
    o.custom = Array.isArray(s.custom) ? s.custom : [];
    o.settings = { ...b.settings, ...(s.settings || {}) };
    // 이전 버전 기록(풀이 통계만 있음)을 복습 일정으로 옮김
    const today = dayNum();
    for (const id of Object.keys(o.stats)) {
      if (o.srs[id]) continue;
      const st = o.stats[id];
      const ld = st.last ? dayNum(st.last) : today;
      if (o.wrong[id]) o.srs[id] = { lv: 1, due: today, lapses: o.wrong[id].count || 1, last: st.last || Date.now() };
      else if (st.tries >= 2 && st.correct === st.tries) o.srs[id] = { lv: 2, due: ld + IV[2], lapses: 0, last: st.last || Date.now() };
      else o.srs[id] = { lv: 1, due: ld + IV[1], lapses: st.tries - st.correct, last: st.last || Date.now() };
    }
    return o;
  }
  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(STORE_KEY))); } catch (e) { return blank(); }
  }
  let store = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 무시 */ }
    updateBadge();
  }
  function wrongIds() { return Object.keys(store.wrong).filter(id => BY_ID[id]); }
  function updateBadge() { document.getElementById("noteBadge").textContent = wrongIds().length; }

  // ---------- 유틸 ----------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isMC = q => Array.isArray(q.choices) && q.choices.length > 0;
  const isMulti = q => isMC(q) && Array.isArray(q.answer);
  const mcAnswers = q => (Array.isArray(q.answer) ? q.answer : [q.answer]).map(Number);
  const choiceLabel = (q, k) => `${NUMS[k - 1] || k} ${q.choices[k - 1] ?? ""}`;
  const norm = s => String(s).toLowerCase().replace(/\s+/g, "").trim();
  const shortAnswers = q => (Array.isArray(q.answer) ? q.answer : [q.answer]).map(String);
  function answerText(q) {
    if (isMC(q)) return mcAnswers(q).map(k => choiceLabel(q, k)).join(" / ");
    return shortAnswers(q)[0];
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // 같은 단원이 연달아 몰리지 않게 섞기(교차 학습)
  function interleave(list) {
    const groups = {};
    shuffle(list).forEach(q => (groups[q.exam || q.domain || ""] = groups[q.exam || q.domain || ""] || []).push(q));
    const keys = shuffle(Object.keys(groups)), out = [];
    while (out.length < list.length) keys.forEach(k => { if (groups[k].length) out.push(groups[k].shift()); });
    return out;
  }
  const fmtDate = n => { const d = new Date(n * DAY); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const inDays = n => n <= 0 ? "오늘" : n === 1 ? "내일" : `${n}일 뒤`;

  // ---------- 과목(카테고리) ----------
  const CATS = (window.CATEGORIES || [{ id: "aws", name: "AWS" }]).filter(c => BANK.some(q => (q.category || "aws") === c.id));
  const catOf = q => q.category || "aws";
  const catName = id => (CATS.find(c => c.id === id) || {}).name || id;
  const inCat = (cat) => BANK.filter(q => catOf(q) === cat);
  const CAT_KEY = "examStudy.category";
  function loadCat() {
    try { const c = localStorage.getItem(CAT_KEY); if (CATS.some(x => x.id === c)) return c; } catch (e) { /* 무시 */ }
    return CATS[0] ? CATS[0].id : "aws";
  }
  function saveCat(c) { try { localStorage.setItem(CAT_KEY, c); } catch (e) { /* 무시 */ } }
  const freqTag = q => q.freq ? `<span class="tag ${q.freq >= 3 ? "hot" : ""}">${q.freq >= 3 ? "★ " : ""}출제 ${q.freq}회</span>` : "";
  function givenText(q, given) {
    if (given == null || given === "") return "";
    if (isMC(q)) return (Array.isArray(given) ? given : [given]).map(k => choiceLabel(q, +k)).join(" / ");
    return String(given);
  }

  // ---------- 학습 일정 ----------
  function todayLog() { const k = dayKey(dayNum()); return store.days[k] || (store.days[k] = { n: 0, ok: 0, newBy: {} }); }
  const newDoneToday = cat => ((store.days[dayKey(dayNum())] || {}).newBy || {})[cat] || 0;
  function plan(cat, exam) {
    const t = dayNum();
    const pool = BANK.filter(q => catOf(q) === cat && (!exam || q.exam === exam));
    const s = id => store.srs[id];
    const due = pool.filter(q => s(q.id) && s(q.id).due <= t)
      .sort((a, b) => (!!s(b.id).hyper - !!s(a.id).hyper) || (s(a.id).due - s(b.id).due) || (s(a.id).lv - s(b.id).lv));
    const newLeft = Math.max(0, (store.settings.newPerDay || 10) - newDoneToday(cat));
    // 새 문제: 출제 빈도가 높은 것부터(같으면 무작위)
    const fresh = shuffle(pool.filter(q => !s(q.id))).sort((a, b) => (b.freq || 0) - (a.freq || 0));
    return { pool, due, fresh, newLeft, todayNew: fresh.slice(0, newLeft) };
  }
  function streakDays() {
    let n = 0, d = dayNum();
    if (!(store.days[dayKey(d)] || {}).n) d--;           // 오늘 아직 안 했으면 어제부터
    while ((store.days[dayKey(d)] || {}).n) { n++; d--; }
    return n;
  }
  function schedule(id, ok, conf, hinted) {
    const t = dayNum();
    const r = store.srs[id];
    const s = r ? { ...r } : { lv: 0, due: t, lapses: 0 };
    const early = r && r.due > t;
    if (!ok) { s.lv = 1; s.lapses = (s.lapses || 0) + 1; s.hyper = conf === "sure"; }
    else if (conf === "guess") { s.lv = 1; }
    else if (early || hinted) { s.lv = Math.max(1, s.lv); s.hyper = false; } // 일찍 맞힘·힌트 사용: 단계 유지
    else { s.lv = Math.min(IV.length - 1, s.lv + (!r && conf === "sure" ? 2 : 1)); s.hyper = false; }
    s.due = t + IV[s.lv];
    s.last = Date.now();
    s.conf = conf || "";
    store.srs[id] = s;
    return s;
  }

  // ---------- 해설 나누기(핵심 + 보기별 이유) · 힌트 ----------
  // 해설 = 첫 줄들(핵심) + 마지막에 ①~④ 보기별 한 줄. 끝에서부터 ①…ⓝ이 이어지는 묶음을 찾는다.
  function parseExpl(q) {
    if (q._px !== undefined) return q._px;
    const L = String(q.explanation || "").split("\n");
    const n = isMC(q) ? q.choices.length : 0;
    let at = -1;
    for (let i = L.length - n; n && i >= 0; i--) {
      if (L.slice(i, i + n).every((l, k) => l.startsWith(NUMS[k]))) { at = i; break; }
    }
    q._px = at < 0 ? null : {
      head: L.slice(0, at).join("\n").trim(),
      per: L.slice(at, at + n).map((l, k) => l.slice(NUMS[k].length).trim()),
      tail: L.slice(at + n).join("\n").trim()
    };
    return q._px;
  }
  // 핵심 단서: 해설 첫 줄에서 정답 보기 글자·번호를 가린 것
  function clueText(q) {
    const px = parseExpl(q);
    if (!px || !px.head) return "";
    const ans = mcAnswers(q);
    let h = px.head.replace(/[①-⑩]/g, "○");
    const others = q.choices.filter((_, i) => !ans.includes(i + 1)).join(" ");
    ans.forEach(k => {
      const a = q.choices[k - 1] || "";
      if (a.length >= 2) h = h.split(a).join("○○○");
      a.split(/[\s,·/()\[\]→\-]+/).filter(t => t.length >= 2 && !others.includes(t)).forEach(t => { h = h.split(t).join("○○"); });
    });
    return ans.some(k => (q.choices[k - 1] || "").length >= 2 && h.includes(q.choices[k - 1])) ? "" : h;
  }
  const hintMax = q => {
    if (!isMC(q) || !parseExpl(q)) return 0;
    const elim = Math.max(0, q.choices.length - mcAnswers(q).length - 1);
    return elim + (clueText(q) ? 1 : 0);
  };
  const hintCount = () => quiz.hint.elim.length + (quiz.hint.clue ? 1 : 0);

  // ---------- 영어 약어 풀이 ----------
  const AB = window.ABBR || {}, ABG = window.ABBR_GROUPS || {}, ABA = window.ABBR_ALIAS || {};
  const AB_COMMON = new Set(["AWS", "IP", "PC", "ID", "IT", "TV", "AI", "DB", "OS"]); // 너무 흔해 목록에서는 뺌(밑줄 풀이는 유지)
  const AB_GROUP_KEYS = Object.keys(ABG).sort((a, b) => b.length - a.length);
  const AB_TOKEN = /(?<![A-Za-z0-9])([A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][0-9]+[A-Za-z0-9]*)(?![A-Za-z0-9])/g;
  function abLookup(w) {
    if (ABG[w]) return { key: w, v: ABG[w] };
    if (AB[w]) return { key: w, v: AB[w] };
    if (ABA[w] && AB[ABA[w]]) return { key: ABA[w], v: AB[ABA[w]] };
    const m = /^L([1-7])$/.exec(w);
    if (m) return { key: w, v: [`Layer ${m[1]}`, `OSI ${m[1]}계층`] };
    const base = w.replace(/v?\d+$/, "");
    if (base !== w && AB[base]) return { key: base, v: AB[base] };
    return null;
  }
  // 글을 안전하게 바꾸면서 약어에 밑줄(누르면 풀이)을 붙임. found에 찾은 약어를 모음
  function abbrHTML(text, found) {
    const s = String(text ?? "");
    if (!store.settings.abbr) return esc(s);
    const hits = [];
    for (const g of AB_GROUP_KEYS) { let i = 0; while ((i = s.indexOf(g, i)) >= 0) { hits.push([i, i + g.length, g]); i += g.length; } }
    for (const m of s.matchAll(AB_TOKEN)) { const a = m.index, b = a + m[1].length; if (!hits.some(([x, y]) => a < y && b > x)) hits.push([a, b, m[1]]); }
    hits.sort((x, y) => x[0] - y[0]);
    let out = "", pos = 0;
    for (const [a, b, w] of hits) {
      if (a < pos) continue;
      const L = abLookup(w);
      out += esc(s.slice(pos, a));
      if (L) { if (found) found.add(L.key); out += `<abbr class="ab" data-ab="${esc(w)}" title="${esc(L.v[0] + " — " + L.v[1])}">${esc(w)}</abbr>`; }
      else out += esc(w);
      pos = b;
    }
    return out + esc(s.slice(pos));
  }
  function abbrBox(keys, title, skip) {
    if (!store.settings.abbr) return "";
    const list = [...keys].filter(k => !AB_COMMON.has(k) && !(skip && skip.has(k))).map(k => [k, (abLookup(k) || {}).v]).filter(x => x[1]);
    if (!list.length) return "";
    return `<div class="ab-box"><div class="ab-title">📖 ${title}</div>${list.map(([k, v]) => `<div class="ab-row"><b>${esc(k)}</b> <span class="ab-full">${esc(v[0])}</span><div class="ab-mean">${esc(v[1])}</div></div>`).join("")}</div>`;
  }
  // 밑줄 약어를 누르면 풀이 말풍선
  let abTip = null;
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("abbr.ab");
    if (abTip) { abTip.remove(); abTip = null; }
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    const L = abLookup(a.dataset.ab);
    if (!L) return;
    abTip = document.createElement("div");
    abTip.className = "ab-tip";
    abTip.innerHTML = `<b>${esc(a.dataset.ab)}</b> = ${esc(L.v[0])}<div>${esc(L.v[1])}</div>`;
    document.body.appendChild(abTip);
    const r = a.getBoundingClientRect(), w = abTip.offsetWidth;
    abTip.style.top = (window.scrollY + r.bottom + 6) + "px";
    abTip.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - w - 8)) + "px";
  }, true);

  // ---------- 홈 ----------
  const opts = { category: loadCat(), exam: "", domain: "", freq: 0, count: 10, source: "smart" };

  function weekBars() {
    const t = dayNum(), out = [];
    for (let d = t - 6; d <= t; d++) out.push({ d, n: (store.days[dayKey(d)] || {}).n || 0 });
    const max = Math.max(5, ...out.map(x => x.n));
    const wd = ["일", "월", "화", "수", "목", "금", "토"];
    return `<div class="week">${out.map(x => `<div class="wk ${x.d === t ? "today" : ""}" title="${dayKey(x.d)} · ${x.n}문제">
      <div class="wk-bar"><div style="height:${x.n / max * 100}%"></div></div>
      <span>${wd[new Date(x.d * DAY).getUTCDay()]}</span></div>`).join("")}</div>`;
  }

  function renderHome() {
    const cat = opts.category;
    const p = plan(cat, "");
    const pool = p.pool;
    const exams = [...new Set(pool.map(q => q.exam).filter(Boolean))];
    const domains = [...new Set(pool.map(q => q.domain).filter(Boolean))].sort();
    const hasFreq = pool.some(q => q.freq);
    const mem = [0, 0, 0, 0];
    pool.forEach(q => mem[memLevel(store.srs[q.id])]++);
    const hyper = pool.filter(q => store.srs[q.id] && store.srs[q.id].hyper);
    const dueN = Math.min(p.due.length, SESSION_DUE_MAX);
    const sessN = dueN + p.todayNew.length;
    const t = dayNum();
    const nextDue = pool.map(q => store.srs[q.id]).filter(r => r && r.due > t).map(r => r.due).sort((a, b) => a - b)[0];
    const tomorrowN = pool.filter(q => store.srs[q.id] && store.srs[q.id].due === t + 1).length;
    const streak = streakDays();
    const catDesc = (CATS.find(c => c.id === cat) || {}).desc;
    const set = store.settings;

    app.innerHTML = `
      <section class="card">
        ${CATS.length > 1 ? `
        <div class="seg cat-seg" id="catSeg">
          ${CATS.map(c => `<button data-c="${c.id}" class="${cat === c.id ? "on" : ""}"><span class="full">${esc(c.name)}</span><span class="short">${esc(c.short || c.name)}</span><small>${inCat(c.id).length}문제</small></button>`).join("")}
        </div>` : ""}
        ${catDesc ? `<p class="muted cat-desc">${esc(catDesc)}</p>` : ""}
      </section>

      <section class="card today">
        <div class="today-head">
          <h1>오늘의 학습</h1>
          <span class="streak ${streak ? "on" : ""}" title="연속 학습일">🔥 ${streak}일 연속</span>
        </div>
        ${sessN ? `
        <div class="today-nums">
          <div><b>${dueN}</b><span>복습할 문제${p.due.length > dueN ? ` <small>(전체 ${p.due.length})</small>` : ""}</span></div>
          <div><b>${p.todayNew.length}</b><span>새 문제</span></div>
          <div><b>${Math.max(1, Math.round(sessN * 0.6))}분</b><span>예상 시간</span></div>
        </div>
        <button class="btn primary block big" id="todayBtn">오늘 학습 시작 · ${sessN}문제</button>
        <p class="muted small" style="margin:8px 0 0">잊어 갈 때쯤 다시 꺼내야 오래 남습니다. 복습할 문제와 새 문제를 단원을 섞어서 냅니다.</p>` : `
        <div class="done-box">
          <div class="done-ic">✅</div>
          <div><b>오늘 할 학습을 마쳤어요.</b>
          <div class="muted small">${nextDue ? `다음 복습은 ${inDays(nextDue - t)}(${fmtDate(nextDue)})입니다. 자고 일어나서 다시 꺼내면 기억이 더 단단해져요.` : "모든 문제를 한 번씩 풀었어요."}</div></div>
        </div>
        <button class="btn block" id="extraBtn">더 풀기 · 새 문제 10개 추가</button>`}
        ${weekBars()}
      </section>

      <section class="card">
        <h2>기억 상태 <span class="muted" style="font-weight:400;font-size:14px">· ${pool.length}문제</span></h2>
        <div class="memstack">${mem.map((n, i) => n ? `<div class="m${i}" style="flex:${n}" title="${MEM[i]} ${n}"></div>` : "").join("")}</div>
        <div class="memlegend">${mem.map((n, i) => `<span><i class="m${i}"></i>${MEM[i]} <b>${n}</b></span>`).join("")}</div>
        <p class="muted small" style="margin:6px 0 0">학습 중 = 1~3일 간격 · 익숙해짐 = 1~2주 간격 · 장기 기억 = 한 달 이상 간격으로 맞힌 문제${tomorrowN ? ` · 내일 복습 예정 ${tomorrowN}문제` : ""}</p>
        ${hyper.length ? `
        <div class="hyper-box">
          <div><b>🔥 착각 교정 ${hyper.length}문제</b>
          <div class="muted small">확신했는데 틀린 문제입니다. 이런 오답은 바로잡으면 오히려 잘 기억됩니다.</div></div>
          <button class="btn small" id="hyperBtn">지금 풀기</button>
        </div>` : ""}
      </section>

      <section class="card">
        <details id="customBox" ${opts.open ? "open" : ""}>
          <summary><h2 style="display:inline">직접 골라 풀기</h2> <span class="muted small">단원·문제 수·방식 선택</span></summary>
          <div style="margin-top:14px">
          ${exams.length > 1 ? `
          <div class="field">
            <label>${hasFreq ? "과목 선택" : "단원 선택"}</label>
            <select id="examSel">
              <option value="">${hasFreq ? "전체 과목" : "전체 단원"}</option>
              ${exams.map(e => `<option value="${esc(e)}" ${opts.exam === e ? "selected" : ""}>${esc(e)} (${pool.filter(q => q.exam === e).length}문제)</option>`).join("")}
            </select>
          </div>` : ""}
          ${domains.length > 1 ? `
          <div class="field">
            <label>영역 선택</label>
            <select id="domainSel">
              <option value="">전체 영역</option>
              ${domains.map(d => `<option value="${esc(d)}" ${opts.domain === d ? "selected" : ""}>${esc(d)} (${pool.filter(q => q.domain === d).length}문제)</option>`).join("")}
            </select>
          </div>` : ""}
          ${hasFreq ? `
          <div class="field">
            <label>출제 빈도</label>
            <select id="freqSel">
              ${[[0, "전체"], [2, "2회 이상 나온 문제"], [3, "★ 3회 이상 나온 문제"]].map(([v, tx]) => `<option value="${v}" ${opts.freq === v ? "selected" : ""}>${tx} (${pool.filter(q => (q.freq || 0) >= v).length}문제)</option>`).join("")}
            </select>
          </div>` : ""}
          <div class="field">
            <label>문제 수</label>
            <div class="seg" id="countSeg">
              ${[10, 20, 50, 0].map(n => `<button data-n="${n}" class="${opts.count === n ? "on" : ""}">${n ? n + "문제" : "전체"}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <label>출제 방식</label>
            <div class="seg" id="srcSeg">
              ${[["smart", "약한 문제 우선"], ["random", "무작위"], ["wrong", "오답노트만"]]
                .map(([k, tx]) => `<button data-s="${k}" class="${opts.source === k ? "on" : ""}">${tx}</button>`).join("")}
            </div>
          </div>
          <button class="btn primary block" id="startBtn">시작하기</button>
          <p class="muted" id="startMsg" style="margin:8px 0 0"></p>
          </div>
        </details>
      </section>

      <section class="card">
        <details>
          <summary><h2 style="display:inline">학습 설정</h2></summary>
          <div style="margin-top:12px">
            <div class="field">
              <label>하루 새 문제 수 (과목별)</label>
              <div class="seg" id="newSeg">${[5, 10, 20, 30].map(n => `<button data-v="${n}" class="${set.newPerDay === n ? "on" : ""}">${n}개</button>`).join("")}</div>
            </div>
            <label class="toggle"><input type="checkbox" id="setConf" ${set.conf ? "checked" : ""}> 답을 고른 뒤 확신도 묻기 <span class="muted small">(확실·애매·찍음 → 복습 간격에 반영)</span></label>
            <label class="toggle"><input type="checkbox" id="setAbbr" ${set.abbr !== false ? "checked" : ""}> 영어 약어 풀이 <span class="muted small">(약어에 밑줄 — 누르면 풀어 쓴 말과 뜻, 문제 아래 약어 목록)</span></label>
            <label class="toggle"><input type="checkbox" id="setRecall" ${set.recall ? "checked" : ""}> 먼저 떠올리기 <span class="muted small">(보기를 가린 채 답을 먼저 떠올린 뒤 보기 열기)</span></label>
          </div>
        </details>
      </section>

      <a class="card sci-link" href="#" data-go="science">
        <span>🧠</span><div><b>이 사이트의 학습 원리</b><div class="muted small">인출 연습 · 간격 반복 · 교차 학습 · 확신도와 착각 교정 — 근거 논문 보기</div></div><span class="lab-go">›</span>
      </a>`;

    const $ = id => document.getElementById(id);
    if ($("todayBtn")) $("todayBtn").onclick = () => startQuiz(interleave(p.due.slice(0, SESSION_DUE_MAX).concat(p.todayNew)), "오늘의 학습", "today");
    if ($("extraBtn")) $("extraBtn").onclick = () => {
      const extra = p.fresh.slice(0, 10);
      const list = extra.length ? extra : pickQuestions({ ...opts, exam: "", domain: "", freq: 0, count: 10, source: "smart" });
      startQuiz(interleave(list), "더 풀기", "today");
    };
    if ($("hyperBtn")) $("hyperBtn").onclick = () => startQuiz(shuffle(hyper), "착각 교정", "custom");
    if ($("examSel")) $("examSel").onchange = e => { opts.exam = e.target.value; };
    if ($("domainSel")) $("domainSel").onchange = e => { opts.domain = e.target.value; };
    if ($("freqSel")) $("freqSel").onchange = e => { opts.freq = +e.target.value; };
    $("customBox").ontoggle = e => { opts.open = e.target.open; };
    document.querySelectorAll("#catSeg button").forEach(b => b.onclick = () => {
      opts.category = b.dataset.c; opts.exam = ""; opts.domain = ""; opts.freq = 0;
      saveCat(opts.category); renderHome();
    });
    document.querySelectorAll("#countSeg button").forEach(b => b.onclick = () => { opts.count = +b.dataset.n; renderHome(); });
    document.querySelectorAll("#srcSeg button").forEach(b => b.onclick = () => { opts.source = b.dataset.s; renderHome(); });
    document.querySelectorAll("#newSeg button").forEach(b => b.onclick = () => { store.settings.newPerDay = +b.dataset.v; save(); renderHome(); });
    $("setConf").onchange = e => { store.settings.conf = e.target.checked; save(); };
    $("setRecall").onchange = e => { store.settings.recall = e.target.checked; save(); };
    $("setAbbr").onchange = e => { store.settings.abbr = e.target.checked; save(); };
    $("startBtn").onclick = () => {
      const list = pickQuestions(opts);
      if (!list.length) {
        $("startMsg").textContent = opts.source === "wrong" ? "오답노트가 비어 있어요. 먼저 문제를 풀어보세요!" : "조건에 맞는 문제가 없습니다.";
        return;
      }
      const base = opts.domain || opts.exam || catName(opts.category);
      startQuiz(opts.source === "random" ? list : interleave(list), opts.source === "wrong" ? "오답노트" : base + (opts.freq ? ` · ${opts.freq}회 이상` : ""), "custom");
    };
  }

  function pickQuestions({ category, exam, domain, freq, count, source }) {
    let pool = BANK.filter(q => catOf(q) === category && (!exam || q.exam === exam) && (!domain || q.domain === domain) && (q.freq || 0) >= (freq || 0));
    if (source === "wrong") pool = pool.filter(q => store.wrong[q.id]);
    let ordered;
    if (source === "smart") {
      // 약한 문제 우선: 착각 > 오답노트 > 복습 시기 지남 > 안 푼 문제 > 낮은 단계
      const t = dayNum();
      const score = q => {
        const r = store.srs[q.id];
        if (r && r.hyper) return 0;
        if (store.wrong[q.id]) return 1;
        if (r && r.due <= t) return 2;
        if (!r) return 3;
        return 4 + r.lv;
      };
      ordered = shuffle(pool).sort((a, b) => score(a) - score(b));
    } else {
      ordered = shuffle(pool);
    }
    return count ? ordered.slice(0, count) : ordered;
  }

  // ---------- 퀴즈 ----------
  let quiz = null;

  function startQuiz(list, label, mode) {
    quiz = { list: list.slice(), re: list.map(() => false), label, mode: mode || "custom", i: 0, results: [], relearned: {}, answered: false };
    renderQuestion();
    window.scrollTo(0, 0);
  }

  function renderQuestion() {
    const q = quiz.list[quiz.i];
    const re = quiz.re[quiz.i];
    const total = quiz.list.length;
    quiz.answered = false;
    quiz.picked = new Set();
    quiz.pending = null;
    quiz.hint = { elim: [], clue: false };
    const inNote = store.wrong[q.id];
    const r = store.srs[q.id];
    const recall = store.settings.recall && isMC(q) && !re;
    quiz.qAb = new Set();
    const qHTML = abbrHTML(q.question, quiz.qAb);
    const kind = re ? `<span class="tag re">🔁 다시 한 번</span>` : !r ? `<span class="tag new">새 문제</span>` : `<span class="tag">복습 · ${MEM[memLevel(r)]}</span>`;

    app.innerHTML = `
      <section class="card">
        <div class="qhead">
          <span>${esc(quiz.label)} · ${quiz.i + 1} / ${total}</span>
          <span>${kind}${freqTag(q)}${q.no ? `<span class="tag">원본 ${q.no}번</span>` : ""}${inNote ? `<span class="tag bad">오답노트</span>` : ""}${r && r.hyper ? `<span class="tag hot">🔥 착각 교정</span>` : ""}</span>
        </div>
        <div class="progress"><div style="width:${quiz.i / total * 100}%"></div></div>
        ${(q.domain || q.exam) ? `<div class="muted" style="font-size:13px">${esc(q.domain || q.exam)}</div>` : ""}
        <div class="qtext">${qHTML}</div>
        ${abbrBox(quiz.qAb, "문제 속 약어")}
        ${q.image ? `<a href="${esc(q.image)}" target="_blank" rel="noopener" class="qimg-link"><img class="qimg" src="${esc(q.image)}" alt="문제 그림" loading="lazy"></a><div class="muted small qimg-hint">그림을 누르면 크게 볼 수 있어요.</div>` : ""}
        ${recall ? `
          <div class="recall-box" id="recallBox">
            <div>💭 보기를 보기 전에 답을 먼저 떠올려 보세요.</div>
            <button class="btn block" id="revealBtn">떠올렸어요 · 보기 열기 <span class="muted small">(Space)</span></button>
          </div>` : ""}
        ${isMC(q) ? `
          <div class="choices" id="choices" ${recall ? "hidden" : ""}>
            ${q.choices.map((c, k) => `<button class="choice" data-k="${k + 1}"><span class="num">${NUMS[k] || k + 1}</span><span>${esc(c)}</span></button>`).join("")}
          </div>
          ${isMulti(q) ? `
          <button class="btn primary block" id="multiBtn" style="margin-top:12px" disabled ${recall ? "hidden" : ""}>정답 ${q.answer.length}개를 고르세요 (0/${q.answer.length})</button>` : ""}` : `
          <div class="row">
            <input type="text" id="shortInput" placeholder="정답을 입력하세요" autocomplete="off" style="flex:3">
            <button class="btn primary" id="shortBtn" style="flex:1">확인</button>
          </div>`}
        ${hintMax(q) ? `
        <div class="hint-area" id="hintArea" ${recall ? "hidden" : ""}>
          <div id="hintBox"></div>
          <button class="btn small hint-btn" id="hintBtn">💡 힌트 보기 <span class="muted">(0/${hintMax(q)})</span></button>
        </div>` : ""}
        <div id="confBox" class="conf" hidden>
          <div class="conf-q">얼마나 확신하나요?</div>
          <div class="conf-btns">
            ${Object.entries(CONF).map(([k, tx], i) => `<button class="conf-${k}" data-c="${k}"><b>${i + 1}</b> ${tx}</button>`).join("")}
          </div>
        </div>
        <div class="kbd-hint" id="kbdHint">${kbdHint(q)}</div>
        <div id="fb"></div>
      </section>
      <div class="row">
        <button class="btn danger small" id="quitBtn" style="flex:0 0 auto">그만 풀기</button>
      </div>`;

    if (isMulti(q)) {
      app.querySelectorAll(".choice").forEach(b => b.onclick = () => togglePick(+b.dataset.k));
      document.getElementById("multiBtn").onclick = () => choose([...quiz.picked]);
    } else if (isMC(q)) {
      app.querySelectorAll(".choice").forEach(b => b.onclick = () => choose(+b.dataset.k));
    } else {
      const inp = document.getElementById("shortInput");
      inp.focus();
      document.getElementById("shortBtn").onclick = () => choose(inp.value);
    }
    const rv = document.getElementById("revealBtn");
    if (rv) rv.onclick = reveal;
    const hb = document.getElementById("hintBtn");
    if (hb) hb.onclick = useHint;
    app.querySelectorAll("#confBox button").forEach(b => b.onclick = () => finalize(quiz.pending, b.dataset.c));
    document.getElementById("quitBtn").onclick = () => {
      if (quiz.results.length) renderResult(); else go("home");
    };
  }

  function kbdHint(q) {
    const conf = store.settings.conf;
    if (!isMC(q)) return `Enter로 제출${conf ? " · 1~3 확신도" : ""} · 다시 Enter로 다음`;
    return `키보드: 숫자키로 ${isMulti(q) ? "선택/해제 · Enter로 제출" : "선택"}${conf ? " · 이어서 1~3으로 확신도" : ""}${hintMax(q) ? " · H 힌트" : ""} · Enter로 다음`;
  }

  function reveal() {
    const box = document.getElementById("recallBox");
    if (!box) return;
    box.remove();
    document.getElementById("choices").hidden = false;
    const mb = document.getElementById("multiBtn");
    if (mb) mb.hidden = false;
    const ha = document.getElementById("hintArea");
    if (ha) ha.hidden = false;
  }

  // 힌트: ① 오답 하나 지우고 그 이유 → ② 하나 더 → ③ 핵심 단서(정답 글자는 가림)
  function useHint() {
    if (quiz.answered || quiz.pending != null || document.getElementById("recallBox")) return;
    const q = quiz.list[quiz.i];
    const max = hintMax(q);
    if (hintCount() >= max) return;
    const px = parseExpl(q);
    const ans = mcAnswers(q);
    const elimMax = Math.max(0, q.choices.length - ans.length - 1);
    const box = document.getElementById("hintBox");
    if (quiz.hint.elim.length < elimMax) {
      const cand = q.choices.map((_, i) => i + 1).filter(k => !ans.includes(k) && !quiz.hint.elim.includes(k) && !quiz.picked.has(k));
      const pool = cand.length ? cand : q.choices.map((_, i) => i + 1).filter(k => !ans.includes(k) && !quiz.hint.elim.includes(k));
      const k = pool[Math.floor(Math.random() * pool.length)];
      quiz.hint.elim.push(k);
      if (quiz.picked.has(k)) { quiz.picked.delete(k); if (isMulti(q)) togglePick(-1); }
      const b = app.querySelector(`.choice[data-k="${k}"]`);
      b.classList.add("elim"); b.classList.remove("picked"); b.disabled = true;
      box.insertAdjacentHTML("beforeend", `<div class="hint-item"><b>🙅 ${NUMS[k - 1]}은(는) 답이 아니에요.</b> ${abbrHTML(px.per[k - 1])}</div>`);
    } else if (!quiz.hint.clue) {
      quiz.hint.clue = true;
      box.insertAdjacentHTML("beforeend", `<div class="hint-item clue"><b>🔎 핵심 단서</b> <span class="muted small">(정답에 가까운 힌트)</span><br> ${abbrHTML(clueText(q))}</div>`);
    }
    const btn = document.getElementById("hintBtn");
    const used = hintCount();
    btn.innerHTML = used >= max ? "힌트를 모두 봤어요" : `💡 힌트 하나 더 <span class="muted">(${used}/${max})</span>`;
    btn.disabled = used >= max;
  }

  function togglePick(k) {
    if (quiz.answered || quiz.pending != null) return;
    const q = quiz.list[quiz.i];
    const need = q.answer.length;
    if (k < 0) { /* 표시만 갱신 */ }
    else if (quiz.hint.elim.includes(k)) return;
    else if (quiz.picked.has(k)) quiz.picked.delete(k);
    else if (quiz.picked.size < need) quiz.picked.add(k);
    app.querySelectorAll(".choice").forEach(b => b.classList.toggle("picked", quiz.picked.has(+b.dataset.k)));
    const btn = document.getElementById("multiBtn");
    btn.disabled = quiz.picked.size !== need;
    btn.textContent = quiz.picked.size === need ? "정답 확인" : `정답 ${need}개를 고르세요 (${quiz.picked.size}/${need})`;
  }

  // 답 고르기 → (확신도 묻기) → 채점
  function choose(given) {
    if (quiz.answered) return;
    const q = quiz.list[quiz.i];
    if (isMC(q) && !isMulti(q) && quiz.hint.elim.includes(+given)) return;
    if (isMulti(q) && (!Array.isArray(given) || given.length !== q.answer.length)) return;
    if (!isMC(q) && !String(given).trim()) return;
    if (!store.settings.conf || quiz.re[quiz.i]) return finalize(given, null);
    quiz.pending = given;
    if (isMC(q) && !isMulti(q)) app.querySelectorAll(".choice").forEach(b => b.classList.toggle("picked", +b.dataset.k === +given));
    const mb = document.getElementById("multiBtn"); if (mb) mb.disabled = true;
    const box = document.getElementById("confBox");
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function finalize(given, conf) {
    if (quiz.answered || given == null) return;
    const q = quiz.list[quiz.i];
    const re = quiz.re[quiz.i];
    let ok;
    if (isMC(q)) {
      const correct = mcAnswers(q);
      const chosen = (Array.isArray(given) ? given : [given]).map(Number).sort((a, b) => a - b);
      ok = chosen.length === correct.length && correct.every(k => chosen.includes(k));
      given = isMulti(q) ? chosen : chosen[0];
      app.querySelectorAll(".choice").forEach(b => {
        const k = +b.dataset.k;
        b.disabled = true;
        b.classList.remove("picked");
        if (correct.includes(k)) b.classList.add("correct");
        else if (chosen.includes(k)) b.classList.add("wrong");
      });
      const mb = document.getElementById("multiBtn");
      if (mb) mb.remove();
    } else {
      ok = shortAnswers(q).some(a => norm(a) === norm(given));
      document.getElementById("shortInput").disabled = true;
      document.getElementById("shortBtn").disabled = true;
    }
    document.getElementById("confBox").hidden = true;
    document.getElementById("kbdHint").textContent = "Enter로 다음";
    const ha = document.getElementById("hintArea");
    if (ha) { const hb = document.getElementById("hintBtn"); if (hb) hb.remove(); if (!quiz.hint.elim.length && !quiz.hint.clue) ha.remove(); }
    quiz.answered = true;
    const hints = hintCount();
    // 힌트를 2개 이상 쓰고 맞힌 것은 '찍음'과 같게(내일 다시), 1개면 단계를 올리지 않음
    const effConf = ok && hints >= 2 ? "guess" : conf;
    const res = record(q, ok, given, effConf, re, hints > 0);
    const px = isMC(q) ? parseExpl(q) : null;
    const restAb = new Set();
    if (isMC(q)) app.querySelectorAll(".choice").forEach(b => {
      const k = +b.dataset.k;
      const sp = b.querySelector("span:last-child");
      sp.innerHTML = abbrHTML(q.choices[k - 1], restAb) + (px ? `<span class="why-line">${abbrHTML(px.per[k - 1], restAb)}</span>` : "");
    });

    // 틀렸거나 찍어서 맞힌 문제는 같은 회차 안에서 몇 문제 뒤 한 번 더(연속 재학습)
    let reMsg = "";
    if ((!ok || effConf === "guess") && (quiz.relearned[q.id] || 0) < 2) {
      quiz.relearned[q.id] = (quiz.relearned[q.id] || 0) + 1;
      const at = Math.min(quiz.i + 1 + RELEARN_GAP, quiz.list.length);
      quiz.list.splice(at, 0, q); quiz.re.splice(at, 0, true);
      reMsg = "🔁 이 문제는 몇 문제 뒤에 한 번 더 나옵니다.";
    }

    const msgs = [];
    if (!re && conf === "sure" && !ok) msgs.push(`<div class="fb-note hyper"><b>🔥 착각 발견</b> — 확신했던 오답은 피드백을 받으면 오히려 잘 고쳐집니다. 해설을 읽고 <b>왜 그렇게 생각했는지</b> 한 줄로 짚어 보세요.</div>`);
    if (!re && conf === "guess" && ok) msgs.push(`<div class="fb-note">🎲 맞혔지만 찍었어요. 아직 아는 것이 아니라서 내일 다시 나옵니다.</div>`);
    else if (!re && ok && hints >= 2) msgs.push(`<div class="fb-note">💡 힌트 ${hints}개로 맞혔어요. 혼자 떠올린 것이 아니라서 내일 다시 나옵니다.</div>`);
    else if (!re && ok && hints === 1) msgs.push(`<div class="fb-note">💡 힌트 1개를 썼어요. 이번에는 복습 간격을 늘리지 않습니다.</div>`);
    if (reMsg) msgs.push(`<div class="fb-note">${reMsg}</div>`);
    if (!re && res.srs) msgs.push(`<div class="muted small">📅 다음 복습: ${inDays(res.srs.due - dayNum())} (${fmtDate(res.srs.due)}) · ${MEM[memLevel(res.srs)]}</div>`);
    if (re && ok) msgs.push(`<div class="muted small">👍 다시 꺼내는 데 성공했어요. 복습 일정은 처음 답 기준으로 유지됩니다.</div>`);
    const note = store.wrong[q.id];
    if (!re && !ok) msgs.push(`<div class="muted small">📒 오답노트에 저장했어요.</div>`);
    else if (!re && note) msgs.push(`<div class="muted small">📒 오답노트: 서로 다른 날 연속 정답 ${note.streak || 0}/${CLEAR_STREAK}</div>`);
    else if (res.graduated) msgs.push(`<div class="muted small">🎉 오답노트에서 졸업했어요!</div>`);

    const last = quiz.i === quiz.list.length - 1;
    document.getElementById("fb").innerHTML = `
      <div class="feedback ${ok ? "good" : "bad"}">
        <div class="title">${ok ? "⭕ 정답입니다!" : "❌ 틀렸습니다"}${conf ? ` <span class="muted small">· ${CONF[conf]}</span>` : ""}</div>
        <div class="answer-line">정답: <b>${esc(answerText(q))}</b>${!ok ? ` <span class="muted">(내 답: ${esc(givenText(q, given))})</span>` : ""}</div>
        ${px ? whyHTML(q, px, given, ok, restAb) : q.explanation ? `<div class="why"><b>💡 이유</b>\n${abbrHTML(q.explanation, restAb)}</div>` : ""}
        ${abbrBox(restAb, "보기·해설 속 약어", quiz.qAb)}
        ${q.seen && q.seen.length ? `<div class="muted seen">🗓 출제: ${esc(q.seen.join(", "))}</div>` : ""}
        <div class="fb-msgs">${msgs.join("")}</div>
      </div>
      <button class="btn primary block" id="nextBtn" style="margin-top:12px">${last ? "결과 보기" : "다음 문제 →"}</button>`;
    document.getElementById("nextBtn").onclick = next;
    document.getElementById("nextBtn").focus({ preventScroll: true });
  }

  // 채점 뒤: 내가 고른 보기가 왜 답이 아닌지 → 정답인 이유 → 핵심
  function whyHTML(q, px, given, ok, found) {
    const ans = mcAnswers(q);
    const chosen = (Array.isArray(given) ? given : [given]).map(Number);
    const wrongPicked = chosen.filter(k => !ans.includes(k));
    const missed = ans.filter(k => !chosen.includes(k));
    const item = (k) => `<div class="why-item"><span class="num">${NUMS[k - 1]}</span> <b>${abbrHTML(q.choices[k - 1], found)}</b><div>${abbrHTML(px.per[k - 1], found)}</div></div>`;
    return `
      ${wrongPicked.length ? `<div class="why-box not"><div class="why-h">❓ 내가 고른 답이 정답이 아닌 이유</div>${wrongPicked.map(item).join("")}</div>` : ""}
      <div class="why-box yes"><div class="why-h">✅ ${ok ? "정답인 이유" : missed.length && missed.length < ans.length ? "놓친 정답" : "정답인 이유"}</div>${(ok ? ans : (missed.length ? missed : ans)).map(item).join("")}</div>
      ${px.head ? `<div class="why"><b>💡 핵심</b>\n${abbrHTML(px.head, found)}</div>` : ""}
      ${px.tail ? `<div class="why muted">${abbrHTML(px.tail, found)}</div>` : ""}
      <div class="muted small" style="margin-top:6px">다른 보기가 왜 답이 아닌지는 위 보기마다 적어 두었어요.</div>`;
  }

  function record(q, ok, given, conf, re, hinted) {
    let graduated = false, srs = null;
    if (!re) {
      const s = store.stats[q.id] || (store.stats[q.id] = { tries: 0, correct: 0 });
      s.tries++; if (ok) s.correct++;
      s.last = Date.now();
      const log = todayLog();
      log.n++; if (ok) log.ok++;
      if (!store.srs[q.id]) log.newBy[catOf(q)] = (log.newBy[catOf(q)] || 0) + 1;
      srs = schedule(q.id, ok, conf, hinted);
      const today = dayNum();
      if (!ok) {
        const w = store.wrong[q.id] || (store.wrong[q.id] = { count: 0, memo: "", added: Date.now() });
        w.count++; w.streak = 0; w.okDay = null; w.lastWrong = Date.now(); w.lastGiven = given;
      } else if (store.wrong[q.id] && conf !== "guess") {
        const w = store.wrong[q.id];
        if (w.okDay !== today && dayNum(w.lastWrong || 0) !== today) { w.streak = (w.streak || 0) + 1; w.okDay = today; }
        if (w.streak >= CLEAR_STREAK) { delete store.wrong[q.id]; graduated = true; }
      }
    }
    quiz.results.push({ id: q.id, ok, given, conf, re, graduated, hints: hinted ? hintCount() : 0 });
    save();
    return { graduated, srs };
  }

  function next() {
    if (quiz.i < quiz.list.length - 1) { quiz.i++; renderQuestion(); window.scrollTo(0, 0); }
    else renderResult();
  }

  // ---------- 결과 ----------
  function renderResult() {
    const all = quiz.results;
    const r = all.filter(x => !x.re);
    const correct = r.filter(x => x.ok).length;
    const wrongs = r.filter(x => !x.ok);
    const hyperN = r.filter(x => !x.ok && x.conf === "sure").length;
    const guessN = r.filter(x => x.ok && x.conf === "guess" && !x.hints).length;
    const hintN = r.filter(x => x.hints).length;
    const reOk = all.filter(x => x.re && x.ok).length, reN = all.filter(x => x.re).length;
    const pct = r.length ? Math.round(correct / r.length * 100) : 0;
    const t = dayNum();
    const cat = r.length ? catOf(BY_ID[r[0].id]) : opts.category;
    const tomorrow = inCat(cat).filter(q => store.srs[q.id] && store.srs[q.id].due === t + 1).length;
    const leftToday = plan(cat, "");
    const left = Math.min(leftToday.due.length, SESSION_DUE_MAX) + leftToday.todayNew.length;
    app.innerHTML = `
      <section class="card">
        <h2>${esc(quiz.label)} 결과</h2>
        <div class="score">${correct} / ${r.length}</div>
        <p class="muted" style="text-align:center">처음 답 기준 정답률 ${pct}%${reN ? ` · 다시 꺼내기 ${reOk}/${reN} 성공` : ""}</p>
        <div class="result-notes">
          ${hyperN ? `<div>🔥 확신했는데 틀린 문제 <b>${hyperN}</b> — 착각 교정 목록에 올렸어요.</div>` : ""}
          ${guessN ? `<div>🎲 찍어서 맞힌 문제 <b>${guessN}</b> — 내일 다시 나옵니다.</div>` : ""}
          ${hintN ? `<div>💡 힌트를 쓴 문제 <b>${hintN}</b> — 복습 간격을 늘리지 않았어요.</div>` : ""}
          <div>📅 내일 복습 예정 <b>${tomorrow}</b>문제${left ? ` · 오늘 남은 학습 ${left}문제` : ""}</div>
          <div class="muted small">💤 공부한 날 밤 잠을 자는 동안 기억이 정리·강화됩니다. 내일 다시 꺼내 보면 훨씬 오래 남아요.</div>
        </div>
        <div class="row">
          ${left ? `<button class="btn primary" id="contBtn">오늘 학습 이어서 (${left})</button>` : ""}
          ${wrongs.length ? `<button class="btn" id="retryWrong">틀린 ${wrongs.length}문제 다시 풀기</button>` : ""}
          <button class="btn" data-go="home">홈으로</button>
        </div>
      </section>
      ${wrongs.length ? `
      <section class="card">
        <h2>이번에 틀린 문제</h2>
        ${wrongs.map(x => noteItemHTML(BY_ID[x.id], x.given, false)).join("")}
      </section>` : ""}`;
    const cb = document.getElementById("contBtn");
    if (cb) cb.onclick = () => startQuiz(interleave(leftToday.due.slice(0, SESSION_DUE_MAX).concat(leftToday.todayNew)), "오늘의 학습", "today");
    const rw = document.getElementById("retryWrong");
    if (rw) rw.onclick = () => startQuiz(shuffle(wrongs.map(x => BY_ID[x.id])), "틀린 문제 다시", "custom");
    window.scrollTo(0, 0);
  }

  function noteItemHTML(q, given, editable) {
    const w = store.wrong[q.id];
    const s = store.srs[q.id];
    const gt = givenText(q, given);
    return `
      <div class="list-item" data-id="${esc(q.id)}">
        <div>${CATS.length > 1 ? `<span class="tag">${esc((CATS.find(c => c.id === catOf(q)) || {}).short || catOf(q))}</span>` : ""}${q.no ? `<span class="tag">원본 ${q.no}번</span>` : ""}${freqTag(q)}${(q.domain || q.exam) ? `<span class="tag">${esc(q.domain || q.exam)}</span>` : ""}${w ? `<span class="tag bad">${w.count}회 틀림</span>` : ""}${s && s.hyper ? `<span class="tag hot">🔥 착각</span>` : ""}</div>
        <div style="font-weight:600;margin-top:4px;white-space:pre-wrap">${abbrHTML(q.question)}</div>
        ${q.image ? `<img class="qimg small-img" src="${esc(q.image)}" alt="문제 그림" loading="lazy">` : ""}
        ${isMC(q) ? `<div class="muted">${q.choices.map((c, k) => `${NUMS[k] || k + 1} ${esc(c)}`).join("<br>")}</div>` : ""}
        ${gt ? `<div class="answer-line muted">내 답: ${esc(gt)}</div>` : ""}
        <details class="note-ans"><summary>정답과 해설 보기 <span class="muted small">(먼저 떠올려 보세요)</span></summary>
          <div class="answer-line">정답: <b>${esc(answerText(q))}</b></div>
          ${q.explanation ? `<div class="muted" style="margin-top:4px;white-space:pre-wrap">💡 ${abbrHTML(q.explanation)}</div>` : ""}
        </details>
        ${editable ? `
          <div class="field" style="margin:10px 0 6px">
            <textarea class="memo" placeholder="왜 틀렸는지 한 줄로 적어 보세요 (자동 저장)">${esc(w.memo || "")}</textarea>
          </div>
          <div class="muted" style="font-size:13px">서로 다른 날 연속 정답 ${w.streak || 0}/${CLEAR_STREAK}${s ? ` · 다음 복습 ${inDays(s.due - dayNum())}` : ""} ·
            <button class="btn small danger del">오답노트에서 삭제</button></div>` : ""}
      </div>`;
  }

  // ---------- 오답노트 ----------
  let notesCat = "";
  function renderNotes() {
    const allIds = wrongIds();
    if (notesCat && !CATS.some(c => c.id === notesCat)) notesCat = "";
    const ids = allIds.filter(id => !notesCat || catOf(BY_ID[id]) === notesCat).sort((a, b) => (!!(store.srs[b] || {}).hyper - !!(store.srs[a] || {}).hyper) || (store.wrong[b].count - store.wrong[a].count) || (store.wrong[b].lastWrong || 0) - (store.wrong[a].lastWrong || 0));
    app.innerHTML = `
      <section class="card">
        <h1>오답노트</h1>
        <p class="muted">틀린 문제가 자동으로 모입니다. 착각한 문제와 많이 틀린 문제가 위에 옵니다.
        같은 날 여러 번 맞히는 것은 기억이 아니라 단기 기억이라, <b>서로 다른 날 ${CLEAR_STREAK}번 연속</b> 맞혀야 졸업합니다.
        정답은 가려져 있으니 먼저 떠올린 뒤 펼쳐 보세요.</p>
        ${CATS.length > 1 ? `
        <div class="seg" id="noteCatSeg" style="margin-bottom:12px">
          ${[["", "전체"], ...CATS.map(c => [c.id, c.short || c.name])].map(([id, tx]) => `<button data-c="${id}" class="${notesCat === id ? "on" : ""}">${esc(tx)} (${allIds.filter(x => !id || catOf(BY_ID[x]) === id).length})</button>`).join("")}
        </div>` : ""}
        ${ids.length ? `
        <div class="row">
          <button class="btn primary" data-n="10">오답 10문제 풀기</button>
          <button class="btn primary" data-n="50">오답 50문제 풀기</button>
          <button class="btn" data-n="0">오답 전체 풀기 (${ids.length})</button>
        </div>` : ""}
      </section>
      <section class="card">
        ${ids.length ? ids.map(id => noteItemHTML(BY_ID[id], store.wrong[id].lastGiven, true)).join("") : `<div class="empty">오답노트가 비어 있어요 👍</div>`}
      </section>
      <section class="card">
        <h2>학습 기록 관리</h2>
        <p class="muted">기록(풀이·복습 일정·오답노트·외운 용어)은 이 브라우저에만 저장됩니다. 다른 기기로 옮기려면 백업 파일을 사용하세요.</p>
        <div class="row">
          <button class="btn small" id="exportBtn">백업 내보내기</button>
          <label class="btn small" style="text-align:center">백업 불러오기<input type="file" id="importInp" accept=".json" hidden></label>
          <button class="btn small danger" id="resetBtn">기록 전체 초기화</button>
        </div>
      </section>`;

    app.querySelectorAll("#noteCatSeg button").forEach(b => b.onclick = () => { notesCat = b.dataset.c; renderNotes(); });
    app.querySelectorAll("[data-n]").forEach(b => b.onclick = () => {
      const n = +b.dataset.n;
      const list = shuffle(ids.map(id => BY_ID[id]));
      startQuiz(n ? list.slice(0, n) : list, "오답노트", "custom");
    });
    app.querySelectorAll(".list-item").forEach(el => {
      const id = el.dataset.id;
      const memo = el.querySelector(".memo");
      if (memo) memo.oninput = () => { store.wrong[id].memo = memo.value; save(); };
      const del = el.querySelector(".del");
      if (del) del.onclick = () => { if (confirm("오답노트에서 삭제할까요?")) { delete store.wrong[id]; save(); renderNotes(); } };
    });
    document.getElementById("exportBtn").onclick = () => {
      const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `기출학습-백업-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    document.getElementById("importInp").onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => {
        store = normalize(JSON.parse(t));
        save(); renderNotes(); alert("불러왔습니다.");
      }).catch(() => alert("올바른 백업 파일이 아닙니다."));
    };
    document.getElementById("resetBtn").onclick = () => {
      if (confirm("모든 풀이 기록, 복습 일정, 오답노트, 외운 용어 체크를 삭제할까요? (내 단어와 설정은 유지됩니다) 되돌릴 수 없습니다.")) {
        store = { ...blank(), custom: store.custom || [], settings: store.settings }; save(); renderNotes();
      }
    };
  }

  // ---------- 용어 학습 표 ----------
  const GLOSSARY_BASE = window.GLOSSARY || [];
  const MY_CAT = "내 단어";
  const PAGE_SIZE = 20;
  const gopts = { q: "", cat: "", known: "all", hide: true, page: 1 };
  const QTEXT = BANK.map(q => (q.question + " " + (q.choices || []).join(" ")).toLowerCase());
  const relCache = new Map();

  const gsubj = () => opts.category;
  function allTerms() {
    const sub = gsubj();
    const mine = (store.custom || []).filter(c => !c.subject || c.subject === sub).map(c => ({
      id: c.id, term: c.term, ko: c.ko || "내가 추가한 단어", cat: MY_CAT,
      meaning: c.meaning, tip: c.tip || "", alias: [], source: c.source || "", custom: true
    }));
    return mine.concat(GLOSSARY_BASE.filter(g => (g.subject || "aws") === sub));
  }

  function relatedIds(g) {
    const sub = g.subject || gsubj();
    const key = sub + "|" + g.id + "|" + g.term;
    if (relCache.has(key)) return relCache.get(key);
    const keys = [g.term.replace(/\s*\(.*?\)\s*/g, " ").trim(), ...g.alias].map(k => k.toLowerCase()).filter(k => k.length >= 2);
    const tests = keys.map(k => /^[a-z0-9 .\-]+$/.test(k)
      ? (t => new RegExp("(^|[^a-z0-9])" + k.replace(/[.\-]/g, "\\$&") + "($|[^a-z0-9])").test(t))
      : (t => t.includes(k)));
    const ids = BANK.filter((q, i) => catOf(q) === sub && tests.some(f => f(QTEXT[i]))).map(q => q.id);
    relCache.set(key, ids);
    return ids;
  }

  function glossaryRows() {
    const q = gopts.q.trim().toLowerCase();
    return allTerms().filter(g =>
      (!gopts.cat || g.cat === gopts.cat) &&
      (gopts.known === "all" || (gopts.known === "known") === !!store.known[g.id]) &&
      (!q || [g.term, g.ko, g.meaning, g.tip, ...g.alias].join(" ").toLowerCase().includes(q)));
  }

  function pagerHTML(page, pages) {
    if (pages <= 1) return "";
    const nums = [];
    for (let n = 1; n <= pages; n++) {
      if (n === 1 || n === pages || Math.abs(n - page) <= 1) nums.push(n);
      else if (nums[nums.length - 1] !== "…") nums.push("…");
    }
    return `<nav class="pager">
      <button data-page="${page - 1}" ${page === 1 ? "disabled" : ""}>‹ 이전</button>
      ${nums.map(n => n === "…" ? `<span class="gap">…</span>` : `<button data-page="${n}" class="${n === page ? "on" : ""}">${n}</button>`).join("")}
      <button data-page="${page + 1}" ${page === pages ? "disabled" : ""}>다음 ›</button>
    </nav>`;
  }

  function renderGlossary() {
    const terms = allTerms();
    const knownCount = terms.filter(g => store.known[g.id]).length;
    const cats = [MY_CAT, ...(window.GLOSSARY_CATEGORIES || [])];
    const isNet = gsubj() !== "aws";
    const GT = {
      aws: { intro: "기출에 나온 AWS 용어", ex: "예: Kinesis, 서브넷, NAT 게이트웨이", q: "표에서 검색 (예: S3, 캐시, 라이선스)" },
      net2: { intro: "네트워크관리사 용어(라우팅·RIP·OSPF·서브넷·DHCP 등)", ex: "예: VRRP, 서브넷, 스위칭 허브", q: "표에서 검색 (예: OSPF, 224.0.0.5, AD)" },
      ict: { intro: "정보통신 유지보수 용어(고시·설비·도면·광통신·이동통신)", ex: "예: OTDR, 헤드엔드, 계통도", q: "표에서 검색 (예: 성능점검, PON, RSRP)" }
    }[gsubj()] || {};
    const baseN = terms.filter(g => !g.custom).length, mineN = terms.length - baseN;
    app.innerHTML = `
      <section class="card">
        <h1>용어 학습 표</h1>
        <div class="seg cat-seg" id="glSubj">
          ${CATS.map(c => `<button data-c="${c.id}" class="${gsubj() === c.id ? "on" : ""}"><span class="full">${esc(c.name)}</span><span class="short">${esc(c.short || c.name)}</span><small>${GLOSSARY_BASE.filter(g => (g.subject || "aws") === c.id).length}개</small></button>`).join("")}
        </div>
        <p class="muted">${GT.intro} ${baseN}개${mineN ? ` + 내 단어 ${mineN}개` : ""}.
        '뜻 가리기'로 스스로 테스트하고, 외운 용어는 체크하세요.</p>
        <div class="progress" style="margin:10px 0 4px"><div id="glBar"></div></div>
        <div class="muted" style="font-size:13px" id="glBarText"></div>
      </section>

      <section class="card">
        <h2>단어 추가 · 뜻 찾기</h2>
        <p class="muted" style="margin-top:-6px">모르는 단어를 입력하면 용어 표 → 기출 해설 → 위키백과 순서로 뜻을 찾아 줍니다. 찾은 뜻을 고쳐서 '내 단어'로 저장하세요.</p>
        <div class="row">
          <input type="text" id="lkWord" placeholder="${GT.ex}" autocomplete="off" style="flex:3">
          <button class="btn primary" id="lkBtn" style="flex:1">뜻 찾기</button>
        </div>
        <div id="lkResult"></div>
      </section>

      <section class="card gl-controls">
        <input type="text" id="glSearch" placeholder="${GT.q}" value="${esc(gopts.q)}" autocomplete="off">
        <div class="row" style="margin-top:10px">
          <select id="glCat" style="flex:2">
            <option value="">전체 분류</option>
            ${cats.map(c => { const n = terms.filter(g => g.cat === c).length; return n ? `<option value="${esc(c)}" ${gopts.cat === c ? "selected" : ""}>${esc(c)} (${n})</option>` : ""; }).join("")}
          </select>
          <select id="glKnown" style="flex:1">
            ${[["all", "전체"], ["unknown", "못 외운 것"], ["known", "외운 것"]].map(([k, t]) => `<option value="${k}" ${gopts.known === k ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <label class="toggle"><input type="checkbox" id="glHide" ${gopts.hide ? "checked" : ""}> 뜻 가리기 (눌러서 확인)</label>
      </section>
      <section class="card" id="glList"></section>`;

    const updateKnownBar = () => {
      const all = allTerms();
      const n = all.filter(g => store.known[g.id]).length;
      document.getElementById("glBar").style.width = (all.length ? n / all.length * 100 : 0) + "%";
      document.getElementById("glBarText").textContent = `외운 용어 ${n} / ${all.length}`;
    };
    updateKnownBar();

    const list = document.getElementById("glList");
    const draw = (scroll) => {
      const rows = glossaryRows();
      const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      gopts.page = Math.min(Math.max(1, gopts.page), pages);
      const start = (gopts.page - 1) * PAGE_SIZE;
      const pageRows = rows.slice(start, start + PAGE_SIZE);
      list.innerHTML = rows.length ? `
        <div class="gl-head">
          <span class="muted" style="font-size:13px">${rows.length}개 중 ${start + 1}–${start + pageRows.length}</span>
          <span class="muted" style="font-size:13px">${gopts.page} / ${pages} 페이지</span>
        </div>
        <table class="gl-table">
          <thead><tr><th style="width:26%">용어</th><th>뜻</th><th style="width:30%">시험 포인트</th><th style="width:84px">외움</th></tr></thead>
          <tbody>${pageRows.map(g => {
            const rel = relatedIds(g).length;
            return `<tr data-id="${esc(g.id)}" class="${store.known[g.id] ? "known" : ""}">
              <td class="gl-term"><b>${esc(g.term)}</b><div class="muted">${esc(g.ko)}</div><span class="tag ${g.custom ? "mine" : ""}">${esc(g.cat)}</span>
                ${g.custom ? `<div class="gl-mine-actions"><button class="link gl-edit">수정</button> · <button class="link danger gl-del">삭제</button></div>` : ""}</td>
              <td class="gl-meaning ${gopts.hide ? "hidden" : ""}" data-label="뜻"><span>${esc(g.meaning)}</span>
                ${g.source ? `<a class="muted src" href="${esc(g.source)}" target="_blank" rel="noopener">출처 ↗</a>` : ""}</td>
              <td class="gl-tip ${gopts.hide ? "hidden" : ""}" data-label="시험 포인트"><span>${g.tip ? "💡 " + esc(g.tip) : `<span class="muted">-</span>`}</span>
                ${rel ? `<button class="btn small gl-quiz">관련 기출 ${rel}문제 풀기</button>` : ""}</td>
              <td class="gl-known"><label><input type="checkbox" class="gl-check" ${store.known[g.id] ? "checked" : ""}> 외웠어요</label></td>
            </tr>`;
          }).join("")}</tbody>
        </table>
        ${pagerHTML(gopts.page, pages)}` : `<div class="empty">조건에 맞는 용어가 없어요.</div>`;

      list.querySelectorAll(".pager button[data-page]").forEach(b => b.onclick = () => { gopts.page = +b.dataset.page; draw(true); });
      list.querySelectorAll("tr[data-id]").forEach(tr => {
        const g = allTerms().find(x => x.id === tr.dataset.id);
        tr.querySelectorAll(".hidden").forEach(td => td.onclick = () => td.classList.remove("hidden"));
        tr.querySelector(".gl-check").onchange = e => {
          if (e.target.checked) store.known[g.id] = true; else delete store.known[g.id];
          save();
          if (gopts.known !== "all") draw();
          else { tr.classList.toggle("known", e.target.checked); updateKnownBar(); }
        };
        const qb = tr.querySelector(".gl-quiz");
        if (qb) qb.onclick = e => { e.stopPropagation(); startQuiz(shuffle(relatedIds(g).map(id => BY_ID[id])), `용어: ${g.term}`); window.scrollTo(0, 0); };
        const ed = tr.querySelector(".gl-edit");
        if (ed) ed.onclick = () => {
          document.getElementById("lkWord").value = g.term;
          showEditor({ term: g.term, meaning: g.meaning, tip: g.tip, source: g.source, editId: g.id });
          document.getElementById("lkWord").scrollIntoView({ behavior: "smooth", block: "center" });
        };
        const dl = tr.querySelector(".gl-del");
        if (dl) dl.onclick = () => {
          if (!confirm(`'${g.term}'을(를) 내 단어에서 삭제할까요?`)) return;
          store.custom = store.custom.filter(c => c.id !== g.id);
          delete store.known[g.id];
          if (!store.custom.length && gopts.cat === MY_CAT) gopts.cat = "";
          save(); renderGlossary();
        };
      });
      if (scroll) list.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    draw();

    document.querySelectorAll("#glSubj button").forEach(b => b.onclick = () => {
      if (opts.category === b.dataset.c) return;
      opts.category = b.dataset.c; opts.exam = ""; opts.domain = ""; opts.freq = 0; saveCat(b.dataset.c);
      gopts.cat = ""; gopts.q = ""; gopts.page = 1;
      renderGlossary();
    });
    const search = document.getElementById("glSearch");
    search.oninput = () => { gopts.q = search.value; gopts.page = 1; draw(); };
    document.getElementById("glCat").onchange = e => { gopts.cat = e.target.value; gopts.page = 1; draw(); };
    document.getElementById("glKnown").onchange = e => { gopts.known = e.target.value; gopts.page = 1; draw(); };
    document.getElementById("glHide").onchange = e => { gopts.hide = e.target.checked; draw(); };

    // ── 단어 추가 · 뜻 찾기 ──
    const lkWord = document.getElementById("lkWord");
    const lkResult = document.getElementById("lkResult");
    const runLookup = () => { const w = lkWord.value.trim(); if (w) lookup(w); };
    document.getElementById("lkBtn").onclick = runLookup;
    lkWord.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); runLookup(); } };

    let lookupSeq = 0;
    function lookup(word) {
      const seq = ++lookupSeq;
      const w = word.toLowerCase();
      const local = allTerms().filter(g => [g.term, g.ko, ...g.alias].some(s => s.toLowerCase().includes(w) || (s.length >= 2 && w.includes(s.toLowerCase())))).slice(0, 3);
      const snippets = [];
      for (const q of BANK) {
        if (!q.explanation || snippets.length >= 3 || catOf(q) !== gsubj()) continue;
        const line = q.explanation.split("\n").find(l => l.toLowerCase().includes(w));
        if (line) snippets.push({ no: q.no, text: line.replace(/^[·\s]+/, "") });
      }
      const qCount = QTEXT.filter((t, i) => catOf(BANK[i]) === gsubj() && t.includes(w)).length;
      const enc = encodeURIComponent(word);

      lkResult.innerHTML = `
        ${local.length ? `<div class="lk-block"><div class="lk-title">📘 용어 표에 있어요</div>
          ${local.map(g => `<div class="lk-item"><b>${esc(g.term)}</b> <span class="muted">${esc(g.ko)}</span><div>${esc(g.meaning)}</div>
            <button class="link lk-show" data-term="${esc(g.term)}">표에서 보기</button></div>`).join("")}</div>` : ""}
        ${snippets.length ? `<div class="lk-block"><div class="lk-title">📝 ${gsubj() === "ict" ? "예상문제" : "기출"} 해설에서 찾았어요 ${qCount ? `<span class="muted">(문제·보기 ${qCount}곳에 등장)</span>` : ""}</div>
          ${snippets.map((s, i) => `<div class="lk-item">${s.no ? `<span class="tag">원본 ${s.no}번</span> ` : ""}${esc(s.text)} <button class="link lk-snip" data-i="${i}">이 문장 사용</button></div>`).join("")}</div>` : ""}
        <div class="lk-block" id="lkWiki"><div class="lk-title">🌐 위키백과</div><div class="muted">찾는 중…</div></div>
        <div class="lk-links muted">더 찾아보기:
          ${isNet ? "" : `<a href="https://docs.aws.amazon.com/search/doc-search.html?searchPath=documentation&searchQuery=${enc}" target="_blank" rel="noopener">AWS 공식 문서 ↗</a> ·`}
          <a href="https://www.google.com/search?q=${encodeURIComponent(({ aws: "AWS ", net2: "네트워크 ", ict: "정보통신 " }[gsubj()] || "") + word)}" target="_blank" rel="noopener">Google ↗</a>
        </div>
        <div id="lkEditor"></div>`;

      lkResult.querySelectorAll(".lk-snip").forEach(b => b.onclick = () => {
        const m = document.getElementById("edMeaning");
        m.value = (m.value.trim() ? m.value.trim() + "\n" : "") + snippets[+b.dataset.i].text;
      });
      lkResult.querySelectorAll(".lk-show").forEach(b => b.onclick = () => {
        gopts.q = b.dataset.term; gopts.cat = ""; gopts.known = "all"; gopts.page = 1;
        renderGlossary();
        document.getElementById("glList").scrollIntoView({ behavior: "smooth" });
      });

      const existing = (store.custom || []).find(c => c.term.toLowerCase() === w);
      showEditor(existing ? { ...existing, editId: existing.id } : { term: word, meaning: "", tip: "", source: "" });

      fetchWiki(word).then(r => {
        if (seq !== lookupSeq) return;
        const box = document.getElementById("lkWiki");
        if (!box) return;
        if (!r) { box.innerHTML = `<div class="lk-title">🌐 위키백과</div><div class="muted">위키백과에서 찾지 못했어요. 위 링크로 더 찾아보거나 뜻을 직접 입력하세요.</div>`; return; }
        box.innerHTML = `<div class="lk-title">🌐 위키백과 <span class="muted">(${r.lang === "ko" ? "한국어" : "영어"})</span></div>
          <div class="lk-item"><b>${esc(r.title)}</b><div>${esc(r.extract)}</div>
          <a class="muted" href="${esc(r.url)}" target="_blank" rel="noopener">위키백과에서 보기 ↗</a>
          <button class="link lk-use">이 뜻 사용하기</button></div>`;
        box.querySelector(".lk-use").onclick = () => {
          document.getElementById("edMeaning").value = r.extract;
          document.getElementById("edSource").value = r.url;
        };
        const m = document.getElementById("edMeaning");
        if (m && !m.value.trim() && !existing) { m.value = r.extract; document.getElementById("edSource").value = r.url; }
      }).catch(() => {
        if (seq !== lookupSeq) return;
        const box = document.getElementById("lkWiki");
        if (box) box.innerHTML = `<div class="lk-title">🌐 위키백과</div><div class="muted">위키백과에 연결하지 못했어요(인터넷 연결 확인). 뜻을 직접 입력해도 됩니다.</div>`;
      });
    }

    function showEditor({ term, meaning, tip, source, editId }) {
      const box = document.getElementById("lkEditor") || (lkResult.innerHTML = `<div id="lkEditor"></div>`, document.getElementById("lkEditor"));
      box.innerHTML = `
        <div class="lk-editor">
          <div class="lk-title">${editId ? "✏️ 내 단어 수정" : "➕ 내 단어로 저장"}</div>
          <div class="field"><label>단어</label><input type="text" id="edTerm" value="${esc(term)}"></div>
          <div class="field"><label>뜻</label><textarea id="edMeaning" rows="4" placeholder="뜻을 입력하거나 위에서 찾은 뜻을 사용하세요">${esc(meaning || "")}</textarea></div>
          <div class="field"><label>시험 포인트·메모 (선택)</label><input type="text" id="edTip" value="${esc(tip || "")}" placeholder="예: 'S3 + SQL' → Athena"></div>
          <input type="hidden" id="edSource" value="${esc(source || "")}">
          <div class="row">
            <button class="btn primary" id="edSave">${editId ? "수정 저장" : "저장하기"}</button>
            ${editId ? `<button class="btn" id="edCancel">취소</button>` : ""}
          </div>
          <div class="muted" id="edMsg" style="margin-top:6px;font-size:13px"></div>
        </div>`;
      const cancel = document.getElementById("edCancel");
      if (cancel) cancel.onclick = () => { box.innerHTML = ""; };
      document.getElementById("edSave").onclick = () => {
        const t = document.getElementById("edTerm").value.trim();
        const m = document.getElementById("edMeaning").value.trim();
        const msg = document.getElementById("edMsg");
        if (!t || !m) { msg.textContent = "단어와 뜻을 모두 입력하세요."; return; }
        store.custom = store.custom || [];
        const dup = store.custom.find(c => c.term.toLowerCase() === t.toLowerCase() && c.id !== editId);
        if (dup) { msg.textContent = `'${t}'은(는) 이미 내 단어에 있어요. 표에서 '수정'을 눌러 고치세요.`; return; }
        const data = { term: t, meaning: m, tip: document.getElementById("edTip").value.trim(), source: document.getElementById("edSource").value };
        if (editId) Object.assign(store.custom.find(c => c.id === editId), data);
        else store.custom.unshift({ id: "c" + Date.now(), added: Date.now(), subject: gsubj(), ...data });
        save();
        gopts.q = ""; gopts.cat = MY_CAT; gopts.known = "all"; gopts.page = 1;
        renderGlossary();
        document.getElementById("glList").scrollIntoView({ behavior: "smooth" });
      };
    }
  }

  // 위키백과 검색 → 요약 (한국어 먼저, 없으면 영어)
  async function fetchWiki(word) {
    for (const lang of ["ko", "en"]) {
      const s = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(word)}&srlimit=1&format=json&origin=*`).then(r => r.json());
      const hit = s && s.query && s.query.search && s.query.search[0];
      if (!hit) continue;
      const sum = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`).then(r => r.ok ? r.json() : null);
      if (sum && sum.extract && sum.type !== "disambiguation") {
        return { lang, title: sum.title, extract: sum.extract, url: (sum.content_urls && sum.content_urls.desktop && sum.content_urls.desktop.page) || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(hit.title)}` };
      }
    }
    return null;
  }

  // ---------- 실기 실습장 ----------
  const LABS = [
    { href: "router/", icon: "🛜", name: "라우터 콘솔 연습장", key: "routerLab.v1", total: 14,
      desc: "Cisco IOS 명령어를 콘솔에 직접 입력 · 정적 경로, RIPv2, OSPF, EIGRP, DHCP, PAT, ACL, SSH, ROMMON 복구" },
    { href: "windows/", icon: "🪟", name: "윈도우 서버 실습장", key: "winlab.done", total: 21,
      desc: "Windows Server 2016 관리 도구 화면 · TCP/IP, DNS, DHCP, IIS·FTP, Active Directory, 보안 정책, 공유·NTFS, 방화벽" },
    { href: "linux/", icon: "🐧", name: "리눅스 서버 실습장", key: "lxlab.done", total: 21,
      desc: "CentOS 7 터미널 · 권한·사용자, ifcfg·nmcli, systemctl·firewalld, SSH·httpd, yum·rpm, mount·fstab, cron, vi" }
  ];
  function labDone(l) {
    try {
      const v = JSON.parse(localStorage.getItem(l.key)) || {};
      const d = l.key === "routerLab.v1" ? (v.done || {}) : v;
      return Object.keys(d).filter(k => d[k] && k !== "0" && k !== "free").length;
    } catch (e) { return 0; }
  }
  function renderLabs() {
    app.innerHTML = `
      <section class="card">
        <h1>실기 실습장</h1>
        <p class="muted">네트워크관리사 2급 실기 범위를 직접 해 보고 자동 채점받는 연습 도구입니다.
        과제를 고르고 설정을 마친 뒤 [채점하기]를 누르면 틀린 항목의 기대 값과 현재 값이 함께 나옵니다.
        완료 표시는 이 기기에만 저장됩니다.</p>
      </section>
      ${LABS.map(l => { const d = Math.min(labDone(l), l.total); return `
      <a class="card lab-card" href="${l.href}">
        <div class="lab-ic" aria-hidden="true">${l.icon}</div>
        <div class="lab-body">
          <h2>${l.name}</h2>
          <p class="muted">${l.desc}</p>
          <div class="lab-prog"><div style="width:${d / l.total * 100}%"></div></div>
          <span class="muted small">완료 ${d} / ${l.total}</span>
        </div>
        <span class="lab-go" aria-hidden="true">›</span>
      </a>`; }).join("")}
      <p class="muted small">실제 장비·OS 동작을 단순화한 연습용이라 화면 문구와 명령 출력이 실제와 조금 다를 수 있습니다.</p>`;
  }

  // ---------- 학습 원리 ----------
  const scholar = q => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`;
  const SCIENCE = [
    { ic: "🧠", t: "인출 연습 — 다시 읽기보다 꺼내 보기",
      what: "같은 시간을 써도 내용을 다시 읽는 것보다 시험처럼 기억에서 꺼내 보는 쪽이 며칠~일주일 뒤 기억이 훨씬 좋습니다(시험 효과). 뇌 영상(fMRI) 연구에서는 인출 연습이 해마를 포함한 기억 관련 영역의 활동과 연결되어 나중의 기억을 강화하는 것으로 보고됩니다.",
      how: "모든 학습을 문제 풀이로 합니다. 오답노트와 용어 표도 정답·뜻을 가려 두고 먼저 떠올린 뒤 펼치게 했습니다.",
      refs: [
        ["Roediger & Karpicke (2006). Test-enhanced learning. Psychological Science, 17(3).", scholar("Roediger Karpicke 2006 Test-enhanced learning")],
        ["Karpicke & Roediger (2008). The critical importance of retrieval for learning. Science, 319.", scholar("Karpicke Roediger 2008 critical importance of retrieval for learning")],
        ["Wing, Marsh & Cabeza (2013). Neural correlates of retrieval-based memory enhancement: An fMRI study of the testing effect. Neuropsychologia, 51(12).", "https://doi.org/10.1016/j.neuropsychologia.2013.04.004"],
        ["van den Broek et al. (2016). Neurocognitive mechanisms of the \"testing effect\": A review. Trends in Neuroscience and Education, 5(2).", "https://doi.org/10.1016/j.tine.2016.05.001"]
      ] },
    { ic: "📅", t: "간격 반복 — 잊어 갈 때쯤 다시",
      what: "한 번에 몰아서 보는 것보다 시간 간격을 두고 나눠 복습할 때 오래 남습니다(간격 효과). 최적 간격은 '얼마나 오래 기억해야 하는가'에 비례해 늘어나며, 몇 주 뒤 시험이라면 그 기간의 약 20%, 1년 뒤라면 약 5% 간격이 가장 효과적이었습니다.",
      how: "맞힐 때마다 다음 복습을 1 → 3 → 7 → 16 → 35 → 80일 뒤로 늘리고, 틀리면 다음 날부터 다시 시작합니다. 예정보다 일찍 맞힌 것은 단계를 올리지 않습니다. 홈의 '오늘의 학습'이 그날 복습할 문제를 모아 줍니다.",
      refs: [
        ["Cepeda, Pashler, Vul, Wixted & Rohrer (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. Psychological Bulletin, 132(3).", scholar("Cepeda 2006 Distributed practice in verbal recall tasks review quantitative synthesis")],
        ["Cepeda, Vul, Rohrer, Wixted & Pashler (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. Psychological Science, 19(11).", "https://doi.org/10.1111/j.1467-9280.2008.02209.x"]
      ] },
    { ic: "🔁", t: "연속 재학습 — 맞힐 때까지 한 번, 그리고 다른 날 또",
      what: "한 회차 안에서 틀린 문제를 정답을 낼 때까지 다시 인출하고, 그런 회차를 며칠에 걸쳐 반복하면 장기 기억이 크게 좋아집니다.",
      how: "틀리거나 찍어서 맞힌 문제는 같은 회차 안에서 몇 문제 뒤에 한 번 더 나옵니다. 오답노트는 같은 날이 아닌 '서로 다른 날' 두 번 연속 맞혀야 졸업합니다.",
      refs: [["Rawson & Dunlosky (2011). Optimizing schedules of retrieval practice for durable and efficient learning. Journal of Experimental Psychology: General, 140(3).", scholar("Rawson Dunlosky 2011 Optimizing schedules of retrieval practice durable efficient learning")]] },
    { ic: "🔀", t: "교차 학습 — 단원을 섞어서",
      what: "한 단원을 몰아서 풀 때보다 여러 단원을 섞어 풀면 그 자리에서는 더 어렵게 느껴지지만, 나중에 문제 유형을 구별하고 적용하는 능력이 좋아집니다(바람직한 어려움).",
      how: "오늘의 학습과 직접 골라 풀기(약한 문제 우선)는 같은 단원이 연달아 몰리지 않게 섞어서 냅니다.",
      refs: [
        ["Kornell & Bjork (2008). Learning concepts and categories: Is spacing the \"enemy of induction\"? Psychological Science, 19(6).", scholar("Kornell Bjork 2008 Learning concepts and categories spacing enemy of induction")],
        ["Rohrer & Taylor (2007). The shuffling of mathematics problems improves learning. Instructional Science, 35.", scholar("Rohrer Taylor 2007 shuffling of mathematics problems improves learning")],
        ["Bjork (1994). Memory and metamemory considerations in the training of human beings. In Metacognition: Knowing about knowing.", scholar("Bjork 1994 Memory and metamemory considerations in the training of human beings")]
      ] },
    { ic: "🎯", t: "확신도와 착각 교정",
      what: "확신했는데 틀린 답은 피드백을 받으면 오히려 확신이 낮았던 오답보다 더 잘 고쳐집니다(과잉교정 효과). fMRI 연구에서는 확신과 정답이 어긋날 때 전대상피질·내측 전두이랑이 활동하고, 확신 오답에서는 우측 측두두정접합부·배외측 전전두엽 활동이 더해져 주의와 수정이 일어나는 것으로 보고됐습니다. 반대로 찍어서 맞힌 것은 아직 아는 것이 아닙니다.",
      how: "답을 고른 뒤 '확실·애매·찍음'을 고릅니다. 확신 오답은 🔥 착각 교정 목록으로 먼저 복습하고, 찍어서 맞힌 문제는 다음 날 다시 냅니다. 처음 보는 문제를 확신하고 맞히면 간격을 한 단계 더 늘립니다.",
      refs: [
        ["Butterfield & Metcalfe (2001). Errors committed with high confidence are hypercorrected. Journal of Experimental Psychology: Learning, Memory, and Cognition, 27(6).", scholar("Butterfield Metcalfe 2001 Errors committed with high confidence are hypercorrected")],
        ["Metcalfe, Butterfield, Habeck & Stern (2012). Neural correlates of people's hypercorrection of their false beliefs. Journal of Cognitive Neuroscience, 24, 1571–1583.", scholar("Metcalfe Butterfield Habeck Stern 2012 Neural correlates of people's hypercorrection of their false beliefs")]
      ] },
    { ic: "💭", t: "먼저 떠올리기 — 틀려도 시도가 남는다",
      what: "정답을 보기 전에 스스로 답을 만들어 보는 시도는, 틀리더라도 뒤이은 학습을 더 잘 남게 합니다(사전 인출 효과).",
      how: "설정에서 '먼저 떠올리기'를 켜면 보기를 가린 채 문제만 보여 주고, 답을 떠올린 뒤 보기를 엽니다. 처음 보는 문제도 바로 해설을 읽지 않고 먼저 풀게 합니다.",
      refs: [
        ["Kornell, Hays & Bjork (2009). Unsuccessful retrieval attempts enhance subsequent learning. Journal of Experimental Psychology: Learning, Memory, and Cognition, 35(4).", scholar("Kornell Hays Bjork 2009 Unsuccessful retrieval attempts enhance subsequent learning")],
        ["Richland, Kornell & Kao (2009). The pretesting effect: Do unsuccessful retrieval attempts enhance learning? Journal of Experimental Psychology: Applied, 15(3).", scholar("Richland Kornell Kao 2009 pretesting effect")]
      ] },
    { ic: "💤", t: "수면과 기억 공고화",
      what: "학습 뒤 잠을 자는 동안 해마에 임시로 저장된 기억이 다시 재생되며 대뇌 피질의 장기 기억으로 옮겨지고 강화됩니다.",
      how: "하루 학습량을 '오늘의 학습'으로 나누고, 결과 화면에서 다음 날 복습을 안내합니다. 밤새 몰아 하기보다 매일 조금씩, 자고 나서 다시 꺼내는 흐름을 권합니다.",
      refs: [["Diekelmann & Born (2010). The memory function of sleep. Nature Reviews Neuroscience, 11(2).", scholar("Diekelmann Born 2010 The memory function of sleep")]] },
    { ic: "📚", t: "종합 — 효과가 큰 공부법과 작은 공부법",
      what: "학습 기법 10가지를 검토한 종합 연구에서 '연습 시험(인출 연습)'과 '분산 연습(간격 반복)'이 가장 효용이 높게, 다시 읽기·밑줄 긋기·요약은 낮게 평가됐습니다.",
      how: "이 사이트의 기본 흐름을 '문제로 꺼내기 + 간격 두고 반복'으로 짰습니다. 해설은 읽기 자료가 아니라 피드백으로 씁니다.",
      refs: [["Dunlosky, Rawson, Marsh, Nathan & Willingham (2013). Improving students' learning with effective learning techniques. Psychological Science in the Public Interest, 14(1).", scholar("Dunlosky 2013 Improving students' learning with effective learning techniques")]] }
  ];

  function renderScience() {
    app.innerHTML = `
      <section class="card">
        <h1>이 사이트의 학습 원리</h1>
        <p class="muted">기억과 학습에 관한 인지심리학·뇌과학 연구에서 효과가 반복해서 확인된 원리를 바탕으로 학습 흐름을 짰습니다.
        각 항목에 '연구 내용'과 '사이트에 적용한 방법', 근거 논문을 정리했습니다.</p>
        <div class="sci-flow">
          <span>오늘의 학습</span><i>→</i><span>먼저 떠올리기</span><i>→</i><span>답 + 확신도</span><i>→</i><span>즉시 피드백</span><i>→</i><span>틀리면 몇 문제 뒤 다시</span><i>→</i><span>간격 두고 복습</span>
        </div>
      </section>
      ${SCIENCE.map(s => `
      <section class="card sci">
        <h2>${s.ic} ${esc(s.t)}</h2>
        <div class="sci-row"><b>연구 내용</b><p>${esc(s.what)}</p></div>
        <div class="sci-row"><b>사이트 적용</b><p>${esc(s.how)}</p></div>
        <details class="sci-refs"><summary>근거 논문 ${s.refs.length}편</summary>
          <ul>${s.refs.map(([c, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(c)}</a></li>`).join("")}</ul>
        </details>
      </section>`).join("")}
      <section class="card">
        <p class="muted small" style="margin:0">참고: 위 효과는 실험실과 교실 연구에서 평균적으로 확인된 것으로, 사람과 과목에 따라 크기가 다를 수 있습니다.
        논문 링크는 DOI 또는 Google Scholar 검색으로 연결됩니다. 복습 간격(1·3·7·16·35·80일)은 연구 결과를 참고해 이 사이트에서 정한 값입니다.</p>
        <button class="btn block" data-go="home" style="margin-top:12px">홈으로</button>
      </section>`;
  }

  // ---------- 라우팅 & 키보드 ----------
  function go(page) {
    quiz = page === "quiz" ? quiz : null;
    document.querySelectorAll(".topbar nav [data-go]").forEach(b => b.classList.toggle("on", b.dataset.go === page));
    if (page === "notes") renderNotes();
    else if (page === "glossary") renderGlossary();
    else if (page === "practice" && window.renderPractice) window.renderPractice(app);
    else if (page === "labs") renderLabs();
    else if (page === "science") renderScience();
    else renderHome();
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-go]");
    if (t) { e.preventDefault(); go(t.dataset.go); }
  });
  document.addEventListener("keydown", e => {
    if (!quiz || !document.querySelector(".qtext")) return;
    const q = quiz.list[quiz.i];
    if (e.target.tagName === "TEXTAREA") return;
    if (document.getElementById("recallBox") && (e.key === " " || e.key === "Enter")) { e.preventDefault(); reveal(); return; }
    if (!quiz.answered && quiz.pending != null) {
      const c = { 1: "sure", 2: "mid", 3: "guess" }[e.key];
      if (c) { e.preventDefault(); finalize(quiz.pending, c); return; }
      if (e.key === "Escape") { quiz.pending = null; document.getElementById("confBox").hidden = true; app.querySelectorAll(".choice").forEach(b => b.classList.remove("picked")); quiz.picked = new Set(); const mb = document.getElementById("multiBtn"); if (mb) { mb.disabled = true; } }
      return;
    }
    if ((e.key === "h" || e.key === "H" || e.key === "ㅗ") && !quiz.answered && e.target.tagName !== "INPUT") { e.preventDefault(); useHint(); return; }
    if (e.key === "Enter") {
      if (quiz.answered) { e.preventDefault(); next(); }
      else if (isMulti(q)) { e.preventDefault(); choose([...quiz.picked]); }
      else if (!isMC(q)) { e.preventDefault(); choose(document.getElementById("shortInput").value); }
    } else if (isMC(q) && !quiz.answered && !document.getElementById("recallBox") && /^[1-9]$/.test(e.key) && +e.key <= q.choices.length) {
      if (isMulti(q)) togglePick(+e.key); else choose(+e.key);
    }
  });

  updateBadge();
  go("home");
})();
