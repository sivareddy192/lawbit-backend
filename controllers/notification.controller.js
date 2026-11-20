import NotificationModel from '../models/notification.model.js';

export const getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;
    const notifications = await NotificationModel.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await NotificationModel.countDocuments({
      user: userId,
      isRead: false,
    });

    return res.json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications,
    });
  } catch (error) {
    next(error);
  }
};

export const getNotificationsController = getUserNotifications;

export const markNotificationAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.userId;

    const notification = await NotificationModel.findOneAndUpdate(
      { _id: id, user: userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.json({
      success: true,
      message: 'Notification marked as read',
      notification,
    });
  } catch (error) {
    next(error);
  }
};

export const readNotificationController = markNotificationAsRead;

export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;

    await NotificationModel.updateMany(
      { user: userId, isRead: false },
      { isRead: true }
    );

    return res.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    next(error);
  }
};

export const createNotification = async (req, res, next) => {
  try {
    const { userId, title, message, type, link } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({ success: false, message: 'User ID, title, and message are required' });
    }

    const notification = await NotificationModel.create({
      user: userId,
      title,
      message,
      type: type || 'system',
      link: link || '',
    });

    return res.status(201).json({
      success: true,
      message: 'Notification created',
      notification,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.userId;

    const notification = await NotificationModel.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    next(error);
  }
};
