FROM python:3.11-slim

# Prevent python from writing .pyc files and enable unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# System dependencies for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (better build caching)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy YOLO weights and artifacts explicitly (helps caching when code changes)
COPY yolo/ ./yolo/

# Copy the server source
COPY . .

EXPOSE 8000

# Start the FastAPI server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]


