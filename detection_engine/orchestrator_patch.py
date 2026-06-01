
# ── Trained model integration for garby_orchestrator.py ──────────────────────
# Replace the hand-tuned LAYER_WEIGHTS and determine_final_verdict with
# the trained model. Add this to garby_orchestrator.py and call
# detect_with_model() instead of detect() when model file is present.

import joblib, os
import numpy as np

_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'garby_model.pkl')
_model_bundle = None

def _load_model():
    global _model_bundle
    if _model_bundle is None and os.path.exists(_MODEL_PATH):
        _model_bundle = joblib.load(_MODEL_PATH)
        print(f"[GarbyEngine] Trained model loaded (AUC={_model_bundle.get(\'test_auc\', 0):.4f})")
    return _model_bundle

def detect_trained(image_path: str, verbose: bool = False) -> GarbyResult:
    """
    Run detection using the trained meta-classifier.
    Falls back to rule-based detect() if model file not present.
    """
    bundle = _load_model()
    if bundle is None:
        if verbose: print("[GarbyEngine] No trained model found — using rule-based detection")
        return detect(image_path, verbose=verbose)

    import time
    start = time.perf_counter()
    filename = os.path.basename(image_path)

    # Run all 5 layers
    r1 = _l1(image_path)
    r2 = _l2(image_path)
    r3 = _l3(image_path, layer2_stats=r2.noise_stats)
    r4 = _l4(image_path)
    r5 = _l5(image_path)

    # Build feature vector
    FEATURE_NAMES = bundle[\'feature_names\']
    feat_map = {
        \'l1_checkerboard\': r1.checkerboard_score,
        \'l1_spectral\':     r1.spectral_falloff_score,
        \'l1_peak_irr\':     r1.peak_irregularity_score,
        \'l1_channel_asym\': r1.channel_asymmetry_score,
        \'l1_ensemble\':     r1.ensemble_score,
        \'l2_prnu\':         r2.prnu_score,
        \'l2_uniformity\':   r2.noise_uniformity_score,
        \'l2_kurtosis\':     r2.residual_kurtosis_score,
        \'l2_local_variance\': r2.local_variance_score,
        \'l2_ensemble\':     r2.ensemble_score,
        \'l3_benford\':      r3.benford_score,
        \'l3_glcm\':         r3.glcm_score,
        \'l3_histogram\':    r3.histogram_score,
        \'l3_channel_stats\': r3.channel_stats_score,
        \'l3_ensemble\':     r3.ensemble_score,
        \'l4_texture_rep\':  r4.texture_repetition_score,
        \'l4_edge_coherence\': r4.edge_coherence_score,
        \'l4_lighting\':     r4.lighting_consistency_score,
        \'l4_contrast\':     r4.local_contrast_score,
        \'l4_ensemble\':     r4.ensemble_score,
        \'l5_npr\':          r5.npr_score,
        \'l5_dwt_hh\':       r5.dwt_hh_score,
        \'l5_cross_scale\':  r5.dwt_cross_scale_score,
        \'l5_upsampling\':   r5.upsampling_artifact_score,
        \'l5_ensemble\':     r5.ensemble_score,
    }
    X = np.array([[feat_map[k] for k in FEATURE_NAMES]], dtype=np.float32)

    # Scale and predict
    X_s     = bundle[\'scaler\'].transform(X)
    ai_prob = float(bundle[\'model\'].predict_proba(X_s)[0, 1])
    threshold = bundle.get(\'threshold\', 0.45)

    if ai_prob >= threshold:
        verdict, confidence = "AI-Generated", "High" if ai_prob > 0.70 else "Medium"
    elif ai_prob >= threshold * 0.75:
        verdict, confidence = "Inconclusive", "Low"
    else:
        verdict, confidence = "Likely Real", "High" if ai_prob < 0.20 else "Medium"

    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

    return GarbyResult(
        image_path=image_path, filename=filename,
        verdict=verdict, confidence=confidence,
        ai_probability=round(ai_prob, 4),
        confidence_pct=int(round(ai_prob * 100 if "AI" in verdict else (1 - ai_prob) * 100)),
        layer1_score=round(r1.ai_probability, 4),
        layer2_score=round(r2.ai_probability, 4),
        layer3_score=round(r3.ai_probability, 4),
        layer4_score=round(r4.ai_probability, 4),
        layer5_score=round(r5.ai_probability, 4),
        ensemble_score=round(ai_prob, 4),
        layers_agreeing=sum(1 for v in [r1.verdict, r2.verdict, r3.verdict, r4.verdict, r5.verdict] if "AI" in v),
        signals=merge_signals(r1, r2, r3, r4, r5),
        findings=r4.findings,
        processing_time_ms=elapsed_ms,
        layer_results={"layer1": r1, "layer2": r2, "layer3": r3, "layer4": r4, "layer5": r5},
    )
