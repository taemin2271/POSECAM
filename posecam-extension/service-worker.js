const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let lastNotificationId = null;

// 1. 민감도(High/Medium/Low)를 시간(ms)으로 변환하는 맵 정의
const TIME_SENSITIVITY_MAP = {
  3 : 3000,   // 3초
  2 : 6000, // 6초
  1 : 10000    // 10초 (기본값)
};

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
// [추가] 스토리지 변경 감지 (팝업에서 설정을 바꾸면 즉시 반영)
// -----------------------------------------------------------------------------
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (changes.sensitivity) {
    const newVal = changes.sensitivity.newValue; // 예: "High"
    const timeValue = TIME_SENSITIVITY_MAP[newVal] || 10000;

    console.log(`[SW] 민감도 변경 감지: ${newVal} -> ${timeValue}ms`);

    // 오프스크린이 켜져 있다면 즉시 새 시간을 전달
    if (await hasOffscreenDocument()) {
      chrome.runtime.sendMessage({
        action: "updateSensitivity",
        time: timeValue
      });
    }
  }
});

// -----------------------------------------------------------------------------
// 이벤트 리스너 (onMessage)
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // (비동기 처리를 위해 async IIFE 패턴 사용 또는 then 체이닝 필요)
  // 여기서는 가독성을 위해 각 케이스별로 처리

  if (message.action === "startMonitoring") {
    // 1. 모니터링 시작
    (async () => {
      console.log("Service Worker: 모니터링 시작 메시지 수신");
      
      // 기존 설정값들 로드 (필요하다면)
      const result = await chrome.storage.local.get(['baselinePosture']);
      const baseline = result.baselinePosture;
      
      await createOffscreenDocument();
      
      // 오프스크린이 로드되면 기준 자세 등 전송
      setTimeout(() => {
          if (baseline) {
            chrome.runtime.sendMessage({ action: "setBaseline", data: baseline });
          }
      }, 1000);
    })();
    return true; 

  } else if (message.action === "stopMonitoring") {
    // 2. 모니터링 중지
    (async () => {
      console.log("Service Worker: 모니터링 중지 메시지 수신.");
      
      // offscreen.js에 중지 신호를 보내 마지막 통계를 요청
      if (await hasOffscreenDocument()) {
          try {
              await chrome.runtime.sendMessage({ action: "stopMonitoring" });
          } catch (e) {
              console.log("Offscreen 통신 실패 (이미 닫힘?):", e);
              await closeOffscreenDocument(); 
          }
      } else {
          // 문서가 없으면 그냥 닫기 처리
          console.log("Offscreen이 이미 없어서 종료 절차만 진행.");
      }

      if(lastNotificationId) { 
        chrome.notifications.clear(lastNotificationId); 
        lastNotificationId = null; 
      }
    })();
    return true;

  } else if (message.action === "requestSensitivity") {
    // [중요] 3. Offscreen이 켜지면서 "초기 시간값 줘!" 할 때
    chrome.storage.local.get(['sensitivity'], (result) => {
        const currentSens = result.sensitivity || "Low";
        const timeValue = TIME_SENSITIVITY_MAP[currentSens] || 10000;
        
        console.log(`[SW] Offscreen에 초기 설정값 전송: ${timeValue}ms`);
        sendResponse({ time: timeValue }); // offscreen.js로 응답
    });
    return true; // 비동기 응답(sendResponse)을 위해 필수

  } else if (message.action === "sendNotification") {
    // 4. 알림 전송
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
    
    saveAlertStats(message.reason); 

  } else if (message.action === "saveBaseline") {
    // 5. 기준 자세 저장
    (async () => {
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
    })();

  } else if (message.action === "calibrate") {
    // 6. 캘리브레이션 신호 전달
    console.log("Service Worker: Calibrate 메시지 수신. offscreen.js로 전달.");
    (async () => {
      if(await hasOffscreenDocument()) {
         chrome.runtime.sendMessage(message); 
      }
    })();
    
  } else if (message.action === "frameStatsResponse") {
    // 7. (종료 시) 최종 프레임 통계 수신 및 문서 닫기
    console.log("최종 프레임 통계 수신:", message);
    (async () => {
        await saveFrameStats(message.goodFrames, message.badFrames);
        await closeOffscreenDocument(); 
    })();
    
  } else if (message.action === "updateFrameStats") {
    // 8. (주기적) 프레임 통계 업데이트
    saveFrameStats(message.goodFrames, message.badFrames);
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
}

// -----------------------------------------------------------------------------
// 브라우저 시작/설치 리스너
// -----------------------------------------------------------------------------
chrome.runtime.onStartup.addListener(async () => {
  console.log("브라우저 시작 감지.");
  const result = await chrome.storage.local.get(['isEnabled']);
  if (result.isEnabled) {
    console.log("모니터링이 활성화 상태였습니다. Offscreen document를 생성합니다.");
    await createOffscreenDocument();
    
    // 이 시점에서 offscreen이 켜지면 스스로 'requestSensitivity'를 보내 시간을 받아갑니다.
    // 따라서 여기서 별도로 sensitivity를 보내줄 필요는 없지만, baseline은 보내줍니다.
    const baselineResult = await chrome.storage.local.get(['baselinePosture']);
    if(baselineResult.baselinePosture) {
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: "setBaseline", data: baselineResult.baselinePosture });
        }, 1000);
    }
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ isEnabled: false });
    console.log("확장 프로그램 설치됨. 기본값(isEnabled: false) 설정.");
  }
  if (details.reason === 'update') {
    await chrome.storage.local.remove('baselinePosture');
    console.log("확장 프로그램 업데이트됨. 이전 기준 자세 삭제 완료.");
  }
});