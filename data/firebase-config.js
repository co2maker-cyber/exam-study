/*
 * Firebase 설정 (로그인·클라우드 저장용)
 * ------------------------------------------------------------
 * Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → "SDK 설정 및 구성"의 firebaseConfig 값을
 * 아래 null 자리에 그대로 붙여 넣으세요. (이 값은 공개되어도 되는 식별 정보입니다.
 * 실제 데이터 보호는 firestore.rules 보안 규칙이 담당합니다.)
 *
 * 예)
 * window.FIREBASE_CONFIG = {
 *   apiKey: "AIza...",
 *   authDomain: "my-exam-study.firebaseapp.com",
 *   projectId: "my-exam-study",
 *   storageBucket: "my-exam-study.appspot.com",
 *   messagingSenderId: "1234567890",
 *   appId: "1:1234567890:web:abcdef"
 * };
 */
window.FIREBASE_CONFIG = null;
