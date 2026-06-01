"""
Garby Detection Engine — FastAPI Microservice
==============================================
Wraps the 5-layer detection orchestrator behind an HTTP API.
Called by the Node.js backend for both image and video frame analysis.

Endpoints:
  POST /analyse          — Analyse a single image (base64)
  POST /analyse-frames   — Analyse multiple video frames (list of base64)
  GET  /health           — Health check

Author : Garby Detection Team
"""

import base64
import io
import os
import tempfile
import time
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

from garby_orchestrator_v2 import detect_trained as detect, detect_trained, to_json, _load_model

app = FastAPI(
    title="Garby Detection Engine",
    description="5-layer AI image detection microservice",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def warm_up():
    """
    Pre-warm all layer imports on startup so first request is fast.
    Creates a tiny synthetic image and runs a full detection pass.
    """
    import numpy as np
    import tempfile, os
    print("[Engine] Warming up detection layers...")
    arr = (np.random.rand(64, 64, 3) * 255).astype(np.uint8)
    img = Image.fromarray(arr)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        img.save(f.name)
        tmp = f.name
    try:
        _load_model()
        detect_trained(tmp, verbose=False)
        print("[Engine] Warm-up complete — all layers loaded.")
    except Exception as e:
        print(f"[Engine] Warm-up warning: {e}")
    finally:
        os.unlink(tmp)


# ── Request / Response models ──────────────────────────────────────────────────

class AnalyseRequest(BaseModel):
    image_b64: str              # Base64-encoded image (any format PIL supports)
    filename: Optional[str] = "image.jpg"


class FrameItem(BaseModel):
    frame_number: int
    timestamp_ms: int
    image_b64: str


class AnalyseFramesRequest(BaseModel):
    frames: List[FrameItem]
    filename: Optional[str] = "video.mp4"


class FrameResult(BaseModel):
    frame_number: int
    timestamp_ms: int
    classification: str
    confidence: float
    ai_probability: float


class VideoAnalysisResult(BaseModel):
    classification: str
    confidence: float
    ai_probability: float
    frames_analysed: int
    ai_frame_count: int
    ai_fraction: float
    frame_results: List[FrameResult]
    layer_scores: dict
    signals: dict
    processing_ms: float


# ── Health check ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "garby-detection-engine",
        "version": "1.0.0",
        "layers": 5,
    }


# ── Single image analysis ──────────────────────────────────────────────────────

