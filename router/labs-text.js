// README.md의 실습 설명·과제·모범 답안을 그대로 옮긴 데이터 (자동 생성)
window.LAB_TEXT = [
 {
  "n": 1,
  "title": "처음 받은 라우터 잠그기",
  "desc": "공장 초기 상태의 라우터입니다. 이름을 붙이고 비밀번호를 걸어 아무나 설정을 바꾸지 못하게 한 다음 저장하세요.",
  "tasks": [
   {
    "text": "호스트 이름을 R1로 바꾸기",
    "note": ""
   },
   {
    "text": "특권 모드 비밀번호를 class로 (enable secret)",
    "note": ""
   },
   {
    "text": "콘솔 비밀번호 cisco, 로그인 시 확인",
    "note": ""
   },
   {
    "text": "접속 경고 배너(MOTD) 달기",
    "note": ""
   },
   {
    "text": "설정 파일 속 평문 비밀번호 암호화",
    "note": ""
   },
   {
    "text": "설정을 startup-config에 저장",
    "note": "저장한 뒤 설정을 또 바꾸면 이 항목이 풀립니다. exit 로 로그아웃해 콘솔 비밀번호도 시험해 보세요."
   }
  ],
  "answer": [
   {
    "title": "호스트 이름을 R1로 바꾸기",
    "lines": [
     "enable",
     "configure terminal",
     "hostname R1"
    ]
   },
   {
    "title": "특권 모드 비밀번호를 class로 (enable secret)",
    "lines": [
     "enable secret class"
    ]
   },
   {
    "title": "콘솔 비밀번호 cisco, 로그인 시 확인",
    "lines": [
     "line console 0",
     "password cisco",
     "login",
     "exit"
    ]
   },
   {
    "title": "접속 경고 배너(MOTD) 달기",
    "lines": [
     "banner motd #Authorized access only#"
    ]
   },
   {
    "title": "설정 파일 속 평문 비밀번호 암호화",
    "lines": [
     "service password-encryption"
    ]
   },
   {
    "title": "설정을 startup-config에 저장",
    "lines": [
     "end",
     "copy running-config startup-config"
    ]
   }
  ]
 },
 {
  "n": 2,
  "title": "포트에 IP 주소 주고 켜기",
  "desc": "라우터 포트는 처음에 꺼져 있습니다. G0/0 192.168.1.1/24, S0/0/0 10.0.0.1/30, G0/1 203.0.113.2/30을 넣고 켠 뒤 이웃까지 ping이 가는지 확인하세요.",
  "tasks": [
   {
    "text": "G0/0에 192.168.1.1 255.255.255.0 설정하고 켜기",
    "note": ""
   },
   {
    "text": "G0/0에 설명(description) 달기",
    "note": ""
   },
   {
    "text": "S0/0/0에 10.0.0.1 255.255.255.252 설정하고 켜기",
    "note": ""
   },
   {
    "text": "G0/1에 203.0.113.2 255.255.255.252 설정하고 켜기",
    "note": ""
   },
   {
    "text": "show ip interface brief 로 상태 확인",
    "note": ""
   },
   {
    "text": "PC1(192.168.1.10)까지 ping 성공",
    "note": "이더넷은 첫 ping에서 ARP를 하느라 첫 칸이 . 으로 나옵니다."
   },
   {
    "text": "R2(10.0.0.2)까지 ping 성공",
    "note": ""
   }
  ],
  "answer": [
   {
    "title": "G0/0에 192.168.1.1 255.255.255.0 설정하고 켜기",
    "lines": [
     "enable",
     "configure terminal",
     "interface g0/0",
     "ip address 192.168.1.1 255.255.255.0",
     "no shutdown"
    ]
   },
   {
    "title": "G0/0에 설명(description) 달기",
    "lines": [
     "description LAN to SW1"
    ]
   },
   {
    "title": "S0/0/0에 10.0.0.1 255.255.255.252 설정하고 켜기",
    "lines": [
     "interface s0/0/0",
     "ip address 10.0.0.1 255.255.255.252",
     "no shutdown"
    ]
   },
   {
    "title": "G0/1에 203.0.113.2 255.255.255.252 설정하고 켜기",
    "lines": [
     "interface g0/1",
     "ip address 203.0.113.2 255.255.255.252",
     "no shutdown"
    ]
   },
   {
    "title": "show ip interface brief 로 상태 확인",
    "lines": [
     "do show ip interface brief"
    ]
   },
   {
    "title": "PC1(192.168.1.10)까지 ping 성공",
    "lines": [
     "do ping 192.168.1.10"
    ]
   },
   {
    "title": "R2(10.0.0.2)까지 ping 성공",
    "lines": [
     "do ping 10.0.0.2"
    ]
   }
  ]
 },
 {
  "n": 3,
  "title": "정적 경로와 기본 경로",
  "desc": "포트 설정은 끝나 있습니다. R1은 직접 붙은 네트워크만 알기 때문에 R2 뒤의 172.16.0.0/24와 인터넷으로 가는 길을 알려줘야 합니다.",
  "tasks": [
   {
    "text": "먼저 ping 172.16.0.1 이 실패하는 것 확인",
    "note": ""
   },
   {
    "text": "172.16.0.0/24 → 10.0.0.2 정적 경로 추가",
    "note": ""
   },
   {
    "text": "show ip route 에서 S 경로 확인",
    "note": ""
   },
   {
    "text": "R2 뒤 172.16.0.1까지 ping 성공",
    "note": ""
   },
   {
    "text": "기본 경로 0.0.0.0/0 → ISP(203.0.113.1)",
    "note": ""
   },
   {
    "text": "인터넷 8.8.8.8까지 ping 성공",
    "note": ""
   },
   {
    "text": "예비 경로: 172.16.0.0/24 → G0/1, 관리 거리 200",
    "note": "관리 거리가 커서 평소엔 테이블에 안 보이고, 주 경로가 죽으면 대신 올라옵니다 (floating static)."
   }
  ],
  "answer": [
   {
    "title": "먼저 ping 172.16.0.1 이 실패하는 것 확인",
    "lines": [
     "ping 172.16.0.1"
    ]
   },
   {
    "title": "172.16.0.0/24 → 10.0.0.2 정적 경로 추가",
    "lines": [
     "enable",
     "configure terminal",
     "ip route 172.16.0.0 255.255.255.0 10.0.0.2"
    ]
   },
   {
    "title": "show ip route 에서 S 경로 확인",
    "lines": [
     "do show ip route"
    ]
   },
   {
    "title": "R2 뒤 172.16.0.1까지 ping 성공",
    "lines": [
     "do ping 172.16.0.1"
    ]
   },
   {
    "title": "기본 경로 0.0.0.0/0 → ISP(203.0.113.1)",
    "lines": [
     "ip route 0.0.0.0 0.0.0.0 203.0.113.1"
    ]
   },
   {
    "title": "인터넷 8.8.8.8까지 ping 성공",
    "lines": [
     "do ping 8.8.8.8"
    ]
   },
   {
    "title": "예비 경로: 172.16.0.0/24 → G0/1, 관리 거리 200",
    "lines": [
     "ip route 172.16.0.0 255.255.255.0 203.0.113.1 200"
    ]
   }
  ]
 },
 {
  "n": 4,
  "title": "RIPv2로 경로 자동으로 배우기",
  "desc": "R2는 RIP 버전 2로 172.16.0.0/24를 알리고 있습니다. R1에서도 RIPv2를 켜서 경로를 주고받으세요. 버전을 안 정하면 R1은 v1으로 보내고 R2는 그걸 무시합니다.",
  "tasks": [
   {
    "text": "router rip 들어가서 version 2",
    "note": ""
   },
   {
    "text": "network 192.168.1.0 과 10.0.0.0 광고",
    "note": ""
   },
   {
    "text": "자동 요약 끄기",
    "note": ""
   },
   {
    "text": "G0/0을 passive-interface로",
    "note": ""
   },
   {
    "text": "라우팅 테이블에 R 경로(172.16.0.0/24) 생김",
    "note": ""
   },
   {
    "text": "PC1에서 원격 서버까지 통신 (아래 PC 확인)",
    "note": "R2가 RIP로 192.168.1.0/24를 배워야 돌아오는 길이 생깁니다."
   }
  ],
  "answer": [
   {
    "title": "router rip 들어가서 version 2",
    "lines": [
     "enable",
     "configure terminal",
     "router rip",
     "version 2"
    ]
   },
   {
    "title": "network 192.168.1.0 과 10.0.0.0 광고",
    "lines": [
     "network 192.168.1.0",
     "network 10.0.0.0"
    ]
   },
   {
    "title": "자동 요약 끄기",
    "lines": [
     "no auto-summary"
    ]
   },
   {
    "title": "G0/0을 passive-interface로",
    "lines": [
     "passive-interface g0/0"
    ]
   },
   {
    "title": "라우팅 테이블에 R 경로(172.16.0.0/24) 생김",
    "lines": [
     "do show ip route"
    ]
   },
   {
    "title": "PC1에서 원격 서버까지 통신 (아래 PC 확인)",
    "lines": [
     "do show ip protocols"
    ]
   }
  ]
 },
 {
  "n": 5,
  "title": "단일 영역 OSPF 이웃 맺기",
  "desc": "R2는 OSPF 영역 0에서 라우터 ID 2.2.2.2로 동작 중입니다. 루프백으로 R1의 ID를 정하고, 시리얼과 LAN을 영역 0에 넣어 이웃(FULL)을 맺으세요.",
  "tasks": [
   {
    "text": "Loopback0에 1.1.1.1/32",
    "note": ""
   },
   {
    "text": "router ospf 1, router-id 1.1.1.1",
    "note": ""
   },
   {
    "text": "시리얼 10.0.0.0/30을 영역 0에",
    "note": ""
   },
   {
    "text": "LAN 192.168.1.0/24도 영역 0에, G0/0은 passive",
    "note": ""
   },
   {
    "text": "show ip ospf neighbor 에서 2.2.2.2 FULL",
    "note": ""
   },
   {
    "text": "R2 루프백 2.2.2.2까지 ping",
    "note": ""
   },
   {
    "text": "루프백을 출발지로 ping 172.16.0.1",
    "note": "R2가 OSPF로 1.1.1.1을 배우지 못하면 실패합니다. 루프백도 network 로 넣어 보세요."
   }
  ],
  "answer": [
   {
    "title": "Loopback0에 1.1.1.1/32",
    "lines": [
     "enable",
     "configure terminal",
     "interface loopback 0",
     "ip address 1.1.1.1 255.255.255.255"
    ]
   },
   {
    "title": "router ospf 1, router-id 1.1.1.1",
    "lines": [
     "router ospf 1",
     "router-id 1.1.1.1"
    ]
   },
   {
    "title": "시리얼 10.0.0.0/30을 영역 0에",
    "lines": [
     "network 10.0.0.0 0.0.0.3 area 0"
    ]
   },
   {
    "title": "LAN 192.168.1.0/24도 영역 0에, G0/0은 passive",
    "lines": [
     "network 192.168.1.0 0.0.0.255 area 0",
     "passive-interface g0/0"
    ]
   },
   {
    "title": "show ip ospf neighbor 에서 2.2.2.2 FULL",
    "lines": [
     "do show ip ospf neighbor"
    ]
   },
   {
    "title": "R2 루프백 2.2.2.2까지 ping",
    "lines": [
     "do ping 2.2.2.2"
    ]
   },
   {
    "title": "루프백을 출발지로 ping 172.16.0.1",
    "lines": [
     "network 1.1.1.1 0.0.0.0 area 0",
     "do ping 172.16.0.1 source loopback 0"
    ]
   }
  ]
 },
 {
  "n": 6,
  "title": "EIGRP AS 100 붙이기",
  "desc": "R2는 EIGRP AS 100으로 동작합니다. AS 번호가 다르면 이웃이 맺어지지 않습니다. 와일드카드 마스크로 필요한 네트워크만 넣어 보세요.",
  "tasks": [
   {
    "text": "router eigrp 100",
    "note": ""
   },
   {
    "text": "10.0.0.0/30과 192.168.1.0/24 광고 (와일드카드)",
    "note": ""
   },
   {
    "text": "자동 요약 끄고 router-id 1.1.1.1",
    "note": ""
   },
   {
    "text": "show ip eigrp neighbors 에 10.0.0.2",
    "note": ""
   },
   {
    "text": "D 경로 확인 (show ip route eigrp)",
    "note": ""
   },
   {
    "text": "PC1에서 원격 서버까지 통신",
    "note": ""
   }
  ],
  "answer": [
   {
    "title": "router eigrp 100",
    "lines": [
     "enable",
     "configure terminal",
     "router eigrp 100"
    ]
   },
   {
    "title": "10.0.0.0/30과 192.168.1.0/24 광고 (와일드카드)",
    "lines": [
     "network 10.0.0.0 0.0.0.3",
     "network 192.168.1.0 0.0.0.255"
    ]
   },
   {
    "title": "자동 요약 끄고 router-id 1.1.1.1",
    "lines": [
     "no auto-summary",
     "eigrp router-id 1.1.1.1"
    ]
   },
   {
    "title": "show ip eigrp neighbors 에 10.0.0.2",
    "lines": [
     "do show ip eigrp neighbors"
    ]
   },
   {
    "title": "D 경로 확인 (show ip route eigrp)",
    "lines": [
     "do show ip route eigrp"
    ]
   },
   {
    "title": "PC1에서 원격 서버까지 통신",
    "lines": [
     "do show ip eigrp topology"
    ]
   }
  ]
 },
 {
  "n": 7,
  "title": "R1을 DHCP 서버로",
  "desc": "PC3은 주소를 자동으로 받습니다. 라우터와 고정 주소 장비(.1~.20)를 빼고 나머지를 나눠 주는 풀을 만드세요. 제외하지 않으면 라우터가 충돌을 감지합니다.",
  "tasks": [
   {
    "text": "192.168.1.1 ~ 192.168.1.20 제외",
    "note": ""
   },
   {
    "text": "풀 LAN 만들고 network 192.168.1.0 /24",
    "note": ""
   },
   {
    "text": "기본 게이트웨이 192.168.1.1, DNS 8.8.8.8",
    "note": ""
   },
   {
    "text": "PC3이 주소를 받음",
    "note": ""
   },
   {
    "text": "show ip dhcp binding 으로 임대 확인",
    "note": ""
   },
   {
    "text": "G0/1은 ISP에게 DHCP로 주소 받기",
    "note": "ISP가 기본 경로(S* 관리 거리 254)도 함께 줍니다."
   }
  ],
  "answer": [
   {
    "title": "192.168.1.1 ~ 192.168.1.20 제외",
    "lines": [
     "enable",
     "configure terminal",
     "ip dhcp excluded-address 192.168.1.1 192.168.1.20"
    ]
   },
   {
    "title": "풀 LAN 만들고 network 192.168.1.0 /24",
    "lines": [
     "ip dhcp pool LAN",
     "network 192.168.1.0 255.255.255.0"
    ]
   },
   {
    "title": "기본 게이트웨이 192.168.1.1, DNS 8.8.8.8",
    "lines": [
     "default-router 192.168.1.1",
     "dns-server 8.8.8.8"
    ]
   },
   {
    "title": "PC3이 주소를 받음",
    "lines": [
     "end",
     "show ip dhcp binding"
    ]
   },
   {
    "title": "show ip dhcp binding 으로 임대 확인",
    "lines": [
     "show ip dhcp binding"
    ]
   },
   {
    "title": "G0/1은 ISP에게 DHCP로 주소 받기",
    "lines": [
     "configure terminal",
     "interface g0/1",
     "ip address dhcp"
    ]
   }
  ]
 },
 {
  "n": 8,
  "title": "PAT로 LAN을 인터넷에 내보내기",
  "desc": "기본 경로와 OSPF는 이미 있습니다. 그런데 PC들은 사설 주소라 인터넷에서 답이 돌아오지 못합니다. G0/1 주소 하나로 여러 PC를 변환(overload)하세요.",
  "tasks": [
   {
    "text": "PC1 → 인터넷이 실패하는 이유 확인 (아래 PC 확인)",
    "note": ""
   },
   {
    "text": "ACL 1: 192.168.1.0/24 허용",
    "note": ""
   },
   {
    "text": "G0/0은 inside, G0/1은 outside",
    "note": ""
   },
   {
    "text": "ip nat inside source list 1 interface g0/1 overload",
    "note": ""
   },
   {
    "text": "PC1·PC2 모두 인터넷 통신",
    "note": ""
   },
   {
    "text": "show ip nat translations 확인",
    "note": ""
   },
   {
    "text": "PC1을 공인 198.51.100.5로 정적 변환",
    "note": ""
   }
  ],
  "answer": [
   {
    "title": "PC1 → 인터넷이 실패하는 이유 확인 (아래 PC 확인)",
    "lines": [
     "enable",
     "show ip route"
    ]
   },
   {
    "title": "ACL 1: 192.168.1.0/24 허용",
    "lines": [
     "configure terminal",
     "access-list 1 permit 192.168.1.0 0.0.0.255"
    ]
   },
   {
    "title": "G0/0은 inside, G0/1은 outside",
    "lines": [
     "interface g0/0",
     "ip nat inside",
     "interface g0/1",
     "ip nat outside",
     "exit"
    ]
   },
   {
    "title": "ip nat inside source list 1 interface g0/1 overload",
    "lines": [
     "ip nat inside source list 1 interface g0/1 overload"
    ]
   },
   {
    "title": "PC1·PC2 모두 인터넷 통신",
    "lines": [
     "end"
    ]
   },
   {
    "title": "show ip nat translations 확인",
    "lines": [
     "show ip nat translations"
    ]
   },
   {
    "title": "PC1을 공인 198.51.100.5로 정적 변환",
    "lines": [
     "configure terminal",
     "ip nat inside source static 192.168.1.10 198.51.100.5"
    ]
   }
  ]
 },
 {
  "n": 9,
  "title": "확장 ACL로 PC2만 서버 차단",
  "desc": "모든 PC가 서버와 인터넷에 갈 수 있는 상태입니다. PC2(192.168.1.20)만 원격 서버 대역 172.16.0.0/24에 못 가게 하고 나머지는 그대로 두세요. 확장 ACL은 출발지 가까이에 둡니다.",
  "tasks": [
   {
    "text": "이름 있는 확장 ACL BLOCK-PC2 만들기",
    "note": ""
   },
   {
    "text": "PC2 → 172.16.0.0/24 거부, 나머지 허용",
    "note": ""
   },
   {
    "text": "G0/0 들어오는 방향에 적용",
    "note": ""
   },
   {
    "text": "PC2 → 서버 차단, PC1 → 서버 허용",
    "note": ""
   },
   {
    "text": "PC2 → 인터넷은 그대로 됨",
    "note": ""
   },
   {
    "text": "show access-lists 에서 일치 횟수 확인",
    "note": ""
   }
  ],
  "answer": [
   {
    "title": "이름 있는 확장 ACL BLOCK-PC2 만들기",
    "lines": [
     "enable",
     "configure terminal",
     "ip access-list extended BLOCK-PC2"
    ]
   },
   {
    "title": "PC2 → 172.16.0.0/24 거부, 나머지 허용",
    "lines": [
     "remark PC2 cannot reach server LAN",
     "deny ip host 192.168.1.20 172.16.0.0 0.0.0.255",
     "permit ip any any",
     "exit"
    ]
   },
   {
    "title": "G0/0 들어오는 방향에 적용",
    "lines": [
     "interface g0/0",
     "ip access-group BLOCK-PC2 in",
     "end"
    ]
   },
   {
    "title": "PC2 → 서버 차단, PC1 → 서버 허용",
    "lines": [
     "show access-lists"
    ]
   },
   {
    "title": "PC2 → 인터넷은 그대로 됨",
    "lines": [
     "show ip interface g0/0"
    ]
   },
   {
    "title": "show access-lists 에서 일치 횟수 확인",
    "lines": [
     "show access-lists"
    ]
   }
  ]
 },
 {
  "n": 10,
  "title": "콘솔 편의 · 로그 · 이름 조회",
  "desc": "매일 쓰는 콘솔을 편하게 만들고 로그와 시간을 정리합니다. 일부러 없는 명령(예: shw)을 쳐서 DNS 조회로 멈추는 것도 겪어 보세요.",
  "tasks": [
   {
    "text": "오타가 DNS 조회로 멈추지 않게",
    "note": ""
   },
   {
    "text": "콘솔: logging synchronous, exec-timeout 5 0",
    "note": ""
   },
   {
    "text": "ip host SRV 172.16.0.10 → ping SRV",
    "note": ""
   },
   {
    "text": "로그를 버퍼에 저장하고 show logging",
    "note": ""
   },
   {
    "text": "시간대 KST +9 지정",
    "note": ""
   },
   {
    "text": "--More-- 없이 출력: terminal length 0",
    "note": ""
   },
   {
    "text": "show run | section line 처럼 파이프 써 보기",
    "note": ""
   },
   {
    "text": "PC1 TFTP 서버에 설정 백업",
    "note": ""
   }
  ],
  "answer": [
   {
    "title": "오타가 DNS 조회로 멈추지 않게",
    "lines": [
     "enable",
     "configure terminal",
     "no ip domain-lookup"
    ]
   },
   {
    "title": "콘솔: logging synchronous, exec-timeout 5 0",
    "lines": [
     "line console 0",
     "logging synchronous",
     "exec-timeout 5 0",
     "exit"
    ]
   },
   {
    "title": "ip host SRV 172.16.0.10 → ping SRV",
    "lines": [
     "ip host SRV 172.16.0.10",
     "do ping SRV"
    ]
   },
   {
    "title": "로그를 버퍼에 저장하고 show logging",
    "lines": [
     "logging buffered 16384",
     "do show logging"
    ]
   },
   {
    "title": "시간대 KST +9 지정",
    "lines": [
     "clock timezone KST 9",
     "do show clock"
    ]
   },
   {
    "title": "--More-- 없이 출력: terminal length 0",
    "lines": [
     "end",
     "terminal length 0",
     "show running-config"
    ]
   },
   {
    "title": "show run | section line 처럼 파이프 써 보기",
    "lines": [
     "show running-config | section line"
    ]
   },
   {
    "title": "PC1 TFTP 서버에 설정 백업",
    "lines": [
     "copy running-config tftp:",
     "192.168.1.10"
    ]
   }
  ]
 },
 {
  "n": 11,
  "title": "SSH로만 원격 접속 받기",
  "desc": "관리자는 PC1에서 SSH로 들어옵니다. 사용자 계정, 도메인, RSA 키가 있어야 SSH가 켜집니다. 원격 접속은 PC1만 허용하세요.",
  "tasks": [
   {
    "text": "도메인 이름 lab.local",
    "note": ""
   },
   {
    "text": "사용자 admin, 권한 15, secret 지정",
    "note": ""
   },
   {
    "text": "RSA 키 1024비트 이상 만들기",
    "note": ""
   },
   {
    "text": "SSH 버전 2만 쓰기",
    "note": ""
   },
   {
    "text": "vty: login local, transport input ssh",
    "note": ""
   },
   {
    "text": "PC1만 vty 접속 허용 (access-class)",
    "note": ""
   },
   {
    "text": "PC1 → R1 SSH 접속 성공 (아래 PC 확인)",
    "note": ""
   },
   {
    "text": "저장",
    "note": ""
   }
  ],
  "answer": [
   {
    "title": "도메인 이름 lab.local",
    "lines": [
     "enable",
     "configure terminal",
     "ip domain-name lab.local"
    ]
   },
   {
    "title": "사용자 admin, 권한 15, secret 지정",
    "lines": [
     "username admin privilege 15 secret Cisco123"
    ]
   },
   {
    "title": "RSA 키 1024비트 이상 만들기",
    "lines": [
     "crypto key generate rsa general-keys modulus 2048"
    ]
   },
   {
    "title": "SSH 버전 2만 쓰기",
    "lines": [
     "ip ssh version 2"
    ]
   },
   {
    "title": "vty: login local, transport input ssh",
    "lines": [
     "line vty 0 4",
     "login local",
     "transport input ssh",
     "exit"
    ]
   },
   {
    "title": "PC1만 vty 접속 허용 (access-class)",
    "lines": [
     "access-list 10 permit host 192.168.1.10",
     "line vty 0 4",
     "access-class 10 in",
     "end"
    ]
   },
   {
    "title": "PC1 → R1 SSH 접속 성공 (아래 PC 확인)",
    "lines": [
     "show ip ssh"
    ]
   },
   {
    "title": "저장",
    "lines": [
     "write memory"
    ]
   }
  ]
 },
 {
  "n": 12,
  "title": "IPv6 주소와 정적 경로",
  "desc": "R2는 시리얼에 2001:DB8:12::2/64, 뒤쪽 LAN에 2001:DB8:172::/64를 갖고 있고, 2001:DB8:1::/64로 돌아오는 경로도 알고 있습니다.",
  "tasks": [
   {
    "text": "IPv6 라우팅 켜기",
    "note": ""
   },
   {
    "text": "G0/0에 2001:DB8:1::1/64",
    "note": ""
   },
   {
    "text": "S0/0/0에 2001:DB8:12::1/64",
    "note": ""
   },
   {
    "text": "링크 로컬 주소 확인 (show ipv6 interface brief)",
    "note": ""
   },
   {
    "text": "R2(2001:DB8:12::2)까지 ping",
    "note": ""
   },
   {
    "text": "2001:DB8:172::/64 → 2001:DB8:12::2 정적 경로",
    "note": ""
   },
   {
    "text": "서버 2001:DB8:172::10까지 ping, PC1도 통신",
    "note": ""
   }
  ],
  "answer": [
   {
    "title": "IPv6 라우팅 켜기",
    "lines": [
     "enable",
     "configure terminal",
     "ipv6 unicast-routing"
    ]
   },
   {
    "title": "G0/0에 2001:DB8:1::1/64",
    "lines": [
     "interface g0/0",
     "ipv6 address 2001:DB8:1::1/64"
    ]
   },
   {
    "title": "S0/0/0에 2001:DB8:12::1/64",
    "lines": [
     "interface s0/0/0",
     "ipv6 address 2001:DB8:12::1/64",
     "exit"
    ]
   },
   {
    "title": "링크 로컬 주소 확인 (show ipv6 interface brief)",
    "lines": [
     "do show ipv6 interface brief"
    ]
   },
   {
    "title": "R2(2001:DB8:12::2)까지 ping",
    "lines": [
     "do ping 2001:DB8:12::2"
    ]
   },
   {
    "title": "2001:DB8:172::/64 → 2001:DB8:12::2 정적 경로",
    "lines": [
     "ipv6 route 2001:DB8:172::/64 2001:DB8:12::2"
    ]
   },
   {
    "title": "서버 2001:DB8:172::10까지 ping, PC1도 통신",
    "lines": [
     "do ping 2001:DB8:172::10"
    ]
   }
  ]
 },
 {
  "n": 13,
  "title": "고장 난 라우터 고치기",
  "desc": "누군가 설정을 망가뜨리고 저장까지 해 버렸습니다. 원래는 실습 5처럼 OSPF로 R2와 붙고 기본 경로로 인터넷에 나가야 합니다. show 명령으로 원인을 찾아 고치세요.",
  "tasks": [
   {
    "text": "PC들이 게이트웨이(R1)에 닿게 하기",
    "note": ""
   },
   {
    "text": "R2(10.0.0.2)까지 ping 되게 하기",
    "note": ""
   },
   {
    "text": "OSPF 이웃 2.2.2.2와 FULL",
    "note": "debug ip ospf hello 를 켜면 어떤 값이 안 맞는지 보입니다."
   },
   {
    "text": "G0/1 마스크 바로잡기 (ISP는 /30)",
    "note": ""
   },
   {
    "text": "8.8.8.8까지 ping 되게 하기",
    "note": ""
   },
   {
    "text": "PC1 → 원격 서버 통신",
    "note": ""
   },
   {
    "text": "고친 설정 저장",
    "note": ""
   }
  ],
  "answer": [
   {
    "title": "PC들이 게이트웨이(R1)에 닿게 하기",
    "lines": [
     "enable",
     "show ip interface brief",
     "configure terminal",
     "interface g0/0",
     "no shutdown"
    ]
   },
   {
    "title": "R2(10.0.0.2)까지 ping 되게 하기",
    "lines": [
     "do show interfaces s0/0/0",
     "interface s0/0/0",
     "encapsulation hdlc",
     "ip address 10.0.0.1 255.255.255.252",
     "do ping 10.0.0.2"
    ]
   },
   {
    "title": "OSPF 이웃 2.2.2.2와 FULL",
    "lines": [
     "do show ip ospf interface s0/0/0",
     "no ip ospf hello-interval"
    ]
   },
   {
    "title": "G0/1 마스크 바로잡기 (ISP는 /30)",
    "lines": [
     "interface g0/1",
     "ip address 203.0.113.2 255.255.255.252",
     "exit"
    ]
   },
   {
    "title": "8.8.8.8까지 ping 되게 하기",
    "lines": [
     "do show ip route",
     "no ip route 0.0.0.0 0.0.0.0 203.0.113.5",
     "ip route 0.0.0.0 0.0.0.0 203.0.113.1",
     "do ping 8.8.8.8"
    ]
   },
   {
    "title": "PC1 → 원격 서버 통신",
    "lines": [
     "do show ip route ospf"
    ]
   },
   {
    "title": "고친 설정 저장",
    "lines": [
     "end",
     "write memory"
    ]
   }
  ]
 },
 {
  "n": 14,
  "title": "잊어버린 enable 비밀번호 복구",
  "desc": "enable 비밀번호를 아무도 모릅니다. 부팅 중 Break로 ROMMON에 들어가 설정 레지스터를 0x2142로 바꾸면 startup-config를 건너뛰고 부팅됩니다. 기존 설정은 지우지 말고 비밀번호만 바꾸세요.",
  "tasks": [
   {
    "text": "전원 재시작 후 Break로 ROMMON 진입",
    "note": ""
   },
   {
    "text": "confreg 0x2142 후 reset",
    "note": ""
   },
   {
    "text": "startup-config 없이 부팅됨",
    "note": ""
   },
   {
    "text": "enable 후 저장된 설정을 running-config로 가져오기",
    "note": ""
   },
   {
    "text": "새 enable secret 정하기",
    "note": ""
   },
   {
    "text": "설정 레지스터를 0x2102로 되돌리기",
    "note": ""
   },
   {
    "text": "꺼진 인터페이스 다시 켜기",
    "note": "copy start run은 합치기라서 꺼진 포트를 켜지 않습니다."
   },
   {
    "text": "저장",
    "note": ""
   }
  ],
  "answer": [
   {
    "title": "전원 재시작 후 Break로 ROMMON 진입",
    "lines": [
     "(전원 재시작 버튼 → 부팅 중 Break 버튼)"
    ]
   },
   {
    "title": "confreg 0x2142 후 reset",
    "lines": [
     "confreg 0x2142",
     "reset"
    ]
   },
   {
    "title": "startup-config 없이 부팅됨",
    "lines": [
     "no"
    ]
   },
   {
    "title": "enable 후 저장된 설정을 running-config로 가져오기",
    "lines": [
     "enable",
     "copy startup-config running-config"
    ]
   },
   {
    "title": "새 enable secret 정하기",
    "lines": [
     "configure terminal",
     "enable secret NewPass1"
    ]
   },
   {
    "title": "설정 레지스터를 0x2102로 되돌리기",
    "lines": [
     "config-register 0x2102"
    ]
   },
   {
    "title": "꺼진 인터페이스 다시 켜기",
    "lines": [
     "interface range g0/0 - 1",
     "no shutdown",
     "interface s0/0/0",
     "no shutdown",
     "end"
    ]
   },
   {
    "title": "저장",
    "lines": [
     "copy running-config startup-config"
    ]
   }
  ]
 },
 {
  "n": 0,
  "title": "아무거나 쳐 보기",
  "desc": "과제 없이 공장 초기 상태에서 시작합니다. 아래 \"전체 명령어 목록\"에서 쓸 수 있는 명령을 모두 볼 수 있어요.",
  "tasks": [],
  "answer": []
 }
];
