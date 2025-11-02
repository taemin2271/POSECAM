// HTML 요소 가져오기
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const angleDisplay = document.getElementById('angle-display');
const calibrateButton = document.getElementById('calibrate-button');
const cameraSelect = document.getElementById('camera-select'); // 새로 추가

// 상태 변수
let standardMetrics = null;
let currentMetrics = { neck: 0, head: 0, shoulder: 0, slump: 0 };
let warningTimer = null;
const WARNING_TIMEOUT = 3000;

// MediaPipe Pose 설정 (수정됨)
const pose = new Pose({locateFile: (file) => {
    // (중요!) libs 폴더에서 모델 파일을 찾도록 수정
    return `./libs/${file}`;
}});

pose.setOptions({ 
    modelComplexity: 1, 
    smoothLandmarks: true, 
    minDetectionConfidence: 0.5, 
    minTrackingConfidence: 0.5 
});
pose.onResults(onResults);


// --- 카메라 및 MediaPipe 실행 로직 (대폭 수정) ---

/**
 * 3. MediaPipe 루프 실행
 * 비디오가 재생되면, requestAnimationFrame을 사용해
 * 지속적으로 비디오 프레임을 MediaPipe로 보냅니다.
 */
function startMediaPipeLoop() {
    const loop = async () => {
        await pose.send({image: videoElement});
        requestAnimationFrame(loop); // 다음 프레임에 다시 실행
    };
    loop();
}

/**
 * 2. 특정 카메라 시작
 * 사용자가 선택한 deviceId를 받아 카메라 스트림을 시작합니다.
 */
async function startCamera(deviceId) {
    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: 640,
            height: 480
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        // 비디오가 실제로 재생되기 시작하면 MediaPipe 루프를 시작
        videoElement.onloadedmetadata = () => {
            startMediaPipeLoop();
        };
    } catch (err) {
        console.error("Error starting camera:", err);
        alert("카메라를 시작할 수 없습니다. 권한을 확인해주세요.");
    }
}

/**
 * 1. 사용 가능한 모든 카메라 목록 가져오기
 * 페이지가 로드될 때 이 함수가 실행됩니다.
 */
async function getCameras() {
    try {
        // (중요) 장치 목록을 제대로 받으려면 먼저 권한을 요청해야 합니다.
        await navigator.mediaDevices.getUserMedia({ video: true });
        
        // 모든 미디어 장치 목록 가져오기
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        // 드롭다운 메뉴(select)에 카메라 목록 채우기
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${cameraSelect.length + 1}`; // 이름이 없으면 "Camera 1" 등으로 표시
            cameraSelect.appendChild(option);
        });

        // 드롭다운 메뉴에서 다른 카메라를 선택했을 때의 이벤트 처리
        cameraSelect.addEventListener('change', () => {
            startCamera(cameraSelect.value);
        });

        // 목록의 첫 번째 카메라로 자동 시작
        if (videoDevices.length > 0) {
            startCamera(videoDevices[0].deviceId);
        } else {
            alert("카메라를 찾을 수 없습니다.");
        }

    } catch (err) {
        console.error("Error getting camera list:", err);
        
        // --- [수정된 부분] ---
        // "카메라 접근 권한이 필요합니다." 대신, 실제 오류 메시지를 보여줍니다.
        alert(`카메라 목록을 가져오는 데 실패했습니다: ${err.name} - ${err.message}`);
        // -----------------------
    }
}

// --- 프로그램 시작 ---
getCameras();


// --- 나머지 로직 (이전과 동일) ---

// MediaPipe 결과 처리 함수
function onResults(results) {
    // ... (이전 코드와 동일: 뼈대 그리고, 지표 계산하고, 상태 판단하는 부분) ...
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    let isBadPosture = false;

    if (results.poseLandmarks) {
        canvasCtx.scale(-1, 1);
        canvasCtx.translate(-canvasElement.width, 0);
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#4CAF50', lineWidth: 4});
        drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#E91E63', lineWidth: 2});
        canvasCtx.restore();

        const lm = results.poseLandmarks;
        
        currentMetrics.neck = calculate3PointAngle(lm[7], lm[11], lm[23]);
        currentMetrics.head = calculateHorizontalAngle(lm[7], lm[8]);
        currentMetrics.shoulder = calculateHorizontalAngle(lm[11], lm[12]);
        const leftSlump = lm[11].z - lm[7].z;
        const rightSlump = lm[12].z - lm[8].z;
        currentMetrics.slump = ((leftSlump + rightSlump) / 2) * -100;
        
        if (standardMetrics) {
            const neckDeviation = currentMetrics.neck < standardMetrics.neck - 10;
            const headDeviation = Math.abs(currentMetrics.head - standardMetrics.head) > 7;
            const shoulderDeviation = Math.abs(currentMetrics.shoulder - standardMetrics.shoulder) > 4;
            const slumpDeviation = currentMetrics.slump > standardMetrics.slump + 8;
            
            isBadPosture = neckDeviation || headDeviation || shoulderDeviation || slumpDeviation;
        }
    } else {
        canvasCtx.restore();
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

// 화면 표시 함수
function updateDisplay(status) {
    // ... (이전 코드와 동일) ...
    angleDisplay.innerHTML = `
        <p><span class="label">목 각도:</span> <span class="value">${currentMetrics.neck.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.neck.toFixed(1) : 'N/A'})</p>
        <p><span class="label">머리 기울기:</span> <span class="value">${currentMetrics.head.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.head.toFixed(1) : 'N/A'})</p>
        <p><span class="label">어깨 기울기:</span> <span class="value">${currentMetrics.shoulder.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.shoulder.toFixed(1) : 'N/A'})</p>
        <p><span class="label">어깨 말림:</span> <span class="value">${currentMetrics.slump.toFixed(1)}</span> (기준: ${standardMetrics ? standardMetrics.slump.toFixed(1) : 'N/A'})</p>
        <hr>
        <p><span class="label">상태:</span> <span class="value">${status}</span></p>
    `;
}

// 캘리브레이션 버튼 리스너
calibrateButton.addEventListener('click', () => {
    // ... (이전 코드와 동일) ...
    if (currentMetrics.neck > 0) {
        standardMetrics = { ...currentMetrics };
        console.log("기준 자세 저장됨:", standardMetrics);
        alert(`기준 자세가 저장되었습니다!`);
    } else {
        alert("아직 자세가 인식되지 않았습니다. 카메라를 정면으로 봐주세요.");
    }
});

// 계산 함수
function calculate3PointAngle(a, b, c) {
    // ... (이전 코드와 동일) ...
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) { angle = 360 - angle; }
    return angle;
}
function calculateHorizontalAngle(p1, p2) {
    // ... (이전 코드와 동일) ...
    const radians = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    return radians * 180.0 / Math.PI;
}