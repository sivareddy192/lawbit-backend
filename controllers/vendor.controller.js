import ProductModel from '../models/product.model.js';
import OrderModel from '../models/order.model.js';
import RestaurantModel from '../models/restaurant.model.js';
import UserModel from '../models/user.model.js';
import { isStrongPassword } from './user.controller.js';
import RestaurantApplicationModel from '../models/restaurantApplication.model.js';
import CategoryModel from '../models/category.model.js';
import { generateAccessToken, generateRefreshToken } from '../utils/generateToken.js';
import NotificationModel from '../models/notification.model.js';
import ApplicationAuditModel from '../models/applicationAudit.model.js';

const getRestaurant = async (req) => {
  if (req.user?.role?.toUpperCase() === 'ADMIN' && req.query.restaurant) {
    return RestaurantModel.findById(req.query.restaurant);
  }
  return RestaurantModel.findOne({ owner: req.user._id });
};

const restaurantId = (restaurant) => restaurant?._id || null;

const orderBelongsToRestaurant = (order, id) =>
  order.items?.some((item) => String(item.restaurant || '') === String(id));

export const registerVendor = async (req, res, next) => {
  try {
    const { name, email, phone, password, restaurantName, address, city } = req.body;
    if (![name, email, password, restaurantName].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ success: false, message: 'Name, email, password, and restaurant name are required' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters and include upper/lowercase letters, a number, and a symbol' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await UserModel.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ success: false, message: 'An account already exists with this email' });
    }

    const user = await UserModel.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: typeof phone === 'string' ? phone.trim() : '',
      password,
      role: 'VENDOR',
    });
    const slug = `${restaurantName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${user._id.toString().slice(-6)}`;
    const restaurant = await RestaurantModel.create({
      name: restaurantName.trim(),
      slug,
      owner: user._id,
      address: address || '',
      city: city || '',
      approvalStatus: 'PENDING',
      submittedAt: new Date(),
    });
    await RestaurantApplicationModel.create({
      restaurant: restaurant._id,
      applicant: user._id,
      status: 'PENDING',
    });
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;
    user.refresh_token = refreshToken;
    await user.save();

    return res.status(201).json({
      success: true,
      message: 'Vendor account created and awaiting approval',
      accessToken: generateAccessToken(user._id),
      refreshToken,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
      restaurant,
    });
  } catch (error) {
    next(error);
  }
};

export const getVendorApplication = async (req, res, next) => {
  try {
    const restaurant = await RestaurantModel.findOne({ owner: req.user._id }).lean();
    const application = restaurant
      ? await RestaurantApplicationModel.findOne({ restaurant: restaurant._id }).lean()
      : null;
    return res.json({ success: true, restaurant, application });
  } catch (error) {
    next(error);
  }
};

export const getVendorNotifications = async (req, res, next) => {
  try {
    const notifications = await NotificationModel.find({
      $or: [{ user: req.user._id }, { recipientId: req.user._id }],
    }).sort({ createdAt: -1 }).limit(50).lean();
    const unreadCount = await NotificationModel.countDocuments({
      $or: [{ user: req.user._id }, { recipientId: req.user._id }],
      isRead: false,
    });
    return res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    next(error);
  }
};

