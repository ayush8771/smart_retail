import cv2
import requests
import base64
import time
import os
from datetime import datetime

CAMERA_URL    = os.getenv("CAMERA_URL", "http://10.81.151.149:8080/video")
SHELF_ID      = os.getenv("SHELF_ID", "shelf_05")
NODE_URL      = os.getenv("NODE_BACKEND_URL", "http://localhost:5000")
SCAN_INTERVAL = int(os.getenv("SCAN_INTERVAL", "30"))

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def run():
    from ultralytics import YOLO
    model = YOLO("best.pt")

    log(f"ShelfSense LIVE starting — Shelf: {SHELF_ID}")
    log(f"Camera: {CAMERA_URL}")
    log(f"Scan interval: {SCAN_INTERVAL}s")

    cap = cv2.VideoCapture(CAMERA_URL)

    if not cap.isOpened():
        log(f"ERROR: Cannot connect to camera at {CAMERA_URL}")
        log("Check: Is the camera IP correct? Is it on the same WiFi network?")
        return

    log("Camera connected successfully ✅")
    log("Press Q to quit the window")

    last_scan_time = 0

    while True:
        ret, frame = cap.read()

        if not ret:
            log("WARN: Frame capture failed. Reconnecting in 5s...")
            time.sleep(5)
            cap.release()
            cap = cv2.VideoCapture(CAMERA_URL)
            continue

        # ── Always run YOLO on every frame for live display ──
        results = model.predict(frame, conf=0.5, verbose=False)
        annotated_frame = results[0].plot()

        # ── Overlay status text on the window ──
        now = time.time()
        seconds_until_next = max(0, int(SCAN_INTERVAL - (now - last_scan_time)))
        cv2.putText(
            annotated_frame,
            f"ShelfSense LIVE  |  Shelf: {SHELF_ID}  |  Next alert scan in: {seconds_until_next}s",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

        cv2.imshow("ShelfSense — Real Time Shelf Detection", annotated_frame)

        # ── Every SCAN_INTERVAL seconds, send frame to Node → FastAPI → Prophet → alert ──
        if now - last_scan_time >= SCAN_INTERVAL:
            last_scan_time = now
            log(f"Sending frame to backend for gap analysis + Prophet forecast...")

            try:
                _, buffer = cv2.imencode('.jpg', frame)
                image_b64 = base64.b64encode(buffer).decode('utf-8')

                response = requests.post(
                    f"{NODE_URL}/api/detect/scan/{SHELF_ID}",
                    json={"imageBase64": image_b64},
                    timeout=60
                )

                if response.status_code != 200:
                    log(f"ERROR: Node returned {response.status_code}: {response.text}")
                    continue

                data = response.json()
                gaps = data.get("total_gaps", 0)

                if gaps > 0:
                    log(f"🔴 {gaps} GAP(S) DETECTED on {SHELF_ID}:")
                    for alert in data.get("gap_alerts", []):
                        if alert.get("error"):
                            log(f"   ⚠ Forecast error: {alert.get('error')}")
                            continue
                        log(f"   → Product : {alert.get('product_name', 'Unknown')}")
                        log(f"   → Priority: {alert.get('priority', '?').upper()}")
                        log(f"   → Stockout: {alert.get('hours_until_stockout', '?')}h remaining")
                        log(f"   → Demand  : {alert.get('predicted_daily_demand', '?')} units/day")
                    log("   ✅ Alert pushed to dashboard via WebSocket")
                else:
                    log(f"✅ {SHELF_ID} fully stocked — no gaps detected")

            except requests.exceptions.Timeout:
                log("ERROR: Request to Node timed out (60s). Is backend running?")
            except requests.exceptions.ConnectionError:
                log(f"ERROR: Cannot reach Node at {NODE_URL}. Is backend running on port 5000?")
            except Exception as e:
                log(f"ERROR: {e}")

        # ── Q to quit ──
        if cv2.waitKey(1) & 0xFF == ord('q'):
            log("Shutting down...")
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run()