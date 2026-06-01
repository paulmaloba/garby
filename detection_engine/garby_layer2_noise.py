"""
Garby Detection Engine — Layer 2: Noise Residual Analysis (PRNU)
================================================================
Detects AI-generated images by analysing the noise residual left
after denoising. Real cameras leave structured sensor noise
(Photo Response Non-Uniformity). AI generators do not.

Author  : Garby Detection Team
Version : 1.0.0
"""

import numpy as np
from PIL import Image
import os
from dataclasses import dataclass
from scipy.ndimage import uniform_filter
from scipy.stats import kurtosis, skew


# ──────────────────────────────────────────────────────────────────
# Data Structures
# ──────────────────────────────────────────────────────────────────

@dataclass
class NoiseResidualResult:
    """Holds all outputs from the Layer 2 noise residual analysis."""
    image_path: str
    ai_probability: float          # 0.0 (real) → 1.0 (AI)
    verdict: str                   # "AI-Generated" | "Likely Real" | "Inconclusive"
    confidence: str                # "High" | "Medium" | "Low"
    prnu_score: float              # Sensor noise structure score
    noise_uniformity_score: float  # Spatial uniformity of residual
    residual_kurtosis_score: float # Statistical distribution of residual
    local_variance_score: float    # Local variance map consistency
    ensemble_score: float          # Weighted combination
    signals: dict                  # Human-readable signal descriptions
    noise_stats: dict              # Raw numerical stats for downstream layers


# ──────────────────────────────────────────────────────────────────
# Core Image Preparation
# ──────────────────────────────────────────────────────────────────

def load_and_prepare(image_path: str) -> tuple[np.ndarray, np.ndarray]:
    """
    Load image and return float RGB array and grayscale array.
    Normalises to [0, 1] range. Resizes if larger than 1024px.
    """
    img = Image.open(image_path).convert("RGB")

    max_dim = 1024
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    img_rgb  = np.array(img, dtype=np.float32) / 255.0
    img_gray = np.mean(img_rgb, axis=2)
    return img_rgb, img_gray


# ──────────────────────────────────────────────────────────────────
# Noise Residual Extraction
# ──────────────────────────────────────────────────────────────────

def extract_noise_residual(channel: np.ndarray,
                            filter_size: int = 3) -> np.ndarray:
    """
    Extract the noise residual from a single image channel.

    Formula:
        R = I - F(I)

    Where:
        I    = original image channel (float)
        F(I) = locally smoothed version (denoised estimate)
        R    = residual (the 'leftover' noise pattern)

    A uniform filter approximates the local scene content.
    What remains after subtracting it is the noise fingerprint.

    Parameters
    ----------
    channel     : 2D float array, single image channel
    filter_size : kernel size for the denoising filter

    Returns
    -------
    residual : 2D float array of the same shape as channel
    """
    smoothed = uniform_filter(channel, size=filter_size)
    residual = channel - smoothed
    return residual


def extract_multiscale_residual(channel: np.ndarray) -> np.ndarray:
    """
    Extract noise residual at multiple filter scales and average.

    Using multiple scales captures noise at different frequency bands,
    making the analysis more robust to image content variation.
    Scales 3, 5, 7 correspond to progressively larger local neighbourhoods.
    """
    residuals = []
    for size in [3, 5, 7]:
        r = extract_noise_residual(channel, filter_size=size)
        residuals.append(r)
    return np.mean(residuals, axis=0)


# ──────────────────────────────────────────────────────────────────
# Signal 1 — PRNU Structural Score
# ──────────────────────────────────────────────────────────────────

