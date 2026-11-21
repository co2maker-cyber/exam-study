/* 라우터 콘솔 연습장 — 화면(콘솔, 과제, PC 패널) */
(function () {
  "use strict";
  const S = window.RouterSim, LABS = window.RouterLabs.LABS, TEXT = window.LAB_TEXT;
  const $ = id => document.getElementById(id);
  const term = $("term"), screen = $("screen");
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const pad = (s, n) => String(s).padEnd(n);
  const STORE = "routerLab.v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } };
  const saveStore = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) { /* 무시 */ } };
  const store = Object.assign({ current: 1, done: {} }, load());

  // ───── 화면 출력 ─────
  const out = document.createElement("span"), tail = document.createElement("span");
  screen.append(out, tail);
  let partial = "";
  let mode = "busy";            // idle | busy | ask | more
  let buf = "", cur = 0, hist = [], histIdx = -1, histSave = "";
  let askRes = null, askSecret = false, moreRes = null;
  let abortFlag = false, noPrompt = false, pendingBoot = false, asyncQ = [];
  let router = null, labNo = 1, lastDone = [];
  let pasteQ = [];

  function write(text) {
    const parts = String(text).split("\n");
    for (let i = 0; i < parts.length; i++) {
      partial += parts[i];
      if (i < parts.length - 1) { out.appendChild(document.createTextNode(partial + "\n")); partial = ""; }
    }
    if (out.childNodes.length > 4000) for (let k = 0; k < 500; k++) out.removeChild(out.firstChild);
    render();
  }
  function writeSys(text) { const s = document.createElement("span"); s.className = "sys"; s.textContent = partial + text; partial = ""; out.appendChild(s); render(); }
  function promptText() { if (!router || router.state === "pressReturn" || router.state === "boot" || router.state === "login") return ""; return router.prompt(); }
  function bufHTML(secret) {
    if (secret) return '<span class="cur"> </span>';
    return esc(buf.slice(0, cur)) + '<span class="cur">' + (buf[cur] ? esc(buf[cur]) : " ") + "</span>" + esc(buf.slice(cur + 1));
  }
  function render() {
    let h = esc(partial);
    if (mode === "idle") h += (noPrompt ? "" : esc(promptText())) + bufHTML(false);
    else if (mode === "ask") h += bufHTML(askSecret);
    else if (mode === "more") h += '<span class="more"> --More-- </span>';
    tail.innerHTML = h;
    term.scrollTop = term.scrollHeight;
  }

  // ───── 라우터와 주고받는 입출력 ─────
  const io = {
    out: t => write(t),
    raw: t => write(t),
    ask: (p, o = {}) => new Promise(res => {
      write(p); askRes = res; askSecret = !!o.secret; buf = ""; cur = 0; mode = "ask"; render();
      if (pasteQ.length) setTimeout(feedPaste, 30);
    }),
    page: async (lines) => {
      const len = router.rt.termLen;
      if (!len || lines.length <= len - 1) { write(lines.join("\n") + "\n"); return; }
      let i = 0, step = len - 1;
      while (i < lines.length) {
        const n = Math.min(step, lines.length - i);
        write(lines.slice(i, i + n).join("\n") + "\n"); i += n;
        if (i >= lines.length) break;
        const k = await new Promise(r => { moreRes = r; mode = "more"; render(); });
        moreRes = null; mode = "busy"; render();
        if (k === "q") break;
        step = k === " " ? len - 1 : 1;
      }
    },
    aborted: () => abortFlag
  };

  async function submit(line) {
    if (mode === "ask") {
      write((askSecret ? "" : line) + "\n");
      const r = askRes; askRes = null; mode = "busy"; buf = ""; cur = 0; render(); r(line); return;
    }
    if (mode !== "idle") return;
    write((noPrompt ? "" : promptText()) + line + "\n");
    noPrompt = false;
    if (line.trim()) { hist.push(line); if (hist.length > 100) hist.shift(); }
    histIdx = -1; buf = ""; cur = 0; mode = "busy"; abortFlag = false; render();
    try { await router.input(line, io); }
    catch (e) { write(`% 연습장 내부 오류: ${e.message}\n`); console.error(e); }
    while (pendingBoot) { pendingBoot = false; await router.boot(io); }
    mode = "idle"; flushAsync(); render(); refresh();
    if (pasteQ.length) setTimeout(feedPaste, 30);
  }
  function feedPaste() { if (!pasteQ.length) return; if (mode === "idle" || mode === "ask") { const l = pasteQ.shift(); buf = l; cur = l.length; submit(l); } }
  function flushAsync() { const q = asyncQ; asyncQ = []; q.forEach(m => showAsync(m)); }
  function showAsync(msg) {
    if (mode !== "idle") { asyncQ.push(msg); return; }
    const sync = router.cfg.lines.con.logSync;
    if (sync || !buf) { write("\n" + msg + "\n"); }
    else { write((noPrompt ? "" : promptText()) + buf.slice(0) + "\n" + msg + "\n"); noPrompt = true; }
  }

  // ───── 키보드 ─────
  function gmode() { return router.mode === "priv" ? "privx" : router.mode; }
  function showHelp(text) {
    if (router.state === "rommon") { write(promptText() + text + "?\n" + "alias               set and display aliases command\nboot                boot up an external process\nconfreg             configuration register utility\ndir                 list files in file system\nhelp                monitor builtin command help\nreset               system reset\n\n"); return; }
    const h = S.helpFor(gmode(), text);
    write((noPrompt ? "" : promptText()) + text + "?\n");
    if (!h.items.length && !h.cr) write("% Unrecognized command\n");
    else if (h.partial) write(h.items.map(x => x[0]).join("  ") + "\n\n");
    else { const lines = h.items.map(([k, d]) => "  " + pad(k, 22) + (d || "")); if (h.cr) lines.push("  <cr>"); write(lines.join("\n") + "\n\n"); }
    noPrompt = false;
  }
  function doTab() { if (router.state !== "exec") return; const c = S.complete(gmode(), buf); if (c) { buf = c; cur = buf.length; render(); } }
  function ctrlZ() {
    if (["config", "if", "rip", "ospf", "eigrp", "line", "dhcp", "nacl"].includes(router.mode)) {
      write(promptText() + buf + "^Z\n"); buf = ""; cur = 0; router.mode = "priv"; router.ctx = {}; router.configExit(); render();
    }
  }
  function histMove(d) {
    if (!hist.length) return;
    if (histIdx === -1) { if (d > 0) return; histSave = buf; histIdx = hist.length; }
    histIdx += d;
    if (histIdx < 0) histIdx = 0;
    if (histIdx >= hist.length) { histIdx = -1; buf = histSave; } else buf = hist[histIdx];
    cur = buf.length; render();
  }
  function sendBreak() {
    const ok = router && router.sendBreak();
    const b = $("breakBtn"); b.classList.add("armed"); setTimeout(() => b.classList.remove("armed"), 400);
    if (!ok && router && router.state !== "boot") { b.title = "부팅 중에만 동작합니다 (먼저 ⏻ 전원 재시작)"; }
  }
  document.addEventListener("keydown", e => {
    const ae = document.activeElement;
    if (ae && (ae.tagName === "SELECT" || ae.tagName === "TEXTAREA" || ae.tagName === "INPUT")) return;
    if (ae && ae.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
    if (ae && ae.tagName === "SUMMARY") return;
    if (e.metaKey || (e.ctrlKey && (e.key === "c" || e.key === "C") && window.getSelection().toString())) return;
    if (e.ctrlKey && e.key === "v") return; // 붙여넣기는 paste 이벤트로
    if (!router) return;
    const k = e.key;
    if (e.ctrlKey && e.shiftKey && (e.code === "Digit6" || k === "^" || k === "6")) { abortFlag = true; e.preventDefault(); return; }
    if (k === "Pause" || k === "Cancel" || (e.ctrlKey && k === "Break")) { sendBreak(); e.preventDefault(); return; }
    if (mode === "more") { e.preventDefault(); const r = moreRes; if (!r) return; r(k === " " ? " " : k === "Enter" ? "\n" : "q"); return; }
    if (mode === "busy") { if (e.ctrlKey && k.toLowerCase() === "c") abortFlag = true; e.preventDefault(); return; }
    const editing = mode === "idle" || mode === "ask";
    if (!editing) return;
    if (router.state === "pressReturn" && mode === "idle") { if (k === "Enter") { e.preventDefault(); submit(""); } return; }
    if (k === "Enter") { e.preventDefault(); submit(buf); return; }
    if (e.ctrlKey) {
      const c = k.toLowerCase();
      const map = {
        a: () => cur = 0, e: () => cur = buf.length, b: () => cur = Math.max(0, cur - 1), f: () => cur = Math.min(buf.length, cur + 1),
        u: () => { buf = buf.slice(cur); cur = 0; }, k: () => { buf = buf.slice(0, cur); }, d: () => { buf = buf.slice(0, cur) + buf.slice(cur + 1); },
        w: () => { const m = buf.slice(0, cur).match(/\S+\s*$/); if (m) { buf = buf.slice(0, cur - m[0].length) + buf.slice(cur); cur -= m[0].length; } },
        p: () => histMove(-1), n: () => histMove(1),
        r: () => write((noPrompt ? "" : promptText()) + buf + "\n"),
        l: () => { out.textContent = ""; partial = ""; },
        z: () => { if (mode === "idle") ctrlZ(); },
        c: () => { if (mode === "idle") { write((noPrompt ? "" : promptText()) + buf + "^C\n"); buf = ""; cur = 0; noPrompt = false; } else if (mode === "ask") { submit(""); } }
      };
      if (map[c]) { e.preventDefault(); map[c](); render(); }
      return;
    }
    if (k === "Tab") { e.preventDefault(); if (mode === "idle") doTab(); return; }
    if (k === "?" && mode === "idle" && (router.state === "exec" || router.state === "rommon")) { e.preventDefault(); showHelp(buf); return; }
    if (k === "ArrowUp") { e.preventDefault(); if (mode === "idle") histMove(-1); return; }
    if (k === "ArrowDown") { e.preventDefault(); if (mode === "idle") histMove(1); return; }
    if (k === "ArrowLeft") { e.preventDefault(); cur = Math.max(0, cur - 1); render(); return; }
    if (k === "ArrowRight") { e.preventDefault(); cur = Math.min(buf.length, cur + 1); render(); return; }
    if (k === "Home") { e.preventDefault(); cur = 0; render(); return; }
    if (k === "End") { e.preventDefault(); cur = buf.length; render(); return; }
    if (k === "Backspace") { e.preventDefault(); if (cur > 0) { buf = buf.slice(0, cur - 1) + buf.slice(cur); cur--; render(); } return; }
    if (k === "Delete") { e.preventDefault(); buf = buf.slice(0, cur) + buf.slice(cur + 1); render(); return; }
    if (k === "Escape") { e.preventDefault(); buf = ""; cur = 0; render(); return; }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); buf = buf.slice(0, cur) + k + buf.slice(cur); cur++; render(); }
  });
  document.addEventListener("paste", e => {
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
    const t = (e.clipboardData || window.clipboardData).getData("text");
    if (!t) return;
    e.preventDefault();
    const lines = t.replace(/\r/g, "").split("\n");
    const first = lines.shift();
    buf = buf.slice(0, cur) + first + buf.slice(cur); cur += first.length; render();
    if (lines.length) { const rest = lines.filter((l, i) => l.trim() || i < lines.length - 1).filter(l => !l.trim().startsWith("!") && !l.trim().startsWith("(")); pasteQ.push(...rest); const l0 = buf; submit(l0); }
  });
  term.addEventListener("focus", () => term.classList.remove("blur"));
  term.addEventListener("blur", () => term.classList.add("blur"));

  // 모바일 입력
  const mIn = $("mInput");
  mIn.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); mobileKey("enter"); }
    else if (e.key === "Tab") { e.preventDefault(); mobileKey("tab"); }
    else if (e.key === "ArrowUp") { e.preventDefault(); mobileKey("up"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); mobileKey("down"); }
  });
  mIn.addEventListener("input", () => { if (mode === "idle" || mode === "ask") { buf = mIn.value; cur = buf.length; render(); } });
  document.querySelectorAll(".mkeys button").forEach(b => b.addEventListener("click", () => { mobileKey(b.dataset.k); }));
  function mobileKey(k) {
    if (!router) return;
    if (mode === "more") { const r = moreRes; if (r) r(k === "enter" ? " " : "q"); return; }
    if (k === "abort") { abortFlag = true; return; }
    if (k === "ctrlc") { if (mode === "busy") abortFlag = true; else { buf = ""; cur = 0; mIn.value = ""; render(); } return; }
    if (k === "ctrlz") { if (mode === "idle") ctrlZ(); return; }
    if (k === "enter") { const v = mIn.value; mIn.value = ""; buf = v; cur = v.length; if (router.state === "pressReturn" && mode === "idle") submit(""); else submit(v); return; }
    if (k === "tab") { buf = mIn.value; cur = buf.length; doTab(); mIn.value = buf; mIn.focus(); return; }
    if (k === "?") { buf = mIn.value; showHelp(buf); render(); mIn.focus(); return; }
    if (k === "up" || k === "down") { buf = mIn.value; histMove(k === "up" ? -1 : 1); mIn.value = buf; return; }
  }

  // ───── 실습 · 과제 패널 ─────
  function labText(n) { return TEXT.find(l => l.n === n); }
  function fillLabSelect() {
    const sel = $("labSel");
    sel.innerHTML = TEXT.map(l => `<option value="${l.n}" ${l.n === labNo ? "selected" : ""}>${store.done[l.n] ? "✓ " : ""}${l.n ? "실습 " + l.n : "자유 연습"} · ${esc(l.title)}</option>`).join("");
  }
  function taskStates() {
    const lab = LABS[labNo];
    if (!router._pcCache) router._pcCache = router.pcChecks();
    return lab.checks.map(c => { try { return !!c(router); } catch (e) { return false; } });
  }
  const openHints = new Set();
  function renderLab() {
    const t = labText(labNo), st = taskStates(), done = st.filter(Boolean).length;
    const card = $("labCard");
    let h = `<h2>${labNo ? "실습 " + labNo : "자유 연습"} · ${esc(t.title)}</h2><p class="small">${esc(t.desc)}</p>`;
    if (t.tasks.length) {
      h += `<div class="progress"><div style="width:${done / t.tasks.length * 100}%"></div></div><div class="muted small">${done} / ${t.tasks.length} 완료 · 끝낸 과제는 자동으로 체크됩니다</div><ol class="tasks">`;
      t.tasks.forEach((k, i) => {
        const ans = t.answer[i];
        h += `<li class="${st[i] ? "done" : ""}"><span class="ck">${st[i] ? "✓" : ""}</span><span class="tt">${i + 1}. ${esc(k.text)}${ans && ans.lines.length ? `<button class="hintbtn" data-h="${i}">${openHints.has(i) ? "힌트 닫기" : "힌트"}</button>` : ""}${k.note ? `<span class="note">💡 ${esc(k.note)}</span>` : ""}${openHints.has(i) && ans ? `<pre class="h">${esc(ans.lines.join("\n"))}</pre>` : ""}</span></li>`;
      });
      h += "</ol>";
      if (done === t.tasks.length) h += `<div class="labdone">🎉 실습 완료! ${labNo < 14 ? `<button class="hintbtn" id="nextLab">다음 실습 →</button>` : ""}</div>`;
      h += `<details style="margin-top:10px"><summary class="small"><b>모범 답안 전체 보기</b> (콘솔에 붙여넣기 가능)</summary><pre class="ans">${esc(t.answer.map(a => "! " + a.title + "\n" + a.lines.join("\n")).join("\n"))}</pre></details>`;
    } else h += `<p class="small muted">과제 없이 공장 초기 상태에서 시작합니다. 명령 ${S.COMMAND_COUNT}개를 자유롭게 쳐 보세요. <b>?</b>로 칠 수 있는 명령을 확인할 수 있습니다.</p>`;
    card.innerHTML = h;
    card.querySelectorAll("[data-h]").forEach(b => b.onclick = () => { const i = +b.dataset.h; openHints.has(i) ? openHints.delete(i) : openHints.add(i); renderLab(); });
    const nx = $("nextLab"); if (nx) nx.onclick = () => startLab(labNo + 1);
    if (t.tasks.length && done === t.tasks.length && !store.done[labNo]) { store.done[labNo] = true; saveStore(); fillLabSelect(); }
    lastDone = st;
  }
  const whyOpen = new Set();
  function renderPC() {
    const list = router._pcCache || router.pcChecks();
    $("pcList").innerHTML = list.map(x => `<li><span class="st">${x.ok ? "✅" : "❌"}</span>${esc(x.label)}${x.note ? `<span class="note">${esc(x.note)}</span>` : ""}${!x.ok && x.why ? (whyOpen.has(x.id) ? `<span class="why">${esc(x.why)}</span>` : `<button class="whybtn" data-w="${x.id}">왜?</button>`) : ""}</li>`).join("");
    $("pcList").querySelectorAll("[data-w]").forEach(b => b.onclick = () => { whyOpen.add(b.dataset.w); router.ev("why:" + b.dataset.w); refresh(); });
  }
  function refresh() { if (!router) return; renderLab(); renderPC(); }
  setInterval(() => { if (router && router.state === "exec" && mode === "idle") { router._pcCache = router.pcChecks(); refresh(); } }, 4000);

  async function startLab(n) {
    labNo = n; store.current = n; saveStore(); openHints.clear(); whyOpen.clear();
    pasteQ = []; asyncQ = []; abortFlag = true;
    if (askRes) { const r = askRes; askRes = null; r(""); }
    if (moreRes) { const r = moreRes; moreRes = null; r("q"); }
    mode = "busy"; render();
    router = await window.RouterLabs.buildLab(n);
    router.on("async", m => showAsync(m));
    router.on("change", () => {});
    router.on("reload", () => { pendingBoot = true; });
    router.on("reboot", () => { pendingBoot = true; });
    out.textContent = ""; partial = ""; buf = ""; cur = 0; noPrompt = false; hist = [];
    const t = labText(n);
    writeSys(`── ${n ? "실습 " + n : "자유 연습"} · ${t.title} ──\n`);
    write(`${t.desc}\n\n`);
    write(`${router.cfg.hostname} con0 is now available\n\nPress RETURN to get started!\n\n`);
    fillLabSelect();
    abortFlag = false; mode = "idle"; render(); refresh();
    if (window.matchMedia("(pointer: fine)").matches) term.focus();
  }

  $("labSel").addEventListener("change", e => { startLab(+e.target.value); });
  $("restartBtn").addEventListener("click", () => { if (confirm("이 실습을 처음 상태로 되돌릴까요?")) startLab(labNo); });
  $("powerBtn").addEventListener("click", async () => {
    if (!router || router.state === "boot") return;
    if (router.state === "exec" && router.isDirty() && !confirm("저장하지 않은 설정은 사라집니다. 전원을 다시 켤까요?")) return;
    abortFlag = true;
    if (askRes) { const r = askRes; askRes = null; r(""); }
    if (moreRes) { const r = moreRes; moreRes = null; r("q"); }
    await new Promise(r => setTimeout(r, 50));
    mode = "busy"; buf = ""; cur = 0; noPrompt = false; abortFlag = false;
    write("\n");
    writeSys("⏻ 전원을 껐다 켭니다. 부팅 초반에 Break를 누르면 ROMMON으로 들어갑니다.\n");
    $("breakBtn").classList.add("armed");
    await router.boot(io);
    $("breakBtn").classList.remove("armed");
    while (pendingBoot) { pendingBoot = false; await router.boot(io); }
    mode = "idle"; render(); refresh();
    term.focus();
  });
  $("breakBtn").addEventListener("click", sendBreak);
  term.addEventListener("click", () => { if (!window.getSelection().toString()) term.focus(); });

  // 시작
  labNo = TEXT.some(l => l.n === store.current) ? store.current : 1;
  fillLabSelect();
  startLab(labNo);
  window.__routerUI = { get router() { return router; }, submit: l => { buf = l; cur = l.length; return submit(l); }, get mode() { return mode; } };
})();
