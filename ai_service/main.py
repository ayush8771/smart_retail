from fastapi import FastAPI, UploadFile, File
from prophet import Prophet
import pandas as pd
import numpy as np
import cv2, requests, os
from ultralytics import YOLO
from datetime import datetime, timedelta
import torch
from ultralytics.nn.tasks import DetectionModel

# ... (your existing imports)

# Allowlist the core YOLO model structure
torch.serialization.add_safe_globals([DetectionModel])
torch.serialization.add_safe_globals([torch.nn.modules.container.Sequential])

# Added C3k2 and other YOLOv11 specific blocks to the allowlist
try:
    from ultralytics.nn.modules.block import Bottleneck, C2f, DFLEnum, C3k2
    from ultralytics.nn.modules.conv import Conv, Concat
    from ultralytics.nn.modules.head import Detect
    # We add C3k2 here
    torch.serialization.add_safe_globals([Bottleneck, C2f, DFLEnum, C3k2, Conv, Concat, Detect])
except ImportError:
    # If C3k2 still isn't found after upgrade, it means the install failed
    print("[ERROR] C3k2 not found. Ensure 'pip install --upgrade ultralytics' was successful.")
    pass

app = FastAPI()
# ... (rest of your code)
model = YOLO("best.pt")  # your trained YOLOv11 weights

NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:5000")
CSV_PATH = "../backend/prisma/sales_data.csv"

# ── Planogram: map (shelf_id, zone_id) → product_id ──────────────────────────
# These zone_ids must match your seed.js SHELF_MAP / PRODUCTS zone_id values.
# Key = (shelf_id, zone_id), Value = product_id from seed.js
PLANOGRAM: dict[tuple, str] = {
    ("shelf_01", "zone_A1"): "prod_01",  # act2 popcorn
    ("shelf_02", "zone_A1"): "prod_02",  # cricket ball
    ("shelf_03", "zone_A1"): "prod_03",  # dove intense repair shampoo
    ("shelf_04", "zone_A1"): "prod_04",  # everest label
    ("shelf_04", "zone_B1"): "prod_05",  # everest sambhar masala
    ("shelf_06", "zone_A1"): "prod_06",  # glutamine powder
    ("shelf_05", "zone_A1"): "prod_07",  # noodles 4 pack
    ("shelf_06", "zone_B1"): "prod_08",  # parachute advanced gold coconut oil
    ("shelf_06", "zone_C1"): "prod_09",  # parachute label
    ("shelf_05", "zone_B1"): "prod_10",  # patanjali atta noodles
    ("shelf_05", "zone_C1"): "prod_11",  # patanjali label
    ("shelf_05", "zone_D1"): "prod_12",  # patanjali noodles chatpata masala
    ("shelf_05", "zone_A2"): "prod_13",  # patanjali noodles chatpata masala 4 pack
    ("shelf_05", "zone_B2"): "prod_14",  # patanjali noodles yummy masala
    ("shelf_07", "zone_A1"): "prod_15",  # rasayana ayurvedic chai
    ("shelf_07", "zone_B1"): "prod_16",  # royal dry fruits badam giri
    ("shelf_07", "zone_C1"): "prod_17",  # royal label
}

# Reverse map: product_id → product_name (must match CSV column exactly)
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

# ── Zone grid layout per shelf ────────────────────────────────────────────────
# Maps each shelf to an ordered list of (zone_id, x_start%, x_end%) in image coords
# Assumes camera sees full shelf width = 100% of image width.
# Tweak these percentages to match your actual camera framing.
ZONE_GRID: dict[str, list[tuple]] = {
    "shelf_01": [("zone_A1", 0.0, 1.0)],
    "shelf_02": [("zone_A1", 0.0, 0.5), ("zone_B1", 0.5, 1.0)],
    "shelf_03": [("zone_A1", 0.0, 1.0)],
    "shelf_04": [("zone_A1", 0.0, 0.5), ("zone_B1", 0.5, 1.0)],
    "shelf_05": [
        ("zone_A1", 0.0, 0.2), ("zone_B1", 0.2, 0.4),
        ("zone_C1", 0.4, 0.6), ("zone_D1", 0.6, 0.8), ("zone_A2", 0.8, 1.0),
        ("zone_B2", 0.0, 0.5),   # second row — adjust per shelf height
    ],
    "shelf_06": [("zone_A1", 0.0, 0.33), ("zone_B1", 0.33, 0.67), ("zone_C1", 0.67, 1.0)],
    "shelf_07": [("zone_A1", 0.0, 0.33), ("zone_B1", 0.33, 0.67), ("zone_C1", 0.67, 1.0)],
}


