"""
Garby Detection Engine - Layer 5: NPR + DWT Hybrid Analysis v2
Version 2.0.0 - Modern Generator Calibration

BIAS FIX:
  Original mae_score formula assumed AI images have LOW MAE.
  Modern diffusion models produce HIGH MAE (like real photos).
  Fix: replace mae dominance with hf_ratio + multi-scale variance.
"""

import numpy as np
from PIL import Image
import os
from dataclasses import dataclass, field
from scipy.ndimage import zoom, uniform_filter


@dataclass
class NPRDWTResult:
    image_path: str
    ai_probability: float
    verdict: str
    confidence: str
    npr_score: float
    dwt_hh_score: float
    dwt_cross_scale_score: float
    upsampling_artifact_score: float
    ensemble_score: float
    signals: dict
    raw_stats: dict = field(default_factory=dict)


def load_and_prepare(image_path):
    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if max(w, h) > 1024:
        scale = 1024 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img_rgb  = np.array(img, dtype=np.float32) / 255.0
    img_gray = np.mean(img_rgb, axis=2)
    return img_rgb, img_gray


def compute_npr_score(img_gray):
    """
    NPR v2: HF-ratio dominant (reliable across all generator types).
    
    Key insight: Real photos have significant LF content in the NPR residual
    because natural scenes have smooth regions that survive bilinear round-trip.
    Modern AI images have trained to maximize HF everywhere, making the residual
    almost entirely HF (hf_ratio -> 1.0). This is a robust AI indicator.
    
    Original mae_score REMOVED - inverted for photorealistic generators.
    """
    h, w = img_gray.shape
    if h < 16 or w < 16:
        return 0.0, {}

    stats = {}

    # Scale 0.5 residual
    small         = zoom(img_gray, 0.5, order=1)
    reconstructed = zoom(small, 2.0, order=1)
    rh, rw        = reconstructed.shape
    reconstructed = reconstructed[:min(h,rh), :min(w,rw)]
    orig_crop     = img_gray[:min(h,rh), :min(w,rw)]
    residual      = orig_crop - reconstructed

    # HF ratio (primary signal)
    res_smooth  = uniform_filter(residual, size=5)
    hf_residual = residual - res_smooth
    hf_energy   = float(np.mean(hf_residual ** 2))
    total_energy= float(np.mean(residual ** 2)) + 1e-10
    hf_ratio    = hf_energy / total_energy
    stats['npr_hf_ratio'] = round(hf_ratio, 4)

    # Real: hf_ratio 0.20-0.65. Modern AI: hf_ratio 0.75-1.00
    hf_score = float(np.clip((hf_ratio - 0.60) / 0.30, 0.0, 1.0))
    stats['npr_hf_score'] = round(hf_score, 4)

    # Autocorrelation (supporting signal)
    flat_res  = residual.flatten()
    lag2_corr = 0.0
    if len(flat_res) > 4:
        lag2_corr = float(np.corrcoef(flat_res[:-2], flat_res[2:])[0, 1])
    stats['npr_lag2_corr'] = round(lag2_corr, 4)
    autocorr_score = float(np.clip((abs(lag2_corr) - 0.05) / 0.40, 0.0, 1.0))
    stats['npr_autocorr_score'] = round(autocorr_score, 4)

    # Multi-scale residual energy variance (new in v2)
    residual_energies = []
    for scale in [0.5, 0.25, 0.125]:
        if min(h, w) * scale < 8:
            continue
        try:
            s   = zoom(img_gray, scale, order=1)
            r   = zoom(s, 1.0/scale, order=1)
            rh2, rw2 = r.shape
            res = img_gray[:min(h,rh2), :min(w,rw2)] - r[:min(h,rh2), :min(w,rw2)]
            residual_energies.append(float(np.mean(res**2)))
        except Exception:
            continue

    multiscale_score = 0.0
    if len(residual_energies) >= 2:
        energies = np.array(residual_energies)
        cv       = float(np.std(energies) / (np.mean(energies) + 1e-10))
        # Real photos: energy drops at coarser scales (high CV)
        # AI images: more uniform energy across scales (low CV)
        multiscale_score = float(np.clip((0.8 - cv) / 0.8, 0.0, 1.0))
    stats['npr_multiscale_score'] = round(multiscale_score, 4)

    # v2 weights: hf_ratio dominant (0.55), autocorr (0.20), multiscale (0.25)
    combined = hf_score * 0.55 + autocorr_score * 0.20 + multiscale_score * 0.25
    return float(np.clip(combined, 0.0, 1.0)), stats


