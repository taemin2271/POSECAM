document.addEventListener('DOMContentLoaded', () => {
  const totalCountEl = document.getElementById('totalCount');
  const reasonListEl = document.getElementById('reasonList');
  const stretchListEl = document.getElementById('stretchList');
  const cognitiveBoostEl = document.getElementById('cognitiveBoost');
  const goodPostureRatioEl = document.getElementById('goodPostureRatio');
  
  // 👇 (추가!) 모달창 제어용 DOM 요소
  const infoIcon = document.getElementById('infoIcon');
  const modal = document.getElementById('infoModal');
  const closeModal = document.getElementById('closeModal');

  // (스트레칭 맵은 동일)
  const stretchMap = {
    "거북목": [
      { name: "턱 당기기 (Chin Tucks)", vId: "w-p-3141-m3c" }, 
      { name: "문틀 가슴 스트레칭", vId: "E-3-1_Ga1m8" } 
    ],
    "기울어짐": [
      { name: "목/어깨 스트레칭", vId: "5lbe9oZbpDs" },
      { name: "어깨 돌리기", vId: "5lbe9oZbpDs" } 
    ]
  };

  const today = new Date().toISOString().split('T')[0];
  
  chrome.storage.local.get([today], (result) => {
    const todayStats = result[today];
    
    if (todayStats) {
      // 1. 총 알림 횟수
      totalCountEl.textContent = todayStats.totalAlerts || 0;
      
      // 2. 원인별 목록
      const reasons = todayStats.byReason || {};
      const sortedReasons = Object.entries(reasons).sort(([, a], [, b]) => b - a);
      reasonListEl.innerHTML = '';
      if (sortedReasons.length > 0) {
        for (const [reason, count] of sortedReasons) {
          const li = document.createElement('li');
          li.innerHTML = `${reason} <span class="reason-count">${count}회</span>`;
          reasonListEl.appendChild(li);
        }
      } else {
        reasonListEl.innerHTML = '<li>알림 없음!</li>';
      }

      // 3. 추천 스트레칭
      stretchListEl.innerHTML = '';
      const topReason = sortedReasons[0] ? sortedReasons[0][0] : null; 
      if (topReason && stretchMap[topReason]) {
        const stretches = stretchMap[topReason];
        stretches.forEach(stretch => {
          const li = document.createElement('li');
          li.innerHTML = `<a href="https://www.youtube.com/watch?v=${stretch.vId}" target="_blank">${stretch.name} (새 탭)</a>`;
          stretchListEl.appendChild(li);
        });
      } else {
        stretchListEl.innerHTML = '<li>🎉<br>자세가 완벽합니다!</li>';
      }
      
      // 4. 두뇌 회전 향상률 계산
      const goodFrames = todayStats.goodFrames || 0;
      const badFrames = todayStats.badFrames || 0;
      const totalFrames = goodFrames + badFrames;
      
      let goodPostureRatio = 0;
      if (totalFrames > 0) {
        goodPostureRatio = goodFrames / totalFrames;
      }
      
      const cognitiveBoost = goodPostureRatio * 9.7; 
      
      goodPostureRatioEl.textContent = `${(goodPostureRatio * 100).toFixed(0)}%`;
      cognitiveBoostEl.textContent = `+${cognitiveBoost.toFixed(1)}%`;

    } else {
      // 데이터가 없는 경우
      totalCountEl.textContent = 0;
      reasonListEl.innerHTML = '<li>아직 알림이 없습니다.</li>';
      stretchListEl.innerHTML = '<li>-</li>';
      cognitiveBoostEl.textContent = '+0.0%';
      goodPostureRatioEl.textContent = '0%';
    }
  });
  
  // 👇 (추가!) 모달창 이벤트 리스너
  
  // 1. 'ⓘ' 아이콘 클릭 시 모달 열기
  infoIcon.addEventListener('click', () => {
    modal.style.display = 'block';
  });
  
  // 2. '×' 버튼 클릭 시 모달 닫기
  closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  // 3. 모달 바깥 영역(회색) 클릭 시 모달 닫기
  window.addEventListener('click', (event) => {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  });
  
});