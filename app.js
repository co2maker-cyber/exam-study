(function () {
  "use strict";

  const BANK = (window.QUESTION_BANK || []).filter(q => q && q.id && q.question);
  const BY_ID = Object.fromEntries(BANK.map(q => [q.id, q]));
  const STORE_KEY = "examStudy.v1";
  const CLEAR_STREAK = 2; // 오답노트 문제를 연속으로 이만큼 맞히면 오답노트에서 자동 삭제
  const NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  const app = document.getElementById("app");

  // ---------- 저장소 ----------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && typeof s === "object") return { stats: s.stats || {}, wrong: s.wrong || {} };
    } catch (e) { /* 무시 */ }
    return { stats: {}, wrong: {} };
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

    app.innerHTML = `
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
    app.innerHTML = `
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
      </section>
      <section class="card">
        <h2>학습 기록 관리</h2>
        <p class="muted">기록은 이 브라우저에만 저장됩니다. 다른 기기로 옮기려면 백업 파일을 사용하세요.</p>
        <div class="row">
          <button class="btn small" id="exportBtn">백업 내보내기</button>
          <label class="btn small" style="text-align:center">백업 불러오기<input type="file" id="importInp" accept=".json" hidden></label>
          <button class="btn small danger" id="resetBtn">기록 전체 초기화</button>
        </div>
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
        store = { stats: d.stats || {}, wrong: d.wrong || {} };
        save(); renderNotes(); alert("불러왔습니다.");
      }).catch(() => alert("올바른 백업 파일이 아닙니다."));
    };
    document.getElementById("resetBtn").onclick = () => {
      if (confirm("모든 풀이 기록과 오답노트를 삭제할까요? 되돌릴 수 없습니다.")) { store = { stats: {}, wrong: {} }; save(); renderNotes(); }
    };
  }

  // ---------- 라우팅 & 키보드 ----------
  function go(page) {
    quiz = page === "quiz" ? quiz : null;
    if (page === "notes") renderNotes(); else renderHome();
    window.scrollTo(0, 0);
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
  renderHome();
})();