def haar_dwt2d(img):
    h, w = img.shape
    if h % 2 != 0: img = img[:-1, :]
    if w % 2 != 0: img = img[:, :-1]
    L  = (img[:, 0::2] + img[:, 1::2]) / 2.0
    H  = (img[:, 0::2] - img[:, 1::2]) / 2.0
    LL = (L[0::2, :] + L[1::2, :]) / 2.0
    LH = (L[0::2, :] - L[1::2, :]) / 2.0
    HL = (H[0::2, :] + H[1::2, :]) / 2.0
    HH = (H[0::2, :] - H[1::2, :]) / 2.0
    return LL, LH, HL, HH


def haar_wavedec2(img, level=3):
    result = []
    current = img.copy()
    for _ in range(level):
        LL, LH, HL, HH = haar_dwt2d(current)
        result.append((LH, HL, HH))
        current = LL
    result.append(current)
    result.reverse()
    cA = result[0]
    details = result[1:]
    return [cA] + details


def compute_dwt_hh_score(img_gray):
    """
    DWT HH v2: kurtosis lower bound lowered from 1.0 to 1.5.
    Modern AI residuals have sub-Gaussian kurtosis (0.0-1.5) which was
    previously NOT flagged (threshold was < 1.0 only).
    """
    scores = []
    stats  = {}
    try:
        coeffs        = haar_wavedec2(img_gray, level=3)
        cA            = coeffs[0]
        detail_levels = coeffs[1:]
        ll_energy     = float(np.mean(cA**2)) + 1e-10

        for level_idx, (cH, cV, cD) in enumerate(detail_levels):
            level     = level_idx + 1
            hh_energy = float(np.mean(cD**2))
            hh_ratio  = hh_energy / ll_energy
            hh_flat   = cD.flatten()
            hh_std    = float(np.std(hh_flat))
            hh_kurt   = float(np.mean((hh_flat / (hh_std + 1e-8))**4)) - 3.0

            stats[f"hh_energy_ratio_L{level}"] = round(hh_ratio, 6)
            stats[f"hh_kurtosis_L{level}"]     = round(hh_kurt, 4)

            # v2: flag when kurt < 1.5 (was < 1.0)
            if hh_kurt < 1.5:
                scores.append(float(np.clip((1.5 - hh_kurt) / 2.5, 0.0, 1.0)))
            elif hh_kurt > 12.0:
                scores.append(float(np.clip((hh_kurt - 12.0) / 10.0, 0.0, 1.0)))
            else:
                scores.append(0.0)

            if level == 1:
                if hh_ratio < 0.0005:
                    scores.append(float(np.clip((0.0005 - hh_ratio) / 0.0005, 0.0, 1.0)))
                elif hh_ratio > 0.04:
                    scores.append(float(np.clip((hh_ratio - 0.04) / 0.04, 0.0, 1.0)))
                else:
                    scores.append(0.0)

        score = float(np.clip(np.mean(scores), 0.0, 1.0)) if scores else 0.0
    except Exception as e:
        score = 0.0
        stats["dwt_error"] = str(e)
    return score, stats


def compute_dwt_cross_scale_score(img_gray):
    """v2: upper ratio threshold lowered from 0.85 to 0.75 for sensitivity."""
    try:
        coeffs        = haar_wavedec2(img_gray, level=3)
        detail_levels = coeffs[1:]
        hh_energies   = [float(np.mean(cD**2)) + 1e-12 for _, _, cD in detail_levels]
        ratios        = [hh_energies[i+1]/hh_energies[i] for i in range(len(hh_energies)-1)]
        if not ratios:
            return 0.0, {}
        scores = []
        for r in ratios:
            if r < 0.05:
                scores.append(float(np.clip((0.05 - r) / 0.05, 0.0, 1.0)))
            elif r > 0.82:
                scores.append(float(np.clip((r - 0.82) / 0.20, 0.0, 1.0)))
            else:
                scores.append(0.0)
        score = float(np.clip(np.mean(scores), 0.0, 1.0))
        stats = {"hh_energies": [round(e,8) for e in hh_energies], "scale_ratios": [round(r,4) for r in ratios]}
        return score, stats
    except Exception:
        return 0.0, {}