def compute_prnu_score(residuals_rgb: list[np.ndarray]) -> float:
    """
    Estimate the presence of structured Photo Response Non-Uniformity.

    Real cameras produce a fixed-pattern noise due to pixel-level
    manufacturing variations in the sensor. This PRNU pattern is
    consistent and spatially correlated across images from the same
    camera. AI generators produce residuals that are statistically
    random with no fixed spatial structure.

    We estimate structural PRNU presence by measuring:
    - Cross-channel correlation of residuals (PRNU affects all channels)
    - Spatial autocorrelation of the residual (structure vs pure noise)

    Returns a score 0.0–1.0 where HIGHER = more AI-like (less PRNU).
    """
    r, g, b = residuals_rgb

    # Cross-channel correlation
    # Real cameras: residuals across R, G, B are correlated (same sensor)
    # AI generators: residuals are independent or over-correlated
    rg_corr = float(np.corrcoef(r.flatten(), g.flatten())[0, 1])
    rb_corr = float(np.corrcoef(r.flatten(), b.flatten())[0, 1])
    gb_corr = float(np.corrcoef(g.flatten(), b.flatten())[0, 1])
    mean_cross_corr = np.mean([abs(rg_corr), abs(rb_corr), abs(gb_corr)])

    # Spatial autocorrelation of the grayscale residual
    # Real PRNU has spatial structure → autocorr at lag-1 should be nonzero
    gray_residual = np.mean(residuals_rgb, axis=0)
    h, w = gray_residual.shape

    # Lag-1 autocorrelation in horizontal direction
    flat = gray_residual.flatten()
    if np.std(flat) < 1e-10:
        return 0.5  # Degenerate case

    autocorr_h = float(np.corrcoef(gray_residual[:, :-1].flatten(),
                                    gray_residual[:, 1:].flatten())[0, 1])
    autocorr_v = float(np.corrcoef(gray_residual[:-1, :].flatten(),
                                    gray_residual[1:, :].flatten())[0, 1])

    mean_autocorr = np.mean([abs(autocorr_h), abs(autocorr_v)])

    # Real images: moderate cross-channel corr (0.3–0.7), nonzero autocorr
    # AI images: either very high or very low cross-channel corr;
    #            near-zero autocorr (pure random noise, no PRNU structure)

    # Score higher when autocorr is near zero (no PRNU structure → AI)
    autocorr_penalty = 1.0 - float(np.clip(mean_autocorr / 0.3, 0.0, 1.0))

    # Score higher when cross-channel corr is suspiciously high or low
    if mean_cross_corr > 0.80:
        corr_penalty = float(np.clip((mean_cross_corr - 0.80) / 0.20, 0.0, 1.0))
    elif mean_cross_corr < 0.05:
        corr_penalty = float(np.clip((0.05 - mean_cross_corr) / 0.05, 0.0, 1.0))
    else:
        corr_penalty = 0.0

    score = (autocorr_penalty * 0.65) + (corr_penalty * 0.35)
    return float(np.clip(score, 0.0, 1.0))


# ──────────────────────────────────────────────────────────────────
# Signal 2 — Noise Uniformity Score
# ──────────────────────────────────────────────────────────────────

def compute_noise_uniformity_score(residual: np.ndarray,
                                    block_size: int = 32) -> float:
    """
    Measure the spatial uniformity of residual noise variance.

    Real cameras have spatially varying noise — sensor corners are
    noisier than the centre, and different ISO regions produce
    different noise levels. This non-uniformity is a physical property
    of imaging hardware.

    AI generators produce residuals that are either:
    a) Too spatially uniform (same variance everywhere — too clean), or
    b) Block-structured (artifacts from the generator's attention layers)

    We measure the coefficient of variation of local block variances.

    Returns a score 0.0–1.0 where higher = more AI-like.
    """
    h, w = residual.shape
    n_blocks_h = h // block_size
    n_blocks_w = w // block_size

    if n_blocks_h < 2 or n_blocks_w < 2:
        return 0.0  # Image too small for block analysis

    block_variances = []
    for i in range(n_blocks_h):
        for j in range(n_blocks_w):
            block = residual[
                i*block_size:(i+1)*block_size,
                j*block_size:(j+1)*block_size
            ]
            block_variances.append(float(np.var(block)))

    block_variances = np.array(block_variances)
    mean_var = float(np.mean(block_variances))

    if mean_var < 1e-10:
        return 0.8  # Near-zero variance everywhere → suspiciously clean

    cv = float(np.std(block_variances) / (mean_var + 1e-8))

    # Natural images: moderate CV (0.3–1.0)
    # Too uniform (CV < 0.15): AI-generated (synthetic, clean noise)
    # Too structured (CV > 2.0): AI artifact blocks

    if cv < 0.15:
        # Suspiciously uniform
        score = float(np.clip((0.15 - cv) / 0.15, 0.0, 1.0))
    elif cv > 2.0:
        # Suspiciously block-structured
        score = float(np.clip((cv - 2.0) / 2.0, 0.0, 1.0))
    else:
        score = 0.0

    return float(np.clip(score, 0.0, 1.0))


# ──────────────────────────────────────────────────────────────────
# Signal 3 — Residual Kurtosis Score
# ──────────────────────────────────────────────────────────────────

