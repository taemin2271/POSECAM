// HTML에서 요소들을 가져옵니다.
// videoElement를 더 이상 JS로 생성하지 않고, HTML에서 직접 가져옵니다.
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const angleDisplay = document.getElementById('angle-display');
const calibrateButton = document.getElementById('calibrate-button');

let standardAngle = null;
let currentAngle = 0;

function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
        angle = 360 - angle;
    }
    return angle;
}

calibrateButton.addEventListener('click', () => {
    if (currentAngle > 0) {
        standardAngle = currentAngle;
        console.log(`기준 각도가 ${standardAngle.toFixed(2)}° 로 설정되었습니다.`);
        alert(`기준 각도가 ${standardAngle.toFixed(2)}° 로 설정되었습니다!`);
    } else {
        alert("아직 자세가 인식되지 않았습니다. 카메라를 정면으로 봐주세요.");
    }
});

function onResults(results) {
    canvasCtx.save();
    // 캔버스를 깨끗하게 지웁니다. (이전 프레임의 뼈대를 지우기 위함)
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // !!! 중요: 더 이상 비디오 프레임을 캔버스에 그리지 않습니다. !!!
    // canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    let status = '좋음';

    if (results.poseLandmarks) {
        // 캔버스가 좌우 반전된 비디오 위에 그려지므로, 캔버스도 좌우 반전시켜서 뼈대가 맞게 그려지도록 합니다.
        canvasCtx.scale(-1, 1);
        canvasCtx.translate(-canvasElement.width, 0);

        // 관절들을 투명한 캔버스 위에 그립니다.
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#FF0000', lineWidth: 2});
        
        // 다시 원래대로 돌려놓습니다. (좌우 반전 해제)
        canvasCtx.restore();

        const landmarks = results.poseLandmarks;
        const leftEar = landmarks[7];
        const leftShoulder = landmarks[11];
        const leftHip = landmarks[23];
        
        currentAngle = calculateAngle(leftEar, leftShoulder, leftHip);

        if (standardAngle) {
            if (currentAngle < standardAngle - 10) {
                status = '주의!';
                angleDisplay.style.backgroundColor = 'red';
            } else {
                status = '좋음';
                angleDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            }
        } else {
            status = '기준 자세를 측정해주세요.';
        }
    } else {
        // 자세가 감지되지 않았을 때 restore를 호출해줘야 다음 프레임에 정상적으로 그려집니다.
        canvasCtx.restore();
    }
    
    angleDisplay.innerHTML = `
        <div>현재 각도: ${currentAngle > 0 ? currentAngle.toFixed(1) : '-'}°</div>
        <div>기준 각도: ${standardAngle ? standardAngle.toFixed(1) : '미설정'}</div>
        <div>상태: ${status}</div>
    `;
}

// MediaPipe Pose 설정 (이전과 동일)
const pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});
pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
pose.onResults(onResults);

// 웹캠 설정 (이전과 동일)
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({image: videoElement});
    },
    width: 640,
    height: 480
});
camera.start();