def compute_upsampling_artifact_score(img_gray):
    h, w = img_gray.shape
    f        = np.fft.fft2(img_gray - np.mean(img_gray))
    power    = np.abs(f)**2
    autocorr = np.fft.ifft2(power).real
    autocorr = np.fft.fftshift(autocorr)
    autocorr /= autocorr.max() + 1e-10
    cy, cx   = h//2, w//2
    peak_scores, baseline_scores = [], []
    for period in [2, 4, 8, 16]:
        if period >= min(cx, cy): continue
        peak_val = float(np.mean([autocorr[cy, cx+period], autocorr[cy, cx-period],
                                   autocorr[cy+period, cx], autocorr[cy-period, cx]]))
        offsets  = [o for o in [period-1, period+1] if 0 < o < min(cx,cy)]
        baseline = float(np.mean([autocorr[cy, cx+o] for o in offsets])) if offsets else 0.0
        peak_scores.append(peak_val); baseline_scores.append(baseline)
    if not peak_scores: return 0.0, {}
    mean_peak     = float(np.mean(peak_scores))
    mean_baseline = float(np.mean(baseline_scores))
    ratio = mean_peak / (mean_baseline + 1e-8)
    score = float(np.clip((ratio - 1.2) / 2.0, 0.0, 1.0)) if mean_baseline > 1e-6 else float(np.clip(mean_peak/0.3, 0.0, 1.0))
    return float(np.clip(score, 0.0, 1.0)), {"upsampling_mean_peak": round(mean_peak,4), "upsampling_mean_baseline": round(mean_baseline,4), "upsampling_ratio": round(ratio,4)}


# v2 weights: NPR reduced (0.45->0.25), DWT HH increased (0.30->0.35), cross-scale increased (0.15->0.25)
WEIGHTS = {"npr": 0.25, "dwt_hh": 0.35, "dwt_cross_scale": 0.25, "upsampling": 0.15}
# v2 thresholds: lowered for modern generator sensitivity
THRESHOLDS = {"ai_high": 0.48, "ai_medium": 0.32, "inconclusive": 0.22}


def compute_ensemble(scores):
    return sum(scores[k] * WEIGHTS[k] for k in WEIGHTS)


def determine_verdict(ensemble):
    if ensemble >= THRESHOLDS["ai_high"]:   return "AI-Generated", "High",  ensemble
    elif ensemble >= THRESHOLDS["ai_medium"]: return "AI-Generated", "Medium", ensemble
    elif ensemble >= THRESHOLDS["inconclusive"]: return "Inconclusive", "Low", ensemble
    else: return "Likely Real", "High", ensemble


def build_signals(scores, raw):
    def level(s):
        if s >= 0.48: return "High"
        if s >= 0.28: return "Moderate"
        return "Low"
    npr_hf = raw.get("npr_hf_ratio", 0)
    return {
        "NPR HF Residual Ratio":     f"{level(scores['npr'])} ({scores['npr']:.2f}) — HF ratio={npr_hf:.4f}",
        "DWT HH Subband Kurtosis":   f"{level(scores['dwt_hh'])} ({scores['dwt_hh']:.2f}) — Diagonal detail distribution",
        "DWT Cross-Scale Decay":     f"{level(scores['dwt_cross_scale'])} ({scores['dwt_cross_scale']:.2f}) — Wavelet energy scale consistency",
        "Upsampling Grid Artifacts": f"{level(scores['upsampling'])} ({scores['upsampling']:.2f}) — Periodic grid pattern",
        "Ensemble Score":            f"{compute_ensemble(scores):.4f}",
    }


def analyse(image_path):
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")
    img_rgb, img_gray = load_and_prepare(image_path)
    npr_score, npr_stats = compute_npr_score(img_gray)
    hh_score,  hh_stats  = compute_dwt_hh_score(img_gray)
    cs_score,  cs_stats  = compute_dwt_cross_scale_score(img_gray)
    up_score,  up_stats  = compute_upsampling_artifact_score(img_gray)
    scores    = {"npr": npr_score, "dwt_hh": hh_score, "dwt_cross_scale": cs_score, "upsampling": up_score}
    raw_stats = {**npr_stats, **hh_stats, **cs_stats, **up_stats}
    ensemble  = compute_ensemble(scores)
    verdict, confidence, ai_prob = determine_verdict(ensemble)
    signals   = build_signals(scores, npr_stats)
    return NPRDWTResult(
        image_path=image_path, ai_probability=round(ai_prob,4),
        verdict=verdict, confidence=confidence,
        npr_score=round(npr_score,4), dwt_hh_score=round(hh_score,4),
        dwt_cross_scale_score=round(cs_score,4), upsampling_artifact_score=round(up_score,4),
        ensemble_score=round(ensemble,4), signals=signals, raw_stats=raw_stats,
    )


def print_result(result):
    print(f"\n{'='*62}\n  GARBY — Layer 5 v2: NPR+DWT (Modern Generator Calibration)\n{'='*62}")
    print(f"  Image     : {os.path.basename(result.image_path)}")
    print(f"  Verdict   : {result.verdict}")
    print(f"  Confidence: {result.confidence}")
    print(f"  AI Score  : {result.ai_probability:.4f}  (0=Real, 1=AI)")
    print(f"{'-'*62}")
    for name, desc in result.signals.items():
        print(f"    • {name}: {desc}")
    print(f"{'='*62}\n")


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python garby_layer5_nprdwt.py <image_path>")
        sys.exit(1)
    print_result(analyse(sys.argv[1]))
