# 라우터 콘솔 연습장

시스코 IOS 스타일 명령어를 브라우저에서 직접 입력해 보며 익히는 시뮬레이터의 안내서입니다. 실습 14개와 자유 연습, 명령어 415개를 담고 있습니다.

- 실행 파일: `router/index.html` (브라우저로 열면 바로 동작)
- 진행 상황은 브라우저에만 저장됩니다.
- 실제 IOS의 명령과 동작을 단순화해 흉내 낸 연습용입니다.

## 목차

1. [네트워크 구성](#네트워크-구성)
2. [화면과 조작법](#화면과-조작법)
3. [모드와 핵심 명령](#모드와-핵심-명령)
4. [실습](#실습)
5. [전체 명령어 목록](#전체-명령어-목록)

## 네트워크 구성

```
                           ISP 203.0.113.1 ─── Internet 8.8.8.8, 1.1.1.1
                            │
                            │ G0/1  203.0.113.0/30
PC1 .10  ──┐                │
PC3 DHCP ──┼── SW1 ──────── R1 ──────────── R2 ─── 172.16.0.0/24 ─── SRV .10
PC2 .20  ──┘         G0/0       S0/0/0 (DTE)
              192.168.1.0/24    10.0.0.0/30
```

R1이 콘솔로 연결된 라우터입니다. 나머지 장비는 정해진 대로 동작합니다.

| 장비 | 포트 | 주소 | 비고 |
|---|---|---|---|
| PC1 | NIC | 192.168.1.10/24 | 게이트웨이 .1 · TFTP 서버 |
| PC2 | NIC | 192.168.1.20/24 | 게이트웨이 .1 |
| PC3 | NIC | DHCP | 주소를 자동으로 받음 |
| R2 | S0/1/0 | 10.0.0.2/30 | HDLC · RIPv2 · OSPF 0 · EIGRP 100 |
| R2 | S0/1/0 | 2001:DB8:12::2/64 | IPv6 |
| R2 | Lo0 | 2.2.2.2/32 | 라우터 ID |
| R2 | G0/0 | 172.16.0.1/24 | 2001:DB8:172::1/64 |
| SRV | NIC | 172.16.0.10 | 2001:DB8:172::10 |
| ISP | G0/0 | 203.0.113.1/30 | DHCP로 .2 를 줄 수도 있음 |
| ISP | — | 198.51.100.0/29 | R1에 할당된 공인 대역 |
| 인터넷 | — | 8.8.8.8 · 1.1.1.1 | dns.google 로도 조회 |

R1이 쓸 주소: G0/0 `192.168.1.1/24`, S0/0/0 `10.0.0.1/30`, G0/1 `203.0.113.2/30`, Loopback0 `1.1.1.1/32`, IPv6 G0/0 `2001:DB8:1::1/64`, S0/0/0 `2001:DB8:12::1/64`.

## 화면과 조작법

| 키 | 동작 |
|---|---|
| `Tab` | 명령어 자동완성 |
| `?` | 지금 칠 수 있는 명령 목록 (입력 중 바로 표시) |
| `↑` `↓` | 이전 명령 불러오기 |
| `Space` / `Enter` / `q` | `--More--`에서 다음 쪽 / 한 줄 / 그만 |
| `Ctrl+Z` | 특권 EXEC 모드로 바로 |
| `Ctrl+C` | 입력 취소 |
| `Break` | 부팅 중에 누르면 ROMMON 진입 |
| `Ctrl+A` / `Ctrl+E` | 줄 맨 앞 / 맨 끝으로 |
| `Ctrl+B` / `Ctrl+F` | 커서 한 칸 왼쪽 / 오른쪽 |
| `Ctrl+U` / `Ctrl+K` / `Ctrl+D` | 커서 앞 지우기 / 뒤 지우기 / 한 글자 지우기 |
| `Ctrl+P` | 이전 명령 (↑와 같음) |
| `Ctrl+R` / `Ctrl+L` | 입력 줄 다시 보기 / 화면 지우기 |
| `Ctrl+Shift+6` | ping·traceroute·이름 조회 중단 |
| `Esc` | 입력 줄 비우기 |
| `Ctrl+Break` / `Pause` | 키보드로 Break 보내기 |

- PC에서는 입력창을 누르지 않아도 됩니다. 페이지 어디서든 키를 치면 콘솔로 들어갑니다.
- 줄임말을 쓸 수 있습니다: `conf t`, `int g0/0`, `sh ip int br`, `wr`.
- **전원 재시작** 버튼: 저장하지 않은 설정이 사라집니다.
- **PC에서 본 연결** 패널: PC들이 서버·인터넷·SSH·IPv6로 실제 통신되는지와 안 되는 이유를 보여 줍니다.

## 모드와 핵심 명령

### 모드 이동

| 명령 | 설명 |
|---|---|
| `R1> → enable → R1#` | 사용자 EXEC → 특권 EXEC |
| `configure terminal` | 전역 설정 R1(config)# |
| `interface g0/0` | R1(config-if)# · range, 서브인터페이스 g0/0.10도 가능 |
| `router ospf 1 / rip / eigrp 100` | R1(config-router)# |
| `line console 0 / vty 0 4` | R1(config-line)# |
| `ip dhcp pool LAN` | R1(dhcp-config)# |
| `ip access-list extended NAME` | R1(config-ext-nacl)# |
| `exit · end · Ctrl+Z` | 한 단계 위로 · 특권 모드로 바로 |

### 확인할 때

| 명령 | 설명 |
|---|---|
| `show ip interface brief` | 포트 IP와 up/down 요약 |
| `show ip route` | C 연결 · S 정적 · R RIP · O OSPF · D EIGRP |
| `show running-config \| section router` | 파이프: include · exclude · begin · section · count |
| `show ip protocols` | 동작 중인 라우팅 프로토콜 |
| `show cdp neighbors` | 포트마다 붙은 장비 |
| `show interfaces s0/0/0` | 캡슐화, 대역폭, 상태 자세히 |
| `terminal length 0` | --More-- 없이 한 번에 출력 |

### 저장과 복구

| 명령 | 설명 |
|---|---|
| `copy running-config startup-config` | 저장 (write memory, wr) |
| `copy running-config tftp:` | PC1(192.168.1.10) TFTP 서버로 백업 |
| `reload · erase startup-config` | 재부팅 · 저장된 설정 지우기 |
| `Break → confreg 0x2142` | 비밀번호 복구 (ROMMON) |

### 문제 찾기

| 명령 | 설명 |
|---|---|
| `ping 172.16.0.1 source g0/0` | 출발지 바꿔 ping · ping 만 치면 확장 ping |
| `traceroute 8.8.8.8` | 경로 추적 |
| `debug ip rip · undebug all` | 디버그 켜고 끄기 (u all) |
| `show logging` | 지금까지의 로그 메시지 |

## 실습

각 실습은 아래 상태에서 시작합니다. 과제를 끝내면 화면 오른쪽 목록에 자동으로 체크됩니다. 명령 블록은 힌트를 순서대로 모은 모범 답안입니다.

### 실습 1 · 처음 받은 라우터 잠그기

공장 초기 상태의 라우터입니다. 이름을 붙이고 비밀번호를 걸어 아무나 설정을 바꾸지 못하게 한 다음 저장하세요.

**과제**

1. 호스트 이름을 R1로 바꾸기
2. 특권 모드 비밀번호를 class로 (enable secret)
3. 콘솔 비밀번호 cisco, 로그인 시 확인
4. 접속 경고 배너(MOTD) 달기
5. 설정 파일 속 평문 비밀번호 암호화
6. 설정을 startup-config에 저장  
   > 저장한 뒤 설정을 또 바꾸면 이 항목이 풀립니다. exit 로 로그아웃해 콘솔 비밀번호도 시험해 보세요.

<details><summary>모범 답안</summary>

```
! 호스트 이름을 R1로 바꾸기
enable
configure terminal
hostname R1
! 특권 모드 비밀번호를 class로 (enable secret)
enable secret class
! 콘솔 비밀번호 cisco, 로그인 시 확인
line console 0
password cisco
login
exit
! 접속 경고 배너(MOTD) 달기
banner motd #Authorized access only#
! 설정 파일 속 평문 비밀번호 암호화
service password-encryption
! 설정을 startup-config에 저장
end
copy running-config startup-config
```

</details>

### 실습 2 · 포트에 IP 주소 주고 켜기

라우터 포트는 처음에 꺼져 있습니다. G0/0 192.168.1.1/24, S0/0/0 10.0.0.1/30, G0/1 203.0.113.2/30을 넣고 켠 뒤 이웃까지 ping이 가는지 확인하세요.

**과제**

1. G0/0에 192.168.1.1 255.255.255.0 설정하고 켜기
2. G0/0에 설명(description) 달기
3. S0/0/0에 10.0.0.1 255.255.255.252 설정하고 켜기
4. G0/1에 203.0.113.2 255.255.255.252 설정하고 켜기
5. show ip interface brief 로 상태 확인
6. PC1(192.168.1.10)까지 ping 성공  
   > 이더넷은 첫 ping에서 ARP를 하느라 첫 칸이 . 으로 나옵니다.
7. R2(10.0.0.2)까지 ping 성공

<details><summary>모범 답안</summary>

```
! G0/0에 192.168.1.1 255.255.255.0 설정하고 켜기
enable
configure terminal
interface g0/0
ip address 192.168.1.1 255.255.255.0
no shutdown
! G0/0에 설명(description) 달기
description LAN to SW1
! S0/0/0에 10.0.0.1 255.255.255.252 설정하고 켜기
interface s0/0/0
ip address 10.0.0.1 255.255.255.252
no shutdown
! G0/1에 203.0.113.2 255.255.255.252 설정하고 켜기
interface g0/1
ip address 203.0.113.2 255.255.255.252
no shutdown
! show ip interface brief 로 상태 확인
do show ip interface brief
! PC1(192.168.1.10)까지 ping 성공
do ping 192.168.1.10
! R2(10.0.0.2)까지 ping 성공
do ping 10.0.0.2
```

</details>

### 실습 3 · 정적 경로와 기본 경로

포트 설정은 끝나 있습니다. R1은 직접 붙은 네트워크만 알기 때문에 R2 뒤의 172.16.0.0/24와 인터넷으로 가는 길을 알려줘야 합니다.

**과제**

1. 먼저 ping 172.16.0.1 이 실패하는 것 확인
2. 172.16.0.0/24 → 10.0.0.2 정적 경로 추가
3. show ip route 에서 S 경로 확인
4. R2 뒤 172.16.0.1까지 ping 성공
5. 기본 경로 0.0.0.0/0 → ISP(203.0.113.1)
6. 인터넷 8.8.8.8까지 ping 성공
7. 예비 경로: 172.16.0.0/24 → G0/1, 관리 거리 200  
   > 관리 거리가 커서 평소엔 테이블에 안 보이고, 주 경로가 죽으면 대신 올라옵니다 (floating static).

<details><summary>모범 답안</summary>

```
! 먼저 ping 172.16.0.1 이 실패하는 것 확인
ping 172.16.0.1
! 172.16.0.0/24 → 10.0.0.2 정적 경로 추가
enable
configure terminal
ip route 172.16.0.0 255.255.255.0 10.0.0.2
! show ip route 에서 S 경로 확인
do show ip route
! R2 뒤 172.16.0.1까지 ping 성공
do ping 172.16.0.1
! 기본 경로 0.0.0.0/0 → ISP(203.0.113.1)
ip route 0.0.0.0 0.0.0.0 203.0.113.1
! 인터넷 8.8.8.8까지 ping 성공
do ping 8.8.8.8
! 예비 경로: 172.16.0.0/24 → G0/1, 관리 거리 200
ip route 172.16.0.0 255.255.255.0 203.0.113.1 200
```

</details>

### 실습 4 · RIPv2로 경로 자동으로 배우기

R2는 RIP 버전 2로 172.16.0.0/24를 알리고 있습니다. R1에서도 RIPv2를 켜서 경로를 주고받으세요. 버전을 안 정하면 R1은 v1으로 보내고 R2는 그걸 무시합니다.

**과제**

1. router rip 들어가서 version 2
2. network 192.168.1.0 과 10.0.0.0 광고
3. 자동 요약 끄기
4. G0/0을 passive-interface로
5. 라우팅 테이블에 R 경로(172.16.0.0/24) 생김
6. PC1에서 원격 서버까지 통신 (아래 PC 확인)  
   > R2가 RIP로 192.168.1.0/24를 배워야 돌아오는 길이 생깁니다.

<details><summary>모범 답안</summary>

```
! router rip 들어가서 version 2
enable
configure terminal
router rip
version 2
! network 192.168.1.0 과 10.0.0.0 광고
network 192.168.1.0
network 10.0.0.0
! 자동 요약 끄기
no auto-summary
! G0/0을 passive-interface로
passive-interface g0/0
! 라우팅 테이블에 R 경로(172.16.0.0/24) 생김
do show ip route
! PC1에서 원격 서버까지 통신 (아래 PC 확인)
do show ip protocols
```

</details>

### 실습 5 · 단일 영역 OSPF 이웃 맺기

R2는 OSPF 영역 0에서 라우터 ID 2.2.2.2로 동작 중입니다. 루프백으로 R1의 ID를 정하고, 시리얼과 LAN을 영역 0에 넣어 이웃(FULL)을 맺으세요.

**과제**

1. Loopback0에 1.1.1.1/32
2. router ospf 1, router-id 1.1.1.1
3. 시리얼 10.0.0.0/30을 영역 0에
4. LAN 192.168.1.0/24도 영역 0에, G0/0은 passive
5. show ip ospf neighbor 에서 2.2.2.2 FULL
6. R2 루프백 2.2.2.2까지 ping
7. 루프백을 출발지로 ping 172.16.0.1  
   > R2가 OSPF로 1.1.1.1을 배우지 못하면 실패합니다. 루프백도 network 로 넣어 보세요.

<details><summary>모범 답안</summary>

```
! Loopback0에 1.1.1.1/32
enable
configure terminal
interface loopback 0
ip address 1.1.1.1 255.255.255.255
! router ospf 1, router-id 1.1.1.1
router ospf 1
router-id 1.1.1.1
! 시리얼 10.0.0.0/30을 영역 0에
network 10.0.0.0 0.0.0.3 area 0
! LAN 192.168.1.0/24도 영역 0에, G0/0은 passive
network 192.168.1.0 0.0.0.255 area 0
passive-interface g0/0
! show ip ospf neighbor 에서 2.2.2.2 FULL
do show ip ospf neighbor
! R2 루프백 2.2.2.2까지 ping
do ping 2.2.2.2
! 루프백을 출발지로 ping 172.16.0.1
network 1.1.1.1 0.0.0.0 area 0
do ping 172.16.0.1 source loopback 0
```

</details>

### 실습 6 · EIGRP AS 100 붙이기

R2는 EIGRP AS 100으로 동작합니다. AS 번호가 다르면 이웃이 맺어지지 않습니다. 와일드카드 마스크로 필요한 네트워크만 넣어 보세요.

**과제**

1. router eigrp 100
2. 10.0.0.0/30과 192.168.1.0/24 광고 (와일드카드)
3. 자동 요약 끄고 router-id 1.1.1.1
4. show ip eigrp neighbors 에 10.0.0.2
5. D 경로 확인 (show ip route eigrp)
6. PC1에서 원격 서버까지 통신

<details><summary>모범 답안</summary>

```
! router eigrp 100
enable
configure terminal
router eigrp 100
! 10.0.0.0/30과 192.168.1.0/24 광고 (와일드카드)
network 10.0.0.0 0.0.0.3
network 192.168.1.0 0.0.0.255
! 자동 요약 끄고 router-id 1.1.1.1
no auto-summary
eigrp router-id 1.1.1.1
! show ip eigrp neighbors 에 10.0.0.2
do show ip eigrp neighbors
! D 경로 확인 (show ip route eigrp)
do show ip route eigrp
! PC1에서 원격 서버까지 통신
do show ip eigrp topology
```

</details>

### 실습 7 · R1을 DHCP 서버로

PC3은 주소를 자동으로 받습니다. 라우터와 고정 주소 장비(.1~.20)를 빼고 나머지를 나눠 주는 풀을 만드세요. 제외하지 않으면 라우터가 충돌을 감지합니다.

**과제**

1. 192.168.1.1 ~ 192.168.1.20 제외
2. 풀 LAN 만들고 network 192.168.1.0 /24
3. 기본 게이트웨이 192.168.1.1, DNS 8.8.8.8
4. PC3이 주소를 받음
5. show ip dhcp binding 으로 임대 확인
6. G0/1은 ISP에게 DHCP로 주소 받기  
   > ISP가 기본 경로(S* 관리 거리 254)도 함께 줍니다.

<details><summary>모범 답안</summary>

```
! 192.168.1.1 ~ 192.168.1.20 제외
enable
configure terminal
ip dhcp excluded-address 192.168.1.1 192.168.1.20
! 풀 LAN 만들고 network 192.168.1.0 /24
ip dhcp pool LAN
network 192.168.1.0 255.255.255.0
! 기본 게이트웨이 192.168.1.1, DNS 8.8.8.8
default-router 192.168.1.1
dns-server 8.8.8.8
! PC3이 주소를 받음
end
show ip dhcp binding
! show ip dhcp binding 으로 임대 확인
show ip dhcp binding
! G0/1은 ISP에게 DHCP로 주소 받기
configure terminal
interface g0/1
ip address dhcp
```

</details>

### 실습 8 · PAT로 LAN을 인터넷에 내보내기

기본 경로와 OSPF는 이미 있습니다. 그런데 PC들은 사설 주소라 인터넷에서 답이 돌아오지 못합니다. G0/1 주소 하나로 여러 PC를 변환(overload)하세요.

**과제**

1. PC1 → 인터넷이 실패하는 이유 확인 (아래 PC 확인)
2. ACL 1: 192.168.1.0/24 허용
3. G0/0은 inside, G0/1은 outside
4. ip nat inside source list 1 interface g0/1 overload
5. PC1·PC2 모두 인터넷 통신
6. show ip nat translations 확인
7. PC1을 공인 198.51.100.5로 정적 변환

<details><summary>모범 답안</summary>

```
! PC1 → 인터넷이 실패하는 이유 확인 (아래 PC 확인)
enable
show ip route
! ACL 1: 192.168.1.0/24 허용
configure terminal
access-list 1 permit 192.168.1.0 0.0.0.255
! G0/0은 inside, G0/1은 outside
interface g0/0
ip nat inside
interface g0/1
ip nat outside
exit
! ip nat inside source list 1 interface g0/1 overload
ip nat inside source list 1 interface g0/1 overload
! PC1·PC2 모두 인터넷 통신
end
! show ip nat translations 확인
show ip nat translations
! PC1을 공인 198.51.100.5로 정적 변환
configure terminal
ip nat inside source static 192.168.1.10 198.51.100.5
```

</details>

### 실습 9 · 확장 ACL로 PC2만 서버 차단

모든 PC가 서버와 인터넷에 갈 수 있는 상태입니다. PC2(192.168.1.20)만 원격 서버 대역 172.16.0.0/24에 못 가게 하고 나머지는 그대로 두세요. 확장 ACL은 출발지 가까이에 둡니다.

**과제**

1. 이름 있는 확장 ACL BLOCK-PC2 만들기
2. PC2 → 172.16.0.0/24 거부, 나머지 허용
3. G0/0 들어오는 방향에 적용
4. PC2 → 서버 차단, PC1 → 서버 허용
5. PC2 → 인터넷은 그대로 됨
6. show access-lists 에서 일치 횟수 확인

<details><summary>모범 답안</summary>

```
! 이름 있는 확장 ACL BLOCK-PC2 만들기
enable
configure terminal
ip access-list extended BLOCK-PC2
! PC2 → 172.16.0.0/24 거부, 나머지 허용
remark PC2 cannot reach server LAN
deny ip host 192.168.1.20 172.16.0.0 0.0.0.255
permit ip any any
exit
! G0/0 들어오는 방향에 적용
interface g0/0
ip access-group BLOCK-PC2 in
end
! PC2 → 서버 차단, PC1 → 서버 허용
show access-lists
! PC2 → 인터넷은 그대로 됨
show ip interface g0/0
! show access-lists 에서 일치 횟수 확인
show access-lists
```

</details>

### 실습 10 · 콘솔 편의 · 로그 · 이름 조회

매일 쓰는 콘솔을 편하게 만들고 로그와 시간을 정리합니다. 일부러 없는 명령(예: shw)을 쳐서 DNS 조회로 멈추는 것도 겪어 보세요.

**과제**

1. 오타가 DNS 조회로 멈추지 않게
2. 콘솔: logging synchronous, exec-timeout 5 0
3. ip host SRV 172.16.0.10 → ping SRV
4. 로그를 버퍼에 저장하고 show logging
5. 시간대 KST +9 지정
6. --More-- 없이 출력: terminal length 0
7. show run | section line 처럼 파이프 써 보기
8. PC1 TFTP 서버에 설정 백업

<details><summary>모범 답안</summary>

```
! 오타가 DNS 조회로 멈추지 않게
enable
configure terminal
no ip domain-lookup
! 콘솔: logging synchronous, exec-timeout 5 0
line console 0
logging synchronous
exec-timeout 5 0
exit
! ip host SRV 172.16.0.10 → ping SRV
ip host SRV 172.16.0.10
do ping SRV
! 로그를 버퍼에 저장하고 show logging
logging buffered 16384
do show logging
! 시간대 KST +9 지정
clock timezone KST 9
do show clock
! --More-- 없이 출력: terminal length 0
end
terminal length 0
show running-config
! show run | section line 처럼 파이프 써 보기
show running-config | section line
! PC1 TFTP 서버에 설정 백업
copy running-config tftp:
192.168.1.10
```

</details>

### 실습 11 · SSH로만 원격 접속 받기

관리자는 PC1에서 SSH로 들어옵니다. 사용자 계정, 도메인, RSA 키가 있어야 SSH가 켜집니다. 원격 접속은 PC1만 허용하세요.

**과제**

1. 도메인 이름 lab.local
2. 사용자 admin, 권한 15, secret 지정
3. RSA 키 1024비트 이상 만들기
4. SSH 버전 2만 쓰기
5. vty: login local, transport input ssh
6. PC1만 vty 접속 허용 (access-class)
7. PC1 → R1 SSH 접속 성공 (아래 PC 확인)
8. 저장

<details><summary>모범 답안</summary>

```
! 도메인 이름 lab.local
enable
configure terminal
ip domain-name lab.local
! 사용자 admin, 권한 15, secret 지정
username admin privilege 15 secret Cisco123
! RSA 키 1024비트 이상 만들기
crypto key generate rsa general-keys modulus 2048
! SSH 버전 2만 쓰기
ip ssh version 2
! vty: login local, transport input ssh
line vty 0 4
login local
transport input ssh
exit
! PC1만 vty 접속 허용 (access-class)
access-list 10 permit host 192.168.1.10
line vty 0 4
access-class 10 in
end
! PC1 → R1 SSH 접속 성공 (아래 PC 확인)
show ip ssh
! 저장
write memory
```

</details>

### 실습 12 · IPv6 주소와 정적 경로

R2는 시리얼에 2001:DB8:12::2/64, 뒤쪽 LAN에 2001:DB8:172::/64를 갖고 있고, 2001:DB8:1::/64로 돌아오는 경로도 알고 있습니다.

**과제**

1. IPv6 라우팅 켜기
2. G0/0에 2001:DB8:1::1/64
3. S0/0/0에 2001:DB8:12::1/64
4. 링크 로컬 주소 확인 (show ipv6 interface brief)
5. R2(2001:DB8:12::2)까지 ping
6. 2001:DB8:172::/64 → 2001:DB8:12::2 정적 경로
7. 서버 2001:DB8:172::10까지 ping, PC1도 통신

<details><summary>모범 답안</summary>

```
! IPv6 라우팅 켜기
enable
configure terminal
ipv6 unicast-routing
! G0/0에 2001:DB8:1::1/64
interface g0/0
ipv6 address 2001:DB8:1::1/64
! S0/0/0에 2001:DB8:12::1/64
interface s0/0/0
ipv6 address 2001:DB8:12::1/64
exit
! 링크 로컬 주소 확인 (show ipv6 interface brief)
do show ipv6 interface brief
! R2(2001:DB8:12::2)까지 ping
do ping 2001:DB8:12::2
! 2001:DB8:172::/64 → 2001:DB8:12::2 정적 경로
ipv6 route 2001:DB8:172::/64 2001:DB8:12::2
! 서버 2001:DB8:172::10까지 ping, PC1도 통신
do ping 2001:DB8:172::10
```

</details>

### 실습 13 · 고장 난 라우터 고치기

누군가 설정을 망가뜨리고 저장까지 해 버렸습니다. 원래는 실습 5처럼 OSPF로 R2와 붙고 기본 경로로 인터넷에 나가야 합니다. show 명령으로 원인을 찾아 고치세요.

**과제**

1. PC들이 게이트웨이(R1)에 닿게 하기
2. R2(10.0.0.2)까지 ping 되게 하기
3. OSPF 이웃 2.2.2.2와 FULL  
   > debug ip ospf hello 를 켜면 어떤 값이 안 맞는지 보입니다.
4. G0/1 마스크 바로잡기 (ISP는 /30)
5. 8.8.8.8까지 ping 되게 하기
6. PC1 → 원격 서버 통신
7. 고친 설정 저장

<details><summary>모범 답안</summary>

```
! PC들이 게이트웨이(R1)에 닿게 하기
enable
show ip interface brief
configure terminal
interface g0/0
no shutdown
! R2(10.0.0.2)까지 ping 되게 하기
do show interfaces s0/0/0
interface s0/0/0
encapsulation hdlc
ip address 10.0.0.1 255.255.255.252
do ping 10.0.0.2
! OSPF 이웃 2.2.2.2와 FULL
do show ip ospf interface s0/0/0
no ip ospf hello-interval
! G0/1 마스크 바로잡기 (ISP는 /30)
interface g0/1
ip address 203.0.113.2 255.255.255.252
exit
! 8.8.8.8까지 ping 되게 하기
do show ip route
no ip route 0.0.0.0 0.0.0.0 203.0.113.5
ip route 0.0.0.0 0.0.0.0 203.0.113.1
do ping 8.8.8.8
! PC1 → 원격 서버 통신
do show ip route ospf
! 고친 설정 저장
end
write memory
```

</details>

### 실습 14 · 잊어버린 enable 비밀번호 복구

enable 비밀번호를 아무도 모릅니다. 부팅 중 Break로 ROMMON에 들어가 설정 레지스터를 0x2142로 바꾸면 startup-config를 건너뛰고 부팅됩니다. 기존 설정은 지우지 말고 비밀번호만 바꾸세요.

**과제**

1. 전원 재시작 후 Break로 ROMMON 진입
2. confreg 0x2142 후 reset
3. startup-config 없이 부팅됨
4. enable 후 저장된 설정을 running-config로 가져오기
5. 새 enable secret 정하기
6. 설정 레지스터를 0x2102로 되돌리기
7. 꺼진 인터페이스 다시 켜기  
   > copy start run은 합치기라서 꺼진 포트를 켜지 않습니다.
8. 저장

<details><summary>모범 답안</summary>

```
! 전원 재시작 후 Break로 ROMMON 진입
(전원 재시작 버튼 → 부팅 중 Break 버튼)
! confreg 0x2142 후 reset
confreg 0x2142
reset
! startup-config 없이 부팅됨
no
! enable 후 저장된 설정을 running-config로 가져오기
enable
copy startup-config running-config
! 새 enable secret 정하기
configure terminal
enable secret NewPass1
! 설정 레지스터를 0x2102로 되돌리기
config-register 0x2102
! 꺼진 인터페이스 다시 켜기
interface range g0/0 - 1
no shutdown
interface s0/0/0
no shutdown
end
! 저장
copy running-config startup-config
```

</details>

### 자유 연습 · 아무거나 쳐 보기

과제 없이 공장 초기 상태에서 시작합니다. 아래 "전체 명령어 목록"에서 쓸 수 있는 명령을 모두 볼 수 있어요.

과제 없이 공장 초기 상태에서 시작합니다. 아래 전체 명령어 목록을 참고해 자유롭게 연습하세요.

## 전체 명령어 목록

`A.B.C.D`는 IP 주소, `<마스크>`·`<와일드카드>`는 마스크, `<숫자>`·`<이름>`·`<인터페이스>`·`<텍스트>`는 값을 뜻합니다. 대부분의 명령은 앞에 `no`를 붙여 취소할 수 있습니다.

### R1> 사용자 EXEC · 15

```
enable
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
terminal history size <숫자>
```

### R1# 특권 EXEC · 122

```
show version
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
no debug ip routing
```

### R1(config)# 전역 설정 · 124

```
hostname <이름>
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
no ip nat inside source list <이름> pool <이름> overload
```

### R1(config-if)# 인터페이스 · 52

```
ip address A.B.C.D <마스크>
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
no cdp enable
```

### router rip · 19

```
version <숫자>
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
distance <숫자>
```

### router ospf · 20

```
network A.B.C.D <와일드카드> area <숫자>
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
distance <숫자>
```

### router eigrp · 18

```
network A.B.C.D
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
distance <숫자>
```

### R1(config-line)# 라인 · 20

```
password <이름>
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
no access-class <이름> <이름>
```

### R1(dhcp-config)# DHCP 풀 · 12

```
network A.B.C.D <마스크>
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
lease infinite
```

### R1(config-ext-nacl)# 이름 있는 ACL · 7

```
permit <텍스트>
deny <텍스트>
<숫자> <텍스트>
remark <텍스트>
no <숫자>
no permit <텍스트>
no deny <텍스트>
```

### rommon > ROMMON · 6

```
confreg <이름>
confreg
reset
boot
help
dir <이름>
```
