from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
import cv2
import numpy as np
import base64
import os
import io
import torch
from typing import List, Optional
from PIL import Image

# FaceNet (facenet-pytorch)
try:
    from facenet_pytorch import MTCNN, InceptionResnetV1  # type: ignore
    FACENET_AVAILABLE = True
except Exception as e:  # pragma: no cover - import guard
    print("[FaceNet] facenet_pytorch not available:", e)
    FACENET_AVAILABLE = False

app = FastAPI()

# Allow Next.js to call this
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

DETECTIONS = ['tongue_left', 'tongue_right', 'tongue_up', 'tongue_down', 'tongue_center', 'no_tongue']

MODEL_PATH = os.getenv('MODEL_PATH', '../yolo/runs/detect/exp1/weights/best.pt')

print("🚀 Loading YOLO model into RAM...")
print(f"   Model path: {MODEL_PATH}")
model = YOLO(MODEL_PATH)
print("✅ Model loaded and ready!")
print(f"   Classes: {list(model.names.values())}")

class DetectionRequest(BaseModel):
    image: str  # base64 encoded image

# Face embedding request/response schemas
class FaceEmbedRequest(BaseModel):
    image: str  # base64 image (data URL or raw base64)

class FaceVerifyRequest(BaseModel):
    image: str  # image to verify
    reference: List[float]  # previously stored normalized embedding

def _decode_image_to_rgb(image_b64: str) -> Optional[Image.Image]:
    try:
        raw = image_b64.split(',')[1] if ',' in image_b64 else image_b64
        img_bytes = base64.b64decode(raw)
        pil = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        return pil
    except Exception as e:  # pragma: no cover
        print('[FaceNet] decode error:', e)
        return None

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
mtcnn: Optional[MTCNN] = None
resnet: Optional[InceptionResnetV1] = None

if FACENET_AVAILABLE:
    try:
        print(f"[FaceNet] Initializing models on device={DEVICE} ...")
        # MTCNN for detection + alignment
        mtcnn = MTCNN(image_size=160, margin=20, device=DEVICE, post_process=True)
        # InceptionResnetV1 pretrained on VGGFace2
        resnet = InceptionResnetV1(pretrained='vggface2').eval().to(DEVICE)
        print("[FaceNet] Models ready.")
    except Exception as e:  # pragma: no cover
        print("[FaceNet] Initialization failed:", e)
        mtcnn = None
        resnet = None

@app.get("/")
async def root():
    return {
        "status": "running",
        "model_path": MODEL_PATH,
        "detections": DETECTIONS
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/detect")
async def detect(req: DetectionRequest):
    """
    Detect tongue position from image

    Request:
        image: base64 encoded image string

    Response:
        detection: one of [tongue_left, tongue_right, tongue_up, tongue_down, tongue_center, no_tongue]
        confidence: float between 0 and 1
    """
    try:
        # Decode base64 image
        img_data = base64.b64decode(req.image.split(',')[1] if ',' in req.image else req.image)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"error": "Failed to decode image", "detection": "no_tongue", "confidence": 0.0}

        # Run YOLO inference
        results = model.predict(img, conf=0.25, verbose=False)

        # No detections
        if len(results[0].boxes) == 0:
            return {
                "detection": "no_tongue",
                "confidence": 1.0
            }

        # Get highest confidence detection
        box = results[0].boxes[0]
        cls_id = int(box.cls[0])
        confidence = float(box.conf[0])

        return {
            "detection": model.names[cls_id],
            "confidence": confidence
        }

    except Exception as e:
        return {
            "error": str(e),
            "detection": "no_tongue",
            "confidence": 0.0
        }

# Run with: uvicorn server:app --reload --port 8000

@app.post("/face/embed")
async def face_embed(req: FaceEmbedRequest):
    """
    Generate a 512-dim FaceNet embedding for a single face in the image.
    Returns { embedding: [...], dimension: 512 }
    """
    if not (FACENET_AVAILABLE and mtcnn and resnet):
        return {"error": "FaceNet not available on server", "embedding": None}
    pil = _decode_image_to_rgb(req.image)
    if pil is None:
        return {"error": "Could not decode image", "embedding": None}
    try:
        # Detect + align
        aligned = await _run_in_threadpool_mtcnn(pil)
        if aligned is None:
            return {"error": "No face detected", "embedding": None}
        with torch.no_grad():
            emb = resnet(aligned.to(DEVICE)).cpu().numpy()[0]
        # L2 normalize
        norm = np.linalg.norm(emb) or 1.0
        emb = emb / norm
        return {"embedding": emb.tolist(), "dimension": len(emb)}
    except Exception as e:  # pragma: no cover
        return {"error": str(e), "embedding": None}

@app.post("/face/verify")
async def face_verify(req: FaceVerifyRequest):
    """
    Compare face in provided image against a stored reference embedding.
    Request: { image: base64, reference: [float...] }
    Response: { similarity: float, match: bool, threshold: float }
    """
    if not (FACENET_AVAILABLE and mtcnn and resnet):
        return {"error": "FaceNet not available on server"}
    if len(req.reference) == 0:
        return {"error": "Empty reference embedding"}
    pil = _decode_image_to_rgb(req.image)
    if pil is None:
        return {"error": "Could not decode image"}
    try:
        aligned = await _run_in_threadpool_mtcnn(pil)
        if aligned is None:
            return {"error": "No face detected"}
        with torch.no_grad():
            emb = resnet(aligned.to(DEVICE)).cpu().numpy()[0]
        norm = np.linalg.norm(emb) or 1.0
        emb = emb / norm
        ref = np.array(req.reference, dtype=np.float32)
        ref_norm = np.linalg.norm(ref) or 1.0
        ref = ref / ref_norm
        similarity = float(np.dot(emb, ref))
        threshold = 0.7  # adjustable
        match = similarity >= threshold
        return {"similarity": similarity, "match": match, "threshold": threshold}
    except Exception as e:  # pragma: no cover
        return {"error": str(e)}

async def _run_in_threadpool_mtcnn(pil: Image.Image):
    """Run MTCNN forward in a threadpool (mtcnn is sync but FastAPI endpoint is async)."""
    # Import here to avoid mandatory dependency if route unused
    from starlette.concurrency import run_in_threadpool
    def _forward():
        assert mtcnn is not None
        x = mtcnn(pil)
        return x.unsqueeze(0) if x is not None else None
    return await run_in_threadpool(_forward)
