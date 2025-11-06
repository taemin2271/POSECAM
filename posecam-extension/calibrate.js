document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('previewVideo');
  const saveButton = document.getElementById('saveButton');
  let stream = null;

  // 1. 웹캠 접근 및 비디오에 스트림 연결
  async function startWebcam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });
      video.srcObject = stream;
    } catch (err) {
      console.error("웹캠 접근 실패:", err);
      alert("웹캠을 켤 수 없습니다. 권한을 확인해주세요.");
    }
  }

  // 2. '저장' 버튼 클릭 이벤트
  saveButton.addEventListener('click', () => {
    console.log("Calibrate 버튼 클릭됨 (in calibrate.html)");
    
    // (중요) 백그라운드(offscreen.js)에 'calibrate' 메시지 전송
    chrome.runtime.sendMessage({ action: "calibrate" });
    
    // 3. 작업 완료 후 스트림 끄고 탭 닫기
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    window.close(); // 현재 탭 닫기
  });

  // 페이지 로드 시 즉시 웹캠 시작
  startWebcam();
});