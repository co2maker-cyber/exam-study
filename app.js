(function () {
  "use strict";

  const BANK = (window.QUESTION_BANK || []).filter(q => q && q.id && q.question);
  const BY_ID = Object.fromEntries(BANK.map(q => [q.id, q]));
  const CLEAR_STREAK = 2; // 오답노트 문제를 연속으로 이만큼 맞히면 오답노트에서 자동 삭제
  const NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  const app = document.getElementById("app");

  // ---------- 저장소 (로그인한 계정의 클라우드에 저장) ----------
  // 학습 기록은 기기에 저장하지 않습니다. 로그인하면 계정(Firestore)에서 불러오고 자동 저장합니다.
  const LEGACY_KEY = "examStudy.v1"; // 예전 버전이 기기에 남긴 기록: 로그인 시 계정으로 옮기고 삭제
  const empty = () => ({ stats: {}, wrong: {}, known: {}, custom: [] });
  const normalize = s => (s && typeof s === "object")
    ? { stats: s.stats || {}, wrong: s.wrong || {}, known: s.known || {}, custom: Array.isArray(s.custom) ? s.custom : [] }
    : empty();
  const hasData = s => Object.keys(s.stats).length + Object.keys(s.wrong).length + Object.keys(s.known).length + s.custom.length > 0;
  function merge(base, extra) {
    const out = normalize(JSON.parse(JSON.stringify(base)));
    for (const [id, v] of Object.entries(extra.stats)) if (!out.stats[id] || v.tries > out.stats[id].tries) out.stats[id] = v;
    for (const [id, v] of Object.entries(extra.wrong)) if (!out.wrong[id] || v.count > out.wrong[id].count) out.wrong[id] = v;
    Object.assign(out.known, extra.known);
    for (const c of extra.custom) if (!out.custom.some(x => x.term.toLowerCase() === c.term.toLowerCase())) out.custom.push(c);
    return out;
  }
  function readLegacy() {
    try { const v = localStorage.getItem(LEGACY_KEY); return v ? normalize(JSON.parse(v)) : null; } catch (e) { return null; }
  }
  function removeLegacy() { try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* 무시 */ } }

  let store = empty();
  let cloud = null;          // window.Cloud (cloud.js)
  let loaded = false;        // 계정 기록을 정상적으로 불러왔는지 (실패 시 덮어쓰기 방지)
  let dirty = false;         // 아직 저장되지 않은 변경
  let syncState = "idle";    // idle | loading | saving | saved | error
  let syncError = "";
  let saveTimer = null;

  function save() {
    updateBadge();
    dirty = true;
    if (!cloud || !cloud.user || !loaded) { renderAccountChip(); return; }
    setSync("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }
  async function flush() {
    clearTimeout(saveTimer);
    if (!cloud || !cloud.user || !loaded || !dirty) return;
    dirty = false;
    try {
      await cloud.save(JSON.parse(JSON.stringify(store)));
      if (!dirty) setSync("saved");
    } catch (e) {
      dirty = true; syncError = cloud.message(e); setSync("error");
    }
  }
  function setSync(st) {
    syncState = st;
    renderAccountChip();
    const el = document.getElementById("syncText");
    if (el) el.innerHTML = syncText();
  }
  function syncText() {
    return {
      idle: "",
      loading: "⏳ 계정에서 기록을 불러오는 중…",
      saving: "⏳ 저장 중…",
      saved: "✅ 계정에 저장됨",
      error: "⚠️ 저장 실패: " + esc(syncError)
    }[syncState] || "";
  }

  async function onAuthChanged(user) {
    if (user) {
      setSync("loading");
      let remote;
      try {
        remote = normalize(await cloud.load());
      } catch (e) {
        loaded = false; syncError = cloud.message(e); setSync("error"); rerender(); return;
      }
      loaded = true;
      let merged = remote, changed = false;
      if (dirty && hasData(store)) { merged = merge(merged, store); changed = true; } // 로그인 전에 푼 기록
      const legacy = readLegacy();
      if (legacy && hasData(legacy)) {
        if (confirm("이 기기에 예전 버전의 학습 기록이 남아 있습니다.\n계정으로 옮길까요?\n\n(확인: 계정으로 옮김 / 취소: 옮기지 않음)\n어느 쪽이든 이 기기에 남은 기록은 삭제됩니다.")) {
          merged = merge(merged, legacy); changed = true;
        }
      }
      removeLegacy();
      store = merged;
      if (changed) { dirty = true; await flush(); } else { dirty = false; setSync("saved"); }
    } else {
      store = empty(); loaded = false; dirty = false; setSync("idle");
    }
    rerender();
  }

  window.addEventListener("cloud-ready", () => {
    cloud = window.Cloud;
    window.addEventListener("auth-changed", e => onAuthChanged(e.detail));
    renderAccountChip();
    rerender();
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("beforeunload", e => {
    const unsaved = cloud && cloud.user ? dirty : (dirty && hasData(store));
    if (unsaved) { flush(); e.preventDefault(); e.returnValue = ""; }
  });

  function renderAccountChip() {
    const el = document.getElementById("authBtn");
    if (!el) return;
    if (cloud && cloud.user) {
      const n = cloud.user.name || cloud.user.email || "?";
      el.innerHTML = `<span class="avatar">${esc(n.slice(0, 1).toUpperCase())}</span><span class="sync-dot ${syncState}"></span>`;
      el.title = `${n} · ${syncText().replace(/<[^>]+>/g, "") || "로그인됨"}`;
    } else {
      el.textContent = "로그인";
      el.title = "로그인하면 학습 기록이 계정에 저장됩니다";
    }
  }
  function noticeHTML() {
    if (cloud && cloud.user) return syncState === "error"
      ? `<div class="notice bad">${syncText()} <button class="link" data-go="account">계정 화면</button></div>` : "";
    if (!cloud) return "";
    const why = !cloud.enabled
      ? (cloud.failed ? "로그인 서비스를 불러오지 못했습니다(인터넷 연결 확인)." : "로그인 기능이 아직 설정되지 않았습니다.")
      : "로그인하지 않았습니다.";
    return `<div class="notice">🔒 ${why} 지금 푸는 기록은 <b>저장되지 않고</b> 페이지를 닫으면 사라집니다.
      ${cloud.enabled ? `<button class="btn small primary" data-go="account">로그인하고 저장하기</button>` : ""}</div>`;
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
  const exams = [...new Set(BANK.map(q => q.exam).filter(Boolean))];
  const domains = [...new Set(BANK.map(q => q.domain).filter(Boolean))].sort();
  function givenText(q, given) {
    if (given == null || given === "") return "";
    if (isMC(q)) return (Array.isArray(given) ? given : [given]).map(k => choiceLabel(q, +k)).join(" / ");
    return String(given);
  }

  // ---------- 홈 ----------
  const opts = { exam: "", domain: "", count: 10, source: "smart" };

  function renderHome() {
    const ids = BANK.map(q => q.id);
    const tried = ids.filter(id => store.stats[id]);
    const totalTries = tried.reduce((n, id) => n + store.stats[id].tries, 0);
    const totalCorrect = tried.reduce((n, id) => n + store.stats[id].correct, 0);
    const acc = totalTries ? Math.round(totalCorrect / totalTries * 100) + "%" : "-";

    app.innerHTML = noticeHTML() + `
      <section class="card">
        <h1>기출 반복 학습</h1>
        <p class="muted">문제를 풀면 바로 정답과 이유를 알려주고, 틀린 문제는 오답노트에 자동 저장됩니다.
        오답노트 문제는 ${CLEAR_STREAK}번 연속으로 맞히면 졸업합니다.</p>
        <div class="stats">
          <div class="stat"><b>${BANK.length}</b><span>전체 문제</span></div>
          <div class="stat"><b>${tried.length}</b><span>풀어본 문제</span></div>
          <div class="stat"><b>${acc}</b><span>정답률</span></div>
          <div class="stat"><b>${wrongIds().length}</b><span>오답노트</span></div>
        </div>
      </section>

      <section class="card">
        <h2>문제 풀기</h2>
        ${exams.length > 1 ? `
        <div class="field">
          <label>시험 선택</label>
          <select id="examSel">
            <option value="">전체 시험</option>
            ${exams.map(e => `<option value="${esc(e)}" ${opts.exam === e ? "selected" : ""}>${esc(e)} (${BANK.filter(q => q.exam === e).length}문제)</option>`).join("")}
          </select>
        </div>` : ""}
        ${domains.length > 1 ? `
        <div class="field">
          <label>영역 선택</label>
          <select id="domainSel">
            <option value="">전체 영역</option>
            ${domains.map(d => `<option value="${esc(d)}" ${opts.domain === d ? "selected" : ""}>${esc(d)} (${BANK.filter(q => q.domain === d).length}문제)</option>`).join("")}
          </select>
        </div>` : ""}
        <div class="field">
          <label>문제 수</label>
          <div class="seg" id="countSeg">
            ${[10, 50, 0].map(n => `<button data-n="${n}" class="${opts.count === n ? "on" : ""}">${n ? n + "문제" : "전체"}</button>`).join("")}
          </div>
        </div>
        <div class="field">
          <label>출제 방식</label>
          <div class="seg" id="srcSeg">
            ${[["smart", "안 푼 문제·오답 우선"], ["random", "완전 랜덤"], ["wrong", "오답노트만"]]
              .map(([k, t]) => `<button data-s="${k}" class="${opts.source === k ? "on" : ""}">${t}</button>`).join("")}
          </div>
        </div>
        <button class="btn primary block" id="startBtn">시작하기</button>
        <p class="muted" id="startMsg" style="margin:8px 0 0"></p>
      </section>`;

    const sel = document.getElementById("examSel");
    if (sel) sel.onchange = () => { opts.exam = sel.value; };
    const dsel = document.getElementById("domainSel");
    if (dsel) dsel.onchange = () => { opts.domain = dsel.value; };
    document.querySelectorAll("#countSeg button").forEach(b => b.onclick = () => { opts.count = +b.dataset.n; renderHome(); });
    document.querySelectorAll("#srcSeg button").forEach(b => b.onclick = () => { opts.source = b.dataset.s; renderHome(); });
    document.getElementById("startBtn").onclick = () => {
      const list = pickQuestions(opts);
      if (!list.length) {
        document.getElementById("startMsg").textContent =
          opts.source === "wrong" ? "오답노트가 비어 있어요. 먼저 문제를 풀어보세요!" : "문제를 불러오지 못했습니다. data 폴더의 문제 파일을 확인하세요.";
        return;
      }
      startQuiz(list, opts.source === "wrong" ? "오답노트" : (opts.domain || opts.exam || "전체 시험"));
    };
  }

  function pickQuestions({ exam, domain, count, source }) {
    let pool = BANK.filter(q => (!exam || q.exam === exam) && (!domain || q.domain === domain));
    if (source === "wrong") pool = pool.filter(q => store.wrong[q.id]);
    let ordered;
    if (source === "smart") {
      // 우선순위: 오답노트 > 안 푼 문제 > 정답률 낮은 문제 (같은 그룹 안에서는 랜덤)
      const score = q => {
        if (store.wrong[q.id]) return 0;
        const s = store.stats[q.id];
        if (!s) return 1;
        return 2 + s.correct / s.tries;
      };
      ordered = shuffle(pool).sort((a, b) => score(a) - score(b));
      ordered = shuffle(count ? ordered.slice(0, count) : ordered);
    } else {
      ordered = shuffle(pool);
    }
    return count ? ordered.slice(0, count) : ordered;
  }

  // ---------- 퀴즈 ----------
  let quiz = null;

  function startQuiz(list, label) {
    quiz = { list, label, i: 0, results: [], answered: false };
    renderQuestion();
  }

  function renderQuestion() {
    const q = quiz.list[quiz.i];
    const total = quiz.list.length;
    quiz.answered = false;
    quiz.picked = new Set();
    const inNote = store.wrong[q.id];

    app.innerHTML = `
      <section class="card">
        <div class="qhead">
          <span>${esc(quiz.label)} · ${quiz.i + 1} / ${total}</span>
          <span>${q.no ? `<span class="tag">원본 ${q.no}번</span>` : ""}${inNote ? `<span class="tag bad">오답노트</span>` : ""}</span>
        </div>
        <div class="progress"><div style="width:${quiz.i / total * 100}%"></div></div>
        ${q.domain ? `<div class="muted" style="font-size:13px">${esc(q.domain)}</div>` : ""}
        <div class="qtext">${esc(q.question)}</div>
        ${q.image ? `<img class="qimg" src="${esc(q.image)}" alt="문제 이미지">` : ""}
        ${isMC(q) ? `
          <div class="choices">
            ${q.choices.map((c, k) => `<button class="choice" data-k="${k + 1}"><span class="num">${NUMS[k] || k + 1}</span><span>${esc(c)}</span></button>`).join("")}
          </div>
          ${isMulti(q) ? `
          <button class="btn primary block" id="multiBtn" style="margin-top:12px" disabled>정답 ${q.answer.length}개를 고르세요 (0/${q.answer.length})</button>
          <div class="kbd-hint">키보드: 숫자키로 선택/해제 · Enter로 제출 · 다시 Enter로 다음</div>` : `
          <div class="kbd-hint">키보드: 숫자키로 선택 · Enter로 다음</div>`}` : `
          <div class="row">
            <input type="text" id="shortInput" placeholder="정답을 입력하세요" autocomplete="off" style="flex:3">
            <button class="btn primary" id="shortBtn" style="flex:1">확인</button>
          </div>
          <div class="kbd-hint">Enter로 제출 · 다시 Enter로 다음</div>`}
        <div id="fb"></div>
      </section>
      <div class="row">
        <button class="btn danger small" id="quitBtn" style="flex:0 0 auto">그만 풀기</button>
      </div>`;

    if (isMulti(q)) {
      app.querySelectorAll(".choice").forEach(b => b.onclick = () => togglePick(+b.dataset.k));
      document.getElementById("multiBtn").onclick = () => submit([...quiz.picked]);
    } else if (isMC(q)) {
      app.querySelectorAll(".choice").forEach(b => b.onclick = () => submit(+b.dataset.k));
    } else {
      const inp = document.getElementById("shortInput");
      inp.focus();
      document.getElementById("shortBtn").onclick = () => submit(inp.value);
    }
    document.getElementById("quitBtn").onclick = () => {
      if (quiz.results.length) renderResult(); else go("home");
    };
  }

  function togglePick(k) {
    if (quiz.answered) return;
    const q = quiz.list[quiz.i];
    const need = q.answer.length;
    if (quiz.picked.has(k)) quiz.picked.delete(k);
    else if (quiz.picked.size < need) quiz.picked.add(k);
    app.querySelectorAll(".choice").forEach(b => b.classList.toggle("picked", quiz.picked.has(+b.dataset.k)));
    const btn = document.getElementById("multiBtn");
    btn.disabled = quiz.picked.size !== need;
    btn.textContent = quiz.picked.size === need ? "정답 확인" : `정답 ${need}개를 고르세요 (${quiz.picked.size}/${need})`;
  }

  function submit(given) {
    if (quiz.answered) return;
    const q = quiz.list[quiz.i];
    let ok;
    if (isMC(q)) {
      const correct = mcAnswers(q);
      const chosen = (Array.isArray(given) ? given : [given]).map(Number).sort((a, b) => a - b);
      if (isMulti(q) && chosen.length !== correct.length) return;
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
      if (!String(given).trim()) return;
      ok = shortAnswers(q).some(a => norm(a) === norm(given));
      const inp = document.getElementById("shortInput");
      inp.disabled = true;
      document.getElementById("shortBtn").disabled = true;
    }
    quiz.answered = true;
    record(q, ok, given);

    const note = store.wrong[q.id];
    let noteMsg = "";
    if (!ok) noteMsg = "📒 오답노트에 저장했어요.";
    else if (note) noteMsg = `📒 오답노트 연속 정답 ${note.streak}/${CLEAR_STREAK}`;
    else if (quiz.results[quiz.results.length - 1].graduated) noteMsg = "🎉 오답노트에서 졸업했어요!";

    const last = quiz.i === quiz.list.length - 1;
    document.getElementById("fb").innerHTML = `
      <div class="feedback ${ok ? "good" : "bad"}">
        <div class="title">${ok ? "⭕ 정답입니다!" : "❌ 틀렸습니다"}</div>
        <div class="answer-line">정답: <b>${esc(answerText(q))}</b>${!ok ? ` <span class="muted">(내 답: ${esc(givenText(q, given))})</span>` : ""}</div>
        ${q.explanation ? `<div class="why"><b>💡 이유</b>\n${esc(q.explanation)}</div>` : ""}
        ${noteMsg ? `<div class="muted" style="margin-top:8px">${noteMsg}</div>` : ""}
      </div>
      <button class="btn primary block" id="nextBtn" style="margin-top:12px">${last ? "결과 보기" : "다음 문제 →"}</button>`;
    document.getElementById("nextBtn").onclick = next;
    document.getElementById("nextBtn").focus();
  }

  function record(q, ok, given) {
    const s = store.stats[q.id] || (store.stats[q.id] = { tries: 0, correct: 0 });
    s.tries++; if (ok) s.correct++;
    s.last = Date.now();
    let graduated = false;
    if (!ok) {
      const w = store.wrong[q.id] || (store.wrong[q.id] = { count: 0, memo: "", added: Date.now() });
      w.count++; w.streak = 0; w.lastWrong = Date.now(); w.lastGiven = given;
    } else if (store.wrong[q.id]) {
      const w = store.wrong[q.id];
      w.streak = (w.streak || 0) + 1;
      if (w.streak >= CLEAR_STREAK) { delete store.wrong[q.id]; graduated = true; }
    }
    quiz.results.push({ id: q.id, ok, given, graduated });
    save();
  }

  function next() {
    if (quiz.i < quiz.list.length - 1) { quiz.i++; renderQuestion(); }
    else renderResult();
  }

  // ---------- 결과 ----------
  function renderResult() {
    const r = quiz.results;
    const correct = r.filter(x => x.ok).length;
    const wrongs = r.filter(x => !x.ok);
    const pct = r.length ? Math.round(correct / r.length * 100) : 0;
    app.innerHTML = `
      <section class="card">
        <h2>${esc(quiz.label)} 결과</h2>
        <div class="score">${correct} / ${r.length}</div>
        <p class="muted" style="text-align:center">정답률 ${pct}% ${pct === 100 ? "· 완벽해요! 🎉" : ""}</p>
        <div class="row">
          ${wrongs.length ? `<button class="btn primary" id="retryWrong">틀린 ${wrongs.length}문제 다시 풀기</button>` : ""}
          <button class="btn" id="retryAll">같은 문제 다시 풀기</button>
          <button class="btn" data-go="home">홈으로</button>
        </div>
      </section>
      ${wrongs.length ? `
      <section class="card">
        <h2>이번에 틀린 문제</h2>
        ${wrongs.map(x => noteItemHTML(BY_ID[x.id], x.given, false)).join("")}
      </section>` : ""}`;
    const rw = document.getElementById("retryWrong");
    if (rw) rw.onclick = () => startQuiz(shuffle(wrongs.map(x => BY_ID[x.id])), "틀린 문제 다시");
    document.getElementById("retryAll").onclick = () => startQuiz(shuffle(quiz.list), quiz.label);
  }

  function noteItemHTML(q, given, editable) {
    const w = store.wrong[q.id];
    const gt = givenText(q, given);
    return `
      <div class="list-item" data-id="${esc(q.id)}">
        <div>${q.no ? `<span class="tag">원본 ${q.no}번</span>` : ""}${q.domain ? `<span class="tag">${esc(q.domain)}</span>` : ""}${w ? `<span class="tag bad">${w.count}회 틀림</span>` : ""}</div>
        <div style="font-weight:600;margin-top:4px;white-space:pre-wrap">${esc(q.question)}</div>
        ${isMC(q) ? `<div class="muted">${q.choices.map((c, k) => `${NUMS[k] || k + 1} ${esc(c)}`).join("<br>")}</div>` : ""}
        ${gt ? `<div class="answer-line muted">내 답: ${esc(gt)}</div>` : ""}
        <div class="answer-line">정답: <b>${esc(answerText(q))}</b></div>
        ${q.explanation ? `<div class="muted" style="margin-top:4px;white-space:pre-wrap">💡 ${esc(q.explanation)}</div>` : ""}
        ${editable ? `
          <div class="field" style="margin:10px 0 6px">
            <textarea class="memo" placeholder="나만의 메모 (자동 저장)">${esc(w.memo || "")}</textarea>
          </div>
          <div class="muted" style="font-size:13px">연속 정답 ${w.streak || 0}/${CLEAR_STREAK} ·
            <button class="btn small danger del">오답노트에서 삭제</button></div>` : ""}
      </div>`;
  }

  // ---------- 오답노트 ----------
  function renderNotes() {
    const ids = wrongIds().sort((a, b) => (store.wrong[b].count - store.wrong[a].count) || (store.wrong[b].lastWrong || 0) - (store.wrong[a].lastWrong || 0));
    app.innerHTML = noticeHTML() + `
      <section class="card">
        <h1>오답노트</h1>
        <p class="muted">틀린 문제가 자동으로 모입니다. 많이 틀린 순서로 정렬돼요. ${CLEAR_STREAK}번 연속 맞히면 자동으로 빠집니다.</p>
        ${ids.length ? `
        <div class="row">
          <button class="btn primary" data-n="10">오답 10문제 풀기</button>
          <button class="btn primary" data-n="50">오답 50문제 풀기</button>
          <button class="btn" data-n="0">오답 전체 풀기 (${ids.length})</button>
        </div>` : ""}
      </section>
      <section class="card">
        ${ids.length ? ids.map(id => noteItemHTML(BY_ID[id], store.wrong[id].lastGiven, true)).join("") : `<div class="empty">오답노트가 비어 있어요 👍</div>`}
      </section>`;

    app.querySelectorAll("[data-n]").forEach(b => b.onclick = () => {
      const n = +b.dataset.n;
      const list = shuffle(ids.map(id => BY_ID[id]));
      startQuiz(n ? list.slice(0, n) : list, "오답노트");
    });
    app.querySelectorAll(".list-item").forEach(el => {
      const id = el.dataset.id;
      const memo = el.querySelector(".memo");
      if (memo) memo.oninput = () => { store.wrong[id].memo = memo.value; save(); };
      const del = el.querySelector(".del");
      if (del) del.onclick = () => { if (confirm("오답노트에서 삭제할까요?")) { delete store.wrong[id]; save(); renderNotes(); } };
    });
  }

  // ---------- 계정 (로그인 · 동기화) ----------
  function renderAccount() {
    let body;
    if (!cloud) {
      body = `<section class="card"><div class="empty">로그인 기능을 불러오는 중…</div></section>`;
    } else if (!cloud.enabled) {
      body = `<section class="card">
        <h1>로그인</h1>
        <p>${cloud.failed ? "로그인 서비스(Firebase)를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요."
          : "로그인 기능이 아직 설정되지 않았습니다. 사이트 관리자가 Firebase를 연결하면 로그인할 수 있습니다."}</p>
        <p class="muted">설정 방법은 저장소의 README.md '로그인 설정' 항목을 참고하세요. 설정 전에는 학습 기록이 저장되지 않습니다.</p>
      </section>`;
    } else if (!cloud.user) {
      body = `<section class="card auth-card">
        <h1>로그인</h1>
        <p class="muted">로그인하면 풀이 기록, 오답노트, 외운 용어, 내 단어가 계정에 저장되어 어느 기기에서든 이어서 공부할 수 있습니다.</p>
        <button class="btn block google" id="gBtn"><span class="g">G</span> Google 계정으로 로그인</button>
        <div class="divider"><span>또는 이메일</span></div>
        <div class="seg" id="modeSeg">
          <button data-m="in" class="on">로그인</button><button data-m="up">회원가입</button>
        </div>
        <div class="field" id="nameField" hidden style="margin-top:12px"><label>이름(선택)</label><input type="text" id="auName" autocomplete="name"></div>
        <div class="field" style="margin-top:12px"><label>이메일</label><input type="text" id="auEmail" inputmode="email" autocomplete="email"></div>
        <div class="field"><label>비밀번호 (6자 이상)</label><input type="password" id="auPw" autocomplete="current-password"></div>
        <button class="btn primary block" id="auBtn">로그인</button>
        <div class="row" style="justify-content:space-between;margin-top:10px">
          <button class="link" id="resetPw">비밀번호를 잊으셨나요?</button>
        </div>
        <div class="auth-msg" id="auMsg"></div>
      </section>`;
    } else {
      const u = cloud.user;
      const total = Object.keys(store.stats).length;
      body = `<section class="card">
        <h1>내 계정</h1>
        <div class="profile">
          <span class="avatar big">${esc((u.name || u.email || "?").slice(0, 1).toUpperCase())}</span>
          <div><b>${esc(u.name || "")}</b><div class="muted">${esc(u.email || "")}</div></div>
        </div>
        <div class="muted" id="syncText" style="margin:12px 0">${syncText()}</div>
        <div class="stats" style="margin-bottom:14px">
          <div class="stat"><b>${total}</b><span>풀어본 문제</span></div>
          <div class="stat"><b>${wrongIds().length}</b><span>오답노트</span></div>
          <div class="stat"><b>${Object.keys(store.known).length}</b><span>외운 용어</span></div>
          <div class="stat"><b>${store.custom.length}</b><span>내 단어</span></div>
        </div>
        <div class="row">
          <button class="btn" id="syncBtn">지금 저장</button>
          <button class="btn" id="reloadBtn">계정에서 다시 불러오기</button>
          <button class="btn danger" id="logoutBtn">로그아웃</button>
        </div>
      </section>`;
    }
    app.innerHTML = body + `
      <section class="card">
        <h2>학습 기록 관리</h2>
        <p class="muted">${cloud && cloud.user ? "기록은 로그인한 계정에 자동 저장됩니다. 필요하면 파일로 백업할 수 있습니다." : "로그인하지 않으면 기록이 저장되지 않습니다. 파일로 백업하거나, 예전에 받은 백업 파일을 불러올 수 있습니다."}</p>
        <div class="row">
          <button class="btn small" id="exportBtn">백업 내보내기</button>
          <label class="btn small" style="text-align:center">백업 불러오기<input type="file" id="importInp" accept=".json" hidden></label>
          <button class="btn small danger" id="resetBtn">기록 전체 초기화</button>
        </div>
      </section>`;

    const $ = id => document.getElementById(id);
    if (cloud && cloud.enabled && !cloud.user) {
      let mode = "in";
      const msg = (t, ok) => { $("auMsg").textContent = t; $("auMsg").className = "auth-msg " + (ok ? "good" : "bad"); };
      const busy = (on) => { $("auBtn").disabled = on; $("gBtn").disabled = on; };
      $("gBtn").onclick = async () => {
        busy(true); msg("");
        try { await cloud.signInGoogle(); } catch (e) { msg(cloud.message(e)); } finally { busy(false); }
      };
      app.querySelectorAll("#modeSeg button").forEach(b => b.onclick = () => {
        mode = b.dataset.m;
        app.querySelectorAll("#modeSeg button").forEach(x => x.classList.toggle("on", x === b));
        $("nameField").hidden = mode !== "up";
        $("auBtn").textContent = mode === "up" ? "회원가입" : "로그인";
        $("auPw").autocomplete = mode === "up" ? "new-password" : "current-password";
        msg("");
      });
      const submitAuth = async () => {
        const email = $("auEmail").value.trim(), pw = $("auPw").value;
        if (!email || !pw) { msg("이메일과 비밀번호를 입력하세요."); return; }
        busy(true); msg("");
        try {
          if (mode === "up") await cloud.signUpEmail(email, pw, $("auName").value.trim());
          else await cloud.signInEmail(email, pw);
        } catch (e) { msg(cloud.message(e)); busy(false); }
      };
      $("auBtn").onclick = submitAuth;
      $("auPw").onkeydown = e => { if (e.key === "Enter") submitAuth(); };
      $("resetPw").onclick = async () => {
        const email = $("auEmail").value.trim();
        if (!email) { msg("비밀번호 재설정 메일을 받을 이메일을 위 칸에 입력하세요."); return; }
        try { await cloud.resetPassword(email); msg("비밀번호 재설정 메일을 보냈습니다. 메일함을 확인하세요.", true); }
        catch (e) { msg(cloud.message(e)); }
      };
    }
    if (cloud && cloud.user) {
      $("syncBtn").onclick = async () => { dirty = true; setSync("saving"); await flush(); };
      $("reloadBtn").onclick = async () => {
        if (dirty && !confirm("아직 저장되지 않은 변경이 있습니다. 계정의 기록으로 덮어쓸까요?")) return;
        dirty = false; await onAuthChanged(cloud.user);
      };
      $("logoutBtn").onclick = async () => {
        await flush();
        if (dirty && !confirm("저장되지 않은 변경이 있습니다. 그래도 로그아웃할까요?")) return;
        await cloud.signOut();
      };
    }
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
        const d = JSON.parse(t);
        store = normalize(d);
        save(); renderAccount(); alert("불러왔습니다." + (cloud && cloud.user ? " 계정에 저장합니다." : ""));
      }).catch(() => alert("올바른 백업 파일이 아닙니다."));
    };
    document.getElementById("resetBtn").onclick = () => {
      if (confirm("모든 풀이 기록, 오답노트, 외운 용어 체크를 삭제할까요? (내 단어는 유지됩니다) 되돌릴 수 없습니다.")) { store = { ...empty(), custom: store.custom }; save(); renderAccount(); }
    };
  }

  // ---------- 용어 학습 표 ----------
  const GLOSSARY_BASE = window.GLOSSARY || [];
  const MY_CAT = "내 단어";
  const PAGE_SIZE = 20;
  const gopts = { q: "", cat: "", known: "all", hide: false, page: 1 };
  const QTEXT = BANK.map(q => (q.question + " " + (q.choices || []).join(" ")).toLowerCase());
  const relCache = new Map();

  function allTerms() {
    const mine = (store.custom || []).map(c => ({
      id: c.id, term: c.term, ko: c.ko || "내가 추가한 단어", cat: MY_CAT,
      meaning: c.meaning, tip: c.tip || "", alias: [], source: c.source || "", custom: true
    }));
    return mine.concat(GLOSSARY_BASE);
  }

  function relatedIds(g) {
    const key = g.id + "|" + g.term;
    if (relCache.has(key)) return relCache.get(key);
    const keys = [g.term.replace(/\s*\(.*?\)\s*/g, " ").trim(), ...g.alias].map(k => k.toLowerCase()).filter(k => k.length >= 2);
    const tests = keys.map(k => /^[a-z0-9 .\-]+$/.test(k)
      ? (t => new RegExp("(^|[^a-z0-9])" + k.replace(/[.\-]/g, "\\$&") + "($|[^a-z0-9])").test(t))
      : (t => t.includes(k)));
    const ids = BANK.filter((q, i) => tests.some(f => f(QTEXT[i]))).map(q => q.id);
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
    app.innerHTML = noticeHTML() + `
      <section class="card">
        <h1>용어 학습 표</h1>
        <p class="muted">기출에 나온 AWS 용어 ${GLOSSARY_BASE.length}개${(store.custom || []).length ? ` + 내 단어 ${store.custom.length}개` : ""}.
        '뜻 가리기'로 스스로 테스트하고, 외운 용어는 체크하세요.</p>
        <div class="progress" style="margin:10px 0 4px"><div id="glBar"></div></div>
        <div class="muted" style="font-size:13px" id="glBarText"></div>
      </section>

      <section class="card">
        <h2>단어 추가 · 뜻 찾기</h2>
        <p class="muted" style="margin-top:-6px">모르는 단어를 입력하면 용어 표 → 기출 해설 → 위키백과 순서로 뜻을 찾아 줍니다. 찾은 뜻을 고쳐서 '내 단어'로 저장하세요.</p>
        <div class="row">
          <input type="text" id="lkWord" placeholder="예: Kinesis, 서브넷, NAT 게이트웨이" autocomplete="off" style="flex:3">
          <button class="btn primary" id="lkBtn" style="flex:1">뜻 찾기</button>
        </div>
        <div id="lkResult"></div>
      </section>

      <section class="card gl-controls">
        <input type="text" id="glSearch" placeholder="표에서 검색 (예: S3, 캐시, 라이선스)" value="${esc(gopts.q)}" autocomplete="off">
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
        if (!q.explanation || snippets.length >= 3) continue;
        const line = q.explanation.split("\n").find(l => l.toLowerCase().includes(w));
        if (line) snippets.push({ no: q.no, text: line.replace(/^[·\s]+/, "") });
      }
      const qCount = QTEXT.filter(t => t.includes(w)).length;
      const enc = encodeURIComponent(word);

      lkResult.innerHTML = `
        ${local.length ? `<div class="lk-block"><div class="lk-title">📘 용어 표에 있어요</div>
          ${local.map(g => `<div class="lk-item"><b>${esc(g.term)}</b> <span class="muted">${esc(g.ko)}</span><div>${esc(g.meaning)}</div>
            <button class="link lk-show" data-term="${esc(g.term)}">표에서 보기</button></div>`).join("")}</div>` : ""}
        ${snippets.length ? `<div class="lk-block"><div class="lk-title">📝 기출 해설에서 찾았어요 ${qCount ? `<span class="muted">(문제·보기 ${qCount}곳에 등장)</span>` : ""}</div>
          ${snippets.map((s, i) => `<div class="lk-item"><span class="tag">원본 ${s.no}번</span> ${esc(s.text)} <button class="link lk-snip" data-i="${i}">이 문장 사용</button></div>`).join("")}</div>` : ""}
        <div class="lk-block" id="lkWiki"><div class="lk-title">🌐 위키백과</div><div class="muted">찾는 중…</div></div>
        <div class="lk-links muted">더 찾아보기:
          <a href="https://docs.aws.amazon.com/search/doc-search.html?searchPath=documentation&searchQuery=${enc}" target="_blank" rel="noopener">AWS 공식 문서 ↗</a> ·
          <a href="https://www.google.com/search?q=${encodeURIComponent("AWS " + word)}" target="_blank" rel="noopener">Google ↗</a>
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
        else store.custom.unshift({ id: "c" + Date.now(), added: Date.now(), ...data });
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

  // ---------- 라우팅 & 키보드 ----------
  let currentPage = "home";
  function go(page) {
    quiz = null;
    currentPage = page;
    if (page === "notes") renderNotes();
    else if (page === "glossary") renderGlossary();
    else if (page === "account") renderAccount();
    else { currentPage = "home"; renderHome(); }
    window.scrollTo(0, 0);
  }
  // 로그인 상태가 바뀌면 현재 화면을 다시 그림 (문제 푸는 중에는 화면 유지)
  function rerender() {
    updateBadge();
    renderAccountChip();
    if (quiz) return;
    if (currentPage === "notes") renderNotes();
    else if (currentPage === "glossary") renderGlossary();
    else if (currentPage === "account") renderAccount();
    else renderHome();
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-go]");
    if (t) go(t.dataset.go);
  });
  document.addEventListener("keydown", e => {
    if (!quiz || !document.querySelector(".qtext")) return;
    const q = quiz.list[quiz.i];
    if (e.target.tagName === "TEXTAREA") return;
    if (e.key === "Enter") {
      if (quiz.answered) { e.preventDefault(); next(); }
      else if (isMulti(q)) { e.preventDefault(); submit([...quiz.picked]); }
      else if (!isMC(q)) { e.preventDefault(); submit(document.getElementById("shortInput").value); }
    } else if (isMC(q) && !quiz.answered && /^[1-9]$/.test(e.key) && +e.key <= q.choices.length) {
      if (isMulti(q)) togglePick(+e.key); else submit(+e.key);
    }
  });

  updateBadge();
  renderAccountChip();
  renderHome();
  if (window.Cloud) window.dispatchEvent(new Event("cloud-ready"));
})();
