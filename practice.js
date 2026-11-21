/*
 * 계산 연습 — 서브넷 · 마스크 변환 · 경로 선택(RIP/OSPF/AD) · DHCP
 * 문제는 매번 무작위로 만들어집니다. 점수는 이 기기에만 저장됩니다(examStudy.practice).
 */
(function () {
  const KEY = "examStudy.practice";
  const MODES = [
    { id: "subnet", name: "서브넷 계산", desc: "IP와 마스크로 네트워크·브로드캐스트·호스트 범위 구하기" },
    { id: "mask", name: "마스크·변환", desc: "필요한 호스트·서브넷 수로 마스크 고르기, /표기 ↔ 마스크 ↔ 와일드카드" },
    { id: "route", name: "경로 선택", desc: "AD·최장 일치·OSPF Cost·RIP 홉 수로 어떤 경로를 쓰는지" },
    { id: "dhcp", name: "DHCP", desc: "DORA 순서, 메시지 주소·포트, 범위 계산, 임대 시간, 장애 상황" }
  ];

  // ---------- 공통 도구 ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ip2n = ip => ip.split(".").reduce((n, o) => n * 256 + +o, 0);
  const n2ip = n => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join(".");
  const maskN = p => p === 0 ? 0 : (2 ** 32 - 2 ** (32 - p));
  const maskS = p => n2ip(maskN(p));
  const wildS = p => n2ip(2 ** (32 - p) - 1);
  const bin8 = o => (+o).toString(2).padStart(8, "0");
  const binIP = (ip, p) => {
    const b = ip.split(".").map(bin8).join("");
    const net = b.slice(0, p), host = b.slice(p);
    const fmt = (s, off) => s.split("").map((c, i) => ((off + i) % 8 === 0 && off + i > 0 ? "." : "") + c).join("");
    return `<span class="px-net">${fmt(net, 0)}</span><span class="px-host">${fmt(host, p)}</span>`;
  };
  function randomIP() {
    const t = ri(1, 3);
    if (t === 1) return `192.168.${ri(0, 255)}.${ri(1, 254)}`;
    if (t === 2) return `172.${ri(16, 31)}.${ri(0, 255)}.${ri(1, 254)}`;
    return `10.${ri(0, 255)}.${ri(0, 255)}.${ri(1, 254)}`;
  }
  const normIP = s => s.trim().replace(/\s+/g, "").replace(/^\//, "");
  const sameIP = (a, b) => { const x = normIP(a).split("."); return x.length === 4 && x.every(o => /^\d{1,3}$/.test(o)) && x.map(Number).join(".") === b; };
  const sameNum = (a, b) => a.trim().replace(/[,개대\s]/g, "") !== "" && Number(a.trim().replace(/[,개대\s]/g, "")) === Number(b);

  // ---------- 1. 서브넷 계산 ----------
  function genSubnet() {
    const p = Math.random() < 0.75 ? ri(24, 30) : ri(17, 23);
    const ip = randomIP();
    const n = ip2n(ip), size = 2 ** (32 - p);
    const net = Math.floor(n / size) * size, bc = net + size - 1;
    const showMask = Math.random() < 0.5;
    const given = showMask ? `${ip}  ·  서브넷 마스크 ${maskS(p)}` : `${ip}/${p}`;
    const oct = Math.floor((p - 1) / 8); // 관심 옥텟(0~3)
    const mOct = maskS(p).split(".")[oct], block = 256 - mOct;
    const ipOct = ip.split(".")[oct];
    return {
      type: "fields",
      prompt: `다음 호스트가 속한 서브넷을 구하세요.<div class="px-given">${esc(given)}</div>`,
      fields: [
        { label: "네트워크 주소", ans: n2ip(net), check: sameIP },
        { label: "첫 번째 사용 가능 주소", ans: n2ip(net + 1), check: sameIP },
        { label: "마지막 사용 가능 주소", ans: n2ip(bc - 1), check: sameIP },
        { label: "브로드캐스트 주소", ans: n2ip(bc), check: sameIP },
        { label: "사용 가능한 호스트 수", ans: String(size - 2), check: sameNum },
        showMask ? { label: "프리픽스 (/숫자)", ans: String(p), check: (a, b) => sameNum(a.replace("/", ""), b) }
                 : { label: "서브넷 마스크", ans: maskS(p), check: sameIP }
      ],
      explain: `
        <b>/${p} = ${maskS(p)}</b> → 호스트 비트 ${32 - p}개 → 호스트 수 2<sup>${32 - p}</sup> − 2 = <b>${size - 2}</b><br>
        ${oct + 1}번째 옥텟 마스크가 ${mOct} → 블록 크기 256 − ${mOct} = <b>${block}</b> (서브넷이 ${block}씩 증가)<br>
        ${oct + 1}번째 옥텟 ${ipOct} → ${block}의 배수 중 ${ipOct} 이하에서 가장 큰 값 = <b>${Math.floor(ipOct / block) * block}</b>
        <div class="px-bin">
          <div><span>IP</span><code>${binIP(ip, p)}</code></div>
          <div><span>마스크</span><code>${binIP(maskS(p), p)}</code></div>
          <div><span>네트워크</span><code>${binIP(n2ip(net), p)}</code> = ${n2ip(net)} (호스트 비트 모두 0)</div>
          <div><span>브로드캐스트</span><code>${binIP(n2ip(bc), p)}</code> = ${n2ip(bc)} (호스트 비트 모두 1)</div>
        </div>
        <span class="muted">파란색 = 네트워크 부분, 주황색 = 호스트 부분</span>`
    };
  }

  // ---------- 2. 마스크 · 변환 ----------
  function maskChoices(correctP, pool) {
    const others = [...new Set(pool)].filter(x => x !== correctP && x >= 8 && x <= 30);
    for (let d = 1; others.length < 3; d++) [correctP + d, correctP - d].forEach(x => { if (x >= 8 && x <= 30 && x !== correctP && !others.includes(x) && others.length < 3) others.push(x); });
    const list = shuffle([correctP, ...shuffle(others).slice(0, 3)]);
    return { choices: list.map(p => `${maskS(p)} (/${p})`), answer: list.indexOf(correctP) };
  }
  function genMask() {
    const kind = pick(["hosts", "hosts", "subnets", "toMask", "toPrefix", "wild", "count"]);
    if (kind === "hosts") {
      const H = pick([ri(2, 14), ri(15, 62), ri(63, 254), ri(255, 1000)]);
      let h = 2; while (2 ** h - 2 < H) h++;
      const p = 32 - h, c = maskChoices(p, [p - 1, p + 1, p + 2, p - 2]);
      return {
        type: "choice", prompt: `한 서브넷에 호스트 <b>${H}대</b>를 연결해야 합니다. 주소 낭비가 가장 적은 서브넷 마스크는?`, ...c,
        explain: `필요 호스트 ${H} → 2<sup>n</sup> − 2 ≥ ${H}인 가장 작은 n = <b>${h}</b> (2<sup>${h}</sup> − 2 = ${2 ** h - 2}${h > 2 ? `, n=${h - 1}이면 ${2 ** (h - 1) - 2}대로 부족` : ""})<br>호스트 비트 ${h}개 → /${32 - h} = <b>${maskS(p)}</b>`
      };
    }
    if (kind === "subnets") {
      const S = ri(2, 60);
      let b = 1; while (2 ** b < S) b++;
      const p = 24 + b, c = maskChoices(p, [p - 1, p + 1, p + 2].filter(x => x >= 24 && x <= 30).concat([23]));
      return {
        type: "choice", prompt: `C Class 네트워크 192.168.${ri(1, 254)}.0을 <b>${S}개</b>의 서브넷으로 나누려고 합니다. 호스트를 가장 많이 둘 수 있는 서브넷 마스크는?`, ...c,
        explain: `서브넷 ${S}개 → 2<sup>b</sup> ≥ ${S}인 가장 작은 b = <b>${b}</b>비트를 빌림 (2<sup>${b}</sup> = ${2 ** b}개)<br>/24 + ${b} = /${p} = <b>${maskS(p)}</b>, 서브넷당 호스트 ${2 ** (8 - b) - 2}대<br><span class="muted">※ 옛 교재는 서브넷 수를 2<sup>b</sup> − 2로 세기도 합니다. 기출은 대부분 2<sup>b</sup> 기준입니다.</span>`
      };
    }
    if (kind === "toMask") {
      const p = ri(8, 30);
      return { type: "fields", prompt: `/${p}를 점으로 구분한 서브넷 마스크로 바꾸세요.`, fields: [{ label: "서브넷 마스크", ans: maskS(p), check: sameIP }],
        explain: `1이 ${p}개: ${binIP(maskS(p), p)}<br>옥텟별 값: 1비트 수 0→0, 1→128, 2→192, 3→224, 4→240, 5→248, 6→252, 7→254, 8→255<br>→ <b>${maskS(p)}</b>` };
    }
    if (kind === "toPrefix") {
      const p = ri(8, 30);
      return { type: "fields", prompt: `서브넷 마스크 <b>${maskS(p)}</b>를 /표기(프리픽스)로 바꾸세요.`, fields: [{ label: "프리픽스 (/숫자)", ans: String(p), check: (a, b) => sameNum(a.replace("/", ""), b) }],
        explain: `${binIP(maskS(p), p)} → 1이 <b>${p}</b>개 → /${p}` };
    }
    if (kind === "wild") {
      const p = ri(16, 30);
      const toW = Math.random() < 0.6;
      return toW
        ? { type: "fields", prompt: `OSPF <code>network</code> 명령에 쓸 와일드카드 마스크를 구하세요. 서브넷 마스크: <b>${maskS(p)}</b>`, fields: [{ label: "와일드카드 마스크", ans: wildS(p), check: sameIP }],
            explain: `와일드카드 = 255.255.255.255 − 서브넷 마스크<br>= 255.255.255.255 − ${maskS(p)} = <b>${wildS(p)}</b><br>예) <code>network ${n2ip(Math.floor(ip2n(randomIP()) / 2 ** (32 - p)) * 2 ** (32 - p))} ${wildS(p)} area 0</code>` }
        : { type: "fields", prompt: `와일드카드 마스크 <b>${wildS(p)}</b>에 해당하는 서브넷 마스크는?`, fields: [{ label: "서브넷 마스크", ans: maskS(p), check: sameIP }],
            explain: `서브넷 마스크 = 255.255.255.255 − 와일드카드 = <b>${maskS(p)}</b> (/${p})` };
    }
    // count
    const p = ri(25, 30), b = p - 24;
    return {
      type: "fields", prompt: `C Class 네트워크에 서브넷 마스크 <b>${maskS(p)}</b>를 적용했습니다.`,
      fields: [{ label: "만들 수 있는 서브넷 수", ans: String(2 ** b), check: sameNum }, { label: "서브넷당 사용 가능한 호스트 수", ans: String(2 ** (8 - b) - 2), check: sameNum }],
      explain: `/24 → /${p}: 빌린 비트 ${b}개 → 서브넷 2<sup>${b}</sup> = <b>${2 ** b}</b>개<br>남은 호스트 비트 ${8 - b}개 → 2<sup>${8 - b}</sup> − 2 = <b>${2 ** (8 - b) - 2}</b>대`
    };
  }

  // ---------- 3. 경로 선택 (AD · 최장 일치 · OSPF Cost · RIP) ----------
  const AD = [["직접 연결 (C)", 0], ["정적 경로 (S)", 1], ["eBGP (B)", 20], ["EIGRP (D)", 90], ["IGRP", 100], ["OSPF (O)", 110], ["IS-IS (i)", 115], ["RIP (R)", 120], ["EIGRP 외부 (D EX)", 170], ["iBGP (B)", 200]];
  const ADTABLE = `<table class="px-table"><tr><th>경로</th><th>AD</th></tr>${AD.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join("")}</table>`;
  function ospfCost(bw) { return Math.max(1, Math.floor(1e8 / bw)); }
  const BWS = [[64e3, "64Kbps"], [1.544e6, "T1 1.544Mbps"], [10e6, "10Mbps"], [45e6, "T3 45Mbps"], [100e6, "100Mbps"], [1e9, "1Gbps"]];

  function genRoute() {
    const kind = pick(["ad", "ad", "lpm", "lpm", "cost", "ripospf", "hop"]);
    if (kind === "ad") {
      const set = shuffle(AD.filter(a => a[1] > 0 && a[1] !== 170)).slice(0, ri(2, 4));
      const best = set.reduce((a, b) => (b[1] < a[1] ? b : a));
      const dst = `${ri(10, 200)}.${ri(0, 255)}.${ri(0, 255)}.0/24`;
      return {
        type: "choice",
        prompt: `라우터가 같은 목적지 <b>${dst}</b>에 대한 경로를 여러 프로토콜로 동시에 배웠습니다. 라우팅 테이블에 올라가는 경로는?`,
        choices: set.map(a => a[0].replace(/ \(.*\)/, "")), answer: set.indexOf(best),
        explain: `목적지·프리픽스가 같으면 <b>AD(관리 거리)가 가장 낮은</b> 경로를 씁니다.<br>${set.map(a => `${a[0]} = ${a[1]}`).join(" · ")} → <b>${best[0]}</b><div class="px-ad">${ADTABLE}</div>`
      };
    }
    if (kind === "lpm") {
      const a = ri(10, 200), b = ri(0, 255), c = ri(0, 255);
      const routes = [
        { code: "S*", net: "0.0.0.0", p: 0, hop: "203.0.113.1", ad: 1 },
        { code: pick(["R", "O"]), net: `${a}.0.0.0`, p: 8, hop: "192.168.0.2" },
        { code: pick(["O", "D"]), net: `${a}.${b}.0.0`, p: 16, hop: "192.168.0.6" },
        { code: pick(["R", "O", "S"]), net: `${a}.${b}.${c}.0`, p: 24, hop: "192.168.0.10" }
      ];
      if (Math.random() < 0.5) { const q = ri(25, 28), sz = 2 ** (32 - q), s = Math.floor(ri(0, 255) / sz) * sz; routes.push({ code: "S", net: `${a}.${b}.${c}.${s}`, p: q, hop: "192.168.0.14", lo: s, hi: s + sz - 1 }); }
      const level = ri(0, routes.length - 1);
      let dst;
      const r = routes[level];
      if (level === 0) dst = `${a === 200 ? 199 : a + 1}.${ri(0, 255)}.${ri(0, 255)}.${ri(1, 254)}`;
      else if (level === 1) dst = `${a}.${(b + ri(1, 254)) % 256}.${ri(0, 255)}.${ri(1, 254)}`;
      else if (level === 2) dst = `${a}.${b}.${(c + ri(1, 254)) % 256}.${ri(1, 254)}`;
      else if (level === 3) {
        const extra = routes[4];
        let d; do { d = ri(1, 254); } while (extra && d >= extra.lo && d <= extra.hi);
        dst = `${a}.${b}.${c}.${d}`;
      } else dst = `${a}.${b}.${c}.${ri(r.lo, r.hi)}`;
      const adOf = x => x.code.startsWith("S") ? 1 : x.code === "R" ? 120 : x.code === "O" ? 110 : 90;
      const shown = shuffle(routes);
      return {
        type: "choice",
        prompt: `라우팅 테이블이 다음과 같을 때, 목적지 <b>${dst}</b>로 가는 패킷은 어느 다음 홉으로 나갈까요?
          <pre class="px-pre">${shown.map(x => `${x.code.padEnd(3)} ${(x.net + "/" + x.p).padEnd(18)} [${adOf(x)}/${x.code.startsWith("S") ? 0 : ri(1, 30)}] via ${x.hop}`).join("\n")}</pre>`,
        choices: shown.map(x => `via ${x.hop}  (${x.net}/${x.p})`), answer: shown.indexOf(r),
        explain: `<b>최장 일치(Longest Prefix Match)</b>: 목적지와 맞는 경로 중 프리픽스가 가장 긴(가장 구체적인) 경로를 씁니다. AD보다 먼저 봅니다.<br>
          ${routes.map(x => { const m = Math.floor(ip2n(dst) / 2 ** (32 - x.p)) * 2 ** (32 - x.p) === ip2n(x.net) || x.p === 0; return `${x.net}/${x.p} → ${m ? "일치" : "불일치"}`; }).join(" · ")}<br>
          → 일치하는 것 중 가장 긴 <b>/${r.p}</b>, via ${r.hop}${level === 0 ? " (맞는 경로가 없어 기본 경로 사용)" : ""}`
      };
    }
    if (kind === "cost") {
      const n = ri(2, 3), links = Array.from({ length: n }, () => pick(BWS));
      const total = links.reduce((s, l) => s + ospfCost(l[0]), 0);
      return {
        type: "fields",
        prompt: `R1에서 목적지까지 OSPF 경로가 다음 링크를 차례로 지납니다. 기준 대역폭 10<sup>8</sup>(100Mbps)일 때 경로의 총 Cost는?
          <div class="px-given">${links.map(l => l[1]).join(" → ")}</div>`,
        fields: [{ label: "총 Cost", ans: String(total), check: sameNum }],
        explain: `OSPF Cost = 10<sup>8</sup> ÷ 대역폭(bps), 소수점 버림, 최소 1<br>${links.map(l => `${l[1]}: 10<sup>8</sup> ÷ ${l[0].toLocaleString()} = ${ospfCost(l[0])}`).join("<br>")}<br>합계 = <b>${total}</b>`
      };
    }
    if (kind === "ripospf") {
      const slow = pick(BWS.slice(0, 3)), fast = pick(BWS.slice(4));
      const hopsA = ri(1, 2), hopsB = hopsA + ri(1, 2);
      const costA = ospfCost(slow[0]) * hopsA, costB = ospfCost(fast[0]) * hopsB;
      const choices = ["RIP: 경로 A · OSPF: 경로 A", "RIP: 경로 A · OSPF: 경로 B", "RIP: 경로 B · OSPF: 경로 A", "RIP: 경로 B · OSPF: 경로 B"];
      const ans = costB < costA ? 1 : 0;
      return {
        type: "choice",
        prompt: `목적지까지 두 경로가 있습니다.<div class="px-given">경로 A: 링크 ${hopsA}개, 모두 ${slow[1]}<br>경로 B: 링크 ${hopsB}개, 모두 ${fast[1]}</div>RIP와 OSPF는 각각 어느 경로를 고를까요?`,
        choices, answer: ans,
        explain: `RIP 메트릭 = <b>홉 수</b> → A ${hopsA}홉 < B ${hopsB}홉 → <b>경로 A</b><br>OSPF 메트릭 = <b>Cost</b>(대역폭) → A ${ospfCost(slow[0])}×${hopsA} = ${costA}, B ${ospfCost(fast[0])}×${hopsB} = ${costB} → <b>경로 ${costB < costA ? "B" : "A"}</b><br><span class="muted">RIP는 대역폭을 보지 않아 느린 링크로 갈 수 있다는 것이 단점입니다.</span>`
      };
    }
    // hop
    const h = ri(12, 18);
    return {
      type: "choice",
      prompt: `RIP를 쓰는 네트워크에서 출발지 라우터부터 목적지 네트워크까지 <b>${h}홉</b>을 거쳐야 합니다. 목적지는 어떻게 될까요?`,
      choices: ["정상적으로 도달할 수 있다", "도달 불가(메트릭 16 = 무한대)로 처리된다"], answer: h <= 15 ? 0 : 1,
      explain: `RIP 최대 홉 수 = <b>15</b>, 16 이상 = 도달 불가(무한대).<br>${h}홉 → <b>${h <= 15 ? "도달 가능" : "도달 불가"}</b><br>홉 제한이 없는 OSPF를 쓰면 대규모 네트워크도 구성할 수 있습니다.`
    };
  }

  // ---------- 4. DHCP ----------
  const DORA = [
    { k: "Discover", who: "클라이언트 → 서버", what: "DHCP 서버를 찾는다", src: "0.0.0.0", dst: "255.255.255.255", sp: 68, dp: 67 },
    { k: "Offer", who: "서버 → 클라이언트", what: "사용할 IP 주소를 제안한다", src: "DHCP 서버 IP", dst: "255.255.255.255 (또는 제안 IP)", sp: 67, dp: 68 },
    { k: "Request", who: "클라이언트 → 서버", what: "제안받은 IP를 쓰겠다고 요청한다", src: "0.0.0.0", dst: "255.255.255.255", sp: 68, dp: 67 },
    { k: "Ack", who: "서버 → 클라이언트", what: "임대를 확정한다(IP·마스크·게이트웨이·DNS·임대 시간)", src: "DHCP 서버 IP", dst: "255.255.255.255 (또는 할당 IP)", sp: 67, dp: 68 }
  ];
  const DORA_TXT = DORA.map((d, i) => `${i + 1}. <b>DHCP ${d.k}</b> (${d.who}) — ${d.what}`).join("<br>");

  function genDhcp() {
    const kind = pick(["order", "step", "msg", "port", "scope", "scope", "lease", "trouble"]);
    if (kind === "order") {
      return {
        type: "order", prompt: "클라이언트가 DHCP로 IP를 받는 과정입니다. 메시지를 <b>순서대로</b> 눌러 주세요.",
        items: DORA.map(d => `DHCP ${d.k}`), explain: `<b>D-O-R-A</b><br>${DORA_TXT}`
      };
    }
    if (kind === "step") {
      const d = pick(DORA);
      const ks = DORA.map(x => `DHCP ${x.k}`);
      return {
        type: "choice", prompt: `DHCP에서 <b>${d.who}</b>로 보내며, ${d.what}는 메시지는?`,
        choices: ks.concat(["DHCP Release"]), answer: DORA.indexOf(d),
        explain: `${DORA_TXT}<br>DHCP Release = 클라이언트가 IP를 반납(ipconfig /release).`
      };
    }
    if (kind === "msg") {
      const d = pick([DORA[0], DORA[2]]);
      const which = pick(["src", "dst"]);
      const opts = ["0.0.0.0", "255.255.255.255", "DHCP 서버의 IP 주소", "기본 게이트웨이 주소"];
      const ans = which === "src" ? 0 : 1;
      return {
        type: "choice", prompt: `처음 부팅한 클라이언트가 보내는 <b>DHCP ${d.k}</b> 메시지의 <b>${which === "src" ? "출발지" : "목적지"} IP 주소</b>는?`,
        choices: opts, answer: ans,
        explain: `클라이언트는 아직 IP가 없으므로 출발지 = <b>0.0.0.0</b>, 서버 주소를 모르므로 목적지 = <b>255.255.255.255</b>(브로드캐스트)입니다.<br>그래서 DHCP 요청은 라우터를 넘지 못하고, 다른 서브넷의 서버를 쓰려면 <b>DHCP 릴레이(ip helper-address)</b>가 필요합니다.`
      };
    }
    if (kind === "port") {
      const ask = pick(["server", "client", "proto"]);
      if (ask === "proto") return {
        type: "choice", prompt: "DHCP가 사용하는 전송 계층 프로토콜과 포트 조합으로 옳은 것은?",
        choices: ["UDP 67(서버) / 68(클라이언트)", "TCP 67(서버) / 68(클라이언트)", "UDP 53", "TCP 23"], answer: 0,
        explain: "DHCP = <b>UDP</b>, 서버 <b>67</b>, 클라이언트 <b>68</b>. UDP 53은 DNS, TCP 23은 Telnet입니다. (BOOTP와 같은 포트)"
      };
      return {
        type: "fields", prompt: `DHCP ${ask === "server" ? "서버" : "클라이언트"}가 사용하는 UDP 포트 번호는?`,
        fields: [{ label: "포트 번호", ans: ask === "server" ? "67" : "68", check: sameNum }],
        explain: "DHCP 서버 = UDP <b>67</b>, 클라이언트 = UDP <b>68</b>."
      };
    }
    if (kind === "scope") {
      const net = `192.168.${ri(1, 254)}`;
      const s = ri(10, 100), e = s + ri(50, 140);
      const xs = ri(s + 5, e - 25), xe = xs + ri(4, 15);
      const res = ri(0, 3);
      const total = e - s + 1, excl = xe - xs + 1;
      return {
        type: "fields",
        prompt: `Windows Server DHCP 범위를 다음과 같이 만들었습니다.<div class="px-given">주소 범위: ${net}.${s} ~ ${net}.${e}<br>제외 범위: ${net}.${xs} ~ ${net}.${xe}${res ? `<br>예약: ${res}개 (범위 안, 제외 범위 밖)` : ""}</div>
          ${res ? "예약 장비를 뺀 일반 클라이언트에게 자동으로 나눠 줄 수 있는 주소는 몇 개일까요?" : "클라이언트에게 자동으로 나눠 줄 수 있는 주소는 몇 개일까요?"}`,
        fields: [{ label: "주소 개수", ans: String(total - excl - res), check: sameNum }],
        explain: `범위 주소 수 = ${e} − ${s} + 1 = ${total}<br>제외 주소 수 = ${xe} − ${xs} + 1 = ${excl}${res ? `<br>예약 ${res}개는 특정 MAC 전용` : ""}<br>→ ${total} − ${excl}${res ? ` − ${res}` : ""} = <b>${total - excl - res}</b>개<br><span class="muted">양 끝을 모두 포함하므로 +1을 잊지 마세요.</span>`
      };
    }
    if (kind === "lease") {
      const days = pick([2, 4, 8, 16]);
      const ask = pick(["t1", "t2"]);
      const hours = days * 24, v = ask === "t1" ? hours * 0.5 : hours * 0.875;
      return {
        type: "fields",
        prompt: `DHCP 임대 기간이 <b>${days}일(${hours}시간)</b>입니다. 클라이언트가 ${ask === "t1" ? "처음으로 임대 갱신(Renewing, T1)을 시도하는" : "아무 서버에나 재바인딩(Rebinding, T2)을 시도하는"} 시점은 임대 시작 후 몇 시간일까요?`,
        fields: [{ label: "시간", ans: String(v), check: (a, b) => sameNum(a.replace(/시간|h/gi, ""), b) }],
        explain: `T1(갱신) = 임대 기간의 <b>50%</b> → ${hours * 0.5}시간 (원래 서버에 유니캐스트로 Request)<br>T2(재바인딩) = <b>87.5%</b> → ${hours * 0.875}시간 (브로드캐스트로 아무 서버에나 Request)<br>임대 만료 시 IP를 반납하고 Discover부터 다시 시작합니다.`
      };
    }
    // trouble
    const t = pick([
      { q: "Windows PC에서 ipconfig를 실행하니 IPv4 주소가 <b>169.254.23.7</b>로 나옵니다. 원인으로 가장 알맞은 것은?",
        c: ["DHCP 서버로부터 주소를 받지 못해 APIPA 주소가 붙었다", "DHCP 서버가 정상적으로 공인 IP를 할당했다", "DNS 서버 주소가 잘못 설정되었다", "루프백 주소가 할당되었다"], a: 0,
        e: "169.254.x.x = <b>APIPA</b>. DHCP 서버를 찾지 못하면 Windows가 스스로 붙이는 주소입니다. 케이블·DHCP 서버·릴레이 설정을 점검하고 ipconfig /renew로 다시 받습니다." },
      { q: "DHCP 서버는 192.168.10.0/24에 있고 클라이언트는 라우터 건너편 192.168.20.0/24에 있습니다. 클라이언트가 주소를 받지 못할 때 라우터에 필요한 설정은?",
        c: ["DHCP 릴레이 에이전트(ip helper-address)", "정적 NAT", "스패닝 트리 프로토콜", "포트 미러링"], a: 0,
        e: "DHCP Discover는 브로드캐스트라 라우터를 넘지 못합니다. 라우터 인터페이스에 <code>ip helper-address 서버IP</code>를 설정하면 유니캐스트로 서버에 전달해 줍니다(<b>DHCP 릴레이</b>)." },
      { q: "사무실 프린터가 DHCP를 쓰면서도 항상 같은 IP를 받게 하려면 DHCP 서버에서 무엇을 설정해야 할까요?",
        c: ["예약(Reservation) — 프린터 MAC 주소에 IP 고정", "제외 범위(Exclusion)", "임대 기간을 무제한으로 변경", "범위(Scope) 비활성화"], a: 0,
        e: "<b>예약</b> = MAC 주소 ↔ IP를 묶어 항상 같은 주소를 줍니다. 제외 범위는 아예 나눠 주지 않는 주소(수동 고정 IP 장비용)입니다." },
      { q: "PC가 받은 IP를 반납하고 DHCP 서버에서 새로 받으려고 합니다. Windows 명령어 순서로 옳은 것은?",
        c: ["ipconfig /release → ipconfig /renew", "ipconfig /renew → ipconfig /release", "ipconfig /flushdns → ipconfig /all", "netstat -r → route print"], a: 0,
        e: "<b>/release</b> = 반납(DHCP Release), <b>/renew</b> = 다시 받기(DORA). /flushdns는 DNS 캐시 삭제, /all은 자세한 정보 보기입니다." },
      { q: "DHCP 서버가 클라이언트에게 IP 주소와 함께 기본적으로 알려 줄 수 있는 정보가 <b>아닌</b> 것은?",
        c: ["클라이언트의 MAC 주소", "서브넷 마스크", "기본 게이트웨이", "DNS 서버 주소"], a: 0,
        e: "DHCP 옵션으로 서브넷 마스크·기본 게이트웨이(라우터)·DNS 서버·도메인 이름·임대 시간을 줍니다. MAC 주소는 NIC 고유값이라 서버가 주는 정보가 아닙니다." },
      { q: "DHCP 서버 두 대가 같은 범위를 나눠 맡아, 한 대가 멈춰도 주소 할당이 계속되게 하는 Windows Server 기능은?",
        c: ["DHCP 장애 조치(Failover)", "DHCP 릴레이", "APIPA", "DNS 동적 업데이트"], a: 0,
        e: "<b>DHCP 장애 조치</b>: 부하 분산 모드 또는 핫 스탠바이 모드. MCLT = 연결이 끊겼을 때 상대 임대를 임시 연장할 수 있는 최대 시간." }
    ]);
    const order = shuffle(t.c.map((c, i) => i));
    return { type: "choice", prompt: t.q, choices: order.map(i => t.c[i]), answer: order.indexOf(t.a), explain: t.e };
  }

  const GEN = { subnet: genSubnet, mask: genMask, route: genRoute, dhcp: genDhcp };

  // ---------- 화면 ----------
  let mode = "subnet", cur = null, done = false, picked = [];
  function loadScore() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function saveScore(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 무시 */ } }
  const session = {};

  function record(ok) {
    const s = loadScore(); s[mode] = s[mode] || { ok: 0, total: 0 };
    s[mode].total++; if (ok) s[mode].ok++; saveScore(s);
    session[mode] = session[mode] || { ok: 0, total: 0, streak: 0 };
    session[mode].total++; if (ok) { session[mode].ok++; session[mode].streak++; } else session[mode].streak = 0;
  }

  function render(app) {
    const s = loadScore(), m = MODES.find(x => x.id === mode), ss = session[mode];
    app.innerHTML = `
      <section class="card">
        <h1>계산 연습</h1>
        <p class="muted">네트워크관리사 계산·개념 문제를 무작위로 계속 만들어 줍니다. 숫자를 바꿔 가며 손에 익히세요.</p>
        <div class="seg cat-seg" id="pxMode">
          ${MODES.map(x => `<button data-m="${x.id}" class="${x.id === mode ? "on" : ""}">${x.name}<small>${s[x.id] ? `${s[x.id].ok}/${s[x.id].total}` : "새로 시작"}</small></button>`).join("")}
        </div>
        <div class="muted" style="font-size:13px">${esc(m.desc)}${ss ? ` · 이번 세션 ${ss.ok}/${ss.total}${ss.streak >= 3 ? ` · 🔥 ${ss.streak}연속 정답` : ""}` : ""}</div>
      </section>
      <section class="card" id="pxCard"></section>`;
    app.querySelectorAll("#pxMode button").forEach(b => b.onclick = () => { mode = b.dataset.m; cur = null; render(app); });
    if (!cur) newProblem();
    drawProblem(app);
  }

  function newProblem() { cur = GEN[mode](); done = false; picked = []; }

  function drawProblem(app) {
    const card = app.querySelector("#pxCard");
    const p = cur;
    let body = "";
    if (p.type === "fields") {
      body = `<div class="px-fields">${p.fields.map((f, i) => `
        <div class="field"><label for="pxf${i}">${esc(f.label)}</label>
          <input type="text" id="pxf${i}" inputmode="decimal" autocomplete="off" ${done ? "disabled" : ""}>
          <div class="px-ans" id="pxa${i}"></div></div>`).join("")}</div>
        ${done ? "" : `<div class="row"><button class="btn primary" id="pxCheck">채점하기 (Enter)</button><button class="btn" id="pxGive">모르겠어요 · 풀이 보기</button></div>`}`;
    } else if (p.type === "choice") {
      body = `<div class="choices">${p.choices.map((c, k) => `<button class="choice" data-k="${k}"><span class="num">${"①②③④⑤⑥"[k]}</span><span>${esc(c)}</span></button>`).join("")}</div>`;
    } else if (p.type === "order") {
      p.shuffled = p.shuffled || shuffle(p.items);
      body = `<div class="px-order" id="pxPicked">${picked.map((x, i) => `<span class="tag">${i + 1}. ${esc(x)}</span>`).join("") || `<span class="muted">아래에서 순서대로 누르세요</span>`}</div>
        <div class="choices">${p.shuffled.map(x => `<button class="choice" data-v="${esc(x)}" ${picked.includes(x) ? "disabled" : ""}><span>${esc(x)}</span></button>`).join("")}</div>
        <div class="row" style="margin-top:10px"><button class="btn" id="pxUndo">하나 지우기</button></div>`;
    }
    card.innerHTML = `
      <div class="qhead"><span>${esc(MODES.find(x => x.id === mode).name)}</span><span>문제마다 숫자가 바뀝니다</span></div>
      <div class="qtext px-q">${p.prompt}</div>
      ${body}
      <div id="pxFb"></div>`;

    if (p.type === "fields") {
      const inputs = p.fields.map((f, i) => card.querySelector("#pxf" + i));
      if (!done) inputs[0].focus();
      inputs.forEach((inp, i) => inp.onkeydown = e => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (i < inputs.length - 1 && !inp.value.trim()) return;
        if (i < inputs.length - 1 && inputs.slice(i + 1).some(x => !x.value.trim())) inputs.find((x, j) => j > i && !x.value.trim()).focus();
        else gradeFields(card, false);
      });
      card.querySelector("#pxCheck").onclick = () => gradeFields(card, false);
      card.querySelector("#pxGive").onclick = () => gradeFields(card, true);
    } else if (p.type === "choice") {
      card.querySelectorAll(".choice").forEach(b => b.onclick = () => gradeChoice(card, +b.dataset.k));
    } else if (p.type === "order") {
      card.querySelectorAll(".choice").forEach(b => b.onclick = () => {
        picked.push(b.dataset.v);
        if (picked.length === p.items.length) gradeOrder(card); else drawProblem(app);
      });
      card.querySelector("#pxUndo").onclick = () => { picked.pop(); drawProblem(app); };
    }
  }

  function feedback(card, ok, extra) {
    card.querySelector("#pxFb").innerHTML = `
      <div class="feedback ${ok ? "good" : "bad"}">
        <div class="title">${ok ? "⭕ 정답!" : "❌ 다시 확인해 보세요"}</div>
        ${extra || ""}
        <div class="why px-why">${cur.explain}</div>
      </div>
      <button class="btn primary block" id="pxNext" style="margin-top:12px">다음 문제 → (Enter)</button>`;
    const nx = card.querySelector("#pxNext");
    nx.onclick = () => { newProblem(); render(document.getElementById("app")); window.scrollTo(0, 0); };
    nx.focus();
  }

  function gradeFields(card, giveUp) {
    if (done) return;
    const p = cur;
    const vals = p.fields.map((f, i) => card.querySelector("#pxf" + i).value);
    if (!giveUp && vals.every(v => !v.trim())) { card.querySelector("#pxf0").focus(); return; }
    done = true;
    let all = true;
    p.fields.forEach((f, i) => {
      const ok = !giveUp && f.check(vals[i], f.ans);
      if (!ok) all = false;
      const inp = card.querySelector("#pxf" + i);
      inp.disabled = true; inp.classList.add(ok ? "ok" : "ng");
      card.querySelector("#pxa" + i).innerHTML = ok ? `<span class="good-t">⭕</span>` : `정답: <b>${esc(f.ans)}</b>`;
    });
    card.querySelector(".row").remove();
    record(all);
    feedback(card, all);
  }

  function gradeChoice(card, k) {
    if (done) return;
    done = true;
    const ok = k === cur.answer;
    card.querySelectorAll(".choice").forEach(b => {
      b.disabled = true;
      if (+b.dataset.k === cur.answer) b.classList.add("correct");
      else if (+b.dataset.k === k) b.classList.add("wrong");
    });
    record(ok);
    feedback(card, ok);
  }

  function gradeOrder(card) {
    done = true;
    const ok = picked.every((x, i) => x === cur.items[i]);
    record(ok);
    card.querySelector("#pxPicked").innerHTML = picked.map((x, i) => `<span class="tag ${x === cur.items[i] ? "" : "bad"}">${i + 1}. ${esc(x)}</span>`).join("");
    card.querySelectorAll(".choice, #pxUndo").forEach(b => b.disabled = true);
    feedback(card, ok, ok ? "" : `<div>정답 순서: <b>${cur.items.join(" → ")}</b></div>`);
  }

  document.addEventListener("keydown", e => {
    if (!document.getElementById("pxCard") || e.key !== "Enter" || !done) return;
    const nx = document.getElementById("pxNext");
    if (nx && document.activeElement !== nx) { e.preventDefault(); nx.click(); }
  });
  document.addEventListener("keydown", e => {
    const card = document.getElementById("pxCard");
    if (!card || done || !cur || cur.type !== "choice" || e.target.tagName === "INPUT") return;
    if (/^[1-6]$/.test(e.key) && +e.key <= cur.choices.length) gradeChoice(card, +e.key - 1);
  });

  window.renderPractice = function (app) { render(app); };
  // 테스트용
  window.__practice = { GEN, ip2n, n2ip, maskS, wildS, ospfCost };
})();