def compute_residual_kurtosis_score(residual: np.ndarray) -> float:
    """
    Analyse the statistical distribution of the noise residual.

    The residual from a real image follows a near-Laplacian distribution
    — it is heavy-tailed (high kurtosis) because occasional large noise
    values appear from photon shot noise and readout noise. The kurtosis
    of real camera residuals typically falls between 3.0 and 8.0
    (excess kurtosis 0–5).

    AI-generated image residuals behave differently:
    - GAN residuals: often near-Gaussian (excess kurtosis ≈ 0–1) because
      the generator learned to produce smooth outputs
    - Diffusion residuals: can have very high kurtosis (>10) because the
      iterative denoising process leaves sparse high-frequency spikes

    We also check skewness — real residuals are nearly symmetric
    (skewness near 0). AI residuals can exhibit systematic skew.

    Returns a score 0.0–1.0 where higher = more AI-like.
    """
    flat = residual.flatten()

    if np.std(flat) < 1e-10:
        return 0.5

    kurt  = float(kurtosis(flat, fisher=True))   # Excess kurtosis (0 = Gaussian)
    skewness = float(abs(skew(flat)))

    # Natural camera residuals: excess kurtosis 0–5, |skew| < 0.5
    # Too low kurtosis (< 0): over-smooth, too Gaussian → AI (GAN)
    # Too high kurtosis (> 8): over-sparse → AI (diffusion artifacts)
    # High skewness: systematic bias → AI

    if kurt < 1.5:
        kurt_score = float(np.clip((1.5 - kurt) / 2.5, 0.0, 1.0))
    elif kurt > 8.0:
        kurt_score = float(np.clip((kurt - 8.0) / 10.0, 0.0, 1.0))
    else:
        kurt_score = 0.0

    skew_score = float(np.clip((skewness - 0.5) / 1.5, 0.0, 1.0))

    score = (kurt_score * 0.70) + (skew_score * 0.30)
    return float(np.clip(score, 0.0, 1.0))


# ──────────────────────────────────────────────────────────────────
# Signal 4 — Local Variance Map Consistency
# ──────────────────────────────────────────────────────────────────

def compute_local_variance_score(img_gray: np.ndarray,
                                  residual: np.ndarray,
                                  block_size: int = 16) -> float:
    """
    Check whether local noise variance correlates correctly with
    local image brightness — a property of real camera noise.

    In real cameras, shot noise follows Poisson statistics: brighter
    regions have more photons and therefore more noise (higher local
    variance in the residual). This produces a positive correlation
    between local image intensity and local residual variance.

    AI generators do not model Poisson noise. Their residuals show
    no brightness-dependent variance structure — or the opposite
    pattern entirely.

    Returns a score 0.0–1.0 where higher = more AI-like.
    """
    h, w = img_gray.shape
    n_bh = h // block_size
    n_bw = w // block_size

    if n_bh < 3 or n_bw < 3:
        return 0.0

    local_means    = []
    local_res_vars = []

    for i in range(n_bh):
        for j in range(n_bw):
            blk_img = img_gray[
                i*block_size:(i+1)*block_size,
                j*block_size:(j+1)*block_size
            ]
            blk_res = residual[
                i*block_size:(i+1)*block_size,
                j*block_size:(j+1)*block_size
            ]
            local_means.append(float(np.mean(blk_img)))
            local_res_vars.append(float(np.var(blk_res)))

    local_means    = np.array(local_means)
    local_res_vars = np.array(local_res_vars)

    if np.std(local_means) < 1e-8 or np.std(local_res_vars) < 1e-8:
        return 0.5

    # Correlation between image brightness and residual variance
    corr = float(np.corrcoef(local_means, local_res_vars)[0, 1])

    # Real images: positive correlation (0.2–0.8) — brighter = noisier
    # AI images: near-zero or negative correlation

    if corr < 0.1:
        # Low or negative: missing Poisson noise structure → AI
        score = float(np.clip((0.1 - corr) / 1.1, 0.0, 1.0))
    else:
        score = 0.0

    return float(np.clip(score, 0.0, 1.0))


# ──────────────────────────────────────────────────────────────────
# Ensemble Scoring & Verdict
# ──────────────────────────────────────────────────────────────────

WEIGHTS = {
    "prnu":            0.35,   # Strongest universal indicator
    "uniformity":      0.25,   # Spatial structure of noise
    "kurtosis":        0.25,   # Statistical distribution
    "local_variance":  0.15,   # Brightness-noise correlation
}

THRESHOLDS = {
    "ai_high":     0.50,
    "ai_medium":   0.30,
    "inconclusive": 0.20,
}


