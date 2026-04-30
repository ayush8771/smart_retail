const express = require('express');
const router = express.Router();
const FormData = require('form-data');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let io;
const setIO = (socketIO) => {
    io = socketIO;
};

/**
 * POST /api/detect/alert
 * Called by FastAPI after YOLO + Prophet completes.
 */
router.post('/alert', async (req, res) => {
    const {
        product_id,
        product_name,
        shelf_id,
        hours_until_stockout,
        priority,
        current_stock,
        predicted_daily_demand,
        forecasted_at,
        bbox,
    } = req.body;

    try {
        const recommended_qty = Math.ceil(predicted_daily_demand * 3);

        // upsert restock queue
        const existing = await prisma.restockQueue.findFirst({
            where: { product_id, resolved: false },
        });

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

        // save notification
        await prisma.notification.create({
            data: {
                type: priority === 'critical' ? 'STOCKOUT_CRITICAL' : 'STOCKOUT_WARNING',
                message: `${product_name} on ${shelf_id}: Stockout in ${hours_until_stockout.toFixed(1)} hours.`,
                shelf_id,
            },
        });

        // emit to frontend via WebSocket
        if (io) {
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
            console.log(`[SOCKET] Emitted restock_alert for ${product_name} → ${priority.toUpperCase()}`);
        } else {
            console.warn('[SOCKET] io not initialized — alert not emitted to frontend');
        }

        res.json({ success: true, message: 'Alert processed and broadcasted' });
    } catch (err) {
        console.error('[detect/alert Error]:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/detect/scan/:shelfId
 * Called by frontend or detect_live.py.
 * Fetches stock from DB → forwards image to FastAPI → returns result.
 */
router.post('/scan/:shelfId', async (req, res) => {
    const { shelfId } = req.params;
    const { imageBase64 } = req.body;

    if (!imageBase64) {
        return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
    if (!AI_SERVICE_URL) {
        console.error('[detect/scan] AI_SERVICE_URL not set in .env');
        return res.status(500).json({ error: 'AI_SERVICE_URL not configured in backend .env' });
    }

    try {
        // fetch current stock for all products on this shelf
        const products = await prisma.product.findMany({
            where: { shelf_id: shelfId },
            include: { inventory: true },
        });

        if (products.length === 0) {
            console.warn(`[detect/scan] No products found for shelf ${shelfId}`);
        }

        const currentStocks = {};
        products.forEach(p => {
            currentStocks[p.id] = p.inventory?.current_stock ?? 0;
        });

        console.log(`[detect/scan] Shelf: ${shelfId} | Products: ${products.length} | Stocks:`, currentStocks);

        // build multipart form with image
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        const form = new FormData();
        form.append('file', imageBuffer, {
            filename: 'shelf_scan.jpg',
            contentType: 'image/jpeg',
        });

        const targetUrl = `${AI_SERVICE_URL}/detect/${shelfId}?current_stocks=${encodeURIComponent(JSON.stringify(currentStocks))}`;
        console.log(`[detect/scan] Forwarding to FastAPI: ${targetUrl}`);

        const aiRes = await axios.post(targetUrl, form, {
            headers: form.getHeaders(),
            timeout: 60000, // 60s timeout for YOLO + Prophet
        });

        console.log(`[detect/scan] FastAPI response → gaps: ${aiRes.data.total_gaps}`);
        res.json(aiRes.data);

    } catch (err) {
        if (err.code === 'ECONNREFUSED') {
            console.error('[detect/scan] FastAPI is not running on', process.env.AI_SERVICE_URL);
            return res.status(503).json({ error: 'AI Service is not running. Start FastAPI on port 8000.' });
        }
        console.error('[detect/scan Error]:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = { router, setIO };