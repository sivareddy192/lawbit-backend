import express from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
  updateProfile,
  changePassword,
  addAddress,
  updateAddress,
  deleteAddress,
  toggleWishlist,
  getUserCart,
  updateUserCart,
  clearUserCart,
} from '../controllers/user.controller.js';
import { protect } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/register', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);
router.post('/logout', logoutUser);
router.post('/refresh', refreshAccessToken);

router.get('/me', protect, getCurrentUser);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, authLimiter, changePassword);

router.get('/cart', protect, getUserCart);
router.post('/cart', protect, updateUserCart);
router.put('/cart', protect, updateUserCart);
router.delete('/cart', protect, clearUserCart);

router.post('/address', protect, addAddress);
router.put('/address/:addressId', protect, updateAddress);
router.delete('/address/:addressId', protect, deleteAddress);

router.post('/wishlist/:foodId', protect, toggleWishlist);

export default router;
