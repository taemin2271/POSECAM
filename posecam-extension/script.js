// --- 1. 전역 변수 및 요소 가져오기 ---
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const angleDisplay = document.getElementById('angle-display');
const calibrateButton = document.getElementById('calibrate-button');
const cameraSelect = document.getElementById('camera-select');

// MediaPipe API 객체
const { Pose, POSE_CONNECTIONS } = window;
const { drawConnectors, drawLandmarks } = window;

let pose = null; // AI 모델
let standardMetrics = null;
let currentMetrics = { neck: 0, head: 0, shoulder: 0, slump: 0 };
let warningTimer = null;
const WARNING_TIMEOUT = 3000;

// --- 2. MediaPipe Pose API 설정 및 로드 ---

async function createPoseModel() {
    angleDisplay.innerHTML = "<p>AI 모델 로드 중...</p>";
    try {
        pose = new Pose({locateFile: (file) => {
            let newFileName = file;
            if (file === 'pose_solution.wasm') {
                newFileName = 'pose_solution_wasm_bin.wasm';
            } else if (file === 'pose_solution_lite.wasm') {
                newFileName = 'pose_solution_wasm_bin.wasm';
            } else if (file.includes('pose_solution_simd')) {
                newFileName = 'pose_solution_simd_wasm_bin.wasm';
            }
            return chrome.runtime.getURL(`libs/${newFileName}`);
        }});
        
        pose.setOptions({
            modelComplexity: 2,
            smoothLandmarks: true, 
            minDetectionConfidence: 0.5, 
            minTrackingConfidence: 0.5
        });

        pose.onResults(onResults);
        
        console.log("Pose 모델 로드 완료!");
        getCameras();

    } catch(err) {
        console.error("AI 모델 로드 실패:", err);
        angleDisplay.innerHTML = `<p style="color: red;">AI 모델 로드에 실패했습니다.</p>`;
    }
}

// --- 3. 카메라 제어 ---

