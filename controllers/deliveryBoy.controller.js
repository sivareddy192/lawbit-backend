import Order from '../models/order.model.js';
import User from '../models/user.model.js';
import DeliveryBoyModel from '../models/deliveryBoy.model.js';

const buildOrderLookupQuery = (id) => {
  if (!id || typeof id !== 'string') return { _id: null };
  const cleanId = id.trim();
  const conditions = [{ orderId: cleanId }];
  if (cleanId.match(/^[0-9a-fA-F]{24}$/)) {
    conditions.push({ _id: cleanId });
  }
  return { $or: conditions };
};

export const checkAndAdvanceOrderStatus = async (order) => {
  if (!order || !order.createdAt || order.orderStatus === 'Cancelled' || order.deliveryStatus === 'Cancelled' || order.orderStatus === 'Delivered') return order;
  const now = Date.now();
  const createdTime = new Date(order.createdAt).getTime();
  const elapsedFromCreateMs = now - createdTime;

  let modified = false;

  if (['Placed', 'Confirmed'].includes(order.orderStatus) && elapsedFromCreateMs >= 5 * 60 * 1000) {
    order.orderStatus = 'Preparing';
    order.deliveryStatus = 'Preparing';
    const prepItem = order.trackingTimeline?.find(t => t.status === 'Preparing');
    if (prepItem) {
      prepItem.isCompleted = true;
      prepItem.timestamp = prepItem.timestamp || new Date(createdTime + 5 * 60 * 1000);
      prepItem.description = 'Chef is preparing your fresh order in the AK kitchen.';
    }
    modified = true;
  }

  if (modified && typeof order.save === 'function') {
    try {
      await order.save();
    } catch (e) {
    }
  }
  return order;
};

export const getDeliveryStats = async (req, res, next) => {
  try {
    const riderPhone = req.user.phone;
    const riderName = req.user.name;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const allActivePending = await Order.find({
      orderStatus: { $in: ['Placed', 'Confirmed', 'Preparing'] },
    });
    for (const ord of allActivePending) {
      await checkAndAdvanceOrderStatus(ord);
    }

    const [
      activeOrders,
      availableOrdersCount,
      todayDeliveredOrders,
      allDeliveredOrders,
    ] = await Promise.all([
      Order.find({
        orderStatus: 'Out for Delivery',
        $or: [
          { 'deliveryPartner.phone': riderPhone },
          { 'deliveryPartner.name': riderName },
        ],
      }).sort({ updatedAt: -1 }),
      Order.countDocuments({
        orderStatus: { $in: ['Placed', 'Confirmed', 'Preparing'] },
        $or: [
          { 'deliveryPartner.name': { $exists: false } },
          { 'deliveryPartner.name': null },
          { 'deliveryPartner.name': '' },
        ],
      }),
      Order.find({
        orderStatus: 'Delivered',
        updatedAt: { $gte: startOfToday },
        $or: [
          { 'deliveryPartner.phone': riderPhone },
          { 'deliveryPartner.name': riderName },
        ],
      }),
      Order.find({
        orderStatus: 'Delivered',
        $or: [
          { 'deliveryPartner.phone': riderPhone },
          { 'deliveryPartner.name': riderName },
        ],
      }),
    ]);

    const todayDeliveriesCount = todayDeliveredOrders.length;
    const totalDeliveriesCount = Math.max(allDeliveredOrders.length, req.user.totalDeliveries || 0);

    return res.json({
      success: true,
      stats: {
        isOnline: req.user.isOnline !== false,
        activeOrdersCount: activeOrders.length,
        availableOrdersCount,
        todayDeliveriesCount,
        totalDeliveriesCount,
        driverRating: req.user.driverRating || 4.9,
        vehicleType: req.user.vehicleType || 'Motorbike',
        vehicleNumber: req.user.vehicleNumber || 'TS 09 EA 4521',
      },
      activeOrder: activeOrders[0] || null,
      recentDeliveries: todayDeliveredOrders.slice(0, 5),
    });
  } catch (error) {
    next(error);
  }
};