export const submitVendorApplication = async (req, res, next) => {
  try {
    const restaurant = await RestaurantModel.findOne({ owner: req.user._id });
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant profile not found' });
    if (restaurant.approvalStatus === 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Approved restaurant applications cannot be resubmitted' });
    }

    const {
      name, description, address, city, phone, cuisines, documents = {},
      logo, coverImage, alternatePhone, state, pinCode, location,
      openingTime, closingTime, operatingDays, ownerDetails = {},
      bankDetails = {}, additionalInformation = {}, restaurantEmail,
    } = req.body;
    if (![name, address, city, phone].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ success: false, message: 'Restaurant name, address, city, and phone are required' });
    }
    restaurant.name = name.trim();
    restaurant.description = typeof description === 'string' ? description.trim() : '';
    restaurant.address = address.trim();
    restaurant.city = city.trim();
    restaurant.phone = phone.trim();
    restaurant.logo = typeof logo === 'string' ? logo : restaurant.logo;
    restaurant.coverImage = typeof coverImage === 'string' ? coverImage : restaurant.coverImage;
    restaurant.email = typeof restaurantEmail === 'string' ? restaurantEmail.trim() : restaurant.email;
    restaurant.alternatePhone = typeof alternatePhone === 'string' ? alternatePhone.trim() : '';
    restaurant.state = typeof state === 'string' ? state.trim() : '';
    restaurant.pinCode = typeof pinCode === 'string' ? pinCode.trim() : '';
    restaurant.openingTime = typeof openingTime === 'string' ? openingTime : '';
    restaurant.closingTime = typeof closingTime === 'string' ? closingTime : '';
    restaurant.operatingDays = Array.isArray(operatingDays) ? operatingDays : restaurant.operatingDays || [];
    if (location && typeof location === 'object') restaurant.location = { ...restaurant.location, ...location };
    restaurant.cuisines = Array.isArray(cuisines)
      ? cuisines.map((item) => String(item).trim()).filter(Boolean)
      : restaurant.cuisines || [];
    restaurant.documents = {
      fssai: typeof documents.fssai === 'string' ? documents.fssai.trim() : '',
      gst: typeof documents.gst === 'string' ? documents.gst.trim() : '',
      ownerIdentity: typeof documents.ownerIdentity === 'string' ? documents.ownerIdentity.trim() : '',
      bankProof: typeof documents.bankProof === 'string' ? documents.bankProof.trim() : '',
    };
    restaurant.approvalStatus = 'PENDING';
    restaurant.rejectionReason = '';
    restaurant.submittedAt = new Date();
    restaurant.approvedAt = null;
    await restaurant.save();

    const application = await RestaurantApplicationModel.findOneAndUpdate(
      { restaurant: restaurant._id, applicant: req.user._id },
      {
        $set: {
          applicationId: `RA-${Date.now().toString().slice(-8)}-${restaurant._id.toString().slice(-4).toUpperCase()}`,
          status: 'PENDING',
          applicationStatus: 'PENDING',
          reviewNotes: '', rejectionReason: '', reviewedBy: null, reviewedAt: null,
          restaurantName: restaurant.name,
          restaurantLogo: restaurant.logo || '',
          restaurantCoverImage: restaurant.coverImage || '',
          restaurantDescription: restaurant.description || '',
          cuisineCategory: Array.isArray(cuisines)
            ? cuisines.map((item) => String(item).trim()).filter(Boolean)
            : restaurant.cuisines || [],
          restaurantEmail: typeof restaurantEmail === 'string' ? restaurantEmail.trim() : '',
          restaurantPhone: phone.trim(),
          alternatePhone: typeof alternatePhone === 'string' ? alternatePhone.trim() : '',
          restaurantAddress: address.trim(),
          city: city.trim(),
          state: typeof state === 'string' ? state.trim() : '',
          pinCode: typeof pinCode === 'string' ? pinCode.trim() : '',
          location: location || {},
          openingTime: typeof openingTime === 'string' ? openingTime : '',
          closingTime: typeof closingTime === 'string' ? closingTime : '',
          operatingDays: Array.isArray(operatingDays) ? operatingDays : restaurant.operatingDays || [],
          ownerDetails,
          businessDocuments: documents,
          bankDetails,
          additionalInformation,
          submittedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    await ApplicationAuditModel.create({ application: application._id, admin: req.user._id, action: 'SUBMITTED', notes: 'Vendor submitted restaurant application' });
    await NotificationModel.create({
      user: req.user._id,
      recipientId: req.user._id,
      recipientRole: 'VENDOR',
      title: 'Application submitted',
      message: 'Your restaurant application has been submitted successfully. Our admin team will review it.',
      type: 'system',
      notificationType: 'APPLICATION_SUBMITTED',
      link: '/vendor/application',
    });
    const admins = await UserModel.find({ role: 'ADMIN' }).select('_id').lean();
    if (admins.length > 0) {
      await NotificationModel.insertMany(admins.map((admin) => ({
        user: admin._id,
        recipientId: admin._id,
        recipientRole: 'ADMIN',
        title: 'New restaurant application',
        message: `${restaurant.name} submitted or updated a restaurant application for review.`,
        type: 'system',
        notificationType: 'APPLICATION_SUBMITTED',
        link: `/admin/restaurants/applications/${application._id}`,
      })));
    }
    return res.json({ success: true, message: 'Restaurant application submitted for review', restaurant, application });
  } catch (error) {
    next(error);
  }
};

export const getVendorDashboard = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    const id = restaurantId(restaurant);
    const itemQuery = id ? { restaurant: id } : { _id: null };
    const products = await ProductModel.find(itemQuery).select('name price finalPrice stock lowStockThreshold inStock publish totalOrders rating').lean();
    const orders = id
      ? await OrderModel.find({ 'items.restaurant': id }).sort({ createdAt: -1 }).limit(10).populate('user', 'name phone').lean()
      : [];
    const totals = await OrderModel.aggregate([
      ...(id ? [{ $match: { 'items.restaurant': id } }] : [{ $match: { _id: null } }]),
      { $group: { _id: null, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]);
    const statusCounts = await OrderModel.aggregate([
      ...(id ? [{ $match: { 'items.restaurant': id } }] : [{ $match: { _id: null } }]),
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    ]);
    const summary = totals[0] || { revenue: 0, count: 0 };
    return res.json({
      success: true,
      restaurant,
      stats: {
        totalOrders: summary.count,
        totalRevenue: summary.revenue,
        pendingOrders: orders.filter((order) => ['Placed', 'PLACED', 'Pending', 'pending'].includes(order.orderStatus)).length,
        activeMenuItems: products.filter((product) => product.publish && product.inStock).length,
        lowStockItems: products.filter((product) => product.stock !== null && product.stock <= (product.lowStockThreshold ?? 5)).length,
      },
      statusCounts,
      recentOrders: orders,
      popularItems: [...products].sort((a, b) => (b.totalOrders || 0) - (a.totalOrders || 0)).slice(0, 5),
    });
  } catch (error) {
    next(error);
  }
};

export const getVendorOrders = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    if (!restaurant) return res.json({ success: true, orders: [], total: 0 });
    const query = { 'items.restaurant': restaurant._id };
    if (req.query.status) query.orderStatus = req.query.status;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const [orders, total] = await Promise.all([
      OrderModel.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name phone').lean(),
      OrderModel.countDocuments(query),
    ]);
    return res.json({ success: true, orders, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
};

export const updateVendorOrderStatus = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    const order = await OrderModel.findById(req.params.id);
    if (!order || !restaurant || !orderBelongsToRestaurant(order, restaurant._id)) {
      return res.status(404).json({ success: false, message: 'Order not found for this restaurant' });
    }
    const transitions = {
      Placed: ['Confirmed', 'Cancelled'],
      Confirmed: ['Preparing', 'Cancelled'],
      Preparing: ['Out for Delivery', 'Cancelled'],
      'Out for Delivery': ['Delivered'],
    };
    const nextStatus = req.body.status;
    const current = order.orderStatus;
    if (!transitions[current]?.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: `Cannot move order from ${current} to ${nextStatus}` });
    }
    order.orderStatus = nextStatus;
    order.deliveryStatus = nextStatus;
    if (nextStatus === 'Confirmed') order.acceptedAt = new Date();
    if (nextStatus === 'Delivered') order.deliveredAt = new Date();
    await order.save();
    req.app.get('io')?.emit('order_status_updated', { orderId: order._id, orderStatus: nextStatus });
    return res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

