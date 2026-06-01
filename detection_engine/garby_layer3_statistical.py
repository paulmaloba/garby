"""
Garby Detection Engine — Layer 3: Statistical Distribution Analysis
===================================================================
Detects AI-generated images by analysing the statistical properties
of pixel distributions, DCT coefficients (Benford's Law), and
pixel co-occurrence patterns.

Author  : Garby Detection Team
Version : 1.0.0
"""

import numpy as np
from PIL import Image
import os
from dataclasses import dataclass, field
from scipy.fft import dctn
from scipy.stats import chi2_contingency, entropy


# ──────────────────────────────────────────────────────────────────
# Data Structures
# ──────────────────────────────────────────────────────────────────

@dataclass
class StatisticalDistributionResult:
    """Holds all outputs from Layer 3 statistical distribution analysis."""
    image_path: str
    ai_probability: float
    verdict: str
    confidence: str
    benford_score: float           # DCT coefficient Benford's Law deviation
    glcm_score: float              # Grey-Level Co-occurrence Matrix anomaly
    histogram_score: float         # Pixel histogram shape analysis
    channel_stats_score: float     # Cross-channel statistical consistency
    ensemble_score: float
    signals: dict
    raw_stats: dict = field(default_factory=dict)


# ──────────────────────────────────────────────────────────────────
# Image Loading
# ──────────────────────────────────────────────────────────────────

def load_and_prepare(image_path: str) -> tuple[np.ndarray, np.ndarray]:
    """Load image as float RGB and grayscale arrays, max 1024px."""
    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if max(w, h) > 512:
        scale = 512 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img_rgb  = np.array(img, dtype=np.float32) / 255.0
    img_gray = np.mean(img_rgb, axis=2)
    return img_rgb, img_gray


# ──────────────────────────────────────────────────────────────────
# Signal 1 — Benford's Law on DCT Coefficients
# ──────────────────────────────────────────────────────────────────

BENFORD_EXPECTED = np.array([
    np.log10(1 + 1/d) for d in range(1, 10)
], dtype=np.float64)


def compute_benford_score(img_gray: np.ndarray,
                           block_size: int = 8) -> tuple[float, dict]:
    """
    Test whether DCT coefficients obey Benford's Law.

    Benford's Law states that in many naturally occurring numerical
    datasets, the leading digit d appears with probability:

        P(d) = log10(1 + 1/d)   for d in {1, ..., 9}

    This gives:  P(1) ≈ 30.1%,  P(2) ≈ 17.6%,  ...,  P(9) ≈ 4.6%

    The DCT coefficients of natural image blocks conform strongly to
    Benford's Law because they arise from sums of many independent
    physical processes (scene illumination, texture, optics) — exactly
    the conditions under which Benford's Law emerges.

    AI-generated images deviate from this distribution because their
    DCT coefficients are shaped by learned neural network weights
    rather than natural physical processes. The deviation is measured
    using the Mean Absolute Deviation (MAD) between the observed and
    expected first-digit distributions.

    Returns
    -------
    score : float 0.0–1.0 (higher = more AI-like)
    stats : dict with observed distribution and MAD value
    """
    h, w = img_gray.shape
    n_bh = h // block_size
    n_bw = w // block_size

    if n_bh < 2 or n_bw < 2:
        return 0.0, {"benford_mad": 0.0, "observed": []}

    # Collect absolute DCT coefficients (excluding DC term at [0,0])
    all_coeffs = []
    for i in range(n_bh):
        for j in range(n_bw):
            block = img_gray[
                i*block_size:(i+1)*block_size,
                j*block_size:(j+1)*block_size
            ]
            dct_block = dctn(block, norm='ortho')
            # Exclude DC component and flatten
            ac = np.abs(dct_block.flatten()[1:])
            ac = ac[ac >= 1.0]  # Only coefficients ≥ 1 have a meaningful leading digit
            all_coeffs.extend(ac.tolist())

    if len(all_coeffs) < 100:
        return 0.0, {"benford_mad": 0.0, "observed": []}

    # Extract leading digits
    coeffs_arr = np.array(all_coeffs)
    # Leading digit: floor(x / 10^floor(log10(x)))
    log_vals  = np.floor(np.log10(coeffs_arr)).astype(int)
    leading   = (coeffs_arr / (10.0 ** log_vals)).astype(int)
    leading   = np.clip(leading, 1, 9)

    # Observed distribution
    observed = np.zeros(9, dtype=np.float64)
    for d in range(1, 10):
        observed[d-1] = np.sum(leading == d)
    observed /= (observed.sum() + 1e-10)

    # Mean Absolute Deviation from Benford expectation
    mad = float(np.mean(np.abs(observed - BENFORD_EXPECTED)))

    # Natural images: MAD typically < 0.015
    # AI images: MAD typically > 0.030
    score = float(np.clip((mad - 0.025) / 0.040, 0.0, 1.0))

    stats = {
        "benford_mad": round(mad, 6),
        "observed":    [round(float(x), 4) for x in observed],
        "expected":    [round(float(x), 4) for x in BENFORD_EXPECTED],
    }
    return score, stats


