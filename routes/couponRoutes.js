import express from 'express';
import { getActiveCoupons, validateCoupon } from '../controllers/order.controller.js';

const router = express.Router();

router.get('/', getActiveCoupons);
router.post('/validate', validateCoupon);

export default router;
