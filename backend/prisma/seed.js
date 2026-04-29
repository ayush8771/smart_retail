const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

// ── Shelf layout: assign products to shelves by category ──
const SHELF_MAP = {
    'shelf_01': { name: 'Aisle 1 - Snacks & Popcorn', zone_count: 12 },
    'shelf_02': { name: 'Aisle 2 - Sports & Misc', zone_count: 12 },
    'shelf_03': { name: 'Aisle 3 - Personal Care', zone_count: 12 },
    'shelf_04': { name: 'Aisle 4 - Masala & Spices', zone_count: 12 },
    'shelf_05': { name: 'Aisle 5 - Noodles & Instant', zone_count: 12 },
    'shelf_06': { name: 'Aisle 6 - Oils & Health', zone_count: 12 },
    'shelf_07': { name: 'Aisle 7 - Beverages & Dry Fruits', zone_count: 12 },
};

// ── Product master: name must exactly match CSV product_id column ──
const PRODUCTS = [
    { id: 'prod_01', name: 'act2 popcorn', shelf_id: 'shelf_01', zone_id: 'zone_A1', category: 'Snacks', unit: 'packs', reorder_level: 20, current_stock: 8 },
    { id: 'prod_02', name: 'cricket ball', shelf_id: 'shelf_02', zone_id: 'zone_A1', category: 'Sports', unit: 'units', reorder_level: 10, current_stock: 4 },
    { id: 'prod_03', name: 'dove intense repair shampoo', shelf_id: 'shelf_03', zone_id: 'zone_A1', category: 'Personal Care', unit: 'bottles', reorder_level: 12, current_stock: 6 },
    { id: 'prod_04', name: 'everest label', shelf_id: 'shelf_04', zone_id: 'zone_A1', category: 'Spices', unit: 'packs', reorder_level: 15, current_stock: 10 },
    { id: 'prod_05', name: 'everest sambhar masala', shelf_id: 'shelf_04', zone_id: 'zone_B1', category: 'Spices', unit: 'packs', reorder_level: 15, current_stock: 5 },
    { id: 'prod_06', name: 'glutamine powder', shelf_id: 'shelf_06', zone_id: 'zone_A1', category: 'Health', unit: 'units', reorder_level: 8, current_stock: 3 },
    { id: 'prod_07', name: 'noodles 4 pack', shelf_id: 'shelf_05', zone_id: 'zone_A1', category: 'Noodles', unit: 'packs', reorder_level: 20, current_stock: 12 },
    { id: 'prod_08', name: 'parachute advanced gold coconut oil', shelf_id: 'shelf_06', zone_id: 'zone_B1', category: 'Oils', unit: 'bottles', reorder_level: 10, current_stock: 7 },
    { id: 'prod_09', name: 'parachute label', shelf_id: 'shelf_06', zone_id: 'zone_C1', category: 'Oils', unit: 'units', reorder_level: 8, current_stock: 9 },
    { id: 'prod_10', name: 'patanjali atta noodles', shelf_id: 'shelf_05', zone_id: 'zone_B1', category: 'Noodles', unit: 'packs', reorder_level: 18, current_stock: 14 },
    { id: 'prod_11', name: 'patanjali label', shelf_id: 'shelf_05', zone_id: 'zone_C1', category: 'Noodles', unit: 'units', reorder_level: 10, current_stock: 11 },
    { id: 'prod_12', name: 'patanjali noodles chatpata masala', shelf_id: 'shelf_05', zone_id: 'zone_D1', category: 'Noodles', unit: 'packs', reorder_level: 15, current_stock: 6 },
    { id: 'prod_13', name: 'patanjali noodles chatpata masala 4 pack', shelf_id: 'shelf_05', zone_id: 'zone_A2', category: 'Noodles', unit: 'packs', reorder_level: 12, current_stock: 8 },
    { id: 'prod_14', name: 'patanjali noodles yummy masala', shelf_id: 'shelf_05', zone_id: 'zone_B2', category: 'Noodles', unit: 'packs', reorder_level: 15, current_stock: 5 },
    { id: 'prod_15', name: 'rasayana ayurvedic chai', shelf_id: 'shelf_07', zone_id: 'zone_A1', category: 'Beverages', unit: 'packs', reorder_level: 10, current_stock: 4 },
    { id: 'prod_16', name: 'royal dry fruits badam giri', shelf_id: 'shelf_07', zone_id: 'zone_B1', category: 'Dry Fruits', unit: 'packs', reorder_level: 12, current_stock: 7 },
    { id: 'prod_17', name: 'royal label', shelf_id: 'shelf_07', zone_id: 'zone_C1', category: 'Dry Fruits', unit: 'units', reorder_level: 10, current_stock: 9 },
];

