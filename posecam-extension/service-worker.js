const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

let lastNotificationId = null;
// -----------------------------------------------------------------------------
// Offscreen Document 관리 헬퍼 함수
// -----------------------------------------------------------------------------

// offscreen.html이 이미 열려 있는지 확인합니다.
async function hasOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  return !!existingContexts.length;
}

// offscreen.html을 생성합니다.
async function createOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    console.log("Offscreen document가 이미 존재합니다.");
    return;
  }
  
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'], // 웹캠(getUserMedia) 사용 권한 요청
    justification: '실시간 자세 분석을 위해 웹캠에 접근해야 합니다.',
  });
  console.log("Offscreen document 생성됨.");
}

// offscreen.html을 닫습니다.
async function closeOffscreenDocument() {
  if (!(await hasOffscreenDocument())) {
    console.log("Offscreen document가 존재하지 않아 닫을 수 없습니다.");
    return;
  }
  await chrome.offscreen.closeDocument();
  console.log("Offscreen document 닫힘.");
}

// -----------------------------------------------------------------------------
// 이벤트 리스너
// -----------------------------------------------------------------------------

// 1. 메시지 수신 (popup.js와 offscreen.js로부터)
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "startMonitoring") {
    console.log("Service Worker: 모니터링 시작 메시지 수신");
    await createOffscreenDocument();
  } else if (message.action === "stopMonitoring") {
    console.log("Service Worker: 모니터링 중지 메시지 수신");
    await closeOffscreenDocument();
    
    // (추가) 모니터링이 중지되면 마지막 알림을 닫습니다.
    if(lastNotificationId) {
      chrome.notifications.clear(lastNotificationId);
      lastNotificationId = null;
    }
    
  } else if (message.action === "sendNotification") {
    // 👇 (추가!) offscreen.js로부터 알림 요청을 받습니다.
    console.log("Service Worker: 알림 요청 수신");
    
    // (추가) 알림이 너무 자주 뜨지 않도록, 이전 알림이 있다면 닫습니다.
    if(lastNotificationId) {
      chrome.notifications.clear(lastNotificationId);
    }

    // OS 알림을 생성합니다.
    chrome.notifications.create({
      type: "basic",
      iconUrl: "images/icon128.png", // manifest.json에 등록된 아이콘
      title: "Posecam 경고",
      message: message.message
    }, (notificationId) => {
      lastNotificationId = notificationId; // 알림 ID 저장
    });
  }
});

// 2. 브라우저가 시작될 때, 저장된 스위치 상태를 확인합니다.
chrome.runtime.onStartup.addListener(async () => {
  console.log("브라우저 시작 감지.");
  const result = await chrome.storage.local.get(['isEnabled']);
  if (result.isEnabled) {
    console.log("모니터링이 활성화 상태였습니다. Offscreen document를 생성합니다.");
    await createOffscreenDocument();
  }
});

// 3. 확장 프로그램이 처음 설치될 때 기본값을 설정합니다.
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 기본값은 '비활성화'
    await chrome.storage.local.set({ isEnabled: false });
    console.log("확장 프로그램 설치됨. 기본값(isEnabled: false) 설정.");
  }
});