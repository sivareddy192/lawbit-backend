import express from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
} from '../controllers/order.controller.js';
import { protect } from '../middleware/authMiddleware.js';
import { orderLimiter } from '../middleware/rateLimiters.js';
import { checkIdempotency } from '../middleware/idempotencyMiddleware.js';

const router = express.Router();

router.post('/', protect, orderLimiter, checkIdempotency('order'), createOrder);
router.get('/myorders', protect, getMyOrders);
router.get('/:id', protect, getOrderById);
router.put('/:id/cancel', protect, cancelOrder);

export default router;