def resolve_product_from_bbox(shelf_id: str, bbox_cx_norm: float) -> str | None:
    """
    Given a shelf and the normalized center-x of a Gap bbox,
    return the product_id whose zone contains that x position.
    """
    zones = ZONE_GRID.get(shelf_id, [])
    for zone_id, x_start, x_end in zones:
        if x_start <= bbox_cx_norm < x_end:
            return PLANOGRAM.get((shelf_id, zone_id))
    return None


def run_prophet_forecast(product_id: str, current_stock: float) -> dict:
    """
    Reads CSV history for the product, fits Prophet, predicts next-day demand,
    and returns hours_until_stockout + alert level.
    """
    product_name = PRODUCT_NAMES.get(product_id)
    if not product_name:
        return {"error": "unknown product"}

    df = pd.read_csv(CSV_PATH)
    df.columns = df.columns.str.strip()
    df.columns = df.columns.str.strip()
    
    # Filter to this product and rename for Prophet
    pdf = df[df["product_id"] == product_id][["ds", "y"]].copy()
    pdf["ds"] = pd.to_datetime(pdf["ds"])
    pdf = pdf.sort_values("ds").reset_index(drop=True)

    if len(pdf) < 2:
        return {"error": "insufficient history"}

    m = Prophet(daily_seasonality=True, weekly_seasonality=True, yearly_seasonality=False)
    m.fit(pdf)

    future = m.make_future_dataframe(periods=1, freq="D")
    forecast = m.predict(future)

    # predicted demand for tomorrow (last row)
    predicted_daily_demand = max(forecast.iloc[-1]["yhat"], 0.1)  # avoid div/0
    predicted_hourly_demand = predicted_daily_demand / 24.0

    hours_until_stockout = current_stock / predicted_hourly_demand

    priority = "ok"
    if hours_until_stockout < 6:
        priority = "critical"
    elif hours_until_stockout < 24:
        priority = "warning"

    return {
        "product_id": product_id,
        "product_name": product_name,
        "predicted_daily_demand": round(predicted_daily_demand, 2),
        "hours_until_stockout": round(hours_until_stockout, 2),
        "priority": priority,
        "current_stock": current_stock,
        "forecasted_at": datetime.utcnow().isoformat(),
    }


def push_alert_to_node(payload: dict):
    """POST forecast result to Node.js backend."""
    try:
        requests.post(f"{NODE_BACKEND_URL}/api/detect/alert", json=payload, timeout=3)
    except Exception as e:
        print(f"[WARN] Could not reach Node backend: {e}")


# ── Main detection endpoint ───────────────────────────────────────────────────

@app.post("/detect/{shelf_id}")
async def detect_shelf(shelf_id: str, file: UploadFile = File(...), current_stocks: str = "{}"):
    import json
    try:
        stocks: dict = json.loads(current_stocks)
    except Exception as e:
        print(f"Error parsing stocks: {e}")
        stocks = {}

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        return {"error": "Failed to decode image"}
        
    h, w = img.shape[:2]

    # Run YOLOv11 Detection
    results = model(img)[0]

    gap_alerts = []
    product_counts: dict[str, int] = {}

    for box in results.boxes:
        # Get class name and normalize center-x
        cls_name = model.names[int(box.cls)].lower()
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        cx_norm = ((x1 + x2) / 2) / w  # Key for handheld spatial mapping

        # 1. Check if YOLO identified a gap
        if cls_name in ("gap", "empty", "void", "undefined"):
            # 2. SPATIAL BRIDGE: Map the gap's X-coordinate to a Product ID
            product_id = resolve_product_from_bbox(shelf_id, cx_norm)
            
            if product_id:
                print(f"--- GAP DETECTED: {product_id} on {shelf_id} ---")
                
                # 3. PROPHET ACTIVATION: Fetch stock and trigger forecast
                current_stock = stocks.get(product_id, 0)
                forecast = run_prophet_forecast(product_id, current_stock)

                # 4. BACKEND SYNC: Push to Node.js if restocking is needed
                if forecast.get("priority") in ("critical", "warning"):
                    push_alert_to_node({**forecast, "shelf_id": shelf_id, "bbox": [x1, y1, x2, y2]})

                gap_alerts.append(forecast)
            else:
                print(f"Gap detected at {cx_norm:.2f} but no product assigned in PLANOGRAM.")
        else:
            # Track visible items for inventory cross-referencing
            product_counts[cls_name] = product_counts.get(cls_name, 0) + 1

    return {
        "shelf_id": shelf_id,
        "gap_alerts": gap_alerts,
        "product_counts": product_counts,
        "total_gaps": len(gap_alerts),
    }
@app.post("/forecast/{product_id}")
async def forecast_product(product_id: str, data: dict): # Add 'data: dict' here
    current_stock = data.get("current_stock", 0) # Get the value from the body
    result = run_prophet_forecast(product_id, current_stock)
    if result.get("priority") in ("critical", "warning"):
        push_alert_to_node(result)
    return result