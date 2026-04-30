const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST', 'PATCH']
    }
});

// middleware
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.set('prisma', prisma);
app.set('io', io);

// routes
const shelvesRoute = require('./routes/shelves');
const restockRoute = require('./routes/restock');
const analyticsRoute = require('./routes/analytics');
const { router: detectRouter, setIO } = require('./routes/detect');

// inject io into detect router
setIO(io);

app.use('/api/shelves', shelvesRoute);
app.use('/api/detect', detectRouter);
app.use('/api/restock', restockRoute);
app.use('/api/analytics', analyticsRoute);
app.use('/api/wishlist', require('./routes/wishlist'));

// health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// socket connection log
io.on('connection', (socket) => {
    console.log('Manager connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Manager disconnected:', socket.id);
    });
});

// db connect + server start
const PORT = process.env.PORT || 5000;

async function main() {
    await prisma.$connect();
    console.log('PostgreSQL connected via Prisma');
    server.listen(PORT, () => {
        console.log(`Backend running on http://localhost:${PORT}`);
    });
}

main().catch((err) => {
    console.error('Startup error:', err);
    process.exit(1);
});