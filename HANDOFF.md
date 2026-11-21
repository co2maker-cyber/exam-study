# HANDOFF — 기출 반복 학습 사이트 (2026-11-21)

## 목표
- GitHub Pages 정적 학습 사이트: 과목별 기출 10/50/전체 풀이, 즉시 정답·해설, 오답노트, 용어 표, Cisco 라우터 연습

## 현황
✓ 배포: https://co2maker-cyber.github.io/exam-study/ (repo co2maker-cyber/exam-study, main, 최신 커밋 a9b128b, Pages 배포 success)
✓ AWS CLF-C02 191문항(set1~set4, PPT+HWPX 4개, 중복 106=191 제거) 정답·해설 직접 작성
✓ 네트워크관리사 2급 377문항(net2-1~3) — 중복 제거본 1~450번 중 그림 불필요 문항, 정답·해설 직접 작성, 출제 회차·횟수(★3회+) 표시
✓ 과목 선택(AWS/네트워크관리사), 출제 빈도 필터, 오답노트 과목별 탭, 마지막 과목 기억(localStorage examStudy.category)
✓ 용어 학습 표 134개(AWS), 20개씩 페이지, 단어 추가·뜻 찾기(용어표→기출해설→위키백과 ko→en), 내 단어 저장
✓ 라우터 콘솔 연습장 router/ — README(업로드) 설계서 삼아 신규 구현. 명령 415개 전수 테스트 0오류, 실습 14개 모범답안 전부 자동체크 통과, 시작상태 체크 0
✗ 네트워크관리사 451~540번 미추가 — 사용자 붙여넣기가 450번에서 잘림
✗ 그림 필요 71문항 미추가 — img/ 폴더 미제공
✗ 414·432번 제외 — 공식 정답 갈림
✗ 로그인(Firebase) 기능 — 사용자 요청으로 삭제(revert a3bb133), 기록은 다시 localStorage
△ 새 요청 중단됨: 업로드 2개 추가 요청 → 사용자가 중단 후 이 정리 요청
   - /root/.claude/uploads/e26af7ff-f18d-5411-be64-bea499dc4b09/56efe50c-__________.md (라우팅 프로토콜 정리: RIP/OSPF/EIGRP/BGP, AD, 헷갈리는 용어) — 읽음, 미반영
   - /root/.claude/uploads/e26af7ff-f18d-5411-be64-bea499dc4b09/2cdce9d0-_______2_____2022-2026_____.md (네트워크관리사 2급 2022-2026, 451~540번·전체본 추정(미확인)) — 아직 안 읽음

## 결정사항
- data/_bank.js → bank.js + .nojekyll — Jekyll이 밑줄 파일 배포 제외해 문제 0개 버그
- 정답 없는 원본은 직접 풀어 입력, 애매 문항은 제외·해설에 근거 표기 — 사용자에게 공식 정답 대조 권장함
- 그림 문항 중 보기만으로 답 확정되는 10개(68,102,118,151,152,227,235,334,356,381)는 조건을 문장으로 풀어 포함
- 라우터 시뮬: R1만 설정, R2/ISP/PC/SRV 고정 모델 — README 명시 범위
- 문법 = README 명령 목록 그대로(engine.js G) + 숨은 exec `exit`

## 이슈/주의
- 이 환경은 github.io·wikipedia 접속 차단 → 배포 확인은 `gh api .../actions/runs`로만, 위키 검색은 mock 테스트만
- 저장소 생성·Pages 설정 API는 권한 거부됨 → 사용자가 직접 함
- push 시 `fatal: expected 'acknowledgments'` 경고는 무시 가능(성공함)
- 사용자: 한국어, 기기 저장 싫어했으나 로그인 설정 번거로워 삭제 선택
- HANDOFF.md 자체는 커밋 안 함(요청 없음)

## 다음 할 일
1. 2cdce9d0 md 읽기 → 451~540번·그림 정보 있으면 data/net2-3.js(3과목 끝)·net2-4.js(4과목 운용기기) 추가, index.html script 연결
2. 56efe50c 라우팅 정리 → 네트워크관리사 용어 표(data/glossary.js 과목 구분 또는 별도 파일)로 추가 — 사용자 의사 확인 후
3. 검증: Node로 정답 범위·중복 검사, 브라우저 전체 풀이 테스트 → 정답표-네트워크관리사2급.md 재생성 → commit·push

## 참조
- 파일: /home/user/exam-study/index.html, app.js, style.css — 메인 사이트
- 파일: /home/user/exam-study/data/bank.js(addSet/addNet, CATEGORIES), set1~4.js(AWS), net2-1~3.js(네트워크), glossary.js
- 파일: /home/user/exam-study/router/engine.js(모델·파서), commands.js(핸들러·show·부팅), labs.js(시작상태·체크), labs-text.js(README 추출), ui.js, README.md
- 테스트 스크립트(scratchpad, 휘발): /tmp/claude-0/-home-user-exam-study/e26af7ff-f18d-5411-be64-bea499dc4b09/scratchpad/rtest.js(실습), rall.js(415명령)
- 명령: `node <scratchpad>/rtest.js /home/user/exam-study/router` · `python3 -m http.server 8765` + playwright
- 배포 확인: `gh api "repos/co2maker-cyber/exam-study/actions/runs?per_page=1" --jq '.workflow_runs[0].conclusion'`
- 커밋 규칙: 메시지 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01Y4YTP63jL46f9VsU3fQ9jX`
