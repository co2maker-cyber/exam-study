/* 라우터 콘솔 연습장 — 실습별 시작 상태와 자동 체크 */
(function () {
  "use strict";
  const W = window.RouterSim.W;

  const BASE = ["hostname R1",
    "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown",
    "interface s0/0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown",
    "interface g0/1", "ip address 203.0.113.2 255.255.255.252", "no shutdown", "exit"];
  const OSPF = ["interface loopback 0", "ip address 1.1.1.1 255.255.255.255", "exit",
    "router ospf 1", "router-id 1.1.1.1", "network 10.0.0.0 0.0.0.3 area 0", "network 192.168.1.0 0.0.0.255 area 0", "network 1.1.1.1 0.0.0.0 area 0", "passive-interface g0/0", "exit",
    "ip route 0.0.0.0 0.0.0.0 203.0.113.1"];
  const PAT = ["access-list 1 permit 192.168.1.0 0.0.0.255", "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside", "exit", "ip nat inside source list 1 interface g0/1 overload"];
  const LOST_SECRET = "Xq7!nobody-knows";

  const ifc = (s, n) => s.iface(n) || {};
  const isIf = (s, n, ip, mask) => { const i = ifc(s, n); return i.ip === ip && i.mask === mask && !i.shutdown; };
  const route = (s, net, mask, pred) => s.cfg.routes.some(r => r.net === net && r.mask === mask && (!pred || pred(r)));
  const pc = (s, id) => (s._pcCache || s.pcChecks()).find(x => x.id === id) || {};
  const ev = (s, e) => s.events.has(e);
  const saved = s => !!s.startup && !s.isDirty();
  const ospfAny = s => Object.values(s.cfg.ospf);
  const stmtCovers = (s, ip, area) => ospfAny(s).some(p => p.networks.some(n => window.RouterSim.util.wcMatch(ip, n.net, n.wc) && String(n.area) === String(area)));
  const permits = (s, acl, src, dst, proto, port) => s.aclEvalSilent(acl, { src, dst: dst || "8.8.8.8", proto: proto || "icmp", port });

  const LABS = {
    1: { preset: [], save: false, checks: [
      s => s.cfg.hostname === "R1",
      s => !!s.cfg.enableSecret && s.cfg.enableSecret.pw === "class",
      s => s.cfg.lines.con.password === "cisco" && (s.cfg.lines.con.login || s.cfg.lines.con.loginLocal),
      s => !!s.cfg.banners.motd,
      s => s.cfg.pwEnc,
      s => saved(s)] },
    2: { preset: ["hostname R1"], save: true, checks: [
      s => isIf(s, "GigabitEthernet0/0", "192.168.1.1", "255.255.255.0"),
      s => !!ifc(s, "GigabitEthernet0/0").desc,
      s => isIf(s, "Serial0/0/0", "10.0.0.1", "255.255.255.252"),
      s => isIf(s, "GigabitEthernet0/1", "203.0.113.2", "255.255.255.252"),
      s => ev(s, "show:ip interface brief"),
      s => ev(s, "ping:192.168.1.10:ok"),
      s => ev(s, "ping:10.0.0.2:ok")] },
    3: { preset: BASE, save: true, checks: [
      s => ev(s, "ping:172.16.0.1:fail"),
      s => route(s, "172.16.0.0", "255.255.255.0", r => r.nh === "10.0.0.2" && r.ad === 1),
      s => ev(s, "showroute:S"),
      s => ev(s, "ping:172.16.0.1:ok"),
      s => route(s, "0.0.0.0", "0.0.0.0", r => r.nh === W.isp),
      s => ev(s, "ping:8.8.8.8:ok"),
      s => route(s, "172.16.0.0", "255.255.255.0", r => r.ad === 200 && (r.nh === W.isp || r.iface === "GigabitEthernet0/1"))] },
    4: { preset: BASE, save: true, checks: [
      s => !!s.cfg.rip && s.cfg.rip.version === 2,
      s => !!s.cfg.rip && s.cfg.rip.networks.includes("192.168.1.0") && s.cfg.rip.networks.includes("10.0.0.0"),
      s => !!s.cfg.rip && s.cfg.rip.autoSummary === false,
      s => !!s.cfg.rip && (s.cfg.rip.passive.includes("GigabitEthernet0/0") || (s.cfg.rip.passiveDefault && !s.cfg.rip.noPassive.includes("GigabitEthernet0/0"))),
      s => s.rib().some(r => r.code === "R" && r.net === "172.16.0.0"),
      s => pc(s, "pc1-srv").ok] },
    5: { preset: BASE, save: true, checks: [
      s => isIf(s, "Loopback0", "1.1.1.1", "255.255.255.255"),
      s => ospfAny(s).some(p => p.rid === "1.1.1.1"),
      s => stmtCovers(s, "10.0.0.1", 0),
      s => stmtCovers(s, "192.168.1.1", 0) && ospfAny(s).some(p => p.passive.includes("GigabitEthernet0/0") || p.passiveDefault),
      s => ev(s, "ospfnbr:full"),
      s => ev(s, "ping:2.2.2.2:ok"),
      s => ev(s, "pingsrc:172.16.0.1:Loopback0:ok")] },
    6: { preset: BASE, save: true, checks: [
      s => !!s.cfg.eigrp["100"],
      s => { const p = s.cfg.eigrp["100"]; return !!p && p.networks.some(n => n.wc && window.RouterSim.util.wcMatch("10.0.0.1", n.net, n.wc)) && p.networks.some(n => n.wc && window.RouterSim.util.wcMatch("192.168.1.1", n.net, n.wc)); },
      s => { const p = s.cfg.eigrp["100"]; return !!p && !p.autoSummary && p.rid === "1.1.1.1"; },
      s => ev(s, "eigrpnbr:up"),
      s => ev(s, "showroute:D"),
      s => pc(s, "pc1-srv").ok] },
    7: { preset: ["hostname R1", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface s0/0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown", "interface g0/1", "no shutdown", "exit"], save: true, checks: [
      s => s.cfg.dhcpEx.some(([a, b]) => a === "192.168.1.1" && (b || a) === "192.168.1.20"),
      s => !!s.cfg.pools.LAN && s.cfg.pools.LAN.net === "192.168.1.0" && s.cfg.pools.LAN.mask === "255.255.255.0",
      s => !!s.cfg.pools.LAN && s.cfg.pools.LAN.defaultRouter === "192.168.1.1" && (s.cfg.pools.LAN.dns || "").split(" ").includes("8.8.8.8"),
      s => !!s.rt.pc3,
      s => ev(s, "dhcpbinding"),
      s => ifc(s, "GigabitEthernet0/1").dhcp] },
    8: { preset: BASE.concat(OSPF), save: true, checks: [
      s => ev(s, "why:pc1-inet") || pc(s, "pc1-inet").ok,
      s => !!s.cfg.acls["1"] && permits(s, "1", W.pc1) && permits(s, "1", W.pc2),
      s => ifc(s, "GigabitEthernet0/0").natIn && ifc(s, "GigabitEthernet0/1").natOut,
      s => s.cfg.natDyn.some(d => d.list === "1" && d.iface === "GigabitEthernet0/1" && d.overload),
      s => pc(s, "pc1-inet").ok && pc(s, "pc2-inet").ok,
      s => ev(s, "nattrans"),
      s => s.cfg.natStatic.some(x => x.local === W.pc1 && x.global === "198.51.100.5")] },
    9: { preset: BASE.concat(OSPF, PAT), save: true, checks: [
      s => !!s.cfg.acls["BLOCK-PC2"] && s.cfg.acls["BLOCK-PC2"].type === "extended",
      s => !!s.cfg.acls["BLOCK-PC2"] && !permits(s, "BLOCK-PC2", W.pc2, W.srv) && permits(s, "BLOCK-PC2", W.pc1, W.srv) && permits(s, "BLOCK-PC2", W.pc2, "8.8.8.8"),
      s => ifc(s, "GigabitEthernet0/0").accIn === "BLOCK-PC2",
      s => !pc(s, "pc2-srv").ok && pc(s, "pc1-srv").ok && ifc(s, "GigabitEthernet0/0").accIn,
      s => pc(s, "pc2-inet").ok && !!ifc(s, "GigabitEthernet0/0").accIn,
      s => ev(s, "aclhits")] },
    10: { preset: BASE.concat(OSPF), save: true, checks: [
      s => !s.cfg.domainLookup,
      s => s.cfg.lines.con.logSync && !!s.cfg.lines.con.execTimeout && s.cfg.lines.con.execTimeout[0] === 5 && s.cfg.lines.con.execTimeout[1] === 0,
      s => (s.cfg.hosts.SRV || s.cfg.hosts.srv) === "172.16.0.10" && ev(s, "ping:SRV:ok"),
      s => s.cfg.logBuffered !== null && ev(s, "showlog:buf"),
      s => !!s.cfg.tz && s.cfg.tz.name.toUpperCase() === "KST" && s.cfg.tz.h === 9,
      s => ev(s, "termlen0"),
      s => ev(s, "pipe:run"),
      s => ev(s, "tftp:ok")] },
    11: { preset: BASE.concat(OSPF), save: true, checks: [
      s => s.cfg.domainName === "lab.local",
      s => !!s.cfg.users.admin && s.cfg.users.admin.priv === 15 && s.cfg.users.admin.kind === "secret",
      s => s.cfg.rsaBits >= 1024,
      s => s.cfg.sshVersion === 2,
      s => s.cfg.lines.vty.loginLocal && s.cfg.lines.vty.transport === "ssh",
      s => { const a = s.cfg.lines.vty.acc; return !!a && permits(s, a, W.pc1, W.gw, "tcp", 22) && !permits(s, a, W.pc2, W.gw, "tcp", 22); },
      s => pc(s, "pc1-ssh").ok,
      s => saved(s) && pc(s, "pc1-ssh").ok] },
    12: { preset: BASE, save: true, checks: [
      s => s.cfg.v6routing,
      s => ifc(s, "GigabitEthernet0/0").v6 && ifc(s, "GigabitEthernet0/0").v6.some(a => a.addr === "2001:DB8:1::1" && a.len === 64),
      s => ifc(s, "Serial0/0/0").v6 && ifc(s, "Serial0/0/0").v6.some(a => a.addr === "2001:DB8:12::1" && a.len === 64),
      s => ev(s, "show:ipv6 interface brief"),
      s => ev(s, "ping6:2001:DB8:12::2:ok"),
      s => s.cfg.v6routes.some(r => r.pfx === "2001:DB8:172::" && r.len === 64 && r.nh === "2001:DB8:12::2"),
      s => ev(s, "ping6:2001:DB8:172::10:ok") && pc(s, "pc1-v6").ok] },
    13: { preset: ["hostname R1",
      "interface loopback 0", "ip address 1.1.1.1 255.255.255.255",
      "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "shutdown",
      "interface s0/0/0", "ip address 10.0.0.5 255.255.255.252", "encapsulation ppp", "ip ospf hello-interval 5", "no shutdown",
      "interface g0/1", "ip address 203.0.113.2 255.255.255.0", "no shutdown", "exit",
      "router ospf 1", "router-id 1.1.1.1", "network 10.0.0.0 0.0.0.3 area 0", "network 192.168.1.0 0.0.0.255 area 0", "network 1.1.1.1 0.0.0.0 area 0", "passive-interface g0/0", "exit",
      "ip route 0.0.0.0 0.0.0.0 203.0.113.5"], save: true, checks: [
      s => pc(s, "pc1-gw").ok,
      s => s.r1Reach(W.r2s).ok,
      s => { const o = s.ospfState(); return !!(o && o.nbr); },
      s => ifc(s, "GigabitEthernet0/1").ip === W.r1wan && ifc(s, "GigabitEthernet0/1").mask === "255.255.255.252",
      s => s.r1Reach("8.8.8.8").ok,
      s => pc(s, "pc1-srv").ok,
      s => saved(s) && pc(s, "pc1-srv").ok] },
    14: { preset: BASE.concat(OSPF, PAT, ["enable secret " + LOST_SECRET]), save: true, checks: [
      s => ev(s, "rommon"),
      s => ev(s, "reset2142"),
      s => ev(s, "bootnostartup"),
      s => ev(s, "copystartrun"),
      s => !!s.cfg.enableSecret && s.cfg.enableSecret.pw !== LOST_SECRET && ev(s, "copystartrun"),
      s => s.cfg.configReg === "0x2102" && ev(s, "copystartrun"),
      s => ["GigabitEthernet0/0", "GigabitEthernet0/1", "Serial0/0/0"].every(n => !ifc(s, n).shutdown) && ev(s, "copystartrun"),
      s => saved(s) && !!s.startup.enableSecret && s.startup.enableSecret.pw !== LOST_SECRET && s.startup.configReg === "0x2102"] },
    0: { preset: [], save: false, checks: [] }
  };

  // 시작 상태 만들기: 실제 명령을 조용히 실행해 설정을 쌓는다
  async function buildLab(n) {
    const S = window.RouterSim;
    const r = new S.Router();
    const lab = LABS[n];
    const io = { out() {}, raw() {}, ask: async () => "", page: async () => {}, aborted: () => false };
    r.state = "exec"; r.mode = "priv";
    if (lab.preset.length) {
      await r.exec("priv", "configure terminal", io);
      for (const c of lab.preset) await r.exec(r.mode, c, io);
      r.mode = "priv"; r.ctx = {};
    }
    if (lab.save) r.startup = S.util.clone(r.cfg);
    r.mode = "user"; r.state = "pressReturn"; r.events = new Set();
    r.rt = r.freshRuntime();
    r.prevSnap = r.snapshot();
    r.dhcpServe();
    return r;
  }

  window.RouterLabs = { LABS, buildLab, LOST_SECRET };
})();
