import sys
import types
import os
import json
import joblib

# ---------------------------------------------------------
# 1. JAX 의존성 우회 (기존과 동일)
# ---------------------------------------------------------
try:
    import jax
except ImportError:
    mock_jax = types.ModuleType('jax')
    mock_experimental = types.ModuleType('jax.experimental')
    mock_jax2tf = types.ModuleType('jax.experimental.jax2tf')
    mock_shape_poly = types.ModuleType('jax.experimental.jax2tf.shape_poly')
    class MockPolyShape:
        def __init__(self, *args, **kwargs): pass

    mock_shape_poly.PolyShape = MockPolyShape
    mock_jax2tf.shape_poly = mock_shape_poly
    mock_jax2tf.convert = lambda *args, **kwargs: None
    mock_experimental.jax2tf = mock_jax2tf
    mock_jax.experimental = mock_experimental

    sys.modules['jax'] = mock_jax
    sys.modules['jax.experimental'] = mock_experimental
    sys.modules['jax.experimental.jax2tf'] = mock_jax2tf
    sys.modules['jax.experimental.jax2tf.shape_poly'] = mock_shape_poly

# ---------------------------------------------------------
# 2. 모델 수정 및 변환 로직
# ---------------------------------------------------------
import tensorflow as tf
import tensorflowjs as tfjs

def remove_regularizer(layer):
    """레이어에서 규제(Regularizer) 설정을 제거하는 함수"""
    if hasattr(layer, 'kernel_regularizer'):
        layer.kernel_regularizer = None
    if hasattr(layer, 'bias_regularizer'):
        layer.bias_regularizer = None
    if hasattr(layer, 'activity_regularizer'):
        layer.activity_regularizer = None
    return layer

def fix_and_convert():
    print("📂 모델 로딩 및 수리 중...")
    model_path = 'pose_classifier.h5'
    
    if not os.path.exists(model_path):
        print(f"❌ 오류: '{model_path}' 파일이 없습니다.")
        return

    # 1. 기존 모델 로드
    model = tf.keras.models.load_model(model_path)
    
    # 2. 규제 제거 (Clone Model)
    # 모델의 구조와 가중치는 그대로 두고, 설정(Config)에서 Regularizer만 제거합니다.
    print("🛠️ L2 규제 설정 제거 중...")
    clean_model = tf.keras.models.clone_model(model, clone_function=remove_regularizer)
    clean_model.set_weights(model.get_weights()) # 학습된 가중치 복사
    
    # 3. 변환 및 저장
    output_dir = './tfjs_model'
    print(f"🔄 변환 중... -> {output_dir}")
    
    try:
        tfjs.converters.save_keras_model(clean_model, output_dir)
        print("✅ 모델 변환 완료 (model.json 생성됨)")
    except Exception as e:
        print(f"⚠️ 변환 중 오류: {e}")
        return

    # 4. 스케일러 정보 저장 (기존 유지)
    scaler_path = 'pose_scaler_cls.pkl'
    if os.path.exists(scaler_path):
        scaler = joblib.load(scaler_path)
        scaler_params = {
            'mean': scaler.mean_.tolist(),
            'scale': scaler.scale_.tolist()
        }
        if not os.path.exists(output_dir): os.makedirs(output_dir)
        with open(f'{output_dir}/scaler_params.json', 'w') as f:
            json.dump(scaler_params, f)
        print("✅ 스케일러 정보 저장 완료.")

    print("\n🎉 모든 작업 완료! 확장 프로그램을 새로고침하세요.")

if __name__ == "__main__":
    fix_and_convert()