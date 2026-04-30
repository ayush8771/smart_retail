import cv2
import requests
import time
import os
import pandas as pd
from datetime import datetime
from ultralytics import YOLO
from prophet import Prophet

CAMERA_URL     = os.getenv("CAMERA_URL", "http://10.81.151.149:8080/video")
SHELF_ID       = os.getenv("SHELF_ID", "shelf_05")
NODE_URL       = os.getenv("NODE_BACKEND_URL", "http://localhost:5000")
ALERT_COOLDOWN = 20  # seconds between alerts per product
CSV_PATH       = "D:\ANVESH\AIT\hacks\sjb\smart_retail\backend\prisma\sales_data.csv"

# ── Default stock levels per product (used when DB not available) ─────────────
DEFAULT_STOCK = {
    "prod_01": 8,   # act2 popcorn
    "prod_02": 4,   # cricket ball
    "prod_03": 6,   # dove intense repair shampoo
    "prod_05": 5,   # everest sambhar masala
    "prod_06": 3,   # glutamine powder
    "prod_07": 12,  # noodles 4 pack
    "prod_08": 7,   # parachute advanced gold coconut oil
    "prod_10": 14,  # patanjali atta noodles
    "prod_11": 11,  # patanjali label
    "prod_12": 6,   # patanjali noodles chatpata masala
    "prod_14": 5,   # patanjali noodles yummy masala
    "prod_15": 4,   # rasayana ayurvedic chai
    "prod_16": 7,   # royal dry fruits badam giri
    "prod_17": 9,   # royal label
}

PLANOGRAM = [
    {"id": "prod_01", "name": "act2 popcorn",                       "x": [0.00, 0.35], "y": [0.00, 0.30]},
    {"id": "prod_02", "name": "cricket ball",                        "x": [0.35, 0.55], "y": [0.00, 0.30]},
    {"id": "prod_03", "name": "dove intense repair shampoo",         "x": [0.55, 0.72], "y": [0.00, 0.30]},
    {"id": "prod_08", "name": "parachute advanced gold coconut oil", "x": [0.72, 1.00], "y": [0.00, 0.30]},
    {"id": "prod_05", "name": "everest sambhar masala",              "x": [0.00, 0.42], "y": [0.30, 0.58]},
    {"id": "prod_06", "name": "glutamine powder",                    "x": [0.42, 0.68], "y": [0.30, 0.58]},
    {"id": "prod_07", "name": "noodles 4 pack",                      "x": [0.68, 1.00], "y": [0.30, 0.58]},
    {"id": "prod_10", "name": "patanjali atta noodles",              "x": [0.00, 0.17], "y": [0.58, 0.85]},
    {"id": "prod_12", "name": "patanjali noodles chatpata masala",   "x": [0.17, 0.45], "y": [0.58, 0.85]},
    {"id": "prod_14", "name": "patanjali noodles yummy masala",      "x": [0.45, 0.63], "y": [0.58, 0.85]},
    {"id": "prod_15", "name": "rasayana ayurvedic chai",             "x": [0.63, 0.78], "y": [0.58, 0.85]},
    {"id": "prod_16", "name": "royal dry fruits badam giri",         "x": [0.78, 1.00], "y": [0.58, 0.85]},
    {"id": "prod_11", "name": "patanjali label",                     "x": [0.00, 0.50], "y": [0.85, 1.00]},
    {"id": "prod_17", "name": "royal label",                         "x": [0.50, 1.00], "y": [0.85, 1.00]},
]

restock_priority = []
prophet_cache = {}  # cache Prophet results per product to avoid re-running every frame


def resolve_product(cx_norm, cy_norm):
    for zone in PLANOGRAM:
        if (zone["x"][0] <= cx_norm < zone["x"][1] and
                zone["y"][0] <= cy_norm < zone["y"][1]):
            return zone
    return None