# ──────────────────────────────────────────────────────────────────
# Signal 2 — Grey-Level Co-occurrence Matrix (GLCM)
# ──────────────────────────────────────────────────────────────────

def compute_glcm(channel: np.ndarray, levels: int = 32,
                  distance: int = 1) -> np.ndarray:
    """
    Compute a normalised Grey-Level Co-occurrence Matrix.

    The GLCM counts how often pairs of pixel values (i, j) appear
    at a given distance and direction. We use 4 directions:
    0°, 45°, 90°, 135° and average them for rotation invariance.

    Parameters
    ----------
    channel  : 2D float array [0,1]
    levels   : Number of grey levels (quantisation bins)
    distance : Pixel distance for co-occurrence

    Returns
    -------
    glcm : 2D array [levels x levels], normalised
    """
    # Quantise to integer levels
    q = np.clip((channel * (levels - 1)).astype(int), 0, levels - 1)
    glcm = np.zeros((levels, levels), dtype=np.float64)

    h, w = q.shape
    d = distance

    # 4 directions: horizontal, vertical, diagonal, anti-diagonal
    offsets = [(0, d), (d, 0), (d, d), (d, -d)]
    for dy, dx in offsets:
        y1 = max(0, -dy); y2 = h - max(0, dy)
        x1 = max(0, -dx); x2 = w - max(0, dx)
        src = q[y1:y2, max(0,x1):min(w,x2)]
        dst = q[y1+dy:y2+dy, max(0,x1+dx):min(w,x2+dx)]
        if src.shape != dst.shape or src.size == 0:
            continue
        for a, b in zip(src.flatten(), dst.flatten()):
            glcm[a, b] += 1
            glcm[b, a] += 1  # Symmetry

    total = glcm.sum()
    if total > 0:
        glcm /= total
    return glcm


def glcm_features(glcm: np.ndarray) -> dict:
    """
    Extract Haralick texture features from a GLCM.

    These features describe the statistical texture properties
    of the image and are sensitive to AI generation artifacts.
    """
    levels = glcm.shape[0]
    i_idx, j_idx = np.indices((levels, levels))

    # Energy (Angular Second Moment) — uniformity of pixel pairs
    energy = float(np.sum(glcm ** 2))

    # Contrast — intensity difference between neighbour pairs
    contrast = float(np.sum((i_idx - j_idx) ** 2 * glcm))

    # Homogeneity (Inverse Difference Moment)
    homogeneity = float(np.sum(glcm / (1.0 + np.abs(i_idx - j_idx))))

    # Entropy — disorder/complexity of co-occurrence
    flat = glcm.flatten()
    flat = flat[flat > 0]
    glcm_entropy = float(-np.sum(flat * np.log2(flat + 1e-10)))

    # Correlation
    mu_i = float(np.sum(i_idx * glcm))
    mu_j = float(np.sum(j_idx * glcm))
    sig_i = float(np.sqrt(np.sum((i_idx - mu_i)**2 * glcm)))
    sig_j = float(np.sqrt(np.sum((j_idx - mu_j)**2 * glcm)))
    if sig_i * sig_j > 1e-10:
        correlation = float(np.sum((i_idx - mu_i) * (j_idx - mu_j) * glcm) /
                            (sig_i * sig_j))
    else:
        correlation = 0.0

    return {
        "energy": energy, "contrast": contrast,
        "homogeneity": homogeneity, "entropy": glcm_entropy,
        "correlation": correlation,
    }


