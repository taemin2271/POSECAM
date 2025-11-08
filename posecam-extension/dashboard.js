document.addEventListener('DOMContentLoaded', () => {
  const totalCountEl = document.getElementById('totalCount');
  const reasonListEl = document.getElementById('reasonList');
  const stretchListEl = document.getElementById('stretchList');

  // (영상 ID 맵은 동일)
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
    
    if (todayStats && todayStats.total > 0) {
      // ... (총 횟수, 원인별 목록 코드는 동일) ...
      totalCountEl.textContent = todayStats.total;
      const reasons = todayStats.byReason || {};
      const sortedReasons = Object.entries(reasons).sort(([, a], [, b]) => b - a);
      reasonListEl.innerHTML = '';
      for (const [reason, count] of sortedReasons) {
        const li = document.createElement('li');
        li.innerHTML = `${reason} <span class="reason-count">${count}회</span>`;
        reasonListEl.appendChild(li);
      }
      
      // 3. (핵심 수정!) 추천 스트레칭 업데이트
      stretchListEl.innerHTML = '';
      const topReason = sortedReasons[0] ? sortedReasons[0][0] : null; 
      
      if (topReason && stretchMap[topReason]) {
        const stretches = stretchMap[topReason];
        stretches.forEach(stretch => {
          const li = document.createElement('li');
          
          // 👇 (수정!) 'stretching.html' 대신 실제 유튜브 URL로 변경
          li.innerHTML = `<a href="https://www.youtube.com/watch?v=${stretch.vId}" target="_blank">${stretch.name} (새 탭)</a>`;
          
          stretchListEl.appendChild(li);
        });
      } else {
        stretchListEl.innerHTML = '<li>🎉<br>자세가 완벽합니다!</li>';
      }

    } else {
      // ... (데이터 없는 경우 코드는 동일) ...
      totalCountEl.textContent = 0;
      reasonListEl.innerHTML = '<li>아직 알림이 없습니다.</li>';
      stretchListEl.innerHTML = '<li>-</li>';
    }
  });
});