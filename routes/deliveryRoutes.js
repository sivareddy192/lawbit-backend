import express from 'express';
import {
  getDeliveryStats,
  getDeliveryOrders,
  acceptDeliveryOrder,
  updateDeliveryStatus,
  toggleDutyStatus,
  updateDeliveryProfile,
  updateDeliveryLocation,
} from '../controllers/deliveryBoy.controller.js';
import { protect, deliveryPartner } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect, deliveryPartner);

router.get('/stats', getDeliveryStats);
router.get('/orders', getDeliveryOrders);
router.put('/orders/:id/accept', acceptDeliveryOrder);
router.put('/orders/:id/status', updateDeliveryStatus);
router.put('/orders/:id/location', updateDeliveryLocation);
router.put('/location', updateDeliveryLocation);
router.patch('/duty', toggleDutyStatus);
router.put('/profile', updateDeliveryProfile);

export default router;
