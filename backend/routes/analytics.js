const express = require('express');
const router = express.Router();

// GET /api/analytics/sales
router.get('/sales', async (req, res) => {
    try {
        const prisma = req.app.get('prisma');

        // last 7 days sales grouped by day
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const sales = await prisma.sale.findMany({
            where: { sold_at: { gte: sevenDaysAgo } },
            include: { product: true },
            orderBy: { sold_at: 'asc' }
        });

        // group by day
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyMap = {};
        sales.forEach((s) => {
            const day = days[new Date(s.sold_at).getDay()];
            weeklyMap[day] = (weeklyMap[day] || 0) + s.price * s.quantity_sold;
        });
        const weekly = Object.entries(weeklyMap).map(([day, sales]) => ({
            day,
            sales: Math.round(sales)
        }));

        // top 5 products by units sold
        const productMap = {};
        sales.forEach((s) => {
            const name = s.product.name;
            productMap[name] = (productMap[name] || 0) + s.quantity_sold;
        });
        const top_products = Object.entries(productMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, units]) => ({ name, units: Math.round(units) }));

        // static recommendations for now (Phase 2: make these dynamic from ML)
        const recommendations = [
            top_products[0] ? `${top_products[0].name} is your top seller — ensure it never goes below reorder level` : null,
            'Check slow-moving products for pricing adjustments',
            'Stock up on high-demand items before weekends'
        ].filter(Boolean);

        res.json({ weekly, top_products, recommendations });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

module.exports = router;