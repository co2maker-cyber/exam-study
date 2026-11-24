# HANDOFF — 기출 반복 학습 사이트 (2026-11-24)

## 목표
- GitHub Pages 정적 학습 사이트: AWS CLF-C02 191 + 네트워크관리사 2급 450 + 정보통신 유지보수 149(예상문제) 풀이, 학습 연구 기반 복습, 실기 실습장

## 현황
✓ 배포: https://co2maker-cyber.github.io/exam-study/ (repo co2maker-cyber/exam-study, main, 최신 a65a922, Pages success)
✓ 실기 실습장: windows/·linux/ 추가(3rd- 저장소 복사), 상단 '실기' 메뉴(renderLabs, 완료 수 localStorage winlab.done·lxlab.done·routerLab.v1)
✓ router/ Tab 완성 개선(engine.js complete(): 공통 접두사·후보 목록·인터페이스명·do·하위모드 fallback), 사용자 모드 show 허용(commands.js S.USER_SHOW)
✓ 정보통신 유지보수 과목(category "ict"): data/ict-1~4.js 120문항 + ict-5.js 그림 29문항(img/ict/*.png 21개), glossary-ict.js 60개, 정답표-정보통신유지보수.md
✓ 학습 엔진 개편(app.js): 간격 반복 IV=[0,1,3,7,16,35,80]일, 오늘의 학습(plan()), 확신도(확실/애매/찍음), 착각 교정(hyper), 연속 재학습(RELEARN_GAP=4), 교차 학습(interleave), 먼저 떠올리기, 학습 원리 페이지(renderScience, 논문 16편)
✓ 힌트(useHint: 오답 지우기×2 → 핵심 단서 clueText), 채점 후 보기별 이유(parseExpl, whyHTML)
✓ 영어 약어 풀이: data/abbr.js(ABBR·ABBR_GROUPS·ABBR_ALIAS, 426항목), abbrHTML/abbrBox, 풀이 전 문제 속 약어만
✗ 네트워크관리사 그림 88문항 미추가 — 원본 md가 img/*.png 참조, 그림 파일 미제공(hwpx엔 미리보기만)
✗ 414·432번 제외 — 공식 정답 갈림

## 결정사항
- 실습(router/windows/linux)·practice.js는 개편 대상 아님 — 사용자 지시
- 풀이 전 보기 속 약어는 풀지 않음 — 답 노출 방지
- 가짜 보기 용어(1000Base-NX·BX·AX)는 약어 사전에서 제외
- 힌트 1개 사용 → 간격 유지, 2개 이상 → guess 처리(다음 날)
- 오답노트 졸업 = 서로 다른 날 2회 연속 정답
- 워터마크(multicore-it.com) 그림·IP-MPLS 구성도는 그림 문제에서 제외
- 스크립트·CSS 주소에 ?v=20261124d 캐시 버전 — 수정 시 index.html에서 버전 올릴 것

## 이슈/주의
- 사용자 요청: 결과 보고마다 사이트·router/ 링크 표시, 한국어
- 사용자 지적: 휴대폰에서 확신도 버튼 글자 "확실해/요" 두 줄로 잘림 — 수정 제안만 함(미응답)
- 사용자는 근거를 물으면 코딩 말고 논문 기반 설명을 원함
- github.io 접속 차단 → 배포 확인은 gh api만; Pages 빌드가 안 뜨면 빈 커밋으로 재실행(9ade999 때 발생)
- push 시 `fatal: expected 'acknowledgments'` 경고 무시 가능
- 로컬 저장 키 examStudy.v1(stats·wrong·known·custom·srs·days·settings), 이전 기록은 normalize()가 srs로 변환

## 다음 할 일
1. 사용자 다음 요청 대기 — 후보: 확신도 버튼 줄바꿈 수정(style.css .conf-btns), img/ 받으면 net2 그림 88문항 추가
2. 변경 시 검증(node --check, playwright) → 정답표 재생성 → commit·push → 배포 확인 → 링크 안내

## 참조
- 파일: /home/user/exam-study/app.js(학습 엔진·UI), style.css, index.html, data/bank.js(addSet/addNet/addIct, CATEGORIES), data/abbr.js, data/ict-1~5.js
- 원본: /root/.claude/uploads/e26af7ff-f18d-5411-be64-bea499dc4b09/ (net2 md, 강의자료 pdf·docx)
- 테스트 스크립트(휘발): /tmp/claude-0/-home-user-exam-study/e26af7ff-f18d-5411-be64-bea499dc4b09/scratchpad/ learn.js, hint.js, abbr-test.js, rall.js·rtest.js(라우터 회귀 `node rall.js /home/user/exam-study/router`)
- 명령: `python3 -m http.server 8765` (repo 루트)
- 배포 확인: `gh api "repos/co2maker-cyber/exam-study/actions/runs?per_page=1" --jq '.workflow_runs[0] | "\(.head_sha[0:7]) \(.status) \(.conclusion)"'`
- 커밋 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01Y4YTP63jL46f9VsU3fQ9jX`
- 링크: https://co2maker-cyber.github.io/exam-study/ · https://co2maker-cyber.github.io/exam-study/router/