async function main() {
    console.log('Clearing old data...');
    await prisma.restockQueue.deleteMany();
    await prisma.detection.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.shelf.deleteMany();
    console.log('Old data cleared ✅');

    // 1. Create Shelves
    for (const [id, data] of Object.entries(SHELF_MAP)) {
        await prisma.shelf.create({ data: { id, ...data } });
    }
    console.log('Shelves created ✅');

    // 2. Create Products + Inventory
    for (const p of PRODUCTS) {
        const { current_stock, ...productData } = p;
        await prisma.product.create({ data: productData });
        await prisma.inventory.create({
            data: { product_id: p.id, current_stock, source: 'manual' }
        });
    }
    console.log('Products + Inventory created ✅');

    // 3. Load CSV and insert real sales data
    const csvPath = path.join(__dirname, 'sales_data.csv');
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvText.trim().split('\n').slice(1); // skip header

    // build name → id map
    const nameToId = {};
    PRODUCTS.forEach(p => { nameToId[p.name] = p.id; });

    const salesRows = [];
    for (const line of lines) {
        const [ds, product_name, y] = line.split(',');
        const product_id = nameToId[product_name.trim()];
        if (!product_id) continue; // skip unknown products
        salesRows.push({
            product_id,
            quantity_sold: parseFloat(y),
            price: 50, // default price — update per product if needed
            sold_at: new Date(ds.trim())
        });
    }

    await prisma.sale.createMany({ data: salesRows });
    console.log(`Sales data inserted: ${salesRows.length} records ✅`);

    // 4. Create initial detections (simulated shelf state for demo)
    const detections = [
        { shelf_id: 'shelf_01', occupancy_pct: 30, empty_zones: ['zone_A1'], status: 'warning', confidence: 0.89 },
        { shelf_id: 'shelf_02', occupancy_pct: 20, empty_zones: ['zone_A1', 'zone_B1'], status: 'critical', confidence: 0.91 },
        { shelf_id: 'shelf_03', occupancy_pct: 70, empty_zones: [], status: 'ok', confidence: 0.86 },
        { shelf_id: 'shelf_04', occupancy_pct: 55, empty_zones: [], status: 'ok', confidence: 0.84 },
        { shelf_id: 'shelf_05', occupancy_pct: 40, empty_zones: ['zone_D1', 'zone_B2'], status: 'warning', confidence: 0.88 },
        { shelf_id: 'shelf_06', occupancy_pct: 15, empty_zones: ['zone_A1'], status: 'critical', confidence: 0.93 },
        { shelf_id: 'shelf_07', occupancy_pct: 60, empty_zones: [], status: 'ok', confidence: 0.85 },
    ];
    await prisma.detection.createMany({ data: detections });
    console.log('Detections created ✅');

    // 5. Create restock queue based on low stock products
    const criticalProducts = PRODUCTS.filter(p => p.current_stock <= p.reorder_level);
    for (const p of criticalProducts) {
        const priority = p.current_stock <= 5 ? 'critical' : 'warning';
        const days = parseFloat((p.current_stock / 8).toFixed(1)); // rough estimate
        await prisma.restockQueue.create({
            data: {
                product_id: p.id,
                priority,
                recommended_qty: p.reorder_level * 2,
                days_to_stockout: days,
                reason: `Stock at ${p.current_stock} units — below reorder level of ${p.reorder_level}`
            }
        });
    }
    console.log('Restock queue created ✅');
    console.log('🎉 Database seeded with real data successfully!');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => await prisma.$disconnect());