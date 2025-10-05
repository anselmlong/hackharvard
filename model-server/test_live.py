import cv2
import requests
import base64
import time

# Start webcam
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

if not cap.isOpened():
    print("ERROR: Could not open camera")
    exit(1)

print("Camera opened successfully!")
print("Starting live detection... Press 'q' to quit")
print("-" * 50)

# Wait for camera to warm up
print("Warming up camera...")
for _ in range(10):
    cap.read()  # Discard first few frames
time.sleep(0.5)

frame_count = 0
fps_time = time.time()
fps = 0
retry_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        retry_count += 1
        if retry_count > 30:
            print("\nCamera lost, exiting...")
            break
        print(f"Warning: Failed to read frame ({retry_count}/30), retrying...")
        time.sleep(0.1)
        continue

    retry_count = 0  # Reset on successful read

    # Encode frame to base64
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    img_b64 = base64.b64encode(buffer).decode('utf-8')
    img_data_url = f"data:image/jpeg;base64,{img_b64}"

    try:
        # Send to FastAPI
        response = requests.post(
            'http://localhost:8000/detect',
            json={'image': img_data_url},
            timeout=1
        )

        result = response.json()
        detection = result.get('detection', 'unknown')
        confidence = result.get('confidence', 0)

        # Display on frame
        color = (0, 255, 0) if confidence > 0.7 else (0, 255, 255)
        cv2.putText(frame, f"Detection: {detection}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        cv2.putText(frame, f"Confidence: {confidence:.2%}", (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        cv2.putText(frame, f"FPS: {fps}", (10, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Print to console
        print(f"\r{detection:15s} | {confidence:.2%}", end='')

    except Exception as e:
        cv2.putText(frame, f"Error: {str(e)[:30]}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)

    # Calculate FPS
    frame_count += 1
    if time.time() - fps_time >= 1.0:
        fps = frame_count
        frame_count = 0
        fps_time = time.time()

    # Show frame
    cv2.imshow('YOLO Live Test (Press Q to quit)', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("\nStopped.")
