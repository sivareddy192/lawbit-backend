import express from 'express';
import {
  registerVendor,
  getVendorDashboard,
  getVendorOrders,
  updateVendorOrderStatus,
  getVendorMenu,
  createVendorMenuItem,
  updateVendorMenuItem,
  deleteVendorMenuItem,
  getVendorRestaurant,
  updateVendorRestaurant,
  getVendorApplication,
  submitVendorApplication,
  getVendorInventory,
  updateVendorInventory,
  getVendorNotifications,
} from '../controllers/vendor.controller.js';
import { vendor, approvedVendor } from '../middleware/vendorMiddleware.js';
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller.js';

const router = express.Router();

router.post('/register', registerVendor);
router.use(vendor);
router.get('/application', getVendorApplication);
router.put('/application', submitVendorApplication);
router.post('/applications', submitVendorApplication);
router.get('/applications/my-application', getVendorApplication);
router.put('/applications/update', submitVendorApplication);
router.post('/applications/resubmit', submitVendorApplication);
router.get('/notifications', getVendorNotifications);
router.use(approvedVendor.slice(1));
router.get('/dashboard', getVendorDashboard);
router.get('/orders', getVendorOrders);
router.patch('/orders/:id/status', updateVendorOrderStatus);
router.get('/menu', getVendorMenu);
router.get('/inventory', getVendorInventory);
router.patch('/inventory/:id', updateVendorInventory);
router.post('/menu', createVendorMenuItem);
router.put('/menu/:id', updateVendorMenuItem);
router.delete('/menu/:id', deleteVendorMenuItem);
router.get('/restaurant', getVendorRestaurant);
router.put('/restaurant', updateVendorRestaurant);
router.get('/categories', getAllCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

export default router;