export const getVendorMenu = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    const foods = restaurant
      ? await ProductModel.find({ restaurant: restaurant._id }).sort({ createdAt: -1 }).lean()
      : [];
    return res.json({ success: true, foods, restaurant });
  } catch (error) {
    next(error);
  }
};

export const getVendorInventory = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    const foods = restaurant
      ? await ProductModel.find({ restaurant: restaurant._id })
        .select('name category stock lowStockThreshold inStock publish unit')
        .sort({ stock: 1, name: 1 })
        .lean()
      : [];
    return res.json({
      success: true,
      foods,
      lowStockCount: foods.filter((food) => food.stock !== null && food.stock <= (food.lowStockThreshold ?? 5)).length,
    });
  } catch (error) {
    next(error);
  }
};

export const updateVendorInventory = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    const { stock, lowStockThreshold, inStock } = req.body;
    const updates = {};
    if (stock !== undefined) {
      const value = Number(stock);
      if (!Number.isFinite(value) || value < 0) return res.status(400).json({ success: false, message: 'Stock must be a non-negative number' });
      updates.stock = value;
      updates.inStock = value > 0;
    }
    if (lowStockThreshold !== undefined) {
      const value = Number(lowStockThreshold);
      if (!Number.isFinite(value) || value < 0) return res.status(400).json({ success: false, message: 'Low-stock threshold must be a non-negative number' });
      updates.lowStockThreshold = value;
    }
    if (inStock !== undefined && stock === undefined) updates.inStock = Boolean(inStock);
    const food = await ProductModel.findOneAndUpdate(
      { _id: req.params.id, restaurant: restaurantId(restaurant) },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();
    if (!food) return res.status(404).json({ success: false, message: 'Inventory item not found for this restaurant' });
    req.app.get('io')?.emit('catalogue_updated', { type: 'foods', timestamp: Date.now() });
    return res.json({ success: true, food });
  } catch (error) {
    next(error);
  }
};

