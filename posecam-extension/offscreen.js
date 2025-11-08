import { FilesetResolver, PoseLandmarker } from './lib/vision_bundle.js';

console.log("Offscreen script가 성공적으로 로드되었습니다.");

// --- 전역 변수 ---
let poseLandmarker = undefined;
let video;
const NOTIFICATION_THRESHOLD_MS = 3000;
let badPostureStartTime = null;
let notificationSent = false;
let latestLandmarks = null;
let baselinePosture = null;
let detectionIntervalId = null;
const DETECTION_INTERVAL_MS = 100;

// (추가) 민감도 맵 (1: 둔감, 2: 보통, 3: 민감)
const SENSITIVITY_MAP = {
  turtle: {
    1: 0.14, // 둔감 (약 8도)
    2: 0.07, // 보통 (약 4도)
    3: 0.035 // 민감 (약 2도)
  },
  tilt: {
    1: 0.05, // 둔감
    2: 0.03, // 보통
    3: 0.02  // 민감
  }
};

// (추가) 현재 민감도 변수 (기본값 '보통')
let currentTurtleThreshold = SENSITIVITY_MAP.turtle[2];
let currentTiltThreshold = SENSITIVITY_MAP.tilt[2];

// (추가) 민감도 설정 헬퍼 함수
function setSensitivity(level) {
  const sensitivityLevel = level || 2; // 기본값 2 (보통)
  
  currentTurtleThreshold = SENSITIVITY_MAP.turtle[sensitivityLevel];
  currentTiltThreshold = SENSITIVITY_MAP.tilt[sensitivityLevel];
  
  console.log(`민감도 ${sensitivityLevel}단계로 변경됨:`, {
    turtle: currentTurtleThreshold,
    tilt: currentTiltThreshold
  });
}

// -----------------------------------------------------------------------------
// 1. 캘리브레이션 및 메시지 리스너
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "calibrate") {
    console.log("Calibrate 메시지 수신 (from calibrate.js)");
    if (latestLandmarks) {
      const ear_r = latestLandmarks[7];
      const shoulder_r = latestLandmarks[11];
      const shoulder_l = latestLandmarks[12];
      
      if (ear_r && shoulder_r && shoulder_l) {
        const dx = ear_r.x - shoulder_r.x;
        const dy = ear_r.y - shoulder_r.y;
        const turtle_angle_rad = Math.atan2(dy, dx);
        
        const newBaseline = {
          turtle_angle_rad: turtle_angle_rad,
          tilt_diff_y: shoulder_r.y - shoulder_l.y
        };
        chrome.runtime.sendMessage({ action: "saveBaseline", data: newBaseline });
        baselinePosture = newBaseline;
        console.log("새로운 기준 자세(Angle)를 Service Worker에 저장 요청함:", newBaseline);
      } else {
        chrome.runtime.sendMessage({ action: "sendNotification", message: "자세를 감지할 수 없습니다. 카메라를 확인하고 다시 시도하세요." });
      }
    } else {
      chrome.runtime.sendMessage({ action: "sendNotification", message: "자세를 감지할 수 없습니다. 카메라를 확인하고 다시 시도하세요." });
    }
  } else if (message.action === "setBaseline") {
    console.log("Service Worker로부터 기준 자세 받음:", message.data);
    baselinePosture = message.data;
    
  } else if (message.action === "sensitivityChanged" || message.action === "setSensitivity") {
    // 3. (추가!) popup.js 또는 service-worker.js로부터 '민감도' 메시지 수신
    setSensitivity(message.sensitivity);
  }
});

// -----------------------------------------------------------------------------
// 2. MediaPipe 초기화 및 웹캠 설정
// -----------------------------------------------------------------------------
async function createPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks('./wasm');
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      // 👇👇👇 (핵심 수정!) 'https' -> 'https'로 오타 수정
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
      // 👆👆👆 (핵심 수정!)
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });
  console.log("Pose Landmarker 모델이 성공적으로 로드되었습니다.");
  await enableCam();
}

async function enableCam() {
  if (detectionIntervalId) { clearInterval(detectionIntervalId); detectionIntervalId = null; }
  video = document.getElementById("webcam"); 
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    video.srcObject = stream;
    video.removeEventListener("playing", startLoop);
    video.addEventListener("playing", startLoop);
    video.play();
    console.log("웹캠이 성공적으로 연결되었습니다.");
  } catch (err) { console.error("웹캠 접근 중 오류 발생:", err); }
}

