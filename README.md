# 🐢 Posecam - AI Posture Assistant

  

**Posecam**은 사용자의 웹캠을 통해 실시간으로 거북목 자세를 탐지하고 교정해 주는 **크롬 확장 프로그램**입니다.
단순한 규칙 기반(Rule-based) 판단이 아닌, **직접 수집한 자세 데이터를 학습시킨 독자적인 AI 모델**을 탑재하여 정교한 거북목 탐지 성능을 제공합니다.

## ✨ 주요 기능 (Key Features)

  * **🧠 자체 학습 AI 모델 탑재 (Custom Trained Model)**

      * Google MediaPipe로 신체 좌표(Landmarks)를 추출하고, 이를 \*\*직접 학습시킨 딥러닝 분류기(Classifier)\*\*에 입력하여 거북목 여부를 판단합니다.
      * 다양한 각도와 조명 환경에서의 데이터를 학습하여 오탐지율을 최소화했습니다.

  * **🔍 실시간 On-device 분석**

      * 서버 통신 없이 사용자의 브라우저 내에서 모델 추론이 100% 이루어집니다.
      * **TensorFlow.js** 기반의 경량화된 모델을 적용하여 CPU 점유율을 최적화했습니다.

  * **⚙️ 사용자 맞춤형 민감도 (Sensitivity Control)**

      * 사용자의 집중 패턴에 맞춰 알림 기준을 설정할 수 있습니다.
      * **High (3초) / Medium (6초) / Low (10초)** 단계별 설정 제공.

  * **🔇 백그라운드 모니터링 (Offscreen Document)**

      * Chrome Manifest V3의 한계를 극복하기 위해 **Offscreen API**를 도입했습니다.
      * 팝업을 닫거나 다른 탭을 보고 있어도 끊김 없이 백그라운드에서 자세를 분석합니다.

  * **📊 스마트 대시보드 (Data Visualization)**

      * **Chart.js**를 활용하여 오늘의 자세 점수, 알림 발생 추이, 바른 자세 비율 등을 시각화합니다.
      * 자세 유지에 따른 '두뇌 회전 향상률' 등 동기부여 지표 제공.

## 🛠 기술 스택 (Tech Stack)

  * **Frontend:** HTML5, CSS3, JavaScript (ES6+)
  * **Platform:** Chrome Extension (Manifest V3)
      * Service Worker, Offscreen API, Storage API
  * **AI & ML:**
      * **Feature Extraction:** Google MediaPipe (Pose Landmarker)
      * **Classification:** **Custom Trained Model** (TensorFlow.js / Keras)
  * **Visualization:** Chart.js

## 🔒 프라이버시 (Privacy)

Posecam은 **Serverless** 구조입니다. 웹캠 영상이나 분석 데이터는 외부로 전송되지 않고 사용자의 PC 내에서만 처리됩니다.

## 📂 프로젝트 구조 (Project Structure)

```bash
Posecam/
├── tfjs_model/            # 🧠 직접 학습시킨 모델 파일 (model.json, weights)
├── lib/                   # MediaPipe Vision Bundle
├── offscreen.js           # 모델 로드 및 실시간 추론 로직
├── service-worker.js      # 백그라운드 이벤트 관리
├── popup.html             # 확장 프로그램 UI
├── dashboard.html         # 통계 대시보드
└── ...
```

-----

### 📝 개발자 노트 (Developer Note)

이 프로젝트의 핵심은 \*\*"나에게 딱 맞는 거북목 탐지기"\*\*를 만드는 것이었습니다.
기존의 공개된 모델들은 일반적인 자세 추정에는 뛰어나지만, '거북목'이라는 특정한 병리적 자세를 정확히 구분하는 데에는 한계가 있었습니다.

이를 해결하기 위해 다음과 같은 과정을 거쳤습니다.

1.  **데이터셋:** mpi-inf-3dhp dataset
2.  **특징 추출:** MediaPipe를 통해 어깨와 귀, 코의 좌표 벡터를 추출하고 정규화(Normalization).
3.  **모델 학습:** 추출된 좌표 데이터를 기반으로 **Custom Neural Network**를 학습시켜 분류 정확도를 확보.
4.  **최적화:** 웹 브라우저 환경에서도 끊김 없이 돌아가도록 TensorFlow.js로 모델 경량화 및 변환.

이러한 과정을 통해 Chrome Manifest V3 환경에서도 **실시간성**과 **정확도**를 모두 잡은 서비스를 구현할 수 있었습니다.
