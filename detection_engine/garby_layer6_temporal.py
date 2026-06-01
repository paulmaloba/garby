"""
Garby Detection Engine — Layer 6: Temporal Consistency Analysis
===============================================================
Detects AI-generated videos by analysing relationships BETWEEN frames.

6 temporal signals:
  1. Frame Difference Entropy     — structured vs noisy differences
  2. Background Pixel Drift       — static region consistency
  3. Temporal Self-Similarity     — frame coherence structure
  4. Optical Flow Residuals       — motion physics (requires opencv-python)
  5. Skin Region Flicker          — biological texture consistency
  6. Edge Boundary Stability      — boundary flicker in static regions

Research basis: DeCof CVPR2024, ATSS 2025, Physics-Driven Spatiotemporal 2025

Author  : Garby Detection Team
Version : 1.0.0
"""

import numpy as np
from PIL import Image
import os
import warnings
from dataclasses import dataclass, field
from scipy.stats import entropy as scipy_entropy
from scipy.ndimage import sobel as scipy_sobel, uniform_filter

warnings.filterwarnings('ignore')


@dataclass
class TemporalAnalysisResult:
    frame_paths:               list
    n_frames:                  int
    ai_probability:            float
    verdict:                   str
    confidence:                str
    frame_diff_entropy_score:  float
    background_drift_score:    float
    self_similarity_score:     float
    optical_flow_score:        float
    skin_flicker_score:        float
    edge_stability_score:      float
    ensemble_score:            float
    signals:                   dict
    raw_stats:                 dict = field(default_factory=dict)
    optical_flow_available:    bool = False


def load_frames(frame_paths, max_dim=256):
    rgb_frames, gray_frames = [], []
    for path in frame_paths:
        if not os.path.exists(path):
            continue
        try:
            img = Image.open(path).convert("RGB")
            w, h = img.size
            if max(w, h) > max_dim:
                scale = max_dim / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            rgb  = np.array(img, dtype=np.float32) / 255.0
            gray = np.mean(rgb, axis=2)
            rgb_frames.append(rgb)
            gray_frames.append(gray)
        except Exception:
            continue
    return rgb_frames, gray_frames


# ── Signal 1: Frame Difference Entropy ─────────────────────────────────────────

def compute_frame_diff_entropy(gray_frames):
    if len(gray_frames) < 3:
        return 0.0, {}

    entropies, mean_diffs = [], []
    for i in range(1, len(gray_frames)):
        diff = np.abs(gray_frames[i] - gray_frames[i-1])
        mean_diffs.append(float(np.mean(diff)))
        hist, _ = np.histogram(diff.flatten(), bins=32, range=(0,1), density=False)
        hist = hist.astype(float) + 1e-10
        hist /= hist.sum()
        entropies.append(float(scipy_entropy(hist)))

    mean_ent = float(np.mean(entropies))
    cv_diff  = float(np.std(mean_diffs) / (np.mean(mean_diffs) + 1e-8))

    # Low entropy → AI (unstructured differences)
    ent_score = float(np.clip((2.5 - mean_ent) / 2.5, 0.0, 1.0))
    # Low CV → AI (too-uniform frame changes)
    cv_score  = float(np.clip((0.5 - cv_diff)  / 0.5,  0.0, 1.0))
    score     = ent_score * 0.55 + cv_score * 0.45

    return float(np.clip(score, 0.0, 1.0)), {
        "mean_frame_diff_entropy": round(mean_ent, 4),
        "mean_diff_cv":            round(cv_diff, 4),
    }


# ── Signal 2: Background Pixel Drift ───────────────────────────────────────────