export const createVendorMenuItem = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    if (!restaurant) return res.status(400).json({ success: false, message: 'Create a restaurant profile before adding menu items' });
    if (typeof req.body.category === 'string' && req.body.category.trim()) {
      await CategoryModel.findOneAndUpdate(
        { name: req.body.category.trim() },
        { $setOnInsert: { name: req.body.category.trim(), image: '', isActive: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      );
    }
    const food = await ProductModel.create({ ...req.body, restaurant: restaurant._id });
    return res.status(201).json({ success: true, food });
  } catch (error) {
    next(error);
  }
};

export const updateVendorMenuItem = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    const food = await ProductModel.findOneAndUpdate(
      { _id: req.params.id, restaurant: restaurantId(restaurant) },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!food) return res.status(404).json({ success: false, message: 'Menu item not found for this restaurant' });
    return res.json({ success: true, food });
  } catch (error) {
    next(error);
  }
};

export const deleteVendorMenuItem = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    const food = await ProductModel.findOneAndDelete({ _id: req.params.id, restaurant: restaurantId(restaurant) });
    if (!food) return res.status(404).json({ success: false, message: 'Menu item not found for this restaurant' });
    return res.json({ success: true, message: 'Menu item deleted' });
  } catch (error) {
    next(error);
  }
};

export const getVendorRestaurant = async (req, res, next) => {
  try {
    return res.json({ success: true, restaurant: await getRestaurant(req) });
  } catch (error) {
    next(error);
  }
};

export const updateVendorRestaurant = async (req, res, next) => {
  try {
    const restaurant = await getRestaurant(req);
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant profile not found' });
    const allowed = ['name', 'description', 'logo', 'coverImage', 'address', 'city', 'phone', 'prepTime', 'deliveryFee', 'cuisines', 'location'];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) restaurant[key] = req.body[key];
    });
    if (restaurant.approvalStatus === 'NOT_SUBMITTED') {
      restaurant.approvalStatus = 'PENDING';
      restaurant.submittedAt = new Date();
    }
    restaurant.owner = restaurant.owner || req.user._id;
    await restaurant.save();
    return res.json({ success: true, restaurant });
  } catch (error) {
    next(error);
  }
};

