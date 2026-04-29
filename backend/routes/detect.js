const express = require('express');
const multer = require('multer');
const router = express.Router();
const { detectShelf, forecastStock } = require('../lib/fastapi');
const { emitCriticalAlert, emitWarningAlert, emitShelfUpdated } = require('../lib/socket');

const upload = multer({ storage: multer.memoryStorage() });

// POST /api/detect/:shelfId
router.post('/:shelfId', upload.single('file'), async (req, res) => {
    const prisma = req.app.get('prisma');
    const io = req.app.get('io');
    const { shelfId } = req.params;

    try {
        // 1. send image to FastAPI YOLO
        const detection = await detectShelf(
            shelfId,
            req.file.buffer,
            req.file.mimetype
        );

        // 2. save detection to DB
        await prisma.detection.create({
            data: {
                shelf_id: shelfId,
                occupancy_pct: detection.occupancy_pct,
                empty_zones: detection.empty_zones,
                status: detection.status,
                confidence: detection.confidence
            }
        });

        // 3. emit shelf updated to frontend
        emitShelfUpdated(io, shelfId, detection.occupancy_pct, detection.status);

        // 4. if critical or warning → trigger forecast per product in empty zones
        if (detection.status === 'critical' || detection.status === 'warning') {
            const products = await prisma.product.findMany({
                where: { shelf_id: shelfId },
                include: {
                    inventory: true,
                    sales: {
                        orderBy: { sold_at: 'desc' },
                        take: 90
                    }
                }
            });

            for (const product of products) {
                const currentStock = product.inventory?.current_stock ?? 0;

                // build sales history for Prophet
                const salesHistory = product.sales.map((s) => ({
                    ds: s.sold_at.toISOString().split('T')[0],
                    y: s.quantity_sold
                }));

                // skip forecast if no sales history
                if (salesHistory.length < 7) continue;

                const forecast = await forecastStock(
                    product.id,
                    currentStock,
                    salesHistory
                );

                // 5. upsert into restock queue
                await prisma.restockQueue.upsert({
                    where: { product_id: product.id },
                    update: {
                        priority: forecast.urgency,
                        recommended_qty: forecast.restock_qty,
                        days_to_stockout: forecast.days_to_stockout,
                        resolved: false
                    },
                    create: {
                        product_id: product.id,
                        priority: forecast.urgency,
                        recommended_qty: forecast.restock_qty,
                        days_to_stockout: forecast.days_to_stockout,
                        reason: `YOLO: ${detection.occupancy_pct}% occupancy. Forecast: ${forecast.days_to_stockout} days left.`
                    }
                });

                // 6. emit alert to manager
                const message = `${product.name} — zone empty. Restock ${forecast.restock_qty} units. Stockout in ${forecast.days_to_stockout} days.`;

                if (detection.status === 'critical') {
                    emitCriticalAlert(io, shelfId, message, detection.occupancy_pct);
                } else {
                    emitWarningAlert(io, shelfId, message, detection.occupancy_pct);
                }
            }
        }

        res.json(detection);
    } catch (err) {
        console.error('Detection error:', err.message);
        res.status(500).json({ error: 'Detection failed', detail: err.message });
    }
});

module.exports = router;