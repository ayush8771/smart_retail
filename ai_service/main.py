from fastapi import FastAPI, UploadFile, File
from prophet import Prophet
import pandas as pd
import numpy as np
import cv2, requests, os
from ultralytics import YOLO
from datetime import datetime
import torch
from ultralytics.nn.tasks import DetectionModel

torch.serialization.add_safe_globals([DetectionModel])
torch.serialization.add_safe_globals([torch.nn.modules.container.Sequential])

try:
    from ultralytics.nn.modules.block import Bottleneck, C2f, C3k2
    from ultralytics.nn.modules.conv import Conv, Concat
    from ultralytics.nn.modules.head import Detect
    torch.serialization.add_safe_globals([Bottleneck, C2f, C3k2, Conv, Concat, Detect])
except ImportError:
    print("[WARN] Some YOLO blocks not found. Try: pip install --upgrade ultralytics")
    pass

app = FastAPI()

model = YOLO("best.pt")

NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:5000")
CSV_PATH = os.path.join(os.path.dirname(__file__), "../backend/prisma/sales_data.csv")

# ── product_id → product name (must match CSV product_id column exactly) ──────
PLANOGRAM: dict[tuple, str] = {
    # Row 1 — top shelf (left to right)
    ("shelf_05", "zone_r1_act2"):        "prod_01",  # act2 popcorn
    ("shelf_05", "zone_r1_cricket"):     "prod_02",  # cricket ball
    ("shelf_05", "zone_r1_dove"):        "prod_03",  # dove intense repair shampoo
    ("shelf_05", "zone_r1_parachute"):   "prod_08",  # parachute advanced gold coconut oil

    # Row 2 — second shelf
    ("shelf_05", "zone_r2_everest"):     "prod_05",  # everest sambhar masala
    ("shelf_05", "zone_r2_glutamine"):   "prod_06",  # glutamine powder
    ("shelf_05", "zone_r2_noodles4"):    "prod_07",  # noodles 4 pack

    # Row 3 — third shelf
    ("shelf_05", "zone_r3_patta"):       "prod_10",  # patanjali atta noodles
    ("shelf_05", "zone_r3_pchatpata"):   "prod_12",  # patanjali noodles chatpata masala
    ("shelf_05", "zone_r3_pyummy"):      "prod_14",  # patanjali noodles yummy masala
    ("shelf_05", "zone_r3_rasayana"):    "prod_15",  # rasayana ayurvedic chai
    ("shelf_05", "zone_r3_royal"):       "prod_16",  # royal dry fruits badam giri

    # Row 4 — bottom labels
    ("shelf_05", "zone_r4_plabel"):      "prod_11",  # patanjali label
    ("shelf_05", "zone_r4_royal"):       "prod_17",  # royal label
}

PRODUCT_NAMES: dict[str, str] = {
    "prod_01": "act2 popcorn",
    "prod_02": "cricket ball",
    "prod_03": "dove intense repair shampoo",
    "prod_04": "everest label",
    "prod_05": "everest sambhar masala",
    "prod_06": "glutamine powder",
    "prod_07": "noodles 4 pack",
    "prod_08": "parachute advanced gold coconut oil",
    "prod_09": "parachute label",
    "prod_10": "patanjali atta noodles",
    "prod_11": "patanjali label",
    "prod_12": "patanjali noodles chatpata masala",
    "prod_13": "patanjali noodles chatpata masala 4 pack",
    "prod_14": "patanjali noodles yummy masala",
    "prod_15": "rasayana ayurvedic chai",
    "prod_16": "royal dry fruits badam giri",
    "prod_17": "royal label",
}

# ── Zone grid: shelf_id → list of (zone_id, x_start, x_end) ──────────────────
ZONE_GRID: dict[str, list[tuple]] = {
    "shelf_05": [
        # Row 1 — top shelf (y: 0.0 to 0.30)
        ("zone_r1_act2",      0.00, 0.38, 0.00, 0.30),
        ("zone_r1_cricket",   0.38, 0.58, 0.00, 0.30),
        ("zone_r1_dove",      0.58, 0.75, 0.00, 0.30),
        ("zone_r1_parachute", 0.75, 1.00, 0.00, 0.30),

        # Row 2 — second shelf (y: 0.30 to 0.58)
        ("zone_r2_everest",   0.00, 0.50, 0.30, 0.58),
        ("zone_r2_glutamine", 0.50, 0.75, 0.30, 0.58),
        ("zone_r2_noodles4",  0.75, 1.00, 0.30, 0.58),

        # Row 3 — third shelf (y: 0.58 to 0.85)
        ("zone_r3_patta",     0.00, 0.18, 0.58, 0.85),
        ("zone_r3_pchatpata", 0.18, 0.50, 0.58, 0.85),
        ("zone_r3_pyummy",    0.50, 0.65, 0.58, 0.85),
        ("zone_r3_rasayana",  0.65, 0.80, 0.58, 0.85),
        ("zone_r3_royal",     0.80, 1.00, 0.58, 0.85),

        # Row 4 — bottom (y: 0.85 to 1.0)
        ("zone_r4_plabel",    0.00, 0.50, 0.85, 1.00),
        ("zone_r4_royal",     0.50, 1.00, 0.85, 1.00),
    ]
}


