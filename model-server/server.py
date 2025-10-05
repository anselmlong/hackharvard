from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
import cv2
import numpy as np
import base64
import os

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