def compute_background_drift(gray_frames, rgb_frames):
    if len(gray_frames) < 4:
        return 0.0, {}

    h, w    = gray_frames[0].shape
    csz     = max(h // 8, 8)

    drifts = []
    for corner in [
        [f[:csz, :csz] for f in gray_frames],
        [f[:csz, -csz:] for f in gray_frames],
        [f[-csz:, :csz] for f in gray_frames],
        [f[-csz:, -csz:] for f in gray_frames],
    ]:
        means = [float(np.mean(p)) for p in corner]
        drifts.append(float(np.var(means)))

    ew = max(w // 16, 4)
    left_drift  = float(np.var([float(np.mean(f[:, :ew]))  for f in gray_frames]))
    right_drift = float(np.var([float(np.mean(f[:, -ew:])) for f in gray_frames]))

    combined = (float(np.mean(drifts)) + (left_drift + right_drift) / 2) / 2
    score    = float(np.clip((combined - 0.0002) / 0.0030, 0.0, 1.0))

    return score, {"combined_background_drift": round(combined, 6)}


# ── Signal 3: Temporal Self-Similarity ─────────────────────────────────────────

def compute_self_similarity(gray_frames):
    if len(gray_frames) < 4:
        return 0.0, {}

    small = []
    for f in gray_frames:
        try:
            pil  = Image.fromarray((f * 255).astype(np.uint8))
            s    = np.array(pil.resize((32, 32), Image.LANCZOS), dtype=np.float32) / 255.0
            flat = s.flatten()
            norm = np.linalg.norm(flat) + 1e-8
            small.append(flat / norm)
        except Exception:
            continue

    n = len(small)
    if n < 4:
        return 0.0, {}

    sim_matrix = np.array([[float(np.dot(small[i], small[j])) for j in range(n)] for i in range(n)])
    off_diag   = sim_matrix[~np.eye(n, dtype=bool)]
    mean_sim   = float(np.mean(off_diag))
    std_sim    = float(np.std(off_diag))

    lags, lag_sims = [], []
    for lag in range(1, n):
        vs = [sim_matrix[i, i+lag] for i in range(n-lag)]
        lags.append(lag); lag_sims.append(float(np.mean(vs)))

    decay_slope, decay_r2 = 0.0, 0.0
    if len(lags) >= 3:
        coeffs       = np.polyfit(lags, lag_sims, 1)
        decay_slope  = float(coeffs[0])
        decay_r2     = float(np.corrcoef(lags, lag_sims)[0,1] ** 2)

    scores = []
    if mean_sim > 0.92:
        scores.append(float(np.clip((mean_sim - 0.92) / 0.08, 0.0, 1.0)))
    elif std_sim < 0.03:
        scores.append(float(np.clip((0.03 - std_sim) / 0.03, 0.0, 1.0)))
    else:
        scores.append(0.0)

    scores.append(float(np.clip((0.005 - abs(decay_slope)) / 0.005, 0.0, 1.0)) if abs(decay_slope) < 0.005 else 0.0)
    scores.append(float(np.clip((0.4 - decay_r2) / 0.4, 0.0, 1.0)) if decay_r2 < 0.4 else 0.0)

    return float(np.clip(float(np.mean(scores)), 0.0, 1.0)), {
        "mean_frame_similarity": round(mean_sim, 4),
        "std_frame_similarity":  round(std_sim, 4),
        "decay_slope":           round(decay_slope, 6),
        "decay_r2":              round(decay_r2, 4),
    }


# ── Signal 4: Optical Flow Residuals ───────────────────────────────────────────

def compute_optical_flow_residuals(gray_frames):
    try:
        import cv2
    except ImportError:
        return 0.0, {"opencv_available": False}, False

    if len(gray_frames) < 4:
        return 0.0, {}, True

    def u8(f): return (np.clip(f, 0, 1) * 255).astype(np.uint8)

    flows = []
    for i in range(1, len(gray_frames)):
        try:
            flow = cv2.calcOpticalFlowFarneback(
                u8(gray_frames[i-1]), u8(gray_frames[i]), None,
                0.5, 3, 15, 3, 5, 1.2, 0)
            flows.append(flow)
        except Exception:
            continue

    if len(flows) < 3:
        return 0.0, {}, True

    residuals = [float(np.mean(np.sqrt(np.sum((flows[i]-flows[i-1])**2, axis=2))))
                 for i in range(1, len(flows))]

    mean_res = float(np.mean(residuals))
    cv_res   = float(np.std(residuals) / (mean_res + 1e-8))
    score    = float(np.clip((mean_res - 0.5) / 2.5, 0.0, 1.0)) * 0.60 + \
               float(np.clip((cv_res - 0.8) / 1.5, 0.0, 1.0)) * 0.40

    return float(np.clip(score, 0.0, 1.0)), {
        "mean_flow_residual": round(mean_res, 4),
        "flow_residual_cv":   round(cv_res, 4),
    }, True


# ── Signal 5: Skin Region Flicker ──────────────────────────────────────────────

def compute_skin_flicker(rgb_frames):
    if len(rgb_frames) < 3:
        return 0.0, {}

    skin_v_means = []

    for rgb in rgb_frames:
        r, g, b = rgb[...,0], rgb[...,1], rgb[...,2]
        maxc  = np.maximum(np.maximum(r,g), b)
        minc  = np.minimum(np.minimum(r,g), b)
        v     = maxc
        delta = maxc - minc + 1e-8
        s     = np.where(maxc > 0.01, delta/maxc, 0.0)
        h     = np.zeros_like(r)
        mr, mg, mb = (maxc==r), (maxc==g), (maxc==b)
        h[mr] = ((g-b)[mr] / delta[mr]) % 6
        h[mg] = (b-r)[mg] / delta[mg] + 2
        h[mb] = (r-g)[mb] / delta[mb] + 4
        h     = (h / 6.0) % 1.0

        skin = (h < 0.07) & (s > 0.15) & (s < 0.85) & (v > 0.20) & (v < 0.95)
        if float(np.mean(skin)) > 0.02:
            skin_v_means.append(float(np.mean(v[skin])))

    if len(skin_v_means) < 3:
        return 0.0, {"skin_detected": False}

    var_v = float(np.var(skin_v_means))
    score = float(np.clip((var_v - 0.0005) / 0.0030, 0.0, 1.0))
    return score, {"skin_detected": True, "skin_var_val": round(var_v, 6)}


# ── Signal 6: Edge Boundary Stability ──────────────────────────────────────────

def compute_edge_stability(gray_frames):
    if len(gray_frames) < 3:
        return 0.0, {}

    edge_maps = []
    for f in gray_frames:
        gx = scipy_sobel(f, axis=1)
        gy = scipy_sobel(f, axis=0)
        edge_maps.append(np.sqrt(gx**2 + gy**2))

    stack    = np.stack(edge_maps, axis=0)
    pv       = np.var(stack, axis=0)
    static   = pv < np.percentile(pv, 70)

    if np.sum(static) < 100:
        return 0.0, {}

    sev   = float(np.mean(np.var(stack[:, static], axis=0)))
    score = float(np.clip((sev - 0.0010) / 0.0040, 0.0, 1.0))
    return score, {"static_edge_variance": round(sev, 6)}


# ── Ensemble & Verdict ──────────────────────────────────────────────────────────

WEIGHTS = {
    "frame_diff_entropy": 0.20,
    "background_drift":   0.20,
    "self_similarity":    0.20,
    "optical_flow":       0.15,
    "skin_flicker":       0.15,
    "edge_stability":     0.10,
}
WEIGHTS_NO_FLOW = {
    "frame_diff_entropy": 0.25,
    "background_drift":   0.25,
    "self_similarity":    0.25,
    "optical_flow":       0.00,
    "skin_flicker":       0.15,
    "edge_stability":     0.10,
}
THRESHOLDS = {"ai_high": 0.52, "ai_medium": 0.38, "inconclusive": 0.25}


def compute_ensemble(scores, has_flow):
    w = WEIGHTS if has_flow else WEIGHTS_NO_FLOW
    return sum(scores.get(k, 0) * w[k] for k in w)


def determine_verdict(ens):
    if ens >= THRESHOLDS["ai_high"]:
        return "AI-Generated", "High" if ens > 0.68 else "Medium"
    elif ens >= THRESHOLDS["ai_medium"]:
        return "AI-Generated", "Low"
    elif ens >= THRESHOLDS["inconclusive"]:
        return "Inconclusive", "Low"
    else:
        return "Likely Real", "High" if ens < 0.15 else "Medium"


def build_signals(scores, has_flow, n):
    def lv(s): return "High" if s >= 0.52 else "Moderate" if s >= 0.30 else "Low"
    return {
        "Frame Diff Entropy":     f"{lv(scores['frame_diff_entropy'])} ({scores['frame_diff_entropy']:.3f}) — structured vs noisy differences",
        "Background Drift":       f"{lv(scores['background_drift'])} ({scores['background_drift']:.3f}) — static region pixel drift",
        "Temporal Self-Sim":      f"{lv(scores['self_similarity'])} ({scores['self_similarity']:.3f}) — coherence structure",
        "Optical Flow Residuals": f"{lv(scores['optical_flow'])} ({scores['optical_flow']:.3f}){'' if has_flow else ' [needs opencv-python]'}",
        "Skin Flicker":           f"{lv(scores['skin_flicker'])} ({scores['skin_flicker']:.3f}) — skin temporal variance",
        "Edge Stability":         f"{lv(scores['edge_stability'])} ({scores['edge_stability']:.3f}) — boundary flicker in static regions",
        "Frames Analysed":        f"{n}",
    }


# ── Public API ──────────────────────────────────────────────────────────────────

def analyse(frame_paths: list) -> TemporalAnalysisResult:
    if len(frame_paths) < 3:
        return TemporalAnalysisResult(
            frame_paths=frame_paths, n_frames=len(frame_paths),
            ai_probability=0.5, verdict="Inconclusive", confidence="Low",
            frame_diff_entropy_score=0.0, background_drift_score=0.0,
            self_similarity_score=0.0, optical_flow_score=0.0,
            skin_flicker_score=0.0, edge_stability_score=0.0,
            ensemble_score=0.5, signals={"Error": "Need >= 3 frames"},
        )

    rgb_frames, gray_frames = load_frames(frame_paths)
    n = len(gray_frames)
    if n < 3:
        return TemporalAnalysisResult(
            frame_paths=frame_paths, n_frames=n,
            ai_probability=0.5, verdict="Inconclusive", confidence="Low",
            frame_diff_entropy_score=0.0, background_drift_score=0.0,
            self_similarity_score=0.0, optical_flow_score=0.0,
            skin_flicker_score=0.0, edge_stability_score=0.0,
            ensemble_score=0.5, signals={"Error": f"Only {n} frames loaded"},
        )

    s1, st1 = compute_frame_diff_entropy(gray_frames)
    s2, st2 = compute_background_drift(gray_frames, rgb_frames)
    s3, st3 = compute_self_similarity(gray_frames)
    s4, st4, has_flow = compute_optical_flow_residuals(gray_frames)
    s5, st5 = compute_skin_flicker(rgb_frames)
    s6, st6 = compute_edge_stability(gray_frames)

    scores   = {"frame_diff_entropy": s1, "background_drift": s2,
                "self_similarity": s3, "optical_flow": s4,
                "skin_flicker": s5, "edge_stability": s6}
    ensemble = compute_ensemble(scores, has_flow)
    verdict, confidence = determine_verdict(ensemble)

    return TemporalAnalysisResult(
        frame_paths=frame_paths, n_frames=n,
        ai_probability=round(ensemble, 4),
        verdict=verdict, confidence=confidence,
        frame_diff_entropy_score=round(s1, 4),
        background_drift_score=round(s2, 4),
        self_similarity_score=round(s3, 4),
        optical_flow_score=round(s4, 4),
        skin_flicker_score=round(s5, 4),
        edge_stability_score=round(s6, 4),
        ensemble_score=round(ensemble, 4),
        signals=build_signals(scores, has_flow, n),
        raw_stats={**st1, **st2, **st3, **st4, **st5, **st6},
        optical_flow_available=has_flow,
    )


def print_result(r: TemporalAnalysisResult) -> None:
    print("\n" + "=" * 62)
    print("  GARBY — Layer 6: Temporal Consistency Analysis")
    print("=" * 62)
    print(f"  Frames     : {r.n_frames}")
    print(f"  Verdict    : {r.verdict}")
    print(f"  Confidence : {r.confidence}")
    print(f"  AI Score   : {r.ai_probability:.4f}")
    print(f"  Flow       : {'OpenCV active' if r.optical_flow_available else 'not available'}")
    print("-" * 62)
    for name, desc in r.signals.items():
        print(f"    • {name}: {desc}")
    print("=" * 62 + "\n")


if __name__ == "__main__":
    import sys, glob
    if len(sys.argv) < 2:
        print("Usage: python garby_layer6_temporal.py <frame1> <frame2> ...")
        print("   or: python garby_layer6_temporal.py /path/to/frames/")
        sys.exit(1)
    arg = sys.argv[1]
    if os.path.isdir(arg):
        fps = sorted(glob.glob(os.path.join(arg, "*.jpg")) +
                     glob.glob(os.path.join(arg, "*.png")))
    else:
        fps = sys.argv[1:]
    print(f"Analysing {len(fps)} frames...")
    print_result(analyse(fps))
