import express from 'express';
import { getRestaurants, getRestaurantBySlug } from '../controllers/restaurant.controller.js';

const router = express.Router();

router.get('/', getRestaurants);
router.get('/slug/:slug', getRestaurantBySlug);

export default router;
