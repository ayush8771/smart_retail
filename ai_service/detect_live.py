import cv2
import requests
from ultralytics import YOLO

# 1. Load your custom trained brain
model = YOLO("best.pt")

# 2. Your Phone's IP address
video_url = "http://10.81.151.35:8080/video" 

# --- NEW: The Express Server API Endpoint ---
# Change 'A1' to whatever your actual test shelf ID is!
EXPRESS_API_URL = "http://localhost:5000/api/detect/A1"

cap = cv2.VideoCapture(video_url)

print("Starting Kirana AI Live Feed...")

frame_counter = 0

while True:
    ret, frame = cap.read()
    if not ret:
        print("Error: Could not connect to the phone. Check the IP address.")
        break

    # 3. Predict products and gaps (conf=0.5 means 50% confidence)
    results = model.predict(frame, conf=0.5)

    # 4. Draw results on the frame
    annotated_frame = results[0].plot()

    # 5. Show the window locally
    cv2.imshow("Kirana AI - Real Time Inventory", annotated_frame)

    # --- NEW: Express Integration Pipeline ---
    frame_counter += 1
    # Send an update to the backend every 30 frames (approx 1 second)
    if frame_counter % 30 == 0:
        try:
            # Compress the current frame to a JPEG in memory
            _, buffer = cv2.imencode('.jpg', frame)
            
            # Package it exactly how multer expects it in Express ('file')
            files = {
                'file': ('live_feed.jpg', buffer.tobytes(), 'image/jpeg')
            }
            
            # POST the image to the Express backend
            response = requests.post(EXPRESS_API_URL, files=files)
            print(f"Sent frame to Express. Status: {response.status_code}")
            
        except Exception as e:
            print(f"Failed to reach Express server: {e}")

    # Press 'q' to stop the demo
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()