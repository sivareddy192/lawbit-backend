import express from 'express';
import {
  getDashboardStats,
  getAdminAnalytics,
  getAdminOrders,
  updateOrderStatus,
  getAdminCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getStoreSettings,
  updateStoreSettings,
} from '../controllers/order.controller.js';
import {
  createFood,
  updateFood,
  deleteFood,
  toggleFoodStock,
  toggleFoodFeatured,
} from '../controllers/product.controller.js';
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller.js';
import {
  getAllUsers as getAdminUsers,
  toggleBlockUser,
  updateUserRole,
  deleteUser,
} from '../controllers/user.controller.js';
import {
  getAllReviews as getAdminReviews,
  deleteReview,
} from '../controllers/review.controller.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  getAdminRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  updateMarketplaceRestaurantStatus,
} from '../controllers/restaurant.controller.js';
import {
  getRestaurantApplications,
  reviewRestaurantApplication,
  getRestaurantApplicationById,
  getMarketplaceStatistics,
} from '../controllers/vendor.controller.js';

const router = express.Router();

router.use(protect, admin);

router.get('/dashboard-stats', getDashboardStats);
router.get('/analytics', getAdminAnalytics);

router.get('/orders', getAdminOrders);
router.put('/orders/:id/status', updateOrderStatus);

router.post('/foods', createFood);
router.put('/foods/:id', updateFood);
router.delete('/foods/:id', deleteFood);
router.patch('/foods/:id/stock', toggleFoodStock);
router.patch('/foods/:id/featured', toggleFoodFeatured);

router.get('/restaurants', getAdminRestaurants);
router.get('/restaurant-applications', getRestaurantApplications);
router.get('/marketplace/applications', getRestaurantApplications);
router.get('/marketplace/applications/:id', getRestaurantApplicationById);
router.patch('/marketplace/applications/:id/approve', (req, res, next) => {
  req.body.status = 'APPROVED';
  reviewRestaurantApplication(req, res, next);
});
router.patch('/marketplace/applications/:id/reject', (req, res, next) => {
  req.body.status = 'REJECTED';
  reviewRestaurantApplication(req, res, next);
});
router.patch('/marketplace/applications/:id/review', (req, res, next) => {
  req.body.status = 'UNDER_REVIEW';
  reviewRestaurantApplication(req, res, next);
});
router.get('/marketplace/statistics', getMarketplaceStatistics);
router.get('/marketplace/restaurants', getAdminRestaurants);
router.patch('/marketplace/restaurants/:id/status', updateMarketplaceRestaurantStatus);
router.patch('/restaurant-applications/:id', reviewRestaurantApplication);
router.post('/restaurants', createRestaurant);
router.put('/restaurants/:id', updateRestaurant);
router.delete('/restaurants/:id', deleteRestaurant);

router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

router.get('/users', getAdminUsers);
router.patch('/users/:id/block', toggleBlockUser);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);

router.get('/coupons', getAdminCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

router.get('/reviews', getAdminReviews);
router.delete('/reviews/:id', deleteReview);

router.get('/settings', getStoreSettings);
router.put('/settings', updateStoreSettings);

export default router;