def compute_glcm_score(img_gray: np.ndarray) -> tuple[float, dict]:
    """
    Detect AI generation via GLCM texture feature analysis.

    AI-generated images consistently show abnormal GLCM properties:
    - Higher energy than natural images (over-regular pixel pair patterns)
    - Lower entropy (less textural complexity)
    - Unusually high homogeneity (too-smooth transitions)
    - Correlation deviating from the natural range

    Natural photographs have evolved statistical textures from physical
    optics and scene statistics. AI generators approximate these but
    deviate in measurable ways at the pixel co-occurrence level.

    Returns
    -------
    score : float 0.0–1.0 (higher = more AI-like)
    stats : dict of GLCM feature values
    """
    glcm = compute_glcm(img_gray, levels=32, distance=1)
    feats = glcm_features(glcm)

    scores = []

    # Energy: natural ~0.01–0.08, AI often >0.10 (over-regular)
    e = feats["energy"]
    if e > 0.10:
        scores.append(float(np.clip((e - 0.10) / 0.15, 0.0, 1.0)))
    elif e < 0.005:
        scores.append(float(np.clip((0.005 - e) / 0.005, 0.0, 1.0)))
    else:
        scores.append(0.0)

    # Entropy: natural ~3.5–5.5 bits, AI often <3.0 (less complex)
    ent = feats["entropy"]
    if ent < 3.0:
        scores.append(float(np.clip((3.0 - ent) / 3.0, 0.0, 1.0)))
    elif ent > 6.5:
        scores.append(float(np.clip((ent - 6.5) / 2.0, 0.0, 1.0)))
    else:
        scores.append(0.0)

    # Homogeneity: natural ~0.3–0.6, AI often >0.65 (too smooth)
    hom = feats["homogeneity"]
    if hom > 0.65:
        scores.append(float(np.clip((hom - 0.65) / 0.35, 0.0, 1.0)))
    else:
        scores.append(0.0)

    # Contrast: natural ~0.1–1.0, AI can be <0.05 (too smooth)
    con = feats["contrast"]
    if con < 0.05:
        scores.append(float(np.clip((0.05 - con) / 0.05, 0.0, 1.0)))
    else:
        scores.append(0.0)

    score = float(np.clip(np.mean(scores), 0.0, 1.0))
    return score, feats


# ──────────────────────────────────────────────────────────────────
# Signal 3 — Pixel Histogram Shape Analysis
# ──────────────────────────────────────────────────────────────────

def compute_histogram_score(img_rgb: np.ndarray) -> tuple[float, dict]:
    """
    Detect AI generation via pixel intensity histogram analysis.

    Natural photographs follow specific histogram shapes determined
    by scene illumination, camera response curves, and gamma correction.
    They exhibit:
    - Continuous, smooth distributions without sharp spikes
    - Channel-specific histogram shapes (R, G, B are not identical)
    - Tails that extend to near-black and near-white

    AI-generated images often show:
    - Unnaturally smooth/rounded histograms (too perfect bell curves)
    - Truncated tails (rarely reaching pure black or pure white)
    - Suspicious peaks at specific values (quantisation from upsampling)
    - Cross-channel histogram similarity that is too high

    Returns
    -------
    score : float 0.0–1.0 (higher = more AI-like)
    stats : dict of histogram metrics
    """
    scores = []
    channel_entropies = []
    channel_means     = []
    channel_stds      = []

    for c in range(3):
        ch = img_rgb[:, :, c].flatten()

        hist, edges = np.histogram(ch, bins=256, range=(0, 1), density=True)
        hist_norm   = hist / (hist.sum() + 1e-10)

        # 1. Histogram entropy — natural images have higher entropy
        h_ent = float(-np.sum(hist_norm[hist_norm > 0] *
                               np.log2(hist_norm[hist_norm > 0] + 1e-10)))
        channel_entropies.append(h_ent)

        # 2. Tail coverage — does histogram reach near-black and near-white?
        low_coverage  = float(np.sum(hist[:16]))   # Pixels near 0
        high_coverage = float(np.sum(hist[240:]))  # Pixels near 255
        tail_score = 0.0
        if low_coverage < 0.5:   # Too few dark pixels
            tail_score += float(np.clip((0.5 - low_coverage) / 0.5, 0.0, 0.5))
        if high_coverage < 0.5:  # Too few bright pixels
            tail_score += float(np.clip((0.5 - high_coverage) / 0.5, 0.0, 0.5))
        scores.append(float(np.clip(tail_score, 0.0, 1.0)))

        # 3. Smoothness — AI histograms are often too smooth
        #    High second-difference norm = spiky (natural)
        #    Low second-difference norm  = over-smooth (AI)
        diff2 = np.diff(hist, n=2)
        roughness = float(np.mean(np.abs(diff2)))
        if roughness < 0.0002:
            scores.append(float(np.clip((0.0002 - roughness) / 0.0002, 0.0, 1.0)))
        else:
            scores.append(0.0)

        channel_means.append(float(np.mean(ch)))
        channel_stds.append(float(np.std(ch)))

    # 4. Cross-channel mean similarity — AI images often too similar across channels
    mean_range = max(channel_means) - min(channel_means)
    if mean_range < 0.02:
        scores.append(float(np.clip((0.02 - mean_range) / 0.02, 0.0, 1.0)))
    else:
        scores.append(0.0)

    # 5. Entropy too high or too low across channels
    mean_ent = np.mean(channel_entropies)
    if mean_ent < 4.0:
        scores.append(float(np.clip((4.0 - mean_ent) / 4.0, 0.0, 1.0)))
    else:
        scores.append(0.0)

    score = float(np.clip(np.mean(scores), 0.0, 1.0))
    stats = {
        "channel_entropies": [round(e, 4) for e in channel_entropies],
        "channel_means":     [round(m, 4) for m in channel_means],
        "channel_stds":      [round(s, 4) for s in channel_stds],
        "mean_entropy":      round(float(np.mean(channel_entropies)), 4),
    }
    return score, stats


