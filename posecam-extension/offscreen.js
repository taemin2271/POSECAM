import { FilesetResolver, PoseLandmarker } from './lib/vision_bundle.js';

console.log("Offscreen script가 성공적으로 로드되었습니다.");

// --- 전역 변수 ---
let poseLandmarker = undefined;
let video;
// (삭제) let lastVideoTime = -1;
const NOTIFICATION_THRESHOLD_MS = 3000;
let badPostureStartTime = null;
let notificationSent = false;
let latestLandmarks = null;
let baselinePosture = null;
const THRESHOLD_TURTLE = 0.03;
const THRESHOLD_TILT = 0.03;

// (수정) 1. 루프 제어 변수를 'Interval ID'로 변경
let detectionIntervalId = null;
const DETECTION_INTERVAL_MS = 100; // 100ms (1초에 10번)

// (삭제) 2. 스트림 멈춤 감지용 변수 제거
// let lastTimeCheck = Date.now();
// const STREAM_TIMEOUT_MS = 2000;

// -----------------------------------------------------------------------------
// 1. 캘리브레이션 및 메시지 리스너 (이전과 동일)
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "calibrate") {
    console.log("Calibrate 메시지 수신 (from calibrate.js)");
    if (latestLandmarks) {
      const ear_r = latestLandmarks[7];
      const shoulder_r = latestLandmarks[11];
      const shoulder_l = latestLandmarks[12];
      if (ear_r && shoulder_r && shoulder_l) {
        const newBaseline = {
          turtle_diff_x: ear_r.x - shoulder_r.x,
          tilt_diff_y: shoulder_r.y - shoulder_l.y
        };
        chrome.runtime.sendMessage({ action: "saveBaseline", data: newBaseline });
        baselinePosture = newBaseline;
        console.log("새로운 기준 자세를 Service Worker에 저장 요청함:", newBaseline);
      } else {
        chrome.runtime.sendMessage({ action: "sendNotification", message: "자세를 감지할 수 없습니다. 카메라를 확인하고 다시 시도하세요." });
      }
    } else {
      chrome.runtime.sendMessage({ action: "sendNotification", message: "자세를 감지할 수 없습니다. 카메라를 확인하고 다시 시도하세요." });
    }
  } else if (message.action === "setBaseline") {
    console.log("Service Worker로부터 기준 자세 받음:", message.data);
    baselinePosture = message.data;
  }
});

// -----------------------------------------------------------------------------
// 2. MediaPipe 초기화 및 웹캠 설정 (이전과 동일)
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
  console.log("Pose Landmarker 모델이 성공적으로 로드되었습니다.");
  await enableCam();
}

async function enableCam() {
  // (수정) 기존 'Interval' 루프가 있다면 중지
  if (detectionIntervalId) {
    clearInterval(detectionIntervalId);
    detectionIntervalId = null;
  }
  
  video = document.getElementById("webcam"); 
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    video.srcObject = stream;
    video.removeEventListener("playing", startLoop); // 중복 방지
    video.addEventListener("playing", startLoop);
    video.play();
    console.log("웹캠이 성공적으로 연결되었습니다.");
  } catch (err) { console.error("웹캠 접근 중 오류 발생:", err); }
}

// (수정) 3. 루프 시작 함수 (setInterval 사용)
function startLoop() {
  console.log("predictWebcam 루프 시작 (setInterval)");
  
  // (수정) 기존 루프가 있다면 중지 (캘리브레이션 후 재시작 대비)
  if (detectionIntervalId) {
    clearInterval(detectionIntervalId);
  }
  
  detectionIntervalId = setInterval(predictWebcam, DETECTION_INTERVAL_MS);
}

