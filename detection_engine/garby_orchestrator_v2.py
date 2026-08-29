"""
Garby Detection Engine — Master Orchestrator v2
================================================
Trained model integration.

When garby_model.pkl is present in the same directory, detect_trained()
uses the meta-classifier trained on 13,825 images (6,918 real + 6,907 AI).

Trained model stats (CORRECTED 30 Aug 2026 — see note below):
  Test Accuracy : 89.06%
  Test AUC      : 0.9516
  Optimal threshold: 0.65

  ⚠ This docstring previously claimed Test Accuracy 98.02% / AUC 0.9972 /
  2.0% false positives / 1.9% false negatives. Those numbers do not match
  what garby_model.pkl actually reports about itself — the Render engine's
  startup log prints the bundle's own embedded metadata every boot
  ("[GarbyEngine] Trained model loaded — AUC=... Acc=...") and it has
  consistently read AUC=0.9516 / Acc=0.8906, both before and after fixing
  an unrelated scikit-learn version mismatch that was ruled out as the
  cause. Whether this docstring described an earlier/different model.pkl
  that was later swapped, or was simply aspirational, is unknown — treat
  the accuracy/AUC above as the only verified figures until someone
  re-derives real numbers from a held-out set against the exact deployed
  model.pkl.

  The false-positive/false-negative rates and the layer-weight breakdown
  below have NOT been independently re-verified against the currently
  deployed model.pkl — they may be stale from whatever run originally
  produced this docstring. Do not cite them externally (pricing page,
  investor materials, etc.) without re-confirming against the live bundle.

Layer weights as originally documented (UNVERIFIED — see warning above):
  L1 FFT Spectral : 44.9%  ← dominant signal
  L5 NPR+DWT      : 25.4%
  L4 Semantic     : 18.6%
  L2 PRNU Noise   : 6.8%
  L3 Statistical  : 4.3%

Falls back to rule-based detect() if model file is absent.

Author  : Garby Detection Team
Version : 2.0.0 (trained)
"""

import os
import time
import math
import numpy as np
from dataclasses import dataclass, field

# ── Import all layers ──────────────────────────────────────────────────────────
from garby_layer1_frequency   import analyse as _l1, FrequencyAnalysisResult
from garby_layer2_noise       import analyse as _l2, NoiseResidualResult
from garby_layer3_statistical import analyse as _l3, StatisticalDistributionResult
from garby_layer4_semantic    import analyse as _l4, SemanticInconsistencyResult
from garby_layer5_nprdwt      import analyse as _l5, NPRDWTResult

# ── Model loading ──────────────────────────────────────────────────────────────
_MODEL_PATH   = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'garby_model.pkl')
_model_bundle = None

def _load_model():
    global _model_bundle
    if _model_bundle is not None:
        return _model_bundle
    if os.path.exists(_MODEL_PATH):
        try:
            import joblib
            _model_bundle = joblib.load(_MODEL_PATH)
            auc = _model_bundle.get('test_auc', 0)
            acc = _model_bundle.get('test_accuracy', 0)
            print(f"[GarbyEngine] Trained model loaded — AUC={auc:.4f} Acc={acc:.4f}")
            return _model_bundle
        except Exception as e:
            print(f"[GarbyEngine] Failed to load model: {e} — using rule-based fallback")
    return None


# ── Result Data Structure ──────────────────────────────────────────────────────
@dataclass
class GarbyResult:
    image_path:      str
    filename:        str
    verdict:         str
    confidence:      str
    ai_probability:  float
    confidence_pct:  int
    layer1_score:    float
    layer2_score:    float
    layer3_score:    float
    layer4_score:    float
    layer5_score:    float
    ensemble_score:  float
    layers_agreeing: int
    signals:         dict
    findings:        list
    processing_time_ms: float
    layer_results:   dict = field(default_factory=dict)


# ── Feature extraction ─────────────────────────────────────────────────────────
FEATURE_NAMES = [
    'l1_checkerboard','l1_spectral','l1_peak_irr','l1_channel_asym','l1_ensemble',
    'l2_prnu','l2_uniformity','l2_kurtosis','l2_local_variance','l2_ensemble',
    'l3_benford','l3_glcm','l3_histogram','l3_channel_stats','l3_ensemble',
    'l4_texture_rep','l4_edge_coherence','l4_lighting','l4_contrast','l4_ensemble',
    'l5_npr','l5_dwt_hh','l5_cross_scale','l5_upsampling','l5_ensemble',
]