def compute_ensemble(scores: dict) -> float:
    return (
        scores["prnu"]           * WEIGHTS["prnu"]           +
        scores["uniformity"]     * WEIGHTS["uniformity"]     +
        scores["kurtosis"]       * WEIGHTS["kurtosis"]       +
        scores["local_variance"] * WEIGHTS["local_variance"]
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


def build_signals(scores: dict, stats: dict) -> dict:
    def level(s):
        if s >= 0.62: return "High"
        if s >= 0.35: return "Moderate"
        return "Low"

    return {
        "PRNU Structure":             f"{level(scores['prnu'])} ({scores['prnu']:.2f}) — Sensor noise spatial correlation",
        "Noise Uniformity":           f"{level(scores['uniformity'])} ({scores['uniformity']:.2f}) — Local variance spatial consistency",
        "Residual Kurtosis":          f"{level(scores['kurtosis'])} ({scores['kurtosis']:.2f}) — Noise distribution shape (kurt={stats['kurtosis']:.2f}, skew={stats['skewness']:.2f})",
        "Brightness-Noise Coupling":  f"{level(scores['local_variance'])} ({scores['local_variance']:.2f}) — Poisson noise correlation",
        "Ensemble Score":             f"{compute_ensemble(scores):.4f}",
    }


# ──────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────

def analyse(image_path: str) -> NoiseResidualResult:
    """
    Run Layer 2 Noise Residual Analysis on an image.

    Parameters
    ----------
    image_path : str
        Path to the image file (JPG, PNG, WEBP supported).

    Returns
    -------
    NoiseResidualResult
        Full result with scores, verdict, signals, and raw stats.

    Example
    -------
    >>> result = analyse("photo.jpg")
    >>> print(result.verdict, result.ai_probability)
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img_rgb, img_gray = load_and_prepare(image_path)

    # Extract multi-scale residuals for each channel
    residuals_rgb = [
        extract_multiscale_residual(img_rgb[:, :, c])
        for c in range(3)
    ]
    gray_residual = np.mean(residuals_rgb, axis=0)

    # Compute raw stats (passed to downstream layers)
    flat = gray_residual.flatten()
    raw_stats = {
        "mean":      float(np.mean(flat)),
        "std":       float(np.std(flat)),
        "kurtosis":  float(kurtosis(flat, fisher=True)),
        "skewness":  float(abs(skew(flat))),
        "min":       float(np.min(flat)),
        "max":       float(np.max(flat)),
    }

    scores = {
        "prnu":           compute_prnu_score(residuals_rgb),
        "uniformity":     compute_noise_uniformity_score(gray_residual),
        "kurtosis":       compute_residual_kurtosis_score(gray_residual),
        "local_variance": compute_local_variance_score(img_gray, gray_residual),
    }

    ensemble = compute_ensemble(scores)
    verdict, confidence, ai_prob = determine_verdict(ensemble)
    signals = build_signals(scores, raw_stats)

    return NoiseResidualResult(
        image_path=image_path,
        ai_probability=round(ai_prob, 4),
        verdict=verdict,
        confidence=confidence,
        prnu_score=round(scores["prnu"], 4),
        noise_uniformity_score=round(scores["uniformity"], 4),
        residual_kurtosis_score=round(scores["kurtosis"], 4),
        local_variance_score=round(scores["local_variance"], 4),
        ensemble_score=round(ensemble, 4),
        signals=signals,
        noise_stats=raw_stats,
    )


def print_result(result: NoiseResidualResult) -> None:
    """Pretty-print a NoiseResidualResult to the console."""
    print("\n" + "=" * 62)
    print("  GARBY — Layer 2: Noise Residual Analysis (PRNU)")
    print("=" * 62)
    print(f"  Image     : {os.path.basename(result.image_path)}")
    print(f"  Verdict   : {result.verdict}")
    print(f"  Confidence: {result.confidence}")
    print(f"  AI Score  : {result.ai_probability:.4f}  (0=Real, 1=AI)")
    print("-" * 62)
    print("  Detection Signals:")
    for name, desc in result.signals.items():
        print(f"    • {name}: {desc}")
    print("-" * 62)
    print("  Raw Noise Stats:")
    for k, v in result.noise_stats.items():
        print(f"    {k:12s}: {v:.6f}")
    print("=" * 62 + "\n")


# ──────────────────────────────────────────────────────────────────
# CLI Entry Point
# ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python garby_layer2_noise.py <image_path>")
        sys.exit(1)

    result = analyse(sys.argv[1])
    print_result(result)
