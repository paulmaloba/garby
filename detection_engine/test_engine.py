"""
test_engine.py — Direct engine test
Run from detection-engine/ folder:
    python test_engine.py C:\Users\MALOBA\Pictures\grok_image_xn5z6vw.jpg
"""

import sys
import base64
import time
import json

def test_direct(image_path: str):
    """Test by calling the orchestrator directly (no HTTP)."""
    print(f"\n=== Direct orchestrator test ===")
    print(f"Image: {image_path}")
    
    start = time.perf_counter()
    from garby_orchestrator import detect, to_json
    import_time = time.perf_counter() - start
    print(f"Import time: {import_time:.2f}s")
    
    start = time.perf_counter()
    result = detect(image_path, verbose=True)
    detect_time = time.perf_counter() - start
    
    print(f"\nDetection time: {detect_time:.2f}s")
    print(f"Verdict: {result.verdict}")
    print(f"AI Probability: {result.ai_probability}")
    print(f"Confidence: {result.confidence}")
    print(json.dumps(result.layer_scores if hasattr(result, 'layer_scores') else {}, indent=2))

def test_api(image_path: str):
    """Test via the running FastAPI server."""
    import urllib.request
    print(f"\n=== API test (http://localhost:8001) ===")
    
    with open(image_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    
    payload = json.dumps({"image_b64": b64, "filename": "test.jpg"}).encode()
    
    req = urllib.request.Request(
        "http://localhost:8001/analyse",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            elapsed = time.perf_counter() - start
            data = json.loads(resp.read())
            print(f"API response time: {elapsed:.2f}s")
            print(json.dumps(data, indent=2))
    except Exception as e:
        elapsed = time.perf_counter() - start
        print(f"API failed after {elapsed:.2f}s: {e}")

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "test.jpg"
    
    # Run direct test first to get baseline timing
    test_direct(path)
    
    # Then test via API if server is running
    test_api(path)