def _build_feature_vector(r1, r2, r3, r4, r5) -> np.ndarray:
    feat_map = {
        'l1_checkerboard': r1.checkerboard_score,
        'l1_spectral':     r1.spectral_falloff_score,
        'l1_peak_irr':     r1.peak_irregularity_score,
        'l1_channel_asym': r1.channel_asymmetry_score,
        'l1_ensemble':     r1.ensemble_score,
        'l2_prnu':         r2.prnu_score,
        'l2_uniformity':   r2.noise_uniformity_score,
        'l2_kurtosis':     r2.residual_kurtosis_score,
        'l2_local_variance': r2.local_variance_score,
        'l2_ensemble':     r2.ensemble_score,
        'l3_benford':      r3.benford_score,
        'l3_glcm':         r3.glcm_score,
        'l3_histogram':    r3.histogram_score,
        'l3_channel_stats':r3.channel_stats_score,
        'l3_ensemble':     r3.ensemble_score,
        'l4_texture_rep':  r4.texture_repetition_score,
        'l4_edge_coherence':r4.edge_coherence_score,
        'l4_lighting':     r4.lighting_consistency_score,
        'l4_contrast':     r4.local_contrast_score,
        'l4_ensemble':     r4.ensemble_score,
        'l5_npr':          r5.npr_score,
        'l5_dwt_hh':       r5.dwt_hh_score,
        'l5_cross_scale':  r5.dwt_cross_scale_score,
        'l5_upsampling':   r5.upsampling_artifact_score,
        'l5_ensemble':     r5.ensemble_score,
    }
    return np.array([[feat_map[k] for k in FEATURE_NAMES]], dtype=np.float32)


# ── Helper: merge signals from all layers ──────────────────────────────────────
def merge_signals(r1, r2, r3, r4, r5) -> dict:
    signals = {}
    for k, v in r1.signals.items():
        if k != "Ensemble Score": signals[f"[L1] {k}"] = v
    for k, v in r2.signals.items():
        if k != "Ensemble Score": signals[f"[L2] {k}"] = v
    for k, v in r3.signals.items():
        if k != "Ensemble Score": signals[f"[L3] {k}"] = v
    for k, v in r4.signals.items():
        if k not in ("Ensemble Score", "Findings"): signals[f"[L4] {k}"] = v
    for k, v in r5.signals.items():
        if k != "Ensemble Score": signals[f"[L5] {k}"] = v
    return signals


def count_agreeing_layers(layer_verdicts, final_verdict):
    def norm(v):
        if "AI" in v: return "AI"
        if "Real" in v: return "Real"
        return "Inconclusive"
    target = norm(final_verdict)
    return sum(1 for v in layer_verdicts if norm(v) == target)


# ── PRIMARY: Trained model detection ──────────────────────────────────────────
def detect_trained(image_path: str, verbose: bool = False) -> GarbyResult:
    """
    Run detection using the trained meta-classifier (see module docstring for verified accuracy).
    Falls back to rule-based detect() if garby_model.pkl is not present.
    """
    bundle = _load_model()
    if bundle is None:
        if verbose: print("[GarbyEngine] No trained model — using rule-based detection")
        return detect(image_path, verbose=verbose)

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    start    = time.perf_counter()
    filename = os.path.basename(image_path)

    if verbose: print(f"[GarbyEngine] Analysing: {filename} (trained model)")

    # Run all 5 layers
    r1 = _l1(image_path)
    r2 = _l2(image_path)
    r3 = _l3(image_path, layer2_stats=r2.noise_stats)
    r4 = _l4(image_path)
    r5 = _l5(image_path)

    # Build feature vector and predict
    X         = _build_feature_vector(r1, r2, r3, r4, r5)
    X_s       = bundle['scaler'].transform(X)
    ai_prob   = float(bundle['model'].predict_proba(X_s)[0, 1])
    threshold = bundle.get('threshold', 0.65)

    # Safety check for NaN/inf
    if math.isnan(ai_prob) or not math.isfinite(ai_prob):
        ai_prob = 0.5

    # Verdict using trained threshold (0.65)
    if ai_prob >= threshold:
        verdict    = "AI-Generated"
        confidence = "High" if ai_prob > 0.80 else "Medium"
    elif ai_prob >= threshold * 0.70:   # ~0.455 → inconclusive zone
        verdict    = "Inconclusive"
        confidence = "Low"
    else:
        verdict    = "Likely Real"
        confidence = "High" if ai_prob < 0.20 else "Medium"

    layer_verdicts  = [r1.verdict, r2.verdict, r3.verdict, r4.verdict, r5.verdict]
    layers_agreeing = count_agreeing_layers(layer_verdicts, verdict)
    signals         = merge_signals(r1, r2, r3, r4, r5)
    elapsed_ms      = round((time.perf_counter() - start) * 1000, 1)
    confidence_pct  = int(round(ai_prob * 100 if "AI" in verdict else (1 - ai_prob) * 100))

    if verbose:
        print(f"  ✓ {verdict} (ai_prob={ai_prob:.4f}, threshold={threshold:.2f}) in {elapsed_ms}ms")

    return GarbyResult(
        image_path=image_path, filename=filename,
        verdict=verdict, confidence=confidence,
        ai_probability=round(ai_prob, 4),
        confidence_pct=confidence_pct,
        layer1_score=round(r1.ai_probability, 4),
        layer2_score=round(r2.ai_probability, 4),
        layer3_score=round(r3.ai_probability, 4),
        layer4_score=round(r4.ai_probability, 4),
        layer5_score=round(r5.ai_probability, 4),
        ensemble_score=round(ai_prob, 4),
        layers_agreeing=layers_agreeing,
        signals=signals,
        findings=r4.findings,
        processing_time_ms=elapsed_ms,
        layer_results={'layer1':r1,'layer2':r2,'layer3':r3,'layer4':r4,'layer5':r5},
    )