# ──────────────────────────────────────────────────────────────────
# Signal 4 — Cross-Channel Statistical Consistency
# ──────────────────────────────────────────────────────────────────

def compute_channel_stats_score(img_rgb: np.ndarray,
                                 layer2_stats: dict = None) -> tuple[float, dict]:
    """
    Measure statistical consistency across R, G, B channels
    and incorporate Layer 2 noise stats if available.

    Natural images have specific inter-channel statistical relationships
    set by the spectral sensitivity of camera sensors. AI generators
    don't model sensor spectral sensitivity, producing channels that
    are either too statistically similar or show unnatural divergence.

    Additionally, we test:
    - Coefficient of variation across channels (too equal = AI)
    - Kurtosis difference between channels (should differ slightly in real images)
    - If Layer 2 residual kurtosis is available, flag combinations of high
      statistical regularity at both pixel and noise level.

    Returns
    -------
    score : float 0.0–1.0 (higher = more AI-like)
    stats : dict
    """
    from scipy.stats import kurtosis as scipy_kurtosis

    ch_stats = []
    for c in range(3):
        ch = img_rgb[:, :, c].flatten()
        ch_stats.append({
            "mean": float(np.mean(ch)),
            "std":  float(np.std(ch)),
            "kurt": float(scipy_kurtosis(ch, fisher=True)),
            "skew": float(np.mean(((ch - np.mean(ch)) / (np.std(ch) + 1e-8)) ** 3)),
        })

    scores = []

    # 1. Std deviation similarity — real cameras have slightly different noise per channel
    stds = [s["std"] for s in ch_stats]
    std_cv = float(np.std(stds) / (np.mean(stds) + 1e-8))
    if std_cv < 0.02:
        scores.append(float(np.clip((0.02 - std_cv) / 0.02, 0.0, 1.0)))
    else:
        scores.append(0.0)

    # 2. Kurtosis range — channels should not all have identical kurtosis
    kurts = [s["kurt"] for s in ch_stats]
    kurt_range = max(kurts) - min(kurts)
    if kurt_range < 0.1:
        scores.append(float(np.clip((0.1 - kurt_range) / 0.1, 0.0, 1.0)))
    else:
        scores.append(0.0)

    # 3. Mean channel ratios — real images: B typically brightest, R warmest in natural light
    means = [s["mean"] for s in ch_stats]
    mean_cv = float(np.std(means) / (np.mean(means) + 1e-8))
    if mean_cv < 0.01:
        scores.append(float(np.clip((0.01 - mean_cv) / 0.01, 0.0, 1.0)))
    else:
        scores.append(0.0)

    # 4. Incorporate Layer 2 kurtosis if passed in
    if layer2_stats and "kurtosis" in layer2_stats:
        l2_kurt = layer2_stats["kurtosis"]
        # Very low noise kurtosis (sub-Gaussian) + high channel uniformity = strong AI signal
        if l2_kurt < 0.5 and std_cv < 0.05:
            scores.append(0.8)
        else:
            scores.append(0.0)

    score = float(np.clip(np.mean(scores), 0.0, 1.0))
    stats = {
        "channel_stds":     [round(s["std"], 4) for s in ch_stats],
        "channel_kurtosis": [round(s["kurt"], 4) for s in ch_stats],
        "channel_means":    [round(s["mean"], 4) for s in ch_stats],
        "std_cv":           round(std_cv, 4),
        "kurt_range":       round(kurt_range, 4),
    }
    return score, stats


# ──────────────────────────────────────────────────────────────────
# Ensemble Scoring & Verdict
# ──────────────────────────────────────────────────────────────────

