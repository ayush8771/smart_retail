import cv2
from ultralytics import YOLO

# 1. Load your custom trained brain
model = YOLO("best.pt")

# 2. Your Phone's IP address (Change this to the one on your phone screen!)
# IMPORTANT: Add '/video' at the end of the IP
url = "http://192.168.137.130:8080/video" 

cap = cv2.VideoCapture(video_url)

print("Starting Kirana AI Live Feed...")

while True:
    ret, frame = cap.read()
    if not ret:
        print("Error: Could not connect to the phone. Check the IP address.")
        break

    # 3. Predict products and gaps (conf=0.5 means 50% confidence)
    results = model.predict(frame, conf=0.5)

    # 4. Draw results on the frame
    annotated_frame = results[0].plot()

    # 5. Show the window
    cv2.imshow("Kirana AI - Real Time Inventory", annotated_frame)

    # Press 'q' to stop the demo
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()