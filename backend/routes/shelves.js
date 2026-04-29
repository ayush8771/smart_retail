const express = require('express');
const router = express.Router();

// GET /api/shelves
router.get('/', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');

        const shelves = await prisma.shelf.findMany({
            include: {
                detections: {
                    orderBy: { detected_at: 'desc' },
                    take: 1
                }
            }
        });

        const result = shelves.map((shelf) => {
            const latest = shelf.detections[0];
            return {
                id: shelf.id,
                name: shelf.name,
                occupancy_pct: latest?.occupancy_pct ?? 100,
                status: latest?.status ?? 'ok',
                empty_zones: latest?.empty_zones ?? [],
                last_scanned: latest?.detected_at ?? null
            };
        });

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch shelves' });
    }
});

// GET /api/shelves/:shelfId
router.get('/:shelfId', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');
        const { shelfId } = req.params;

        const shelf = await prisma.shelf.findUnique({
            where: { id: shelfId },
            include: {
                detections: {
                    orderBy: { detected_at: 'desc' },
                    take: 1
                },
                products: true
            }
        });

        if (!shelf) return res.status(404).json({ error: 'Shelf not found' });

        const latest = shelf.detections[0];

        res.json({
            id: shelf.id,
            name: shelf.name,
            occupancy_pct: latest?.occupancy_pct ?? 100,
            status: latest?.status ?? 'ok',
            empty_zones: latest?.empty_zones ?? [],
            last_scanned: latest?.detected_at ?? null,
            products: shelf.products
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch shelf' });
    }
});

// POST /api/shelves - Create a new shelf
router.post('/', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');
        const { id, name } = req.body;

        const newShelf = await prisma.shelf.create({
            data: { id, name }
        });

        res.json(newShelf);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create shelf' });
    }
});

// PUT /api/shelves/:id - Update an existing shelf
router.put('/:id', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');
        const { id } = req.params;
        const { name } = req.body;

        const updatedShelf = await prisma.shelf.update({
            where: { id },
            data: { name }
        });

        res.json(updatedShelf);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update shelf' });
    }
});

module.exports = router;