@app.post("/analyse")
def analyse_image(req: AnalyseRequest):
    """
    Analyse a single image through all 5 detection layers.
    Accepts base64-encoded image data.
    Returns full GarbyResult as JSON.
    """
    start = time.perf_counter()

    # Decode base64 → save to temp file (orchestrator expects a file path)
    try:
        image_bytes = base64.b64decode(req.image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    # Validate it's a real image
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.verify()
        ext = img.format.lower() if img.format else "jpg"
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image")

    # Write to temp file for the orchestrator
    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        result = detect(tmp_path, verbose=False)
        data   = to_json(result)
        data["processing_ms"] = round((time.perf_counter() - start) * 1000, 1)
        return {"success": True, "data": data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ── Video frame batch analysis ─────────────────────────────────────────────────

@app.post("/analyse-frames")
def analyse_frames(req: AnalyseFramesRequest):
    """
    Analyse a batch of video frames.
    Each frame is base64-encoded JPEG extracted from the video.
    Returns per-frame results + aggregated video-level classification.

    Video adaptation logic:
    - Run all 5 layers on each frame independently
    - Aggregate: if >= 60% of frames are AI_GENERATED with confidence > 0.6 → AI_GENERATED
    - Layer scores are averaged across all frames for the final ensemble
    """
    start = time.perf_counter()

    if not req.frames:
        raise HTTPException(status_code=400, detail="No frames provided")

    frame_results: List[FrameResult] = []
    layer_score_accumulator = {
        "layer1_fft":      [],
        "layer2_noise":    [],
        "layer3_stats":    [],
        "layer4_semantic": [],
        "layer5_npr_dwt":  [],
    }
    signal_accumulator: dict = {}

    for frame in req.frames:
        try:
            image_bytes = base64.b64decode(frame.image_b64)
        except Exception:
            print(f"[Engine] Frame {frame.frame_number}: invalid base64, skipping")
            continue

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            result = detect(tmp_path, verbose=False)

            frame_results.append(FrameResult(
                frame_number=frame.frame_number,
                timestamp_ms=frame.timestamp_ms,
                classification=result.verdict,
                confidence=result.ai_probability if result.verdict == "AI-Generated"
                           else (1 - result.ai_probability),
                ai_probability=result.ai_probability,
            ))

            # Accumulate layer scores for averaging
            layer_score_accumulator["layer1_fft"].append(result.layer1_score)
            layer_score_accumulator["layer2_noise"].append(result.layer2_score)
            layer_score_accumulator["layer3_stats"].append(result.layer3_score)
            layer_score_accumulator["layer4_semantic"].append(result.layer4_score)
            layer_score_accumulator["layer5_npr_dwt"].append(result.layer5_score)

            # Collect signals from first AI-flagged frame
            if result.verdict == "AI-Generated" and not signal_accumulator:
                signal_accumulator = result.signals

            print(f"[Engine] Frame {frame.frame_number}: {result.verdict} ({result.ai_probability:.3f})")

        except Exception as e:
            print(f"[Engine] Frame {frame.frame_number} failed: {e}")
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    if not frame_results:
        raise HTTPException(status_code=500, detail="All frame analyses failed")

    # ── Aggregate frame results ────────────────────────────────────────────────
    AI_THRESHOLD       = 0.60
    CONFIDENCE_MIN     = 0.60

    ai_frames = [f for f in frame_results
                 if f.classification == "AI-Generated" and f.confidence >= CONFIDENCE_MIN]
    ai_fraction = len(ai_frames) / len(frame_results)

    if ai_fraction >= AI_THRESHOLD:
        classification = "AI-Generated"
        confidence     = sum(f.confidence for f in ai_frames) / len(ai_frames)
    elif ai_fraction <= 0.20:
        real_frames    = [f for f in frame_results if f.classification == "Likely Real"]
        classification = "Likely Real"
        confidence     = sum(f.confidence for f in real_frames) / max(len(real_frames), 1)
    else:
        classification = "Inconclusive"
        confidence     = 0.5

    # Average layer scores
    avg_layer_scores = {
        k: round(sum(v) / len(v), 4) if v else 0.0
        for k, v in layer_score_accumulator.items()
    }

    elapsed = round((time.perf_counter() - start) * 1000, 1)

    return {
        "success": True,
        "data": VideoAnalysisResult(
            classification=classification,
            confidence=round(confidence, 4),
            ai_probability=round(sum(f.ai_probability for f in frame_results) / len(frame_results), 4),
            frames_analysed=len(frame_results),
            ai_frame_count=len(ai_frames),
            ai_fraction=round(ai_fraction, 4),
            frame_results=frame_results,
            layer_scores=avg_layer_scores,
            signals=signal_accumulator,
            processing_ms=elapsed,
        ).dict(),
    }




# ── Temporal analysis endpoint (Layer 6) ──────────────────────────────────────

class TemporalRequest(BaseModel):
    frame_paths: list[str]

@app.post("/analyse-temporal")
async def analyse_temporal(request: TemporalRequest):
    """
    Run Layer 6 temporal consistency analysis on a sequence of frame paths.
    Called by the Node.js video service after frame extraction.
    """
    try:
        from garby_layer6_temporal import analyse as l6_analyse
        result = l6_analyse(request.frame_paths)
        return {
            "ai_probability": result.ai_probability,
            "verdict":        result.verdict,
            "confidence":     result.confidence,
            "ensemble_score": result.ensemble_score,
            "signals":        result.signals,
            "raw_stats":      result.raw_stats,
            "n_frames":       result.n_frames,
            "optical_flow_available": result.optical_flow_available,
            "layer_scores": {
                "frame_diff_entropy": result.frame_diff_entropy_score,
                "background_drift":   result.background_drift_score,
                "self_similarity":    result.self_similarity_score,
                "optical_flow":       result.optical_flow_score,
                "skin_flicker":       result.skin_flicker_score,
                "edge_stability":     result.edge_stability_score,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Temporal analysis failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
