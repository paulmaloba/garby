"""
Garby Detection Engine — Layer 1: Frequency Domain Fingerprinting
=================================================================
Detects AI-generated images by analysing their spectral (frequency)
signature using 2D Fast Fourier Transform (FFT).

Author  : Garby Detection Team
Version : 1.0.0
"""

import numpy as np
from PIL import Image
import os
from dataclasses import dataclass
from typing import Optional


# ──────────────────────────────────────────────────────────────────
# Data Structures
# ──────────────────────────────────────────────────────────────────

@dataclass
class FrequencyAnalysisResult:
    """Holds all outputs from the Layer 1 frequency analysis."""
    image_path: str
    ai_probability: float          # 0.0 (real) → 1.0 (AI)
    verdict: str                   # "AI-Generated" | "Likely Real" | "Inconclusive"
    confidence: str                # "High" | "Medium" | "Low"
    checkerboard_score: float      # GAN artifact score
    spectral_falloff_score: float  # 1/f natural falloff deviation
    peak_irregularity_score: float # Unnatural frequency peaks
    channel_asymmetry_score: float # R/G/B channel spectral inconsistency
    ensemble_score: float          # Weighted combination of all scores
    signals: dict                  # Human-readable signal descriptions


# ──────────────────────────────────────────────────────────────────
# Core Analysis Functions
# ──────────────────────────────────────────────────────────────────

def load_and_prepare(image_path: str) -> tuple[np.ndarray, np.ndarray]:
    """
    Load image and return both grayscale and RGB float arrays.
    Resizes large images to max 1024px for consistent analysis.
    """
    img = Image.open(image_path).convert("RGB")

    # Normalise size for consistent spectral comparison
    max_dim = 1024
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    img_rgb = np.array(img, dtype=np.float32) / 255.0
    img_gray = np.mean(img_rgb, axis=2)
    return img_gray, img_rgb


def compute_2d_fft(channel: np.ndarray) -> np.ndarray:
    """
    Compute the 2D FFT magnitude spectrum of a single image channel.
    Returns the log-scaled magnitude, shifted so DC component is centred.
    """
    f = np.fft.fft2(channel)
    f_shifted = np.fft.fftshift(f)
    magnitude = np.abs(f_shifted)
    # Log scale to compress dynamic range (avoids DC spike dominating)
    log_magnitude = np.log1p(magnitude)
    return log_magnitude


def detect_checkerboard_artifacts(magnitude: np.ndarray) -> float:
    """
    Detect GAN-style checkerboard artifacts.

    Transposed convolution layers in GANs (used for upsampling) produce
    periodic energy spikes at regular frequency intervals — visually
    these appear as grid/checkerboard patterns in the FFT spectrum.

    Returns a score 0.0–1.0 where higher = more GAN-like artifacts.
    """
    h, w = magnitude.shape
    cy, cx = h // 2, w // 2

    # Sample energy at periodic intervals (every 1/4 of the spectrum)
    # These are the frequencies where GAN checkerboard appears
    quarter_y = h // 4
    quarter_x = w // 4

    # Corner quadrant energies (where GAN spikes appear)
    corners = [
        magnitude[cy - quarter_y, cx - quarter_x],
        magnitude[cy - quarter_y, cx + quarter_x],
        magnitude[cy + quarter_y, cx - quarter_x],
        magnitude[cy + quarter_y, cx + quarter_x],
    ]

    # Mid-band reference energy (should dominate in natural images)
    mid_band_region = magnitude[
        cy - quarter_y // 2: cy + quarter_y // 2,
        cx - quarter_x // 2: cx + quarter_x // 2
    ]
    mid_energy = np.mean(mid_band_region)

    corner_energy = np.mean(corners)

    if mid_energy == 0:
        return 0.0

    # High ratio means corners are unusually energised → GAN fingerprint
    ratio = corner_energy / (mid_energy + 1e-8)
    score = float(np.clip((ratio - 0.5) / 2.0, 0.0, 1.0))
    return score