// -----------------------------------------------------------------------------
// 4. 실시간 자세 분석 (🚨 async 및 requestAnimationFrame 제거됨)
// -----------------------------------------------------------------------------
function predictWebcam() { // (수정) async 제거
  try {
    // (수정) video.currentTime을 사용하지 않고, 비디오가 재생 중인지(paused)만 확인
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
          // --- 기준 자세가 있을 때 ---
          const ear_r = landmarks[7];
          const shoulder_r = landmarks[11];
          const shoulder_l = landmarks[12];

          // 1. 거북목 검사
          if (ear_r && shoulder_r && baselinePosture.hasOwnProperty('turtle_diff_x')) {
            const current_turtle_diff = ear_r.x - shoulder_r.x;
            const isTurtleNeck = current_turtle_diff < (baselinePosture.turtle_diff_x - THRESHOLD_TURTLE);
            logMessage += `[거북목?: ${isTurtleNeck} (현재:${current_turtle_diff.toFixed(2)}, 기준:${baselinePosture.turtle_diff_x.toFixed(2)})] `;
            if (isTurtleNeck) {
              isBadPosture = true;
              badPostureReason = "거북목";
            }
          }
          
          // 2. 기울임 검사
          if (shoulder_r && shoulder_l && baselinePosture.hasOwnProperty('tilt_diff_y')) {
            const current_tilt_diff = shoulder_r.y - shoulder_l.y;
            const tilt_deviation = current_tilt_diff - baselinePosture.tilt_diff_y;
            const isTilted = Math.abs(tilt_deviation) > THRESHOLD_TILT;
            logMessage += `[기울임?: ${isTilted} (현재:${current_tilt_diff.toFixed(2)}, 기준:${baselinePosture.tilt_diff_y.toFixed(2)})]`;
            if (isTilted) {
              isBadPosture = true;
              badPostureReason = "기울어짐";
            }
          }
          
          console.log(logMessage || "랜드마크 감지 중... (기준 자세 있음)");

        } else {
          // --- 기준 자세가 없을 때 ---
          isBadPosture = false;
          if (badPostureStartTime === null) {
            if(Math.random() < 0.1) { // (로그 빈도 증가)
              console.log("기준 자세가 없습니다. 팝업에서 '자세 측정'을 눌러주세요.");
            }
          }
        }

        // --- 알림 타이머 로직 ---
        if (isBadPosture) {
          if (badPostureStartTime === null) {
            badPostureStartTime = Date.now();
            console.log("나쁜 자세 감지 시작...");
          } else {
            const duration = Date.now() - badPostureStartTime;
            if (duration >= NOTIFICATION_THRESHOLD_MS && !notificationSent) {
              // ... (알림 메시지 전송 로직 동일) ...
              let message = "자세가 3초 이상 무너졌습니다!";
              if (badPostureReason === "거북목") message = "거북목이 의심됩니다! 턱을 당기고 어깨를 펴세요.";
              else if (badPostureReason === "기울어짐") message = "몸이 기울었습니다! 자세를 바로잡으세요.";
              console.log(`알림 전송: ${message}`);
              chrome.runtime.sendMessage({ action: "sendNotification", message: message });
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
      // --- (수정) 스트림 멈춤(video.paused) 감지 ---
      console.warn("비디오 스트림이 일시 중지(paused)되었습니다. 재시도를 시도합니다.");
      
      // 캘리브레이션 탭이 닫히면서 스트림이 죽는 경우가 있음
      // 1초 후 웹캠 재시작 시도
      if (detectionIntervalId) {
        clearInterval(detectionIntervalId);
        detectionIntervalId = null;
      }
      setTimeout(enableCam, 1000);
    }
  } catch (error) {
    // --- 치명적 오류 감지 ---
    console.error("predictWebcam 루프 중 치명적 오류 발생:", error);
    if (detectionIntervalId) {
      clearInterval(detectionIntervalId);
      detectionIntervalId = null;
    }
    setTimeout(enableCam, 3000); // 3초 후 재시작
  }
  
  // (삭제) 5. requestAnimationFrame 제거!
  // animationFrameId = window.requestAnimationFrame(predictWebcam);
}

// -----------------------------------------------------------------------------
// 5. 스크립트 시작 지점
// -----------------------------------------------------------------------------
createPoseLandmarker();