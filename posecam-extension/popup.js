document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const calibrateButton = document.getElementById('calibrateButton');
  const dashboardButton = document.getElementById('dashboardButton'); // (추가)

  // ... (스위치 상태 불러오는 코드는 그대로) ...
  chrome.storage.local.get(['isEnabled'], (result) => {
    toggleSwitch.checked = !!result.isEnabled;
  });

  // ... (스위치 클릭 이벤트는 그대로) ...
  toggleSwitch.addEventListener('click', () => {
    const isEnabled = toggleSwitch.checked;
    chrome.storage.local.set({ isEnabled: isEnabled });
    if (isEnabled) {
      chrome.runtime.sendMessage({ action: "startMonitoring" });
    } else {
      chrome.runtime.sendMessage({ action: "stopMonitoring" });
    }
  });

  // ... (캘리브레이션 버튼 클릭 이벤트는 그대로) ...
  calibrateButton.addEventListener('click', () => {
    console.log("Calibrate 버튼 클릭됨 (in popup.js)");
    chrome.tabs.create({ url: 'calibrate.html' });
    window.close();
  });
  
  // 👇 (추가) 대시보드 버튼 클릭 이벤트
  dashboardButton.addEventListener('click', () => {
    // 'dashboard.html'을 새 탭으로 엽니다.
    chrome.tabs.create({ url: 'dashboard.html' });
    window.close();
  });
});