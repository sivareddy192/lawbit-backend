import express from 'express';
import {
  addToCartItemController,
  getCartItemController,
  updateCartItemQtyController,
  deleteCartItemQtyController,
  getUserCart,
  updateUserCart,
  clearUserCart,
  deleteCartItem,
} from '../controllers/cart.controller.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Root endpoints
router.route('/')
  .get(optionalAuth, getCartItemController)
  .post(protect, updateUserCart)
  .put(protect, updateCartItemQtyController)
  .delete(protect, clearUserCart);

// Explicit named routes
router.post('/create', protect, addToCartItemController);
router.post('/add', protect, addToCartItemController);
router.get('/get', optionalAuth, getCartItemController);
router.put('/update-qty', protect, updateCartItemQtyController);
router.delete('/delete-cart-item', protect, deleteCartItemQtyController);

// Parameterized routes
router.delete('/:id', protect, deleteCartItem);
router.delete('/item/:id', protect, deleteCartItem);

export default router;
