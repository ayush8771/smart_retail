const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// io is injected from server.js/app.js to allow real-time broadcasts
let io;
const setIO = (socketIO) => {
    io = socketIO;
};

/**
 * POST /api/detect/alert
 * This is the ENDPOINT the FastAPI (AI Service) calls after running Prophet.
 */
router.post('/alert', async (req, res) => {
    const {
        product_id,           // e.g., 'patanjali_atta_noodles'
        product_name,
        shelf_id,
        hours_until_stockout, // From Prophet
        priority,             // 'critical' or 'warning'
        current_stock,
        predicted_daily_demand,
        forecasted_at,
        bbox,
    } = req.body;

    try {
        // 1. Database Update: Upsert into the Restock Queue
        const existing = await prisma.restockQueue.findFirst({
            where: { product_id, resolved: false },
        });

        // Calculate recommended restock quantity (3-day safety buffer)
        const recommended_qty = Math.ceil(predicted_daily_demand * 3);

        if (existing) {
            await prisma.restockQueue.update({
                where: { id: existing.id },
                data: {
                    priority,
                    days_to_stockout: parseFloat((hours_until_stockout / 24).toFixed(2)),
                    recommended_qty,
                    reason: `AI Forecast: ~${hours_until_stockout.toFixed(1)}h left. Demand: ${predicted_daily_demand.toFixed(1)}/day`,
                },
            });
        } else {
            await prisma.restockQueue.create({
                data: {
                    product_id,
                    priority,
                    days_to_stockout: parseFloat((hours_until_stockout / 24).toFixed(2)),
                    recommended_qty,
                    reason: `AI Forecast: ~${hours_until_stockout.toFixed(1)}h left. Demand: ${predicted_daily_demand.toFixed(1)}/day`,
                },
            });
        }

        // 2. Notification Log: Save to DB for the History tab
        await prisma.notification.create({
            data: {
                type: priority === 'critical' ? 'STOCKOUT_CRITICAL' : 'STOCKOUT_WARNING',
                message: `${product_name} on ${shelf_id}: Prediction shows stockout in ${hours_until_stockout.toFixed(1)} hours.`,
                shelf_id,
            },
        });

        // 3. THE MAGIC LINK: Emit to the Frontend Hook (Claude's code)
        if (io) {
            // This is what the 'useRestockAlerts' hook in React is listening for!
            io.emit('restock_alert', {
                product_id,
                product_name,
                shelf_id,
                hours_until_stockout,
                priority,
                current_stock,
                predicted_daily_demand,
                forecasted_at: forecasted_at || new Date().toISOString(),
                bbox,
            });
        }

        res.json({ success: true, message: "Alert processed and broadcasted" });
    } catch (err) {
        console.error('[detect/alert Error]:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/detect/scan/:shelfId
 * Called by Frontend when you take a photo with your phone.
 * Triggers the AI Service (FastAPI) to run YOLO + Prophet.
 */
router.post('/scan/:shelfId', async (req, res) => {
    try {
        const { shelfId } = req.params;
        const { imageBase64 } = req.body;

        // Fetch current inventory so Prophet knows the starting point
        const products = await prisma.product.findMany({
            where: { shelf_id: shelfId },
            include: { inventory: true },
        });

        const currentStocks = {};
        products.forEach(p => {
            currentStocks[p.id] = p.inventory?.current_stock ?? 0;
        });

        // Proxy the image to the FastAPI AI Service
        const FormData = require('form-data');
        const axios = require('axios');
        const imageBuffer = Buffer.from(imageBase64, 'base64');

        const form = new FormData();
        form.append('file', imageBuffer, { filename: 'shelf_scan.jpg', contentType: 'image/jpeg' });

        const aiRes = await axios.post(
            `${process.env.AI_SERVICE_URL}/detect/${shelfId}?current_stocks=${encodeURIComponent(JSON.stringify(currentStocks))}`,
            form,
            { headers: form.getHeaders() }
        );

        res.json(aiRes.data);
    } catch (err) {
        console.error('[detect/scan Error]:', err.message);
        res.status(500).json({ error: "AI Service unreachable or Scan failed" });
    }
});

module.exports = { router, setIO };