WEIGHTS = {
    "benford": 0.55,
    "glcm":    0.20,
    "histogram": 0.15,
    "channel_stats": 0.10,
}

THRESHOLDS = {
    "ai_high":      0.38,
    "ai_medium":    0.24,
    "inconclusive": 0.28,
}


def compute_ensemble(scores: dict) -> float:
    return (
        scores["benford"]       * WEIGHTS["benford"]       +
        scores["glcm"]          * WEIGHTS["glcm"]          +
        scores["histogram"]     * WEIGHTS["histogram"]     +
        scores["channel_stats"] * WEIGHTS["channel_stats"]
    )


def determine_verdict(ensemble: float) -> tuple[str, str, float]:
    if ensemble >= THRESHOLDS["ai_high"]:
        return "AI-Generated", "High", ensemble
    elif ensemble >= THRESHOLDS["ai_medium"]:
        return "AI-Generated", "Medium", ensemble
    elif ensemble >= THRESHOLDS["inconclusive"]:
        return "Inconclusive", "Low", ensemble
    else:
        return "Likely Real", "High", ensemble


def build_signals(scores: dict, raw: dict) -> dict:
    def level(s):
        if s >= 0.60: return "High"
        if s >= 0.30: return "Moderate"
        return "Low"

    mad = raw.get("benford_mad", 0)
    ent = raw.get("mean_entropy", 0)
    return {
        "Benford's Law (DCT)":     f"{level(scores['benford'])} ({scores['benford']:.2f}) — DCT first-digit MAD={mad:.4f}",
        "GLCM Texture Analysis":   f"{level(scores['glcm'])} ({scores['glcm']:.2f}) — Co-occurrence matrix anomaly",
        "Histogram Shape":         f"{level(scores['histogram'])} ({scores['histogram']:.2f}) — Mean entropy={ent:.2f} bits",
        "Channel Stat Consistency":f"{level(scores['channel_stats'])} ({scores['channel_stats']:.2f}) — R/G/B statistical uniformity",
        "Ensemble Score":          f"{compute_ensemble(scores):.4f}",
    }


# ──────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────

def analyse(image_path: str,
            layer2_stats: dict = None) -> StatisticalDistributionResult:
    """
    Run Layer 3 Statistical Distribution Analysis on an image.

    Parameters
    ----------
    image_path   : str  — Path to the image file.
    layer2_stats : dict — Optional noise_stats from Layer 2 output,
                          used to boost cross-layer signal detection.

    Returns
    -------
    StatisticalDistributionResult
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img_rgb, img_gray = load_and_prepare(image_path)

    benford_score, benford_stats = compute_benford_score(img_gray)
    glcm_score,    glcm_stats    = compute_glcm_score(img_gray)
    hist_score,    hist_stats    = compute_histogram_score(img_rgb)
    chan_score,    chan_stats     = compute_channel_stats_score(img_rgb, layer2_stats)

    scores = {
        "benford":       benford_score,
        "glcm":          glcm_score,
        "histogram":     hist_score,
        "channel_stats": chan_score,
    }

    raw_stats = {
        **benford_stats,
        **hist_stats,
        **chan_stats,
    }

    ensemble = compute_ensemble(scores)
    verdict, confidence, ai_prob = determine_verdict(ensemble)
    signals  = build_signals(scores, {
        "benford_mad":  benford_stats.get("benford_mad", 0),
        "mean_entropy": hist_stats.get("mean_entropy", 0),
    })

    return StatisticalDistributionResult(
        image_path=image_path,
        ai_probability=round(ai_prob, 4),
        verdict=verdict,
        confidence=confidence,
        benford_score=round(benford_score, 4),
        glcm_score=round(glcm_score, 4),
        histogram_score=round(hist_score, 4),
        channel_stats_score=round(chan_score, 4),
        ensemble_score=round(ensemble, 4),
        signals=signals,
        raw_stats=raw_stats,
    )


def print_result(result: StatisticalDistributionResult) -> None:
    print("\n" + "=" * 62)
    print("  GARBY — Layer 3: Statistical Distribution Analysis")
    print("=" * 62)
    print(f"  Image     : {os.path.basename(result.image_path)}")
    print(f"  Verdict   : {result.verdict}")
    print(f"  Confidence: {result.confidence}")
    print(f"  AI Score  : {result.ai_probability:.4f}  (0=Real, 1=AI)")
    print("-" * 62)
    for name, desc in result.signals.items():
        print(f"    • {name}: {desc}")
    print("=" * 62 + "\n")


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python garby_layer3_statistical.py <image_path>")
        sys.exit(1)
    print_result(analyse(sys.argv[1]))
