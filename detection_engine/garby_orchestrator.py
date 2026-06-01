"""
Garby Detection Engine — Master Orchestrator
============================================
Runs all 5 detection layers, combines their outputs with calibrated
weights, and returns a single unified GarbyResult.

Detection Stack:
    Layer 1 — Frequency Domain Fingerprinting (FFT)
    Layer 2 — Noise Residual Analysis (PRNU)
    Layer 3 — Statistical Distribution Analysis (Benford, GLCM, Histogram)
    Layer 4 — Semantic Inconsistency Detection
    Layer 5 — NPR + DWT Hybrid Analysis (SOTA 2024/2025)

Research basis for layer weights:
    - Layers 1-4: classical forensics methods, moderate accuracy on modern generators
    - Layer 5 (NPR+DWT): strongest training-free signal per CVPR 2024 research
    - All layers together: ensemble voting reduces false positive/negative rate

Author  : Garby Detection Team
Version : 1.0.0
"""

import os
import time
from dataclasses import dataclass, field

# ── Import all layers ──────────────────────────────────────────────
from garby_layer1_frequency  import analyse as _l1, FrequencyAnalysisResult
from garby_layer2_noise      import analyse as _l2, NoiseResidualResult
from garby_layer3_statistical import analyse as _l3, StatisticalDistributionResult
from garby_layer4_semantic   import analyse as _l4, SemanticInconsistencyResult
from garby_layer5_nprdwt     import analyse as _l5, NPRDWTResult


# ──────────────────────────────────────────────────────────────────
# Orchestrator Configuration
# ──────────────────────────────────────────────────────────────────

# Layer weights — higher for layers with stronger generalisation
# based on SOTA research benchmarks (arXiv:2502.15176, CVPR 2024)
LAYER_WEIGHTS = {
    "layer1": 0.08,
    "layer2": 0.25,
    "layer3": 0.22,
    "layer4": 0.22,
    "layer5": 0.23,
}

# Confidence boost thresholds
# If multiple layers agree, confidence is boosted
AGREEMENT_THRESHOLD = 3   # Minimum layers agreeing for high confidence


# ──────────────────────────────────────────────────────────────────
# Result Data Structure
# ──────────────────────────────────────────────────────────────────

@dataclass
class GarbyResult:
    """
    Unified detection result combining all 5 layers.
    This is the single object returned from the Garby pipeline
    and consumed by the backend API and result card UI.
    """
    # Image info
    image_path: str
    filename: str

    # Final verdict
    verdict: str              # "AI-Generated" | "Likely Real" | "Inconclusive"
    confidence: str           # "High" | "Medium" | "Low"
    ai_probability: float     # 0.0 → 1.0
    confidence_pct: int       # Human-readable: e.g. 87

    # Layer-level scores
    layer1_score: float
    layer2_score: float
    layer3_score: float
    layer4_score: float
    layer5_score: float

    # Ensemble
    ensemble_score: float
    layers_agreeing: int      # How many layers agree with the final verdict

    # Signals (merged from all layers, for result card UI)
    signals: dict

    # Human-readable findings from Layer 4
    findings: list

    # Performance
    processing_time_ms: float

    # Raw layer results (for downstream use / debugging)
    layer_results: dict = field(default_factory=dict)


# ──────────────────────────────────────────────────────────────────
# Ensemble Logic
# ──────────────────────────────────────────────────────────────────

def compute_weighted_ensemble(scores: dict) -> float:
    """Compute weighted ensemble score from per-layer AI probabilities."""
    return sum(scores[k] * LAYER_WEIGHTS[k] for k in LAYER_WEIGHTS)


