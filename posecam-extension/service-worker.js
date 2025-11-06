const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let lastNotificationId = null;

// --- Offscreen Document 헬퍼 함수들 (이전과 동일) ---
async function hasOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  return !!existingContexts.length;
}

async function createOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    console.log("Offscreen document가 이미 존재합니다.");
    return;
  }
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification: '실시간 자세 분석을 위해 웹캠에 접근해야 합니다.',
  });
  console.log("Offscreen document 생성됨.");
}

async function closeOffscreenDocument() {
  if (!(await hasOffscreenDocument())) {
    console.log("Offscreen document가 존재하지 않아 닫을 수 없습니다.");
    return;
  }
  await chrome.offscreen.closeDocument();
  console.log("Offscreen document 닫힘.");
}

// -----------------------------------------------------------------------------
// 🚨 (수정) 이벤트 리스너: 저장/불러오기 기능 추가
// -----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "startMonitoring") {
    // 1. 모니터링 시작
    console.log("Service Worker: 모니터링 시작 메시지 수신");
    
    // (추가) 1. 먼저 저장소에서 기준 자세를 불러옵니다.
    const result = await chrome.storage.local.get(['baselinePosture']);
    const baseline = result.baselinePosture;
    console.log("Service Worker: 저장된 기준 자세 불러옴:", baseline);
    
    // (추가) 2. Offscreen document를 생성합니다.
    await createOffscreenDocument();
    
    // (추가) 3. 생성된 Offscreen document에 기준 자세를 전송합니다.
    // (1초 지연: offscreen.js의 리스너가 준비될 시간을 줍니다)
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "setBaseline", data: baseline });
    }, 1000);

  } else if (message.action === "stopMonitoring") {
    // 2. 모니터링 중지 (이전과 동일)
    console.log("Service Worker: 모니터링 중지 메시지 수신");
    await closeOffscreenDocument();
    if(lastNotificationId) {
      chrome.notifications.clear(lastNotificationId);
      lastNotificationId = null;
    }
    
  } else if (message.action === "sendNotification") {
    // 3. 알림 전송 (이전과 동일)
    console.log("Service Worker: 알림 요청 수신");
    if(lastNotificationId) {
      chrome.notifications.clear(lastNotificationId);
    }
    chrome.notifications.create({
      type: "basic",
      iconUrl: "images/icon128.png",
      title: "Posecam 경고",
      message: message.message
    }, (notificationId) => {
      lastNotificationId = notificationId;
    });
    
  } else if (message.action === "saveBaseline") {
    // 4. (추가!) offscreen.js로부터 '기준 자세 저장' 요청을 받습니다.
    console.log("Service Worker: 기준 자세 저장 요청 수신", message.data);
    
    // 4a. 저장소에 저장합니다.
    await chrome.storage.local.set({ baselinePosture: message.data });
    
    // 4b. 저장 완료 알림을 보냅니다.
    chrome.notifications.create({
      type: "basic",
      iconUrl: "images/icon128.png",
      title: "Posecam 알림",
      message: "기준 자세가 저장되었습니다!"
    }, (notificationId) => {
      lastNotificationId = notificationId;
    });
  }
});

// --- (onStartup, onInstalled 리스너는 이전과 동일) ---
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