def detect_spectral_falloff_deviation(magnitude: np.ndarray) -> float:
    """
    Measure deviation from the natural 1/f spectral falloff.

    In natural photographs, power spectral density follows a 1/f law —
    meaning energy decreases predictably as frequency increases.
    AI-generated images disrupt this natural law, producing either
    too-smooth or anomalously peaked mid-to-high frequency content.

    Returns a score 0.0–1.0 where higher = more deviation from natural 1/f.
    """
    h, w = magnitude.shape
    cy, cx = h // 2, w // 2

    # Compute radial average of the spectrum
    y_coords, x_coords = np.indices((h, w))
    r = np.sqrt((x_coords - cx) ** 2 + (y_coords - cy) ** 2).astype(int)

    max_r = min(cx, cy)
    radial_profile = np.zeros(max_r)
    counts = np.zeros(max_r)

    for radius in range(max_r):
        mask = r == radius
        if np.any(mask):
            radial_profile[radius] = np.mean(magnitude[mask])
            counts[radius] = np.sum(mask)

    # Avoid zero division
    radial_profile = radial_profile[1:]  # Skip DC component
    freqs = np.arange(1, len(radial_profile) + 1, dtype=np.float32)

    # Fit expected 1/f line in log-log space
    log_f = np.log(freqs + 1e-8)
    log_p = np.log(radial_profile + 1e-8)

    # Linear regression on log-log (ideal slope ≈ -1 to -2 for natural images)
    coeffs = np.polyfit(log_f, log_p, 1)
    slope = coeffs[0]

    # Compute residuals (how far actual profile deviates from fitted line)
    fitted = np.polyval(coeffs, log_f)
    residuals = np.abs(log_p - fitted)
    deviation = float(np.mean(residuals))

    # Natural images: slope in [-2.5, -0.5], low residuals
    # AI images: slope often outside this range or high residuals
    slope_penalty = float(np.clip(abs(slope + 1.5) / 2.0, 0.0, 1.0))
    residual_penalty = float(np.clip(deviation / 2.0, 0.0, 1.0))

    score = (slope_penalty * 0.4) + (residual_penalty * 0.6)
    return float(np.clip(score, 0.0, 1.0))


def detect_peak_irregularity(magnitude: np.ndarray) -> float:
    """
    Detect unnatural high-energy frequency peaks.

    AI generators, particularly diffusion models, produce images with
    overly structured mid-frequency content. This shows up as sharp,
    narrow peaks in the frequency spectrum that do not appear in
    photographs taken by real cameras.

    Returns a score 0.0–1.0 where higher = more suspicious peaks.
    """
    h, w = magnitude.shape
    cy, cx = h // 2, w // 2

    # Focus on mid-frequency ring (radius 10%–40% of spectrum)
    y_coords, x_coords = np.indices((h, w))
    r = np.sqrt((x_coords - cx) ** 2 + (y_coords - cy) ** 2)

    min_r = 0.10 * min(cx, cy)
    max_r = 0.40 * min(cx, cy)
    mid_mask = (r >= min_r) & (r <= max_r)

    mid_values = magnitude[mid_mask]
    if len(mid_values) == 0:
        return 0.0

    mean_val = np.mean(mid_values)
    std_val = np.std(mid_values)

    if mean_val == 0:
        return 0.0

    # Coefficient of variation — high CV = spiky, irregular spectrum
    cv = std_val / (mean_val + 1e-8)

    # Natural images have CV ≈ 0.3–0.8
    # AI images often exceed 1.0 due to structured artifacts
    score = float(np.clip((cv - 0.5) / 1.5, 0.0, 1.0))
    return score


def detect_channel_asymmetry(img_rgb: np.ndarray) -> float:
    """
    Detect spectral inconsistency across R, G, B channels.

    Real camera sensors apply different noise and response curves to
    each colour channel — this produces correlated but not identical
    spectra across channels. AI generators process channels more
    uniformly, or introduce synthetic inconsistencies.

    Returns a score 0.0–1.0 where higher = more suspicious asymmetry.
    """
    spectra = []
    for c in range(3):
        mag = compute_2d_fft(img_rgb[:, :, c])
        # Normalise each channel spectrum for comparison
        norm = (mag - mag.min()) / (mag.max() - mag.min() + 1e-8)
        spectra.append(norm.flatten())

    # Compute pairwise correlation between channel spectra
    rg_corr = np.corrcoef(spectra[0], spectra[1])[0, 1]
    rb_corr = np.corrcoef(spectra[0], spectra[2])[0, 1]
    gb_corr = np.corrcoef(spectra[1], spectra[2])[0, 1]

    mean_corr = np.mean([rg_corr, rb_corr, gb_corr])

    # Real images: moderate correlation (0.6–0.9)
    # AI images: either too high (>0.95, overly uniform) or too low
    if mean_corr > 0.95:
        # Suspiciously uniform — AI signature
        score = float(np.clip((mean_corr - 0.95) / 0.05, 0.0, 1.0))
    elif mean_corr < 0.4:
        # Suspiciously inconsistent
        score = float(np.clip((0.4 - mean_corr) / 0.4, 0.0, 1.0))
    else:
        score = 0.0

    return score


# ──────────────────────────────────────────────────────────────────
# Ensemble Scoring & Verdict
# ──────────────────────────────────────────────────────────────────

WEIGHTS = {
    "checkerboard":      0.30,   # Strong GAN indicator
    "spectral_falloff":  0.35,   # Best universal indicator
    "peak_irregularity": 0.25,   # Diffusion/GAN
    "channel_asymmetry": 0.10,   # Supporting signal
}

