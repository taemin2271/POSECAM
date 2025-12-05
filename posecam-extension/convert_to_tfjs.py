import sys
import types
import os
import json
import joblib

# ---------------------------------------------------------
# 🚑 JAX 의존성 완벽 우회 (Mocking)
# ---------------------------------------------------------
try:
    import jax
except ImportError:
    # 1. 가짜 모듈 생성
    mock_jax = types.ModuleType('jax')
    mock_experimental = types.ModuleType('jax.experimental')
    mock_jax2tf = types.ModuleType('jax.experimental.jax2tf')
    mock_shape_poly = types.ModuleType('jax.experimental.jax2tf.shape_poly')

    # 2. PolyShape는 '클래스'처럼 동작해야 함 -> 빈 클래스로 정의
    class MockPolyShape:
        def __init__(self, *args, **kwargs): pass

    # 3. 구조 연결 (계층 구조 만들기)
    # jax.experimental.jax2tf.shape_poly.PolyShape
    mock_shape_poly.PolyShape = MockPolyShape
    
    # jax.experimental.jax2tf.shape_poly
    mock_jax2tf.shape_poly = mock_shape_poly
    
    # jax.experimental.jax2tf.convert
    mock_jax2tf.convert = lambda *args, **kwargs: None

    # 계층 연결
    mock_experimental.jax2tf = mock_jax2tf
    mock_jax.experimental = mock_experimental

    # 4. 시스템 모듈에 등록 (import가 이 가짜들을 가져가게 함)
    sys.modules['jax'] = mock_jax
    sys.modules['jax.experimental'] = mock_experimental
    sys.modules['jax.experimental.jax2tf'] = mock_jax2tf
    # shape_poly를 직접 import 하는 경우 대비
    sys.modules['jax.experimental.jax2tf.shape_poly'] = mock_shape_poly

# ---------------------------------------------------------
# 라이브러리 로드 & 변환 로직
# ---------------------------------------------------------
import tensorflow as tf
import tensorflowjs as tfjs

def convert():
    print("📂 모델 및 스케일러 로딩 중...")
    
    model_path = 'pose_classifier.h5'
    if not os.path.exists(model_path):
        print(f"❌ 오류: '{model_path}' 파일이 없습니다.")
        return

    # 모델 로드
    try:
        model = tf.keras.models.load_model(model_path)
        print("✅ Keras 모델 로드 성공")
    except Exception as e:
        print(f"❌ 모델 로드 실패: {e}")
        return
    
    # 변환 및 저장
    output_dir = './tfjs_model'
    print(f"🔄 모델 변환 중... -> {output_dir}")
    
    try:
        tfjs.converters.save_keras_model(model, output_dir)
        print("✅ 모델 변환 완료 (model.json 생성됨)")
    except Exception as e:
        print(f"⚠️ 변환 중 오류 발생: {e}")
        return

    # 스케일러 정보 저장
    scaler_path = 'pose_scaler_cls.pkl'
    if os.path.exists(scaler_path):
        try:
            scaler = joblib.load(scaler_path)
            scaler_params = {
                'mean': scaler.mean_.tolist(),
                'scale': scaler.scale_.tolist()
            }
            
            if not os.path.exists(output_dir):
                os.makedirs(output_dir)
                
            with open(f'{output_dir}/scaler_params.json', 'w') as f:
                json.dump(scaler_params, f)
            print("✅ 스케일러 정보(scaler_params.json) 저장 완료.")
        except Exception as e:
            print(f"⚠️ 스케일러 저장 실패: {e}")
    else:
        print("⚠️ 스케일러 파일('pose_scaler_cls.pkl')을 찾을 수 없습니다.")
        
    print("\n🎉 모든 작업 완료! 'tfjs_model' 폴더를 posecam-extension 안으로 옮기세요.")

if __name__ == "__main__":
    convert()