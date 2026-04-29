const axios = require('axios');
const FormData = require('form-data');

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

// sends image buffer to FastAPI /detect
async function detectShelf(shelfId, imageBuffer, mimetype) {
    const form = new FormData();
    form.append('file', imageBuffer, {
        filename: 'shelf.jpg',
        contentType: mimetype || 'image/jpeg'
    });

    const response = await axios.post(
        `${FASTAPI_URL}/detect?shelf_id=${shelfId}`,
        form,
        { headers: form.getHeaders() }
    );

    return response.data;
}

// sends sales history to FastAPI /forecast
async function forecastStock(productId, currentStock, salesHistory) {
    const response = await axios.post(`${FASTAPI_URL}/forecast`, {
        product_id: productId,
        current_stock: currentStock,
        sales_history: salesHistory
    });

    return response.data;
}

module.exports = { detectShelf, forecastStock };