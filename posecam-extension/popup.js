document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const calibrateButton = document.getElementById('calibrateButton');
  const dashboardButton = document.getElementById('dashboardButton');
  const sensitivitySlider = document.getElementById('sensitivitySlider'); // (추가)

  // 1. (수정) 팝업 열릴 때, '활성화' 상태와 '민감도' 상태를 둘 다 불러옴
  chrome.storage.local.get(['isEnabled', 'sensitivity'], (result) => {
    // 1a. 활성화 스위치 설정
    toggleSwitch.checked = !!result.isEnabled;
    
    // 1b. (추가) 민감도 슬라이더 설정 (기본값: 2 '보통')
    sensitivitySlider.value = result.sensitivity || 2;
  });

  // 2. (추가) 민감도 슬라이더 변경 이벤트
  sensitivitySlider.addEventListener('input', () => { // 'input'은 드래그 즉시 반응
    const newSensitivity = parseInt(sensitivitySlider.value, 10);
    
    // 2a. 새 민감도를 저장소에 저장
    chrome.storage.local.set({ sensitivity: newSensitivity });
    
    // 2b. (중요!) offscreen.js에 실시간으로 "민감도 변경됨" 메시지 전송
    chrome.runtime.sendMessage({
      action: "sensitivityChanged",
      sensitivity: newSensitivity
    });
  });

  // 3. 활성화 스위치 클릭 이벤트 (이전과 동일)
  toggleSwitch.addEventListener('click', () => {
    const isEnabled = toggleSwitch.checked;
    chrome.storage.local.set({ isEnabled: isEnabled });
    if (isEnabled) {
      chrome.runtime.sendMessage({ action: "startMonitoring" });
    } else {
      chrome.runtime.sendMessage({ action: "stopMonitoring" });
    }
  });

  // 4. 캘리브레이션 버튼 클릭 이벤트 (이전과 동일)
  calibrateButton.addEventListener('click', () => {
    console.log("Calibrate 버튼 클릭됨 (in popup.js)");
    chrome.tabs.create({ url: 'calibrate.html' });
    window.close();
  });
  
  // 5. 대시보드 버튼 클릭 이벤트 (이전과 동일)
  dashboardButton.addEventListener('click', () => {
    chrome.tabs.create({ url: 'dashboard.html' });
    window.close();
  });
});