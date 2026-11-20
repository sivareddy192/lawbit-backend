import OrderModel from '../models/order.model.js';
import ProductModel from '../models/product.model.js';
import CouponModel from '../models/coupon.model.js';
import UserModel from '../models/user.model.js';
import CartProductModel from '../models/cartproduct.model.js';
import { StoreSettingsModel, defaultStoreSettings } from '../models/storeSettings.model.js';
import { checkAndAdvanceOrderStatus } from './deliveryBoy.controller.js';
import cache from '../services/cacheService.js';
import taskQueue from '../services/queueService.js';

const generateUniqueOrderId = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `AK-${ts}-${rand}`;
};

export const createOrder = async (req, res, next) => {
  try {
    const { items, deliveryAddress, paymentMethod, couponCode, deliveryInstructions } = req.body;
    const storedSettings = await StoreSettingsModel.findOne({ key: 'global' }).lean();
    const activeSettings = { ...defaultStoreSettings, ...(storedSettings || {}) };

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No items in order' });
    }

    if (!deliveryAddress || !deliveryAddress.houseFlat || !deliveryAddress.street) {
      return res.status(400).json({ success: false, message: 'Please provide a valid delivery address' });
    }

    const resolvedDeliveryAddress = {
      ...deliveryAddress,
      fullName: deliveryAddress.fullName || req.user?.name || 'Customer',
      phone: deliveryAddress.phone || req.user?.phone || 'N/A',
      latitude: Number(deliveryAddress.latitude || 31.2554),
      longitude: Number(deliveryAddress.longitude || 75.7052),
    };

    const productIds = items
      .map((item) => item.food || item.productId || item._id)
      .filter((id) => id && String(id).match(/^[0-9a-fA-F]{24}$/));

    const foodDocs = await ProductModel.find({ _id: { $in: productIds } })
      .populate('restaurant', 'name slug logo isOpen rating prepTime deliveryFee address')
      .lean();
    const foodMap = new Map(foodDocs.map((f) => [String(f._id), f]));

    let itemsPrice = 0;
    const verifiedItems = [];

    for (const item of items) {
      const lookupId = String(item.food || item.productId || item._id || '');
      const foodDoc = foodMap.get(lookupId);

      if (!foodDoc) {
        return res.status(404).json({
          success: false,
          message: `Dish "${item.name || 'Selected Item'}" is no longer available in menu`,
        });
      }

      const basePrice = foodDoc.finalPrice || foodDoc.price || 0;
      const selectedSize =
        item.size && foodDoc.sizes
          ? foodDoc.sizes.find((s) => s.name?.toLowerCase() === item.size?.toLowerCase())
          : null;
      const sizePrice = selectedSize
        ? Number(selectedSize.price) > 0
          ? Number(selectedSize.price)
          : Number(selectedSize.priceModifier || 0)
        : 0;
      const addOnsTotal = item.addOns
        ? item.addOns.reduce((acc, a) => acc + (Number(a.price) || 0), 0)
        : 0;

      const unitPrice = Math.max(0, (sizePrice > 0 ? sizePrice : basePrice) + addOnsTotal);
      const qty = Math.max(1, Number(item.quantity || 1));
      const itemTotal = unitPrice * qty;
      itemsPrice += itemTotal;

      verifiedItems.push({
        food: foodDoc._id,
        productId: foodDoc._id,
        restaurant: foodDoc.restaurant?._id || foodDoc.restaurant || null,
        restaurantName: foodDoc.restaurant?.name || '',
        name: foodDoc.name,
        image: foodDoc.images?.[0] || (Array.isArray(foodDoc.image) ? foodDoc.image[0] : foodDoc.image) || item.image || '',
        price: unitPrice,
        quantity: qty,
        size: item.size || 'Regular',
        addOns: item.addOns || [],
        itemTotal,
      });
    }

    const taxRate = Math.max(0, Number(activeSettings.taxPercentage ?? 5)) / 100;
    const taxPrice = Math.round(itemsPrice * taxRate);
    const deliveryFee = 0;

    let discountAmount = 0;
    let couponApplied = null;

    if (couponCode && typeof couponCode === 'string' && couponCode.trim() !== '') {
      const couponDoc = await CouponModel.findOne({
        code: couponCode.trim().toUpperCase(),
        isActive: true,
      });
      if (couponDoc && itemsPrice >= couponDoc.minOrderValue) {
        if (couponDoc.discountType === 'percentage') {
          const rawDiscount = (itemsPrice * couponDoc.discountValue) / 100;
          discountAmount = couponDoc.maxDiscount ? Math.min(rawDiscount, couponDoc.maxDiscount) : rawDiscount;
        } else {
          discountAmount = couponDoc.discountValue;
        }
        discountAmount = Math.round(discountAmount);
        couponApplied = { code: couponDoc.code, discount: discountAmount };
        if (couponDoc.usedCount !== undefined) couponDoc.usedCount += 1;
        await couponDoc.save();
      }
    }

    const totalAmount = Math.max(0, itemsPrice + taxPrice + deliveryFee - discountAmount);
    const generatedOrderId = generateUniqueOrderId();
    const vendorMap = new Map();
    for (const item of verifiedItems) {
      const restaurantId = item.restaurant ? String(item.restaurant._id || item.restaurant) : '';
      const key = restaurantId || 'platform';
      if (!vendorMap.has(key)) {
        vendorMap.set(key, {
          restaurant: restaurantId || undefined,
          name: item.restaurantName || 'AK Foods',
          itemsSubtotal: 0,
        });
      }
      vendorMap.get(key).itemsSubtotal += item.itemTotal;
    }
    const vendors = Array.from(vendorMap.values());

    const complimentaryItems = [];

    const customerLocation = {
      latitude: resolvedDeliveryAddress.latitude,
      longitude: resolvedDeliveryAddress.longitude,
      address: [
        resolvedDeliveryAddress.houseFlat,
        resolvedDeliveryAddress.street,
        resolvedDeliveryAddress.landmark ? `Near ${resolvedDeliveryAddress.landmark}` : '',
        resolvedDeliveryAddress.city,
        resolvedDeliveryAddress.pincode,
      ].filter(Boolean).join(', ') || 'Law Gate, Phagwara',
    };

    const restaurantLocation = {
      latitude: 31.2554,
      longitude: 75.7052,
      address: 'AK Foods Kitchen, Law Gate, Phagwara, Punjab 144411',
    };

    const trackingTimeline = [
      { status: 'Placed', title: 'Placed', description: 'Your order was received by the kitchen.', timestamp: new Date(), isCompleted: true },
      { status: 'Confirmed', title: 'Confirmed', description: 'Kitchen has accepted your order.', timestamp: null, isCompleted: false },
      { status: 'Preparing', title: 'Preparing', description: 'Our chef is cooking your meal fresh.', timestamp: null, isCompleted: false },
      { status: 'Out for Delivery', title: 'Out for Delivery', description: 'Delivery partner is on the way.', timestamp: null, isCompleted: false },
      { status: 'Delivered', title: 'Delivered', description: 'Order delivered successfully.', timestamp: null, isCompleted: false },
    ];

    const createdOrder = await OrderModel.create({
      orderId: generatedOrderId,
      user: req.user._id,
      userId: req.user._id,
      items: verifiedItems,
      vendors,
      complimentaryItems,
      customerLocation,
      restaurantLocation,
      deliveryAddress: resolvedDeliveryAddress,
      paymentMethod: paymentMethod || 'COD',
      paymentStatus: 'Pending',
      orderStatus: 'Placed',
      deliveryStatus: 'Placed',
      itemsPrice,
      subTotalAmt: itemsPrice,
      taxPrice,
      deliveryFee,
      discountAmount,
      couponApplied,
      totalAmount,
      totalAmt: totalAmount,
      deliveryInstructions: typeof deliveryInstructions === 'string' ? deliveryInstructions.trim() : '',
      deliveryPartner: null,
      trackingTimeline,
    });

    const io = req.app.get('io');
    if (io) {
      io.to('admin_dashboard').emit('new_order', {
        orderId: generatedOrderId,
        totalAmount,
        customerName: req.user?.name || 'Customer',
      });
      if (req.user?._id) {
        io.to(`user:${req.user._id}`).emit('new_order_placed', { orderId: generatedOrderId });
      }
    }

    taskQueue.enqueue('UPDATE_PRODUCT_ORDER_COUNT', { verifiedItems });
    taskQueue.enqueue('INVALIDATE_CATALOGUE_CACHE');

    if (req.user?._id) {
      CartProductModel.deleteMany({ userId: req.user._id }).catch(() => {});
      UserModel.findByIdAndUpdate(req.user._id, { shopping_cart: [] }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully and dispatched to kitchen',
      order: createdOrder,
    });
  } catch (error) {
    next(error);
  }
};

