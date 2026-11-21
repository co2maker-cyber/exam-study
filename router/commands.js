/* 라우터 콘솔 연습장 — 명령 처리, show 출력, 부팅·ROMMON */
(function () {
  "use strict";
  const S = window.RouterSim, R = S.Router.prototype, U = S.util, W = S.W;
  const { ip2n, n2ip, isIp, maskLen, lenMask, netOf, inNet, classfulNet, v6short, v6expand, parseV6Pfx, shortIf, isLoop, normIface, clone } = U;
  // EXEC 모드의 exit(=logout)는 목록에 없지만 실제 IOS처럼 동작하게 숨은 명령으로 추가
  S.GRAMMAR.user.push({ pat: "exit", toks: ["exit"], hidden: true });
  S.GRAMMAR.privx = S.GRAMMAR.priv.concat(S.GRAMMAR.user);
  const pad = (s, n) => String(s).padEnd(n);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ───────────── 입력 처리 진입점 ─────────────
  R.input = async function (line, io) {
    if (this.state === "boot") return;
    if (this.state === "rommon") return this.romCmd(line.trim(), io);
    if (this.state === "pressReturn") return this.startSession(io);
    if (this.state !== "exec") return;
    const t = line.trim();
    if (t) { this.rt.history.push(t); if (this.rt.history.length > 50) this.rt.history.shift(); }
    if (!t || t.startsWith("!")) return;
    await this.exec(this.mode, t, io, false);
    this.after(io);
  };
  R.after = function () {
    this.dhcpServe();
    this._pcCache = this.pcChecks();   // PC들이 주고받는 트래픽(NAT 변환, ACL 일치 횟수)이 생긴다
    this.diffLogs();
    this.emit("change");
  };
  R.startSession = async function (io) {
    const c = this.cfg;
    if (c.banners.motd) io.out(c.banners.motd);
    const con = c.lines.con;
    if (con.loginLocal || (con.login && con.password)) {
      this.state = "login";
      io.out("\nUser Access Verification\n");
      for (let tries = 0; tries < 3; tries++) {
        let user = null;
        if (con.loginLocal) user = await io.ask("Username: ");
        const pw = await io.ask("Password: ", { secret: true });
        const ok = con.loginLocal ? (c.users[user] && c.users[user].pw === pw) : pw === con.password;
        if (ok) { this.ev("conlogin"); this.enterExec(io); return; }
        io.out(con.loginLocal ? "% Login invalid\n" : "");
      }
      io.out("% Bad passwords\n");
      this.state = "pressReturn"; io.out("\n" + this.cfg.hostname + " con0 is now available\n\nPress RETURN to get started.\n");
      return;
    }
    if (con.login && !con.password) { io.out("\nPassword required, but none set\n"); }
    this.enterExec(io);
  };
  R.enterExec = function (io) {
    if (this.cfg.banners.exec) io.out(this.cfg.banners.exec);
    this.state = "exec"; this.mode = "user"; this.ctx = {};
    this.emit("change");
  };
  R.logout = function (io) {
    this.ev("logout");
    this.mode = "user"; this.ctx = {}; this.state = "pressReturn";
    io.out(`\n${this.cfg.hostname} con0 is now available\n\n\n\n\n\nPress RETURN to get started.\n`);
  };

  // ───────────── 명령 실행 ─────────────
  R.exec = async function (mode, line, io, fromDo) {
    const gmode = mode === "priv" ? "privx" : mode;
    let p = S.parse(gmode, line);
    let runMode = mode;
    if (p.error && S.GRAMMAR[mode] && ["if", "rip", "ospf", "eigrp", "line", "dhcp", "nacl"].includes(mode)) {
      const g = S.parse("config", line);
      if (!g.error) { p = g; runMode = "config"; this.mode = "config"; this.ctx = {}; }
    }
    if (p.error) return this.parseError(p, mode, line, io);
    const fn = (H[runMode] || {})[p.pat] || (runMode === "priv" ? H.user[p.pat] : null) || (p.implicit ? H.common[p.pat] : null);
    if (!fn) { io.out("% 이 연습장에서는 아직 지원하지 않는 명령입니다.\n"); return; }
    await fn.call(this, p.args, io, line);
  };
  R.parseError = async function (p, mode, line, io) {
    if (p.error === "ambiguous") { io.out(`% Ambiguous command:  "${line}"\n`); return; }
    if (p.error === "incomplete") { io.out("% Incomplete command.\n"); return; }
    const toks = line.trim().split(/\s+/);
    if ((mode === "user" || mode === "priv") && toks.length === 1) {
      const name = toks[0];
      if (this.cfg.hosts[name.toUpperCase()] || this.cfg.hosts[name]) { const ip = this.cfg.hosts[name.toUpperCase()] || this.cfg.hosts[name]; io.out(`Trying ${name} (${ip})... \n% Connection refused by remote host\n`); return; }
      if (this.cfg.domainLookup) {
        io.out(`Translating "${name}"...domain server (255.255.255.255)\n`);
        this.ev("domainstall");
        for (let i = 0; i < 30; i++) { await sleep(100); if (io.aborted()) break; }
        io.out("% Unknown command or computer name, or unable to find computer address\n");
      } else {
        io.out("Translating \"" + name + "\"\n% Unknown command or computer name, or unable to find computer address\n");
      }
      return;
    }
    const caret = this.prompt().length + p.pos;
    io.out(" ".repeat(caret) + "^\n% Invalid input detected at '^' marker.\n");
  };

  const ifCtx = function () { return (this.ctx.range || [this.ctx.iface]).map(n => this.iface(n)).filter(Boolean); };
  const needIfs = function (fn) { return function (a, io, l) { for (const i of ifCtx.call(this)) fn.call(this, i, a, io, l); }; };

  // ───────────── 핸들러 ─────────────
  const H = { common: {}, user: {}, priv: {}, config: {}, if: {}, rip: {}, ospf: {}, eigrp: {}, line: {}, dhcp: {}, nacl: {} };
  H.common["exit"] = function () {
    if (this.mode === "config") { this.mode = "priv"; this.configExit(); }
    else this.mode = "config";
    this.ctx = {};
  };
  H.common["end"] = function () { this.mode = "priv"; this.ctx = {}; this.configExit(); };
  H.common["do <텍스트>"] = async function (a, io) { await this.exec("priv", a[0], io, true); };
  H.config["exit"] = H.common["exit"]; H.config["end"] = H.common["end"]; H.config["do <텍스트>"] = H.common["do <텍스트>"];
  R.configExit = function () { setTimeout(() => this.log("%SYS-5-CONFIG_I: Configured from console by console"), 300); };

  // ── 사용자 EXEC ──
  H.user["enable"] = async function (a, io) {
    if (this.mode === "priv") return;
    const c = this.cfg;
    const want = c.enableSecret ? c.enableSecret.pw : c.enablePassword;
    if (!want) { this.mode = "priv"; this.ev("enable"); return; }
    for (let i = 0; i < 3; i++) {
      const pw = await io.ask("Password: ", { secret: true });
      if (pw === want) { this.mode = "priv"; this.ev("enable"); return; }
    }
    io.out("% Bad secrets\n\n");
  };
  H.user["logout"] = function (a, io) { this.logout(io); };
  H.user["exit"] = function (a, io) { this.logout(io); };
  H.priv["disable"] = function () { this.mode = "user"; };
  H.user["terminal length <숫자>"] = function (a) { this.rt.termLen = +a[0]; if (+a[0] === 0) this.ev("termlen0"); };
  H.user["terminal no length"] = function () { this.rt.termLen = 24; };
  H.user["terminal monitor"] = function () { this.rt.monitor = true; };
  H.user["terminal no monitor"] = function () { this.rt.monitor = false; };
  H.user["terminal history size <숫자>"] = function (a) { this.rt.histSize = +a[0]; };

  // ping
  R.resolveName = function (name) {
    if (isIp(name)) return name;
    const h = this.cfg.hosts[name.toUpperCase()] || this.cfg.hosts[name];
    if (h) return h;
    if (/^dns\.google\.?$/i.test(name) && this.cfg.domainLookup && this.cfg.nameServers.length) {
      const ns = this.cfg.nameServers.find(n => this.r1Reach(n).ok);
      if (ns) return "8.8.8.8";
    }
    return null;
  };
  R.doPing = async function (dst, io, opts = {}) {
    const count = opts.count || 5, size = opts.size || 100;
    let srcIf = opts.src || null;
    if (srcIf && isIp(srcIf)) { const o = this.ownIps().find(x => x.ip === srcIf); srcIf = o ? o.iface : null; }
    io.out("Type escape sequence to abort.\n");
    io.out(`Sending ${count}, ${size}-byte ICMP Echos to ${dst}, timeout is 2 seconds:\n`);
    if (opts.src) io.out(`Packet sent with a source address of ${this.effIp(this.iface(srcIf)) ? this.effIp(this.iface(srcIf)).ip : opts.src}\n`);
    const r = this.r1Reach(dst, srcIf);
    let okN = 0, line = "";
    for (let i = 0; i < count; i++) {
      if (io.aborted()) break;
      const success = r.ok && !(i === 0 && r.arpFirst);
      await sleep(success ? 90 : 450);
      const ch = success ? "!" : ".";
      io.raw(ch); line += ch; if (success) okN++;
      if (this.rt.debug.has("icmp") && success) this.debugLater(`ICMP: echo reply rcvd, src ${dst}, dst ${this.effIp(this.iface(r.iface || "")) ? "" : ""}`);
    }
    const sent = line.length;
    io.out(`\nSuccess rate is ${sent ? Math.round(okN * 100 / sent) : 0} percent (${okN}/${sent})${okN ? ", round-trip min/avg/max = 1/" + (2 + (dst.length % 3)) + "/4 ms" : ""}\n`);
    const key = opts.name || dst;
    this.ev(`ping:${key}:${okN ? "ok" : "fail"}`);
    if (okN && srcIf) this.ev(`pingsrc:${dst}:${srcIf}:ok`);
    return okN > 0;
  };
  H.user["ping A.B.C.D"] = async function (a, io) { await this.doPing(a[0], io); };
  H.user["ping A.B.C.D <텍스트>"] = async function (a, io) {
    const w = a[1].split(/\s+/), o = {};
    for (let i = 0; i < w.length; i++) {
      const k = w[i].toLowerCase();
      if ("source".startsWith(k) && k.length >= 2) { const rest = w.slice(i + 1).join(""); const n = normIface(rest) || normIface(w[i + 1]) || (isIp(w[i + 1]) ? w[i + 1] : null); if (!n) { io.out("% Invalid source interface - Interface not found\n"); return; } o.src = n; break; }
      if ("repeat".startsWith(k) && k.length >= 2) { o.count = +w[++i] || 5; continue; }
      if ("size".startsWith(k) && k.length >= 2) { o.size = +w[++i] || 100; continue; }
    }
    await this.doPing(a[0], io, o);
  };
  H.user["ping ipv6 <이름>"] = async function (a, io) {
    if (!v6expand(a[0])) { io.out("% Unrecognized host or address, or protocol not running.\n"); return; }
    const d = v6short(a[0]);
    io.out(`Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${d}, timeout is 2 seconds:\n`);
    const r = this.r1Reach6(d); let n = 0;
    for (let i = 0; i < 5; i++) { if (io.aborted()) break; await sleep(r.ok ? 90 : 450); io.raw(r.ok ? "!" : "."); if (r.ok) n++; }
    io.out(`\nSuccess rate is ${n * 20} percent (${n}/5)${n ? ", round-trip min/avg/max = 1/3/6 ms" : ""}\n`);
    this.ev(`ping6:${d}:${n ? "ok" : "fail"}`);
  };
  H.user["ping <이름>"] = async function (a, io) {
    if (v6expand(a[0]) && a[0].includes(":")) return H.user["ping ipv6 <이름>"].call(this, a, io);
    if (this.cfg.domainLookup && !this.cfg.hosts[a[0].toUpperCase()] && !this.cfg.hosts[a[0]]) {
      io.out(`Translating "${a[0]}"...domain server (${this.cfg.nameServers[0] || "255.255.255.255"})`);
      await sleep(this.cfg.nameServers.length ? 400 : 1500);
      io.out(this.cfg.nameServers.length && this.resolveName(a[0]) ? " [OK]\n" : "\n");
    }
    const ip = this.resolveName(a[0]);
    if (!ip) { io.out("% Unrecognized host or address, or protocol not running.\n"); return; }
    await this.doPing(ip, io, { name: a[0].toUpperCase() });
  };
  H.user["traceroute A.B.C.D"] = async function (a, io) { await this.doTrace(a[0], io); };
  H.user["traceroute <이름>"] = async function (a, io) { const ip = this.resolveName(a[0]); if (!ip) { io.out("% Unrecognized host or address, or protocol not running.\n"); return; } await this.doTrace(ip, io); };
  R.doTrace = async function (dst, io) {
    io.out(`Type escape sequence to abort.\nTracing the route to ${dst}\nVRF info: (vrf in name/id, vrf out name/id)\n`);
    const r = this.lookup(dst), ok = this.r1Reach(dst).ok;
    const hops = [];
    if (r && r.iface === "Serial0/0/0") hops.push(W.r2s, ...(dst !== W.r2s && dst !== W.r2lo && dst !== W.r2g ? [dst] : []));
    else if (r && r.iface === "GigabitEthernet0/1") hops.push(W.isp, ...(dst !== W.isp ? ["198.18.0.1", dst] : []));
    else if (r) hops.push(dst);
    for (let h = 0; h < Math.max(hops.length, 3); h++) {
      if (io.aborted()) break;
      await sleep(250);
      if (h < hops.length && (ok || h === 0) && r) io.out(`  ${h + 1} ${hops[h]} ${4 + h * 3} msec ${3 + h * 3} msec ${5 + h * 3} msec\n`);
      else { io.out(`  ${h + 1}  *  *  * \n`); if (h >= 2) break; }
    }
    this.ev(`trace:${dst}`);
  };
  H.user["telnet <이름>"] = async function (a, io) { const ip = this.resolveName(a[0]) || a[0]; io.out(`Trying ${ip} ... `); await sleep(800); io.out(this.r1Reach(ip).ok ? "\n% Connection refused by remote host\n" : "\n% Connection timed out; remote host not responding\n"); };
  H.user["ssh <텍스트>"] = async function (a, io) { const m = a[0].match(/(\d+\.\d+\.\d+\.\d+)/); io.out("Trying " + (m ? m[1] : a[0]) + " ...\n"); await sleep(800); io.out("% Connection refused by remote host\n"); };

  // ── 특권 EXEC: show ──
  const showP = (fn, ev) => async function (a, io, l) { this.ev("show:" + (ev || "")); const t = fn.call(this, a); await this.pageOut(t, io, l); };
  R.pageOut = async function (text, io, line) {
    const pipe = (line || "").match(/\|\s*(\S+)\s*(.*)$/);
    let lines = text.replace(/\n$/, "").split("\n");
    if (pipe) {
      const kw = pipe[1].toLowerCase(), arg = pipe[2].trim();
      let re; try { re = new RegExp(arg, "i"); } catch (e) { re = new RegExp(arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
      if ("include".startsWith(kw)) lines = lines.filter(x => re.test(x));
      else if ("exclude".startsWith(kw)) lines = lines.filter(x => !re.test(x));
      else if ("begin".startsWith(kw)) { const i = lines.findIndex(x => re.test(x)); lines = i < 0 ? [] : lines.slice(i); }
      else if ("section".startsWith(kw)) { const out = []; let on = false; for (const x of lines) { if (!/^\s/.test(x)) on = re.test(x); if (on) out.push(x); } lines = out; }
      else if ("count".startsWith(kw)) lines = [`Number of lines which match regexp = ${lines.filter(x => re.test(x)).length}`];
      this.ev("pipe"); if (/running|run/.test(line)) this.ev("pipe:run");
    }
    await io.page(lines);
  };
  // 파이프 문법을 위해 show 계열은 '|' 뒤를 잘라 파싱
  const origExec = R.exec;
  R.exec = async function (mode, line, io, fromDo) {
    const m = line.match(/^(.*?)\s+\|\s*(.*)$/);
    if (m && /^\s*(sh|show|wr|write|do)/i.test(m[1])) {
      const base = m[1];
      const saved = io.page;
      const self = this;
      const pipeIo = Object.assign({}, io, { page: async (lines) => { await self.pageOut(lines.join("\n"), Object.assign({}, io, { page: saved }), base + " | " + m[2]); } });
      return origExec.call(this, mode, base, pipeIo, fromDo);
    }
    return origExec.call(this, mode, line, io, fromDo);
  };

  H.priv["show version"] = showP(function () {
    const up = Math.floor((Date.now() - this.clockStart) / 1000);
    const next = this.cfg.configReg !== this.bootReg ? ` (will be ${this.cfg.configReg} at next reload)` : "";
    return `Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.4(3)M2, RELEASE SOFTWARE (fc2)
Technical Support: http://www.cisco.com/techsupport
Copyright (c) 1986-2015 by Cisco Systems, Inc.
Compiled Fri 06-Feb-15 17:01 by prod_rel_team

ROM: System Bootstrap, Version 15.0(1r)M15, RELEASE SOFTWARE (fc1)

${this.cfg.hostname} uptime is ${Math.floor(up / 60)} minutes, ${up % 60} seconds
System returned to ROM by power-on
System image file is "flash0:c2900-universalk9-mz.SPA.154-3.M2.bin"

Cisco CISCO2911/K9 (revision 1.0) with 491520K/32768K bytes of memory.
Processor board ID FTX1840ABCD
3 Gigabit Ethernet interfaces
2 Serial(sync/async) interfaces
1 terminal line
DRAM configuration is 64 bits wide with parity disabled.
255K bytes of non-volatile configuration memory.
250880K bytes of ATA System CompactFlash 0 (Read/Write)

Configuration register is ${this.bootReg}${next}
`;
  }, "version");
  H.priv["show clock"] = showP(function () { return this.clockStr() + "\n"; }, "clock");
  H.priv["show history"] = showP(function () { return this.rt.history.slice(-this.rt.histSize).map(x => "  " + x).join("\n") + "\n"; }, "history");
  H.priv["show users"] = showP(function () { return "    Line       User       Host(s)              Idle       Location\n*  0 con 0                idle                 00:00:00\n\n  Interface    User               Mode         Idle     Peer Address\n"; }, "users");
  H.priv["show terminal"] = showP(function () { return `Line 0, Location: "", Type: ""\nLength: ${this.rt.termLen} lines, Width: 80 columns\nHistory is enabled, history size is ${this.rt.histSize}.\n`; }, "terminal");
  H.priv["show privilege"] = showP(function () { return `Current privilege level is ${this.mode === "user" ? 1 : 15}\n`; }, "privilege");
  H.priv["show ip interface brief"] = showP(function () {
    let t = "Interface                  IP-Address      OK? Method Status                Protocol\n";
    for (const n of this.ifaceNames()) {
      const i = this.iface(n), e = this.effIp(i), [st, pr] = this.statusText(i);
      const ip = i.dhcp ? (e ? e.ip : "unassigned") : (i.ip || "unassigned");
      t += `${pad(n, 27)}${pad(ip, 16)}YES ${pad(i.dhcp ? "DHCP" : i.ip ? "manual" : "unset", 7)}${pad(st, 22)}${pr}\n`;
    }
    return t;
  }, "ip interface brief");
  R.ifDetail = function (n) {
    const i = this.iface(n), e = this.effIp(i), [st, pr] = this.statusText(i);
    const ser = n.startsWith("Serial"), lo = isLoop(n);
    const bw = i.bandwidth || (ser ? 1544 : lo ? 8000000 : 1000000);
    let t = `${n} is ${st}, line protocol is ${pr}\n`;
    t += lo ? "  Hardware is Loopback\n" : ser ? "  Hardware is WIC MBRD Serial\n" : `  Hardware is CN Gigabit Ethernet, address is ${U.MAC[n.split(".")[0]] || "0060.3e8a.4b0f"} (bia ${U.MAC[n.split(".")[0]] || "0060.3e8a.4b0f"})\n`;
    if (i.desc) t += `  Description: ${i.desc}\n`;
    if (e) t += `  Internet address is ${e.ip}/${maskLen(e.mask)}\n`;
    t += `  MTU ${i.mtu || 1500} bytes, BW ${bw} Kbit/sec, DLY ${ser ? 20000 : lo ? 5000 : 10} usec,\n     reliability 255/255, txload 1/255, rxload 1/255\n`;
    t += `  Encapsulation ${ser ? i.encap.toUpperCase() : lo ? "LOOPBACK" : i.dot1q ? "802.1Q Virtual LAN, Vlan ID  " + i.dot1q : "ARPA"}, ${lo ? "loopback not set" : "loopback not set"}\n`;
    if (ser) t += `  Keepalive set (10 sec)\n${i.encap === "ppp" ? "  LCP " + (this.l1(i) ? "REQsent" : "Closed") + "\n" : ""}  Last input 00:00:0${this.l2(i) ? 2 : 9}, output 00:00:01, output hang never\n`;
    else if (!lo) t += `  Keepalive set (10 sec)\n  Full Duplex, 1Gbps, media type is RJ45\n  ARP type: ARPA, ARP Timeout 04:00:00\n`;
    t += `  Queueing strategy: fifo\n  5 minute input rate 0 bits/sec, 0 packets/sec\n  5 minute output rate 0 bits/sec, 0 packets/sec\n     ${this.l2(i) ? 120 : 0} packets input, ${this.l2(i) ? 9540 : 0} bytes, 0 no buffer\n     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored, 0 abort\n     ${this.l2(i) ? 98 : 0} packets output, ${this.l2(i) ? 8120 : 0} bytes, 0 underruns\n`;
    if (ser) t += `     DCD=${this.l1(i) ? "up" : "down"}  DSR=${this.l1(i) ? "up" : "down"}  DTR=up  RTS=up  CTS=${this.l1(i) ? "up" : "down"}\n`;
    return t;
  };
  H.priv["show interfaces"] = showP(function () { return this.ifaceNames().map(n => this.ifDetail(n)).join(""); }, "interfaces");
  H.priv["show interfaces <인터페이스>"] = showP(function (a) { if (!this.iface(a[0])) return "% Invalid input detected\n"; this.ev("show:interfaces " + a[0]); return this.ifDetail(a[0]); }, "interfaces x");
  H.priv["show interfaces description"] = showP(function () {
    let t = "Interface                      Status         Protocol Description\n";
    for (const n of this.ifaceNames()) { const i = this.iface(n), [st, pr] = this.statusText(i); t += `${pad(shortIf(n), 31)}${pad(st === "administratively down" ? "admin down" : st, 15)}${pad(pr, 9)}${i.desc}\n`; }
    return t;
  }, "interfaces description");
  R.ipIfDetail = function (n) {
    const i = this.iface(n), e = this.effIp(i), [st, pr] = this.statusText(i);
    let t = `${n} is ${st}, line protocol is ${pr}\n`;
    if (!e) return t + "  Internet protocol processing disabled\n";
    t += `  Internet address is ${e.ip}/${maskLen(e.mask)}\n  Broadcast address is 255.255.255.255\n  Address determined by ${i.dhcp ? "DHCP" : "setup command"}\n  MTU is ${i.ipmtu || i.mtu || 1500} bytes\n`;
    t += `  Helper address is ${i.helpers.length ? i.helpers.join(", ") : "not set"}\n`;
    t += `  Outgoing access list is ${i.accOut || "not set"}\n  Inbound  access list is ${i.accIn || "not set"}\n  Proxy ARP is ${i.proxyArp ? "enabled" : "disabled"}\n`;
    t += `  Network address translation is ${i.natIn ? "enabled, interface in domain inside" : i.natOut ? "enabled, interface in domain outside" : "disabled"}\n`;
    return t;
  };
  H.priv["show ip interface"] = showP(function () { return this.ifaceNames().map(n => this.ipIfDetail(n)).join(""); }, "ip interface");
  H.priv["show ip interface <인터페이스>"] = showP(function (a) { return this.iface(a[0]) ? this.ipIfDetail(a[0]) : "% Invalid interface\n"; }, "ip interface x");

  // 라우팅 테이블
  R.routeText = function (filter) {
    const rib = this.rib();
    const def = rib.find(r => r.net === "0.0.0.0" && r.mask === "0.0.0.0");
    let t = `Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP
       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area
       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2
       E1 - OSPF external type 1, E2 - OSPF external type 2
       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2
       ia - IS-IS inter area, * - candidate default, U - per-user static route
       o - ODR, P - periodic downloaded static route, H - NHRP, l - LISP
       + - replicated route, % - next hop override

`;
    t += def ? `Gateway of last resort is ${def.nh || "0.0.0.0"} to network 0.0.0.0\n\n` : "Gateway of last resort is not set\n\n";
    const sel = rib.filter(r => !filter || filter(r));
    const line = r => {
      const code = pad(r.code, 6);
      const pfx = `${r.net}/${maskLen(r.mask)}`;
      if (r.code === "C" || r.code === "L") return `${code}${pfx} is directly connected, ${r.iface}`;
      if (r.iface && !r.nh) return `${code}${pfx} is directly connected, ${r.iface}`;
      const age = r.code === "S" || r.code === "S*" ? "" : ", 00:0" + (r.code === "R" ? "0:12" : "1:05");
      return `${code}${pfx} [${r.ad}/${r.metric}] via ${r.nh}${age}${r.code === "S" || r.code === "S*" ? "" : ", " + r.iface}`;
    };
    // 클래스 단위로 묶어 출력
    const groups = {};
    for (const r of sel) { const k = r.net === "0.0.0.0" && r.mask === "0.0.0.0" ? "default" : classfulNet(r.net); (groups[k] = groups[k] || []).push(r); }
    const keys = Object.keys(groups).sort((a, b) => (a === "default" ? -1 : b === "default" ? 1 : ip2n(a) - ip2n(b)));
    for (const k of keys) {
      const g = groups[k];
      if (k === "default") { g.forEach(r => t += line(r) + "\n"); continue; }
      const cl = U.classfulLen(k);
      const masks = new Set(g.map(r => r.mask));
      const subn = g.length > 1 || maskLen(g[0].mask) !== cl;
      if (subn) {
        t += masks.size > 1 ? `      ${k}/${cl} is variably subnetted, ${g.length} subnets, ${masks.size} masks\n` : `      ${k}/${maskLen(g[0].mask)} is subnetted, ${g.length} subnets\n`;
        g.forEach(r => { const l = line(r); t += l.slice(0, 6) + "   " + l.slice(6) + "\n"; });
      } else g.forEach(r => t += line(r) + "\n");
    }
    return t;
  };
  H.priv["show ip route"] = showP(function () { if (this.rib().some(r => r.code === "S")) this.ev("showroute:S"); if (this.rib().some(r => r.code === "R")) this.ev("showroute:R"); if (this.rib().some(r => r.code === "D")) this.ev("showroute:D"); return this.routeText(); }, "ip route");
  H.priv["show ip route static"] = showP(function () { return this.routeText(r => r.code.startsWith("S")); }, "ip route static");
  H.priv["show ip route connected"] = showP(function () { return this.routeText(r => r.code === "C" || r.code === "L"); }, "ip route connected");
  H.priv["show ip route rip"] = showP(function () { return this.routeText(r => r.code === "R"); }, "ip route rip");
  H.priv["show ip route ospf"] = showP(function () { return this.routeText(r => r.code === "O"); }, "ip route ospf");
  H.priv["show ip route eigrp"] = showP(function () { if (this.rib().some(r => r.code === "D")) this.ev("showroute:D"); return this.routeText(r => r.code === "D"); }, "ip route eigrp");
  H.priv["show ip route A.B.C.D"] = showP(function (a) {
    const r = this.lookup(a[0]);
    if (!r) return "% Network not in table\n";
    return `Routing entry for ${r.net}/${maskLen(r.mask)}\n  Known via "${{ C: "connected", L: "connected", S: "static", "S*": "static", R: "rip", O: "ospf 1", D: "eigrp 100" }[r.code]}", distance ${r.ad}, metric ${r.metric}\n  Routing Descriptor Blocks:\n  * ${r.nh ? r.nh + (r.code !== "S" ? ", from " + r.nh : "") : "directly connected"}, via ${r.iface}\n      Route metric is ${r.metric}, traffic share count is 1\n`;
  }, "ip route x");
  H.priv["show ip protocols"] = showP(function () {
    let t = "";
    const rip = this.cfg.rip, rs = this.ripState();
    if (rip) {
      t += `*** IP Routing is NSF aware ***\n\nRouting Protocol is "rip"\n  Outgoing update filter list for all interfaces is not set\n  Incoming update filter list for all interfaces is not set\n  Sending updates every 30 seconds, next due in 12 seconds\n  Invalid after 180 seconds, hold down 180, flushed after 240\n  Redistributing: rip\n`;
      t += `  Default version control: send version ${rip.version || 1}, receive ${rip.version ? "version " + rip.version : "any version"}\n    Interface             Send  Recv  Triggered RIP  Key-chain\n`;
      for (const n of this.ifaceNames()) if (rs.covered(n) && !rs.passive(n)) t += `    ${pad(n, 22)}${pad(rip.version || 1, 6)}${pad(rip.version ? rip.version : "1 2", 6)}\n`;
      t += `  Automatic network summarization is ${rip.autoSummary === false ? "not " : ""}in effect\n  Maximum path: 4\n  Routing for Networks:\n${rip.networks.map(n => "    " + n).join("\n")}\n`;
      const pas = this.ifaceNames().filter(n => rs.covered(n) && rs.passive(n));
      if (pas.length) t += `  Passive Interface(s):\n${pas.map(n => "    " + n).join("\n")}\n`;
      t += `  Routing Information Sources:\n    Gateway         Distance      Last Update\n${rs.recv ? "    10.0.0.2             120      00:00:08\n" : ""}  Distance: (default is 120)\n\n`;
    }
    for (const pid of Object.keys(this.cfg.ospf)) {
      const p = this.cfg.ospf[pid], os = this.ospfState();
      t += `Routing Protocol is "ospf ${pid}"\n  Outgoing update filter list for all interfaces is not set\n  Incoming update filter list for all interfaces is not set\n  Router ID ${this.ospfRid(pid) || "0.0.0.0"}\n  Number of areas in this router is 1. 1 normal 0 stub 0 nssa\n  Maximum path: 4\n  Routing for Networks:\n${p.networks.map(n => `    ${n.net} ${n.wc} area ${n.area}`).join("\n")}\n`;
      const pas = this.ospfIfaces(pid).filter(x => x.passive);
      if (pas.length) t += `  Passive Interface(s):\n${pas.map(x => "    " + x.name).join("\n")}\n`;
      t += `  Routing Information Sources:\n    Gateway         Distance      Last Update\n${os && os.nbr ? "    2.2.2.2              110      00:01:05\n" : ""}  Distance: (default is 110)\n\n`;
    }
    for (const as of Object.keys(this.cfg.eigrp)) {
      const p = this.cfg.eigrp[as], es = this.eigrpState();
      t += `Routing Protocol is "eigrp ${as}"\n  Outgoing update filter list for all interfaces is not set\n  Incoming update filter list for all interfaces is not set\n  Default networks flagged in outgoing updates\n  Default networks accepted from incoming updates\n  EIGRP-IPv4 Protocol for AS(${as})\n    Metric weight K1=1, K2=0, K3=1, K4=0, K5=0\n    Router-ID: ${p.rid || this.ospfRidLike() || "0.0.0.0"}\n  Automatic Summarization: ${p.autoSummary ? "enabled" : "disabled"}\n  Maximum path: 4\n  Routing for Networks:\n${p.networks.map(n => "    " + n.net + (n.wc ? "/" + (32 - maskLen(n2ip(~ip2n(n.wc) >>> 0)) === 0 ? 32 : maskLen(n2ip(~ip2n(n.wc) >>> 0))) : "")).join("\n")}\n  Routing Information Sources:\n    Gateway         Distance      Last Update\n${es && es.nbr ? "    10.0.0.2              90      00:01:05\n" : ""}  Distance: internal 90 external 170\n\n`;
    }
    return t || "";
  }, "ip protocols");
  R.ospfRidLike = function () { const ips = this.ownIps().filter(o => isLoop(o.iface)).map(o => o.ip); return ips[0] || (this.ownIps()[0] || {}).ip; };

  H.priv["show cdp neighbors"] = showP(function () {
    if (!this.cfg.cdp) return "% CDP is not enabled\n";
    let t = "Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge\n                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone,\n                  D - Remote, C - CVTA, M - Two-port Mac Relay\n\nDevice ID        Local Intrfce     Holdtme    Capability  Platform  Port ID\n";
    const g0 = this.iface("GigabitEthernet0/0"), s0 = this.iface("Serial0/0/0"), g1 = this.iface("GigabitEthernet0/1");
    if (this.l1(g0) && g0.cdp) t += "SW1              Gig 0/0           165              S I   WS-C2960  Fas 0/24\n";
    if (this.l2(s0) && s0.cdp) t += "R2               Ser 0/0/0         152             R S I  CISCO2911 Ser 0/1/0\n";
    if (this.l1(g1) && g1.cdp) t += "ISP              Gig 0/1           139             R S I  CISCO1941 Gig 0/0\n";
    return t;
  }, "cdp neighbors");
  H.priv["show cdp neighbors detail"] = showP(function () {
    if (!this.cfg.cdp) return "% CDP is not enabled\n";
    let t = "";
    if (this.l2(this.iface("Serial0/0/0"))) t += "-------------------------\nDevice ID: R2\nEntry address(es):\n  IP address: 10.0.0.2\nPlatform: Cisco CISCO2911/K9,  Capabilities: Router Switch IGMP\nInterface: Serial0/0/0,  Port ID (outgoing port): Serial0/1/0\nHoldtime : 152 sec\n\nVersion :\nCisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.4(3)M2\n\n";
    if (this.l1(this.iface("GigabitEthernet0/0"))) t += "-------------------------\nDevice ID: SW1\nEntry address(es):\nPlatform: cisco WS-C2960-24TT-L,  Capabilities: Switch IGMP\nInterface: GigabitEthernet0/0,  Port ID (outgoing port): FastEthernet0/24\nHoldtime : 165 sec\n\n";
    if (this.l1(this.iface("GigabitEthernet0/1"))) t += "-------------------------\nDevice ID: ISP\nEntry address(es):\n  IP address: 203.0.113.1\nPlatform: Cisco CISCO1941/K9,  Capabilities: Router Switch IGMP\nInterface: GigabitEthernet0/1,  Port ID (outgoing port): GigabitEthernet0/0\nHoldtime : 139 sec\n\n";
    return t;
  }, "cdp neighbors detail");
  H.priv["show cdp"] = showP(function () { return this.cfg.cdp ? "Global CDP information:\n\tSending CDP packets every 60 seconds\n\tSending a holdtime value of 180 seconds\n\tSending CDPv2 advertisements is  enabled\n" : "% CDP is not enabled\n"; }, "cdp");
  H.priv["show lldp neighbors"] = showP(function () { return this.cfg.lldp ? "Capability codes:\n    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device\n    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other\n\nDevice ID           Local Intf     Hold-time  Capability      Port ID\nR2                  Se0/0/0        120        R               Se0/1/0\n\nTotal entries displayed: 1\n" : "% LLDP is not enabled\n"; }, "lldp");
  R.arpText = function () {
    let t = "Protocol  Address          Age (min)  Hardware Addr   Type   Interface\n";
    for (const n of this.ifaceNames()) { const i = this.iface(n), e = this.effIp(i); if (e && this.up(i) && !n.startsWith("Serial") && !isLoop(n)) t += `Internet  ${pad(e.ip, 17)}-          ${pad(U.MAC[n.split(".")[0]] || "0060.3e8a.4b0f", 16)}ARPA   ${n}\n`; }
    for (const [ip, a] of Object.entries(this.rt.arp)) t += `Internet  ${pad(ip, 17)}${pad(Math.floor((Date.now() - a.t) / 60000), 11)}${pad(a.mac, 16)}ARPA   ${a.iface}\n`;
    return t;
  };
  H.priv["show arp"] = showP(function () { return this.arpText(); }, "arp");
  H.priv["show ip arp"] = showP(function () { return this.arpText(); }, "ip arp");
  H.priv["show running-config"] = showP(function () { this.ev("show:running-config"); return "Building configuration...\n\n" + this.buildConfig(this.cfg, true); }, "running-config");
  H.priv["show running-config interface <인터페이스>"] = showP(function (a) {
    if (!this.iface(a[0])) return "% Invalid input detected\n";
    const block = this.ifBlock(this.cfg, a[0]);
    return `Building configuration...\n\nCurrent configuration : ${block.length} bytes\n!\n${block}end\n`;
  }, "running-config interface");
  H.priv["show startup-config"] = showP(function () { if (!this.startup) return "startup-config is not present\n"; const t = this.buildConfig(this.startup, false); return `Using ${t.length} out of 262136 bytes\n` + t; }, "startup-config");

  // OSPF
  H.priv["show ip ospf"] = showP(function () {
    const pids = Object.keys(this.cfg.ospf); if (!pids.length) return "%OSPF: Router process not running\n";
    return pids.map(pid => ` Routing Process "ospf ${pid}" with ID ${this.ospfRid(pid) || "0.0.0.0"}\n Start time: 00:00:21.104, Time elapsed: 00:12:01.330\n Supports only single TOS(TOS0) routes\n Router is not originating router-LSAs with maximum metric\n Initial SPF schedule delay 5000 msecs\n Number of areas in this router is 1. 1 normal 0 stub 0 nssa\n    Area BACKBONE(0)\n        Number of interfaces in this area is ${this.ospfIfaces(pid).length}\n        Area has no authentication\n        SPF algorithm last executed 00:01:04.112 ago\n`).join("\n");
  }, "ip ospf");
  H.priv["show ip ospf neighbor"] = showP(function () {
    const os = this.ospfState();
    if (os && os.nbr) this.ev("ospfnbr:full");
    let t = "\nNeighbor ID     Pri   State           Dead Time   Address         Interface\n";
    if (os && os.nbr) t += "2.2.2.2           0   FULL/  -        00:00:35    10.0.0.2        Serial0/0/0\n";
    else if (os && (os.problem === "nettype")) t += "2.2.2.2           1   EXSTART/  -     00:00:35    10.0.0.2        Serial0/0/0\n";
    return t;
  }, "ip ospf neighbor");
  R.ospfIfText = function (x, pid) {
    const i = this.iface(x.name), os = this.ospfState();
    const hello = i.hello || 10, dead = i.dead || (i.hello ? i.hello * 4 : 40);
    const p2p = x.name.startsWith("Serial") && i.ospfNet !== "broadcast" || i.ospfNet === "point-to-point" || isLoop(x.name);
    let t = `${x.name} is up, line protocol is up\n  Internet Address ${x.ip}/${maskLen(x.mask)}, Area ${x.area}, Attached via Network Statement\n  Process ID ${pid}, Router ID ${this.ospfRid(pid)}, Network Type ${isLoop(x.name) ? "LOOPBACK" : p2p ? "POINT_TO_POINT" : "BROADCAST"}, Cost: ${i.ospfCost || (x.name.startsWith("Serial") ? 64 : 1)}\n`;
    if (isLoop(x.name)) return t + "  Loopback interface is treated as a stub Host\n";
    t += `  Transmit Delay is 1 sec, State ${p2p ? "POINT_TO_POINT" : "DR"}${p2p ? "" : ", Priority " + (i.ospfPri ?? 1)}\n  Timer intervals configured, Hello ${hello}, Dead ${dead}, Wait ${dead}, Retransmit 5\n`;
    if (x.passive) t += "    No Hellos (Passive interface)\n";
    else t += `    Hello due in 00:00:0${hello > 9 ? 4 : 2}\n  Neighbor Count is ${x.name === "Serial0/0/0" && os && os.nbr ? 1 : 0}, Adjacent neighbor count is ${x.name === "Serial0/0/0" && os && os.nbr ? 1 : 0}\n${x.name === "Serial0/0/0" && os && os.nbr ? "    Adjacent with neighbor 2.2.2.2\n" : ""}`;
    return t;
  };
  H.priv["show ip ospf interface"] = showP(function () { let t = ""; for (const pid in this.cfg.ospf) for (const x of this.ospfIfaces(pid)) t += this.ospfIfText(x, pid); return t; }, "ip ospf interface");
  H.priv["show ip ospf interface brief"] = showP(function () {
    let t = "Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C\n"; const os = this.ospfState();
    for (const pid in this.cfg.ospf) for (const x of this.ospfIfaces(pid)) { const i = this.iface(x.name); t += `${pad(shortIf(x.name), 13)}${pad(pid, 6)}${pad(x.area, 16)}${pad(x.ip + "/" + maskLen(x.mask), 19)}${pad(i.ospfCost || (x.name.startsWith("Serial") ? 64 : 1), 6)}${pad(isLoop(x.name) ? "LOOP" : x.name.startsWith("Serial") ? "P2P" : "DR", 6)}${x.name === "Serial0/0/0" && os && os.nbr ? "1/1" : "0/0"}\n`; }
    return t;
  }, "ip ospf interface brief");
  H.priv["show ip ospf interface <인터페이스>"] = showP(function (a) {
    for (const pid in this.cfg.ospf) { const x = this.ospfIfaces(pid).find(y => y.name === a[0]); if (x) return this.ospfIfText(x, pid); }
    const i = this.iface(a[0]); if (!i) return "% Invalid interface\n";
    return `${a[0]} is ${this.statusText(i).join(", line protocol is ")}\n  OSPF not enabled on this interface\n`;
  }, "ip ospf interface x");
  H.priv["show ip ospf database"] = showP(function () {
    const pid = Object.keys(this.cfg.ospf)[0]; if (!pid) return "";
    const rid = this.ospfRid(pid), os = this.ospfState();
    let t = `\n            OSPF Router with ID (${rid}) (Process ID ${pid})\n\n                Router Link States (Area 0)\n\nLink ID         ADV Router      Age         Seq#       Checksum Link count\n${pad(rid, 16)}${pad(rid, 16)}62          0x80000004 0x00A1B2 ${this.ospfIfaces(pid).length + 1}\n`;
    if (os && os.nbr) t += "2.2.2.2         2.2.2.2         58          0x80000005 0x0049C3 4\n";
    return t;
  }, "ip ospf database");
  // EIGRP
  H.priv["show ip eigrp neighbors"] = showP(function () {
    const es = this.eigrpState();
    if (es && es.nbr) this.ev("eigrpnbr:up");
    let t = `EIGRP-IPv4 Neighbors for AS(${es ? es.as : 100})\nH   Address                 Interface              Hold Uptime   SRTT   RTO  Q  Seq\n                                                   (sec)         (ms)       Cnt Num\n`;
    if (es && es.nbr) t += "0   10.0.0.2                Se0/0/0                  12 00:01:05   20   200  0  8\n";
    return t;
  }, "ip eigrp neighbors");
  H.priv["show ip eigrp topology"] = showP(function () {
    const es = this.eigrpState(); if (!es) return "";
    let t = `EIGRP-IPv4 Topology Table for AS(${es.as})/ID(${es.p.rid || this.ospfRidLike()})\nCodes: P - Passive, A - Active, U - Update, Q - Query, R - Reply,\n       r - reply Status, s - sia Status\n\n`;
    for (const a of es.adv) t += `P ${a.net}/${maskLen(a.mask)}, 1 successors, FD is ${a.net.startsWith("10.") ? 2169856 : 2816}\n        via Connected, ${es.ifs.find(n => { const e = this.effIp(this.iface(n)); return e && netOf(e.ip, e.mask) === a.net; })}\n`;
    if (es.nbr) t += "P 172.16.0.0/24, 1 successors, FD is 2172416\n        via 10.0.0.2 (2172416/2816), Serial0/0/0\nP 2.2.2.2/32, 1 successors, FD is 2297856\n        via 10.0.0.2 (2297856/128256), Serial0/0/0\n";
    return t;
  }, "ip eigrp topology");
  H.priv["show ip eigrp interfaces"] = showP(function () {
    const es = this.eigrpState(); if (!es) return "";
    let t = `EIGRP-IPv4 Interfaces for AS(${es.as})\n                              Xmit Queue   PeerQ        Mean   Pacing Time   Multicast    Pending\nInterface              Peers  Un/Reliable  Un/Reliable  SRTT   Un/Reliable   Flow Timer   Routes\n`;
    for (const n of es.ifs) if (!es.passive(n)) t += `${pad(shortIf(n), 23)}${pad(n === "Serial0/0/0" && es.nbr ? 1 : 0, 7)}0/0          0/0           20       0/16          50           0\n`;
    return t;
  }, "ip eigrp interfaces");
  H.priv["show ip rip database"] = showP(function () {
    const rs = this.ripState(); if (!rs) return "";
    let t = "";
    for (const a of rs.adv) t += `${a.net}/${maskLen(a.mask)}    auto-summary\n${a.net}/${maskLen(a.mask)}    directly connected, ${this.ifaceNames().find(n => { const e = this.effIp(this.iface(n)); return e && netOf(e.ip, e.mask) === a.net; })}\n`;
    if (rs.recv) t += "172.16.0.0/24\n    [1] via 10.0.0.2, 00:00:12, Serial0/0/0\n";
    return t;
  }, "ip rip database");
  // NAT / DHCP
  H.priv["show ip nat translations"] = showP(function () {
    let t = "Pro  Inside global         Inside local          Outside local         Outside global\n";
    for (const s of this.cfg.natStatic) t += `---  ${pad(s.global, 22)}${pad(s.local, 22)}---                   ---\n`;
    for (const n of this.rt.nat) t += `${pad(n.proto, 5)}${pad(n.ig + ":" + n.port, 22)}${pad(n.il + ":" + n.port, 22)}${pad(n.ol + ":" + n.port, 22)}${n.og}:${n.port}\n`;
    if (this.rt.nat.length) this.ev("nattrans");
    return t;
  }, "ip nat translations");
  H.priv["show ip nat statistics"] = showP(function () {
    const ins = this.ifaceNames().filter(n => this.iface(n).natIn), outs = this.ifaceNames().filter(n => this.iface(n).natOut);
    return `Total active translations: ${this.rt.nat.length + this.cfg.natStatic.length} (${this.cfg.natStatic.length} static, ${this.rt.nat.length} dynamic; ${this.rt.nat.length} extended)\nPeak translations: ${this.rt.nat.length + this.cfg.natStatic.length}\nOutside interfaces:\n  ${outs.join(", ")}\nInside interfaces: \n  ${ins.join(", ")}\nHits: ${this.rt.nat.length * 12}  Misses: 0\nDynamic mappings:\n${this.cfg.natDyn.map(d => `-- Inside Source\n[Id: 1] access-list ${d.list} ${d.iface ? "interface " + d.iface : "pool " + d.pool} refcount ${this.rt.nat.length}`).join("\n")}\n`;
  }, "ip nat statistics");
  H.priv["show ip dhcp binding"] = showP(function () {
    let t = "Bindings from all pools not associated with VRF:\nIP address          Client-ID/              Lease expiration        Type       State      Interface\n                    Hardware address/\n                    User name\n";
    const b = this.rt.dhcpBind;
    if (b) { t += `${pad(b.ip, 20)}${pad(W.pc3mac, 24)}Mar 02 2026 12:00 AM    Automatic  Active     GigabitEthernet0/0\n`; this.ev("dhcpbinding"); }
    return t;
  }, "ip dhcp binding");
  H.priv["show ip dhcp pool"] = showP(function () {
    return Object.entries(this.cfg.pools).map(([n, p]) => `\nPool ${n} :\n Utilization mark (high/low)    : 100 / 0\n Subnet size (first/next)       : 0 / 0 \n Total addresses                : ${p.net ? Math.pow(2, 32 - maskLen(p.mask)) - 2 : 0}\n Leased addresses               : ${this.rt.dhcpBind && this.rt.pc3 && this.rt.pc3.pool === n ? 1 : 0}\n Pending event                  : none\n 1 subnet is currently in the pool :\n Current index        IP address range                    Leased addresses\n ${p.net ? pad(this.rt.pc3 ? n2ip(ip2n(this.rt.pc3.ip) + 1) : n2ip(ip2n(p.net) + 1), 21) + n2ip(ip2n(p.net) + 1) + "     - " + U.brdOf(p.net, p.mask).replace(/\d+$/, x => x - 1) : ""}\n`).join("");
  }, "ip dhcp pool");
  H.priv["show ip dhcp conflict"] = showP(function () { let t = "IP address        Detection method   Detection time          VRF\n"; for (const c of this.rt.dhcpConflicts) t += `${pad(c.ip, 18)}Ping               Mar 01 2026 12:05 AM\n`; return t; }, "ip dhcp conflict");
  R.aclText = function (only) {
    let t = "";
    for (const [name, a] of Object.entries(this.cfg.acls)) {
      if (only && name !== only) continue;
      const num = /^\d+$/.test(name);
      t += `${a.type === "standard" ? "Standard" : "Extended"} IP access list ${name}\n`;
      for (const e of a.entries) { if (e.remark) continue; t += `    ${e.seq} ${e.text.replace(/^(permit|deny)/, (m) => m)}${e.hits ? ` (${e.hits} match${e.hits > 1 ? "es" : ""})` : ""}\n`; }
    }
    return t;
  };
  H.priv["show access-lists"] = showP(function () { if (Object.values(this.cfg.acls).some(a => a.entries.some(e => e.hits))) this.ev("aclhits"); return this.aclText(); }, "access-lists");
  H.priv["show access-lists <이름>"] = showP(function (a) { if (this.cfg.acls[a[0]] && this.cfg.acls[a[0]].entries.some(e => e.hits)) this.ev("aclhits"); return this.aclText(a[0]); }, "access-lists x");
  H.priv["show ip access-lists"] = H.priv["show access-lists"];
  // IPv6
  // EUI-64 인터페이스 ID: MAC 가운데에 FFFE를 넣고 7번째 비트를 뒤집는다
  R.euiId = function (n) { const m = (U.MAC[n.split(".")[0]] || "0060.3e8a.4b10").replace(/\./g, ""); const b0 = (parseInt(m.slice(0, 2), 16) ^ 2).toString(16).padStart(2, "0"); return [b0 + m.slice(2, 4), m.slice(4, 6) + "ff", "fe" + m.slice(6, 8), m.slice(8, 12)]; };
  R.linkLocal = function (n) { return v6short("fe80::" + this.euiId(n).join(":")); };
  H.priv["show ipv6 interface brief"] = showP(function () {
    let t = "";
    for (const n of this.ifaceNames()) {
      const i = this.iface(n), [st, pr] = this.statusText(i);
      t += `${pad(n, 23)}[${st === "administratively down" ? "administratively down/" + pr : st + "/" + pr}]\n`;
      if (i.v6.length || i.v6enable) { t += `    ${(i.v6.find(a => a.ll) || {}).addr || this.linkLocal(n)}\n`; i.v6.filter(a => !a.ll).forEach(a => t += `    ${a.addr}\n`); }
      else t += "    unassigned\n";
    }
    return t;
  }, "ipv6 interface brief");
  H.priv["show ipv6 route"] = showP(function () {
    let t = `IPv6 Routing Table - default - ${1 + this.cfg.v6routes.length} entries\nCodes: C - Connected, L - Local, S - Static, U - Per-user Static route\n       B - BGP, R - RIP, H - NHRP, I1 - ISIS L1, I2 - ISIS L2\n       IA - ISIS interarea, IS - ISIS summary, D - EIGRP, EX - EIGRP external\n       ND - ND Default, NDp - ND Prefix, DCE - Destination, NDr - Redirect\n       O - OSPF Intra, OI - OSPF Inter, OE1 - OSPF ext 1, OE2 - OSPF ext 2\n       ON1 - OSPF NSSA ext 1, ON2 - OSPF NSSA ext 2, l - LISP\n`;
    for (const n of this.ifaceNames()) { const i = this.iface(n); if (!this.up(i)) continue; for (const a of i.v6.filter(x => !x.ll)) { const net = a.addr.replace(/[0-9A-F]+$/i, "").replace(/:+$/, "::"); t += `C   ${net}/${a.len} [0/0]\n     via ${n}, directly connected\nL   ${a.addr}/128 [0/0]\n     via ${n}, receive\n`; } }
    for (const r of this.cfg.v6routes) t += `S   ${r.pfx}/${r.len} [1/0]\n     via ${r.nh}\n`;
    t += "L   FF00::/8 [0/0]\n     via Null0, receive\n";
    return t;
  }, "ipv6 route");
  H.priv["show ipv6 neighbors"] = showP(function () { const s0 = this.iface("Serial0/0/0"); return "IPv6 Address                              Age Link-layer Addr State Interface\n" + (this.events.has("ping6:" + v6short(W.r2v6s) + ":ok") ? "2001:DB8:12::2                              0 -              REACH Se0/0/0\n" : ""); }, "ipv6 neighbors");
  // 기타
  H.priv["show flash:"] = showP(function () { return "-#- --length-- -----date/time------ path\n1    106219128 Mar 1 2026 00:00:00 +00:00 c2900-universalk9-mz.SPA.154-3.M2.bin\n2         2903 Mar 1 2026 00:00:00 +00:00 cpconfig-29xx.cfg\n\n149413888 bytes available (106487808 bytes used)\n"; }, "flash");
  H.priv["show logging"] = showP(function () {
    const b = this.cfg.logBuffered;
    let t = `Syslog logging: enabled (0 messages dropped, 0 messages rate-limited, 0 flushes, 0 overruns, xml disabled, filtering disabled)\n\n    Console logging: ${this.cfg.logConsole ? "level debugging" : "disabled"}, ${this.rt.logs.length} messages logged, xml disabled,\n    Monitor logging: level debugging, 0 messages logged, xml disabled,\n    Buffer logging:  ${b !== null ? "level debugging, " + this.rt.logs.length + " messages logged, xml disabled," : "disabled"}\n    Logging Exception size (4096 bytes)\n    Trap logging: level ${this.cfg.logTrap || "informational"}, 0 message lines logged\n`;
    for (const h of this.cfg.logHosts) t += `        Logging to ${h}  (udp port 514, audit disabled,\n              link up),\n`;
    if (b !== null) { t += `\nLog Buffer (${b || 8192} bytes):\n\n` + this.rt.logs.join("\n") + "\n"; this.ev("showlog:buf"); }
    return t;
  }, "logging");
  H.priv["show debugging"] = showP(function () { const d = [...this.rt.debug]; return d.length ? "IP routing:\n" + d.map(x => `  ${x} debugging is on`).join("\n") + "\n" : ""; }, "debugging");
  H.priv["show ip ssh"] = showP(function () { const on = this.cfg.rsaBits > 0; this.ev("showssh"); return `SSH ${on ? "Enabled - version " + (this.cfg.sshVersion === 2 ? "2.0" : "1.99") : "Disabled - version 1.99"}\nAuthentication methods:publickey,keyboard-interactive,password\nAuthentication timeout: ${this.cfg.sshTimeout} secs; Authentication retries: ${this.cfg.sshRetries}\nMinimum expected Diffie Hellman key size : 1024 bits\nIOS Keys in SECSH format(ssh-rsa, base64 encoded): ${on ? "" : "NONE"}\n${on ? "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC" + U.type5(this.cfg.hostname).slice(4, 30) + "...\n" : ""}`; }, "ip ssh");
  H.priv["show ssh"] = showP(function () { return this.sshPath().ok ? "Connection Version Mode Encryption  Hmac         State                 Username\n0          2.0     IN   aes256-ctr  hmac-sha2-256 Session started       " + (Object.keys(this.cfg.users)[0] || "-") + "\n" : "%No SSHv2 server connections running.\n"; }, "ssh");
  H.priv["show crypto key mypubkey rsa"] = showP(function () { if (!this.cfg.rsaBits) return "% Key pair was not generated\n"; return `% Key pair was generated at: 00:05:12 UTC Mar 1 2026\nKey name: ${this.cfg.hostname}.${this.cfg.domainName}\nKey type: RSA KEYS\n Storage Device: not specified\n Usage: General Purpose Key\n Key is not exportable.\n Key Data:\n  30820122 300D0609 2A864886 F70D0101 01050003 82010F00 3082010A 02820101\n  (${this.cfg.rsaBits} bits)\n`; }, "crypto key");
  H.priv["show controllers <인터페이스>"] = showP(function (a) { if (a[0].startsWith("Serial")) return `Interface ${a[0]}\nHardware is SCC\n${a[0] === "Serial0/0/0" ? "DTE V.35 TX and RX clocks detected." : "No serial cable attached"}\n`; return `Interface ${a[0]}\nHardware is CN Gigabit Ethernet\n`; }, "controllers");
  H.priv["show protocols"] = showP(function () { let t = "Global values:\n  Internet Protocol routing is enabled\n"; for (const n of this.ifaceNames()) { const i = this.iface(n), e = this.effIp(i), [st, pr] = this.statusText(i); t += `${n} is ${st}, line protocol is ${pr}\n${e ? `  Internet address is ${e.ip}/${maskLen(e.mask)}\n` : ""}`; } return t; }, "protocols");
  H.priv["show processes cpu"] = showP(function () { return "CPU utilization for five seconds: 1%/0%; one minute: 1%; five minutes: 1%\n PID Runtime(ms)     Invoked      uSecs   5Sec   1Min   5Min TTY Process \n   1           0           2          0  0.00%  0.00%  0.00%   0 Chunk Manager    \n   2          12         501         23  0.00%  0.00%  0.00%   0 Load Meter       \n"; }, "processes");
  H.priv["show hosts"] = showP(function () { let t = `Default domain is ${this.cfg.domainName || "not set"}\nName/address lookup uses ${this.cfg.domainLookup ? "domain service" : "static mappings"}\nName servers are ${this.cfg.nameServers.join(", ") || "255.255.255.255"}\n\nCodes: UN - unknown, EX - expired, OK - OK, ?? - revalidate\n       temp - temporary, perm - permanent\n       NA - Not Applicable None - Not defined\n\nHost                      Port  Flags      Age Type   Address(es)\n`; for (const [h, ip] of Object.entries(this.cfg.hosts)) t += `${pad(h, 26)}None  (perm, OK)  0   IP    ${ip}\n`; return t; }, "hosts");
  H.priv["show ntp status"] = showP(function () { return this.cfg.ntp.length ? `Clock is unsynchronized, stratum 16, no reference clock\nnominal freq is 250.0000 Hz, actual freq is 250.0000 Hz, precision is 2**24\n` : "%NTP is not enabled.\n"; }, "ntp");
  H.priv["show inventory"] = showP(function () { return 'NAME: "CISCO2911/K9 chassis", DESCR: "CISCO2911/K9 chassis"\nPID: CISCO2911/K9      , VID: V07 , SN: FTX1840ABCD\n'; }, "inventory");
  H.priv["show sessions"] = showP(function () { return "% No connections open\n"; }, "sessions");

  // ── 설정·저장 ──
  H.priv["configure terminal"] = function (a, io) { io.out("Enter configuration commands, one per line.  End with CNTL/Z.\n"); this.mode = "config"; this.ctx = {}; };
  H.priv["configure"] = async function (a, io) { const r = await io.ask("Configuring from terminal, memory, or network [terminal]? "); if (r && !"terminal".startsWith(r.trim())) { io.out("?Invalid selection\n"); return; } H.priv["configure terminal"].call(this, a, io); };
  R.save = function (io) { io.out("Building configuration...\n[OK]\n"); this.startup = clone(this.cfg); this.ev("saved"); };
  H.priv["copy running-config startup-config"] = async function (a, io) { const r = await io.ask("Destination filename [startup-config]? "); if (r && r.trim() && r.trim() !== "startup-config") { io.out("%Error opening " + r + "\n"); return; } this.save(io); };
  H.priv["write memory"] = function (a, io) { this.save(io); };
  H.priv["write"] = function (a, io) { this.save(io); };
  H.priv["write terminal"] = async function (a, io, l) { await this.pageOut("Building configuration...\n\n" + this.buildConfig(this.cfg, true), io, l); };
  H.priv["copy startup-config running-config"] = async function (a, io) {
    await io.ask("Destination filename [running-config]? ");
    if (!this.startup) { io.out("%Error opening nvram:/startup-config (No such file or directory)\n"); return; }
    // 합치기: startup의 설정을 덮어쓰되, 지금 꺼져 있는 포트는 그대로 꺼진 채로 둔다
    const st = clone(this.startup), cur = this.cfg;
    for (const n in st.ifs) { const now = cur.ifs[n]; st.ifs[n].shutdown = now ? (now.shutdown || st.ifs[n].shutdown) : st.ifs[n].shutdown; if (isLoop(n)) st.ifs[n].shutdown = this.startup.ifs[n].shutdown; }
    st.configReg = cur.configReg;
    this.cfg = st;
    io.out(`${this.buildConfig(st).length} bytes copied in 0.416 secs (${Math.round(this.buildConfig(st).length / 0.416)} bytes/sec)\n`);
    setTimeout(() => this.log("%SYS-5-CONFIG_I: Configured from memory by console"), 200);
    this.ev("copystartrun");
  };
  R.tftp = async function (io, which) {
    const host = (await io.ask("Address or name of remote host []? ")).trim();
    if (!host) { io.out("%Error parsing filename (Bad IP address or host name)\n"); return; }
    const fn = (await io.ask(`Destination filename [${this.cfg.hostname.toLowerCase()}-confg]? `)).trim() || this.cfg.hostname.toLowerCase() + "-confg";
    const ip = this.resolveName(host);
    await sleep(500);
    if (ip === W.pc1 && this.r1Reach(ip).ok) { io.out(`!!\n${this.buildConfig(which === "start" ? (this.startup || this.cfg) : this.cfg).length} bytes copied in 1.032 secs (1298 bytes/sec)\n`); this.ev("tftp:ok"); }
    else io.out(`%Error opening tftp://${host}/${fn} (Timed out)\n`);
  };
  H.priv["copy running-config tftp:"] = async function (a, io) { await this.tftp(io, "run"); };
  H.priv["copy startup-config tftp:"] = async function (a, io) { await this.tftp(io, "start"); };
  H.priv["copy tftp: running-config"] = async function (a, io) { const h = await io.ask("Address or name of remote host []? "); await io.ask("Source filename []? "); io.out(`Accessing tftp://${h}/...\n%Error opening tftp://${h}/ (No such file or directory)\n`); };
  H.priv["copy tftp: startup-config"] = H.priv["copy tftp: running-config"];
  const eraseFn = async function (a, io) { const r = await io.ask("Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]"); if (r.trim() && !/^y/i.test(r.trim())) return; this.startup = null; io.out("[OK]\nErase of nvram: complete\n"); setTimeout(() => this.log("%SYS-7-NV_BLOCK_INIT: Initialized the geometry of nvram"), 200); this.ev("erased"); };
  H.priv["write erase"] = eraseFn; H.priv["erase startup-config"] = eraseFn; H.priv["erase nvram:"] = eraseFn;
  H.priv["reload"] = async function (a, io) {
    if (this.isDirty() && this.startup !== null || (this.isDirty() && this.events.has("configured"))) {
      const r = (await io.ask("\nSystem configuration has been modified. Save? [yes/no]: ")).trim().toLowerCase();
      if (r.startsWith("y")) this.save(io); else if (!r.startsWith("n")) { io.out("% Please answer 'yes' or 'no'.\n"); return; }
    }
    const c = (await io.ask("Proceed with reload? [confirm]")).trim();
    if (c && !/^y/i.test(c)) return;
    this.emit("reload");
  };
  H.priv["ping"] = async function (a, io) {
    const proto = (await io.ask("Protocol [ip]: ")).trim() || "ip";
    if (proto !== "ip" && proto !== "ipv6") { io.out("% Unknown protocol\n"); return; }
    const tgt = (await io.ask("Target IP address: ")).trim();
    if (proto === "ipv6") return H.user["ping ipv6 <이름>"].call(this, [tgt], io);
    if (!isIp(tgt)) { io.out("% Bad IP address\n"); return; }
    const count = +(await io.ask("Repeat count [5]: ")).trim() || 5;
    const size = +(await io.ask("Datagram size [100]: ")).trim() || 100;
    await io.ask("Timeout in seconds [2]: ");
    const ext = (await io.ask("Extended commands [n]: ")).trim().toLowerCase();
    let src = null;
    if (ext.startsWith("y")) { const s = (await io.ask("Source address or interface: ")).trim(); src = normIface(s) || (isIp(s) ? s : null); await io.ask("Type of service [0]: "); await io.ask("Set DF bit in IP header? [no]: "); }
    await io.ask("Sweep range of sizes [n]: ");
    await this.doPing(tgt, io, { count: Math.min(count, 50), size, src });
  };
  H.priv["clock set <텍스트>"] = function (a, io) {
    const m = a[0].match(/^(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})$/) || a[0].match(/^(\d{1,2}):(\d{2}):(\d{2})\s+([A-Za-z]{3})\w*\s+(\d{1,2})\s+(\d{4})$/);
    if (!m) { io.out("% Invalid input. 예: clock set 14:30:00 21 Nov 2026\n"); return; }
    const mons = "janfebmaraprmayjunjulaugsepoctnovdec";
    const dayFirst = /^\d/.test(m[4]);
    const day = +(dayFirst ? m[4] : m[5]), mon = mons.indexOf((dayFirst ? m[5] : m[4]).toLowerCase()) / 3;
    if (mon < 0) { io.out("% Invalid month\n"); return; }
    const target = Date.UTC(+m[6], mon, day, +m[1], +m[2], +m[3]) - this.tzOffset();
    this.clockOffset += target - this.now();
  };
  const dirFn = function (a, io) { io.out("Directory of flash0:/\n\n    1  -rw-   106219128   Mar 1 2026 00:00:00 +00:00  c2900-universalk9-mz.SPA.154-3.M2.bin\n    2  -rw-        2903   Mar 1 2026 00:00:00 +00:00  cpconfig-29xx.cfg\n\n256487424 bytes total (149413888 bytes free)\n"); };
  H.priv["dir"] = dirFn; H.priv["dir flash:"] = dirFn;
  H.priv["clear ip ospf process"] = async function (a, io) { const r = (await io.ask("Reset ALL OSPF processes? [no]: ")).trim(); if (/^y/i.test(r)) { this.prevSnap && (this.prevSnap.ospf = ""); this.ev("ospfclear"); } };
  H.priv["clear ip route *"] = function () {};
  H.priv["clear arp-cache"] = function () { this.rt.arp = {}; };
  H.priv["clear counters"] = async function (a, io) { await io.ask("Clear \"show interface\" counters on all interfaces [confirm]"); };
  H.priv["clear ip nat translation *"] = function () { this.rt.nat = []; };
  H.priv["clear ip dhcp binding *"] = function () { this.rt.dhcpBind = null; this.rt.pc3 = null; };
  H.priv["clear logging"] = async function (a, io) { await io.ask("Clear logging buffer [confirm]"); this.rt.logs = []; };
  // debug
  const DBG = { "ip rip": "RIP protocol", "ip ospf adj": "OSPF adjacency events", "ip ospf hello": "OSPF hello events", "ip ospf events": "OSPF events", "ip icmp": "ICMP packet", "ip packet": "IP packet", "ip nat": "IP NAT", "ip dhcp server events": "DHCP server event", "eigrp packets": "EIGRP Packets", "ip routing": "IP routing" };
  for (const [k, label] of Object.entries(DBG)) {
    H.priv["debug " + k] = function (a, io) { this.rt.debug.add(k); io.out(`${label} debugging is on\n`); this.ev("debug:" + k); this.debugTick(); };
    H.priv["undebug " + k] = H.priv["no debug " + k] = function (a, io) { this.rt.debug.delete(k); io.out(`${label} debugging is off\n`); };
  }
  H.priv["undebug all"] = H.priv["no debug all"] = function (a, io) { this.rt.debug.clear(); io.out("All possible debugging has been turned off\n"); };
  R.debugLater = function (m) { setTimeout(() => this.emit("async", `${this.stamp()}: ${m}`), 200); };
  R.debugTick = function () {
    if (this._dbgTimer) return;
    const tick = () => {
      if (!this.rt.debug.size || this.state !== "exec") { this._dbgTimer = null; return; }
      const os = this.ospfState(), d = this.rt.debug;
      const out = [];
      if (d.has("ip ospf hello") && Object.keys(this.cfg.ospf).length) {
        const i = this.iface("Serial0/0/0");
        if (os && os.problem === "timers") out.push(`OSPF-${os.pid} HELLO Se0/0/0: Rcv hello from 2.2.2.2 area 0 10.0.0.2`, `OSPF-${os.pid} HELLO Se0/0/0: Mismatched hello parameters from 10.0.0.2`, `OSPF-${os.pid} HELLO Se0/0/0: Dead R 40 C ${os.dead}, Hello R 10 C ${os.hello}`);
        else if (os && os.nbr) out.push(`OSPF-${os.pid} HELLO Se0/0/0: Send hello to 224.0.0.5 area 0 from 10.0.0.1`, `OSPF-${os.pid} HELLO Se0/0/0: Rcv hello from 2.2.2.2 area 0 10.0.0.2`);
        else if (os && os.problem === "area") out.push(`OSPF-${os.pid} HELLO Se0/0/0: Rcv pkt from 10.0.0.2, Serial0/0/0, area 0.0.0.0 : mismatched area ${this.ospfIfaces(os.pid).find(x => x.name === "Serial0/0/0").area} in the header`);
        else if (i && !this.l2(i)) out.push(`OSPF-${os ? os.pid : 1} HELLO: Serial0/0/0 is down, hello not sent`);
      }
      if (d.has("ip rip") && this.cfg.rip) {
        const rs = this.ripState();
        if (rs.recv) out.push("RIP: received v2 update from 10.0.0.2 on Serial0/0/0", "     172.16.0.0/24 via 0.0.0.0 in 1 hops");
        if (rs.send) out.push("RIP: sending v2 update to 224.0.0.9 via Serial0/0/0 (10.0.0.1)");
        else if (rs.covered("Serial0/0/0")) out.push("RIP: sending v1 update to 255.255.255.255 via Serial0/0/0 (10.0.0.1)", "RIP: ignored v1 packet from 10.0.0.1 (illegal version)  ← R2 쪽에서 무시");
      }
      if (d.has("eigrp packets") && this.eigrpState() && this.eigrpState().nbr) out.push("EIGRP: Received HELLO on Se0/0/0 nbr 10.0.0.2", "  AS 100, Flags 0x0:(NULL), Seq/Ack 0/0, idbQ 0/0 iidbQ un/rely 0/0 peerQ un/rely 0/0");
      out.forEach(m => this.emit("async", `${this.stamp()}: ${m}`));
      this._dbgTimer = setTimeout(tick, 8000);
    };
    this._dbgTimer = setTimeout(tick, 1500);
  };

  // ── 전역 설정 ──
  const markCfg = fn => function (...x) { this.ev("configured"); return fn.apply(this, x); };
  const C = H.config;
  C["hostname <이름>"] = function (a) { this.cfg.hostname = a[0]; };
  C["interface <인터페이스>"] = function (a, io) {
    const i = this.ensureIface(a[0]);
    if (!i) { io.out("% Invalid interface\n"); return; }
    if (isLoop(a[0]) && !this._seenLoop?.[a[0]]) { (this._seenLoop = this._seenLoop || {})[a[0]] = 1; }
    this.mode = "if"; this.ctx = { iface: a[0] };
  };
  C["interface range <텍스트>"] = function (a, io) {
    const m = a[0].replace(/\s+/g, "").match(/^([a-z]+)(\d+\/(?:\d+\/)?)(\d+)-(\d+)$/i);
    if (!m) { io.out("% Invalid range. 예: interface range g0/0 - 1\n"); return; }
    const list = [];
    for (let k = +m[3]; k <= +m[4]; k++) { const n = normIface(m[1] + m[2] + k); if (!n || !this.iface(n)) { io.out(`% Interface ${m[1]}${m[2]}${k} not found\n`); return; } list.push(n); }
    this.mode = "if"; this.ctx = { iface: list[0], range: list };
  };
  C["no interface <인터페이스>"] = function (a, io) { if (isLoop(a[0]) || a[0].includes(".")) delete this.cfg.ifs[a[0]]; else io.out("% Physical interface cannot be deleted\n"); };
  C["default interface <인터페이스>"] = function (a) { if (this.cfg.ifs[a[0]]) { this.cfg.ifs[a[0]] = U.newIface(a[0]); } };
  const addRoute = function (net, mask, nh, iface, ad, io) {
    if (U.maskLen(mask) < 0) { io.out("%Inconsistent address and mask\n"); return; }
    if (netOf(net, mask) !== net) { io.out("%Inconsistent address and mask\n"); return; }
    this.cfg.routes = this.cfg.routes.filter(r => !(r.net === net && r.mask === mask && (r.nh || null) === (nh || null) && (r.iface || null) === (iface || null)));
    this.cfg.routes.push({ net, mask, nh: nh || null, iface: iface || null, ad: ad ? +ad : 1 });
  };
  C["ip route A.B.C.D <마스크> A.B.C.D"] = function (a, io) { addRoute.call(this, a[0], a[1], a[2], null, null, io); };
  C["ip route A.B.C.D <마스크> A.B.C.D <숫자>"] = function (a, io) { addRoute.call(this, a[0], a[1], a[2], null, a[3], io); };
  C["ip route A.B.C.D <마스크> <인터페이스>"] = function (a, io) { if (!a[2].startsWith("Serial") && !isLoop(a[2])) io.out("%Default route without gateway, if not a point-to-point interface, may impact performance\n"); addRoute.call(this, a[0], a[1], null, a[2], null, io); };
  C["ip route A.B.C.D <마스크> <인터페이스> <숫자>"] = function (a, io) { addRoute.call(this, a[0], a[1], null, a[2], a[3], io); };
  const delRoute = function (net, mask, nh, iface) { const before = this.cfg.routes.length; this.cfg.routes = this.cfg.routes.filter(r => !(r.net === net && r.mask === mask && (nh === undefined || r.nh === nh) && (iface === undefined || r.iface === iface))); return before !== this.cfg.routes.length; };
  C["no ip route A.B.C.D <마스크> A.B.C.D"] = function (a, io) { if (!delRoute.call(this, a[0], a[1], a[2])) io.out("%No matching route to delete\n"); };
  C["no ip route A.B.C.D <마스크> A.B.C.D <숫자>"] = C["no ip route A.B.C.D <마스크> A.B.C.D"];
  C["no ip route A.B.C.D <마스크> <인터페이스>"] = function (a, io) { if (!delRoute.call(this, a[0], a[1], undefined, a[2])) io.out("%No matching route to delete\n"); };
  C["no ip route A.B.C.D <마스크>"] = function (a, io) { if (!delRoute.call(this, a[0], a[1])) io.out("%No matching route to delete\n"); };
  C["ip routing"] = function () { this.cfg.ipRouting = true; };
  C["no ip routing"] = function () { this.cfg.ipRouting = false; };
  C["ip domain-lookup"] = C["ip domain lookup"] = function () { this.cfg.domainLookup = true; };
  C["no ip domain-lookup"] = C["no ip domain lookup"] = function () { this.cfg.domainLookup = false; };
  C["ip domain-name <이름>"] = C["ip domain name <이름>"] = function (a) { this.cfg.domainName = a[0]; };
  C["no ip domain-name"] = C["no ip domain name"] = function () { this.cfg.domainName = ""; };
  C["ip host <이름> A.B.C.D"] = function (a) { this.cfg.hosts[a[0]] = a[1]; };
  C["no ip host <이름>"] = C["no ip host <이름> A.B.C.D"] = function (a) { delete this.cfg.hosts[a[0]]; };
  C["ip name-server A.B.C.D"] = function (a) { if (!this.cfg.nameServers.includes(a[0])) this.cfg.nameServers.push(a[0]); };
  C["ip name-server A.B.C.D A.B.C.D"] = function (a) { a.forEach(x => { if (!this.cfg.nameServers.includes(x)) this.cfg.nameServers.push(x); }); };
  C["no ip name-server"] = function () { this.cfg.nameServers = []; };
  C["no ip name-server A.B.C.D"] = function (a) { this.cfg.nameServers = this.cfg.nameServers.filter(x => x !== a[0]); };
  C["router rip"] = function () { if (!this.cfg.rip) this.cfg.rip = { version: null, networks: [], autoSummary: true, passive: [], noPassive: [], passiveDefault: false, defaultOrig: false, timers: null, redistribute: [], maxPaths: null, distance: null }; this.mode = "rip"; this.ctx = {}; };
  C["no router rip"] = function () { this.cfg.rip = null; };
  C["router ospf <숫자>"] = function (a, io) { if (+a[0] < 1 || +a[0] > 65535) { io.out("% Invalid input detected\n"); return; } if (!this.cfg.ospf[a[0]]) this.cfg.ospf[a[0]] = { rid: null, networks: [], passive: [], noPassive: [], passiveDefault: false, defaultOrig: null, refBw: null, logAdj: true, redistribute: [], maxPaths: null, distance: null }; this.mode = "ospf"; this.ctx = { pid: a[0] }; };
  C["no router ospf <숫자>"] = function (a) { delete this.cfg.ospf[a[0]]; };
  C["router eigrp <숫자>"] = function (a) { if (!this.cfg.eigrp[a[0]]) this.cfg.eigrp[a[0]] = { networks: [], autoSummary: false, rid: null, variance: null, passive: [], noPassive: [], passiveDefault: false, redistribute: [], maxPaths: null, distance: null }; this.mode = "eigrp"; this.ctx = { as: a[0] }; };
  C["no router eigrp <숫자>"] = function (a) { delete this.cfg.eigrp[a[0]]; };
  const minLenOk = function (pw, io) { if (this.cfg.minLen && pw.length < this.cfg.minLen) { io.out(`% Password too short - must be at least ${this.cfg.minLen} characters. Password configuration failed\n`); return false; } return true; };
  C["enable secret <이름>"] = function (a, io) { if (!minLenOk.call(this, a[0], io)) return; this.cfg.enableSecret = { pw: a[0], alg: 5 }; };
  C["enable secret <숫자> <이름>"] = function (a, io) { if (a[0] === "0") return C["enable secret <이름>"].call(this, [a[1]], io); io.out("% 암호화된 값을 직접 넣는 연습은 지원하지 않습니다. enable secret <비밀번호> 를 쓰세요.\n"); };
  C["enable algorithm-type scrypt secret <이름>"] = function (a, io) { if (!minLenOk.call(this, a[0], io)) return; this.cfg.enableSecret = { pw: a[0], alg: 9 }; };
  C["enable password <이름>"] = function (a, io) { if (!minLenOk.call(this, a[0], io)) return; if (this.cfg.enableSecret && this.cfg.enableSecret.pw === a[0]) io.out("The enable password you have chosen is the same as your enable secret.\nThis is not recommended.  Re-enter the enable password.\n"); this.cfg.enablePassword = a[0]; };
  C["no enable secret"] = function () { this.cfg.enableSecret = null; };
  C["no enable password"] = function () { this.cfg.enablePassword = null; };
  C["service password-encryption"] = function () { this.cfg.pwEnc = true; };
  C["no service password-encryption"] = function () { this.cfg.pwEnc = false; };
  C["security passwords min-length <숫자>"] = function (a) { this.cfg.minLen = +a[0]; };
  C["no security passwords min-length"] = function () { this.cfg.minLen = null; };
  C["login block-for <숫자> attempts <숫자> within <숫자>"] = function (a) { this.cfg.loginBlock = { secs: +a[0], tries: +a[1], within: +a[2] }; };
  C["no login block-for"] = function () { this.cfg.loginBlock = null; };
  C["login on-success log"] = function () { this.cfg.loginLog.success = true; };
  C["login on-failure log"] = function () { this.cfg.loginLog.failure = true; };
  const bannerFn = kind => async function (a, io) {
    let txt = a[0], d = txt[0];
    const rest = txt.slice(1);
    let body;
    if (rest.includes(d)) body = rest.slice(0, rest.indexOf(d));
    else {
      io.out(`Enter TEXT message.  End with the character '${d}'.\n`);
      const lines = [rest];
      for (let k = 0; k < 20; k++) { const l = await io.ask(""); if (l.includes(d)) { lines.push(l.slice(0, l.indexOf(d))); break; } lines.push(l); }
      body = lines.join("\n").replace(/^\n/, "");
    }
    this.cfg.banners[kind] = body;
  };
  C["banner motd <텍스트>"] = bannerFn("motd"); C["banner login <텍스트>"] = bannerFn("login"); C["banner exec <텍스트>"] = bannerFn("exec");
  C["no banner motd"] = function () { this.cfg.banners.motd = ""; }; C["no banner login"] = function () { this.cfg.banners.login = ""; }; C["no banner exec"] = function () { this.cfg.banners.exec = ""; };
  C["line console <숫자>"] = function (a, io) { if (a[0] !== "0") { io.out("% Invalid input detected\n"); return; } this.mode = "line"; this.ctx = { line: "con" }; };
  C["line vty <숫자> <숫자>"] = function (a, io) { if (+a[0] > 15 || +a[1] > 15) { io.out("% Invalid input detected\n"); return; } this.mode = "line"; this.ctx = { line: "vty" }; };
  C["line vty <숫자>"] = C["line vty <숫자> <숫자>"];
  const userFn = (priv, kind, alg) => function (a, io) { const name = a[0], pw = a[a.length - 1]; if (!minLenOk.call(this, pw, io)) return; this.cfg.users[name] = { priv: priv ? +a[1] : 1, kind, pw, alg: alg || (kind === "secret" ? 5 : 0) }; };
  C["username <이름> secret <이름>"] = userFn(false, "secret");
  C["username <이름> privilege <숫자> secret <이름>"] = userFn(true, "secret");
  C["username <이름> password <이름>"] = userFn(false, "password");
  C["username <이름> privilege <숫자> password <이름>"] = userFn(true, "password");
  C["username <이름> algorithm-type scrypt secret <이름>"] = function (a, io) { userFn(false, "secret", 9).call(this, [a[0], a[1]], io); };
  C["no username <이름>"] = function (a) { delete this.cfg.users[a[0]]; };
  const genKey = async function (bits, io) {
    if (this.cfg.hostname === "Router") { io.out("% Please define a hostname other than Router.\n"); return; }
    if (!this.cfg.domainName) { io.out("% Please define a domain-name first.\n"); return; }
    io.out(`The name for the keys will be: ${this.cfg.hostname}.${this.cfg.domainName}\n`);
    if (!bits) { io.out("Choose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n\n"); bits = +(await io.ask("How many bits in the modulus [512]: ")).trim() || 512; }
    if (bits < 360 || bits > 4096) { io.out("% Invalid modulus\n"); return; }
    io.out(`% Generating ${bits} bit RSA keys, keys will be non-exportable...\n`);
    await sleep(Math.min(1500, bits / 2));
    io.out(`[OK] (elapsed time was ${Math.max(1, Math.round(bits / 1024))} seconds)\n\n`);
    this.cfg.rsaBits = bits;
    setTimeout(() => this.log(`%SSH-5-ENABLED: SSH ${bits >= 768 ? "1.99" : "1.5"} has been enabled`), 300);
  };
  C["crypto key generate rsa"] = async function (a, io) { await genKey.call(this, 0, io); };
  C["crypto key generate rsa general-keys modulus <숫자>"] = async function (a, io) { await genKey.call(this, +a[0], io); };
  C["crypto key generate rsa modulus <숫자>"] = C["crypto key generate rsa general-keys modulus <숫자>"];
  C["crypto key zeroize rsa"] = async function (a, io) { const r = await io.ask("% All keys will be removed.\n% All router certs issued using these keys will also be removed.\nDo you really want to remove these keys? [yes/no]: "); if (/^y/i.test(r.trim())) { this.cfg.rsaBits = 0; setTimeout(() => this.log("%SSH-5-DISABLED: SSH 1.99 has been disabled"), 200); } };
  C["ip ssh version <숫자>"] = function (a, io) { if (a[0] !== "1" && a[0] !== "2") { io.out("% Invalid input detected\n"); return; } if (a[0] === "2" && this.cfg.rsaBits && this.cfg.rsaBits < 768) io.out("Please create RSA keys (of atleast 768 bits size) to enable SSH v2.\n"); this.cfg.sshVersion = +a[0]; };
  C["no ip ssh version"] = function () { this.cfg.sshVersion = null; };
  C["ip ssh time-out <숫자>"] = function (a) { this.cfg.sshTimeout = +a[0]; };
  C["ip ssh authentication-retries <숫자>"] = function (a) { this.cfg.sshRetries = +a[0]; };
  C["cdp run"] = function () { this.cfg.cdp = true; }; C["no cdp run"] = function () { this.cfg.cdp = false; };
  C["lldp run"] = function () { this.cfg.lldp = true; }; C["no lldp run"] = function () { this.cfg.lldp = false; };
  C["logging buffered"] = function () { this.cfg.logBuffered = this.cfg.logBuffered || 8192; };
  C["logging buffered <숫자>"] = function (a) { this.cfg.logBuffered = +a[0]; };
  C["no logging buffered"] = function () { this.cfg.logBuffered = null; this.rt.logs = []; };
  C["logging console"] = function () { this.cfg.logConsole = true; }; C["no logging console"] = function () { this.cfg.logConsole = false; };
  C["logging host A.B.C.D"] = C["logging A.B.C.D"] = function (a) { if (!this.cfg.logHosts.includes(a[0])) this.cfg.logHosts.push(a[0]); };
  C["no logging host A.B.C.D"] = function (a) { this.cfg.logHosts = this.cfg.logHosts.filter(x => x !== a[0]); };
  C["logging trap <이름>"] = function (a) { this.cfg.logTrap = a[0]; };
  C["ntp server A.B.C.D"] = function (a) { if (!this.cfg.ntp.includes(a[0])) this.cfg.ntp.push(a[0]); };
  C["no ntp server A.B.C.D"] = function (a) { this.cfg.ntp = this.cfg.ntp.filter(x => x !== a[0]); };
  C["clock timezone <이름> <숫자>"] = function (a) { this.cfg.tz = { name: a[0], h: +a[1], m: 0 }; };
  C["clock timezone <이름> <숫자> <숫자>"] = function (a) { this.cfg.tz = { name: a[0], h: +a[1], m: +a[2] }; };
  C["no clock timezone"] = function () { this.cfg.tz = null; };
  C["config-register <이름>"] = function (a, io) { if (!/^0x[0-9a-f]{1,4}$/i.test(a[0])) { io.out("% Invalid input detected\n"); return; } this.cfg.configReg = "0x" + a[0].slice(2).padStart(4, "0").toUpperCase().replace(/^/, "").toLowerCase(); };
  C["ipv6 unicast-routing"] = function () { this.cfg.v6routing = true; }; C["no ipv6 unicast-routing"] = function () { this.cfg.v6routing = false; };
  C["ipv6 route <이름> <이름>"] = function (a, io) { const p = parseV6Pfx(a[0]); if (!p || !v6expand(a[1])) { io.out("% Invalid input detected. 예: ipv6 route 2001:DB8:172::/64 2001:DB8:12::2\n"); return; } this.cfg.v6routes = this.cfg.v6routes.filter(r => !(r.pfx === p.addr && r.len === p.len)); this.cfg.v6routes.push({ pfx: p.addr, len: p.len, nh: v6short(a[1]) }); };
  C["no ipv6 route <이름> <이름>"] = function (a) { const p = parseV6Pfx(a[0]); if (p) this.cfg.v6routes = this.cfg.v6routes.filter(r => !(r.pfx === p.addr && r.len === p.len)); };
  C["ip dhcp excluded-address A.B.C.D"] = function (a) { this.cfg.dhcpEx.push([a[0], a[0]]); };
  C["ip dhcp excluded-address A.B.C.D A.B.C.D"] = function (a, io) { if (ip2n(a[1]) < ip2n(a[0])) { io.out("% Invalid address range\n"); return; } this.cfg.dhcpEx.push([a[0], a[1]]); };
  C["no ip dhcp excluded-address A.B.C.D"] = function (a) { this.cfg.dhcpEx = this.cfg.dhcpEx.filter(([x]) => x !== a[0]); };
  C["no ip dhcp excluded-address A.B.C.D A.B.C.D"] = function (a) { this.cfg.dhcpEx = this.cfg.dhcpEx.filter(([x, y]) => !(x === a[0] && y === a[1])); };
  C["ip dhcp pool <이름>"] = function (a) { if (!this.cfg.pools[a[0]]) this.cfg.pools[a[0]] = { net: null, mask: null, defaultRouter: null, dns: null, domain: null, lease: null }; this.mode = "dhcp"; this.ctx = { pool: a[0] }; };
  C["no ip dhcp pool <이름>"] = function (a) { delete this.cfg.pools[a[0]]; };
  C["ip nat pool <이름> A.B.C.D A.B.C.D netmask A.B.C.D"] = function (a) { this.cfg.natPools[a[0]] = { start: a[1], end: a[2], mask: a[3] }; };
  C["ip nat pool <이름> A.B.C.D A.B.C.D prefix-length <숫자>"] = function (a) { this.cfg.natPools[a[0]] = { start: a[1], end: a[2], mask: lenMask(+a[3]) }; };
  C["no ip nat pool <이름>"] = function (a) { delete this.cfg.natPools[a[0]]; };
  C["ip nat inside source static A.B.C.D A.B.C.D"] = function (a) { this.cfg.natStatic = this.cfg.natStatic.filter(s => s.local !== a[0]); this.cfg.natStatic.push({ local: a[0], global: a[1] }); };
  C["no ip nat inside source static A.B.C.D A.B.C.D"] = function (a) { this.cfg.natStatic = this.cfg.natStatic.filter(s => s.local !== a[0]); };
  const natDyn = (kind, ov) => function (a) { this.cfg.natDyn = this.cfg.natDyn.filter(d => d.list !== a[0]); this.cfg.natDyn.push({ list: a[0], iface: kind === "if" ? a[1] : null, pool: kind === "pool" ? a[1] : null, overload: ov }); };
  C["ip nat inside source list <이름> interface <인터페이스>"] = natDyn("if", false);
  C["ip nat inside source list <이름> pool <이름>"] = natDyn("pool", false);
  C["ip nat inside source list <이름> interface <인터페이스> overload"] = natDyn("if", true);
  C["ip nat inside source list <이름> pool <이름> overload"] = natDyn("pool", true);
  const natDel = function (a) { this.cfg.natDyn = this.cfg.natDyn.filter(d => d.list !== a[0]); this.rt.nat = []; };
  ["ip nat inside source list <이름> interface <인터페이스>", "ip nat inside source list <이름> pool <이름>", "ip nat inside source list <이름> interface <인터페이스> overload", "ip nat inside source list <이름> pool <이름> overload"].forEach(p => C["no " + p] = natDel);
  C["access-list <이름> <텍스트>"] = function (a, io) {
    const type = this.aclTypeByNumber(a[0]);
    if (!type) { io.out("% Invalid access list number (1-99, 100-199, 1300-1999, 2000-2699)\n"); return; }
    const words = a[1].split(/\s+/);
    const acl = this.cfg.acls[a[0]] || (this.cfg.acls[a[0]] = { type, entries: [] });
    if (words[0] === "remark") { acl.entries.push({ remark: words.slice(1).join(" "), seq: 0 }); return; }
    const e = this.parseAce(type, words);
    if (!e) { io.out("% Invalid input detected. 예: access-list 1 permit 192.168.1.0 0.0.0.255\n"); if (!acl.entries.length) delete this.cfg.acls[a[0]]; return; }
    e.seq = (acl.entries.filter(x => !x.remark).length + 1) * 10;
    e.text = this.aceText(type, e);
    acl.entries.push(e);
  };
  C["no access-list <이름>"] = function (a) { delete this.cfg.acls[a[0]]; };
  C["ip access-list standard <이름>"] = function (a) { const x = this.cfg.acls[a[0]]; if (!x) this.cfg.acls[a[0]] = { type: "standard", entries: [] }; this.mode = "nacl"; this.ctx = { acl: a[0], aclType: "standard" }; };
  C["ip access-list extended <이름>"] = function (a) { const x = this.cfg.acls[a[0]]; if (!x) this.cfg.acls[a[0]] = { type: "extended", entries: [] }; this.mode = "nacl"; this.ctx = { acl: a[0], aclType: "extended" }; };
  C["no ip access-list standard <이름>"] = C["no ip access-list extended <이름>"] = function (a) { delete this.cfg.acls[a[0]]; };
  R.aceText = function (type, e) {
    const ad = s => s.any ? "any" : s.host ? (type === "standard" ? s.host : "host " + s.host) : `${s.net}, wildcard bits ${s.wc}`.replace(", wildcard bits", type === "standard" ? ", wildcard bits" : "");
    const adx = s => s.any ? "any" : s.host ? "host " + s.host : `${s.net} ${s.wc}`;
    if (type === "standard") return `${e.action} ${e.src.any ? "any" : e.src.host ? e.src.host : e.src.net + ", wildcard bits " + e.src.wc}`;
    const pn = { 80: "www", 443: "443", 22: "22", 23: "telnet", 21: "ftp", 25: "smtp", 53: "domain" };
    return `${e.action} ${e.proto} ${adx(e.src)}${e.sport ? " eq " + e.sport : ""} ${adx(e.dst)}${e.dport ? " eq " + (pn[e.dport] || e.dport) : ""}${e.log ? " log" : ""}`;
  };
  Object.keys(C).forEach(k => { const f = C[k]; if (!/^(exit|end|do|interface|router|line|ip dhcp pool|ip access-list)/.test(k)) C[k] = markCfg(f); });

  // ── 인터페이스 모드 ──
  const I = H.if;
  I["ip address A.B.C.D <마스크>"] = needIfs(function (i, a, io) {
    const ml = maskLen(a[1]);
    if (ml < 0) { io.out("Bad mask /" + a[1] + " for address " + a[0] + "\n"); return; }
    if (ml < 31 && (netOf(a[0], a[1]) === a[0] || U.brdOf(a[0], a[1]) === a[0])) { io.out(`Bad mask /${ml} for address ${a[0]}\n`); return; }
    for (const n in this.cfg.ifs) { const o = this.cfg.ifs[n]; if (n !== i.name && o.ip && inNet(a[0], o.ip, o.mask) && !isLoop(n) && !isLoop(i.name)) { io.out(`% ${netOf(a[0], a[1])} overlaps with ${n}\n`); return; } }
    i.ip = a[0]; i.mask = a[1]; i.dhcp = false;
  });
  I["ip address dhcp"] = needIfs(function (i) { i.dhcp = true; i.ip = null; i.mask = null; });
  I["no ip address"] = I["no ip address dhcp"] = needIfs(function (i) { i.ip = null; i.mask = null; i.dhcp = false; });
  I["shutdown"] = needIfs(function (i) { i.shutdown = true; });
  I["no shutdown"] = needIfs(function (i) { i.shutdown = false; });
  I["description <텍스트>"] = needIfs(function (i, a) { i.desc = a[0]; });
  I["no description"] = needIfs(function (i) { i.desc = ""; });
  I["clock rate <숫자>"] = needIfs(function (i, a, io) { if (!i.name.startsWith("Serial")) { io.out("% Invalid input detected\n"); return; } if (i.name === "Serial0/0/0") io.out("This command applies only to DCE interfaces\n"); i.clockRate = +a[0]; });
  I["no clock rate"] = needIfs(function (i) { i.clockRate = null; });
  I["bandwidth <숫자>"] = needIfs(function (i, a) { i.bandwidth = +a[0]; });
  I["no bandwidth"] = needIfs(function (i) { i.bandwidth = null; });
  I["speed <이름>"] = needIfs(function (i, a) { i.speed = a[0]; });
  I["duplex <이름>"] = needIfs(function (i, a) { i.duplex = a[0]; });
  I["mtu <숫자>"] = needIfs(function (i, a) { i.mtu = +a[0]; });
  I["ip mtu <숫자>"] = needIfs(function (i, a) { i.ipmtu = +a[0]; });
  I["no mtu"] = needIfs(function (i) { i.mtu = null; });
  I["encapsulation hdlc"] = needIfs(function (i, a, io) { if (!i.name.startsWith("Serial")) { io.out("% Invalid input detected\n"); return; } i.encap = "hdlc"; });
  I["encapsulation ppp"] = needIfs(function (i, a, io) { if (!i.name.startsWith("Serial")) { io.out("% Invalid input detected\n"); return; } i.encap = "ppp"; });
  I["encapsulation dot1Q <숫자>"] = needIfs(function (i, a, io) { if (!i.name.includes(".")) { io.out("% Configuring IEEE 802.1Q encapsulation on the subinterface only\n"); return; } i.dot1q = +a[0]; });
  I["ip helper-address A.B.C.D"] = needIfs(function (i, a) { if (!i.helpers.includes(a[0])) i.helpers.push(a[0]); });
  I["no ip helper-address A.B.C.D"] = needIfs(function (i, a) { i.helpers = i.helpers.filter(x => x !== a[0]); });
  I["ip nat inside"] = needIfs(function (i) { i.natIn = true; i.natOut = false; });
  I["ip nat outside"] = needIfs(function (i) { i.natOut = true; i.natIn = false; });
  I["no ip nat inside"] = needIfs(function (i) { i.natIn = false; });
  I["no ip nat outside"] = needIfs(function (i) { i.natOut = false; });
  I["ip access-group <이름> <이름>"] = needIfs(function (i, a, io) { const d = a[1].toLowerCase(); if (d !== "in" && d !== "out") { io.out("% Invalid input detected\n"); return; } if (d === "in") i.accIn = a[0]; else i.accOut = a[0]; });
  I["no ip access-group <이름> <이름>"] = needIfs(function (i, a) { if (a[1].toLowerCase() === "in") i.accIn = null; else i.accOut = null; });
  I["ip ospf cost <숫자>"] = needIfs(function (i, a) { i.ospfCost = +a[0]; }); I["no ip ospf cost"] = needIfs(function (i) { i.ospfCost = null; });
  I["ip ospf hello-interval <숫자>"] = needIfs(function (i, a) { i.hello = +a[0]; }); I["no ip ospf hello-interval"] = needIfs(function (i) { i.hello = null; });
  I["ip ospf dead-interval <숫자>"] = needIfs(function (i, a) { i.dead = +a[0]; }); I["no ip ospf dead-interval"] = needIfs(function (i) { i.dead = null; });
  I["ip ospf priority <숫자>"] = needIfs(function (i, a) { i.ospfPri = +a[0]; }); I["no ip ospf priority"] = needIfs(function (i) { i.ospfPri = null; });
  I["ip ospf network point-to-point"] = needIfs(function (i) { i.ospfNet = "point-to-point"; });
  I["ip ospf network broadcast"] = needIfs(function (i) { i.ospfNet = "broadcast"; });
  I["no ip ospf network"] = needIfs(function (i) { i.ospfNet = null; });
  I["ip ospf <숫자> area <숫자>"] = needIfs(function (i, a) { i.ospfArea = { pid: a[0], area: a[1] }; if (!this.cfg.ospf[a[0]]) this.cfg.ospf[a[0]] = { rid: null, networks: [], passive: [], noPassive: [], passiveDefault: false, defaultOrig: null, refBw: null, logAdj: true, redistribute: [], maxPaths: null, distance: null }; });
  I["no ip ospf <숫자> area <숫자>"] = needIfs(function (i) { i.ospfArea = null; });
  const v6add = (kind) => needIfs(function (i, a, io) {
    let addr, len;
    if (kind === "ll") { if (!v6expand(a[0])) { io.out("% Invalid IPv6 address\n"); return; } addr = v6short(a[0]); len = 64; i.v6 = i.v6.filter(x => !x.ll); i.v6.push({ addr, len, ll: true }); return; }
    const p = parseV6Pfx(a[0]); if (!p) { io.out("% Invalid input detected. 예: ipv6 address 2001:DB8:1::1/64\n"); return; }
    addr = p.addr; len = p.len;
    if (kind === "eui") { const pre = v6expand(addr).split(":").slice(0, 4); addr = v6short(pre.concat(this.euiId(i.name)).join(":")); }
    i.v6 = i.v6.filter(x => x.ll || x.addr !== addr); i.v6.push({ addr, len });
  });
  I["ipv6 address <이름>"] = v6add("plain"); I["ipv6 address <이름> link-local"] = v6add("ll"); I["ipv6 address <이름> eui-64"] = v6add("eui");
  I["no ipv6 address"] = needIfs(function (i) { i.v6 = []; });
  I["no ipv6 address <이름>"] = needIfs(function (i, a) { const p = parseV6Pfx(a[0]); i.v6 = i.v6.filter(x => !p || x.addr !== p.addr); });
  I["ipv6 enable"] = needIfs(function (i) { i.v6enable = true; }); I["no ipv6 enable"] = needIfs(function (i) { i.v6enable = false; });
  I["ip proxy-arp"] = needIfs(function (i) { i.proxyArp = true; }); I["no ip proxy-arp"] = needIfs(function (i) { i.proxyArp = false; });
  I["cdp enable"] = needIfs(function (i) { i.cdp = true; }); I["no cdp enable"] = needIfs(function (i) { i.cdp = false; });
  Object.keys(I).forEach(k => { const f = I[k]; I[k] = markCfg(f); });

  // ── 라우팅 프로토콜 모드 ──
  const passiveFns = (getP) => ({
    "passive-interface <인터페이스>": function (a) { const p = getP.call(this); if (p.passiveDefault) p.noPassive = p.noPassive.filter(x => x !== a[0]); else if (!p.passive.includes(a[0])) p.passive.push(a[0]); },
    "no passive-interface <인터페이스>": function (a) { const p = getP.call(this); if (p.passiveDefault) { if (!p.noPassive.includes(a[0])) p.noPassive.push(a[0]); } else p.passive = p.passive.filter(x => x !== a[0]); },
    "passive-interface default": function () { const p = getP.call(this); p.passiveDefault = true; p.noPassive = []; },
    "no passive-interface default": function () { const p = getP.call(this); p.passiveDefault = false; p.passive = []; },
    "redistribute <이름>": function (a) { const p = getP.call(this); if (!p.redistribute.includes(a[0])) p.redistribute.push(a[0]); },
    "redistribute <이름> <텍스트>": function (a) { const p = getP.call(this); const v = a[0] + " " + a[1]; p.redistribute = p.redistribute.filter(x => x.split(" ")[0] !== a[0]); p.redistribute.push(v); },
    "no redistribute <이름>": function (a) { const p = getP.call(this); p.redistribute = p.redistribute.filter(x => x.split(" ")[0] !== a[0]); },
    "maximum-paths <숫자>": function (a) { getP.call(this).maxPaths = +a[0]; },
    "distance <숫자>": function (a) { getP.call(this).distance = +a[0]; }
  });
  const rp = function () { return this.cfg.rip; };
  Object.assign(H.rip, passiveFns(rp), {
    "version <숫자>": function (a, io) { if (a[0] !== "1" && a[0] !== "2") { io.out("% Invalid input detected\n"); return; } this.cfg.rip.version = +a[0]; },
    "no version": function () { this.cfg.rip.version = null; },
    "network A.B.C.D": function (a) { const n = classfulNet(a[0]); if (!this.cfg.rip.networks.includes(n)) this.cfg.rip.networks.push(n); },
    "no network A.B.C.D": function (a) { const n = classfulNet(a[0]); this.cfg.rip.networks = this.cfg.rip.networks.filter(x => x !== n); },
    "auto-summary": function () { this.cfg.rip.autoSummary = true; },
    "no auto-summary": function () { this.cfg.rip.autoSummary = false; },
    "default-information originate": function () { this.cfg.rip.defaultOrig = true; },
    "no default-information originate": function () { this.cfg.rip.defaultOrig = false; },
    "timers basic <숫자> <숫자> <숫자> <숫자>": function (a) { this.cfg.rip.timers = a.map(Number); },
    "no timers basic": function () { this.cfg.rip.timers = null; }
  });
  const op = function () { return this.cfg.ospf[this.ctx.pid]; };
  const wcOk = (net, wc) => { const w = ip2n(wc); return U.maskLen(n2ip(~w >>> 0)) >= 0; };
  Object.assign(H.ospf, passiveFns(op), {
    "network A.B.C.D <와일드카드> area <숫자>": function (a, io) { if (!wcOk(a[0], a[1])) { io.out("% OSPF: Invalid address/mask combination (discontiguous mask)\n"); return; } const p = op.call(this); const net = n2ip((ip2n(a[0]) & ~ip2n(a[1])) >>> 0); p.networks = p.networks.filter(x => !(x.net === net && x.wc === a[1])); p.networks.push({ net, wc: a[1], area: a[2] }); },
    "network A.B.C.D <와일드카드> area A.B.C.D": function (a, io) { H.ospf["network A.B.C.D <와일드카드> area <숫자>"].call(this, [a[0], a[1], a[2] === "0.0.0.0" ? "0" : a[2]], io); },
    "no network A.B.C.D <와일드카드> area <숫자>": function (a) { const p = op.call(this); const net = n2ip((ip2n(a[0]) & ~ip2n(a[1])) >>> 0); p.networks = p.networks.filter(x => !(x.net === net && x.wc === a[1])); },
    "router-id A.B.C.D": function (a, io) { op.call(this).rid = a[0]; if (Object.keys(this.cfg.ospf).length && this.ospfState() && this.ospfState().nbr) io.out("% OSPF: Reload or use \"clear ip ospf process\" command, for this to take effect\n"); },
    "no router-id": function () { op.call(this).rid = null; },
    "default-information originate": function () { op.call(this).defaultOrig = "normal"; },
    "default-information originate always": function () { op.call(this).defaultOrig = "always"; },
    "no default-information originate": function () { op.call(this).defaultOrig = null; },
    "auto-cost reference-bandwidth <숫자>": function (a, io) { op.call(this).refBw = +a[0]; io.out("% OSPF: Reference bandwidth is changed.\n        Please ensure reference bandwidth is consistent across all routers.\n"); },
    "log-adjacency-changes": function () { op.call(this).logAdj = true; },
    "no log-adjacency-changes": function () { op.call(this).logAdj = false; }
  });
  const ep = function () { return this.cfg.eigrp[this.ctx.as]; };
  Object.assign(H.eigrp, passiveFns(ep), {
    "network A.B.C.D": function (a) { const p = ep.call(this); const net = classfulNet(a[0]); if (!p.networks.some(x => x.net === net && !x.wc)) p.networks.push({ net, wc: null }); },
    "network A.B.C.D <와일드카드>": function (a, io) { if (!wcOk(a[0], a[1])) { io.out("% Invalid wildcard\n"); return; } const p = ep.call(this); const net = n2ip((ip2n(a[0]) & ~ip2n(a[1])) >>> 0); if (!p.networks.some(x => x.net === net && x.wc === a[1])) p.networks.push({ net, wc: a[1] }); },
    "no network A.B.C.D": function (a) { const p = ep.call(this); const net = classfulNet(a[0]); p.networks = p.networks.filter(x => !(x.net === net && !x.wc)); },
    "no network A.B.C.D <와일드카드>": function (a) { const p = ep.call(this); const net = n2ip((ip2n(a[0]) & ~ip2n(a[1])) >>> 0); p.networks = p.networks.filter(x => !(x.net === net && x.wc === a[1])); },
    "auto-summary": function () { ep.call(this).autoSummary = true; },
    "no auto-summary": function () { ep.call(this).autoSummary = false; },
    "eigrp router-id A.B.C.D": function (a) { ep.call(this).rid = a[0]; },
    "no eigrp router-id": function () { ep.call(this).rid = null; },
    "variance <숫자>": function (a) { ep.call(this).variance = +a[0]; }
  });
  ["rip", "ospf", "eigrp"].forEach(m => Object.keys(H[m]).forEach(k => { const f = H[m][k]; H[m][k] = markCfg(f); }));

  // ── 라인 모드 ──
  const L = H.line, ln = function () { return this.cfg.lines[this.ctx.line]; };
  L["password <이름>"] = function (a, io) { if (!minLenOk.call(this, a[0], io)) return; ln.call(this).password = a[0]; };
  L["password <숫자> <이름>"] = function (a, io) { if (a[0] === "0") return L["password <이름>"].call(this, [a[1]], io); io.out("% 암호화된 값을 직접 넣는 연습은 지원하지 않습니다.\n"); };
  L["no password"] = function () { ln.call(this).password = null; };
  L["login"] = function (a, io) { const l = ln.call(this); l.login = true; l.loginLocal = false; if (!l.password && this.ctx.line === "con") io.out("% Login disabled on line 0, until 'password' is set\n"); };
  L["login local"] = function () { const l = ln.call(this); l.loginLocal = true; l.login = false; };
  L["no login"] = function () { const l = ln.call(this); l.login = false; l.loginLocal = false; };
  L["logging synchronous"] = function () { ln.call(this).logSync = true; };
  L["no logging synchronous"] = function () { ln.call(this).logSync = false; };
  L["exec-timeout <숫자>"] = function (a) { ln.call(this).execTimeout = [+a[0], 0]; };
  L["exec-timeout <숫자> <숫자>"] = function (a) { ln.call(this).execTimeout = [+a[0], +a[1]]; };
  L["no exec-timeout"] = function () { ln.call(this).execTimeout = null; };
  L["privilege level <숫자>"] = function (a) { ln.call(this).priv = +a[0]; };
  L["no privilege level"] = function () { ln.call(this).priv = null; };
  L["history size <숫자>"] = function (a) { ln.call(this).history = +a[0]; };
  L["speed <숫자>"] = function () {};
  L["transport input <텍스트>"] = function (a, io) { if (this.ctx.line !== "vty") { io.out("% Invalid input detected\n"); return; } const v = a[0].toLowerCase().split(/\s+/); if (v.some(x => !["ssh", "telnet", "all", "none"].includes(x))) { io.out("% Invalid input detected\n"); return; } ln.call(this).transport = v.join(" "); };
  L["no transport input"] = function () { ln.call(this).transport = "all"; };
  L["transport output <텍스트>"] = function () {};
  L["access-class <이름> <이름>"] = function (a, io) { if (a[1].toLowerCase() !== "in" && a[1].toLowerCase() !== "out") { io.out("% Invalid input detected\n"); return; } ln.call(this).acc = a[0]; };
  L["no access-class <이름> <이름>"] = function () { ln.call(this).acc = null; };
  Object.keys(L).forEach(k => { const f = L[k]; L[k] = markCfg(f); });

  // ── DHCP 풀 ──
  const D = H.dhcp, pl = function () { return this.cfg.pools[this.ctx.pool]; };
  D["network A.B.C.D <마스크>"] = function (a, io) { if (maskLen(a[1]) < 0) { io.out("% Invalid mask\n"); return; } const p = pl.call(this); p.net = netOf(a[0], a[1]); p.mask = a[1]; };
  D["network A.B.C.D"] = function (a, io) { const l = U.classfulLen(a[0]); D["network A.B.C.D <마스크>"].call(this, [a[0], lenMask(l)], io); };
  D["no network"] = function () { const p = pl.call(this); p.net = null; p.mask = null; };
  D["default-router <텍스트>"] = function (a, io) { const ip = a[0].split(/\s+/)[0]; if (!isIp(ip)) { io.out("% Invalid input detected\n"); return; } pl.call(this).defaultRouter = ip; };
  D["no default-router"] = function () { pl.call(this).defaultRouter = null; };
  D["dns-server <텍스트>"] = function (a, io) { const v = a[0].split(/\s+/); if (!v.every(isIp)) { io.out("% Invalid input detected\n"); return; } pl.call(this).dns = v.join(" "); };
  D["no dns-server"] = function () { pl.call(this).dns = null; };
  D["domain-name <이름>"] = function (a) { pl.call(this).domain = a[0]; };
  D["lease <숫자>"] = function (a) { pl.call(this).lease = [+a[0], 0, 0]; };
  D["lease <숫자> <숫자>"] = function (a) { pl.call(this).lease = [+a[0], +a[1], 0]; };
  D["lease <숫자> <숫자> <숫자>"] = function (a) { pl.call(this).lease = a.map(Number); };
  D["lease infinite"] = function () { pl.call(this).lease = "infinite"; };
  Object.keys(D).forEach(k => { const f = D[k]; D[k] = markCfg(f); });

  // ── 이름 있는 ACL ──
  const N = H.nacl, al = function () { return this.cfg.acls[this.ctx.acl]; };
  const naclAdd = function (seq, words, io) {
    const a = al.call(this);
    if (words[0] === "remark") { a.entries.push({ remark: words.slice(1).join(" "), seq: 0 }); return; }
    const e = this.parseAce(a.type, words);
    if (!e) { io.out(a.type === "extended" ? "% Invalid input detected. 예: deny ip host 192.168.1.20 172.16.0.0 0.0.0.255\n" : "% Invalid input detected. 예: permit host 192.168.1.10\n"); return; }
    const real = a.entries.filter(x => !x.remark);
    e.seq = seq || (real.length ? Math.max(...real.map(x => x.seq)) + 10 : 10);
    if (real.some(x => x.seq === e.seq)) { io.out("% Duplicate sequence number\n"); return; }
    e.text = this.aceText(a.type, e);
    a.entries.push(e); a.entries.sort((x, y) => (x.remark ? -1 : 0) || (x.seq - y.seq));
  };
  N["permit <텍스트>"] = function (a, io) { naclAdd.call(this, null, ("permit " + a[0]).split(/\s+/), io); };
  N["deny <텍스트>"] = function (a, io) { naclAdd.call(this, null, ("deny " + a[0]).split(/\s+/), io); };
  N["<숫자> <텍스트>"] = function (a, io) { naclAdd.call(this, +a[0], a[1].split(/\s+/), io); };
  N["remark <텍스트>"] = function (a) { al.call(this).entries.push({ remark: a[0], seq: 0 }); };
  N["no <숫자>"] = function (a) { const x = al.call(this); x.entries = x.entries.filter(e => e.remark || e.seq !== +a[0]); };
  N["no permit <텍스트>"] = function (a) { const x = al.call(this); x.entries = x.entries.filter(e => e.remark || !(e.action === "permit" && e.text.endsWith(a[0]))); };
  N["no deny <텍스트>"] = function (a) { const x = al.call(this); x.entries = x.entries.filter(e => e.remark || !(e.action === "deny" && e.text.endsWith(a[0]))); };
  Object.keys(N).forEach(k => { const f = N[k]; N[k] = markCfg(f); });

  // ───────────── running-config 만들기 ─────────────
  R.pwOut = function (c, pw) { return c.pwEnc ? "7 " + U.type7(pw) : pw; };
  R.ifBlock = function (c, n) {
    const i = c.ifs[n]; let t = `interface ${n}\n`;
    if (i.desc) t += ` description ${i.desc}\n`;
    if (i.dot1q) t += ` encapsulation dot1Q ${i.dot1q}\n`;
    if (i.bandwidth) t += ` bandwidth ${i.bandwidth}\n`;
    if (i.dhcp) t += " ip address dhcp\n"; else if (i.ip) t += ` ip address ${i.ip} ${i.mask}\n`; else t += " no ip address\n";
    i.helpers.forEach(h => t += ` ip helper-address ${h}\n`);
    if (i.ipmtu) t += ` ip mtu ${i.ipmtu}\n`;
    if (i.accIn) t += ` ip access-group ${i.accIn} in\n`;
    if (i.accOut) t += ` ip access-group ${i.accOut} out\n`;
    if (!i.proxyArp) t += " no ip proxy-arp\n";
    if (i.natIn) t += " ip nat inside\n"; if (i.natOut) t += " ip nat outside\n";
    if (i.hello) t += ` ip ospf hello-interval ${i.hello}\n`;
    if (i.dead) t += ` ip ospf dead-interval ${i.dead}\n`;
    if (i.ospfNet) t += ` ip ospf network ${i.ospfNet}\n`;
    if (i.ospfPri !== null) t += ` ip ospf priority ${i.ospfPri}\n`;
    if (i.ospfCost) t += ` ip ospf cost ${i.ospfCost}\n`;
    if (i.ospfArea) t += ` ip ospf ${i.ospfArea.pid} area ${i.ospfArea.area}\n`;
    if (n.startsWith("Serial") && i.encap === "ppp") t += " encapsulation ppp\n";
    if (i.mtu) t += ` mtu ${i.mtu}\n`;
    if (n.startsWith("Gig") && !n.includes(".")) t += ` duplex ${i.duplex}\n speed ${i.speed}\n`;
    if (i.clockRate) t += ` clock rate ${i.clockRate}\n`;
    if (!i.cdp) t += " no cdp enable\n";
    i.v6.forEach(a => t += ` ipv6 address ${a.addr}${a.ll ? " link-local" : "/" + a.len}\n`);
    if (i.v6enable) t += " ipv6 enable\n";
    if (i.shutdown) t += " shutdown\n";
    return t + "!\n";
  };
  R.buildConfig = function (c, running) {
    let t = "";
    const add = s => t += s + "\n";
    add("!"); add("version 15.4"); add("service timestamps debug datetime msec"); add("service timestamps log datetime msec");
    add(c.pwEnc ? "service password-encryption" : "no service password-encryption"); add("!"); add(`hostname ${c.hostname}`); add("!");
    add("boot-start-marker"); add("boot-end-marker"); add("!");
    if (c.minLen) add(`security passwords min-length ${c.minLen}`);
    if (c.enableSecret) add(`enable secret ${c.enableSecret.alg === 9 ? "9 " + U.type9(c.enableSecret.pw) : "5 " + U.type5(c.enableSecret.pw)}`);
    if (c.enablePassword) add(`enable password ${this.pwOut(c, c.enablePassword)}`);
    add("!"); add("no aaa new-model"); add("!");
    if (c.tz) add(`clock timezone ${c.tz.name} ${c.tz.h}${c.tz.m ? " " + c.tz.m : ""} 0`);
    c.dhcpEx.forEach(([a, b]) => add(`ip dhcp excluded-address ${a}${b && b !== a ? " " + b : ""}`));
    if (c.dhcpEx.length) add("!");
    for (const [n, p] of Object.entries(c.pools)) { add(`ip dhcp pool ${n}`); if (p.net) add(` network ${p.net} ${p.mask}`); if (p.defaultRouter) add(` default-router ${p.defaultRouter}`); if (p.dns) add(` dns-server ${p.dns}`); if (p.domain) add(` domain-name ${p.domain}`); if (p.lease) add(` lease ${p.lease === "infinite" ? "infinite" : p.lease.join(" ")}`); add("!"); }
    if (!c.domainLookup) add("no ip domain lookup");
    if (c.domainName) add(`ip domain name ${c.domainName}`);
    for (const [h, ip] of Object.entries(c.hosts)) add(`ip host ${h} ${ip}`);
    if (c.nameServers.length) add(`ip name-server ${c.nameServers.join(" ")}`);
    add("ip cef"); if (c.v6routing) add("ipv6 unicast-routing"); add("no ipv6 cef"); add("!");
    if (c.loginBlock) add(`login block-for ${c.loginBlock.secs} attempts ${c.loginBlock.tries} within ${c.loginBlock.within}`);
    if (c.loginLog.success) add("login on-success log"); if (c.loginLog.failure) add("login on-failure log");
    add("multilink bundle-name authenticated"); add("!");
    if (!c.cdp) add("no cdp run");
    for (const [u, x] of Object.entries(c.users)) add(`username ${u}${x.priv !== 1 ? " privilege " + x.priv : ""} ${x.kind === "secret" ? "secret " + (x.alg === 9 ? "9 " + U.type9(x.pw) : "5 " + U.type5(x.pw)) : "password " + this.pwOut(c, x.pw)}`);
    if (Object.keys(c.users).length) add("!");
    if (c.sshVersion) add(`ip ssh version ${c.sshVersion}`);
    if (c.sshTimeout !== 120) add(`ip ssh time-out ${c.sshTimeout}`);
    if (c.sshRetries !== 3) add(`ip ssh authentication-retries ${c.sshRetries}`);
    if (c.lldp) add("lldp run");
    add("!");
    const order = n => (n.startsWith("Loop") ? 0 : n.startsWith("Gig") ? 1 : 2);
    Object.keys(c.ifs).sort((a, b) => order(a) - order(b) || a.localeCompare(b, "en", { numeric: true })).forEach(n => t += this.ifBlock(c, n));
    for (const [as, p] of Object.entries(c.eigrp)) { add(`router eigrp ${as}`); p.networks.forEach(x => add(` network ${x.net}${x.wc ? " " + x.wc : ""}`)); if (p.passiveDefault) add(" passive-interface default"); p.passive.forEach(x => add(` passive-interface ${x}`)); p.noPassive.forEach(x => add(` no passive-interface ${x}`)); if (p.variance) add(` variance ${p.variance}`); p.redistribute.forEach(x => add(` redistribute ${x}`)); if (p.maxPaths) add(` maximum-paths ${p.maxPaths}`); if (p.distance) add(` distance ${p.distance}`); if (p.autoSummary) add(" auto-summary"); if (p.rid) add(` eigrp router-id ${p.rid}`); add("!"); }
    for (const [pid, p] of Object.entries(c.ospf)) { add(`router ospf ${pid}`); if (p.rid) add(` router-id ${p.rid}`); if (p.refBw) add(` auto-cost reference-bandwidth ${p.refBw}`); if (!p.logAdj) add(" no log-adjacency-changes"); if (p.passiveDefault) add(" passive-interface default"); p.passive.forEach(x => add(` passive-interface ${x}`)); p.noPassive.forEach(x => add(` no passive-interface ${x}`)); p.networks.forEach(x => add(` network ${x.net} ${x.wc} area ${x.area}`)); if (p.defaultOrig) add(` default-information originate${p.defaultOrig === "always" ? " always" : ""}`); p.redistribute.forEach(x => add(` redistribute ${x}`)); if (p.maxPaths) add(` maximum-paths ${p.maxPaths}`); if (p.distance) add(` distance ${p.distance}`); add("!"); }
    if (c.rip) { const p = c.rip; add("router rip"); if (p.version) add(` version ${p.version}`); if (p.timers) add(` timers basic ${p.timers.join(" ")}`); if (p.passiveDefault) add(" passive-interface default"); p.passive.forEach(x => add(` passive-interface ${x}`)); p.noPassive.forEach(x => add(` no passive-interface ${x}`)); p.networks.forEach(x => add(` network ${x}`)); if (p.defaultOrig) add(" default-information originate"); p.redistribute.forEach(x => add(` redistribute ${x}`)); if (p.maxPaths) add(` maximum-paths ${p.maxPaths}`); if (p.distance) add(` distance ${p.distance}`); if (p.autoSummary === false) add(" no auto-summary"); add("!"); }
    add("ip forward-protocol nd"); add("!"); add("no ip http server"); add("no ip http secure-server"); add("!");
    for (const [n, p] of Object.entries(c.natPools)) add(`ip nat pool ${n} ${p.start} ${p.end} netmask ${p.mask}`);
    c.natDyn.forEach(d => add(`ip nat inside source list ${d.list} ${d.iface ? "interface " + d.iface : "pool " + d.pool}${d.overload ? " overload" : ""}`));
    c.natStatic.forEach(s => add(`ip nat inside source static ${s.local} ${s.global}`));
    c.routes.forEach(r => add(`ip route ${r.net} ${r.mask} ${r.nh || r.iface}${r.ad !== 1 ? " " + r.ad : ""}`));
    add("!");
    for (const [n, a] of Object.entries(c.acls)) {
      if (/^\d+$/.test(n)) continue;
      add(`ip access-list ${a.type} ${n}`);
      a.entries.forEach(e => add(e.remark ? ` remark ${e.remark}` : ` ${e.text.replace(/^(permit|deny)/, m => m === "deny" ? "deny  " : m)}`.replace("deny   ", "deny   ")));
      add("!");
    }
    for (const [n, a] of Object.entries(c.acls)) {
      if (!/^\d+$/.test(n)) continue;
      a.entries.forEach(e => add(e.remark ? `access-list ${n} remark ${e.remark}` : `access-list ${n} ${e.action} ${a.type === "standard" ? (e.src.any ? "any" : e.src.host ? e.src.host : e.src.net + " " + e.src.wc) : e.text.replace(/^(permit|deny)\s+/, "")}`));
    }
    if (c.logBuffered !== null) add(`logging buffered ${c.logBuffered}`);
    if (!c.logConsole) add("no logging console");
    if (c.logTrap) add(`logging trap ${c.logTrap}`);
    c.logHosts.forEach(h => add(`logging host ${h}`));
    c.v6routes.forEach(r => add(`ipv6 route ${r.pfx}/${r.len} ${r.nh}`));
    add("!"); add("control-plane"); add("!");
    for (const k of ["motd", "login", "exec"]) if (c.banners[k]) add(`banner ${k} ^C${c.banners[k]}^C`);
    add("!");
    const lineCfg = (l, isVty) => { if (l.acc) add(` access-class ${l.acc} in`); if (l.execTimeout) add(` exec-timeout ${l.execTimeout.join(" ")}`); if (l.priv !== null) add(` privilege level ${l.priv}`); if (l.password) add(` password ${this.pwOut(c, l.password)}`); if (l.logSync) add(" logging synchronous"); if (l.loginLocal) add(" login local"); else if (l.login && (isVty || l.password)) add(" login"); else if (l.login) add(" login"); if (isVty && l.transport !== "all") add(` transport input ${l.transport}`); };
    add("line con 0"); lineCfg(c.lines.con, false); add("line aux 0"); add("line 2"); add(" no activation-character"); add(" no exec"); add(" transport preferred none"); add(" stopbits 1");
    add("line vty 0 4"); lineCfg(c.lines.vty, true);
    add("!"); add("scheduler allocate 20000 1000"); for (const n of c.ntp) add(`ntp server ${n}`); add("!"); add("end");
    const body = t;
    return running ? `Current configuration : ${body.length} bytes\n` + body : body;
  };

  // ───────────── 부팅 · ROMMON ─────────────
  R.boot = async function (io, opts = {}) {
    this.state = "boot"; this.mode = "user"; this.ctx = {};
    this.rt = this.freshRuntime(); this.prevSnap = null;
    if (this._dbgTimer) { clearTimeout(this._dbgTimer); this._dbgTimer = null; }
    this.breakable = true; this.breakHit = false;
    const lines = [
      "System Bootstrap, Version 15.0(1r)M15, RELEASE SOFTWARE (fc1)", "Technical Support: http://www.cisco.com/techsupport",
      "Copyright (c) 2011 by cisco Systems, Inc.", "", "Total memory size = 512 MB - On-board = 512 MB, DIMM0 = 0 MB",
      "CISCO2911/K9 platform with 524288 Kbytes of main memory", "Main memory is configured to 72/-1(On-board/DIMM0) bit mode with ECC disabled", "",
      "Readonly ROMMON initialized", "", "program load complete, entry point: 0x80803000, size: 0x1b340", ""
    ];
    for (const l of lines) { if (this.breakHit) break; io.out(l + "\n"); await sleep(opts.fast ? 0 : 160); }
    for (let k = 0; k < 8 && !this.breakHit; k++) await sleep(opts.fast ? 0 : 150);
    if (this.breakHit) {
      this.breakable = false;
      this.state = "rommon"; this.romCount = 1;
      io.out("\nmonitor: command \"boot\" aborted due to user interrupt\n");
      this.ev("rommon"); this.emit("change");
      return;
    }
    this.breakable = false;
    io.out("IOS Image Load Test \n___________________\nDigitally Signed Release Software\nprogram load complete, entry point: 0x80803000, size: 0x1b340\n");
    io.out("Self decompressing the image : ");
    for (let k = 0; k < 24; k++) { io.raw("#"); await sleep(opts.fast ? 0 : 40); }
    io.out(" [OK]\n\n              Restricted Rights Legend\n\nCisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.4(3)M2, RELEASE SOFTWARE (fc2)\nTechnical Support: http://www.cisco.com/techsupport\nCopyright (c) 1986-2015 by Cisco Systems, Inc.\n\nCisco CISCO2911/K9 (revision 1.0) with 491520K/32768K bytes of memory.\nProcessor board ID FTX1840ABCD\n3 Gigabit Ethernet interfaces\n2 Serial(sync/async) interfaces\n255K bytes of non-volatile configuration memory.\n\n");
    this.bootReg = this.cfg.configReg;
    const ignore = this.bootReg.toLowerCase() === "0x2142";
    const reg = this.bootReg;
    if (this.startup && !ignore) { this.cfg = clone(this.startup); this.cfg.configReg = reg; }
    else { const keep = this.cfg.configReg; this.cfg = U.factoryConfig(); this.cfg.configReg = keep; }
    await sleep(opts.fast ? 0 : 300);
    if (ignore && this.startup) this.ev("bootignore");
    if (!this.startup || ignore) {
      io.out("\n         --- System Configuration Dialog ---\n\n");
      for (let k = 0; k < 5; k++) {
        const a = (await io.ask("Would you like to enter the initial configuration dialog? [yes/no]: ")).trim().toLowerCase();
        if (a.startsWith("n")) break;
        if (a.startsWith("y")) { io.out("\n% 이 연습장에서는 설정 대화상자를 지원하지 않습니다. no 로 건너뛰세요.\n\n"); continue; }
        io.out("% Please answer 'yes' or 'no'.\n");
      }
      if (ignore) this.ev("bootnostartup");
    }
    this.prevSnap = this.snapshot();
    this.state = "pressReturn";
    io.out(`\nPress RETURN to get started!\n\n`);
    setTimeout(() => {
      for (const n of this.ifaceNames()) { const i = this.iface(n); if (!i.shutdown && !n.includes(".")) {} }
    }, 0);
    this.emit("change");
  };
  R.sendBreak = function () { if (this.state === "boot" && this.breakable) { this.breakHit = true; return true; } return false; };
  R.romCmd = async function (line, io) {
    if (!line) { this.romCount++; return; }
    const p = S.parse("rommon", line);
    if (p.error) { io.out(`monitor: command "${line.split(/\s+/)[0]}" not found\n`); this.romCount++; return; }
    if (p.pat === "confreg <이름>") {
      if (!/^0x[0-9a-f]{1,4}$/i.test(p.args[0])) { io.out("Invalid value\n"); this.romCount++; return; }
      this.cfg.configReg = "0x" + p.args[0].slice(2).padStart(4, "0").toLowerCase();
      io.out("\nYou must reset or power cycle for new config to take effect\n");
      if (this.cfg.configReg === "0x2142") this.ev("confreg2142");
    } else if (p.pat === "confreg") io.out(`\n    Configuration Summary\n(Virtual Configuration Register: ${this.cfg.configReg})\nenabled are:\nload rom after netboot fails\nconsole baud: 9600\nboot: image specified by the boot system commands\n      or default to: cisco2-C2900\n\n`);
    else if (p.pat === "reset" || p.pat === "boot") { if (this.cfg.configReg === "0x2142") this.ev("reset2142"); this.emit("reboot"); return; }
    else if (p.pat === "help") io.out("alias               set and display aliases command\nboot                boot up an external process\nconfreg             configuration register utility\ndir                 list files in file system\nhelp                monitor builtin command help\nreset               system reset\n");
    else if (p.pat === "dir <이름>") io.out("program load complete, entry point: 0x80803000, size: 0x1b340\nDirectory of flash0:\n\n    2  106219128 -rw-     c2900-universalk9-mz.SPA.154-3.M2.bin\n");
    this.romCount++;
    this.emit("change");
  };
})();
