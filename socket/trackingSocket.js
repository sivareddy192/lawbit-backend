import jwt from 'jsonwebtoken';
import Order from '../models/order.model.js';
import User from '../models/user.model.js';

const buildOrderLookupQuery = (id) => {
  if (!id || typeof id !== 'string') return { _id: null };
  const cleanId = id.trim();
  const conditions = [{ orderId: cleanId }];
  if (cleanId.match(/^[0-9a-fA-F]{24}$/)) {
    conditions.push({ _id: cleanId });
  }
  return { $or: conditions };
};

export const initTrackingSocket = (io) => {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next();
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || 'asg_access_secret_fallback_key_do_not_use_in_prod'
      );
      if (decoded && (decoded.userId || decoded._id || decoded.id)) {
        socket.user = {
          _id: decoded.userId || decoded._id || decoded.id,
          name: decoded.name || '',
          phone: decoded.phone || '',
          role: decoded.role || 'USER',
        };
      }
      next();
    } catch (_) {
      next();
    }
  });

  io.on('connection', (socket) => {
    if (socket.user?._id) {
      socket.join(`user:${socket.user._id}`);
      if (socket.user.role === 'ADMIN') {
        socket.join('admin_dashboard');
      }
    }

    const handleJoin = (data) => {
      const orderId = typeof data === 'string' ? data : data?.orderId || data?.id;
      if (!orderId || typeof orderId !== 'string') return;
      socket.join(`order:${orderId}`);
    };

    const handleLeave = (data) => {
      const orderId = typeof data === 'string' ? data : data?.orderId || data?.id;
      if (!orderId || typeof orderId !== 'string') return;
      socket.leave(`order:${orderId}`);
    };

    socket.on('join_order', handleJoin);
    socket.on('join_order_room', handleJoin);

    socket.on('leave_order', handleLeave);
    socket.on('leave_order_room', handleLeave);

    socket.on('join_admin_room', () => {
      socket.join('admin_dashboard');
    });

    socket.on('delivery_location_update', async (data) => {
      const role = socket.user?.role?.toUpperCase();
      if (!socket.user || !['DELIVERY', 'ADMIN', 'DELIVERY_PARTNER'].includes(role)) {
        return;
      }

      const { orderId, latitude, longitude, heading, speed, locationName } = data || {};
      if (!orderId || typeof orderId !== 'string' || latitude == null || longitude == null) return;

      const lat = Number(latitude);
      const lng = Number(longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const now = new Date();

      const payload = {
        orderId,
        latitude: lat,
        longitude: lng,
        heading: Number(heading) || 0,
        speed: Number(speed) || 0,
        locationName: typeof locationName === 'string' ? locationName : '',
        lastUpdated: now,
      };

      io.to(`order:${orderId}`).emit('location_updated', payload);

      try {
        await Order.findOneAndUpdate(
          buildOrderLookupQuery(orderId),
          {
            $set: {
              'deliveryPartner.currentLatitude': lat,
              'deliveryPartner.currentLongitude': lng,
              'deliveryPartner.lastUpdated': now,
              'deliveryPartner.latitude': lat,
              'deliveryPartner.longitude': lng,
              'deliveryPartner.lastLocationUpdate': now,
            },
          }
        );
      } catch (err) {
        console.error('Failed to persist location update:', err.message);
      }
    });

    socket.on('order_status_update', (data) => {
      const role = socket.user?.role?.toUpperCase();
      if (!socket.user || !['DELIVERY', 'ADMIN', 'DELIVERY_PARTNER'].includes(role)) {
        return;
      }

      const { orderId, orderStatus, deliveryStatus } = data || {};
      if (!orderId || typeof orderId !== 'string') return;

      io.to(`order:${orderId}`).emit('order_status_updated', {
        orderId,
        orderStatus: typeof orderStatus === 'string' ? orderStatus : 'Updated',
        deliveryStatus: typeof deliveryStatus === 'string' ? deliveryStatus : orderStatus,
        timestamp: new Date(),
      });
    });

    socket.on('disconnect', () => {
    });
  });
};
