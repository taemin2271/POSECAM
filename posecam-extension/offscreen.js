import { FilesetResolver, PoseLandmarker } from './lib/vision_bundle.js';

console.log("Offscreen script가 성공적으로 로드되었습니다.");

// --- [추가 1] 알림 효과음 (짧은 '띵' 소리) ---
// 별도의 mp3 파일 없이도 이 코드로 바로 소리가 납니다.
// 👇 이걸로 교체하세요! (선명한 알림음)
const ALERT_SOUND_SRC = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWYGAABAAD8APwBAAEEAQgBCAEMARABFAEUARgBHAEgASABJAEoASwBLAEwATQBOAE8ATwBQAFEAUgBSAFMAVABVAFUAVgBXAFgAWQBZAFoAWwBcAF0AXQBeAF8AYABhAGEAYgBjAGQAZQBmAGYAZwBoAGkAagBqAGsAbABtAG4AbwBvAHAAcQByAHMAdAB0AHUAdgB3AHgAeQB6AHoAewB8AH0AfgB/AIAAgACBAIIAgwCEAIUAhgCHAIcAiACJAIoAiwCMAI0AjgCPAI8AkACRAJIAkwCUAJUAlgCXAJgAmQCaAJsAnACdAJ4AnwCgAKEAogCjAKQApQCmAKcAqACpAKoAqwCsAK0ArgCvALAAsQCyALMAtAC1ALYAtwC4ALkAugC7ALwAvQC+AL8AwADBAMIAwwDEAMUAxgDHAMgAyQDKAMsAzADNAM4AzwDQANEA0gDTANQA1QDWANcA2ADZANoA2wDcAN0A3gDfAOAA4QDiAOMA5ADlAOYA5wDoAOkA6gDrAOwA7QDuAO8A8ADxAPIA8wD0APUA9gD3APgA+QD6APsA/AD9AP4A/wAAAAEAAgADAAQABQAGAAcACAAJAAoACwAMAA0ADgAPABAAEQASABMAFAAVABYAFwAYABkAGgAbABwAHQAeAB8AIAAhACIAIwAkACUAJgAnACgAKQAqACsALAAtAC4ALwAwADEAMgAzADQANQA2ADcANAA1ADYANwA4ADkAOgA7ADwAPQA+AD8AQABBAEIAQwBEAEUARgBHAEgASABJAEoASwBLAEwATQBOAE8AUABRAFIAUwBUAFUAVgBXAFgAWQBaAFsAXABdAF4AXwBgAGEAYgBjAGQAZQBmAGcAaABpAGoAqwCsAK0ArgCvALAAsQCyALMAtAC1ALYAtwC4ALkAugC7ALwAvQC+AL8AwADBAMIAwwDEAMUAxgDHAMgAyQDKAMsAzADNAM4AzwDQANEA0gDTANQA1QDWANcA2ADZANoA2wDcAN0A3gDfAOAA4QDiAOMA5ADlAOYA5wDoAOkA6gDrAOwA7QDuAO8A8ADxAPIA8wD0APUA9gD3APgA+QD6APsA/AD9AP4A/wAAAAEAAgADAAQABQAGAAcACAAJAAoACwAMAA0ADgAPABAAEQASABMAFAAVABYAFwAYABkAGgAbABwAHQAeAB8AIAAhACIAIwAkACUAJgAnACgAKQAqACsALAAtAC4ALwAwADEAMgAzADQANQA2ADcANAA1ADYANwA4ADkAOgA7ADwAPQA+AD8AQABBAEIAQwBEAEUARgBHAEgASABJAEoASwBLAEwATQBOAE8AUABRAFIAUwBUAFUAVgBXAFgAWQBaAFsAXABdAF4AXwBgAGEAYgBjAGQAZQBmAGcAaABpAGoAqwCsAK0ArgCvALAAsQCyALMAtAC1ALYAtwC4ALkAugC7ALwAvQC+AL8AwADBAMIAwwDEAMUAxgDHAMgAyQDKAMsAzADNAM4AzwDQANEA0gDTANQA1QDWANcA2ADZANoA2wDcAN0A3gDfAOAA4QDiAOMA5ADlAOYA5wDoAOkA6gDrAOwA7QDuAO8A8ADxAPIA8wD0APUA9gD3APgA+QD6APsA/AD9AP4A/wAAAAEAAgADAAQABQAGAAcACAAJAAoACwAMAA0ADgAPABAAEQASABMAFAAVABYAFwAYABkAGgAbABwAHQAeAB8AIAAhACIAIwAkACUAJgAnACgAKQAqACsALAAtAC4ALwAwADEAMgAzADQANQA2ADcANAA1ADYANwA4ADkAOgA7ADwAPQA+AD8AQABBAEIAQwBEAEUARgBHAEgASABJAEoASwBLAEwATQBOAE8AUABRAFIAUwBUAFUAVgBXAFgAWQBaAFsAXABdAF4AXwBgAGEAYgBjAGQAZQBmAGcAaABpAGo=";
const alertAudio = new Audio(ALERT_SOUND_SRC);
alertAudio.volume = 1.0; // 볼륨 최대