export const getRestaurantApplications = async (req, res, next) => {
  try {
    const { search = '', status = 'All', city = '', page = 1, limit = 20 } = req.query;
    const query = {};
    if (status !== 'All') query.status = status;
    if (city?.trim()) query.city = { $regex: city.trim(), $options: 'i' };
    if (search?.trim()) {
      const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { restaurantName: { $regex: safe, $options: 'i' } },
        { restaurantEmail: { $regex: safe, $options: 'i' } },
        { restaurantPhone: { $regex: safe, $options: 'i' } },
        { 'ownerDetails.fullName': { $regex: safe, $options: 'i' } },
      ];
    }
    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageSize = Math.max(Math.min(Number(limit) || 20, 100), 1);
    const total = await RestaurantApplicationModel.countDocuments(query);
    const applications = await RestaurantApplicationModel.find(query)
      .sort({ submittedAt: -1, createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .populate('restaurant', 'name address city approvalStatus documents logo coverImage')
      .populate('applicant', 'name email phone')
      .lean();
    return res.json({ success: true, applications, total, page: pageNumber, pages: Math.ceil(total / pageSize) });
  } catch (error) {
    next(error);
  }
};

export const reviewRestaurantApplication = async (req, res, next) => {
  try {
    const { status, reviewNotes = '', rejectionReason = '' } = req.body;
    const validStatuses = ['UNDER_REVIEW', 'ADDITIONAL_DOCUMENTS_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid restaurant application status' });
    }
    const application = await RestaurantApplicationModel.findById(req.params.id);
    if (!application) return res.status(404).json({ success: false, message: 'Restaurant application not found' });
    application.status = status;
    application.applicationStatus = status;
    application.reviewNotes = String(reviewNotes).trim();
    application.rejectionReason = status === 'REJECTED'
      ? String(rejectionReason || reviewNotes).trim()
      : '';
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    if (status === 'APPROVED') application.approvedAt = new Date();
    if (status === 'REJECTED') application.rejectedAt = new Date();
    await application.save();
    const restaurant = await RestaurantModel.findByIdAndUpdate(
      application.restaurant,
      {
        approvalStatus: status,
        rejectionReason: status === 'REJECTED' ? application.rejectionReason : '',
        approvedAt: status === 'APPROVED' ? new Date() : null,
        isActive: status === 'APPROVED',
        isOpen: status === 'APPROVED',
      },
      { new: true, runValidators: true }
    );
    await ApplicationAuditModel.create({
      application: application._id,
      admin: req.user._id,
      action: status,
      notes: application.rejectionReason || String(reviewNotes).trim(),
    });
    const vendorId = application.applicant;
    if (vendorId) {
      await NotificationModel.create({
        user: vendorId,
        recipientId: vendorId,
        recipientRole: 'VENDOR',
        title: status === 'APPROVED' ? 'Restaurant approved' : status === 'REJECTED' ? 'Application rejected' : 'Application under review',
        message: status === 'APPROVED'
          ? 'Your restaurant application has been approved. Vendor dashboard access is now available.'
          : status === 'REJECTED'
            ? `Your application was rejected: ${application.rejectionReason}`
            : 'Your restaurant application is currently under review.',
        type: 'system',
        notificationType: `APPLICATION_${status}`,
        link: '/vendor/application',
      });
    }
    return res.json({ success: true, application, restaurant });
  } catch (error) {
    next(error);
  }
};

export const getRestaurantApplicationById = async (req, res, next) => {
  try {
    const application = await RestaurantApplicationModel.findById(req.params.id)
      .populate('restaurant')
      .populate('applicant', 'name email phone avatar')
      .populate('reviewedBy', 'name email')
      .lean();
    if (!application) return res.status(404).json({ success: false, message: 'Restaurant application not found' });
    const audit = await ApplicationAuditModel.find({ application: application._id })
      .populate('admin', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    const menuItems = application.restaurant
      ? await ProductModel.find({ restaurant: application.restaurant })
        .select('name category price discount images image isVeg inStock isFeatured publish description prepTime')
        .sort({ isBestseller: -1, createdAt: -1 })
        .lean()
      : [];
    return res.json({ success: true, application, audit, menuItems });
  } catch (error) {
    next(error);
  }
};

export const getMarketplaceStatistics = async (req, res, next) => {
  try {
    const [totalApplications, pending, underReview, approved, rejected, suspended, activeVendors] = await Promise.all([
      RestaurantApplicationModel.countDocuments(),
      RestaurantApplicationModel.countDocuments({ status: 'PENDING' }),
      RestaurantApplicationModel.countDocuments({ status: 'UNDER_REVIEW' }),
      RestaurantApplicationModel.countDocuments({ status: 'APPROVED' }),
      RestaurantApplicationModel.countDocuments({ status: 'REJECTED' }),
      RestaurantApplicationModel.countDocuments({ status: 'SUSPENDED' }),
      UserModel.countDocuments({ role: 'VENDOR', isBlocked: false }),
    ]);
    return res.json({
      success: true,
      statistics: { totalApplications, pending, underReview, approved, rejected, suspended, activeVendors },
    });
  } catch (error) {
    next(error);
  }
};
