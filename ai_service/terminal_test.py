import cv2
from ultralytics import YOLO
from collections import Counter

model = YOLO("best.pt")
url = "http://10.81.151.149:8080/video" 
cap = cv2.VideoCapture(url)

history = [] # To store last 10 detections

print("--- STABILIZED TERMINAL TEST ---")

while True:
    ret, frame = cap.read()
    if not ret: break

    results = model(frame, conf=0.4, verbose=False)
    
    current_frame_counts = []
    for r in results:
        for c in r.boxes.cls:
            current_frame_counts.append(model.names[int(c)])
    
    # Add to history and keep only last 10 frames
    history.append(Counter(current_frame_counts))
    if len(history) > 10:
        history.pop(0)

    # Average the counts
    final_counts = {}
    for item in set(history[-1].keys()):
        avg = sum(h[item] for h in history) // len(history)
        if avg > 0:
            final_counts[item] = avg

    print(f"\rStabilized Inventory: {final_counts}       ", end="")
    cv2.imshow("Handheld Test", results[0].plot())

    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()