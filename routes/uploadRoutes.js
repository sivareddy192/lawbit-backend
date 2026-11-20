import express from 'express';
import { uploadImage, uploadMultiple, deleteImage } from '../controllers/uploadImage.controller.js';
import { uploadSingleImage, uploadMultipleImages } from '../middleware/uploadMiddleware.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/image', protect, uploadSingleImage, uploadImage);
router.post('/images', protect, uploadMultipleImages, uploadMultiple);
router.delete('/image', protect, admin, deleteImage);

export default router;
