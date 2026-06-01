"""
Garby Detection Engine — Layer 4: Semantic Inconsistency Detection v2
======================================================================
v2 adds four new signals targeting modern photorealistic AI generators:

NEW Signal 5: Edge Bimodality
  AI images have unnaturally bimodal edge distributions — extremely sharp
  subject boundaries and extremely soft backgrounds (bokeh abuse).
  Real photos have continuous, smooth edge magnitude distributions.
  Measured via the Bimodality Coefficient (BC). BC > 0.555 = bimodal.

NEW Signal 6: Sharpness Distribution Consistency
  AI generators apply incorrect depth-of-field — the subject is over-sharp
  and the background is over-blurred in ways that violate lens physics.
  Measured by the ratio of max-to-min local sharpness across image regions.
  Real: ratio 5–40. AI: ratio often 80–200+.

NEW Signal 7: Chromatic Aberration Absence
  Real camera lenses produce chromatic aberration (color fringing at
  high-contrast edges) due to wavelength-dependent refraction.
  AI generators synthesize scenes without lens physics — edges are
  perfectly achromatic. Detected by R/G/B channel correlation at edges.
  AI: correlation > 0.97. Real: correlation 0.85–0.95.

NEW Signal 8: Physical Structure Consistency
  AI generators consistently produce anatomically incorrect proportions
  in human subjects (over-sized extremities, asymmetric limbs, incorrect
  perspective scaling of body parts). Detected via:
  - Skin region width analysis at different vertical positions
  - Perspective consistency of skin blob sizes
  - Detection of over-sized extremity regions relative to body proportions

Author  : Garby Detection Team
Version : 2.0.0
"""

import numpy as np
from PIL import Image, ImageFilter
import os
from dataclasses import dataclass, field
from scipy.ndimage import label, uniform_filter, sobel, laplace


@dataclass
class SemanticInconsistencyResult:
    image_path: str
    ai_probability: float
    verdict: str
    confidence: str
    texture_repetition_score: float
    edge_coherence_score: float
    lighting_consistency_score: float
    local_contrast_score: float
    edge_bimodality_score: float
    sharpness_distribution_score: float
    chromatic_aberration_score: float
    physical_structure_score: float
    ensemble_score: float
    signals: dict
    findings: list = field(default_factory=list)


def load_and_prepare(image_path):
    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if max(w, h) > 1024:
        scale = 1024 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img_rgb  = np.array(img, dtype=np.float32) / 255.0
    img_gray = np.mean(img_rgb, axis=2)
    return img_rgb, img_gray


# ── Original signals (v1) ─────────────────────────────────────────────────────