def run_prophet(product_id, product_name):
    # return cached result if available (Prophet is slow, no need to rerun every alert)
    if product_id in prophet_cache:
        cached = prophet_cache[product_id]
        print(f"   [Prophet] Using cached forecast for {product_name}")
        return cached

    current_stock = DEFAULT_STOCK.get(product_id, 5)

    try:
        df = pd.read_csv(CSV_PATH)
        df.columns = df.columns.str.strip()
        pdf = df[df["product_id"] == product_name][["ds", "y"]].copy()
        pdf["ds"] = pd.to_datetime(pdf["ds"])
        pdf = pdf.sort_values("ds").reset_index(drop=True)

        if len(pdf) < 2:
            print(f"   [Prophet] Not enough data for {product_name}, using defaults")
            result = {
                "hours_until_stockout":   round(current_stock / (5.0 / 24.0), 2),
                "predicted_daily_demand": 5.0,
                "priority":               "warning",
                "current_stock":          current_stock
            }
            prophet_cache[product_id] = result
            return result

        print(f"   [Prophet] Fitting model for {product_name}...")
        m = Prophet(daily_seasonality=True, weekly_seasonality=True, yearly_seasonality=False)
        m.fit(pdf)
        future = m.make_future_dataframe(periods=1, freq="D")
        forecast = m.predict(future)

        daily_demand = max(float(forecast.iloc[-1]["yhat"]), 0.1)
        hours_until_stockout = current_stock / (daily_demand / 24.0)

        hours_until_stockout = min(hours_until_stockout, 48.0)
        if hours_until_stockout < 6:
            priority = "critical"
        elif hours_until_stockout < 24:
            priority = "warning"
        else:
            priority = "ok"

        result = {
            "hours_until_stockout":   round(hours_until_stockout, 2),
            "predicted_daily_demand": round(daily_demand, 2),
            "priority":               priority,
            "current_stock":          current_stock
        }

        prophet_cache[product_id] = result
        print(f"   [Prophet] {product_name} → {daily_demand:.1f} units/day | stockout in {hours_until_stockout:.1f}h | {priority.upper()}")
        return result

    except Exception as e:
        print(f"   [Prophet] Error for {product_name}: {e}")
        result = {
            "hours_until_stockout":   round(current_stock / (5.0 / 24.0), 2),
            "predicted_daily_demand": 5.0,
            "priority":               "warning",
            "current_stock":          current_stock
        }
        prophet_cache[product_id] = result
        return result


def update_restock_priority(product, forecast):
    global restock_priority
    restock_priority = [r for r in restock_priority if r["product_id"] != product["id"]]

    restock_qty = round(forecast["predicted_daily_demand"] * 3)

    entry = {
        "product_id":             product["id"],
        "product_name":           product["name"],
        "priority":               forecast["priority"],
        "hours_until_stockout":   forecast["hours_until_stockout"],
        "predicted_daily_demand": forecast["predicted_daily_demand"],
        "recommended_qty":        restock_qty,
        "current_stock":          forecast["current_stock"],
        "detected_at":            datetime.now().strftime("%H:%M:%S")
    }
    restock_priority.append(entry)

    restock_priority.sort(key=lambda x: (
        0 if x["priority"] == "critical" else 1 if x["priority"] == "warning" else 2,
        x["hours_until_stockout"]
    ))

    print("\n📋 RESTOCK PRIORITY LIST:")
    print(f"  {'#':<3} {'Product':<40} {'Priority':<10} {'Stockout In':<14} {'Restock Qty':<12} {'Detected At'}")
    print(f"  {'-'*3} {'-'*40} {'-'*10} {'-'*14} {'-'*12} {'-'*11}")
    for i, r in enumerate(restock_priority, 1):
        icon = "🔴" if r["priority"] == "critical" else "🟡"
        print(f"  {i:<3} {icon} {r['product_name']:<38} {r['priority']:<10} {r['hours_until_stockout']:<14.1f} {r['recommended_qty']:<12} {r['detected_at']}")
    print()


def send_alert(product, forecast, bbox):
    payload = {
        "product_id":             product["id"],
        "product_name":           product["name"],
        "shelf_id":               SHELF_ID,
        "hours_until_stockout":   forecast["hours_until_stockout"],
        "priority":               forecast["priority"],
        "predicted_daily_demand": forecast["predicted_daily_demand"],
        "current_stock":          forecast["current_stock"],
        "forecasted_at":          datetime.utcnow().isoformat(),
        "bbox":                   bbox
    }
    try:
        r = requests.post(f"{NODE_URL}/api/detect/alert", json=payload, timeout=5)
        print(f"   ✅ Alert sent to dashboard [{r.status_code}] at {datetime.now().strftime('%H:%M:%S')}")
    except Exception as e:
        print(f"   ❌ Backend unreachable: {e}")


