import express from 'express';
import { getAllReviews, addReview, getFoodReviews, voteHelpful } from '../controllers/review.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', getAllReviews);
router.post('/', protect, addReview);
router.get('/food/:foodId', getFoodReviews);
router.post('/:id/helpful', voteHelpful);

export default router;