def determine_final_verdict(ensemble: float,
                             layers_agreeing: int) -> tuple[str, str]:
    """
    Determine verdict and confidence from ensemble score and layer agreement.

    Layer agreement boosts confidence when multiple independent signals
    reach the same conclusion.
    """
    if ensemble >= 0.36:
        verdict    = "AI-Generated"
        confidence = "High" if layers_agreeing >= 3 else "Medium"
    elif ensemble >= 0.26:
        verdict    = "AI-Generated"
        confidence = "Medium" if layers_agreeing >= 3 else "Low"
    elif ensemble >= 0.18:
        verdict    = "Inconclusive"
        confidence = "Low"
    else:
        verdict    = "Likely Real"
        confidence = "High" if layers_agreeing >= 3 else "Medium"

    return verdict, confidence


def count_agreeing_layers(layer_verdicts: list[str],
                           final_verdict: str) -> int:
    """Count how many individual layer verdicts match the final verdict."""
    def normalise(v):
        if "AI" in v: return "AI"
        if "Real" in v: return "Real"
        return "Inconclusive"

    target = normalise(final_verdict)
    return sum(1 for v in layer_verdicts if normalise(v) == target)


def merge_signals(r1, r2, r3, r4, r5) -> dict:
    """
    Merge detection signals from all layers into a single ordered dict
    for the result card UI. Groups by layer for clarity.
    """
    signals = {}

    # Layer 1
    for k, v in r1.signals.items():
        if k != "Ensemble Score":
            signals[f"[L1] {k}"] = v

    # Layer 2
    for k, v in r2.signals.items():
        if k != "Ensemble Score":
            signals[f"[L2] {k}"] = v

    # Layer 3
    for k, v in r3.signals.items():
        if k != "Ensemble Score":
            signals[f"[L3] {k}"] = v

    # Layer 4
    for k, v in r4.signals.items():
        if k not in ("Ensemble Score", "Findings"):
            signals[f"[L4] {k}"] = v

    # Layer 5
    for k, v in r5.signals.items():
        if k != "Ensemble Score":
            signals[f"[L5] {k}"] = v

    return signals


# ──────────────────────────────────────────────────────────────────
# Main Orchestrator
# ──────────────────────────────────────────────────────────────────