// --- 전역 변수 ---
let poseLandmarker = undefined;
let scalerParams = undefined; 
let video;

// 👇 기본 10초
let notificationThresholdMs = 6000; 

let badPostureStartTime = null;
let notificationSent = false;
let latestLandmarks = null;
let detectionIntervalId = null;
const DETECTION_INTERVAL_MS = 100;

// 프레임 카운터
let goodFrameCount = 0;
let badFrameCount = 0;

// 캘리브레이션 모드 변수
let isCalibrationMode = false;
const CALIBRATION_X_THRESHOLD = 0.05; 
const CALIBRATION_Y_THRESHOLD = 0.05;

// 샌드박스 통신용 변수
let sandboxFrame = null;
let isModelReady = false; 

// -----------------------------------------------------------------------------
// 0. 초기화
// -----------------------------------------------------------------------------
async function init() {
  // 1. 초기 민감도 가져오기
  chrome.runtime.sendMessage({ action: "requestSensitivity" }, (response) => {
      if (response && response.time) {
          notificationThresholdMs = response.time;
          console.log(`✅ 초기 민감도 설정 완료: ${notificationThresholdMs/1000}초`);
      }
  });

  // 2. 스케일러 파라미터 로드
  try {
    const response = await fetch('tfjs_model/scaler_params.json');
    scalerParams = await response.json();
    console.log("✅ 스케일러 로드 완료");
  } catch (e) {
    console.error("❌ 스케일러 로드 실패:", e);
  }

  // 3. 샌드박스 설정
  sandboxFrame = document.getElementById('ai-sandbox');
  window.addEventListener('message', (event) => {
    if (event.data.type === 'MODEL_LOADED') {
      console.log("✅ 딥러닝 모델 준비됨 (Sandbox)");
      isModelReady = true;
    } 
    else if (event.data.type === 'PREDICT_RESULT') {
      handlePredictionResult(event.data.probability);
    }
  });

  // 4. MediaPipe 시작
  createPoseLandmarker();
}

// -----------------------------------------------------------------------------
// 1. 예측 결과 처리 (소리 알림 추가됨!)
// -----------------------------------------------------------------------------
function handlePredictionResult(probability) {
  const isBadPosture = probability > 0.35;

  if (isBadPosture) {
    console.log(`🐢 거북목 감지!`);
    badFrameCount++;
    
    if (badPostureStartTime === null) {
      badPostureStartTime = Date.now();
    } 
    else if (Date.now() - badPostureStartTime >= notificationThresholdMs) {
        
      if (!notificationSent) { 
          // 🔔 [추가 2] 소리 재생!
          playAlertSound();

          // 기존 알림 전송
          chrome.runtime.sendMessage({ 
            action: "sendNotification", 
            message: "거북목이 감지되었습니다! 허리를 펴세요.", 
            reason: "거북목" 
          });
          
          console.log(`⏰ ${notificationThresholdMs/1000}초 경과 알림(소리포함) 전송 완료.`);
          notificationSent = true; 
          
          badPostureStartTime = Date.now();
          notificationSent = false; 
      }
    }
  } else {
    // 바른 자세 처리
    const goodPostureScore = (1 - probability) * 100;
    console.log(`✅ 바른 자세`); 
    
    goodFrameCount++;
    badPostureStartTime = null;
    notificationSent = false;
  }
}

// 🔊 소리 재생 함수 (에러 방지 처리 포함)
function playAlertSound() {
    // 브라우저 정책상 사용자가 먼저 상호작용하지 않으면 소리가 차단될 수 있음.
    // 하지만 확장 프로그램 Offscreen 환경에서는 보통 허용됨.
    try {
        alertAudio.currentTime = 0; // 재생 위치 처음으로
        alertAudio.play().catch(e => console.warn("소리 재생 실패 (브라우저 정책):", e));
    } catch (e) {
        console.error("오디오 에러:", e);
    }
}