async function getCameras() {
    angleDisplay.innerHTML = "<p>카메라 권한 요청 중...</p>";
    try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${cameraSelect.length + 1}`;
            cameraSelect.appendChild(option);
        });

        cameraSelect.addEventListener('change', () => startCamera(cameraSelect.value));
        startCamera(videoDevices[0].deviceId);

    } catch (err) {
        console.error("카메라 접근 실패:", err);
        angleDisplay.innerHTML = `<p style="color: red;">카메라 접근에 실패했습니다. 권한을 확인하세요.</p>`;
    }
}

async function startCamera(deviceId) {
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: { deviceId: { exact: deviceId }, width: 640, height: 480 }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        videoElement.addEventListener("play", () => {
            console.log("비디오 재생 시작, 분석 루프를 시작합니다.");
            predictWebcam();
        });

    } catch (err) {
        console.error("카메라 시작 실패:", err);
    }
}

// --- 4. 실시간 자세 분석 및 그리기 ---

async function predictWebcam() {
    if (!videoElement.srcObject || videoElement.paused || videoElement.ended) {
        console.log("비디오 중지됨, 분석 루프 종료.");
        return;
    }

    try {
        // --- [핵심 버그 수정!!!] ---
        // "await"를 "제거"해야 AI가 멈추지 않고,
        // onResults 콜백이 정상적으로 계속 호출됩니다.
        pose.send({image: videoElement}); 
        // -----------------------
    } catch(err) {
        console.error("AI 분석 실패:", err);
    }

    window.requestAnimationFrame(predictWebcam);
}

/**
 * MediaPipe 결과가 오면 이 함수가 "자동으로" 호출됨
 */
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    let isBadPosture = false;

    if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;
        
        canvasCtx.scale(-1, 1);
        canvasCtx.translate(-canvasElement.width, 0);
        
        drawLandmarks(canvasCtx, landmarks, {color: '#E91E63', lineWidth: 2});
        drawConnectors(canvasCtx, landmarks, POSE_CONNECTIONS, {color: '#4CAF50', lineWidth: 4});
        
        canvasCtx.restore();
        
        const lm = landmarks;
        currentMetrics.neck = calculate3PointAngle(lm[7], lm[11], lm[23]);
        currentMetrics.head = calculateHorizontalAngle(lm[7], lm[8]);
        currentMetrics.shoulder = calculateHorizontalAngle(lm[11], lm[12]);
        const leftSlump = lm[11].z - lm[7].z;
        const rightSlump = lm[12].z - lm[8].z;
        currentMetrics.slump = ((leftSlump + rightSlump) / 2) * -100;
        
        handlePostureCheck();

    } else {
        canvasCtx.restore();
        // 뼈대가 감지 안 돼도 "좋음" 또는 "기준 측정"으로 UI 업데이트
        updateDisplay(standardMetrics ? '좋음' : '기준 자세를 측정해주세요.');
    }
}

// --- 5. 로직 및 헬퍼 함수 (이하 동일) ---

function handlePostureCheck() {
    let isBadPosture = false;
    if (standardMetrics) {
        const neckDeviation = currentMetrics.neck < standardMetrics.neck - 10;
        const headDeviation = Math.abs(currentMetrics.head - standardMetrics.head) > 7;
        const shoulderDeviation = Math.abs(currentMetrics.shoulder - standardMetrics.shoulder) > 4;
        const slumpDeviation = currentMetrics.slump > standardMetrics.slump + 8;
        isBadPosture = neckDeviation || headDeviation || shoulderDeviation || slumpDeviation;
    }

    if (isBadPosture) {
        if (!warningTimer) {
            warningTimer = setTimeout(() => {
                angleDisplay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
                updateDisplay('주의!');
            }, WARNING_TIMEOUT);
        }
    } else {
        if (warningTimer) {
            clearTimeout(warningTimer);
            warningTimer = null;
        }
        angleDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        updateDisplay(standardMetrics ? '좋음' : '기준 자세를 측정해주세요.');
    }
}

function updateDisplay(status) {
    // [UI 버그 수정]
    // AI가 첫 결과를 반환하면 (neck > 0) 이 HTML로 바뀜.
    if (currentMetrics.neck > 0) {
        angleDisplay.innerHTML = `
            <p><span class="label">목 각도:</span> <span class="value">${currentMetrics.neck.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.neck.toFixed(1) : 'N/A'})</p>
            <p><span class="label">머리 기울기:</span> <span class="value">${currentMetrics.head.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.head.toFixed(1) : 'N/A'})</p>
            <p><span class="label">어깨 기울기:</span> <span class="value">${currentMetrics.shoulder.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.shoulder.toFixed(1) : 'N/A'})</p>
            <p><span class="label">어깨 말림:</span> <span class="value">${currentMetrics.slump.toFixed(1)}</span> (기준: ${standardMetrics ? standardMetrics.slump.toFixed(1) : 'N/A'})</p>
            <hr>
            <p><span class="label">상태:</span> <span class="value">${status}</span></p>
        `;
    } else {
        // AI가 아직 첫 결과를 반환하기 전
        angleDisplay.innerHTML = "<p>자세를 인식하는 중...</p>";
    }
}

calibrateButton.addEventListener('click', () => {
    if (currentMetrics.neck > 0) {
        standardMetrics = { ...currentMetrics };
        console.log("기준 자세 저장됨:", standardMetrics);
        alert(`기준 자세가 저장되었습니다!`);
    } else {
        alert("아직 자세가 인식되지 않았습니다.");
    }
});

function calculate3PointAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) { angle = 360 - angle; }
    return angle;
}
function calculateHorizontalAngle(p1, p2) {
    const radians = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    return radians * 180.0 / Math.PI;
}

// --- 0. 모든 것의 시작점 ---
createPoseModel();