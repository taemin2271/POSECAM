// DOM이 완전히 로드된 후에 스크립트를 실행합니다.
document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const calibrateButton = document.getElementById('calibrateButton'); // 1. 버튼 선택

  // 1. 팝업이 열릴 때, 저장된 스위치 상태를 불러옵니다.
  chrome.storage.local.get(['isEnabled'], (result) => {
    // 저장된 값이 true이면 스위치를 켜고, 아니면 끕니다.
    toggleSwitch.checked = !!result.isEnabled;
  });

  // 2. 스위치를 클릭할 때 이벤트 리스너를 추가합니다.
  toggleSwitch.addEventListener('click', () => {
    const isEnabled = toggleSwitch.checked;

    // 2a. 새로운 스위치 상태를 chrome.storage에 저장합니다.
    chrome.storage.local.set({ isEnabled: isEnabled });

    // 2b. service-worker.js에게 메시지를 보냅니다.
    if (isEnabled) {
      // 스위치가 켜졌을 때
      chrome.runtime.sendMessage({ action: "startMonitoring" });
    } else {
      // 스위치가 꺼졌을 때
      chrome.runtime.sendMessage({ action: "stopMonitoring" });
    }
  });

  // 👇 2. '자세 측정' 버튼 클릭 이벤트 추가
  calibrateButton.addEventListener('click', () => {
    console.log("Calibrate 버튼 클릭됨 (in popup.js)");
    
    // 1. 'calibrate.html'을 새 탭으로 엽니다.
    chrome.tabs.create({ url: 'calibrate.html' });
    
    // 2. 팝업창은 바로 닫습니다.
    window.close();
  });
});