def resolve_product_from_bbox(shelf_id: str, bbox_cx_norm: float, bbox_cy_norm: float):
    zones = ZONE_GRID.get(shelf_id, [])
    for zone_id, x_start, x_end, y_start, y_end in zones:
        if x_start <= bbox_cx_norm < x_end and y_start <= bbox_cy_norm < y_end:
            return PLANOGRAM.get((shelf_id, zone_id))
    return None


def run_prophet_forecast(product_id: str, current_stock: float) -> dict:
    product_name = PRODUCT_NAMES.get(product_id)
    if not product_name:
        return {"error": "unknown product"}

    try:
        df = pd.read_csv(CSV_PATH)
        df.columns = df.columns.str.strip()

        # CSV column named 'product_id' stores product names like 'act2 popcorn'
        pdf = df[df["product_id"] == product_name][["ds", "y"]].copy()
        pdf["ds"] = pd.to_datetime(pdf["ds"])
        pdf = pdf.sort_values("ds").reset_index(drop=True)

        if len(pdf) < 2:
            print(f"[WARN] Not enough sales data for {product_name}")
            return {"error": "insufficient history"}

        m = Prophet(
            daily_seasonality=True,
            weekly_seasonality=True,
            yearly_seasonality=False
        )
        m.fit(pdf)

        future = m.make_future_dataframe(periods=1, freq="D")
        forecast = m.predict(future)

        predicted_daily_demand = max(float(forecast.iloc[-1]["yhat"]), 0.1)
        predicted_hourly_demand = predicted_daily_demand / 24.0
        hours_until_stockout = current_stock / predicted_hourly_demand
        hours_until_stockout = min(hours_until_stockout, 48.0)

        if hours_until_stockout < 6:
            priority = "critical"
        elif hours_until_stockout < 24:
            priority = "warning"
        else:
            priority = "ok"

        print(f"[PROPHET] {product_name} | stock={current_stock} | demand={predicted_daily_demand:.1f}/day | stockout in {hours_until_stockout:.1f}h | {priority.upper()}")

        return {
            "product_id":             product_id,
            "product_name":           product_name,
            "predicted_daily_demand": round(predicted_daily_demand, 2),
            "hours_until_stockout":   round(hours_until_stockout, 2),
            "priority":               priority,
            "current_stock":          current_stock,
            "forecasted_at":          datetime.utcnow().isoformat(),
        }

    except Exception as e:
        print(f"[ERROR] Prophet failed for {product_name}: {e}")
        return {"error": str(e)}


def push_alert_to_node(payload: dict):
    try:
        r = requests.post(
            f"{NODE_BACKEND_URL}/api/detect/alert",
            json=payload,
            timeout=3
        )
        print(f"[NODE] Alert pushed → {r.status_code}")
    except Exception as e:
        print(f"[WARN] Could not reach Node backend: {e}")


# ── Main detection endpoint ───────────────────────────────────────────────────

@app.post("/detect/{shelf_id}")
async def detect_shelf(
    shelf_id: str,
    file: UploadFile = File(...),
    current_stocks: str = "{}"
):
    import json
    try:
        stocks: dict = json.loads(current_stocks)
    except Exception:
        stocks = {}

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return {"error": "Failed to decode image"}

    h, w = img.shape[:2]

    results = model(img)[0]

    gap_alerts = []
    product_counts: dict[str, int] = {}

    # set of all known product name strings (lowercase)
    known_products = {v.lower().strip() for v in PRODUCT_NAMES.values()}

    for box in results.boxes:
        # skip low confidence detections
        if float(box.conf) < 0.5:
            continue

        cls_name = model.names[int(box.cls)].lower().strip()
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        cx_norm = ((x1 + x2) / 2) / w
        cy_norm = ((y1 + y2) / 2) / h
        product_id = resolve_product_from_bbox(shelf_id, cx_norm, cy_norm)

        if cls_name == "undefined" or cls_name not in known_products:
            # unknown label = gap/empty zone
            print(f"[GAP] label='{cls_name}' conf={float(box.conf):.2f} cx={cx_norm:.2f} cy={cy_norm:.2f}")

            product_id = resolve_product_from_bbox(shelf_id, cx_norm, cy_norm)

            if product_id:
                print(f"[GAP] Mapped → {product_id} ({PRODUCT_NAMES[product_id]}) on {shelf_id}")
                current_stock = stocks.get(product_id, 0)
                forecast = run_prophet_forecast(product_id, current_stock)

                if forecast.get("priority") in ("critical", "warning"):
                    push_alert_to_node({
                        **forecast,
                        "shelf_id": shelf_id,
                        "bbox": [x1, y1, x2, y2]
                    })

                gap_alerts.append(forecast)
            else:
                print(f"[GAP] cx={cx_norm:.2f} not in PLANOGRAM for {shelf_id}")
        else:
            product_counts[cls_name] = product_counts.get(cls_name, 0) + 1
            print(f"[PRODUCT] {cls_name} conf={float(box.conf):.2f}")

    print(f"[DONE] {shelf_id} → gaps={len(gap_alerts)} products={product_counts}")

    return {
        "shelf_id":      shelf_id,
        "gap_alerts":    gap_alerts,
        "product_counts": product_counts,
        "total_gaps":    len(gap_alerts),
    }


# ── Standalone forecast endpoint ──────────────────────────────────────────────

@app.post("/forecast/{product_id}")
async def forecast_product(product_id: str, data: dict):
    current_stock = data.get("current_stock", 0)
    result = run_prophet_forecast(product_id, current_stock)
    if result.get("priority") in ("critical", "warning"):
        push_alert_to_node(result)
    return result