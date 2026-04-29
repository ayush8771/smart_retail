const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

// 👇 CHANGE HERE
const { router: detectRouter, setIO } = require('./routes/detect');

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
app.use(express.json());

// (optional) keep prisma global
app.set('prisma', prisma);

// 👇 CRITICAL LINE
setIO(io);

// routes
app.use('/api/shelves', require('./routes/shelves'));
app.use('/api/detect', detectRouter);  // 👈 changed
app.use('/api/restock', require('./routes/restock'));
app.use('/api/analytics', require('./routes/analytics'));

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