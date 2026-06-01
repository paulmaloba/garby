"""
Garby Detection Engine — Master Orchestrator (v1.1)
============================================
Bias-fixed + Quality-aware version for Layer 4 v2 + Layer 5 v2

- Fixes conservative bias after v2 updates
- Adds automatic quality estimation (boosts low-quality images)
- Adaptive weighting + small bias correction calibrated for 2026 generators
"""

import os
import time
import numpy as np
from dataclasses import dataclass, field

# ── Import all layers ──────────────────────────────────────────────
from garby_layer1_frequency  import analyse as _l1, FrequencyAnalysisResult
from garby_layer2_noise      import analyse as _l2, NoiseResidualResult
from garby_layer3_statistical import analyse as _l3, StatisticalDistributionResult
from garby_layer4_semantic   import analyse as _l4, SemanticInconsistencyResult
from garby_layer5_nprdwt     import analyse as _l5, NPRDWTResult


# ──────────────────────────────────────────────────────────────────
# Configuration (tuned for modern generators + low-quality robustness)
# ──────────────────────────────────────────────────────────────────
LAYER_WEIGHTS = {
    "layer1": 0.08,
    "layer2": 0.24,
    "layer3": 0.20,
    "layer4": 0.24,   # v2 semantic is strong
    "layer5": 0.24,   # v2 NPR+DWT is strong
}

THRESHOLDS = {
    "ai_high":      0.32,   # ↑ sensitivity
    "ai_medium":    0.24,
    "inconclusive": 0.18,
}

AGREEMENT_THRESHOLD = 3


# ──────────────────────────────────────────────────────────────────
# Quality estimator (handles low-quality / compressed images)
# ──────────────────────────────────────────────────────────────────
def estimate_quality(img_rgb: np.ndarray) -> float:
    """0.0 = very low quality → boost AI sensitivity | 1.0 = pristine"""
    gray = np.mean(img_rgb, axis=2)
    # Sharpness via Laplacian
    lap = np.abs(np.gradient(np.gradient(gray, axis=0), axis=0) +
                 np.gradient(np.gradient(gray, axis=1), axis=1))
    sharpness = float(np.mean(lap))
    # Compression/blockiness noise
    noise_var = float(np.var(gray[::2, ::2] - gray[1::2, 1::2]))
    q = np.clip((sharpness / 0.025) * (noise_var / 0.001 + 0.5), 0.0, 1.0)
    return min(1.0, max(0.0, q))


# ──────────────────────────────────────────────────────────────────
# Result Data Structure
# ──────────────────────────────────────────────────────────────────
@dataclass
class GarbyResult:
    image_path: str
    filename: str
    verdict: str
    confidence: str
    ai_probability: float
    confidence_pct: int
    layer1_score: float
    layer2_score: float
    layer3_score: float
    layer4_score: float
    layer5_score: float
    ensemble_score: float
    layers_agreeing: int
    signals: dict
    findings: list
    processing_time_ms: float
    quality_score: float = 1.0
    layer_results: dict = field(default_factory=dict)


# ──────────────────────────────────────────────────────────────────
# Ensemble with quality adaptation + bias correction
# ──────────────────────────────────────────────────────────────────
def compute_weighted_ensemble(scores: dict, quality: float) -> float:
    base = sum(scores[k] * LAYER_WEIGHTS[k] for k in LAYER_WEIGHTS)
    quality_boost = (1.0 - quality) * 0.07          # help low-quality images
    bias_correction = 0.035                         # calibrated fix for v2 conservatism
    return float(np.clip(base + quality_boost + bias_correction, 0.0, 1.0))


def determine_final_verdict(ensemble: float, layers_agreeing: int) -> tuple[str, str]:
    if ensemble >= THRESHOLDS["ai_high"]:
        return "AI-Generated", "High" if layers_agreeing >= 3 else "Medium"
    elif ensemble >= THRESHOLDS["ai_medium"]:
        return "AI-Generated", "Medium" if layers_agreeing >= 3 else "Low"
    elif ensemble >= THRESHOLDS["inconclusive"]:
        return "Inconclusive", "Low"
    else:
        return "Likely Real", "High" if layers_agreeing >= 3 else "Medium"


def count_agreeing_layers(layer_verdicts: list[str], final_verdict: str) -> int:
    def normalise(v):
        if "AI" in v: return "AI"
        if "Real" in v: return "Real"
        return "Inconclusive"
    target = normalise(final_verdict)
    return sum(1 for v in layer_verdicts if normalise(v) == target)


def merge_signals(r1, r2, r3, r4, r5) -> dict:
    signals = {}
    for k, v in r1.signals.items():
        if k != "Ensemble Score":
            signals[f"[L1] {k}"] = v
    for k, v in r2.signals.items():
        if k != "Ensemble Score":
            signals[f"[L2] {k}"] = v
    for k, v in r3.signals.items():
        if k != "Ensemble Score":
            signals[f"[L3] {k}"] = v
    for k, v in r4.signals.items():
        if k not in ("Ensemble Score", "Findings"):
            signals[f"[L4] {k}"] = v
    for k, v in r5.signals.items():
        if k != "Ensemble Score":
            signals[f"[L5] {k}"] = v
    return signals


