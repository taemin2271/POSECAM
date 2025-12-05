import { FilesetResolver, PoseLandmarker } from './lib/vision_bundle.js';

console.log("Offscreen script가 성공적으로 로드되었습니다.");

// --- 전역 변수 ---
let poseLandmarker = undefined;
let scalerParams = undefined; 
let video;
const NOTIFICATION_THRESHOLD_MS = 10000; // 10초
let badPostureStartTime = null;
let notificationSent = false; // 반복 알림을 위해 리셋됨
let latestLandmarks = null;
let baselinePosture = null; 
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
let isModelReady = false; // 모델 로드 상태 (샌드박스에서 알려줌)

// -----------------------------------------------------------------------------
// 0. 초기화: 스케일러 로드 & 샌드박스 연결
// -----------------------------------------------------------------------------
async function init() {
  // 1. 스케일러 파라미터 로드
  try {
    const response = await fetch('tfjs_model/scaler_params.json');
    scalerParams = await response.json();
    console.log("✅ 스케일러 로드 완료");
  } catch (e) {
    console.error("❌ 스케일러 로드 실패:", e);
  }

  // 2. 샌드박스 iframe 찾기 및 통신 설정
  sandboxFrame = document.getElementById('ai-sandbox');
  
  window.addEventListener('message', (event) => {
    // 샌드박스가 "모델 로드 다 됐어요!"라고 신호를 보내면
    if (event.data.type === 'MODEL_LOADED') {
      console.log("✅ 딥러닝 모델 준비됨 (Sandbox)");
      isModelReady = true;
    } 
    // 샌드박스가 "예측 결과(확률)"를 보내면
    else if (event.data.type === 'PREDICT_RESULT') {
      handlePredictionResult(event.data.probability);
    }
  });

  // 3. MediaPipe 시작
  createPoseLandmarker();
}

// -----------------------------------------------------------------------------
// 1. 예측 결과 처리 (10초 반복 알림 로직)
// -----------------------------------------------------------------------------
function handlePredictionResult(probability) {
  // 0.5 (50%) 이상이면 거북목
  const isBadPosture = probability > 0.5;

  if (isBadPosture) {
    console.log(`🐢 거북목 감지! (확률: ${(probability*100).toFixed(1)}%)`);
    badFrameCount++;
    
    if (badPostureStartTime === null) {
      badPostureStartTime = Date.now();
    } else if (Date.now() - badPostureStartTime >= NOTIFICATION_THRESHOLD_MS) {
      chrome.runtime.sendMessage({ 
        action: "sendNotification", 
        message: "거북목이 감지되었습니다! (AI 분석)", 
        reason: "거북목" 
      });
      
      console.log("알림 전송 완료. 타이머 리셋.");
      badPostureStartTime = Date.now();
    }
  } else {
    // 👇 [수정됨] 거북목 확률을 뒤집어서 '바른 자세 점수'로 변환합니다.
    // 예: 거북목 확률이 0.2(20%)라면 -> (1 - 0.2) = 0.8(80%)로 출력
    const goodPostureScore = (1 - probability) * 100;
    
    console.log(`✅ 바른 자세 (확률: ${goodPostureScore.toFixed(1)}%)`); 
    
    goodFrameCount++;
    badPostureStartTime = null;
    notificationSent = false;
  }
}

// -----------------------------------------------------------------------------
// 2. 메시지 리스너 (Service Worker 및 Popup 통신)
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "calibrationStarted") {
    console.log("Offscreen: 캘리브레이션 모드 시작.");
    isCalibrationMode = true;
    
  } else if (message.action === "calibrationStopped") {
    console.log("Offscreen: 캘리브레이션 모드 종료 (취소).");
    isCalibrationMode = false;
    
  } else if (message.action === "calibrate") {
    console.log("Offscreen: Calibrate 메시지 수신");
    isCalibrationMode = false;
    chrome.runtime.sendMessage({ action: "saveBaseline", data: { calibrated: true } });
    
  } else if (message.action === "stopMonitoring") {
    console.log("Offscreen: 중지 요청 받음.");
    
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
  } else if (message.action === "updateFrameStats") {
     // 주기적 통계 업데이트 요청 시
  }
});

