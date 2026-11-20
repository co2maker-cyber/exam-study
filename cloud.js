// 로그인 + 클라우드 저장 (Firebase Authentication + Cloud Firestore)
// app.js는 window.Cloud 와 아래 이벤트만 사용합니다.
//   "cloud-ready"  : window.Cloud 준비 완료
//   "auth-changed" : 로그인 상태 변경 (detail = 사용자 또는 null)
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

const ERR = {
  "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
  "auth/missing-password": "비밀번호를 입력하세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인하세요.",
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않습니다.",
  "auth/wrong-password": "이메일 또는 비밀번호가 맞지 않습니다.",
  "auth/user-not-found": "가입되지 않은 이메일입니다.",
  "auth/too-many-requests": "시도가 너무 많습니다. 잠시 후 다시 시도하세요.",
  "auth/popup-closed-by-user": "로그인 창이 닫혔습니다.",
  "auth/unauthorized-domain": "이 사이트 주소가 Firebase 승인 도메인에 등록되지 않았습니다. (README의 설정 4단계 참고)",
  "auth/operation-not-allowed": "Firebase 콘솔에서 이 로그인 방식이 켜져 있지 않습니다. (README의 설정 2단계 참고)",
  "auth/network-request-failed": "네트워크 연결을 확인하세요.",
  "permission-denied": "저장 권한이 없습니다. Firestore 보안 규칙을 확인하세요. (README의 설정 3단계 참고)"
};
const message = e => ERR[e && e.code] || (e && e.message) || "알 수 없는 오류가 발생했습니다.";

function announce(cloud) {
  window.Cloud = cloud;
  window.dispatchEvent(new Event("cloud-ready"));
}

async function init() {
  const config = window.FIREBASE_CONFIG;
  if (!config || !config.apiKey) {
    announce({ enabled: false, user: null, message });
    return;
  }
  const { initializeApp } = await import(FB + "firebase-app.js");
  const A = await import(FB + "firebase-auth.js");
  const F = await import(FB + "firebase-firestore.js");

  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const google = new A.GoogleAuthProvider();
  google.setCustomParameters({ prompt: "select_account" });

  const cloud = {
    enabled: true,
    user: null,
    message,
    async signInGoogle() {
      try {
        await A.signInWithPopup(auth, google);
      } catch (e) {
        if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-environment") {
          await A.signInWithRedirect(auth, google);
        } else throw e;
      }
    },
    signInEmail: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    async signUpEmail(email, pw, name) {
      const cred = await A.createUserWithEmailAndPassword(auth, email, pw);
      if (name) await A.updateProfile(cred.user, { displayName: name });
      return cred;
    },
    resetPassword: email => A.sendPasswordResetEmail(auth, email),
    signOut: () => A.signOut(auth),
    // 학습 기록: users/{uid} 문서 하나에 JSON 문자열로 저장
    async load() {
      const snap = await F.getDoc(F.doc(db, "users", cloud.user.uid));
      if (!snap.exists()) return null;
      const d = snap.data();
      try { return JSON.parse(d.data); } catch (e) { return null; }
    },
    async save(data) {
      await F.setDoc(F.doc(db, "users", cloud.user.uid), {
        data: JSON.stringify(data),
        updatedAt: F.serverTimestamp(),
        email: cloud.user.email || ""
      });
    }
  };

  A.getRedirectResult(auth).catch(() => {});
  A.onAuthStateChanged(auth, user => {
    cloud.user = user ? { uid: user.uid, email: user.email, name: user.displayName || (user.email || "").split("@")[0], photo: user.photoURL } : null;
    window.dispatchEvent(new CustomEvent("auth-changed", { detail: cloud.user }));
  });
  announce(cloud);
}

init().catch(e => {
  console.error("Firebase 초기화 실패", e);
  announce({ enabled: false, failed: true, user: null, message });
});
