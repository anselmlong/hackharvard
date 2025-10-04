# Tongue Detection Model Server

FastAPI server that runs YOLOv8 model for real-time tongue position detection.

## Setup

```bash

# 2. Add required environment variables to .env.local:
# - MODEL_PATH="../yolo/runs/detect/exp1/weights/best.pt"
# - MODEL_SERVER_URL="http://localhost:8000"
# - NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Run server
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