THRESHOLDS = {
    "ai_high":        0.65,   # Very likely AI
    "ai_medium":      0.45,   # Probably AI
    "inconclusive":   0.35,   # Uncertain
    # Below 0.35 → Likely Real
}


def compute_ensemble(scores: dict) -> float:
    """Compute weighted ensemble score from individual signal scores."""
    return (
        scores["checkerboard"]      * WEIGHTS["checkerboard"]      +
        scores["spectral_falloff"]  * WEIGHTS["spectral_falloff"]  +
        scores["peak_irregularity"] * WEIGHTS["peak_irregularity"] +
        scores["channel_asymmetry"] * WEIGHTS["channel_asymmetry"]
    )


def determine_verdict(ensemble: float) -> tuple[str, str, float]:
    """Return verdict, confidence label, and AI probability."""
    if ensemble >= THRESHOLDS["ai_high"]:
        return "AI-Generated", "High", ensemble
    elif ensemble >= THRESHOLDS["ai_medium"]:
        return "AI-Generated", "Medium", ensemble
    elif ensemble >= THRESHOLDS["inconclusive"]:
        return "Inconclusive", "Low", ensemble
    else:
        return "Likely Real", "High", ensemble


def build_signals(scores: dict, ensemble: float) -> dict:
    """Build human-readable signal descriptions for the result card."""
    def level(s):
        if s >= 0.65: return "High"
        if s >= 0.35: return "Moderate"
        return "Low"

    return {
        "Checkerboard Artifact":    f"{level(scores['checkerboard'])} ({scores['checkerboard']:.2f}) — Periodic GAN upsampling pattern",
        "Spectral 1/f Deviation":   f"{level(scores['spectral_falloff'])} ({scores['spectral_falloff']:.2f}) — Deviation from natural frequency falloff",
        "Peak Irregularity":        f"{level(scores['peak_irregularity'])} ({scores['peak_irregularity']:.2f}) — Unnatural mid-frequency spikes",
        "Channel Asymmetry":        f"{level(scores['channel_asymmetry'])} ({scores['channel_asymmetry']:.2f}) — R/G/B spectral inconsistency",
        "Ensemble Score":           f"{ensemble:.4f}",
    }


# ──────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────

def analyse(image_path: str) -> FrequencyAnalysisResult:
    """
    Run Layer 1 Frequency Domain Fingerprinting on an image.

    Parameters
    ----------
    image_path : str
        Path to the image file (JPG, PNG, WEBP supported).

    Returns
    -------
    FrequencyAnalysisResult
        Full result object with scores, verdict, and signals.

    Example
    -------
    >>> result = analyse("photo.jpg")
    >>> print(result.verdict, result.ai_probability)
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img_gray, img_rgb = load_and_prepare(image_path)
    magnitude = compute_2d_fft(img_gray)

    scores = {
        "checkerboard":      detect_checkerboard_artifacts(magnitude),
        "spectral_falloff":  detect_spectral_falloff_deviation(magnitude),
        "peak_irregularity": detect_peak_irregularity(magnitude),
        "channel_asymmetry": detect_channel_asymmetry(img_rgb),
    }

    ensemble = compute_ensemble(scores)
    verdict, confidence, ai_prob = determine_verdict(ensemble)
    signals = build_signals(scores, ensemble)

    return FrequencyAnalysisResult(
        image_path=image_path,
        ai_probability=round(ai_prob, 4),
        verdict=verdict,
        confidence=confidence,
        checkerboard_score=round(scores["checkerboard"], 4),
        spectral_falloff_score=round(scores["spectral_falloff"], 4),
        peak_irregularity_score=round(scores["peak_irregularity"], 4),
        channel_asymmetry_score=round(scores["channel_asymmetry"], 4),
        ensemble_score=round(ensemble, 4),
        signals=signals,
    )


def print_result(result: FrequencyAnalysisResult) -> None:
    """Pretty-print a FrequencyAnalysisResult to the console."""
    print("\n" + "=" * 60)
    print("  GARBY — Layer 1: Frequency Domain Analysis")
    print("=" * 60)
    print(f"  Image     : {os.path.basename(result.image_path)}")
    print(f"  Verdict   : {result.verdict}")
    print(f"  Confidence: {result.confidence}")
    print(f"  AI Score  : {result.ai_probability:.4f}  (0=Real, 1=AI)")
    print("-" * 60)
    print("  Detection Signals:")
    for name, desc in result.signals.items():
        print(f"    • {name}: {desc}")
    print("=" * 60 + "\n")


# ──────────────────────────────────────────────────────────────────
# CLI Entry Point
# ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python garby_layer1_frequency.py <image_path>")
        sys.exit(1)

    # image_path = sys.argv[1]
    image_path = sys.argv[1]
    result = analyse(image_path)
    print_result(result)