def draw_countdown(frame, last_alert, current_time):
    """Draw countdown timers on frame for each product in cooldown."""
    y_offset = 60
    for product_id, alert_time in last_alert.items():
        remaining = ALERT_COOLDOWN - (current_time - alert_time)
        if remaining > 0:
            # find product name
            name = next((p["name"] for p in PLANOGRAM if p["id"] == product_id), product_id)
            short_name = name[:25] + "..." if len(name) > 25 else name
            countdown_text = f"Cooldown [{short_name}]: {int(remaining)}s"
            cv2.putText(
                frame,
                countdown_text,
                (10, y_offset),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 165, 255),  # orange
                1
            )
            y_offset += 22


def run():
    model = YOLO("best.pt")
    print("🚀 ShelfSense LIVE — Real Time Detection")
    print(f"   Camera : {CAMERA_URL}")
    print(f"   Shelf  : {SHELF_ID}")
    print(f"   Cooldown: {ALERT_COOLDOWN}s per product")
    print(f"   Press Q to quit\n")

    cap = cv2.VideoCapture(CAMERA_URL)
    if not cap.isOpened():
        print(f"❌ Cannot connect to camera at {CAMERA_URL}")
        return

    print("✅ Camera connected\n")

    last_alert: dict[str, float] = {}

    while True:
        ret, frame = cap.read()
        if not ret:
            print("⚠️  Frame capture failed. Reconnecting in 5s...")
            time.sleep(5)
            cap.release()
            cap = cv2.VideoCapture(CAMERA_URL)
            continue

        h, w = frame.shape[:2]
        current_time = time.time()

        results = model.predict(frame, conf=0.4, verbose=False)
        annotated_frame = results[0].plot()

        for result in results:
            for box in result.boxes:
                cls_name = model.names[int(box.cls)].lower().strip()

                if "undefined" not in cls_name:
                    continue

                x1, y1, x2, y2 = box.xyxy[0].tolist()

                # ignore tiny detections — likely noise/background
                bbox_width  = (x2 - x1) / w
                bbox_height = (y2 - y1) / h
                if bbox_width < 0.05 or bbox_height < 0.05:
                    continue

                # ignore very low confidence
                if float(box.conf) < 0.5:
                    continue

                cx_norm = ((x1 + x2) / 2) / w
                cy_norm = ((y1 + y2) / 2) / h

                product = resolve_product(cx_norm, cy_norm)
                if not product:
                    continue

                # ── COOLDOWN CHECK before running Prophet ─────────────────────
                time_since_last = current_time - last_alert.get(product["id"], 0)
                if time_since_last < ALERT_COOLDOWN:
                    remaining = int(ALERT_COOLDOWN - time_since_last)
                    # just draw bbox, skip alert
                    cv2.putText(
                        annotated_frame,
                        f"Cooldown: {remaining}s",
                        (int(x1), int(y1) - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 165, 255),
                        2
                    )
                    continue

                # ── cooldown passed — run Prophet and send alert ──────────────
                last_alert[product["id"]] = current_time

                print(f"\n🔍 [{datetime.now().strftime('%H:%M:%S')}] Gap detected: {product['name']}")
                forecast = run_prophet(product["id"], product["name"])

                if forecast["priority"] == "ok":
                    print(f"   ✅ Stock sufficient ({forecast['hours_until_stockout']:.1f}h) — no alert needed")
                    continue

                send_alert(product, forecast, [x1, y1, x2, y2])
                update_restock_priority(product, forecast)

        # ── draw countdown overlays on frame ─────────────────────────────────
        draw_countdown(annotated_frame, last_alert, current_time)

        # ── status bar at top ─────────────────────────────────────────────────
        timestamp = datetime.now().strftime("%H:%M:%S")
        cv2.putText(
            annotated_frame,
            f"ShelfSense LIVE  |  {SHELF_ID}  |  {timestamp}  |  Cooldown: {ALERT_COOLDOWN}s",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2
        )

        cv2.imshow("ShelfSense — Real Time Shelf Detection", annotated_frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("\n👋 Shutting down ShelfSense...")
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    run()