function startLoop() {
  console.log("predictWebcam 루프 시작 (setInterval)");
  if (detectionIntervalId) { clearInterval(detectionIntervalId); }
  detectionIntervalId = setInterval(predictWebcam, DETECTION_INTERVAL_MS);
}

// -----------------------------------------------------------------------------
// 3. 실시간 자세 분석
// -----------------------------------------------------------------------------
function predictWebcam() {
  try {
    if (!video.paused) {
      const startTimeMs = performance.now();
      const results = poseLandmarker.detectForVideo(video, startTimeMs);

      if (results.landmarks && results.landmarks.length > 0) {
        latestLandmarks = results.landmarks[0];
        const landmarks = latestLandmarks;
        
        let isBadPosture = false;
        let badPostureReason = ""; 
        let logMessage = ""; 

        if (baselinePosture) {
          const ear_r = landmarks[7];
          const shoulder_r = landmarks[11];
          const shoulder_l = landmarks[12];

          // 1. 거북목 검사
          if (ear_r && shoulder_r && baselinePosture.hasOwnProperty('turtle_angle_rad')) {
            const dx = ear_r.x - shoulder_r.x;
            const dy = ear_r.y - shoulder_r.y;
            const current_angle_rad = Math.atan2(dy, dx);
            
            const isTurtleNeck = current_angle_rad > (baselinePosture.turtle_angle_rad + currentTurtleThreshold);
            
            logMessage += `[거북목(Angle)?: ${isTurtleNeck} (현재:${current_angle_rad.toFixed(2)}, 기준:${baselinePosture.turtle_angle_rad.toFixed(2)})] `;
            if (isTurtleNeck) {
              isBadPosture = true;
              badPostureReason = "거북목";
            }
          }
          
          // 2. 기울임 검사
          if (shoulder_r && shoulder_l && baselinePosture.hasOwnProperty('tilt_diff_y')) {
            const current_tilt_diff = shoulder_r.y - shoulder_l.y;
            const tilt_deviation = current_tilt_diff - baselinePosture.tilt_diff_y;
            
            const isTilted = Math.abs(tilt_deviation) > currentTiltThreshold;
            
            logMessage += `[기울임(Y)?: ${isTilted} (현재:${current_tilt_diff.toFixed(2)}, 기준:${baselinePosture.tilt_diff_y.toFixed(2)})]`;
            if (isTilted) {
              isBadPosture = true;
              badPostureReason = "기울어짐";
            }
          }
          
          console.log(logMessage || "랜드마크 감지 중... (기준 자세 있음)");

        } else {
          isBadPosture = false;
          if(Math.random() < 0.1) { console.log("기준 자세가 없습니다. 팝업에서 '자세 측정'을 눌러주세요."); }
        }

        // --- 알림 타이머 로직 ---
        if (isBadPosture) {
          if (badPostureStartTime === null) {
            badPostureStartTime = Date.now();
            console.log("나쁜 자세 감지 시작...");
          } else {
            const duration = Date.now() - badPostureStartTime;
            if (duration >= NOTIFICATION_THRESHOLD_MS && !notificationSent) {
              let message = "자세가 3초 이상 무너졌습니다!";
              if (badPostureReason === "거북목") message = "거북목이 의심됩니다! 턱을 당기고 어깨를 펴세요.";
              else if (badPostureReason === "기울어짐") message = "몸이 기울었습니다! 자세를 바로잡으세요.";
              console.log(`알림 전송: ${message}`);
              chrome.runtime.sendMessage({ action: "sendNotification", message: message, reason: badPostureReason || "기타" });
              notificationSent = true;
            }
          }
        } else {
          if (badPostureStartTime !== null) { console.log("자세 복귀. 타이머 리셋."); }
          badPostureStartTime = null;
          notificationSent = false;
        }
      } else {
        console.log("랜드마크를 감지하지 못했습니다. (results.landmarks is empty)");
      }
      
    } else {
      console.warn("비디오 스트림이 일시 중지(paused)되었습니다. 재시도를 시도합니다.");
      if (detectionIntervalId) { clearInterval(detectionIntervalId); detectionIntervalId = null; }
      setTimeout(enableCam, 1000);
    }
  } catch (error) {
    console.error("predictWebcam 루프 중 치명적 오류 발생:", error);
    if (detectionIntervalId) { clearInterval(detectionIntervalId); detectionIntervalId = null; }
    setTimeout(enableCam, 3000);
  }
}

// -----------------------------------------------------------------------------
// 5. 스크립트 시작 지점
// -----------------------------------------------------------------------------
createPoseLandmarker();