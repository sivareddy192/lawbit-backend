import express from 'express';
import {
  getAllFoods,
  getFoodBySlug,
  getFoodById,
  getFeaturedFoods,
  getBestsellerFoods,
} from '../controllers/product.controller.js';

const router = express.Router();

router.get('/', getAllFoods);
router.get('/featured', getFeaturedFoods);
router.get('/bestsellers', getBestsellerFoods);
router.get('/slug/:slug', getFoodBySlug);
router.get('/:id', getFoodById);

export default router;
