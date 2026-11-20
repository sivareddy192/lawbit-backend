import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import app from './app.js';
import connectDB from './config/db.js';
import { initTrackingSocket } from './socket/trackingSocket.js';

const PORT = process.env.PORT || 5050;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

app.set('io', io);

initTrackingSocket(io);

const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      console.log(`AK Foods Server is running on port: ${PORT} (PID: ${process.pid})`);
    });
  } catch (error) {
    console.error('Server startup error:', error.message);
    process.exit(1);
  }
};

let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Initiating graceful shutdown...`);

  server.close(async () => {
    console.log('HTTP Server closed. Draining active connections...');

    try {
      io.close(() => {
        console.log('Socket.IO connections closed.');
      });

      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close(false);
        console.log('MongoDB connection pool drained and closed cleanly.');
      }

      console.log('Graceful shutdown completed successfully.');
      process.exit(0);
    } catch (err) {
      console.error('Error during graceful shutdown:', err.message);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out (10s). Forcing process exit.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

export { io };
