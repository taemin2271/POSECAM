const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let lastNotificationId = null;

// --- Offscreen Document 헬퍼 함수들 ---
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
// 이벤트 리스너 (onMessage)
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "startMonitoring") {
    // 1. 모니터링 시작
    console.log("Service Worker: 모니터링 시작 메시지 수신");
    const result = await chrome.storage.local.get(['baselinePosture', 'sensitivity']);
    const baseline = result.baselinePosture;
    const sensitivity = result.sensitivity || 2;
    
    console.log("Service Worker: 저장된 기준 자세 불러옴:", baseline);
    console.log("Service Worker: 저장된 민감도 불러옴:", sensitivity);
    
    await createOffscreenDocument();
    
    // Offscreen이 로드될 시간을 준 뒤 설정값 전송
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "setBaseline", data: baseline });
        chrome.runtime.sendMessage({ action: "setSensitivity", sensitivity: sensitivity });
    }, 1000);

  } else if (message.action === "stopMonitoring") {
    // 2. 모니터링 중지
    console.log("Service Worker: 모니터링 중지 메시지 수신.");
    
    // offscreen.js에 중지 신호를 보내 마지막 통계를 요청 (실패해도 무관)
    try {
        await chrome.runtime.sendMessage({ action: "stopMonitoring" });
    } catch (e) {
        console.log("Offscreen 통신 실패 (이미 닫힘?):", e);
        // 통신 실패 시에도 강제로 문서를 닫아야 함
        await closeOffscreenDocument(); 
    }
    
    if(lastNotificationId) { 
      chrome.notifications.clear(lastNotificationId); 
      lastNotificationId = null; 
    }
    
  } else if (message.action === "sendNotification") {
    // 3. 알림 전송
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
    
    // 알림 통계 저장
    await saveAlertStats(message.reason); 

  } else if (message.action === "saveBaseline") {
    // 4. 기준 자세 저장
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
    // 5. 민감도 변경 전달
    console.log("Service Worker: 민감도 변경 수신. offscreen.js로 전달.");
    chrome.runtime.sendMessage(message);
    
  } else if (message.action === "calibrate") {
    // 6. 캘리브레이션 신호 전달
    console.log("Service Worker: Calibrate 메시지 수신. offscreen.js로 전달.");
    chrome.runtime.sendMessage(message); 
    
  } else if (message.action === "frameStatsResponse") {
    // 7. (종료 시) 최종 프레임 통계 수신 및 문서 닫기
    console.log("최종 프레임 통계 수신:", message);
    await saveFrameStats(message.goodFrames, message.badFrames);
    await closeOffscreenDocument(); 
    
  } else if (message.action === "updateFrameStats") {
    // 8. (주기적) 프레임 통계 업데이트
    // console.log("주기적 프레임 통계 수신"); // 로그 너무 많으면 주석 처리
    await saveFrameStats(message.goodFrames, message.badFrames);
  }
});

// -----------------------------------------------------------------------------
// 통계 저장 함수들
// -----------------------------------------------------------------------------
async function saveAlertStats(reasonKey) {
  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get([today]);
  
  let todayStats = result[today] || { totalAlerts: 0, byReason: {}, goodFrames: 0, badFrames: 0 };
  
  todayStats.totalAlerts += 1;
  todayStats.byReason[reasonKey] = (todayStats.byReason[reasonKey] || 0) + 1;
  
  await chrome.storage.local.set({ [today]: todayStats });
  console.log("알림 통계 저장 완료:", todayStats);
}

async function saveFrameStats(goodFrames, badFrames) {
  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get([today]);
  
  let todayStats = result[today] || { totalAlerts: 0, byReason: {}, goodFrames: 0, badFrames: 0 };
  
  todayStats.goodFrames += goodFrames;
  todayStats.badFrames += badFrames;
  
  await chrome.storage.local.set({ [today]: todayStats });
  // console.log("프레임 통계 저장 완료");
}

// -----------------------------------------------------------------------------
// 브라우저 시작/설치 리스너
// -----------------------------------------------------------------------------
chrome.runtime.onStartup.addListener(async () => {
  console.log("브라우저 시작 감지.");
  const result = await chrome.storage.local.get(['isEnabled']);
  if (result.isEnabled) {
    console.log("모니터링이 활성화 상태였습니다. Offscreen document를 생성합니다.");
    const baselineResult = await chrome.storage.local.get(['baselinePosture']);
    const baseline = baselineResult.baselinePosture;
    
    await createOffscreenDocument();
    
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "setBaseline", data: baseline });
    }, 1000);
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ isEnabled: false });
    console.log("확장 프로그램 설치됨. 기본값(isEnabled: false) 설정.");
  }
  if (details.reason === 'update') {
    // 업데이트 시 기준 자세 초기화 (필요에 따라 삭제 가능)
    await chrome.storage.local.remove('baselinePosture');
    console.log("확장 프로그램 업데이트됨. 이전 기준 자세 삭제 완료.");
  }
});