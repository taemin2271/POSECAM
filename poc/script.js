// HTML 요소 가져오기
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const angleDisplay = document.getElementById('angle-display');
const calibrateButton = document.getElementById('calibrate-button');

// 상태 변수
let standardMetrics = null;
let currentMetrics = { neck: 0, head: 0, shoulder: 0, slump: 0 };

// --- 시간 기반 알림을 위한 변수 추가 ---
let warningTimer = null; // setTimeout 타이머를 저장할 변수
const WARNING_TIMEOUT = 3000; // 3초 (3000ms) 동안 나쁜 자세가 유지되면 경고

// 계산 함수들 (이전과 동일)
function calculate3PointAngle(a, b, c) { /* ... 이전과 동일 ... */ }
function calculateHorizontalAngle(p1, p2) { /* ... 이전과
... */ }

// 캘리브레이션 버튼 클릭 시
calibrateButton.addEventListener('click', () => {
    if (currentMetrics.neck > 0) {
        standardMetrics = { ...currentMetrics };
        console.log("기준 자세 저장됨:", standardMetrics);
        alert(`기준 자세가 저장되었습니다!`);
    } else {
        alert("아직 자세가 인식되지 않았습니다. 카메라를 정면으로 봐주세요.");
    }
});

// MediaPipe 결과 처리 함수
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    let isBadPosture = false; // 현재 프레임의 자세가 나쁜지 여부를 저장

    if (results.poseLandmarks) {
        // 뼈대 그리기
        canvasCtx.scale(-1, 1);
        canvasCtx.translate(-canvasElement.width, 0);
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#4CAF50', lineWidth: 4});
        drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#E91E63', lineWidth: 2});
        canvasCtx.restore();

        // 랜드마크 좌표 가져오기
        const lm = results.poseLandmarks;
        
        // 지표 계산
        currentMetrics.neck = calculate3PointAngle(lm[7], lm[11], lm[23]);
        currentMetrics.head = calculateHorizontalAngle(lm[7], lm[8]);
        currentMetrics.shoulder = calculateHorizontalAngle(lm[11], lm[12]);
        const leftSlump = lm[11].z - lm[7].z;
        const rightSlump = lm[12].z - lm[8].z;
        currentMetrics.slump = ((leftSlump + rightSlump) / 2) * -100;
        
        // 기준 자세와 비교하여 상태 결정
        if (standardMetrics) {
            // 각 지표가 '경고 영역'에 있는지 확인
            const neckDeviation = currentMetrics.neck < standardMetrics.neck - 10; // 임계값을 조금 완화
            const headDeviation = Math.abs(currentMetrics.head - standardMetrics.head) > 7;
            const shoulderDeviation = Math.abs(currentMetrics.shoulder - standardMetrics.shoulder) > 4;
            const slumpDeviation = currentMetrics.slump > standardMetrics.slump + 8;
            
            isBadPosture = neckDeviation || headDeviation || shoulderDeviation || slumpDeviation;
        }
    } else {
        canvasCtx.restore();
    }
    
    // --- 시간 기반 알림 로직 ---
    if (isBadPosture) {
        // 나쁜 자세가 감지되었고, 타이머가 아직 없다면
        if (!warningTimer) {
            // 타이머를 설정합니다.
            warningTimer = setTimeout(() => {
                angleDisplay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)'; // 빨간색 배경
                updateDisplay('주의!'); // 3초 후 상태를 '주의!'로 변경
            }, WARNING_TIMEOUT);
        }
    } else {
        // 좋은 자세라면
        // 만약 이전에 설정된 타이머가 있다면 취소합니다.
        if (warningTimer) {
            clearTimeout(warningTimer);
            warningTimer = null;
        }
        angleDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'; // 기본 배경
        updateDisplay(standardMetrics ? '좋음' : '기준 자세를 측정해주세요.');
    }
}

// 화면 표시를 위한 별도 함수
function updateDisplay(status) {
    angleDisplay.innerHTML = `
        <p><span class="label">목 각도:</span> <span class="value">${currentMetrics.neck.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.neck.toFixed(1) : 'N/A'})</p>
        <p><span class="label">머리 기울기:</span> <span class="value">${currentMetrics.head.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.head.toFixed(1) : 'N/A'})</p>
        <p><span class="label">어깨 기울기:</span> <span class="value">${currentMetrics.shoulder.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.shoulder.toFixed(1) : 'N/A'})</p>
        <p><span class="label">어깨 말림:</span> <span class="value">${currentMetrics.slump.toFixed(1)}</span> (기준: ${standardMetrics ? standardMetrics.slump.toFixed(1) : 'N/A'})</p>
        <hr>
        <p><span class="label">상태:</span> <span class="value">${status}</span></p>
    `;
}


// 나머지 코드는 이전과 동일합니다.
const pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});
pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
pose.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await pose.send({image: videoElement}); }, width: 640, height: 480 });
camera.start();

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