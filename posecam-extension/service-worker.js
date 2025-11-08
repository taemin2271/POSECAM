const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let lastNotificationId = null;
// (삭제) let stretchReminderCount = 0;
// (삭제) let lastStretchNotificationId = null;

// --- Offscreen Document 헬퍼 함수들 (이전과 동일) ---
async function hasOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return !!existingContexts.length;
}
async function createOffscreenDocument() {
  if (await hasOffscreenDocument()) { console.log("Offscreen document가 이미 존재합니다."); return; }
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification: '실시간 자세 분석을 위해 웹캠에 접근해야 합니다.',
  });
  console.log("Offscreen document 생성됨.");
}
async function closeOffscreenDocument() {
  if (!(await hasOffscreenDocument())) { console.log("Offscreen document가 존재하지 않아 닫을 수 없습니다."); return; }
  await chrome.offscreen.closeDocument();
  console.log("Offscreen document 닫힘.");
}

// -----------------------------------------------------------------------------
// 이벤트 리스너 (onMessage) (🚨 민감도 로직 추가됨)
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "startMonitoring") {
    // 1. 모니터링 시작
    console.log("Service Worker: 모니터링 시작 메시지 수신");
    
    // (수정) 기준 자세와 민감도를 '동시에' 불러옵니다.
    const result = await chrome.storage.local.get(['baselinePosture', 'sensitivity']);
    const baseline = result.baselinePosture;
    const sensitivity = result.sensitivity || 2; // 기본값 2 (보통)
    
    console.log("Service Worker: 저장된 기준 자세 불러옴:", baseline);
    console.log("Service Worker: 저장된 민감도 불러옴:", sensitivity);
    
    await createOffscreenDocument();
    
    // (수정) 1초 지연 후, 기준 자세와 민감도를 '둘 다' 전송
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "setBaseline", data: baseline });
        chrome.runtime.sendMessage({ action: "setSensitivity", sensitivity: sensitivity });
    }, 1000); // 1초 지연 (offscreen.js 로드 대기)

  } else if (message.action === "stopMonitoring") {
    // 2. 모니터링 중지 (이전과 동일)
    console.log("Service Worker: 모니터링 중지 메시지 수신");
    await closeOffscreenDocument();
    if(lastNotificationId) { chrome.notifications.clear(lastNotificationId); lastNotificationId = null; }
    
  } else if (message.action === "sendNotification") {
    // 3. 알림 전송 (이전과 동일)
    console.log("Service Worker: 알림 요청 수신");
    if(lastNotificationId) { chrome.notifications.clear(lastNotificationId); }
    chrome.notifications.create({
      type: "basic",
      iconUrl: "images/icon128.png",
      title: "Posecam 경고",
      message: message.message
    }, (notificationId) => {
      lastNotificationId = notificationId;
    });
    
    await saveStats(message.reason); 

  } else if (message.action === "saveBaseline") {
    // 4. 기준 자세 저장 (이전과 동일)
    console.log("Service Worker: 기준 자세 저장 요청 수신", message.data);
    await chrome.storage.local.set({ baselinePosture: message.data });
    chrome.notifications.create({
      type: "basic",
      iconUrl: "images/icon128.png",
      title: "Posecam 알림",
      message: "기준 자세가 저장되었습니다!"
    }, (notificationId) => {
      lastNotificationId = notificationId;
    });
    
  } else if (message.action === "sensitivityChanged") {
    // 5. (추가!) popup.js로부터 '민감도 변경' 메시지 수신
    console.log("Service Worker: 민감도 변경 수신. offscreen.js로 전달.");
    // offscreen.js에 바로 전달
    chrome.runtime.sendMessage(message);
  }
});

// (수정!) 오직 통계 저장만 하는 함수
async function saveStats(reasonKey) {
  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get([today]);
  
  let todayStats = result[today] || { total: 0, byReason: {} };
  todayStats.total += 1;
  todayStats.byReason[reasonKey] = (todayStats.byReason[reasonKey] || 0) + 1;
  
  await chrome.storage.local.set({ [today]: todayStats });
  console.log("통계 저장 완료:", todayStats);
  
  // (삭제!) 스트레칭 카운터 로직 모두 제거
}

// (삭제!) 🚨 chrome.notifications.onButtonClicked.addListener(...) 함수 전체 삭제

// ... (onStartup, onInstalled 리스너는 이전과 동일) ...



// ... (onStartup, onInstalled 리스너는 이전과 동일) ...
// -----------------------------------------------------------------------------
// 🚨 (수정) onStartup / onInstalled 리스너
// -----------------------------------------------------------------------------

chrome.runtime.onStartup.addListener(async () => {
  console.log("브라우저 시작 감지.");
  const result = await chrome.storage.local.get(['isEnabled']);
  if (result.isEnabled) {
    console.log("모니터링이 활성화 상태였습니다. Offscreen document를 생성합니다.");
    // (수정) 시작할 때도 기준 자세를 불러와서 전달해야 합니다.
    const baselineResult = await chrome.storage.local.get(['baselinePosture']);
    const baseline = baselineResult.baselinePosture;
    console.log("Service Worker: 저장된 기준 자세 불러옴:", baseline);
    
    await createOffscreenDocument();
    
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "setBaseline", data: baseline });
    }, 1000);
  }
});

// (수정!) 확장 프로그램이 설치/업데이트될 때
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 처음 설치 시
    await chrome.storage.local.set({ isEnabled: false });
    console.log("확장 프로그램 설치됨. 기본값(isEnabled: false) 설정.");
  }
  
  // (추가!) 업데이트 시, 호환되지 않는 이전 기준 자세를 삭제합니다.
  if (details.reason === 'update') {
    await chrome.storage.local.remove('baselinePosture');
    console.log("확장 프로그램 업데이트됨. 이전 기준 자세 삭제 완료.");
  }
});