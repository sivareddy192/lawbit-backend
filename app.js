import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { publicLimiter, authLimiter, adminLimiter, apiLimiter } from './middleware/rateLimiters.js';
import { sanitizeNoSQL, sanitizeXSS } from './middleware/sanitizeMiddleware.js';
import cache from './services/cacheService.js';
import taskQueue from './services/queueService.js';

import authRoutes from './routes/authRoutes.js';
import foodRoutes from './routes/foodRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import deliveryRoutes from './routes/deliveryRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import versionRoutes from './routes/versionRoutes.js';
import restaurantRoutes from './routes/restaurantRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import connectDB, { isConnected } from './config/db.js';
import { getStoreSettings } from './controllers/order.controller.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

const app = express();

app.disable('x-powered-by');

app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  xXssProtection: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hidePoweredBy: true,
}));

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'https://asg-foods.vercel.app',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      process.env.NODE_ENV !== 'production' ||
      origin.endsWith('.vercel.app')
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    connectDB().catch((err) => console.error('DB lazy connect warning:', err.message));
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use(sanitizeNoSQL);
app.use(sanitizeXSS);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'AK Foods Scalable API Cluster is active',
    status: 'online',
    version: '3.0.0',
    healthCheck: '/api/health',
    readinessCheck: '/api/health/ready',
    versionCheck: '/api/version',
    cache: cache.getStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'AK Foods API',
    version: '3.0.0',
    uptime: process.uptime(),
  });
});

app.get('/api/health/live', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/health/ready', async (req, res) => {
  const isDbReady = mongoose.connection.readyState === 1;
  const cacheStatus = cache.getStatus();
  const queueSize = taskQueue.getQueueSize();

  const isHealthy = isDbReady;

  return res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? 'READY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: isDbReady ? 'CONNECTED' : 'DISCONNECTED',
        readyState: mongoose.connection.readyState,
      },
      cache: cacheStatus,
      backgroundQueue: {
        pendingTasks: queueSize,
      },
    },
  });
});

app.use('/api/version', versionRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/foods', publicLimiter, foodRoutes);
app.use('/api/restaurants', publicLimiter, restaurantRoutes);
app.use('/api/vendor', apiLimiter, vendorRoutes);
app.use('/api/categories', publicLimiter, categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/cart', cartRoutes);
app.get('/api/settings', publicLimiter, getStoreSettings);

app.use(notFound);
app.use(errorHandler);

export default app;
