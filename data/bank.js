/*
 * 문제 은행 공통 설정
 * ------------------------------------------------------------
 * 각 회차 파일(set1.js ~ set4.js)이 addSet(...)으로 문제를 등록합니다.
 *
 * 한 문제 = [영역, 문제, 보기 배열, 정답, 해설]
 *   정답: 1개면 숫자(1부터), 여러 개면 [2, 5] 처럼 배열
 *   주관식: 보기 자리에 null, 정답에 "정답" 또는 ["정답", "다른 표기"]
 *   중복 등으로 뺀 문제는 null 로 두면 번호만 건너뜁니다.
 */
window.QUESTION_BANK = window.QUESTION_BANK || [];
window.D1 = "Domain 1 · 클라우드 개념";
window.D2 = "Domain 2 · 보안 및 규정 준수";
window.D3 = "Domain 3 · 클라우드 기술 및 서비스";
window.D4 = "Domain 4 · 결제·요금·지원";

window.addSet = function (exam, startNo, rows) {
  rows.forEach(function (r, i) {
    if (!r) return;
    var no = startNo + i;
    var q = {
      id: "aws-" + String(no).padStart(3, "0"),
      no: no,
      exam: exam,
      domain: r[0],
      question: r[1],
      answer: r[3],
      explanation: r[4]
    };
    if (r[2]) q.choices = r[2];
    window.QUESTION_BANK.push(q);
  });
};
