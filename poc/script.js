// HTML 요소 가져오기
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const angleDisplay = document.getElementById('angle-display');
const calibrateButton = document.getElementById('calibrate-button');

// 상태 변수: 'slump' 지표 추가
let standardMetrics = null;
let currentMetrics = { neck: 0, head: 0, shoulder: 0, slump: 0 };

// 3점 사이의 각도 계산 함수
function calculate3PointAngle(a, b, c) { /* ... 이전과 동일 ... */ }
// 2점 사이의 수평 각도 계산 함수
function calculateHorizontalAngle(p1, p2) { /* ... 이전과 동일 ... */ }

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

    let status = '좋음';

    if (results.poseLandmarks) {
        // 뼈대 그리기
        canvasCtx.scale(-1, 1);
        canvasCtx.translate(-canvasElement.width, 0);
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#4CAF50', lineWidth: 4});
        drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#E91E63', lineWidth: 2});
        canvasCtx.restore();

        // 랜드마크 좌표 가져오기
        const lm = results.poseLandmarks;
        
        // 1. 목 각도 계산
        currentMetrics.neck = calculate3PointAngle(lm[7], lm[11], lm[23]);
        // 2. 머리 기울기 계산
        currentMetrics.head = calculateHorizontalAngle(lm[7], lm[8]);
        // 3. 어깨 기울기 계산
        currentMetrics.shoulder = calculateHorizontalAngle(lm[11], lm[12]);
        
        // --- 4. 어깨 말림(라운드 숄더) 지표 계산 ---
        // (어깨 Z - 귀 Z) 값 계산. 음수일수록 어깨가 앞으로 나온 것.
        // 양쪽 값의 평균을 내어 더 안정적인 값을 사용.
        const leftSlump = lm[11].z - lm[7].z;
        const rightSlump = lm[12].z - lm[8].z;
        // 직관적인 양수 값으로 변환 (값이 클수록 나쁨)
        currentMetrics.slump = ((leftSlump + rightSlump) / 2) * -100;

        
        // 기준 자세와 비교하여 상태 결정
        if (standardMetrics) {
            const neckDeviation = currentMetrics.neck < standardMetrics.neck - 15;
            const headDeviation = Math.abs(currentMetrics.head - standardMetrics.head) > 8;
            const shoulderDeviation = Math.abs(currentMetrics.shoulder - standardMetrics.shoulder) > 5;
            // 어깨 말림 지표는 기준보다 10 이상 커지면 나쁜 것으로 판단 (값이 클수록 나쁨)
            const slumpDeviation = currentMetrics.slump > standardMetrics.slump + 10;
            
            if (neckDeviation || headDeviation || shoulderDeviation || slumpDeviation) {
                status = '주의!';
                angleDisplay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
            } else {
                status = '좋음';
                angleDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            }
        } else {
            status = '기준 자세를 측정해주세요.';
        }

    } else {
        canvasCtx.restore();
    }
    
    // 화면에 모든 정보 표시 (어깨 말림 추가)
    angleDisplay.innerHTML = `
        <p><span class="label">목 각도:</span> <span class="value">${currentMetrics.neck.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.neck.toFixed(1) : 'N/A'})</p>
        <p><span class="label">머리 기울기:</span> <span class="value">${currentMetrics.head.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.head.toFixed(1) : 'N/A'})</p>
        <p><span class="label">어깨 기울기:</span> <span class="value">${currentMetrics.shoulder.toFixed(1)}°</span> (기준: ${standardMetrics ? standardMetrics.shoulder.toFixed(1) : 'N/A'})</p>
        <p><span class="label">어깨 말림:</span> <span class="value">${currentMetrics.slump.toFixed(1)}</span> (기준: ${standardMetrics ? standardMetrics.slump.toFixed(1) : 'N/A'})</p>
        <hr>
        <p><span class="label">상태:</span> <span class="value">${status}</span></p>
    `;
}

// 나머지 코드는 이전과 동일...
const pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});
pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
pose.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await pose.send({image: videoElement}); }, width: 640, height: 480 });
camera.start();

// 이전과 동일한 함수들
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