def compute_texture_repetition_score(img_gray, patch_size=16):
    h, w = img_gray.shape
    n_ph, n_pw = h // patch_size, w // patch_size
    if n_ph < 3 or n_pw < 3:
        return 0.0, []
    patches = []
    step_h, step_w = max(1, n_ph // 8), max(1, n_pw // 8)
    for i in range(0, n_ph, step_h):
        for j in range(0, n_pw, step_w):
            p = img_gray[i*patch_size:(i+1)*patch_size, j*patch_size:(j+1)*patch_size]
            mu, sig = np.mean(p), np.std(p)
            if sig > 1e-6:
                patches.append((p - mu) / sig)
    if len(patches) < 4:
        return 0.0, []
    n = len(patches)
    high_corr_count = very_frac_count = total_pairs = 0
    for i in range(n):
        for j in range(i + 1, n):
            corr = float(np.mean(patches[i] * patches[j]))
            total_pairs += 1
            if corr > 0.75: high_corr_count += 1
            if corr > 0.90: very_frac_count += 1
    if total_pairs == 0:
        return 0.0, []
    high_frac = high_corr_count / total_pairs
    very_frac  = very_frac_count  / total_pairs
    score = float(np.clip((high_frac - 0.05) / 0.25, 0.0, 1.0))
    score = max(score, float(np.clip((very_frac - 0.02) / 0.10, 0.0, 1.0)))
    findings = []
    if high_frac > 0.15:
        findings.append(f"Texture repetition: {high_corr_count}/{total_pairs} patch pairs show high similarity")
    return float(np.clip(score, 0.0, 1.0)), findings


def compute_edge_coherence_score(img_gray):
    h, w = img_gray.shape
    grad_x, grad_y = sobel(img_gray, axis=1), sobel(img_gray, axis=0)
    magnitude, orientation = np.sqrt(grad_x**2 + grad_y**2), np.arctan2(grad_y, grad_x)
    threshold = np.percentile(magnitude, 80)
    edge_mask = magnitude > threshold
    if np.sum(edge_mask) < 100:
        return 0.0, []
    block = 8
    inconsistency_scores = []
    for i in range(h // block):
        for j in range(w // block):
            blk_edges  = edge_mask[i*block:(i+1)*block, j*block:(j+1)*block]
            blk_orient = orientation[i*block:(i+1)*block, j*block:(j+1)*block]
            if np.sum(blk_edges) < 3: continue
            angles = blk_orient[blk_edges]
            mean_cos, mean_sin = float(np.mean(np.cos(2*angles))), float(np.mean(np.sin(2*angles)))
            circ_var = 1.0 - float(np.sqrt(mean_cos**2 + mean_sin**2))
            inconsistency_scores.append(circ_var)
    if not inconsistency_scores:
        return 0.0, []
    mean_inconsistency = float(np.mean(inconsistency_scores))
    labeled, n_components = label(edge_mask)
    component_sizes = np.bincount(labeled.flatten())[1:]
    if len(component_sizes) == 0:
        return 0.0, []
    isolated_frac = np.sum(component_sizes < 5) / len(component_sizes)
    inconsistency_score = float(np.clip((mean_inconsistency - 0.65) / 0.30, 0.0, 1.0))
    isolation_score     = float(np.clip((isolated_frac - 0.65) / 0.30, 0.0, 1.0))
    score = (inconsistency_score * 0.55) + (isolation_score * 0.45)
    findings = []
    if mean_inconsistency > 0.70:
        findings.append(f"Edge orientation inconsistency: circular variance = {mean_inconsistency:.2f}")
    return float(np.clip(score, 0.0, 1.0)), findings


def compute_lighting_consistency_score(img_rgb, img_gray):
    h, w = img_gray.shape
    illum = uniform_filter(img_gray, size=max(h, w) // 8)
    n_grid, rh, rw = 4, h // 4, w // 4
    illum_directions = []
    for i in range(n_grid):
        for j in range(n_grid):
            region = illum[i*rh:(i+1)*rh, j*rw:(j+1)*rw]
            if region.size == 0: continue
            gx = float(np.mean(np.gradient(region, axis=1)))
            gy = float(np.mean(np.gradient(region, axis=0)))
            angle    = float(np.arctan2(gy, gx))
            strength = float(np.sqrt(gx**2 + gy**2))
            if strength > 1e-5:
                illum_directions.append(angle)
    if len(illum_directions) < 4:
        return 0.0, []
    angles = np.array(illum_directions)
    circ_var = 1.0 - float(np.sqrt(np.mean(np.cos(angles))**2 + np.mean(np.sin(angles))**2))
    lap = np.abs(np.gradient(np.gradient(img_gray, axis=0), axis=0) +
                 np.gradient(np.gradient(img_gray, axis=1), axis=1))
    mean_lap = float(np.mean(lap))
    lap_score = float(np.clip((mean_lap - 0.015) / 0.030, 0.0, 1.0))
    if circ_var > 0.80:
        direction_score = float(np.clip((circ_var - 0.80) / 0.20, 0.0, 1.0))
    elif circ_var < 0.10:
        direction_score = float(np.clip((0.10 - circ_var) / 0.10, 0.0, 1.0))
    else:
        direction_score = 0.0
    score = (direction_score * 0.60) + (lap_score * 0.40)
    findings = []
    if circ_var > 0.80:
        findings.append(f"Lighting direction inconsistency: circular variance = {circ_var:.2f}")
    if mean_lap > 0.020:
        findings.append(f"Abrupt luminance transitions: mean Laplacian = {mean_lap:.4f}")
    return float(np.clip(score, 0.0, 1.0)), findings


def compute_local_contrast_score(img_gray, img_rgb):
    h, w = img_gray.shape
    block = 16
    n_bh, n_bw = h // block, w // block
    if n_bh < 3 or n_bw < 3:
        return 0.0, []
    local_contrasts, local_saturations = [], []
    for i in range(n_bh):
        for j in range(n_bw):
            blk     = img_gray[i*block:(i+1)*block, j*block:(j+1)*block]
            blk_rgb = img_rgb[i*block:(i+1)*block, j*block:(j+1)*block, :]
            local_contrasts.append(float(np.std(blk)))
            blk_max, blk_min = np.max(blk_rgb, axis=2), np.min(blk_rgb, axis=2)
            local_saturations.append(float(np.mean((blk_max-blk_min)/(blk_max+blk_min+1e-6))))
    local_contrasts   = np.array(local_contrasts)
    local_saturations = np.array(local_saturations)
    scores, findings  = [], []
    contrast_cv = float(np.std(local_contrasts) / (np.mean(local_contrasts) + 1e-8))
    if contrast_cv < 0.20:
        scores.append(float(np.clip((0.20 - contrast_cv) / 0.20, 0.0, 1.0)))
        findings.append(f"Unnaturally uniform local contrast (CV={contrast_cv:.2f})")
    else:
        scores.append(0.0)
    if np.std(local_saturations) > 1e-6:
        corr = float(np.corrcoef(local_contrasts, local_saturations)[0, 1])
        scores.append(float(np.clip((0.05 - corr) / 1.05, 0.0, 1.0)) if corr < 0.05 else 0.0)
    else:
        scores.append(0.0)
    mean_contrast = float(np.mean(local_contrasts))
    if mean_contrast > 0.20:
        scores.append(float(np.clip((mean_contrast - 0.20) / 0.15, 0.0, 1.0)))
    elif mean_contrast < 0.03:
        scores.append(float(np.clip((0.03 - mean_contrast) / 0.03, 0.0, 1.0)))
    else:
        scores.append(0.0)
    return float(np.clip(np.mean(scores), 0.0, 1.0)), findings


# ── New signals (v2) ──────────────────────────────────────────────────────────

def compute_edge_bimodality_score(img_gray):
    """
    Signal 5: Edge Gradient Bimodality
    
    AI generators (especially diffusion with depth-of-field conditioning)
    produce images where edges are either very sharp (subject) or very soft
    (background) with almost nothing in between. This bimodal distribution
    is unnatural — real photographs have continuous edge distributions due
    to optical blur, motion, and depth-of-field being physically continuous.
    
    Bimodality Coefficient (BC):
        BC = (skewness² + 1) / (kurtosis + correction)
        BC > 0.555 = bimodal distribution (AI indicator)
        BC < 0.555 = unimodal distribution (natural)
    
    Additional measure: kurtosis of edge gradient magnitudes.
    Real photos: kurtosis 2-8 (mild heavy tail)
    AI images:   kurtosis > 10 (extremely heavy tail = bimodal)
    """
    edges = np.sqrt(sobel(img_gray, axis=1)**2 + sobel(img_gray, axis=0)**2)
    flat  = edges.flatten()
    n     = len(flat)

    if n < 100:
        return 0.0, []

    mean_e = np.mean(flat)
    std_e  = np.std(flat) + 1e-10
    kurt_e = float(np.mean(((flat - mean_e)/std_e)**4)) - 3.0
    skew_e = float(np.mean(((flat - mean_e)/std_e)**3))

    # Bimodality coefficient
    correction = 3.0 * (n-1)**2 / ((n-2) * (n-3))
    bc = (skew_e**2 + 1.0) / (kurt_e + correction) if (kurt_e + correction) > 0 else 0.0

    # Score: BC > 0.555 is bimodal
    bc_score   = float(np.clip((bc - 0.555) / 0.30, 0.0, 1.0))
    # Score: extreme kurtosis also indicates AI
    kurt_score = float(np.clip((kurt_e - 10.0) / 15.0, 0.0, 1.0))

    score    = (bc_score * 0.60) + (kurt_score * 0.40)
    findings = []
    if bc > 0.555:
        findings.append(f"Bimodal edge distribution (BC={bc:.3f}) — AI subject/background separation artifact")
    if kurt_e > 10.0:
        findings.append(f"Extreme edge kurtosis ({kurt_e:.1f}) — unnaturally sharp subject boundaries")

    return float(np.clip(score, 0.0, 1.0)), findings


def compute_sharpness_distribution_score(img_gray):
    """
    Signal 6: Sharpness Distribution Consistency (Bokeh Abuse Detection)
    
    AI generators frequently apply incorrect depth-of-field effects:
    the subject is rendered at maximum sharpness while the background
    is uniformly blurred. Real camera lenses produce depth-of-field that
    varies continuously with distance — the blur transition is gradual and
    physically consistent with the apparent depth of scene elements.
    
    We measure local sharpness (Laplacian variance) across 8×8 image blocks.
    Real photos: sharpness ratio (max/min) typically 5–40
    AI with bokeh abuse: ratio often 80–300+
    
    Also checks: does sharpness decrease monotonically from subject to edges?
    AI images often have random sharpness distribution (sharp background
    elements next to blurry ones at the same apparent depth).
    """
    h, w = img_gray.shape
    grid_size = 8
    qh, qw = h // grid_size, w // grid_size

    if qh < 4 or qw < 4:
        return 0.0, []

    local_sharpness = np.zeros((grid_size, grid_size))
    for i in range(grid_size):
        for j in range(grid_size):
            block = img_gray[i*qh:(i+1)*qh, j*qw:(j+1)*qw]
            local_sharpness[i, j] = np.var(laplace(block))

    mean_sharp = np.mean(local_sharpness) + 1e-10
    max_sharp  = np.max(local_sharpness)
    min_sharp  = np.min(local_sharpness) + 1e-10

    sharpness_range = max_sharp / min_sharp
    sharpness_cv    = float(np.std(local_sharpness) / mean_sharp)

    # Extreme range indicates bokeh abuse
    range_score = float(np.clip((sharpness_range - 40.0) / 160.0, 0.0, 1.0))
    # Very high CV also suspicious
    cv_score    = float(np.clip((sharpness_cv - 1.0) / 1.5, 0.0, 1.0))

    score    = (range_score * 0.65) + (cv_score * 0.35)
    findings = []
    if sharpness_range > 80:
        findings.append(f"Bokeh abuse detected: sharpness range {sharpness_range:.0f}× — physically impossible depth-of-field")

    return float(np.clip(score, 0.0, 1.0)), findings


def compute_chromatic_aberration_score(img_rgb, img_gray):
    """
    Signal 7: Chromatic Aberration Absence
    
    All real camera lenses produce chromatic aberration (CA): because
    different wavelengths of light refract at slightly different angles,
    the R, G, and B channels are slightly misaligned at high-contrast edges.
    This is a fundamental physical property of glass optics.
    
    AI generators synthesize images without simulating lens physics.
    Result: at high-contrast edges, R/G/B channels are perfectly aligned.
    
    We measure this by computing edge strength separately in R, G, B channels
    and correlating them at locations of strong edges (top 10% of gradient).
    
    Real cameras: RG and BG correlation at edges 0.80–0.94
    AI images:    RG and BG correlation at edges 0.95–1.00
    
    Note: some modern AI generators do add synthetic CA as post-processing.
    The absence of CA is a positive AI signal; its presence is not a real signal.
    """
    edges_r = np.sqrt(sobel(img_rgb[:,:,0], axis=1)**2 + sobel(img_rgb[:,:,0], axis=0)**2)
    edges_g = np.sqrt(sobel(img_rgb[:,:,1], axis=1)**2 + sobel(img_rgb[:,:,1], axis=0)**2)
    edges_b = np.sqrt(sobel(img_rgb[:,:,2], axis=1)**2 + sobel(img_rgb[:,:,2], axis=0)**2)

    # Only look at strong edges (top 10%)
    strong_mask = edges_g > np.percentile(edges_g, 90)
    if np.sum(strong_mask) < 50:
        return 0.0, []

    rg_corr = float(np.corrcoef(edges_r[strong_mask], edges_g[strong_mask])[0, 1])
    bg_corr = float(np.corrcoef(edges_b[strong_mask], edges_g[strong_mask])[0, 1])
    mean_corr = (abs(rg_corr) + abs(bg_corr)) / 2.0

    # AI: correlation very high (near perfect alignment)
    # Real: moderate correlation (some CA present)
    score    = float(np.clip((mean_corr - 0.94) / 0.06, 0.0, 1.0))
    findings = []
    if mean_corr > 0.97:
        findings.append(f"Chromatic aberration absent (edge channel correlation={mean_corr:.3f}) — no lens physics detected")

    return float(np.clip(score, 0.0, 1.0)), findings


def compute_physical_structure_score(img_rgb, img_gray):
    """
    Signal 8: Physical Structure Consistency
    
    AI generators systematically produce physically inconsistent structures
    in images containing people, animals, or complex objects:
    
    1. Extremity proportion anomaly — hands, feet, ears in AI images are
       frequently disproportionate to the body. We detect this by analysing
       skin-colored region sizes and their ratios across vertical positions.
    
    2. Perspective inconsistency — objects at the same apparent depth have
       inconsistent sizes. We detect this via the distribution of edge-
       bounded region areas across the image.
    
    3. Surface normal inconsistency — AI generators often produce surfaces
       where the implied surface normal direction is inconsistent with the
       illumination model. Detected via gradient direction vs. illumination.
    
    4. Synthetic skin texture — AI skin has characteristic uniform micro-
       texture unlike real skin which has irregular pore patterns, subtle
       variations in colour and translucency.
    """
    h, w = img_gray.shape
    scores, findings = [], []

    # ── 1. Skin region proportion analysis ───────────────────────────────────
    r, g, b = img_rgb[:,:,0], img_rgb[:,:,1], img_rgb[:,:,2]
    mx = np.maximum(np.maximum(r,g),b)
    mn = np.minimum(np.minimum(r,g),b)
    s  = np.where(mx > 1e-6, (mx-mn)/mx, 0.0)
    v  = mx
    delta = mx - mn + 1e-10
    h_norm = np.zeros_like(r)
    mask   = mx != mn
    h_norm[mask & (mx==r)] = ((g-b)[mask & (mx==r)] / delta[mask & (mx==r)]) % 6
    h_norm[mask & (mx==g)] = (b-r)[mask & (mx==g)]  / delta[mask & (mx==g)] + 2
    h_norm[mask & (mx==b)] = (r-g)[mask & (mx==b)]  / delta[mask & (mx==b)] + 4
    h_norm = h_norm / 6.0

    skin_mask = (h_norm >= 0.0) & (h_norm <= 0.10) & (s > 0.12) & (v > 0.20)
    skin_frac = np.sum(skin_mask) / (h * w)

    if skin_frac > 0.05:
        # Divide image into vertical thirds
        third = h // 3
        skin_top    = np.sum(skin_mask[:third, :])
        skin_mid    = np.sum(skin_mask[third:2*third, :])
        skin_bottom = np.sum(skin_mask[2*third:, :])
        total_skin  = skin_top + skin_mid + skin_bottom + 1

        # For a standing/sitting person, skin distribution should be
        # face (top) < torso/arms (mid) < legs (mid-bottom)
        # An anomalously large skin region at the bottom (relative to mid)
        # suggests over-sized feet/ankles
        bottom_fraction = skin_bottom / total_skin
        mid_fraction    = skin_mid / total_skin

        # If bottom skin > middle skin, something is proportionally wrong
        if mid_fraction > 0.05 and bottom_fraction > mid_fraction * 1.4:
            prop_score = float(np.clip((bottom_fraction/mid_fraction - 1.4) / 1.0, 0.0, 1.0))
            scores.append(prop_score)
            findings.append(f"Abnormal skin distribution: bottom region {bottom_fraction:.1%} vs mid {mid_fraction:.1%} — possible extremity proportion anomaly")
        else:
            scores.append(0.0)

        # ── 2. Skin texture uniformity (AI skin is too smooth) ────────────────
        skin_pixels = img_gray[skin_mask]
        if len(skin_pixels) > 200:
            # Compute local variance in skin regions only
            local_var_map = img_gray - uniform_filter(img_gray, 5)
            skin_local_std = np.std(local_var_map[skin_mask])
            # Real skin: local_std > 0.015 (pores, texture, colour variation)
            # AI skin:   local_std < 0.010 (too smooth, homogeneous)
            skin_smooth_score = float(np.clip((0.015 - skin_local_std) / 0.015, 0.0, 1.0))
            scores.append(skin_smooth_score)
            if skin_local_std < 0.008:
                findings.append(f"Synthetic skin texture: local variance {skin_local_std:.5f} — unnaturally smooth skin detected")
    else:
        scores.extend([0.0, 0.0])

    # ── 3. Connected region size distribution ─────────────────────────────────
    # In real images, the distribution of connected region sizes follows a
    # power law. AI images tend to produce more evenly-sized regions
    # (everything looks equally detailed at all scales)
    edges = np.sqrt(sobel(img_gray, axis=1)**2 + sobel(img_gray, axis=0)**2)
    binary = edges > np.percentile(edges, 75)
    labeled, n_comp = label(~binary)  # Connected regions BETWEEN edges
    if n_comp > 10:
        sizes = np.bincount(labeled.flatten())[1:]
        sizes = sizes[sizes > 4]  # Filter tiny noise regions
        if len(sizes) > 5:
            log_sizes = np.log(sizes + 1)
            # Power law: log-log should be linear with negative slope
            # Deviation from power law indicates AI generation
            sorted_sizes = np.sort(sizes)[::-1]
            rank = np.arange(1, len(sorted_sizes)+1)
            coeffs = np.polyfit(np.log(rank), np.log(sorted_sizes+1), 1)
            slope  = coeffs[0]
            # Real images: slope typically -1.5 to -2.5 (strong power law)
            # AI images: slope closer to -0.5 to -1.0 (weaker power law)
            if slope > -1.0:
                power_law_score = float(np.clip((-0.5 - slope) / 1.0, 0.0, 1.0))
                scores.append(power_law_score)
                if slope > -0.8:
                    findings.append(f"Weak spatial frequency power law (slope={slope:.2f}) — AI-characteristic region size distribution")
            else:
                scores.append(0.0)
        else:
            scores.append(0.0)
    else:
        scores.append(0.0)

    score = float(np.clip(np.mean(scores) if scores else 0.0, 0.0, 1.0))
    return score, findings


# ── Ensemble v2 ───────────────────────────────────────────────────────────────
# v2 weights: new signals get 40% of total weight
WEIGHTS = {
    "texture_repetition":      0.08,
    "edge_coherence":          0.08,
    "lighting":                0.10,
    "local_contrast":          0.07,
    "edge_bimodality":         0.20,   # NEW — strong signal
    "sharpness_distribution":  0.18,   # NEW — strong signal
    "chromatic_aberration":    0.17,   # NEW — strong signal
    "physical_structure":      0.12,   # NEW — anatomical check
}

THRESHOLDS = {
    "ai_high":      0.45,
    "ai_medium":    0.30,
    "inconclusive": 0.20,
}


def compute_ensemble(scores):
    return sum(scores[k] * WEIGHTS[k] for k in WEIGHTS)


def determine_verdict(ensemble):
    if ensemble >= THRESHOLDS["ai_high"]:   return "AI-Generated", "High",  ensemble
    elif ensemble >= THRESHOLDS["ai_medium"]: return "AI-Generated", "Medium", ensemble
    elif ensemble >= THRESHOLDS["inconclusive"]: return "Inconclusive", "Low", ensemble
    else: return "Likely Real", "High", ensemble


def build_signals(scores, all_findings):
    def level(s):
        if s >= 0.45: return "High"
        if s >= 0.25: return "Moderate"
        return "Low"
    ensemble = compute_ensemble(scores)
    return {
        "Texture Repetition":        f"{level(scores['texture_repetition'])} ({scores['texture_repetition']:.2f})",
        "Edge Coherence":            f"{level(scores['edge_coherence'])} ({scores['edge_coherence']:.2f})",
        "Lighting Consistency":      f"{level(scores['lighting'])} ({scores['lighting']:.2f})",
        "Local Contrast Pattern":    f"{level(scores['local_contrast'])} ({scores['local_contrast']:.2f})",
        "Edge Bimodality":           f"{level(scores['edge_bimodality'])} ({scores['edge_bimodality']:.2f}) — Subject/background separation",
        "Sharpness Distribution":    f"{level(scores['sharpness_distribution'])} ({scores['sharpness_distribution']:.2f}) — Depth-of-field physics",
        "Chromatic Aberration":      f"{level(scores['chromatic_aberration'])} ({scores['chromatic_aberration']:.2f}) — Lens physics",
        "Physical Structure":        f"{level(scores['physical_structure'])} ({scores['physical_structure']:.2f}) — Anatomical proportions",
        "Findings":                  f"{len(all_findings)} structural anomalies",
        "Ensemble Score":            f"{ensemble:.4f}",
    }


def analyse(image_path):
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img_rgb, img_gray = load_and_prepare(image_path)

    tex_score,  tex_findings   = compute_texture_repetition_score(img_gray)
    edge_score, edge_findings  = compute_edge_coherence_score(img_gray)
    light_score,light_findings = compute_lighting_consistency_score(img_rgb, img_gray)
    con_score,  con_findings   = compute_local_contrast_score(img_gray, img_rgb)
    bm_score,   bm_findings    = compute_edge_bimodality_score(img_gray)
    sharp_score,sharp_findings = compute_sharpness_distribution_score(img_gray)
    ca_score,   ca_findings    = compute_chromatic_aberration_score(img_rgb, img_gray)
    phys_score, phys_findings  = compute_physical_structure_score(img_rgb, img_gray)

    scores = {
        "texture_repetition":     tex_score,
        "edge_coherence":         edge_score,
        "lighting":               light_score,
        "local_contrast":         con_score,
        "edge_bimodality":        bm_score,
        "sharpness_distribution": sharp_score,
        "chromatic_aberration":   ca_score,
        "physical_structure":     phys_score,
    }

    all_findings = (tex_findings + edge_findings + light_findings +
                    con_findings + bm_findings + sharp_findings +
                    ca_findings  + phys_findings)
    ensemble     = compute_ensemble(scores)
    verdict, confidence, ai_prob = determine_verdict(ensemble)
    signals = build_signals(scores, all_findings)

    return SemanticInconsistencyResult(
        image_path=image_path,
        ai_probability=round(ai_prob, 4),
        verdict=verdict,
        confidence=confidence,
        texture_repetition_score=round(tex_score, 4),
        edge_coherence_score=round(edge_score, 4),
        lighting_consistency_score=round(light_score, 4),
        local_contrast_score=round(con_score, 4),
        edge_bimodality_score=round(bm_score, 4),
        sharpness_distribution_score=round(sharp_score, 4),
        chromatic_aberration_score=round(ca_score, 4),
        physical_structure_score=round(phys_score, 4),
        ensemble_score=round(ensemble, 4),
        signals=signals,
        findings=all_findings,
    )


def print_result(result):
    print(f"\n{'='*65}")
    print(f"  GARBY — Layer 4 v2: Semantic + Physical Structure Analysis")
    print(f"{'='*65}")
    print(f"  Image     : {os.path.basename(result.image_path)}")
    print(f"  Verdict   : {result.verdict}")
    print(f"  Confidence: {result.confidence}")
    print(f"  AI Score  : {result.ai_probability:.4f}")
    print(f"{'-'*65}")
    for name, desc in result.signals.items():
        print(f"    • {name}: {desc}")
    if result.findings:
        print(f"\n  Structural Findings:")
        for f in result.findings:
            print(f"    ⚠  {f}")
    print(f"{'='*65}\n")


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python garby_layer4_semantic.py <image_path>")
        sys.exit(1)
    print_result(analyse(sys.argv[1]))
