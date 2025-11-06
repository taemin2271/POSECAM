import { FilesetResolver, PoseLandmarker } from './lib/vision_bundle.js';

console.log("Offscreen script가 성공적으로 로드되었습니다.");

// MediaPipe Vision 관련 전역 변수 선언
let poseLandmarker = undefined;
let video;
let lastVideoTime = -1;

// 👇 (추가) 알림 지연 로직을 위한 변수
const NOTIFICATION_THRESHOLD_MS = 3000; // 3초
let badPostureStartTime = null; // 나쁜 자세가 시작된 시간
let notificationSent = false;     // 알림을 이미 보냈는지 여부

// 1. MediaPipe Pose Landmarker 모델 초기화 함수
async function createPoseLandmarker() {
  
  const vision = await FilesetResolver.forVisionTasks(
    './wasm'
  );
  
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

// 2. 웹캠 활성화 함수
async function enableCam() {
  // ... (이전 코드와 동일) ...
  if (!poseLandmarker) {
    console.log("모델이 아직 로드되지 않았습니다. 웹캠을 켤 수 없습니다.");
    return;
  }
  video = document.getElementById("webcam"); 
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false
    });
    video.srcObject = stream;
    video.addEventListener("playing", predictWebcam);
    video.play();
    console.log("웹캠이 성공적으로 연결되었습니다.");
  } catch (err) {
    console.error("웹캠 접근 중 오류 발생:", err);
  }
}

// 3. 실시간 자세 분석 함수 (👇 로직 수정됨)
async function predictWebcam() {
  const videoTime = video.currentTime;
  
  if (videoTime !== lastVideoTime) {
    lastVideoTime = videoTime;
    
    const startTimeMs = performance.now();
    const results = poseLandmarker.detectForVideo(video, startTimeMs);

    // 4. 분석 결과(results) 처리
    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      const ear = landmarks[7];
      const shoulder = landmarks[11]; 
      
      const isBadPosture = ear.x < shoulder.x - 0.05; // (임계값 조정 필요)

      if (isBadPosture) {
        // --- 나쁜 자세일 때 ---
        if (badPostureStartTime === null) {
          // 1. 나쁜 자세가 '방금' 시작됨
          badPostureStartTime = Date.now();
          console.log("나쁜 자세 감지 시작...");
        } else {
          // 2. 나쁜 자세가 '지속' 중
          const duration = Date.now() - badPostureStartTime;
          
          if (duration >= NOTIFICATION_THRESHOLD_MS && !notificationSent) {
            // 3. 3초 이상 지속되었고, 아직 알림을 안 보냈다면
            console.log(`자세 경고: ${NOTIFICATION_THRESHOLD_MS / 1000}초 이상 지속!`);
            chrome.runtime.sendMessage({ 
              action: "sendNotification", 
              message: "자세가 3초 이상 무너졌습니다! 허리를 펴주세요." 
            });
            notificationSent = true; // 알림 보냈음! (더 이상 보내지 않음)
          }
        }
      } else {
        // --- 좋은 자세일 때 ---
        if (badPostureStartTime !== null) {
          // 1. 나쁜 자세가 '방금' 끝남
          console.log("자세 복귀. 타이머 리셋.");
        }
        // 2. 타이머와 알림 상태를 리셋
        badPostureStartTime = null;
        notificationSent = false;
      }
    }
  }
  window.requestAnimationFrame(predictWebcam);
}

// --- 스크립트 시작 ---
createPoseLandmarker();