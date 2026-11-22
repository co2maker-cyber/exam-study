/*
 * 라우터 콘솔 연습장 — 시뮬레이션 엔진
 * 시스코 IOS 동작을 연습용으로 단순화해 흉내 냅니다. R1 하나만 설정하고,
 * 나머지 장비(R2, ISP, PC, 서버, 인터넷)는 정해진 대로 반응합니다.
 */
(function () {
  "use strict";

  // ───────────────────────── IP 유틸 ─────────────────────────
  const ip2n = s => {
    if (typeof s !== "string") return null;
    const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const p = m.slice(1).map(Number);
    if (p.some(x => x > 255)) return null;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  };
  const n2ip = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  const isIp = s => ip2n(s) !== null;
  const maskLen = m => { const n = ip2n(m); if (n === null) return -1; let c = 0, seen0 = false; for (let i = 31; i >= 0; i--) { if ((n >>> i) & 1) { if (seen0) return -1; c++; } else seen0 = true; } return c; };
  const lenMask = l => n2ip(l === 0 ? 0 : (0xffffffff << (32 - l)) >>> 0);
  const netOf = (ip, mask) => n2ip((ip2n(ip) & ip2n(mask)) >>> 0);
  const inNet = (ip, net, mask) => ip !== null && ((ip2n(ip) & ip2n(mask)) >>> 0) === ((ip2n(net) & ip2n(mask)) >>> 0);
  const wcMatch = (ip, net, wc) => { const w = ip2n(wc); return ((ip2n(ip) & ~w) >>> 0) === ((ip2n(net) & ~w) >>> 0); };
  const classfulLen = ip => { const a = ip2n(ip) >>> 24; return a < 128 ? 8 : a < 192 ? 16 : 24; };
  const classfulNet = ip => netOf(ip, lenMask(classfulLen(ip)));
  const brdOf = (ip, mask) => n2ip(((ip2n(ip) & ip2n(mask)) | (~ip2n(mask) >>> 0)) >>> 0);

  // IPv6 (간단 처리: 비교용 정규화)
  function v6expand(s) {
    if (typeof s !== "string") return null;
    s = s.toLowerCase().split("/")[0];
    if (!/^[0-9a-f:]+$/.test(s) || (s.match(/::/g) || []).length > 1) return null;
    let parts;
    if (s.includes("::")) {
      const [a, b] = s.split("::");
      const pa = a ? a.split(":") : [], pb = b ? b.split(":") : [];
      const fill = 8 - pa.length - pb.length;
      if (fill < 1) return null;
      parts = [...pa, ...Array(fill).fill("0"), ...pb];
    } else parts = s.split(":");
    if (parts.length !== 8 || parts.some(p => !/^[0-9a-f]{1,4}$/.test(p))) return null;
    return parts.map(p => p.padStart(4, "0")).join(":");
  }
  const v6prefix = (addr, len) => { const e = v6expand(addr); if (!e) return null; const hex = e.replace(/:/g, ""); const bits = hex.split("").map(h => parseInt(h, 16).toString(2).padStart(4, "0")).join(""); return bits.slice(0, len); };
  const v6inNet = (addr, net, len) => { const a = v6prefix(addr, len), b = v6prefix(net, len); return a !== null && a === b; };
  const v6short = e => { // RFC 5952 비슷하게 축약, 대문자
    const parts = v6expand(e).split(":").map(p => p.replace(/^0+(?=.)/, ""));
    let best = -1, bestLen = 0;
    for (let i = 0; i < 8; i++) { if (parts[i] !== "0") continue; let j = i; while (j < 8 && parts[j] === "0") j++; if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i; } i = j; }
    let out = best < 0 ? parts.join(":") : parts.slice(0, best).join(":") + "::" + parts.slice(best + bestLen).join(":");
    return out.toUpperCase();
  };
  const parseV6Pfx = s => { const m = String(s).match(/^([0-9a-fA-F:]+)\/(\d{1,3})$/); if (!m || !v6expand(m[1]) || +m[2] > 128) return null; return { addr: v6short(m[1]), len: +m[2] }; };

  // ───────────────────────── 비밀번호 표시 ─────────────────────────
  const XLAT = "dsfd;kfoA,.iyewrkldJKDHSUBsgvca69834ncxv9873254k;fg87";
  function type7(pw) { const seed = (pw.length * 7) % 10 + 2; let out = String(seed).padStart(2, "0"); for (let i = 0; i < pw.length; i++) out += (pw.charCodeAt(i) ^ XLAT.charCodeAt((seed + i) % XLAT.length)).toString(16).toUpperCase().padStart(2, "0"); return out; }
  function fakeHash(pw, len) { const cs = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"; let h = 2166136261, out = ""; for (let i = 0; i < len; i++) { for (const c of pw + i) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; out += cs[h % 64]; } return out; }
  const type5 = pw => "$1$" + fakeHash("salt" + pw, 4) + "$" + fakeHash(pw, 22);
  const type9 = pw => "$9$" + fakeHash("s9" + pw, 14) + "$" + fakeHash("h9" + pw, 43);

  // ───────────────────────── 고정 장비(세상) ─────────────────────────
  const W = {
    pc1: "192.168.1.10", pc2: "192.168.1.20", lanNet: "192.168.1.0", lanMask: "255.255.255.0", gw: "192.168.1.1",
    r2s: "10.0.0.2", serNet: "10.0.0.0", serMask: "255.255.255.252",
    r2g: "172.16.0.1", srv: "172.16.0.10", srvNet: "172.16.0.0", srvMask: "255.255.255.0", r2lo: "2.2.2.2",
    isp: "203.0.113.1", ispNet: "203.0.113.0", ispMask: "255.255.255.252", r1wan: "203.0.113.2",
    pub: "198.51.100.0", pubMask: "255.255.255.248",
    internet: ["8.8.8.8", "1.1.1.1"],
    r2v6s: "2001:DB8:12::2", r2v6net: "2001:DB8:172::", srv6: "2001:DB8:172::10", r1v6lan: "2001:DB8:1::",
    pc3mac: "0100.d0ba.4c3e.71"
  };
  const PHYS = ["GigabitEthernet0/0", "GigabitEthernet0/1", "GigabitEthernet0/2", "Serial0/0/0", "Serial0/0/1"];
  const MAC = { "GigabitEthernet0/0": "0060.3e8a.4b01", "GigabitEthernet0/1": "0060.3e8a.4b02", "GigabitEthernet0/2": "0060.3e8a.4b03" };
  const CONNECTED = { "GigabitEthernet0/0": "SW1", "GigabitEthernet0/1": "ISP", "Serial0/0/0": "R2" };

  function normIface(raw) {
    if (!raw) return null;
    const s = String(raw).replace(/\s+/g, "").toLowerCase();
    let m;
    if ((m = s.match(/^g(?:i(?:g(?:a(?:b(?:i(?:t(?:e(?:t(?:h(?:e(?:r(?:n(?:e(?:t)?)?)?)?)?)?)?)?)?)?)?)?)?)?(0\/[0-2])(\.\d{1,4})?$/))) {
      return "GigabitEthernet" + m[1] + (m[2] || "");
    }
    if ((m = s.match(/^s(?:e(?:r(?:i(?:a(?:l)?)?)?)?)?(0\/0\/[01])$/))) return "Serial" + m[1];
    if ((m = s.match(/^l(?:o(?:o(?:p(?:b(?:a(?:c(?:k)?)?)?)?)?)?)?(\d{1,4})$/))) return "Loopback" + m[1];
    return null;
  }
  const shortIf = n => n.replace("GigabitEthernet", "Gi").replace("Serial", "Se").replace("Loopback", "Lo");
  const isLoop = n => n.startsWith("Loopback");
  const parentOf = n => n.split(".")[0];

  function newIface(name) {
    return {
      name, ip: null, mask: null, dhcp: false, shutdown: !isLoop(name), desc: "", clockRate: null, bandwidth: null,
      encap: name.startsWith("Serial") ? "hdlc" : null, dot1q: null, natIn: false, natOut: false, accIn: null, accOut: null,
      ospfCost: null, hello: null, dead: null, ospfPri: null, ospfNet: null, ospfArea: null,
      v6: [], v6enable: false, helpers: [], proxyArp: true, cdp: true, mtu: null, ipmtu: null, speed: "auto", duplex: "auto"
    };
  }
  function factoryConfig() {
    const ifs = {};
    PHYS.forEach(n => ifs[n] = newIface(n));
    return {
      hostname: "Router", enableSecret: null, enableSecretAlg: 5, enablePassword: null, pwEnc: false, minLen: null, loginBlock: null,
      loginLog: { success: false, failure: false },
      banners: { motd: "", login: "", exec: "" }, domainLookup: true, domainName: "", hosts: {}, nameServers: [],
      ifs, routes: [], ipRouting: true,
      rip: null, ospf: {}, eigrp: {},
      lines: { con: { password: null, login: false, loginLocal: false, logSync: false, execTimeout: null, priv: null, history: null, transport: null, acc: null },
        vty: { password: null, login: true, loginLocal: false, logSync: false, execTimeout: null, priv: null, history: null, transport: "all", acc: null } },
      users: {}, rsaBits: 0, sshVersion: null, sshTimeout: 120, sshRetries: 3,
      cdp: true, lldp: false, logBuffered: null, logConsole: true, logHosts: [], logTrap: null, ntp: [], tz: null,
      configReg: "0x2102", v6routing: false, v6routes: [],
      dhcpEx: [], pools: {}, natPools: {}, natStatic: [], natDyn: [], acls: {}
    };
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  // ───────────────────────── 명령 문법(README 목록) ─────────────────────────
  const G = {
    user: `enable
logout
ping A.B.C.D
ping A.B.C.D <텍스트>
ping ipv6 <이름>
ping <이름>
traceroute A.B.C.D
traceroute <이름>
telnet <이름>
ssh <텍스트>
terminal length <숫자>
terminal no length
terminal monitor
terminal no monitor
terminal history size <숫자>`,
    priv: `show version
show clock
show history
show users
show terminal
show privilege
show ip interface brief
show ip interface
show ip interface <인터페이스>
show interfaces
show interfaces <인터페이스>
show interfaces description
show ip route
show ip route static
show ip route connected
show ip route rip
show ip route ospf
show ip route eigrp
show ip route A.B.C.D
show ip protocols
show cdp neighbors
show cdp neighbors detail
show cdp
show lldp neighbors
show arp
show ip arp
show running-config
show running-config interface <인터페이스>
show startup-config
show ip ospf
show ip ospf neighbor
show ip ospf interface
show ip ospf interface brief
show ip ospf interface <인터페이스>
show ip ospf database
show ip eigrp neighbors
show ip eigrp topology
show ip eigrp interfaces
show ip rip database
show ip nat translations
show ip nat statistics
show ip dhcp binding
show ip dhcp pool
show ip dhcp conflict
show access-lists
show access-lists <이름>
show ip access-lists
show ipv6 interface brief
show ipv6 route
show ipv6 neighbors
show flash:
show logging
show debugging
show ip ssh
show ssh
show crypto key mypubkey rsa
show controllers <인터페이스>
show protocols
show processes cpu
show hosts
show ntp status
show inventory
show sessions
disable
configure terminal
configure
copy running-config startup-config
copy startup-config running-config
copy running-config tftp:
copy startup-config tftp:
copy tftp: running-config
copy tftp: startup-config
write memory
write
write terminal
write erase
erase startup-config
erase nvram:
reload
ping
clock set <텍스트>
dir
dir flash:
clear ip ospf process
clear ip route *
clear arp-cache
clear counters
clear ip nat translation *
clear ip dhcp binding *
clear logging
undebug all
no debug all
debug ip rip
undebug ip rip
no debug ip rip
debug ip ospf adj
undebug ip ospf adj
no debug ip ospf adj
debug ip ospf hello
undebug ip ospf hello
no debug ip ospf hello
debug ip ospf events
undebug ip ospf events
no debug ip ospf events
debug ip icmp
undebug ip icmp
no debug ip icmp
debug ip packet
undebug ip packet
no debug ip packet
debug ip nat
undebug ip nat
no debug ip nat
debug ip dhcp server events
undebug ip dhcp server events
no debug ip dhcp server events
debug eigrp packets
undebug eigrp packets
no debug eigrp packets
debug ip routing
undebug ip routing
no debug ip routing`,
    config: `hostname <이름>
interface <인터페이스>
interface range <텍스트>
no interface <인터페이스>
default interface <인터페이스>
ip route A.B.C.D <마스크> A.B.C.D
ip route A.B.C.D <마스크> A.B.C.D <숫자>
ip route A.B.C.D <마스크> <인터페이스>
ip route A.B.C.D <마스크> <인터페이스> <숫자>
no ip route A.B.C.D <마스크> A.B.C.D
no ip route A.B.C.D <마스크> A.B.C.D <숫자>
no ip route A.B.C.D <마스크> <인터페이스>
no ip route A.B.C.D <마스크>
ip routing
no ip routing
ip domain-lookup
no ip domain-lookup
ip domain lookup
no ip domain lookup
ip domain-name <이름>
ip domain name <이름>
no ip domain-name
no ip domain name
ip host <이름> A.B.C.D
no ip host <이름>
no ip host <이름> A.B.C.D
ip name-server A.B.C.D
ip name-server A.B.C.D A.B.C.D
no ip name-server
no ip name-server A.B.C.D
router rip
no router rip
router ospf <숫자>
no router ospf <숫자>
router eigrp <숫자>
no router eigrp <숫자>
enable secret <이름>
enable secret <숫자> <이름>
enable algorithm-type scrypt secret <이름>
enable password <이름>
no enable secret
no enable password
service password-encryption
no service password-encryption
security passwords min-length <숫자>
no security passwords min-length
login block-for <숫자> attempts <숫자> within <숫자>
no login block-for
login on-success log
login on-failure log
banner motd <텍스트>
banner login <텍스트>
banner exec <텍스트>
no banner motd
no banner login
no banner exec
line console <숫자>
line vty <숫자> <숫자>
line vty <숫자>
username <이름> secret <이름>
username <이름> privilege <숫자> secret <이름>
username <이름> password <이름>
username <이름> privilege <숫자> password <이름>
username <이름> algorithm-type scrypt secret <이름>
no username <이름>
crypto key generate rsa
crypto key generate rsa general-keys modulus <숫자>
crypto key generate rsa modulus <숫자>
crypto key zeroize rsa
ip ssh version <숫자>
no ip ssh version
ip ssh time-out <숫자>
ip ssh authentication-retries <숫자>
cdp run
no cdp run
lldp run
no lldp run
logging buffered
logging buffered <숫자>
no logging buffered
logging console
no logging console
logging host A.B.C.D
logging A.B.C.D
no logging host A.B.C.D
logging trap <이름>
ntp server A.B.C.D
no ntp server A.B.C.D
clock timezone <이름> <숫자>
clock timezone <이름> <숫자> <숫자>
no clock timezone
config-register <이름>
ipv6 unicast-routing
no ipv6 unicast-routing
ipv6 route <이름> <이름>
no ipv6 route <이름> <이름>
ip dhcp excluded-address A.B.C.D
ip dhcp excluded-address A.B.C.D A.B.C.D
no ip dhcp excluded-address A.B.C.D
no ip dhcp excluded-address A.B.C.D A.B.C.D
ip dhcp pool <이름>
no ip dhcp pool <이름>
ip nat pool <이름> A.B.C.D A.B.C.D netmask A.B.C.D
ip nat pool <이름> A.B.C.D A.B.C.D prefix-length <숫자>
no ip nat pool <이름>
ip nat inside source static A.B.C.D A.B.C.D
no ip nat inside source static A.B.C.D A.B.C.D
access-list <이름> <텍스트>
no access-list <이름>
ip access-list standard <이름>
ip access-list extended <이름>
no ip access-list standard <이름>
no ip access-list extended <이름>
exit
end
do <텍스트>
ip nat inside source list <이름> interface <인터페이스>
ip nat inside source list <이름> pool <이름>
no ip nat inside source list <이름> interface <인터페이스>
no ip nat inside source list <이름> pool <이름>
ip nat inside source list <이름> interface <인터페이스> overload
ip nat inside source list <이름> pool <이름> overload
no ip nat inside source list <이름> interface <인터페이스> overload
no ip nat inside source list <이름> pool <이름> overload`,
    if: `ip address A.B.C.D <마스크>
ip address dhcp
no ip address
no ip address dhcp
shutdown
no shutdown
description <텍스트>
no description
clock rate <숫자>
no clock rate
bandwidth <숫자>
no bandwidth
speed <이름>
duplex <이름>
mtu <숫자>
ip mtu <숫자>
no mtu
encapsulation hdlc
encapsulation ppp
encapsulation dot1Q <숫자>
ip helper-address A.B.C.D
no ip helper-address A.B.C.D
ip nat inside
ip nat outside
no ip nat inside
no ip nat outside
ip access-group <이름> <이름>
no ip access-group <이름> <이름>
ip ospf cost <숫자>
no ip ospf cost
ip ospf hello-interval <숫자>
no ip ospf hello-interval
ip ospf dead-interval <숫자>
no ip ospf dead-interval
ip ospf priority <숫자>
no ip ospf priority
ip ospf network point-to-point
ip ospf network broadcast
no ip ospf network
ip ospf <숫자> area <숫자>
no ip ospf <숫자> area <숫자>
ipv6 address <이름>
ipv6 address <이름> link-local
ipv6 address <이름> eui-64
no ipv6 address
no ipv6 address <이름>
ipv6 enable
no ipv6 enable
ip proxy-arp
no ip proxy-arp
cdp enable
no cdp enable`,
    rip: `version <숫자>
no version
network A.B.C.D
no network A.B.C.D
auto-summary
no auto-summary
default-information originate
no default-information originate
timers basic <숫자> <숫자> <숫자> <숫자>
no timers basic
passive-interface <인터페이스>
no passive-interface <인터페이스>
passive-interface default
no passive-interface default
redistribute <이름>
redistribute <이름> <텍스트>
no redistribute <이름>
maximum-paths <숫자>
distance <숫자>`,
    ospf: `network A.B.C.D <와일드카드> area <숫자>
network A.B.C.D <와일드카드> area A.B.C.D
no network A.B.C.D <와일드카드> area <숫자>
router-id A.B.C.D
no router-id
default-information originate
default-information originate always
no default-information originate
auto-cost reference-bandwidth <숫자>
log-adjacency-changes
no log-adjacency-changes
passive-interface <인터페이스>
no passive-interface <인터페이스>
passive-interface default
no passive-interface default
redistribute <이름>
redistribute <이름> <텍스트>
no redistribute <이름>
maximum-paths <숫자>
distance <숫자>`,
    eigrp: `network A.B.C.D
network A.B.C.D <와일드카드>
no network A.B.C.D
no network A.B.C.D <와일드카드>
auto-summary
no auto-summary
eigrp router-id A.B.C.D
no eigrp router-id
variance <숫자>
passive-interface <인터페이스>
no passive-interface <인터페이스>
passive-interface default
no passive-interface default
redistribute <이름>
redistribute <이름> <텍스트>
no redistribute <이름>
maximum-paths <숫자>
distance <숫자>`,
    line: `password <이름>
password <숫자> <이름>
no password
login
login local
no login
logging synchronous
no logging synchronous
exec-timeout <숫자>
exec-timeout <숫자> <숫자>
no exec-timeout
privilege level <숫자>
no privilege level
history size <숫자>
speed <숫자>
transport input <텍스트>
no transport input
transport output <텍스트>
access-class <이름> <이름>
no access-class <이름> <이름>`,
    dhcp: `network A.B.C.D <마스크>
network A.B.C.D
no network
default-router <텍스트>
no default-router
dns-server <텍스트>
no dns-server
domain-name <이름>
lease <숫자>
lease <숫자> <숫자>
lease <숫자> <숫자> <숫자>
lease infinite`,
    nacl: `permit <텍스트>
deny <텍스트>
<숫자> <텍스트>
remark <텍스트>
no <숫자>
no permit <텍스트>
no deny <텍스트>`,
    rommon: `confreg <이름>
confreg
reset
boot
help
dir <이름>`
  };
  const SUBMODES = ["if", "rip", "ospf", "eigrp", "line", "dhcp", "nacl"];
  const GRAMMAR = {};
  for (const [mode, text] of Object.entries(G)) {
    GRAMMAR[mode] = text.split("\n").map(l => l.trim()).filter(Boolean).map(p => ({ pat: p, toks: p.split(" ") }));
    if (SUBMODES.includes(mode)) ["exit", "end", "do <텍스트>"].forEach(p => GRAMMAR[mode].push({ pat: p, toks: p.split(" "), implicit: true }));
  }
  const COMMAND_COUNT = Object.values(G).reduce((n, t) => n + t.split("\n").filter(l => l.trim()).length, 0);

  const HELP = {
    enable: "Turn on privileged commands", disable: "Turn off privileged commands", logout: "Exit from the EXEC", exit: "Exit from current mode",
    end: "Exit to privileged EXEC mode", ping: "Send echo messages", traceroute: "Trace route to destination", telnet: "Open a telnet connection",
    ssh: "Open a secure shell client connection", terminal: "Set terminal line parameters", show: "Show running system information",
    configure: "Enter configuration mode", copy: "Copy from one file to another", write: "Write running configuration to memory, network, or terminal",
    erase: "Erase a filesystem", reload: "Halt and perform a cold restart", clock: "Manage the system clock", dir: "List files on a filesystem",
    clear: "Reset functions", debug: "Debugging functions (see also 'undebug')", undebug: "Disable debugging functions (see also 'debug')",
    no: "Negate a command or set its defaults", hostname: "Set system's network name", interface: "Select an interface to configure",
    ip: "Global IP configuration subcommands", ipv6: "Global IPv6 configuration commands", router: "Enable a routing process",
    line: "Configure a terminal line", banner: "Define a login banner", service: "Modify use of network based services",
    username: "Establish User Name Authentication", crypto: "Encryption module", "access-list": "Add an access list entry",
    logging: "Modify message logging facilities", ntp: "Configure NTP", cdp: "Global CDP configuration subcommands", lldp: "Global LLDP configuration subcommands",
    do: "To run exec commands in config mode", "config-register": "Define the configuration register", security: "Infra Security CLIs",
    login: "Enable login checking", password: "Set a password", description: "Interface specific description", shutdown: "Shutdown the selected interface",
    network: "Enable routing on an IP network", version: "Set routing protocol version", "auto-summary": "Enable automatic network number summarization",
    "passive-interface": "Suppress routing updates on an interface", "router-id": "router-id for this OSPF process", "default-information": "Control distribution of default information",
    "default-router": "Default routers", "dns-server": "DNS servers", lease: "Address lease time", "domain-name": "Domain name",
    permit: "Specify packets to forward", deny: "Specify packets to reject", remark: "Access list entry comment",
    encapsulation: "Set encapsulation type for an interface", bandwidth: "Set bandwidth informational parameter", "exec-timeout": "Set the EXEC timeout",
    transport: "Define transport protocols for line", "access-class": "Filter connections based on an IP access list", confreg: "Configuration register utility",
    reset: "System reset", boot: "Boot up an external process", help: "Monitor builtin command help",
    "running-config": "Current operating configuration", "startup-config": "Contents of startup configuration", "tftp:": "Copy to tftp: file system",
    "ip-address": "", brief: "Brief summary of IP status and configuration", route: "IP routing table", protocols: "IP routing protocol process parameters and statistics",
    neighbors: "Neighbor entries", memory: "Write to NV memory", secret: "Assign the privileged level secret", "service": "Modify use of network based services",
    dhcp: "Show items in the DHCP database", eigrp: "IP-EIGRP show commands", nat: "IP NAT information", ospf: "OSPF information", rip: "IP RIP show commands",
    arp: "ARP table", "access-lists": "List access lists", cdp: "CDP information", clock: "Display the system clock", flash: "display information about flash: file system",
    hosts: "IP domain-name, lookup style, nameservers, and host table", interfaces: "Interface status and configuration", logging: "Show the contents of logging buffers",
    "running-config": "Current operating configuration", version: "System hardware and software status", history: "Display the session command history",
    users: "Display information about terminal lines", ipv6: "IPv6 information", debugging: "State of each debugging option", ssh: "Status of SSH server connections",
    standard: "Standard Access List", extended: "Extended Access List", pool: "Configure DHCP address pools", "excluded-address": "Prevent DHCP from assigning certain addresses",
    "domain-name": "Define the default domain name", "domain-lookup": "Enable IP Domain Name System hostname translation", host: "Add an entry to the ip hostname table",
    "name-server": "Specify address of name server to use", ssh: "Configure ssh options", "unicast-routing": "Enable unicast routing", address: "Set the IP address of an interface",
    "access-group": "Specify access control for packets", "helper-address": "Specify a destination address for UDP broadcasts", ospf: "OSPF interface commands",
    console: "Primary terminal line", vty: "Virtual terminal", motd: "Set Message of the Day banner", "password-encryption": "Encrypt system passwords",
    "general-keys": "Generate a general purpose RSA key pair for signing and encryption", modulus: "Provide number of modulus bits on the command line",
    source: "Specify source address or name", inside: "Inside address translation", outside: "Outside address translation", overload: "Overload an address translation",
    static: "Specify static local->global mapping", list: "Specify access list describing local addresses", area: "Set the OSPF area ID", synchronous: "Synchronized message output",
    local: "Local password checking", input: "Define which protocols to use when connecting to the terminal server"
  };
  const PH_HELP = {
    "A.B.C.D": "IP address", "<마스크>": "IP subnet mask", "<와일드카드>": "Wildcard bits", "<숫자>": "<숫자>  값", "<이름>": "WORD", "<인터페이스>": "Interface name (예: g0/0, s0/0/0, lo0)", "<텍스트>": "LINE"
  };

  // ───────────────────────── Router ─────────────────────────
  class Router {
    constructor() {
      this.cfg = factoryConfig();
      this.startup = null;
      this.rt = this.freshRuntime();
      this.state = "pressReturn"; // boot | rommon | pressReturn | login | exec
      this.mode = "user"; this.ctx = {}; this.privileged = false;
      this.events = new Set();
      this.listeners = {};
      this.clockBase = Date.UTC(2026, 2, 1, 0, 0, 0); this.clockStart = Date.now(); this.clockOffset = 0;
      this.romCount = 1; this.bootReg = "0x2102";
      this.prevSnap = null;
    }
    freshRuntime() {
      return { arp: {}, nat: [], dhcpBind: null, dhcpConflicts: [], aclHits: {}, logs: [], debug: new Set(), termLen: 24, history: [], histSize: 10, monitor: false, counters: 0, ospfReset: 0, pc3: null };
    }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, data) { (this.listeners[ev] || []).forEach(f => f(data)); }
    ev(name) { if (!this.events.has(name)) { this.events.add(name); this.emit("event", name); } }

    // ── 시간 ──
    now() { return this.clockBase + (Date.now() - this.clockStart) + this.clockOffset; }
    tzOffset() { return this.cfg.tz ? (this.cfg.tz.h * 60 + (this.cfg.tz.m || 0)) * 60000 : 0; }
    clockStr() {
      const d = new Date(this.now() + this.tzOffset());
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], mons = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const p = (n, l = 2) => String(n).padStart(l, "0");
      return `*${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)} ${this.cfg.tz ? this.cfg.tz.name : "UTC"} ${days[d.getUTCDay()]} ${mons[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
    }
    stamp() {
      const d = new Date(this.now() + this.tzOffset());
      const mons = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const p = (n, l = 2) => String(n).padStart(l, "0");
      return `*${mons[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, " ")} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`;
    }

    // ── 인터페이스 ──
    iface(n) { return this.cfg.ifs[n]; }
    ensureIface(n) {
      if (!this.cfg.ifs[n]) {
        if (n.includes(".") && !this.cfg.ifs[parentOf(n)]) return null;
        this.cfg.ifs[n] = newIface(n);
        if (n.includes(".")) this.cfg.ifs[n].shutdown = false;
      }
      return this.cfg.ifs[n];
    }
    ifaceNames() {
      const order = n => (n.startsWith("Gig") ? 1 : n.startsWith("Ser") ? 2 : 3);
      return Object.keys(this.cfg.ifs).sort((a, b) => order(a) - order(b) || a.localeCompare(b, "en", { numeric: true }));
    }
    effIp(i) {
      if (!i) return null;
      if (i.dhcp) return i.name === "GigabitEthernet0/1" && this.l1(i) ? { ip: W.r1wan, mask: W.ispMask } : null;
      return i.ip ? { ip: i.ip, mask: i.mask } : null;
    }
    // 물리 상태: up 이면 true
    l1(i) {
      if (!i) return false;
      if (i.name.includes(".")) { const p = this.iface(parentOf(i.name)); return !i.shutdown && p && this.l1(p); }
      if (isLoop(i.name)) return !i.shutdown;
      return !i.shutdown && !!CONNECTED[i.name];
    }
    l2(i) {
      if (!this.l1(i)) return false;
      if (i.name === "Serial0/0/0") return i.encap === "hdlc";
      return true;
    }
    up(i) { return this.l2(i); }
    statusText(i) {
      const st = i.shutdown ? "administratively down" : this.l1(i) ? "up" : "down";
      const pr = this.l2(i) ? "up" : "down";
      return [st, pr];
    }
    ownIps() { const r = []; for (const n in this.cfg.ifs) { const i = this.cfg.ifs[n], e = this.effIp(i); if (e && this.up(i)) r.push({ ip: e.ip, iface: n }); } return r; }

    // ── 라우팅 ──
    connected() {
      const r = [];
      for (const n of this.ifaceNames()) {
        const i = this.cfg.ifs[n], e = this.effIp(i);
        if (!e || !this.up(i)) continue;
        r.push({ code: "C", net: netOf(e.ip, e.mask), mask: e.mask, iface: n, ad: 0, metric: 0 });
        if (e.mask !== "255.255.255.255") r.push({ code: "L", net: e.ip, mask: "255.255.255.255", iface: n, ad: 0, metric: 0 });
      }
      return r;
    }
    serialUp() { const s = this.iface("Serial0/0/0"); const e = this.effIp(s); return s && this.up(s) && e && inNet(W.r2s, e.ip, e.mask) && e.ip !== W.r2s; }
    ospfRid(pid) {
      const p = this.cfg.ospf[pid]; if (!p) return null;
      if (p.rid) return p.rid;
      const loops = [], phys = [];
      for (const n in this.cfg.ifs) { const i = this.cfg.ifs[n], e = this.effIp(i); if (!e || !this.up(i)) continue; (isLoop(n) ? loops : phys).push(e.ip); }
      const pick = a => a.sort((x, y) => ip2n(y) - ip2n(x))[0];
      return pick(loops) || pick(phys) || null;
    }
    ospfIfaces(pid) {
      const p = this.cfg.ospf[pid], out = [];
      if (!p) return out;
      for (const n of this.ifaceNames()) {
        const i = this.cfg.ifs[n], e = this.effIp(i);
        if (!e || !this.up(i)) continue;
        let area = null;
        if (i.ospfArea && String(i.ospfArea.pid) === String(pid)) area = i.ospfArea.area;
        else for (const st of p.networks) if (wcMatch(e.ip, st.net, st.wc)) { area = st.area; break; }
        if (area === null) continue;
        const passive = p.passiveDefault ? !p.noPassive.includes(n) : p.passive.includes(n);
        out.push({ name: n, ip: e.ip, mask: e.mask, area: String(area), passive });
      }
      return out;
    }
    ospfState() {
      // R2와의 이웃 상태 계산
      for (const pid of Object.keys(this.cfg.ospf)) {
        const ifs = this.ospfIfaces(pid), s0 = ifs.find(x => x.name === "Serial0/0/0");
        const rid = this.ospfRid(pid), i = this.iface("Serial0/0/0");
        const res = { pid, rid, ifs, nbr: null, problem: null };
        if (!rid) { res.problem = "norid"; return res; }
        if (!s0) { res.problem = "noS0"; return res; }
        if (!this.serialUp()) { res.problem = "link"; return res; }
        if (s0.passive) { res.problem = "passive"; return res; }
        if (s0.area !== "0" && s0.area !== "0.0.0.0") { res.problem = "area"; return res; }
        const hello = i.hello || 10, dead = i.dead || (i.hello ? i.hello * 4 : 40);
        if (hello !== 10 || dead !== 40) { res.problem = "timers"; res.hello = hello; res.dead = dead; return res; }
        if (rid === W.r2lo) { res.problem = "dupRid"; return res; }
        if (i.ospfNet === "broadcast") { res.problem = "nettype"; return res; }
        res.nbr = { id: W.r2lo, addr: W.r2s, state: "FULL" };
        return res;
      }
      return null;
    }
    ripState() {
      const r = this.cfg.rip; if (!r) return null;
      const covered = n => { const i = this.cfg.ifs[n], e = this.effIp(i); return e && this.up(i) && r.networks.includes(classfulNet(e.ip)); };
      const passive = n => r.passiveDefault ? !r.noPassive.includes(n) : r.passive.includes(n);
      const s0 = covered("Serial0/0/0") && this.serialUp();
      const recv = s0 && r.version !== 1;               // R2는 v2로 보냄
      const send = s0 && !passive("Serial0/0/0") && r.version === 2;
      const adv = Object.keys(this.cfg.ifs).filter(covered).map(n => { const e = this.effIp(this.cfg.ifs[n]); return { net: netOf(e.ip, e.mask), mask: e.mask }; });
      return { recv, send, adv, covered, passive };
    }
    eigrpState() {
      for (const as of Object.keys(this.cfg.eigrp)) {
        const p = this.cfg.eigrp[as];
        const covered = n => { const i = this.cfg.ifs[n], e = this.effIp(i); if (!e || !this.up(i)) return false; return p.networks.some(st => st.wc ? wcMatch(e.ip, st.net, st.wc) : classfulNet(e.ip) === classfulNet(st.net)); };
        const passive = n => p.passiveDefault ? !p.noPassive.includes(n) : p.passive.includes(n);
        const ifs = Object.keys(this.cfg.ifs).filter(covered);
        const nbr = as === "100" && covered("Serial0/0/0") && this.serialUp() && !passive("Serial0/0/0");
        const adv = ifs.map(n => { const e = this.effIp(this.cfg.ifs[n]); return { net: netOf(e.ip, e.mask), mask: e.mask }; });
        return { as, ifs, nbr, adv, passive, p, problem: as !== "100" ? "as" : null };
      }
      return null;
    }
    dhcpClientDefault() { const g = this.iface("GigabitEthernet0/1"); return g && g.dhcp && this.up(g) ? { code: "S*", net: "0.0.0.0", mask: "0.0.0.0", nh: W.isp, ad: 254, metric: 0 } : null; }
    rib() {
      const cand = this.connected();
      const conn = cand.slice();
      const resolve = (nh) => conn.find(c => c.code === "C" && inNet(nh, c.net, c.mask));
      for (const s of this.cfg.routes) {
        if (s.iface) { const i = this.iface(s.iface); if (!i || !this.up(i)) continue; cand.push({ code: "S", net: s.net, mask: s.mask, iface: s.iface, ad: s.ad, metric: 0, static: s }); }
        else { const c = resolve(s.nh); if (!c) continue; cand.push({ code: "S", net: s.net, mask: s.mask, nh: s.nh, iface: c.iface, ad: s.ad, metric: 0, static: s }); }
      }
      const dc = this.dhcpClientDefault(); if (dc) { dc.iface = "GigabitEthernet0/1"; cand.push(dc); }
      const rip = this.ripState();
      if (rip && rip.recv) cand.push({ code: "R", net: W.srvNet, mask: W.srvMask, nh: W.r2s, iface: "Serial0/0/0", ad: this.cfg.rip.distance || 120, metric: 1 });
      const os = this.ospfState();
      if (os && os.nbr) {
        const cost = (this.iface("Serial0/0/0").ospfCost || 64);
        const dist = this.cfg.ospf[os.pid].distance || 110;
        cand.push({ code: "O", net: W.srvNet, mask: W.srvMask, nh: W.r2s, iface: "Serial0/0/0", ad: dist, metric: cost + 1 });
        cand.push({ code: "O", net: W.r2lo, mask: "255.255.255.255", nh: W.r2s, iface: "Serial0/0/0", ad: dist, metric: cost + 1 });
      }
      const eg = this.eigrpState();
      if (eg && eg.nbr) {
        const dist = eg.p.distance || 90;
        cand.push({ code: "D", net: W.srvNet, mask: W.srvMask, nh: W.r2s, iface: "Serial0/0/0", ad: dist, metric: 2172416 });
        cand.push({ code: "D", net: W.r2lo, mask: "255.255.255.255", nh: W.r2s, iface: "Serial0/0/0", ad: dist, metric: 2297856 });
      }
      const best = {};
      for (const c of cand) {
        const k = c.net + "/" + maskLen(c.mask);
        if (!best[k] || c.ad < best[k][0].ad) best[k] = [c];
        else if (c.ad === best[k][0].ad && c.code === best[k][0].code && c.nh !== best[k][0].nh) best[k].push(c);
      }
      const out = [];
      Object.values(best).forEach(a => a.forEach(c => out.push(c)));
      out.forEach(c => { if (c.net === "0.0.0.0" && c.mask === "0.0.0.0" && c.code === "S") c.code = "S*"; });
      return out.sort((a, b) => ip2n(a.net) - ip2n(b.net) || maskLen(a.mask) - maskLen(b.mask));
    }
    lookup(ip) {
      let best = null;
      for (const r of this.rib()) if (inNet(ip, r.net, r.mask) && (!best || maskLen(r.mask) > maskLen(best.mask))) best = r;
      return best;
    }
    // R2가 아는 경로(돌아오는 길)
    r2Knows(ip) {
      if (inNet(ip, W.serNet, W.serMask) || inNet(ip, W.srvNet, W.srvMask) || ip === W.r2lo) return true;
      const rip = this.ripState();
      if (rip && rip.send) for (const a of rip.adv) { const m = this.cfg.rip.autoSummary !== false && classfulNet(a.net) !== classfulNet(W.r2s) ? lenMask(classfulLen(a.net)) : a.mask; if (inNet(ip, a.net, m)) return true; }
      const os = this.ospfState();
      if (os && os.nbr) for (const x of os.ifs) if (inNet(ip, x.ip, x.mask)) return true;
      const eg = this.eigrpState();
      if (eg && eg.nbr) for (const a of eg.adv) if (inNet(ip, a.net, a.mask)) return true;
      return false;
    }
    r2KnowsV6(addr) { return v6inNet(addr, W.r1v6lan, 64) || v6inNet(addr, "2001:DB8:12::", 64) || v6inNet(addr, W.r2v6net, 64); }

    // ── R1에서 보내는 ping ──
    r1Reach(dst, srcIf) {
      const own = this.ownIps().find(o => o.ip === dst);
      if (own) return { ok: true };
      const r = this.lookup(dst);
      if (!r) return { ok: false, why: "noroute" };
      const out = this.iface(r.iface);
      const e = this.effIp(out);
      let src = e ? e.ip : null;
      if (srcIf) { const si = this.iface(srcIf), se = this.effIp(si); if (!se || !this.up(si)) return { ok: false, why: "src" }; src = se.ip; }
      const nh = r.nh || dst;
      const n = r.iface;
      let arpFirst = false;
      const ethArp = (ip) => { if (!this.rt.arp[ip]) { this.rt.arp[ip] = { mac: "0060.70" + (ip2n(ip) & 0xffff).toString(16).padStart(4, "0").replace(/(..)(..)/, "$1.$2"), iface: n, t: Date.now() }; arpFirst = true; } };
      if (n === "GigabitEthernet0/0") {
        const hosts = [W.pc1, W.pc2]; if (this.rt.pc3) hosts.push(this.rt.pc3.ip);
        if (!hosts.includes(nh) || !inNet(nh, e.ip, e.mask)) return { ok: false, why: "nohost" };
        ethArp(nh);
        const ok = inNet(src, W.lanNet, W.lanMask) || e.ip === W.gw;
        return { ok, arpFirst, why: ok ? null : "return" };
      }
      if (n === "Serial0/0/0") {
        if (nh !== W.r2s || !this.serialUp()) return { ok: false, why: "nohost" };
        const r2side = [W.r2s, W.r2g, W.r2lo, W.srv].includes(dst);
        if (!r2side) return { ok: false, why: "r2noroute" };
        if (!this.r2Knows(src)) return { ok: false, why: "r2return" };
        return { ok: true };
      }
      if (n === "GigabitEthernet0/1") {
        if (nh !== W.isp || !inNet(W.isp, e.ip, e.mask)) return { ok: false, why: "nohost" };
        ethArp(W.isp);
        const target = dst === W.isp || W.internet.includes(dst);
        if (!target) return { ok: false, why: "ispnoroute" };
        const back = src === W.r1wan || inNet(src, W.pub, W.pubMask) || inNet(src, W.ispNet, W.ispMask);
        if (!back) return { ok: false, why: "ispreturn" };
        return { ok: true, arpFirst };
      }
      return { ok: false, why: "nohost" };
    }
    r1Reach6(dst) {
      if (!this.cfg.v6routing && false) return { ok: false };
      const d = v6short(dst);
      const s0 = this.iface("Serial0/0/0"), g0 = this.iface("GigabitEthernet0/0");
      const s0v6 = s0 && this.up(s0) && s0.v6.find(a => !a.ll && v6inNet(a.addr, "2001:DB8:12::", 64));
      if (d === v6short(W.r2v6s)) return { ok: !!s0v6 };
      if (v6inNet(d, W.r2v6net, 64)) {
        if (!s0v6) return { ok: false };
        const rt = this.cfg.v6routes.find(r => v6inNet(d, r.pfx, r.len) && v6short(r.nh) === v6short(W.r2v6s));
        return { ok: !!rt && this.cfg.v6routing };
      }
      if (g0 && this.up(g0) && g0.v6.some(a => !a.ll && v6short(a.addr) === d)) return { ok: true };
      return { ok: false };
    }

    // ── ACL 평가 ──
    aclEval(name, pkt) {
      if (!name) return { permit: true };
      const a = this.cfg.acls[name];
      if (!a || !a.entries.length) return { permit: true, missing: !a };
      for (const e of a.entries) {
        if (e.remark) continue;
        const m = this.aceMatch(a.type, e, pkt);
        if (m) { e.hits = (e.hits || 0) + 1; return { permit: e.action === "permit", entry: e }; }
      }
      return { permit: false, implicit: true };
    }
    aceMatch(type, e, p) {
      const am = (spec, ip) => !spec || spec.any || (spec.host ? spec.host === ip : wcMatch(ip, spec.net, spec.wc));
      if (type === "standard") return am(e.src, p.src);
      if (e.proto !== "ip" && e.proto !== p.proto) return false;
      if (!am(e.src, p.src) || !am(e.dst, p.dst)) return false;
      if (e.dport && (p.proto === "tcp" || p.proto === "udp") && e.dport !== p.port) return false;
      if (e.dport && p.proto === "icmp") return false;
      return true;
    }
    parseAce(type, words) {
      // words: [action, ...]
      const action = words[0]; let i = 1;
      if (action !== "permit" && action !== "deny") return null;
      const addr = () => {
        const w = words[i];
        if (w === "any") { i++; return { any: true }; }
        if (w === "host") { const h = words[i + 1]; if (!isIp(h)) return null; i += 2; return { host: h }; }
        if (isIp(w)) { const wc = words[i + 1]; if (wc && isIp(wc)) { i += 2; return { net: netOf(w, n2ip(~ip2n(wc) >>> 0)), wc }; } i++; return { host: w }; }
        return null;
      };
      const PORTS = { www: 80, http: 80, https: 443, ssh: 22, telnet: 23, ftp: 21, smtp: 25, domain: 53, tftp: 69, snmp: 161 };
      if (type === "standard") { const src = addr(); if (!src) return null; return { action, src, text: words.join(" ") }; }
      const proto = words[i++];
      if (!["ip", "tcp", "udp", "icmp"].includes(proto)) return null;
      const src = addr(); if (!src) return null;
      let sport = null; if (words[i] === "eq") { sport = PORTS[words[i + 1]] || +words[i + 1]; i += 2; }
      const dst = addr(); if (!dst) return null;
      let dport = null; if (words[i] === "eq") { dport = PORTS[words[i + 1]] || +words[i + 1]; if (!dport) return null; i += 2; }
      return { action, proto, src, dst, sport, dport, log: words.includes("log"), text: words.join(" ") };
    }
    aclTypeByNumber(n) { n = +n; if ((n >= 1 && n <= 99) || (n >= 1300 && n <= 1999)) return "standard"; if ((n >= 100 && n <= 199) || (n >= 2000 && n <= 2699)) return "extended"; return null; }

    // ── NAT ──
    natTranslate(src) {
      const st = this.cfg.natStatic.find(s => s.local === src);
      if (st) return { global: st.global, kind: "static" };
      for (const d of this.cfg.natDyn) {
        const acl = this.cfg.acls[d.list];
        if (!acl) continue;
        const r = this.aclEvalSilent(d.list, { src, dst: "8.8.8.8", proto: "icmp" });
        if (!r) continue;
        if (d.iface) { const i = this.iface(d.iface), e = this.effIp(i); if (!e || !this.up(i)) continue; if (!d.overload) return { global: e.ip, kind: "dyn" }; return { global: e.ip, kind: "pat" }; }
        if (d.pool) { const p = this.cfg.natPools[d.pool]; if (!p) continue; return { global: p.start, kind: d.overload ? "pat" : "dyn" }; }
      }
      return null;
    }
    aclEvalSilent(name, pkt) { const a = this.cfg.acls[name]; if (!a) return false; for (const e of a.entries) { if (e.remark) continue; if (this.aceMatch(a.type, e, pkt)) return e.action === "permit"; } return false; }

    // ── DHCP 서버(PC3) ──
    dhcpServe() {
      if (this.rt.pc3) {
        const pool = Object.values(this.cfg.pools).find(p => p.net && inNet(this.rt.pc3.ip, p.net, p.mask));
        if (!pool) { this.rt.pc3 = null; this.rt.dhcpBind = null; }
        return;
      }
      const g0 = this.iface("GigabitEthernet0/0"), e = this.effIp(g0);
      if (!e || !this.up(g0)) return;
      const pool = Object.entries(this.cfg.pools).find(([, p]) => p.net && inNet(e.ip, p.net, p.mask));
      if (!pool) return;
      const [pname, p] = pool;
      const start = ip2n(p.net) + 1, end = ip2n(brdOf(p.net, p.mask)) - 1;
      const excluded = n => this.cfg.dhcpEx.some(([a, b]) => n >= ip2n(a) && n <= ip2n(b || a));
      const inUse = [e.ip, W.pc1, W.pc2];
      for (let n = start; n <= end; n++) {
        if (excluded(n)) continue;
        const ip = n2ip(n);
        if (inUse.includes(ip)) {
          if (!this.rt.dhcpConflicts.find(c => c.ip === ip)) { this.rt.dhcpConflicts.push({ ip, t: this.now() }); this.log(`%DHCPD-4-PING_CONFLICT: DHCP address conflict:  server pinged ${ip}.`); }
          continue;
        }
        this.rt.pc3 = { ip, mask: p.mask, gw: p.defaultRouter || null, dns: p.dns || null, pool: pname };
        this.rt.dhcpBind = { ip, mac: W.pc3mac, t: this.now(), lease: p.lease };
        return;
      }
    }
    dhcpClient() { /* G0/1 dhcp는 effIp에서 처리 */ }

    // ── PC에서 본 경로 ──
    pcPath(src, dst, opt = {}) {
      const proto = opt.proto || "icmp", port = opt.port;
      const g0 = this.iface("GigabitEthernet0/0"), e = this.effIp(g0);
      if (!src) return { ok: false, why: "PC3이 아직 IP 주소를 받지 못했습니다 (R1에 DHCP 풀 필요)." };
      if (!g0 || g0.shutdown) return { ok: false, why: "R1 G0/0이 꺼져 있습니다 (shutdown)." };
      if (!e) return { ok: false, why: "R1 G0/0에 IP 주소가 없습니다." };
      if (e.ip !== W.gw || !inNet(src, e.ip, e.mask)) return { ok: false, why: `R1 G0/0 주소(${e.ip}/${maskLen(e.mask)})가 PC 게이트웨이 192.168.1.1/24와 맞지 않습니다.` };
      const accIn = this.aclEval(g0.accIn, { src, dst, proto, port });
      if (!accIn.permit) return { ok: false, why: `R1 G0/0 들어오는 방향 ACL '${g0.accIn}'이(가) 막았습니다${accIn.implicit ? " (맨 끝 암묵적 deny)" : ""}.` };
      if (this.ownIps().some(o => o.ip === dst)) return { ok: true };
      if (!this.cfg.ipRouting) return { ok: false, why: "R1에서 ip routing이 꺼져 있습니다." };
      const r = this.lookup(dst);
      if (!r) return { ok: false, why: `R1 라우팅 테이블에 ${dst}로 가는 경로가 없습니다.` };
      const out = this.iface(r.iface);
      const accOut = this.aclEval(out.accOut, { src, dst, proto, port });
      if (!accOut.permit) return { ok: false, why: `R1 ${shortIf(out.name)} 나가는 방향 ACL '${out.accOut}'이(가) 막았습니다.` };
      if (r.iface === "Serial0/0/0") {
        if (!this.serialUp()) return { ok: false, why: "R1–R2 시리얼 링크가 올라와 있지 않습니다." };
        if (![W.srv, W.r2g, W.r2s, W.r2lo].includes(dst)) return { ok: false, why: `R2는 ${dst}로 가는 길을 모릅니다.` };
        if (!this.r2Knows(src)) return { ok: false, why: "가는 길은 있지만, R2가 192.168.1.0/24로 돌아오는 경로를 모릅니다 (라우팅 프로토콜로 알려 주세요)." };
        return { ok: true };
      }
      if (r.iface === "GigabitEthernet0/1") {
        const oe = this.effIp(out);
        if (!oe || !inNet(W.isp, oe.ip, oe.mask)) return { ok: false, why: "R1 G0/1이 ISP(203.0.113.1)와 같은 네트워크에 있지 않습니다." };
        if (r.nh && r.nh !== W.isp) return { ok: false, why: `다음 홉 ${r.nh}이(가) ISP 주소가 아닙니다.` };
        if (!(W.internet.includes(dst) || dst === W.isp)) return { ok: false, why: `ISP는 ${dst}로 가는 길을 모릅니다.` };
        const t = (g0.natIn && out.natOut) ? this.natTranslate(src) : null;
        if (!t) {
          const miss = !g0.natIn ? "G0/0에 ip nat inside가 없습니다" : !out.natOut ? "G0/1에 ip nat outside가 없습니다" : "이 PC 주소를 변환할 NAT 규칙(ACL 일치)이 없습니다";
          return { ok: false, why: `PC 주소가 사설(192.168.1.x)이라 인터넷에서 응답이 돌아오지 못합니다 — ${miss}.` };
        }
        const back = t.global === oe.ip || inNet(t.global, W.pub, W.pubMask);
        if (!back) return { ok: false, why: `변환된 주소 ${t.global}로는 ISP가 응답을 돌려보내지 못합니다.` };
        this.natRecord(src, t, dst, proto);
        return { ok: true, nat: t };
      }
      if (r.iface === "GigabitEthernet0/0") return { ok: true };
      return { ok: false, why: "경로가 이상한 곳을 가리킵니다." };
    }
    natRecord(src, t, dst, proto) {
      const id = this.rt.nat.length + 1;
      const key = src + ">" + dst + ">" + proto;
      if (this.rt.nat.find(n => n.key === key)) return;
      this.rt.nat.push({ key, proto, il: src, ig: t.global, ol: dst, og: dst, port: 1 + (this.rt.nat.length % 9), kind: t.kind });
    }
    sshPath() {
      const tgt = W.gw;
      const p = this.pcPath(W.pc1, tgt, { proto: "tcp", port: 22 });
      if (!p.ok) return p;
      const c = this.cfg, v = c.lines.vty;
      if (!c.rsaBits) return { ok: false, why: "RSA 키가 없어 SSH가 꺼져 있습니다 (crypto key generate rsa)." };
      if (c.sshVersion === 2 && c.rsaBits < 768) return { ok: false, why: "SSH 버전 2에는 768비트 이상 RSA 키가 필요합니다." };
      const tr = (v.transport || "all").split(/\s+/);
      if (!(tr.includes("ssh") || tr.includes("all"))) return { ok: false, why: `vty가 SSH를 받지 않습니다 (transport input ${v.transport}).` };
      if (v.acc) { const ok = this.aclEvalSilent(v.acc, { src: W.pc1, dst: tgt, proto: "tcp", port: 22 }); if (!ok) return { ok: false, why: `vty access-class ${v.acc}가 PC1을 막았습니다.` }; }
      if (v.loginLocal) { if (!Object.keys(c.users).length) return { ok: false, why: "login local인데 사용자 계정(username)이 없습니다." }; }
      else if (v.login) { if (!v.password) return { ok: false, why: "vty에 login은 있지만 비밀번호가 없어 접속이 거부됩니다 (login local + username 추천)." }; }
      return { ok: true };
    }
    pc6Path() {
      const g0 = this.iface("GigabitEthernet0/0");
      if (!this.cfg.v6routing) return { ok: false, why: "ipv6 unicast-routing이 꺼져 있어 PC1이 IPv6 주소/게이트웨이를 받지 못합니다." };
      if (!g0 || !this.up(g0) || !g0.v6.some(a => !a.ll && v6inNet(a.addr, W.r1v6lan, 64))) return { ok: false, why: "R1 G0/0에 2001:DB8:1::/64 주소가 없습니다." };
      const s0 = this.iface("Serial0/0/0");
      if (!this.l2(s0) || !s0.v6.some(a => !a.ll && v6inNet(a.addr, "2001:DB8:12::", 64))) return { ok: false, why: "R1 S0/0/0에 2001:DB8:12::/64 주소가 없거나 링크가 내려가 있습니다." };
      const rt = this.cfg.v6routes.find(r => v6inNet(W.srv6, r.pfx, r.len));
      if (!rt) return { ok: false, why: "R1에 2001:DB8:172::/64로 가는 IPv6 경로가 없습니다." };
      if (v6short(rt.nh) !== v6short(W.r2v6s)) return { ok: false, why: `IPv6 다음 홉 ${rt.nh}이(가) R2(2001:DB8:12::2)가 아닙니다.` };
      return { ok: true };
    }
    pcChecks() {
      this.dhcpServe();
      const pc3 = this.rt.pc3;
      return [
        { id: "pc1-gw", label: "PC1 → 게이트웨이 192.168.1.1", ...this.pcPath(W.pc1, W.gw) },
        { id: "pc1-srv", label: "PC1 → 원격 서버 172.16.0.10", ...this.pcPath(W.pc1, W.srv) },
        { id: "pc1-inet", label: "PC1 → 인터넷 8.8.8.8", ...this.pcPath(W.pc1, "8.8.8.8") },
        { id: "pc2-srv", label: "PC2 → 원격 서버 172.16.0.10", ...this.pcPath(W.pc2, W.srv) },
        { id: "pc2-inet", label: "PC2 → 인터넷 8.8.8.8", ...this.pcPath(W.pc2, "8.8.8.8") },
        { id: "pc3-ip", label: "PC3 DHCP 주소", ok: !!pc3, why: pc3 ? null : this.pc3Why(), note: pc3 ? `${pc3.ip}/${maskLen(pc3.mask)}${pc3.gw ? " · GW " + pc3.gw : " · 게이트웨이 없음"}` : "" },
        { id: "pc1-ssh", label: "PC1 → R1 SSH 접속", ...this.sshPath() },
        { id: "pc1-v6", label: "PC1 → 서버 IPv6 2001:DB8:172::10", ...this.pc6Path() }
      ];
    }
    pc3Why() {
      const g0 = this.iface("GigabitEthernet0/0"), e = this.effIp(g0);
      if (!e || !this.up(g0)) return "R1 G0/0이 동작하지 않습니다.";
      if (!Object.keys(this.cfg.pools).length) return "R1에 DHCP 풀(ip dhcp pool)이 없습니다.";
      if (!Object.values(this.cfg.pools).some(p => p.net && inNet(e.ip, p.net, p.mask))) return "DHCP 풀의 network가 G0/0 네트워크(192.168.1.0/24)와 맞지 않습니다.";
      return "나눠 줄 수 있는 주소가 없습니다 (제외 범위 확인).";
    }

    // ── 로그 ──
    log(msg) {
      const line = `${this.stamp()}: ${msg}`;
      if (this.cfg.logBuffered !== null) { this.rt.logs.push(line); if (this.rt.logs.length > 200) this.rt.logs.shift(); }
      if (this.cfg.logConsole && this.state === "exec") this.emit("async", line);
    }
    snapshot() {
      const s = {};
      for (const n in this.cfg.ifs) { const i = this.cfg.ifs[n]; s["if:" + n] = this.statusText(i).join("/"); }
      const os = this.ospfState(); s.ospf = os && os.nbr ? os.pid : "";
      const eg = this.eigrpState(); s.eigrp = eg && eg.nbr ? eg.as : "";
      const g1 = this.iface("GigabitEthernet0/1"); s.dhcpc = g1 && g1.dhcp && this.up(g1) ? "1" : "";
      return s;
    }
    diffLogs() {
      const prev = this.prevSnap, cur = this.snapshot();
      this.prevSnap = cur;
      if (!prev) return;
      const msgs = [];
      for (const k in cur) {
        if (!k.startsWith("if:") || prev[k] === cur[k]) continue;
        const n = k.slice(3), [a1, p1] = (prev[k] || "administratively down/down").split("/"), [a2, p2] = cur[k].split("/");
        if (a1 !== a2) msgs.push([0, `%LINK-${a2 === "administratively down" ? 5 : 3}-CHANGED: Interface ${n}, changed state to ${a2}`]);
        if (p1 !== p2) msgs.push([1, `%LINEPROTO-5-UPDOWN: Line protocol on Interface ${n}, changed state to ${p2}`]);
      }
      if (prev.ospf !== cur.ospf) {
        if (cur.ospf) msgs.push([2, `%OSPF-5-ADJCHG: Process ${cur.ospf}, Nbr 2.2.2.2 on Serial0/0/0 from LOADING to FULL, Loading Done`]);
        else if (prev.ospf) msgs.push([0, `%OSPF-5-ADJCHG: Process ${prev.ospf}, Nbr 2.2.2.2 on Serial0/0/0 from FULL to DOWN, Neighbor Down: Interface down or detached`]);
      }
      if (prev.eigrp !== cur.eigrp) {
        if (cur.eigrp) msgs.push([2, `%DUAL-5-NBRCHANGE: EIGRP-IPv4 ${cur.eigrp}: Neighbor 10.0.0.2 (Serial0/0/0) is up: new adjacency`]);
        else msgs.push([0, `%DUAL-5-NBRCHANGE: EIGRP-IPv4 ${prev.eigrp}: Neighbor 10.0.0.2 (Serial0/0/0) is down: interface down`]);
      }
      if (cur.dhcpc && !prev.dhcpc) msgs.push([2, `%DHCP-6-ADDRESS_ASSIGN: Interface GigabitEthernet0/1 assigned DHCP address 203.0.113.2, mask 255.255.255.252, hostname ${this.cfg.hostname}`]);
      msgs.forEach(([d, m]) => setTimeout(() => this.log(m), 400 + d * 900));
    }

    // ── 저장 상태 ──
    configText(c) { return this.buildConfig(c || this.cfg); }
    isDirty() { return !this.startup || JSON.stringify(this.startup) !== JSON.stringify(this.cfg); }

    prompt() {
      const h = this.cfg.hostname;
      if (this.state === "rommon") return `rommon ${this.romCount} > `;
      const m = { user: ">", priv: "#", config: "(config)#", if: this.ctx.range ? "(config-if-range)#" : this.ctx.iface && this.ctx.iface.includes(".") ? "(config-subif)#" : "(config-if)#", rip: "(config-router)#", ospf: "(config-router)#", eigrp: "(config-router)#", line: "(config-line)#", dhcp: "(dhcp-config)#", nacl: this.ctx.aclType === "standard" ? "(config-std-nacl)#" : "(config-ext-nacl)#" };
      return h + (m[this.mode] || "#");
    }
  }

  // ───────────────────────── 파서 ─────────────────────────
  const PH = ["A.B.C.D", "<마스크>", "<와일드카드>", "<숫자>", "<이름>", "<인터페이스>", "<텍스트>"];
  const SPEC = { lit: 6, "A.B.C.D": 5, "<마스크>": 5, "<와일드카드>": 5, "<인터페이스>": 4, "<숫자>": 3, "<이름>": 2, "<텍스트>": 1 };

  function tokenize(line) {
    const out = []; const re = /\S+/g; let m;
    while ((m = re.exec(line))) out.push({ t: m[0], pos: m.index });
    return out;
  }
  // 한 패턴에 대해 입력 토큰을 맞춰 본다
  function matchOne(ptoks, itoks) {
    let pi = 0, ii = 0; const args = [], score = [];
    while (pi < ptoks.length) {
      const p = ptoks[pi];
      if (ii >= itoks.length) return { status: "incomplete", pi, ii, args, score };
      const it = itoks[ii].t;
      if (p === "<텍스트>") { args.push(itoks.slice(ii).map(x => x.t).join(" ")); score.push(1); ii = itoks.length; pi++; continue; }
      if (p === "<인터페이스>") {
        let n = normIface(it), used = 1;
        if (!n && ii + 1 < itoks.length && /^[a-z]+$/i.test(it)) { n = normIface(it + itoks[ii + 1].t); used = 2; }
        if (!n) return { status: "fail", at: ii, pi, args, score };
        args.push(n); score.push(4); ii += used; pi++; continue;
      }
      if (p === "A.B.C.D" || p === "<마스크>" || p === "<와일드카드>") { if (!isIp(it)) return { status: "fail", at: ii, pi, args, score }; args.push(it); score.push(5); ii++; pi++; continue; }
      if (p === "<숫자>") { if (!/^\d+$/.test(it)) return { status: "fail", at: ii, pi, args, score }; args.push(it); score.push(3); ii++; pi++; continue; }
      if (p === "<이름>") { args.push(it); score.push(2); ii++; pi++; continue; }
      // 리터럴
      const low = it.toLowerCase();
      if (p.toLowerCase() === low) { score.push(7); ii++; pi++; continue; }
      if (p.toLowerCase().startsWith(low)) { score.push(6); ii++; pi++; continue; }
      return { status: "fail", at: ii, pi, args, score };
    }
    if (ii < itoks.length) return { status: "fail", at: ii, pi, args, score, extra: true };
    return { status: "ok", args, score };
  }
  function parse(mode, line) {
    const itoks = tokenize(line);
    if (!itoks.length) return { empty: true };
    const pats = GRAMMAR[mode] || [];
    const res = pats.map(p => ({ p, r: matchOne(p.toks, itoks) }));
    const oks = res.filter(x => x.r.status === "ok");
    // 리터럴 모호성 검사: 같은 위치에서 서로 다른 리터럴에 접두 일치(정확 일치 없음)
    for (let k = 0; k < itoks.length; k++) {
      const low = itoks[k].t.toLowerCase();
      const lits = new Set();
      let exact = false;
      for (const x of res) {
        const prefixOk = x.r.status === "ok" || x.r.status === "incomplete" || (x.r.at !== undefined && x.r.at > k);
        if (!prefixOk) continue;
        const pt = x.p.toks[k];
        if (!pt || PH.includes(pt)) continue;
        if (pt.toLowerCase() === low) exact = true;
        else if (pt.toLowerCase().startsWith(low)) lits.add(pt);
      }
      if (!exact && lits.size > 1) {
        // 이미 앞쪽 토큰이 같아야 진짜 모호
        return { error: "ambiguous", token: itoks[k].t, line };
      }
    }
    if (oks.length) {
      oks.sort((a, b) => { for (let i = 0; i < Math.max(a.r.score.length, b.r.score.length); i++) { const d = (b.r.score[i] || 0) - (a.r.score[i] || 0); if (d) return d; } return 0; });
      return { pat: oks[0].p.pat, args: oks[0].r.args, implicit: oks[0].p.implicit, itoks };
    }
    if (res.some(x => x.r.status === "incomplete")) return { error: "incomplete" };
    const far = Math.max(...res.map(x => x.r.at === undefined ? 0 : x.r.at));
    return { error: "invalid", pos: itoks[Math.min(far, itoks.length - 1)].pos };
  }
  // ? 도움말
  function helpFor(mode, line) {
    const endsSpace = line === "" || /\s$/.test(line);
    const itoks = tokenize(line);
    const pats = GRAMMAR[mode] || [];
    const done = endsSpace ? itoks : itoks.slice(0, -1);
    const partial = endsSpace ? "" : itoks[itoks.length - 1].t.toLowerCase();
    const items = new Map(); let cr = false;
    for (const p of pats) {
      const r = matchOne(p.toks, done);
      let next;
      if (r.status === "ok") { if (endsSpace && !partial) cr = true; if (p.toks[p.toks.length - 1] === "<텍스트>" && done.length >= p.toks.length) cr = true; continue; }
      if (r.status !== "incomplete") continue;
      next = p.toks[r.pi];
      if (!next) continue;
      if (PH.includes(next)) { if (!partial || next === "<텍스트>" || next === "<이름>" || (next === "<숫자>" && /^\d+$/.test(partial)) || next === "<인터페이스>") items.set(next, PH_HELP[next]); }
      else if (next.toLowerCase().startsWith(partial)) items.set(next, HELP[next] || "");
    }
    return { items: [...items.entries()].sort((a, b) => (PH.includes(a[0]) - PH.includes(b[0])) || a[0].localeCompare(b[0])), cr, partial: !endsSpace };
  }
  // Tab 완성: 한 개면 완성, 여러 개면 공통 앞부분까지 늘리고 더 못 늘리면 후보 목록을 돌려줌
  const IF_NAMES = ["GigabitEthernet", "Serial", "Loopback"];
  function complete(mode, line) {
    const h = helpFor(mode, line);
    if (!h.partial) return null;
    const partial = (line.match(/\S+$/) || [""])[0];
    const low = partial.toLowerCase();
    const keys = h.items.map(x => x[0]);
    const cands = keys.filter(x => !PH.includes(x));
    if (keys.includes("<인터페이스>")) {
      const full = normIface(partial);
      if (full && !cands.length) return line.replace(/\S+$/, full) + " ";
      IF_NAMES.forEach(n => { if (n.toLowerCase().startsWith(low) && n.toLowerCase() !== low) cands.push(n); });
    }
    if (!cands.length) return null;
    const isIf = x => IF_NAMES.includes(x);
    if (cands.length === 1) return line.replace(/\S+$/, cands[0]) + (isIf(cands[0]) ? "" : " ");
    let lcp = cands[0].toLowerCase();
    for (const c of cands) { let i = 0; while (i < lcp.length && i < c.length && lcp[i] === c[i].toLowerCase()) i++; lcp = lcp.slice(0, i); }
    if (lcp.length > low.length) return line.replace(/\S+$/, cands[0].slice(0, lcp.length));
    return { cands: cands.sort() };
  }

  window.RouterSim = { Router, parse, helpFor, complete, GRAMMAR, COMMAND_COUNT, W, util: { ip2n, n2ip, isIp, maskLen, lenMask, netOf, inNet, wcMatch, classfulNet, classfulLen, brdOf, v6expand, v6short, v6inNet, parseV6Pfx, type5, type7, type9, normIface, shortIf, isLoop, newIface, factoryConfig, clone, PHYS, MAC, CONNECTED } };
})();