export const createOrderController = createOrder;

export const getMyOrders = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;
    const orders = await OrderModel.find({
      $or: [{ user: userId }, { userId }],
    }).sort({ createdAt: -1 });

    for (const ord of orders) {
      await checkAndAdvanceOrderStatus(ord);
    }
    return res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    next(error);
  }
};

export const getOrderDetailsController = getMyOrders;

export const buildOrderLookupQuery = (id) => {
  if (!id || typeof id !== 'string') return { _id: null };
  const cleanId = id.trim();
  const conditions = [{ orderId: cleanId }];
  if (cleanId.match(/^[0-9a-fA-F]{24}$/)) {
    conditions.push({ _id: cleanId });
  }
  return { $or: conditions };
};

export const getOrderById = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid order identifier' });
    }

    const order = await OrderModel.findOne(buildOrderLookupQuery(id)).populate('user', 'name email phone avatar');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const currentUserId = req.user?._id?.toString() || req.userId?.toString();
    const orderUserId = (order.user?._id || order.user || order.userId)?.toString();
    const isOwner = currentUserId && orderUserId && currentUserId === orderUserId;
    const isStaff = req.user && (req.user.role === 'ADMIN' || req.user.role === 'DELIVERY');

    if (!isOwner && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not authorized to view this order',
      });
    }

    await checkAndAdvanceOrderStatus(order);
    return res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