// -----------------------------------------------------------------------------
// 3. MediaPipe & Webcam 설정
// -----------------------------------------------------------------------------
async function createPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks('./wasm'); // 로컬 WASM 사용
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });
  console.log("Pose Landmarker 모델 로드됨");
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
    console.log("웹캠 연결됨");
  } catch (err) { console.error("웹캠 오류:", err); }
}

function startLoop() {
  console.log("루프 시작");
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
// 4. 실시간 분석 (특징 추출 -> 샌드박스 전송)
// -----------------------------------------------------------------------------
function extractFeaturesAndSend(landmarks) {
  // 모델이 준비되지 않았거나 스케일러가 없으면 중단
  if (!isModelReady || !scalerParams || !sandboxFrame) return;

  // 1. 좌표 추출 (MediaPipe: 0:Nose, 11:L_Sho, 12:R_Sho)
  const head = landmarks[0];
  const l_sho = landmarks[11];
  const r_sho = landmarks[12];
  
  // 가상의 목(Neck) = 어깨 중점
  const neck = {
    x: (l_sho.x + r_sho.x) / 2,
    y: (l_sho.y + r_sho.y) / 2
  };

  // 2. 파생 변수 계산
  const shoulder_width = Math.sqrt(Math.pow(r_sho.x - l_sho.x, 2) + Math.pow(r_sho.y - l_sho.y, 2)) + 1e-6;

  // 👇 12개 변수 구성 (Python 학습 코드와 순서 일치)
  // [Raw 8개 (Normalized)] + [파생 4개]
  const features = [
    // (1) 원본 좌표 8개: (내좌표 - 목좌표) / 어깨너비
    (head.x - neck.x) / shoulder_width, (head.y - neck.y) / shoulder_width,
    (neck.x - neck.x) / shoulder_width, (neck.y - neck.y) / shoulder_width,
    (r_sho.x - neck.x) / shoulder_width, (r_sho.y - neck.y) / shoulder_width,
    (l_sho.x - neck.x) / shoulder_width, (l_sho.y - neck.y) / shoulder_width,
    
    // (2) 파생 변수 4개
    (head.y - neck.y) / shoulder_width,                                            // Feat_Y_Diff
    Math.atan2(head.y - neck.y, head.x - neck.x),                                  // Feat_Angle
    Math.sqrt(Math.pow(head.x - neck.x, 2) + Math.pow(head.y - neck.y, 2)) / shoulder_width, // Feat_Dist
    Math.atan2(r_sho.y - l_sho.y, r_sho.x - l_sho.x)                               // Feat_Sho_Angle
  ];

  // 3. 스케일링 (StandardScaler)
  const scaledFeatures = features.map((val, i) => {
    const mean = scalerParams.mean[i] || 0;
    const scale = scalerParams.scale[i] || 1;
    return (val - mean) / scale;
  });

  // 4. 샌드박스에 예측 요청 (데이터 전송)
  sandboxFrame.contentWindow.postMessage({ type: 'PREDICT', features: scaledFeatures }, '*');
}

function predictWebcam() {
  try {
    if (video && !video.paused && poseLandmarker) {
      const startTimeMs = performance.now();
      const results = poseLandmarker.detectForVideo(video, startTimeMs);

      if (results.landmarks && results.landmarks.length > 0) {
        latestLandmarks = results.landmarks[0];
        
        // 캘리브레이션 모드일 때
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

        // 일반 모드: 샌드박스로 데이터 전송
        extractFeaturesAndSend(latestLandmarks);
      }
    } else {
       // 카메라 재시작 로직
       if (!video || video.paused) {
         console.warn("비디오 멈춤. 재시작 시도.");
         if (detectionIntervalId) clearInterval(detectionIntervalId);
         setTimeout(enableCam, 1000);
       }
    }
  } catch (error) {
    console.error("루프 에러:", error);
  }
}

// 시작!
init();