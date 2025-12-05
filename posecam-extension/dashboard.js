document.addEventListener('DOMContentLoaded', () => {
  // 1. DOM 요소 가져오기 (HTML ID와 일치)
  const scoreDisplay = document.getElementById('scoreDisplay');
  const cognitiveBoostEl = document.getElementById('cognitiveBoost');
  const alertCountDisplay = document.getElementById('alertCountDisplay');
  const totalTimeDisplay = document.getElementById('totalTimeDisplay');
  
  // 차트 캔버스
  const ctxRatio = document.getElementById('ratioChart').getContext('2d');
  const ctxTimeline = document.getElementById('timelineChart').getContext('2d');

  // 모달 제어 요소
  const infoIcon = document.getElementById('infoIcon');
  const modal = document.getElementById('infoModal');
  const closeModal = document.getElementById('closeModal');

  // 2. 오늘 날짜 데이터 불러오기
  const today = new Date().toISOString().split('T')[0];

  chrome.storage.local.get([today], (result) => {
    // 데이터가 없으면 기본값 0으로 설정
    const stats = result[today] || { 
      totalAlerts: 0, 
      goodFrames: 0, 
      badFrames: 0 
    };

    // --- A. 통계 계산 로직 ---
    const totalFrames = stats.goodFrames + stats.badFrames;
    
    // 1) 자세 점수 (바른 자세 비율)
    let score = 0;
    let goodRatio = 0;
    
    if (totalFrames > 0) {
      goodRatio = stats.goodFrames / totalFrames;
      score = Math.round(goodRatio * 100);
    }

    // 2) 두뇌 회전 향상률 (논문 수치 9.7% 적용)
    const cognitiveBoost = goodRatio * 9.7;

    // 3) 총 모니터링 시간 (분 단위)
    // 가정: 1 프레임 = 0.1초 (DETECTION_INTERVAL_MS = 100)
    const totalSeconds = totalFrames * 0.1;
    const totalMinutes = Math.floor(totalSeconds / 60);

    // --- B. 텍스트 UI 업데이트 ---
    scoreDisplay.textContent = `${score}점`;
    cognitiveBoostEl.textContent = `+${cognitiveBoost.toFixed(1)}%`;
    alertCountDisplay.textContent = `${stats.totalAlerts}회`;
    totalTimeDisplay.textContent = `${totalMinutes}분`;

    // --- C. 차트 그리기 (Chart.js) ---

    // [차트 1] 자세 비율 (도넛 차트)
    // 데이터가 아예 없으면 회색으로 표시하기 위해 더미 데이터 사용
    const ratioData = totalFrames > 0 
        ? [stats.goodFrames, stats.badFrames] 
        : [1, 0]; // 데이터 없음(회색 100%)
    
    const ratioColors = totalFrames > 0 
        ? ['#4CAF50', '#FF5252'] // 초록(좋음), 빨강(나쁨)
        : ['#e0e0e0', '#e0e0e0']; // 회색

    new Chart(ctxRatio, {
      type: 'doughnut',
      data: {
        labels: ['바른 자세', '거북목'],
        datasets: [{
          data: ratioData,
          backgroundColor: ratioColors,
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // 부모 div 크기에 맞춤
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: function(context) {
                if(totalFrames === 0) return ' 데이터 없음';
                let label = context.label || '';
                let value = context.raw;
                let percentage = Math.round((value / totalFrames) * 100) + '%';
                return ` ${label}: ${percentage}`;
              }
            }
          }
        },
        cutout: '70%' // 도넛 두께
      }
    });

    // [차트 2] 알림 발생 현황 (막대 차트)
    // 현재는 시간대별 데이터가 없으므로 '오늘 총 알림'을 막대로 표시
    new Chart(ctxTimeline, {
      type: 'bar',
      data: {
        labels: ['오늘의 알림'],
        datasets: [{
          label: '거북목 감지 횟수',
          data: [stats.totalAlerts],
          backgroundColor: ['#36A2EB'],
          borderRadius: 8,
          barThickness: 50 // 막대 두께 고정
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: 10, // 눈금 최소 10까지는 보이게
            grid: { color: '#f0f0f0' }
          },
          x: {
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false } // 범례 숨김 (라벨 하나라 불필요)
        }
      }
    });
  });

  // --- D. 모달 창 이벤트 (기존 코드 유지) ---
  infoIcon.addEventListener('click', () => {
    modal.style.display = 'block';
  });

  closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  });
});