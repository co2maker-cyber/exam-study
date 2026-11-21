# HANDOFF — 기출 반복 학습 사이트 (2026-11-21)

## 목표
- GitHub Pages 정적 학습 사이트: AWS CLF-C02 + 네트워크관리사 2급 기출 풀이, 보기별 해설, 오답노트, 단어장, 계산 연습, Cisco 라우터 연습

## 현황
✓ 배포: https://co2maker-cyber.github.io/exam-study/ (repo co2maker-cyber/exam-study, main, 최신 550488c, Pages success)
✓ 네트워크관리사 451~540번 추가(fc65e85) — 73문항. 451~482 → data/net2-3.js 끝(3과목 NOS), 483~540 → data/net2-4.js(4과목 네트워크 운용기기 신설). 총 net2 450문항(1과목164/2과목72/3과목165/4과목49)
✓ 정답표-네트워크관리사2급.md·README 재생성(450문항)
✓ 계산 연습 페이지 practice.js(93a4485) — 상단 '연습' 메뉴. 모드: subnet/mask/route/dhcp, 무작위 생성+풀이, 점수 localStorage examStudy.practice. 생성기 3000회×4 퍼즈 0오류, 최장일치 2만회 0오류
✓ 단어장 과목 분리 — data/glossary-net.js 74개(분류: 라우팅 기본/RIP/OSPF/EIGRP·BGP·기타/라우터 명령어/IP 주소·서브넷/DHCP), glossary.js 항목에 subject:"aws". 용어 페이지 상단 과목 선택(#glSubj), 관련 기출·뜻 찾기 현재 과목만, 내 단어 subject 저장
✓ 좁은 화면 상단 메뉴 1줄(.brand-t 숨김, 560px 이하)
✓ 641문항 전부 보기별 해설로 재작성(550488c) — 첫 줄 근거 + ①~④(⑤) 각 한 줄, 정답 보기 "(정답)" 표기, ※ 안내 유지. 정답표시↔answer 전수 대조 불일치 0
✗ 그림 필요 88문항 미추가(1~450 중 71 + 451~540 중 17) — img/ 폴더 미제공
✗ 414·432번 제외 — 공식 정답 갈림

## 결정사항
- 시험지 43~45번도 NOS 내용 → 3과목 분류, 46~50번만 4과목
- 그림 문항 중 452·519번은 보기만으로 답 확정 → 조건 문장화해 포함
- 서브넷 개수는 2^b 기준(구교재 2^b−2는 풀이에 언급)
- 해설에서 AWS 보기 지칭 A·B·C → ①②③ 통일(UI가 원문자 표시)

## 이슈/주의
- 469번 pathping 정답은 직접 풀이 — 공식 정답 대조 권장(해설에 명시)
- 사용자 요청: **결과 보고마다 접속 링크 표시** (사이트·router/ 링크)
- 사용자: 한국어, 기기 저장(localStorage) 사용 중(로그인 기능은 이전에 삭제)
- 환경: github.io·wikipedia 차단 → 배포 확인은 gh api만, 실화면 미확인
- push 시 `fatal: expected 'acknowledgments'` 경고 무시 가능
- 이 HANDOFF.md는 커밋 안 함(요청 없음)

## 다음 할 일
1. 사용자 다음 요청 대기 — 후보: img/ 받으면 그림 문항 88개 추가, CLAUDE.md에 '링크 표시' 규칙 기록(제안만 함, 미응답)
2. 변경 시 검증 → 정답표 재생성 → commit·push → 배포 확인 → 링크 안내

## 참조
- 파일: /home/user/exam-study/index.html, app.js(용어 페이지 renderGlossary, go()에 practice 라우팅), practice.js, style.css
- 파일: /home/user/exam-study/data/bank.js(addSet/addNet, CATEGORIES), set1~4.js, net2-1~4.js, glossary.js, glossary-net.js
- 원본: /root/.claude/uploads/e26af7ff-f18d-5411-be64-bea499dc4b09/2cdce9d0-_______2_____2022-2026_____.md(net2 전체 540), 56efe50c-__________.md(라우팅 정리, 단어장 반영 완료)
- 스크립트(scratchpad 휘발): /tmp/claude-0/-home-user-exam-study/e26af7ff-f18d-5411-be64-bea499dc4b09/scratchpad/ — lib.js(뱅크 로드), dump.js(`node dump.js . net2:1:45`), apply.js(해설 패치 "@id\n텍스트"), need.js, check.js(원본 대조), pxfuzz.js, lpm.js, pxbr.js·exbr.js·mob2.js(playwright)
- 명령: `python3 -m http.server 8765` (repo 루트) + playwright
- 배포 확인: `gh api "repos/co2maker-cyber/exam-study/actions/runs?per_page=1" --jq '.workflow_runs[0] | "\(.head_sha[0:7]) \(.status) \(.conclusion)"'`
- 커밋 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01Y4YTP63jL46f9VsU3fQ9jX`
- 링크: https://co2maker-cyber.github.io/exam-study/ · https://co2maker-cyber.github.io/exam-study/router/
