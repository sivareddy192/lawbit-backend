import { protect } from './authMiddleware.js';
import RestaurantModel from '../models/restaurant.model.js';

export const vendor = [
  protect,
  (req, res, next) => {
    const role = req.user?.role?.toUpperCase();
    if (role === 'VENDOR' || role === 'ADMIN') return next();
    return res.status(403).json({
      success: false,
      message: 'Access denied: Vendor privileges required',
    });
  },
];

export const approvedVendor = [
  ...vendor,
  async (req, res, next) => {
    if (req.user?.role?.toUpperCase() === 'ADMIN') return next();
    const restaurant = await RestaurantModel.findOne({ owner: req.user._id }).select('approvalStatus').lean();
    if (restaurant?.approvalStatus === 'APPROVED') return next();
    return res.status(403).json({
      success: false,
      code: 'RESTAURANT_NOT_APPROVED',
      message: restaurant?.approvalStatus
        ? 'Vendor access is unavailable'
        : 'Vendor access is unavailable',
      approvalStatus: restaurant?.approvalStatus || 'NOT_SUBMITTED',
    });
  },
];