# ──────────────────────────────────────────────────────────────────
# Main Orchestrator
# ──────────────────────────────────────────────────────────────────
def detect(image_path: str, verbose: bool = False) -> GarbyResult:
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    start = time.perf_counter()
    filename = os.path.basename(image_path)

    if verbose:
        print(f"[Garby] Analysing: {filename}")

    if verbose: print("  → Layer 1...")
    r1 = _l1(image_path)
    if verbose: print("  → Layer 2...")
    r2 = _l2(image_path)
    if verbose: print("  → Layer 3...")
    r3 = _l3(image_path, layer2_stats=r2.noise_stats)
    if verbose: print("  → Layer 4...")
    r4 = _l4(image_path)
    if verbose: print("  → Layer 5...")
    r5 = _l5(image_path)

    # Quality estimation (use Layer 2 RGB - always available)
    quality = estimate_quality(r2.layer_results.get("img_rgb", np.zeros((64, 64, 3))))

    scores = {
        "layer1": r1.ai_probability,
        "layer2": r2.ai_probability,
        "layer3": r3.ai_probability,
        "layer4": r4.ai_probability,
        "layer5": r5.ai_probability,
    }

    ensemble = compute_weighted_ensemble(scores, quality)

    layer_verdicts = [r1.verdict, r2.verdict, r3.verdict, r4.verdict, r5.verdict]
    pre_verdict, _ = determine_final_verdict(ensemble, 0)
    layers_agreeing = count_agreeing_layers(layer_verdicts, pre_verdict)

    verdict, confidence = determine_final_verdict(ensemble, layers_agreeing)

    ai_prob = round(ensemble, 4)
    confidence_pct = int(round(ai_prob * 100 if "AI" in verdict else (1 - ai_prob) * 100))

    signals = merge_signals(r1, r2, r3, r4, r5)
    findings = r4.findings

    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

    if verbose:
        print(f"  ✓ Done in {elapsed_ms}ms — Quality={quality:.2f} — Verdict: {verdict} ({ai_prob:.4f})")

    return GarbyResult(
        image_path=image_path,
        filename=filename,
        verdict=verdict,
        confidence=confidence,
        ai_probability=ai_prob,
        confidence_pct=confidence_pct,
        layer1_score=round(scores["layer1"], 4),
        layer2_score=round(scores["layer2"], 4),
        layer3_score=round(scores["layer3"], 4),
        layer4_score=round(scores["layer4"], 4),
        layer5_score=round(scores["layer5"], 4),
        ensemble_score=round(ensemble, 4),
        layers_agreeing=layers_agreeing,
        signals=signals,
        findings=findings,
        processing_time_ms=elapsed_ms,
        quality_score=round(quality, 4),
        layer_results={"layer1": r1, "layer2": r2, "layer3": r3, "layer4": r4, "layer5": r5},
    )


# ──────────────────────────────────────────────────────────────────
# Pretty Print & JSON Export (unchanged from your original)
# ──────────────────────────────────────────────────────────────────
def print_result(result: GarbyResult) -> None:
    bar = "═" * 65
    print(f"\n{bar}")
    print(f"  GARBY DETECTION ENGINE — Full Stack Result")
    print(bar)
    print(f"  File        : {result.filename}")
    print(f"  Verdict     : {result.verdict}")
    print(f"  Confidence  : {result.confidence}  ({result.confidence_pct}%)")
    print(f"  AI Score    : {result.ai_probability:.4f}  (0=Real, 1=AI)")
    print(f"  Quality     : {result.quality_score:.2f}")
    print(f"  Layer Agree : {result.layers_agreeing}/5")
    print(f"  Time        : {result.processing_time_ms}ms")
    print("─" * 65)
    print("  Layer Breakdown:")
    weights = LAYER_WEIGHTS
    layers = [
        ("Layer 1 — FFT Frequency", result.layer1_score, weights["layer1"]),
        ("Layer 2 — Noise Residual", result.layer2_score, weights["layer2"]),
        ("Layer 3 — Statistical", result.layer3_score, weights["layer3"]),
        ("Layer 4 — Semantic v2", result.layer4_score, weights["layer4"]),
        ("Layer 5 — NPR+DWT v2", result.layer5_score, weights["layer5"]),
    ]
    for name, score, weight in layers:
        bar_len = int(score * 30)
        bar_str = "█" * bar_len + "░" * (30 - bar_len)
        print(f"  {name:<32} {bar_str}  {score:.3f}  (w={weight})")
    print("─" * 65)
    if result.findings:
        print("  Structural Findings:")
        for f in result.findings:
            print(f"    ⚠  {f}")
        print("─" * 65)
    print(f"  Ensemble Score: {result.ensemble_score:.4f}")
    print(bar + "\n")


def to_json(result: GarbyResult) -> dict:
    return {
        "filename": result.filename,
        "verdict": result.verdict,
        "confidence": result.confidence,
        "confidence_pct": result.confidence_pct,
        "ai_probability": result.ai_probability,
        "ensemble_score": result.ensemble_score,
        "layers_agreeing": result.layers_agreeing,
        "processing_ms": result.processing_time_ms,
        "quality_score": result.quality_score,
        "layer_scores": {
            "layer1_fft": result.layer1_score,
            "layer2_noise": result.layer2_score,
            "layer3_stats": result.layer3_score,
            "layer4_semantic": result.layer4_score,
            "layer5_npr_dwt": result.layer5_score,
        },
        "signals": result.signals,
        "findings": result.findings,
    }


# ──────────────────────────────────────────────────────────────────
# CLI Entry Point
# ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python garby_orchestrator.py <image_path> [--json]")
        sys.exit(1)

    image_path = sys.argv[1]
    json_output = "--json" in sys.argv

    result = detect(image_path, verbose=not json_output)

    if json_output:
        print(json.dumps(to_json(result), indent=2))
    else:
        print_result(result)