def detect(image_path: str,
           verbose: bool = False) -> GarbyResult:
    """
    Run the full Garby Detection Engine on an image.

    This is the single public entry point for the Garby backend.
    All five layers are run in sequence. Layer 2's noise stats are
    passed into Layer 3 for cross-layer signal amplification.

    Parameters
    ----------
    image_path : str  — Absolute or relative path to the image.
    verbose    : bool — If True, print per-layer progress to stdout.

    Returns
    -------
    GarbyResult — Unified result object ready for the backend API.

    Raises
    ------
    FileNotFoundError — If image_path does not exist.
    ValueError        — If the image cannot be loaded.

    Example
    -------
    >>> result = detect("photo.jpg")
    >>> print(result.verdict, result.ai_probability)
    >>> print(result.findings)
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    start = time.perf_counter()
    filename = os.path.basename(image_path)

    # ── Run all layers ─────────────────────────────────────────────
    if verbose: print(f"[Garby] Analysing: {filename}")

    if verbose: print("  → Layer 1: Frequency Domain Fingerprinting...")
    r1 = _l1(image_path)

    if verbose: print("  → Layer 2: Noise Residual Analysis (PRNU)...")
    r2 = _l2(image_path)

    if verbose: print("  → Layer 3: Statistical Distribution Analysis...")
    r3 = _l3(image_path, layer2_stats=r2.noise_stats)

    if verbose: print("  → Layer 4: Semantic Inconsistency Detection...")
    r4 = _l4(image_path)

    if verbose: print("  → Layer 5: NPR + DWT Hybrid Analysis...")
    r5 = _l5(image_path)

    # ── Collect scores ─────────────────────────────────────────────
    scores = {
        "layer1": r1.ai_probability,
        "layer2": r2.ai_probability,
        "layer3": r3.ai_probability,
        "layer4": r4.ai_probability,
        "layer5": r5.ai_probability,
    }

    ensemble = compute_weighted_ensemble(scores)
    import math
    if math.isnan(ensemble) or not math.isfinite(ensemble): ensemble = 0.5

    layer_verdicts = [r1.verdict, r2.verdict, r3.verdict,
                      r4.verdict, r5.verdict]

    # Preliminary verdict for agreement counting
    pre_verdict, _ = determine_final_verdict(ensemble, 0)
    layers_agreeing = count_agreeing_layers(layer_verdicts, pre_verdict)

    verdict, confidence = determine_final_verdict(ensemble, layers_agreeing)

    # ── Build output ───────────────────────────────────────────────
    import math
    if math.isnan(ensemble) or not math.isfinite(ensemble):
        ensemble = 0.5  # Degenerate image — mark as uncertain
    ai_prob = round(ensemble, 4)
    confidence_pct = int(round(
        ai_prob * 100 if "AI" in verdict
        else (1 - ai_prob) * 100
    ))

    signals  = merge_signals(r1, r2, r3, r4, r5)
    findings = r4.findings  # Human-readable structural anomalies

    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

    if verbose:
        print(f"  ✓ Done in {elapsed_ms}ms — Verdict: {verdict} "
              f"(score={ai_prob:.4f}, confidence={confidence})")

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
        layer_results={
            "layer1": r1,
            "layer2": r2,
            "layer3": r3,
            "layer4": r4,
            "layer5": r5,
        },
    )


# ──────────────────────────────────────────────────────────────────
# Pretty Print
# ──────────────────────────────────────────────────────────────────

def print_result(result: GarbyResult) -> None:
    """Pretty-print a GarbyResult to the console."""
    bar = "═" * 65
    print(f"\n{bar}")
    print(f"  GARBY DETECTION ENGINE — Full Stack Result")
    print(bar)
    print(f"  File        : {result.filename}")
    print(f"  Verdict     : {result.verdict}")
    print(f"  Confidence  : {result.confidence}  ({result.confidence_pct}%)")
    print(f"  AI Score    : {result.ai_probability:.4f}  (0=Real, 1=AI)")
    print(f"  Layer Agree : {result.layers_agreeing}/5 layers agree")
    print(f"  Time        : {result.processing_time_ms}ms")
    print("─" * 65)
    print("  Layer Breakdown:")
    weights = LAYER_WEIGHTS
    layers = [
        ("Layer 1 — FFT Frequency",       result.layer1_score, weights["layer1"]),
        ("Layer 2 — Noise Residual",       result.layer2_score, weights["layer2"]),
        ("Layer 3 — Statistical",          result.layer3_score, weights["layer3"]),
        ("Layer 4 — Semantic",             result.layer4_score, weights["layer4"]),
        ("Layer 5 — NPR + DWT (SOTA)",     result.layer5_score, weights["layer5"]),
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


# ──────────────────────────────────────────────────────────────────
# JSON Export (for backend API integration)
# ──────────────────────────────────────────────────────────────────

def to_json(result: GarbyResult) -> dict:
    """
    Convert GarbyResult to a JSON-serialisable dict.
    This is the format consumed by the Garby Express backend
    to populate scan results in the database and result card UI.
    """
    return {
        "filename":         result.filename,
        "verdict":          result.verdict,
        "confidence":       result.confidence,
        "confidence_pct":   result.confidence_pct,
        "ai_probability":   result.ai_probability,
        "ensemble_score":   result.ensemble_score,
        "layers_agreeing":  result.layers_agreeing,
        "processing_ms":    result.processing_time_ms,
        "layer_scores": {
            "layer1_fft":       result.layer1_score,
            "layer2_noise":     result.layer2_score,
            "layer3_stats":     result.layer3_score,
            "layer4_semantic":  result.layer4_score,
            "layer5_npr_dwt":   result.layer5_score,
        },
        "signals":   result.signals,
        "findings":  result.findings,
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

    image_path  = sys.argv[1]
    json_output = "--json" in sys.argv

    result = detect(image_path, verbose=not json_output)

    if json_output:
        print(json.dumps(to_json(result), indent=2))
    else:
        print_result(result)