# ── FALLBACK: Rule-based detection (original) ─────────────────────────────────

LAYER_WEIGHTS = {'layer1':0.08,'layer2':0.25,'layer3':0.22,'layer4':0.22,'layer5':0.23}

def detect(image_path: str, verbose: bool = False) -> GarbyResult:
    """Rule-based fallback — used when trained model is not available."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    start    = time.perf_counter()
    filename = os.path.basename(image_path)

    r1 = _l1(image_path)
    r2 = _l2(image_path)
    r3 = _l3(image_path, layer2_stats=r2.noise_stats)
    r4 = _l4(image_path)
    r5 = _l5(image_path)

    scores = {
        'layer1': r1.ai_probability, 'layer2': r2.ai_probability,
        'layer3': r3.ai_probability, 'layer4': r4.ai_probability,
        'layer5': r5.ai_probability,
    }
    ensemble = sum(scores[k] * LAYER_WEIGHTS[k] for k in LAYER_WEIGHTS)
    if math.isnan(ensemble) or not math.isfinite(ensemble): ensemble = 0.5

    if ensemble >= 0.36:
        verdict, confidence = "AI-Generated", "High" if ensemble > 0.50 else "Medium"
    elif ensemble >= 0.26:
        verdict, confidence = "Inconclusive", "Low"
    else:
        verdict, confidence = "Likely Real", "High" if ensemble < 0.18 else "Medium"

    layer_verdicts  = [r1.verdict, r2.verdict, r3.verdict, r4.verdict, r5.verdict]
    pre_verdict, _  = verdict, confidence
    layers_agreeing = count_agreeing_layers(layer_verdicts, verdict)
    ai_prob         = round(ensemble, 4)
    confidence_pct  = int(round(ai_prob * 100 if "AI" in verdict else (1 - ai_prob) * 100))
    elapsed_ms      = round((time.perf_counter() - start) * 1000, 1)

    return GarbyResult(
        image_path=image_path, filename=filename,
        verdict=verdict, confidence=confidence,
        ai_probability=ai_prob, confidence_pct=confidence_pct,
        layer1_score=round(scores['layer1'],4), layer2_score=round(scores['layer2'],4),
        layer3_score=round(scores['layer3'],4), layer4_score=round(scores['layer4'],4),
        layer5_score=round(scores['layer5'],4), ensemble_score=ai_prob,
        layers_agreeing=layers_agreeing, signals=merge_signals(r1,r2,r3,r4,r5),
        findings=r4.findings, processing_time_ms=elapsed_ms,
        layer_results={'layer1':r1,'layer2':r2,'layer3':r3,'layer4':r4,'layer5':r5},
    )


# ── JSON export ────────────────────────────────────────────────────────────────
def to_json(result: GarbyResult) -> dict:
    return {
        'filename':       result.filename,
        'verdict':        result.verdict,
        'confidence':     result.confidence,
        'confidence_pct': result.confidence_pct,
        'ai_probability': result.ai_probability,
        'ensemble_score': result.ensemble_score,
        'layers_agreeing':result.layers_agreeing,
        'processing_ms':  result.processing_time_ms,
        'layer_scores': {
            'layer1_fft':      result.layer1_score,
            'layer2_noise':    result.layer2_score,
            'layer3_stats':    result.layer3_score,
            'layer4_semantic': result.layer4_score,
            'layer5_npr_dwt':  result.layer5_score,
        },
        'signals':  result.signals,
        'findings': result.findings,
    }


# ── CLI ────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys, json
    if len(sys.argv) < 2:
        print("Usage: python garby_orchestrator.py <image_path> [--json] [--rule-based]")
        sys.exit(1)
    path        = sys.argv[1]
    use_json    = "--json" in sys.argv
    rule_based  = "--rule-based" in sys.argv
    fn          = detect if rule_based else detect_trained
    result      = fn(path, verbose=not use_json)
    if use_json:
        print(json.dumps(to_json(result), indent=2))
    else:
        print(f"\n{'='*60}")
        print(f"  Verdict    : {result.verdict}")
        print(f"  AI Prob    : {result.ai_probability:.4f}")
        print(f"  Confidence : {result.confidence} ({result.confidence_pct}%)")
        print(f"  Time       : {result.processing_time_ms}ms")
        print(f"  Mode       : {'Trained model' if _model_bundle else 'Rule-based'}")
        print(f"{'='*60}\n")
