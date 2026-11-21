# 리눅스 서버 실습장

네트워크관리사 2급 실기의 리눅스(CentOS 7) 문제를 브라우저에서 직접 명령을 쳐 보며 익히는 시뮬레이터의 안내서입니다. 실습 과제 21개와 자유 연습이 있으며, 서버의 실제 상태(파일, 계정, 네트워크, 서비스 등)를 보고 자동으로 채점합니다.

- 실행 파일: `linux/index.html` (브라우저로 열면 바로 동작, 설치 필요 없음)
- [새 문제]를 누를 때마다 IP 주소, 사용자 이름, 권한 값, 포트 같은 값이 새로 정해집니다.
- 완료 표시는 브라우저에만 저장됩니다.
- 실제 리눅스의 명령과 동작을 단순화해 흉내 낸 연습용입니다. 명령 출력 형식은 CentOS 7에 맞췄지만 모든 옵션을 지원하지는 않습니다.

## 목차

1. [서버 구성](#서버-구성)
2. [화면과 조작법](#화면과-조작법)
3. [시험에 자주 나오는 기본 지식](#시험에-자주-나오는-기본-지식)
4. [vi 편집기](#vi-편집기)
5. [실습](#실습)
6. [전체 명령어 목록](#전체-명령어-목록)
7. [실제 리눅스와 다른 점](#실제-리눅스와-다른-점)

## 서버 구성

```
 관리 PC 192.168.10.1 ──ssh──┐
                             │   192.168.10.0/24 (VMware NAT)
                             ├── 게이트웨이·DNS 192.168.10.2 ── 인터넷 (8.8.8.8, www.google.com …)
                             │
                   server (CentOS 7.9)  ens33 192.168.10.128/24 (DHCP)
                             └── /dev/sda 20G (시스템)   /dev/sdb 10G (/dev/sdb1 파티션만 있음)
```

| 항목 | 기본값 |
|---|---|
| 배포판 | CentOS Linux release 7.9.2009 (Core), 커널 3.10.0-1160 |
| 호스트 이름 | `server` |
| 접속 계정 | `root` (암호 `centos`) · 일반 사용자 `admin` (wheel 그룹) |
| ens33 | DHCP · `192.168.10.128/24` · 게이트웨이 `192.168.10.2` · DNS `192.168.10.2` |
| 설정 파일 | `/etc/sysconfig/network-scripts/ifcfg-ens33` (BOOTPROTO=dhcp) |
| 실행 중인 서비스 | sshd, crond, firewalld, NetworkManager (모두 enabled) |
| 설치되었지만 꺼진 서비스 | httpd (disabled) |
| 방화벽 (public) | 서비스 `dhcpv6-client ssh`, 포트 없음 |
| 디스크 | `/dev/sdb1` 파티션 있음, 파일 시스템 없음 |
| umask | `0022` |

과제를 고르거나 [처음부터]를 누르면 서버가 이 상태로 돌아간 뒤 과제에 필요한 준비(파일, 사용자, 프로세스 등)가 더해집니다.

## 화면과 조작법

| 키 | 동작 |
|---|---|
| 아무 키 | 터미널 입력 줄로 들어감 (따로 클릭하지 않아도 됨) |
| `Enter` | 명령 실행 |
| `Tab` | 명령어·경로 자동 완성 (여러 개면 목록 표시) |
| `↑` `↓` | 이전 명령 불러오기 |
| `Ctrl+C` | 입력 취소 |
| `Ctrl+L` | 화면 지우기 (`clear`와 같음) |
| `Ctrl+A` / `Ctrl+E` / `Ctrl+U` | 줄 맨 앞 / 맨 끝 / 앞부분 지우기 |
| 아래 특수 키 단추 | 휴대폰에서 Tab, Esc, Ctrl+C, 화살표, `| / - ~ :` 입력 |

- `help` 명령어 목록, `man 명령` 명령 설명(옵션 요약)을 봅니다.
- 파이프 `|`, 리디렉션 `>` `>>` `2>` `2>&1` `<`, `&&` `||` `;`, 와일드카드 `*` `?`, `~`, `$HOME` 같은 변수를 쓸 수 있습니다.
- root에는 실제 CentOS처럼 `rm -i`, `cp -i`, `mv -i` 별칭이 걸려 있어 지우거나 덮어쓸 때 묻습니다. `y`로 답하거나 `-f`를 붙이세요.
- `passwd`, `yum install`(‑y 없이), `su`처럼 입력을 받는 명령은 프롬프트가 바뀌어 답을 기다립니다. 암호는 화면에 보이지 않습니다.
- 오른쪽 패널의 [채점하기]를 누르면 틀린 항목 아래에 **기대 값**과 **현재 값**이 나옵니다.

## 시험에 자주 나오는 기본 지식

### 권한

```
-rwxr-xr--.  1 root root  21 Nov 21 10:00 script.sh
│└┬┘└┬┘└┬┘
│ │  │  └ 기타 사용자(o)  r=4 w=2 x=1
│ │  └─── 그룹(g)
│ └────── 소유자(u)
└──────── 종류: - 파일, d 디렉터리, l 링크, b 블록 장치, c 문자 장치
```

| 표기 | 숫자 | 뜻 |
|---|---|---|
| `rwxr-xr-x` | 755 | 실행 파일·디렉터리 기본 |
| `rw-r--r--` | 644 | 일반 파일 기본 |
| `rwxr-x---` | 750 | 그룹까지만 |
| `rw-------` | 600 | 소유자만 |
| `rwsr-xr-x` | 4755 | **SetUID** (실행할 때 소유자 권한, 예: /usr/bin/passwd) |
| `rwxr-sr-x` | 2755 | **SetGID** (디렉터리 안 새 파일이 그룹을 물려받음) |
| `rwxrwxrwt` | 1777 | **Sticky bit** (자기 파일만 지울 수 있음, 예: /tmp) |

- 기호 방식: `chmod u+x`, `chmod g-w`, `chmod o=r`, `chmod a+rx`, `chmod u+s`, `chmod o+t`, 여러 개는 `chmod g=rw,o=`
- 실행 권한이 없는데 특수 권한만 있으면 대문자(`S`, `T`)로 보입니다.

### umask

새 파일 권한 = 666 − umask, 새 디렉터리 권한 = 777 − umask

| umask | 파일 | 디렉터리 |
|---|---|---|
| 022 | 644 | 755 |
| 027 | 640 | 750 |
| 077 | 600 | 700 |
| 002 | 664 | 775 |

### 계정 파일

```
/etc/passwd  admin:x:1000:1000:admin:/home/admin:/bin/bash
             이름 : 암호(x=shadow에) : UID : GID : 설명 : 홈 : 로그인 셸

/etc/shadow  admin:$6$...:20500:0:99999:7:::
             이름 : 암호 해시(!!=미설정, !=잠금) : 마지막 변경일 : 최소 : 최대 : 경고 : 비활성 : 만료일 :

/etc/group   wheel:x:10:admin
             그룹 이름 : 암호 : GID : 구성원(쉼표)
```

- `/sbin/nologin` 셸은 로그인할 수 없는 계정입니다.
- `useradd`는 사용자와 같은 이름의 그룹을 함께 만들고(-g 를 주지 않을 때), `/etc/skel` 내용을 홈 디렉터리에 복사합니다.
- 보조 그룹 추가는 `usermod -aG 그룹 사용자`입니다. `-a` 없이 `-G`만 쓰면 기존 보조 그룹이 모두 빠집니다.

### 네트워크 설정 파일 (ifcfg-ens33)

```
TYPE=Ethernet
BOOTPROTO=static        # dhcp / static / none
NAME=ens33
DEVICE=ens33
ONBOOT=yes              # 부팅할 때 켜기
IPADDR=192.168.1.10
PREFIX=24               # 또는 NETMASK=255.255.255.0
GATEWAY=192.168.1.1
DNS1=168.126.63.1
DNS2=8.8.8.8
```

파일을 고친 뒤 `systemctl restart network` (또는 `nmcli con reload; nmcli con up ens33`)를 해야 적용됩니다. `ifconfig`, `ip addr add`, `route add` 로 바꾼 값은 **지금만** 적용되고 재부팅하면 사라집니다.

### 영구 설정과 임시 설정

| 바꾸는 것 | 임시 (지금만) | 영구 (재부팅 후에도) |
|---|---|---|
| IP 주소 | `ifconfig`, `ip addr add` | ifcfg 파일 수정 또는 `nmcli con mod` |
| 기본 게이트웨이 | `route add default gw`, `ip route add default via` | ifcfg의 `GATEWAY=` |
| 호스트 이름 | `hostname 이름` | `hostnamectl set-hostname 이름` (`/etc/hostname`) |
| 서비스 | `systemctl start` | `systemctl enable` |
| 방화벽 | `firewall-cmd --add-…` | `firewall-cmd --permanent --add-…` 후 `--reload` |
| 마운트 | `mount` | `/etc/fstab` |
| umask | `umask 027` | `~/.bashrc`, `/etc/profile` |

`reboot`을 하면 이 연습장도 영구 설정만 남긴 채 다시 켜지므로 직접 확인할 수 있습니다.

### /etc/fstab

```
장치                마운트 포인트   형식   옵션      덤프 검사
/dev/sdb1          /mnt/data      ext4   defaults  0    0
UUID=1a2b...       /mnt/data      xfs    defaults  0    0
```

UUID는 `blkid`로 확인합니다. `mount -a`는 fstab의 항목 중 아직 마운트되지 않은 것을 모두 마운트하므로, fstab을 고친 뒤 오류가 없는지 시험하는 데 씁니다.

### crontab 형식

```
분  시  일  월  요일   명령
30  2   *   *   0     /root/backup.sh       매주 일요일 2시 30분
0   9-18 *  *   1-5   /root/check.sh        평일 9시~18시 매시 정각
*/10 *  *   *   *     /root/monitor.sh      10분마다
0   0   1   1   *     /root/yearly.sh       매년 1월 1일 0시
```

요일: 0과 7은 일요일, 1=월 … 6=토 (`mon`, `sun` 같은 이름도 됨). `crontab -e`로 편집하면 vi가 열리고, 저장하면 형식을 검사한 뒤 `/var/spool/cron/사용자`에 설치됩니다.

### 시그널

| 번호 | 이름 | 뜻 |
|---|---|---|
| 1 | SIGHUP | 설정 다시 읽기 |
| 2 | SIGINT | 인터럽트 (Ctrl+C) |
| 9 | SIGKILL | 강제 종료 (무시할 수 없음) |
| 15 | SIGTERM | 정상 종료 요청 (kill의 기본값) |
| 19 | SIGSTOP | 일시 정지 |

### tar 옵션

| 옵션 | 뜻 |
|---|---|
| `c` / `x` / `t` | 만들기 / 풀기 / 목록 |
| `v` | 처리하는 파일 이름 표시 |
| `f 파일` | 아카이브 파일 이름 (항상 마지막에) |
| `z` / `j` | gzip(.tar.gz) / bzip2(.tar.bz2) 압축 |
| `-C 디렉터리` | 풀 위치 |

예: `tar -czvf backup.tar.gz /data` · `tar -xzvf backup.tar.gz -C /tmp` · `tar -tvf backup.tar`

## vi 편집기

`vi 파일`로 열면 터미널 위에 편집 화면이 뜹니다. 처음에는 **일반 모드**입니다.

| 모드 전환 | 키 |
|---|---|
| 입력 모드로 | `i`(커서 앞) `a`(커서 뒤) `I`(줄 맨 앞) `A`(줄 맨 끝) `o`(아래 새 줄) `O`(위 새 줄) |
| 일반 모드로 | `Esc` (휴대폰은 아래 **Esc** 단추) |
| 명령 모드로 | 일반 모드에서 `:` |

| 일반 모드 | 동작 |
|---|---|
| `h j k l` / 화살표 | 왼쪽 아래 위 오른쪽 |
| `0` `^` `$` | 줄 맨 앞 / 첫 글자 / 줄 끝 |
| `w` `b` | 다음 / 이전 단어 |
| `gg` `G` `5G` | 첫 줄 / 마지막 줄 / 5번째 줄 |
| `Ctrl+F` `Ctrl+B` | 다음 / 이전 화면 |
| `x` `X` | 글자 삭제 (커서 / 앞) |
| `dd` `3dd` `dw` `D` | 줄 삭제 / 3줄 삭제 / 단어 삭제 / 줄 끝까지 삭제 |
| `yy` `3yy` | 줄 복사 / 3줄 복사 |
| `p` `P` | 아래 / 위에 붙여넣기 |
| `u` | 되돌리기 |
| `r문자` | 글자 하나 바꾸기 |
| `J` | 다음 줄을 이어 붙이기 |
| `cw` `cc` | 단어 / 줄을 지우고 입력 모드 |
| `/패턴` `n` `N` | 찾기 / 다음 / 이전 |
| `ZZ` | 저장하고 끝내기 |

| 명령 모드 | 동작 |
|---|---|
| `:w` | 저장 |
| `:q` | 끝내기 (바뀐 내용이 있으면 E37 오류) |
| `:q!` | 저장하지 않고 끝내기 |
| `:wq` `:x` | 저장하고 끝내기 |
| `:w 파일` | 다른 이름으로 저장 |
| `:set nu` `:set nonu` | 줄 번호 켜기 / 끄기 |
| `:10` `:$` | 10번째 줄 / 마지막 줄로 |
| `:s/a/b/` | 현재 줄의 첫 a를 b로 |
| `:%s/a/b/g` | 파일 전체의 a를 모두 b로 |
| `:10,20s/a/b/g` | 10~20번째 줄에서 바꾸기 |
| `:3d` `:3,5d` | 3번째 줄 / 3~5번째 줄 삭제 |

## 실습

각 과제의 값은 [새 문제]를 누를 때마다 바뀌므로 아래 명령의 값은 예시입니다. 패널의 [풀이 보기]를 누르면 그 문제의 값에 맞춘 명령 예시가 나옵니다.

### 파일 관리

#### 1 · 파일과 디렉터리 다루기

**요구**: 여러 단계 디렉터리 만들기, 복사, 파일에 글 저장, 이동, 디렉터리 통째로 삭제

```
mkdir -p /data/project/docs/2026
cp /etc/hosts /data/project/docs/hosts.bak
echo "hello linux" > /data/project/readme.txt
mv /root/notes.txt /data/project/
rm -rf /tmp/old_logs
```

- `mkdir`에 `-p`가 없으면 상위 디렉터리가 없을 때 실패합니다.
- 디렉터리는 `rm -r`로 지웁니다. root는 `rm -i` 별칭 때문에 묻는데, `-f`를 붙이면 묻지 않습니다. 빈 디렉터리는 `rmdir`로도 지웁니다.

#### 2 · 권한 바꾸기 (chmod)

**요구**: 숫자 또는 rwx 표기로 주어진 권한, 600 계열, 스티키 비트(1777), SetUID(4755), 하위 전체에서 기타 사용자 권한 제거

```
chmod 754 /data/script.sh          # rwxr-xr--
chmod 600 /data/secret.txt
chmod 1777 /data/public            # 또는 chmod o+t
chmod 4755 /data/tool              # 또는 chmod u+s
chmod -R o-rwx /data/team
ls -l /data
```

#### 3 · 소유자와 그룹 (chown · chgrp)

```
chown -R kim:dev /data/team
chgrp dev /data/report.txt         # 또는 chown :dev 파일
chown kim /data/app.conf
```

#### 4 · umask와 기본 권한

```
umask 027
touch /root/new.txt                # → 640
mkdir /root/newdir                 # → 750
ls -ld /root/new*
```

umask를 바꾸기 **전에** 만든 파일은 바뀌지 않습니다. 이미 있으면 지우고 다시 만드세요.

#### 5 · 하드 링크와 심볼릭 링크

```
ln -s /data/app/v2.1 /data/app/current
ln /etc/hosts /root/hosts.hard     # 하드 링크 (같은 아이노드, 디렉터리는 불가)
ln -s /data/app/current/config.ini /root/cfg
ls -li /root
```

### 사용자 관리

#### 6 · 그룹과 사용자 만들기

**요구**: GID를 지정한 그룹, UID·기본 그룹·보조 그룹·홈·셸·설명을 지정한 사용자, 암호

```
groupadd -g 2001 dev
useradd -u 1501 -g dev -G wheel -d /home/kim1 -s /bin/bash -c "Web Developer" kim1
passwd kim1                        # 두 번 입력
echo 'Passw0rd!' | passwd --stdin kim1    # 한 줄로 할 때
id kim1
grep kim1 /etc/passwd /etc/shadow /etc/group
```

암호를 정하지 않으면 `/etc/shadow`의 암호 칸이 `!!`로 남아 로그인할 수 없습니다.

#### 7 · 사용자 수정 · 잠금 · 삭제

```
usermod -aG wheel lee              # 기존 보조 그룹 유지
usermod -s /sbin/nologin lee
passwd -l park                     # 또는 usermod -L park (shadow 암호 앞에 !)
chage -M 90 -E 2026-12-31 park
chage -l park
userdel -r choi                    # 홈 디렉터리와 메일함까지
```

#### 8 · 그룹 관리

```
groupadd -g 3001 project
gpasswd -a kim project             # 또는 usermod -aG project kim
gpasswd -a lee project
groupmod -n devops oldteam
groupdel temp
```

사용자의 기본(주) 그룹은 `groupdel`로 지울 수 없습니다.

### 네트워크

#### 9 · 고정 IP 설정 (ifcfg · nmcli)

**요구**: ifcfg 파일에 BOOTPROTO, IPADDR, PREFIX(또는 NETMASK), GATEWAY, DNS1·DNS2, ONBOOT 설정 → 지금 적용 → resolv.conf 반영

vi로 고치는 방법

```
vi /etc/sysconfig/network-scripts/ifcfg-ens33
   :%s/dhcp/static/        BOOTPROTO 바꾸기
   G o                     맨 아래에 새 줄
   IPADDR=10.0.5.20
   PREFIX=24
   GATEWAY=10.0.5.1
   DNS1=168.126.63.1
   DNS2=168.126.63.2
   Esc :wq
systemctl restart network
ip addr show ens33; ip route; cat /etc/resolv.conf
```

nmcli로 한 번에

```
nmcli con mod ens33 ipv4.method manual ipv4.addresses 10.0.5.20/24 \
      ipv4.gateway 10.0.5.1 ipv4.dns "168.126.63.1 168.126.63.2" connection.autoconnect yes
nmcli con up ens33
```

- 값이 틀리면 `systemctl restart network`가 실패하고 `systemctl status network`에 이유가 나옵니다.
- 설정 후 `ping -c 2 게이트웨이`, `ping -c 2 www.google.com`, `yum repolist`로 연결을 확인할 수 있습니다. 게이트웨이나 DNS가 틀리면 yum 설치가 실패합니다.

#### 10 · 호스트 이름 · hosts · DNS 클라이언트

```
hostnamectl set-hostname web01.example.com
echo "192.168.10.50  fileserver" >> /etc/hosts
vi /etc/resolv.conf                # nameserver 1순위, 2순위
ping -c 1 fileserver
```

`hostname 이름`은 지금만 바뀌고 `/etc/hostname`은 그대로라 채점에서 틀립니다.

### 서비스

#### 11 · 서비스 관리와 방화벽

```
systemctl enable --now httpd       # start + enable
systemctl stop vsftpd
systemctl disable vsftpd
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload
firewall-cmd --list-all
```

`--permanent`만 쓰면 파일에만 저장되고 지금은 적용되지 않습니다. `--permanent` 없이 쓰면 지금만 적용되고 `--reload`나 재부팅 때 사라집니다. 채점은 둘 다 확인합니다.

#### 12 · SSH 서버 설정

```
vi /etc/ssh/sshd_config
   #Port 22            → Port 2222          (맨 앞 # 지우기)
   #PermitRootLogin yes → PermitRootLogin no
systemctl restart sshd
firewall-cmd --permanent --add-port=2222/tcp; firewall-cmd --reload
netstat -tnlp | grep sshd
ssh -p 2222 root@localhost         # root 접속이 거부되어야 함
```

sed로 한 줄씩 바꿀 수도 있습니다: `sed -i 's/^#Port 22/Port 2222/' /etc/ssh/sshd_config`

#### 13 · 웹 서버(httpd) 설정

```
vi /etc/httpd/conf/httpd.conf
   Listen 8080
   DocumentRoot "/data/www"
mkdir -p /data/www
echo "Welcome to Linux Web" > /data/www/index.html
systemctl restart httpd; systemctl enable httpd
firewall-cmd --permanent --add-port=8080/tcp; firewall-cmd --reload
curl http://localhost:8080/
```

설정 파일을 바꾼 뒤 restart하지 않으면 이전 설정으로 계속 동작하므로 채점에서 틀립니다. `curl`은 실제로 DocumentRoot의 파일을 보여 줍니다.

### 패키지 · 프로세스 · 백업 · 디스크 · 예약

#### 14 · 패키지 설치와 삭제

```
yum install -y vsftpd              # -y가 없으면 Is this ok [y/d/N]: 에 y
systemctl enable --now vsftpd
rpm -e telnet                      # 또는 yum remove -y telnet
rpm -qa | grep vsftpd; rpm -q telnet
```

설치할 수 있는 패키지: vsftpd, samba, bind, mariadb-server, dhcp, nfs-utils, telnet-server, tftp-server, php, nmap 등 (`yum list`로 확인).

#### 15 · 프로세스 찾기와 종료

```
ps aux                             # 또는 top, ps -ef | grep stress
kill 3210                          # stress는 TERM을 무시해서 안 죽음
kill -9 3210
killall yes                        # 또는 pkill yes
renice -n 10 -p 3239
```

#### 16 · tar 묶기·풀기와 gzip

```
tar -czvf /backup/web-20261121.tar.gz /data/web
mkdir -p /tmp/restore
tar -xvf /root/conf.tar -C /tmp/restore
gzip /var/log/old.log              # old.log.gz만 남음 (풀기: gunzip)
```

#### 17 · 파일 시스템 만들기와 마운트

```
fdisk -l /dev/sdb
mkfs.ext4 /dev/sdb1                # 또는 mkfs -t ext4, mkfs.xfs
mkdir -p /mnt/data
mount /dev/sdb1 /mnt/data
blkid /dev/sdb1                    # UUID 확인
vi /etc/fstab
   /dev/sdb1  /mnt/data  ext4  defaults  0 0     (또는 UUID=...)
umount /mnt/data; mount -a; df -h
```

마운트한 디렉터리 안에 있으면 `umount`가 "target is busy"로 실패합니다. `cd /`로 나온 뒤 하세요.

#### 18 · cron 예약 작업

```
crontab -e
   i
   30 2 * * 0 /root/backup.sh
   0 9-18 * * 1-5 /usr/local/bin/check.sh
   Esc :wq
crontab -l
```

형식이 틀리면 "errors in crontab file, can't install."이 나오고 설치되지 않습니다.

### 명령어 · 편집기

#### 19 · 시스템 정보 확인 명령어

다섯 가지가 무작위로 나옵니다.

| 확인할 것 | 명령 |
|---|---|
| 커널 버전 | `uname -r` |
| 모든 프로세스 | `ps -ef`, `ps aux` |
| 디스크 사용량 | `df -h` |
| 메모리(MB) | `free -m` |
| TCP 대기 포트와 프로세스 | `netstat -tnlp`, `ss -tnlp` |
| CentOS 버전 | `cat /etc/redhat-release` |
| 패키지 설치 여부 | `rpm -q httpd`, `rpm -qa \| grep httpd` |
| 로그인 기록 | `last` |
| 디렉터리 크기 합계 | `du -sh /var/log` |
| 라우팅 테이블 | `route -n`, `netstat -rn`, `ip route` |
| 로그인 사용자 | `w`, `who` |
| 가동 시간 | `uptime` |

#### 20 · 찾기와 필터 명령어

```
find /etc -name "*.conf"
find / -perm -4000 2>/dev/null      # SetUID 파일
find / -user kim
find / -size +100M
grep Failed /var/log/secure
cut -d: -f1 /etc/passwd             # 또는 awk -F: '{print $1}' /etc/passwd
wc -l /etc/passwd
```

#### 21 · vi 편집기 다루기

```
vi /root/memo.txt
   :set nu
   :3          → dd               3번째 줄 삭제
   :%s/oldserver/newserver/g      모두 바꾸기
   G → o → # END → Esc            맨 아래에 줄 추가
   :wq
cat -n /root/memo.txt
```

### 자유 연습

채점 없이 명령을 마음대로 쳐 봅니다. 예를 들어 IP를 `ifconfig`로만 바꾼 뒤 `reboot`해서 사라지는지, `mount`만 하고 fstab에 쓰지 않으면 재부팅 후 빠지는지 확인해 보세요.

## 전체 명령어 목록

| 분류 | 명령 |
|---|---|
| 파일 | `ls` `ll` `cd` `pwd` `mkdir` `rmdir` `rm` `cp` `mv` `touch` `ln` `cat` `tac` `head` `tail` `more` `less` `wc` `find` `du` `file` `stat` `which` `whereis` |
| 텍스트 | `grep` `egrep` `sort` `uniq` `cut` `awk` `sed` `tr` `echo` `vi` `vim` |
| 권한 | `chmod` `chown` `chgrp` `umask` |
| 사용자 | `useradd` `usermod` `userdel` `passwd` `chpasswd` `chage` `groupadd` `groupmod` `groupdel` `gpasswd` `id` `groups` `su` `sudo` `whoami` `who` `w` `last` `lastb` |
| 네트워크 | `ifconfig` `ip` `route` `nmcli` `ifup` `ifdown` `ping` `traceroute` `nslookup` `dig` `host` `netstat` `ss` `arp` `hostname` `hostnamectl` `curl` `wget` `ssh` `telnet` |
| 서비스 | `systemctl` `service` `chkconfig` `firewall-cmd` `journalctl` |
| 프로세스 | `ps` `pstree` `kill` `killall` `pkill` `pgrep` `top` `nice` `renice` |
| 패키지 | `rpm` `yum` |
| 디스크 | `df` `free` `fdisk` `lsblk` `blkid` `mkfs` `mkfs.ext4` `mkfs.xfs` `mount` `umount` |
| 압축 | `tar` `gzip` `gunzip` `bzip2` `bunzip2` `zcat` |
| 예약 | `crontab` |
| 시스템 | `uname` `date` `cal` `uptime` `history` `clear` `env` `export` `alias` `dmesg` `reboot` `shutdown` `man` `help` |

각 명령의 주요 옵션은 터미널에서 `man 명령`으로 볼 수 있습니다.

## 실제 리눅스와 다른 점

- 항상 root로 시작하며, 권한 검사는 하지 않습니다 (`su - 사용자`로 바꾸면 프롬프트만 바뀝니다).
- `fdisk /dev/sdb`의 대화형 파티션 만들기는 없습니다. `/dev/sdb1`이 처음부터 만들어져 있습니다.
- `top`, `tail -f`처럼 계속 갱신되는 명령은 한 번만 출력하고 돌아옵니다.
- `awk`와 `sed`는 시험에 자주 나오는 단순한 형식만 지원합니다 (`awk -F: '{print $1}'`, `sed 's/a/b/g'`, `sed -i`, `sed -n '1,5p'`).
- SELinux는 동작하지 않습니다. 실제 CentOS에서 SSH 포트를 바꿀 때는 `semanage port -a -t ssh_port_t -p tcp 2222`도 필요합니다.
- 실제 네트워크로 나가지 않습니다. `ping`, `nslookup`, `yum` 결과는 서버 설정(IP, 게이트웨이, resolv.conf)을 바탕으로 만든 것입니다.
- vi의 비주얼 모드(`v`)와 `.` 반복 명령은 지원하지 않습니다.
