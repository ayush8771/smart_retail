const express = require('express');
const router = express.Router();

// GET /api/restock
router.get('/', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');

        const queue = await prisma.restockQueue.findMany({
            where: { resolved: false },
            include: {
                product: {
                    include: { shelf: true }
                }
            },
            orderBy: { days_to_stockout: 'asc' }
        });

        const result = queue.map((item) => ({
            id: item.id,
            product: item.product.name,
            shelf_id: item.product.shelf_id,
            shelf_name: item.product.shelf?.name,
            zone: item.product.zone_id,
            days_to_stockout: item.days_to_stockout,
            restock_qty: item.recommended_qty,
            priority: item.priority,
            reason: item.reason,
            resolved: item.resolved
        }));

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch restock queue' });
    }
});

// PATCH /api/restock/:id/resolve
router.patch('/:id/resolve', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');
        const io = req.app.get('io');
        const { id } = req.params;

        const item = await prisma.restockQueue.update({
            where: { id },
            data: { resolved: true },
            include: { product: true }
        });

        // update inventory — add restock qty back
        await prisma.inventory.update({
            where: { product_id: item.product_id },
            data: {
                current_stock: { increment: item.recommended_qty },
                source: 'manual',
                last_updated: new Date()
            }
        });

        // tell frontend shelf is now ok
        io.emit('shelf:updated', {
            shelfId: item.product.shelf_id,
            occupancy_pct: 100,
            status: 'ok'
        });

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to resolve restock item' });
    }
});

module.exports = router;