export const getDeliveryOrders = async (req, res, next) => {
  try {
    const { tab = 'all', search } = req.query;
    const riderPhone = req.user.phone;
    const riderName = req.user.name;

    let query = {};

    if (tab === 'available') {
      query.orderStatus = { $in: ['Placed', 'Confirmed', 'Preparing'] };
    } else if (tab === 'active') {
      query.orderStatus = 'Out for Delivery';
      if (req.user?.role?.toUpperCase() !== 'ADMIN') {
        query.$or = [
          { 'deliveryPartner.phone': riderPhone },
          { 'deliveryPartner.name': riderName },
        ];
      }
    } else if (tab === 'delivered') {
      query.orderStatus = 'Delivered';
      if (req.user?.role?.toUpperCase() !== 'ADMIN') {
        query.$or = [
          { 'deliveryPartner.phone': riderPhone },
          { 'deliveryPartner.name': riderName },
        ];
      }
    } else {
      query.$or = [
        { orderStatus: { $in: ['Placed', 'Confirmed', 'Preparing'] } },
        {
          orderStatus: { $in: ['Out for Delivery', 'Delivered'] },
          $or: [
            { 'deliveryPartner.phone': riderPhone },
            { 'deliveryPartner.name': riderName },
          ],
        },
      ];
    }

    if (search && typeof search === 'string' && search.trim()) {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$and = [
        query.$or ? { $or: query.$or } : {},
        {
          $or: [
            { orderId: { $regex: safeSearch, $options: 'i' } },
            { 'deliveryAddress.fullName': { $regex: safeSearch, $options: 'i' } },
            { 'deliveryAddress.street': { $regex: safeSearch, $options: 'i' } },
            { 'deliveryAddress.phone': { $regex: safeSearch, $options: 'i' } },
          ],
        },
      ];
      delete query.$or;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .populate('user', 'name email phone avatar');

    for (const ord of orders) {
      await checkAndAdvanceOrderStatus(ord);
    }

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    next(error);
  }
};

export const acceptDeliveryOrder = async (req, res, next) => {
  try {
    const id = req.params.id;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid order identifier' });
    }

    if (req.user.isOnline === false) {
      return res.status(400).json({
        success: false,
        message: 'You are currently OFFLINE. Please turn on your duty status to accept orders.',
      });
    }

    const deliveryPartnerInfo = {
      name: req.user.name,
      phone: req.user.phone,
      vehicleNumber: req.user.vehicleNumber,
      rating: req.user.driverRating,
      avatar: req.user.avatar,
    };

    const order = await Order.findOne(buildOrderLookupQuery(id));

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (['Out for Delivery', 'Delivered', 'Cancelled'].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be accepted because it is already ${order.orderStatus}`,
      });
    }

    order.orderStatus = 'Out for Delivery';
    order.deliveryStatus = 'Out for Delivery';
    order.acceptedAt = new Date();
    order.deliveryPartner = deliveryPartnerInfo;
    order.estimatedDeliveryTime = '20-25 mins';

    const outItem = order.trackingTimeline?.find(t => t.status === 'Out for Delivery');
    if (outItem) {
      outItem.isCompleted = true;
      outItem.timestamp = new Date();
      outItem.description = `Delivery partner ${req.user.name} accepted the ride and is delivering your order.`;
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`order:${order.orderId}`).to(`order:${order._id}`).emit('order_status_updated', {
        orderId: order.orderId,
        orderStatus: 'Out for Delivery',
        deliveryStatus: 'Out for Delivery',
        deliveryPartner: deliveryPartnerInfo,
        timestamp: new Date(),
      });
    }

    return res.json({
      success: true,
      message: `Order ${order.orderId} accepted! Status is now Out for Delivery.`,
      order,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDeliveryStatus = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { status = 'Delivered', paymentCollected = true } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid order identifier' });
    }

    const order = await Order.findOne(buildOrderLookupQuery(id));

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const isAssignedRider =
      (order.deliveryPartner?.phone && order.deliveryPartner.phone === req.user.phone) ||
      (order.deliveryPartner?.name && order.deliveryPartner.name === req.user.name);
    const role = req.user?.role?.toUpperCase();
    const isAdmin = role === 'ADMIN';

    if (!isAssignedRider && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not the assigned delivery partner for this order',
      });
    }

    order.orderStatus = status;
    order.deliveryStatus = status;

    if (status === 'Delivered') {
      order.deliveredAt = new Date();
      if (paymentCollected || order.paymentMethod === 'ONLINE') {
        order.paymentStatus = 'Completed';
      }

      const deliveredItem = order.trackingTimeline?.find(t => t.status === 'Delivered');
      if (deliveredItem) {
        deliveredItem.isCompleted = true;
        deliveredItem.timestamp = new Date();
        deliveredItem.description = 'Order successfully delivered by ' + (order.deliveryPartner?.name || 'Rider');
      }

      await User.findByIdAndUpdate(req.user._id, {
        $inc: { totalDeliveries: 1 },
      });
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`order:${order.orderId}`).to(`order:${order._id}`).emit('order_status_updated', {
        orderId: order.orderId,
        orderStatus: status,
        deliveryStatus: status,
        paymentStatus: order.paymentStatus,
        timestamp: new Date(),
      });
    }

    return res.json({
      success: true,
      message: `Order ${order.orderId} status updated to ${status}`,
      order,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleDutyStatus = async (req, res, next) => {
  try {
    const { isOnline } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { isOnline: Boolean(isOnline) },
      { new: true }
    );

    await DeliveryBoyModel.findOneAndUpdate(
      { user: req.user._id },
      { isOnline: Boolean(isOnline) }
    );

    return res.json({
      success: true,
      message: `Duty status updated to ${isOnline ? 'ONLINE' : 'OFFLINE'}`,
      isOnline: user.isOnline,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDeliveryProfile = async (req, res, next) => {
  try {
    const { name, phone, vehicleType, vehicleNumber } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        name: name || req.user.name,
        phone: phone || req.user.phone,
        vehicleType: vehicleType || req.user.vehicleType,
        vehicleNumber: vehicleNumber || req.user.vehicleNumber,
      },
      { new: true }
    );

    return res.json({
      success: true,
      message: 'Delivery partner profile updated successfully',
      user: {
        name: user.name,
        phone: user.phone,
        vehicleType: user.vehicleType,
        vehicleNumber: user.vehicleNumber,
        driverRating: user.driverRating,
        isOnline: user.isOnline,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateDeliveryLocation = async (req, res, next) => {
  try {
    const { latitude, longitude, locationName, heading, speed } = req.body;
    const orderId = req.params.id;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const now = new Date();

    await User.findByIdAndUpdate(req.user._id, {
      currentLocation: { latitude: lat, longitude: lng, updatedAt: now },
    });

    await DeliveryBoyModel.findOneAndUpdate(
      { user: req.user._id },
      { currentLatitude: lat, currentLongitude: lng, lastLocationUpdate: now }
    );

    if (orderId) {
      const order = await Order.findOne(buildOrderLookupQuery(orderId));
      if (order) {
        if (!order.deliveryPartner) order.deliveryPartner = {};
        order.deliveryPartner.latitude = lat;
        order.deliveryPartner.longitude = lng;
        order.deliveryPartner.currentLatitude = lat;
        order.deliveryPartner.currentLongitude = lng;
        order.deliveryPartner.lastUpdated = now;
        order.deliveryPartner.lastLocationUpdate = now;
        if (locationName) order.deliveryPartner.locationName = locationName;
        await order.save();

        const io = req.app.get('io');
        if (io) {
          io.to(`order:${order.orderId}`).to(`order:${order._id}`).emit('location_updated', {
            orderId: order.orderId,
            latitude: lat,
            longitude: lng,
            heading: heading || 0,
            speed: speed || 0,
            lastUpdated: now,
          });
        }
      }
    }

    return res.json({
      success: true,
      message: 'Live GPS location updated successfully',
      location: { latitude: lat, longitude: lng, updatedAt: now },
    });
  } catch (error) {
    next(error);
  }
};

export const getDeliveryDashboardStats = getDeliveryStats;
export const getDeliveryBoyOrders = getDeliveryOrders;