// -----------------------------------------------------------------------------
// 2. 메시지 리스너
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "calibrationStarted") {
    isCalibrationMode = true;
    
  } else if (message.action === "calibrationStopped") {
    isCalibrationMode = false;
    
  } else if (message.action === "calibrate") {
    isCalibrationMode = false;
    chrome.runtime.sendMessage({ action: "saveBaseline", data: { calibrated: true } });

  } else if (message.action === "updateSensitivity") {
      notificationThresholdMs = message.time;
      console.log(`알림 기준 시간 변경됨: ${notificationThresholdMs/1000}초`);

  } else if (message.action === "stopMonitoring") {
    chrome.runtime.sendMessage({
      action: "frameStatsResponse",
      goodFrames: goodFrameCount,
      badFrames: badFrameCount
    });
    
    goodFrameCount = 0; badFrameCount = 0;
    if (detectionIntervalId) { clearInterval(detectionIntervalId); detectionIntervalId = null; }
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
  }
});

// -----------------------------------------------------------------------------
// 3. MediaPipe & Webcam 설정 (동일)
// -----------------------------------------------------------------------------
async function createPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks('./wasm');
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });
  await enableCam();
}

async function enableCam() {
  if (detectionIntervalId) { clearInterval(detectionIntervalId); detectionIntervalId = null; }
  video = document.getElementById("webcam"); 
  
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    video.srcObject = stream;
    video.addEventListener("playing", startLoop);
    video.play();
  } catch (err) { console.error("웹캠 오류:", err); }
}

function startLoop() {
  if (detectionIntervalId) { clearInterval(detectionIntervalId); }
  detectionIntervalId = setInterval(predictWebcam, DETECTION_INTERVAL_MS);
  setInterval(pushStats, 5000);
}

function pushStats() {
  if (goodFrameCount > 0 || badFrameCount > 0) {
    chrome.runtime.sendMessage({
      action: "updateFrameStats",
      goodFrames: goodFrameCount,
      badFrames: badFrameCount
    });
    goodFrameCount = 0; badFrameCount = 0;
  }
}

// -----------------------------------------------------------------------------
// 4. 데이터 전송 및 예측 루프 (동일)
// -----------------------------------------------------------------------------
function extractFeaturesAndSend(landmarks) {
  if (!isModelReady || !scalerParams || !sandboxFrame) return;

  const head = landmarks[0];
  const l_sho = landmarks[11];
  const r_sho = landmarks[12];
  
  const neck = { x: (l_sho.x + r_sho.x) / 2, y: (l_sho.y + r_sho.y) / 2 };
  const shoulder_width = Math.sqrt(Math.pow(r_sho.x - l_sho.x, 2) + Math.pow(r_sho.y - l_sho.y, 2)) + 1e-6;

  const features = [
    (head.x - neck.x) / shoulder_width, (head.y - neck.y) / shoulder_width,
    (neck.x - neck.x) / shoulder_width, (neck.y - neck.y) / shoulder_width,
    (r_sho.x - neck.x) / shoulder_width, (r_sho.y - neck.y) / shoulder_width,
    (l_sho.x - neck.x) / shoulder_width, (l_sho.y - neck.y) / shoulder_width,
    (head.y - neck.y) / shoulder_width,
    Math.atan2(head.y - neck.y, head.x - neck.x),
    Math.sqrt(Math.pow(head.x - neck.x, 2) + Math.pow(head.y - neck.y, 2)) / shoulder_width,
    Math.atan2(r_sho.y - l_sho.y, r_sho.x - l_sho.x)
  ];

  const scaledFeatures = features.map((val, i) => {
    const mean = scalerParams.mean[i] || 0;
    const scale = scalerParams.scale[i] || 1;
    return (val - mean) / scale;
  });

  sandboxFrame.contentWindow.postMessage({ type: 'PREDICT', features: scaledFeatures }, '*');
}

function predictWebcam() {
  try {
    if (video && !video.paused && poseLandmarker) {
      const startTimeMs = performance.now();
      const results = poseLandmarker.detectForVideo(video, startTimeMs);

      if (results.landmarks && results.landmarks.length > 0) {
        latestLandmarks = results.landmarks[0];
        
        if (isCalibrationMode) {
            const ear_r = latestLandmarks[7];
            const shoulder_r = latestLandmarks[11];
            const shoulder_l = latestLandmarks[12];
            let inZone = false;
            if (ear_r && shoulder_r && shoulder_l) {
                const x_diff = Math.abs(ear_r.x - shoulder_r.x);
                const y_diff = Math.abs(shoulder_r.y - shoulder_l.y);
                if (x_diff < CALIBRATION_X_THRESHOLD && y_diff < CALIBRATION_Y_THRESHOLD) {
                    inZone = true;
                }
            }
            chrome.runtime.sendMessage({ action: "calibrationStatus", status: inZone ? "in_zone" : "out_of_zone" });
            return;
        }
        extractFeaturesAndSend(latestLandmarks);
      }
    } else {
       if (!video || video.paused) {
         if (detectionIntervalId) clearInterval(detectionIntervalId);
         setTimeout(enableCam, 1000);
       }
    }
  } catch (error) {
    console.error("루프 에러:", error);
  }
}

init();