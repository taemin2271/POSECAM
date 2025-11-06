document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('previewVideo');
  const saveButton = document.getElementById('saveButton');
  const cameraSelect = document.getElementById('cameraSelect'); // (추가)

  let currentStream = null; // (수정) 현재 스트림을 관리하기 위한 전역 변수

  // 1. (수정) 웹캠 시작 함수: deviceId를 받도록 변경
  async function startWebcam(deviceId) {
    // (추가) 기존 스트림이 있으면 중지 (카메라 전환 시)
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }

    // (추가) constraints(제약조건) 설정
    const constraints = {
      video: { 
        width: 640, 
        height: 480,
        // deviceId가 있으면 해당 카메라로, 없으면 기본 카메라로
        deviceId: deviceId ? { exact: deviceId } : undefined
      },
      audio: false
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      currentStream = stream; // (수정) 현재 스트림으로 저장
    } catch (err) {
      console.error("웹캠 접근 실패:", err);
      alert("웹캠을 켤 수 없습니다. 권한을 확인해주세요.");
    }
  }

  // 2. (추가) 사용 가능한 카메라 목록을 가져와 드롭다운에 채우는 함수
  async function getCameras() {
    try {
      // (중요) 이 함수를 호출하려면 먼저 getUserMedia로 권한을 한 번 받아야 함
      // (하지만 startWebcam이 먼저 호출되므로 괜찮음)
      await navigator.mediaDevices.getUserMedia({video: true, audio: false}); // 임시 권한 요청
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');

      // 드롭다운에 옵션 추가
      videoDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Camera ${cameraSelect.length + 1}`;
        cameraSelect.appendChild(option);
      });
      
      // (추가) 임시로 요청했던 스트림은 끈다
      const tempStream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
      tempStream.getTracks().forEach(track => track.stop());

    } catch(err) {
      console.log("카메라 목록 가져오기 실패:", err);
    }
  }

  // 3. '저장' 버튼 클릭 이벤트 (currentStream 사용하도록 수정)
  saveButton.addEventListener('click', () => {
    console.log("Calibrate 버튼 클릭됨 (in calibrate.html)");
    chrome.runtime.sendMessage({ action: "calibrate" });
    
    // (수정) 현재 스트림(currentStream)을 끄고 탭 닫기
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
    window.close();
  });

  // 4. (추가) 드롭다운 선택 변경 시, startWebcam 다시 호출
  cameraSelect.addEventListener('change', () => {
    startWebcam(cameraSelect.value); // 선택된 deviceId로 웹캠 다시 시작
  });

  // 5. (수정) 페이지 로드 시 실행 순서
  async function init() {
    await getCameras(); // 1. 카메라 목록부터 채우고
    await startWebcam(cameraSelect.value); // 2. 목록의 첫 번째 카메라로 웹캠 시작
  }
  
  init(); // 페이지 로드 시 즉시 실행
});