export const cancelOrder = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { reason } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid order identifier' });
    }

    const order = await OrderModel.findOne(buildOrderLookupQuery(id));

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const currentUserId = req.user?._id?.toString() || req.userId?.toString();
    const orderUserId = (order.user?._id || order.user || order.userId)?.toString();
    const isOwner = currentUserId && orderUserId && currentUserId === orderUserId;
    const isAdmin = req.user && req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not authorized to cancel this order',
      });
    }

    if (['Out for Delivery', 'Delivered', 'Cancelled'].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order once food is ${order.orderStatus.toLowerCase()}`,
      });
    }

    order.orderStatus = 'Cancelled';
    order.deliveryStatus = 'Cancelled';
    order.cancellationReason = typeof reason === 'string' && reason.trim() ? reason.trim() : (isAdmin ? 'Cancelled by Admin' : 'Customer requested cancellation');

    order.trackingTimeline = order.trackingTimeline || [];
    const cancelTimelineItem = order.trackingTimeline.find(t => t.status === 'Cancelled');
    if (!cancelTimelineItem) {
      order.trackingTimeline.push({
        status: 'Cancelled',
        title: 'Order Cancelled',
        description: order.cancellationReason,
        timestamp: new Date(),
        isCompleted: true,
      });
    } else {
      cancelTimelineItem.isCompleted = true;
      cancelTimelineItem.timestamp = new Date();
      cancelTimelineItem.description = order.cancellationReason;
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      const payload = {
        orderId: order.orderId,
        _id: order._id,
        orderStatus: 'Cancelled',
        deliveryStatus: 'Cancelled',
        cancellationReason: order.cancellationReason,
        order,
        timestamp: new Date(),
      };
      io.to(`order:${order.orderId}`).to(`order:${order._id}`).emit('order_status_updated', payload);
      io.emit('order_status_updated', payload);
      io.emit('order_cancelled', payload);
    }

    return res.json({ success: true, message: 'Order cancelled successfully', order });
  } catch (error) {
    next(error);
  }
};

export const getAdminOrders = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status && status !== 'All') {
      query.orderStatus = status;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { orderId: { $regex: safeSearch, $options: 'i' } },
        { 'deliveryAddress.fullName': { $regex: safeSearch, $options: 'i' } },
        { 'deliveryAddress.phone': { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;

    const totalOrders = await OrderModel.countDocuments(query);
    const orders = await OrderModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate('user', 'name email phone avatar');

    for (const ord of orders) {
      await checkAndAdvanceOrderStatus(ord);
    }

    return res.json({
      success: true,
      count: orders.length,
      totalOrders,
      totalPages: Math.ceil(totalOrders / pageSize),
      currentPage: pageNumber,
      orders,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllOrders = getAdminOrders;
export const getAllOrdersAdmin = getAdminOrders;

export const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderStatus, deliveryStatus, paymentStatus, status, reason, cancellationReason } = req.body;
    const newStatus = orderStatus || status;
    const id = req.params.id;

    const order = await OrderModel.findOne(buildOrderLookupQuery(id));

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (newStatus) {
      order.orderStatus = newStatus;
      if (newStatus === 'Cancelled') {
        order.deliveryStatus = 'Cancelled';
        order.cancellationReason = reason || cancellationReason || 'Cancelled by Admin';
        order.trackingTimeline = order.trackingTimeline || [];
        const cancelTimelineItem = order.trackingTimeline.find(t => t.status === 'Cancelled');
        if (!cancelTimelineItem) {
          order.trackingTimeline.push({
            status: 'Cancelled',
            title: 'Order Cancelled',
            description: order.cancellationReason,
            timestamp: new Date(),
            isCompleted: true,
          });
        } else {
          cancelTimelineItem.isCompleted = true;
          cancelTimelineItem.timestamp = new Date();
          cancelTimelineItem.description = order.cancellationReason;
        }
      } else if (newStatus === 'Delivered') {
        order.deliveredAt = new Date();
        order.paymentStatus = 'Completed';
        order.deliveryStatus = 'Delivered';
      } else if (newStatus === 'Out for Delivery') {
        order.orderStatus = 'Out for Delivery';
        order.deliveryStatus = 'Out for Delivery';
      } else if (newStatus === 'Preparing') {
        order.orderStatus = 'Preparing';
        order.deliveryStatus = 'Preparing';
      } else if (newStatus === 'Confirmed') {
        order.orderStatus = 'Confirmed';
        order.deliveryStatus = 'Confirmed';
      } else if (newStatus === 'Placed') {
        order.orderStatus = 'Placed';
        order.deliveryStatus = 'Placed';
      }
    }
    if (deliveryStatus) order.deliveryStatus = deliveryStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;

    await order.save();

    const io = req.app.get('io');
    if (io) {
      const payload = {
        orderId: order.orderId,
        _id: order._id,
        orderStatus: order.orderStatus,
        deliveryStatus: order.deliveryStatus || order.orderStatus,
        paymentStatus: order.paymentStatus,
        cancellationReason: order.cancellationReason,
        order,
        timestamp: new Date(),
      };
      io.to(`order:${order.orderId}`).to(`order:${order._id}`).emit('order_status_updated', payload);
      io.emit('order_status_updated', payload);
      if (order.orderStatus === 'Cancelled') {
        io.emit('order_cancelled', payload);
      }
    }

    return res.json({ success: true, message: 'Order updated successfully', order });
  } catch (error) {
    next(error);
  }
};

export const getDashboardStats = async (req, res, next) => {
  try {
    let totalRevenue = 0;
    let totalOrders = 0;
    let pendingOrders = 0;
    let totalUsers = 0;
    let totalFoods = 0;
    let topFoods = [];
    let recentOrders = [];
    let weeklySales = [];
    let monthlyRevenue = [];
    let categoryPerformance = [
      { name: 'Crispy Chicken', value: 45 },
      { name: 'Burgers & Wraps', value: 25 },
      { name: 'Artisan Pizza', value: 18 },
      { name: 'Sides & Drinks', value: 12 },
    ];

    try {
      const [totalRevenueResult, tOrders, pOrders, tUsers, tFoods] = await Promise.all([
        OrderModel.aggregate([
          { $match: { orderStatus: { $ne: 'Cancelled' } } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$totalAmount', '$totalAmt'] } } } },
        ]),
        OrderModel.countDocuments(),
        OrderModel.countDocuments({
          orderStatus: { $in: ['Placed', 'Confirmed', 'Preparing', 'Out for Delivery'] },
        }),
        UserModel.countDocuments({ role: { $in: ['USER', 'customer', 'user', 'User'] } }),
        ProductModel.countDocuments(),
      ]);

      totalRevenue = totalRevenueResult[0]?.total || 0;
      totalOrders = tOrders || 0;
      pendingOrders = pOrders || 0;
      totalUsers = tUsers || 0;
      totalFoods = tFoods || 0;
    } catch (e) {
      console.warn('Dashboard counts aggregation warning:', e.message);
    }

    try {
      topFoods = await ProductModel.find().sort({ totalOrders: -1 }).limit(5).lean();
    } catch (e) {
      console.warn('Dashboard top foods query warning:', e.message);
    }

    try {
      recentOrders = await OrderModel.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .populate({ path: 'user', select: 'name email phone avatar', model: UserModel })
        .lean();
    } catch (e) {
      console.warn('Dashboard recent orders query warning:', e.message);
      recentOrders = await OrderModel.find().sort({ createdAt: -1 }).limit(6).lean();
    }

    // Dynamic 7-day sales aggregation
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const salesAgg = await OrderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo, $exists: true, $type: 'date' },
            orderStatus: { $ne: 'Cancelled' },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: { $ifNull: ['$totalAmount', '$totalAmt'] } },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const found = salesAgg.find((s) => s._id === dateStr);
        weeklySales.push({
          day: dayNames[d.getDay()],
          date: dateStr,
          revenue: found ? found.revenue : 0,
          orders: found ? found.orders : 0,
        });
      }
    } catch (e) {
      console.warn('Dashboard weekly sales aggregation warning:', e.message);
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        weeklySales.push({
          day: dayNames[d.getDay()],
          date: d.toISOString().split('T')[0],
          revenue: 0,
          orders: 0,
        });
      }
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      const monthlyAgg = await OrderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: sixMonthsAgo, $exists: true, $type: 'date' },
            orderStatus: { $ne: 'Cancelled' },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            revenue: { $sum: { $ifNull: ['$totalAmount', '$totalAmt'] } },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const found = monthlyAgg.find((m) => m._id === key);
        monthlyRevenue.push({
          month: monthNames[d.getMonth()],
          key,
          revenue: found ? found.revenue : 0,
        });
      }
    } catch (e) {
      console.warn('Dashboard monthly aggregation warning:', e.message);
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        monthlyRevenue.push({
          month: monthNames[d.getMonth()],
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          revenue: 0,
        });
      }
    }

    try {
      const categoryAgg = await ProductModel.aggregate([
        { $match: { category: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalOrders: { $sum: { $ifNull: ['$totalOrders', 0] } },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]);

      if (categoryAgg && categoryAgg.length > 0) {
        categoryPerformance = categoryAgg.map((c) => ({
          name: typeof c._id === 'string' ? c._id : (c._id?.name || 'Delicacy'),
          value: c.totalOrders > 0 ? c.totalOrders : c.count,
        }));
      }
    } catch (e) {
      console.warn('Dashboard category aggregation warning:', e.message);
    }

    return res.json({
      success: true,
      stats: {
        totalRevenue,
        totalOrders,
        pendingOrders,
        totalUsers,
        totalFoods,
        avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      },
      topFoods,
      recentOrders,
      weeklySales,
      monthlyRevenue,
      categoryPerformance,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminAnalytics = async (req, res, next) => {
  try {
    const orders = await OrderModel.find({ orderStatus: { $ne: 'Cancelled' } }).lean();

    const totalOrders = orders.length;
    let totalRevenue = 0;
    let todayRevenue = 0;
    let todayOrders = 0;
    let deliveredOrders = 0;
    let activeOrdersCount = 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const paymentMap = {
      'COD': 0,
      'ONLINE': 0,
      'CARD': 0,
      'UPI': 0,
    };

    const hourMap = Array(24).fill(0);
    const dishMap = new Map();

    orders.forEach((order) => {
      const orderTotal = Number(order.totalAmount || order.totalAmt || 0);
      totalRevenue += orderTotal;

      const orderDate = new Date(order.createdAt || Date.now());
      if (orderDate >= startOfToday) {
        todayRevenue += orderTotal;
        todayOrders += 1;
      }

      if (order.orderStatus === 'Delivered') {
        deliveredOrders += 1;
      } else if (['Placed', 'Confirmed', 'Preparing', 'Out for Delivery'].includes(order.orderStatus)) {
        activeOrdersCount += 1;
      }

      const pm = (order.paymentMethod || 'COD').toUpperCase();
      if (pm.includes('COD') || pm.includes('CASH')) {
        paymentMap['COD'] = (paymentMap['COD'] || 0) + 1;
      } else if (pm.includes('CARD')) {
        paymentMap['CARD'] = (paymentMap['CARD'] || 0) + 1;
      } else {
        paymentMap['UPI'] = (paymentMap['UPI'] || 0) + 1;
      }

      const hour = orderDate.getHours();
      hourMap[hour] = (hourMap[hour] || 0) + 1;

      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const name = item.name || 'Delicious Dish';
          const qty = Number(item.quantity) || 1;
          const rev = Number(item.itemTotal || (item.price || 0) * qty || 0);
          const existing = dishMap.get(name) || { name, orders: 0, revenue: 0, image: item.image || '' };
          existing.orders += qty;
          existing.revenue += rev;
          if (!existing.image && item.image) existing.image = item.image;
          dishMap.set(name, existing);
        });
      }
    });

    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const deliveryRate = totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 100;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailySales = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayOrders = orders.filter((o) => {
        const od = new Date(o.createdAt);
        return od >= d && od < nextDay;
      });

      const dayRev = dayOrders.reduce((sum, o) => sum + Number(o.totalAmount || o.totalAmt || 0), 0);
      dailySales.push({
        label: dayNames[d.getDay()],
        date: d.toISOString().split('T')[0],
        revenue: dayRev,
        orders: dayOrders.length,
        avgOrder: dayOrders.length > 0 ? Math.round(dayRev / dayOrders.length) : 0,
      });
    }

    const weeklySales = [];
    for (let i = 3; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - (i + 1) * 7);
      const end = new Date();
      end.setDate(end.getDate() - i * 7);

      const weekOrders = orders.filter((o) => {
        const od = new Date(o.createdAt);
        return od >= start && od < end;
      });

      const weekRev = weekOrders.reduce((sum, o) => sum + Number(o.totalAmount || o.totalAmt || 0), 0);
      weeklySales.push({
        label: `Week ${4 - i}`,
        revenue: weekRev,
        orders: weekOrders.length,
        avgOrder: weekOrders.length > 0 ? Math.round(weekRev / weekOrders.length) : 0,
      });
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlySales = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();

      const monthOrders = orders.filter((o) => {
        const od = new Date(o.createdAt);
        return od.getFullYear() === year && od.getMonth() === month;
      });

      const monthRev = monthOrders.reduce((sum, o) => sum + Number(o.totalAmount || o.totalAmt || 0), 0);
      monthlySales.push({
        label: monthNames[month],
        revenue: monthRev,
        orders: monthOrders.length,
        avgOrder: monthOrders.length > 0 ? Math.round(monthRev / monthOrders.length) : 0,
      });
    }

    const yearlySales = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear; y++) {
      const yearOrders = orders.filter((o) => new Date(o.createdAt).getFullYear() === y);
      const yearRev = yearOrders.reduce((sum, o) => sum + Number(o.totalAmount || o.totalAmt || 0), 0);
      yearlySales.push({
        label: String(y),
        revenue: yearRev,
        orders: yearOrders.length,
        avgOrder: yearOrders.length > 0 ? Math.round(yearRev / yearOrders.length) : 0,
      });
    }

    const totalPayments = (paymentMap['COD'] + paymentMap['UPI'] + paymentMap['CARD']) || 1;
    const paymentShare = [
      {
        name: 'Cash on Delivery (COD)',
        value: Math.round((paymentMap['COD'] / totalPayments) * 100) || (totalOrders === 0 ? 50 : 0),
        count: paymentMap['COD'],
        color: '#10b981',
      },
      {
        name: 'UPI (GPay / PhonePe / Paytm)',
        value: Math.round((paymentMap['UPI'] / totalPayments) * 100) || (totalOrders === 0 ? 35 : 0),
        count: paymentMap['UPI'],
        color: '#6366f1',
      },
      {
        name: 'Credit / Debit Cards',
        value: Math.round((paymentMap['CARD'] / totalPayments) * 100) || (totalOrders === 0 ? 15 : 0),
        count: paymentMap['CARD'],
        color: '#e11d48',
      },
    ];

    const targetHours = [
      { slot: 11, label: '11 AM' },
      { slot: 12, label: '12 PM' },
      { slot: 13, label: '1 PM' },
      { slot: 14, label: '2 PM' },
      { slot: 17, label: '5 PM' },
      { slot: 19, label: '7 PM' },
      { slot: 20, label: '8 PM' },
      { slot: 21, label: '9 PM' },
      { slot: 22, label: '10 PM' },
    ];
    const peakHours = targetHours.map((th) => ({
      hour: th.label,
      orders: hourMap[th.slot] || 0,
    }));

    const topDishes = Array.from(dishMap.values())
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 5);

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.json({
      success: true,
      summary: {
        totalRevenue,
        totalOrders,
        avgOrder,
        todayRevenue,
        todayOrders,
        deliveredOrders,
        deliveryRate,
        activeOrdersCount,
      },
      salesDataMap: {
        daily: dailySales,
        weekly: weeklySales,
        monthly: monthlySales,
        yearly: yearlySales,
      },
      paymentShare,
      peakHours,
      topDishes,
    });
  } catch (error) {
    next(error);
  }
};

export const getActiveCoupons = async (req, res, next) => {
  try {
    const coupons = await CouponModel.find({ isActive: true, expiryDate: { $gte: new Date() } });
    return res.json({ success: true, count: coupons.length, coupons });
  } catch (error) {
    next(error);
  }
};

export const validateCoupon = async (req, res, next) => {
  try {
    const { code } = req.body;
    const rawAmount = req.body.orderAmount ?? req.body.cartTotal ?? req.body.subtotal ?? req.body.amount ?? 0;
    const subtotal = Number(rawAmount) || 0;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Please enter a coupon code' });
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await CouponModel.findOne({ code: cleanCode, isActive: true });

    if (!coupon) {
      return res.status(400).json({ success: false, message: `Coupon code "${cleanCode}" is invalid or expired` });
    }

    if (coupon.expiryDate && new Date() > new Date(coupon.expiryDate)) {
      return res.status(400).json({ success: false, message: `Coupon "${cleanCode}" has expired` });
    }

    const minRequired = Number(coupon.minOrderValue || 0);
    if (subtotal < minRequired) {
      return res.status(400).json({
        success: false,
        message: `Add ₹${minRequired - subtotal} more to apply "${cleanCode}" (Min order ₹${minRequired})`,
      });
    }

    let discount = 0;
    if (coupon.discountType === 'percentage') {
      const rawDiscount = (subtotal * Number(coupon.discountValue || 0)) / 100;
      discount = coupon.maxDiscount ? Math.min(rawDiscount, Number(coupon.maxDiscount)) : rawDiscount;
    } else {
      discount = Math.min(Number(coupon.discountValue || 0), subtotal);
    }
    discount = Math.round(discount);

    return res.json({
      success: true,
      message: `🎉 Coupon "${cleanCode}" applied! You saved ₹${discount}`,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: discount,
        discount,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount,
        description: coupon.description,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminCoupons = async (req, res, next) => {
  try {
    const coupons = await CouponModel.find().sort({ createdAt: -1 });
    return res.json({ success: true, count: coupons.length, coupons });
  } catch (error) {
    next(error);
  }
};

export const createCoupon = async (req, res, next) => {
  try {
    const coupon = await CouponModel.create({
      ...req.body,
      code: req.body.code.toUpperCase(),
    });
    return res.status(201).json({ success: true, message: 'Coupon created successfully', coupon });
  } catch (error) {
    next(error);
  }
};

export const updateCoupon = async (req, res, next) => {
  try {
    const id = req.params.id;
    const coupon = await CouponModel.findByIdAndUpdate(id, req.body, { new: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    return res.json({ success: true, message: 'Coupon updated successfully', coupon });
  } catch (error) {
    next(error);
  }
};

export const deleteCoupon = async (req, res, next) => {
  try {
    const id = req.params.id;
    const coupon = await CouponModel.findByIdAndDelete(id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    return res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getStoreSettings = async (req, res, next) => {
  try {
    const cacheKey = 'asg:settings:global';
    const cached = await cache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600');
      return res.json(cached);
    }

    const storedSettings = await StoreSettingsModel.findOne({ key: 'global' }).lean();
    const { _id, __v, createdAt, updatedAt, ...settings } = storedSettings || {};
    const responsePayload = {
      success: true,
      settings: storedSettings ? { ...defaultStoreSettings, ...settings } : defaultStoreSettings,
    };

    cache.set(cacheKey, responsePayload, 600).catch(() => {});

    res.setHeader('X-Cache-Status', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600');
    return res.json(responsePayload);
  } catch (error) {
    next(error);
  }
};

export const updateStoreSettings = async (req, res, next) => {
  try {
    const settings = await StoreSettingsModel.findOneAndUpdate(
      { key: 'global' },
      {
        $set: { ...req.body, key: 'global' },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();
    const { _id, __v, createdAt, updatedAt, ...savedSettings } = settings;

    // Invalidate settings cache instantly
    cache.del('asg:settings:global').catch(() => {});

    const io = req.app.get('io');
    if (io) {
      io.emit('settings_updated', savedSettings);
    }

    return res.json({
      success: true,
      message: 'Store settings saved successfully',
      settings: savedSettings,
    });
  } catch (error) {
    next(error);
  }
};
