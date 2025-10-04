# Tongue Detection Model Server

FastAPI server that runs YOLOv8 model for real-time tongue position detection.

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Add Jensen's trained model
# Place best.pt in models/ folder

# Run server
uvicorn server:app --reload --port 8000
```

## Usage

Server runs on `http://localhost:8000`

**Endpoints:**
- `GET /` - Server status
- `GET /health` - Health check
- `POST /detect` - Detect tongue position from base64 image

**Detection classes:**
- tongue_left
- tongue_right
- tongue_up
- tongue_down
- tongue_center
- no_tongue
