const express = require('express');
const router = express.Router();

// GET /api/wishlist — all wishlist entries
router.get('/', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');
        const items = await prisma.wishlist.findMany({
            include: { product: true },
            orderBy: { created_at: 'desc' }
        });
        res.json(items);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/wishlist/count — unnotified count for badge
router.get('/count', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');
        const count = await prisma.wishlist.count({
            where: { notified: false }
        });
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/wishlist — add a wishlist entry (dummy user action)
router.post('/', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');
        const io = req.app.get('io');
        const { product_id, user_name } = req.body;

        if (!product_id) return res.status(400).json({ error: 'product_id required' });

        const product = await prisma.product.findUnique({ where: { id: product_id } });
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const entry = await prisma.wishlist.create({
            data: {
                product_id,
                user_name: user_name || 'Customer',
                notified: false
            },
            include: { product: true }
        });

        // get updated unnotified count
        const count = await prisma.wishlist.count({ where: { notified: false } });

        // emit to manager dashboard
        io.emit('wishlist:new', {
            id: entry.id,
            user_name: entry.user_name,
            product_id: entry.product_id,
            product_name: entry.product.name,
            created_at: entry.created_at,
            count
        });

        res.json(entry);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/wishlist/mark-notified — clear badge count
router.patch('/mark-notified', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');
        await prisma.wishlist.updateMany({
            where: { notified: false },
            data: { notified: true }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/wishlist/:id — remove entry
router.delete('/:id', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');
        await prisma.wishlist.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;