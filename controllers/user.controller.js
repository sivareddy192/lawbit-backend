import UserModel from '../models/user.model.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getRefreshTokenCookieOptions,
} from '../utils/generateToken.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import {
  getCartItemsByUserId,
  getUserCart,
  updateUserCart,
  clearUserCart,
} from './cart.controller.js';
import {
  addAddressController as addAddress,
  updateAddressController as updateAddress,
  deleteAddressController as deleteAddress,
} from './address.controller.js';

export { getUserCart, updateUserCart, clearUserCart, addAddress, updateAddress, deleteAddress };

const userPayload = (user, cartItems = []) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: user.role || 'USER',
  avatar: user.avatar,
  addresses: user.addresses || [],
  wishlist: user.wishlist || [],
  cart: cartItems,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isStrongPassword = (pwd) => {
  if (typeof pwd !== 'string') return false;
  const hasLength = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSpecial = /[@$!%*?&_\-#^~+=|/\\()\[\]{}<>]/.test(pwd);
  return hasLength && hasUpper && hasLower && hasNumber && hasSpecial;
};

const ipLoginTracker = new Map();

const formatRemainingTime = (ms) => {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0 && seconds > 0) {
    return `${minutes} min ${seconds} sec`;
  } else if (minutes > 0) {
    return `${minutes} min`;
  }
  return `${seconds} sec`;
};

const issueTokens = async (user, res, req) => {
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  user.refresh_token = refreshToken;
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  if (res && typeof res.cookie === 'function') {
    res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions(req));
  }

  return { accessToken, refreshToken };
};

export const registerUser = async (req, res, next) => {
  try {
    let { name, email, phone, password } = req.body;

    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid registration format' });
    }

    name = name.trim();
    email = email.trim().toLowerCase();
    phone = typeof phone === 'string' ? phone.trim() : '';

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Weak password: Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special symbol (@$!%*?&_-#^).',
      });
    }

    const userExists = await UserModel.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const user = await UserModel.create({
      name,
      email,
      phone,
      password,
      role: 'USER',
    });

    const { accessToken, refreshToken } = await issueTokens(user, res, req);
    const cartItems = await getCartItemsByUserId(user._id);

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully',
      accessToken,
      refreshToken,
      user: userPayload(user, cartItems),
    });
  } catch (error) {
    next(error);
  }
};

export const registerUserController = registerUser;

export const loginUser = async (req, res, next) => {
  try {
    let { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid login format' });
    }

    email = email.trim();

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'client';

    const ipRecord = ipLoginTracker.get(clientIp);
    if (ipRecord?.lockUntil && ipRecord.lockUntil > new Date()) {
      const remainingMs = ipRecord.lockUntil.getTime() - Date.now();
      const timeLeft = formatRemainingTime(remainingMs);
      return res.status(429).json({
        success: false,
        isLocked: true,
        retryAfterSeconds: Math.ceil(remainingMs / 1000),
        message: `Too many failed login attempts. Access is locked for 15 minutes. Please try again in ${timeLeft}.`,
      });
    }

    const cleanEmail = email.toLowerCase();
    const user = await UserModel.findOne({
      $or: [{ email: cleanEmail }, { phone: email }],
    }).select('+password +failedLoginAttempts +lockUntil');

    if (user) {
      if (user.lockUntil && user.lockUntil > new Date()) {
        const remainingMs = user.lockUntil.getTime() - Date.now();
        const timeLeft = formatRemainingTime(remainingMs);
        return res.status(429).json({
          success: false,
          isLocked: true,
          retryAfterSeconds: Math.ceil(remainingMs / 1000),
          message: `Account is temporarily locked due to 5 consecutive failed attempts. Please try again in ${timeLeft}.`,
        });
      }

      if (user.lockUntil && user.lockUntil <= new Date()) {
        user.failedLoginAttempts = 0;
        user.lockUntil = null;
        await user.save();
      }

      if (user.isBlocked) {
        return res.status(403).json({
          success: false,
          isBlocked: true,
          code: 'ACCOUNT_BLOCKED',
          message: 'Your account has been blocked by Admin. Please contact the administrator.',
        });
      }

      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

        if (user.failedLoginAttempts >= 5) {
          user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
          user.failedLoginAttempts = 5;
          await user.save();

          return res.status(429).json({
            success: false,
            isLocked: true,
            retryAfterSeconds: 900,
            message: 'Too many failed login attempts (5/5). Your account has been temporarily locked for 15 minutes. Please try again in 15 min.',
          });
        }

        await user.save();
        const remaining = 5 - user.failedLoginAttempts;
        return res.status(401).json({
          success: false,
          remainingAttempts: remaining,
          message: `Invalid email or password. You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before a 15-minute account lock.`,
        });
      }

      if (user.failedLoginAttempts > 0 || user.lockUntil) {
        user.failedLoginAttempts = 0;
        user.lockUntil = null;
        await user.save();
      }
      ipLoginTracker.delete(clientIp);

      const { accessToken, refreshToken } = await issueTokens(user, res, req);
      const cartItems = await getCartItemsByUserId(user._id);

      return res.json({
        success: true,
        message: 'Logged in successfully',
        accessToken,
        refreshToken,
        user: userPayload(user, cartItems),
      });
    }

    const currentIpAttempts = (ipRecord?.count || 0) + 1;
    if (currentIpAttempts >= 5) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      ipLoginTracker.set(clientIp, { count: 5, lockUntil });
      return res.status(429).json({
        success: false,
        isLocked: true,
        retryAfterSeconds: 900,
        message: 'Too many failed login attempts (5/5). Access blocked for 15 minutes. Please try again in 15 min.',
      });
    }

    ipLoginTracker.set(clientIp, { count: currentIpAttempts, lockUntil: null });
    const remaining = 5 - currentIpAttempts;
    return res.status(401).json({
      success: false,
      remainingAttempts: remaining,
      message: `Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before a 15-minute lockout.`,
    });
  } catch (error) {
    next(error);
  }
};

export const loginUserController = loginUser;

export const refreshAccessToken = async (req, res, next) => {
  try {
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken || req.headers?.['x-refresh-token'];

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token. Please log in again.' });
    }

    const user = await UserModel.findById(decoded.userId).select('+refreshToken');
    if (!user || (user.refreshToken !== refreshToken && user.refresh_token !== refreshToken)) {
      return res.status(401).json({ success: false, message: 'Refresh token revoked. Please log in again.' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Your account has been suspended.' });
    }

    const newAccessToken = generateAccessToken(user._id);
    const cartItems = await getCartItemsByUserId(user._id);

    return res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken,
      user: userPayload(user, cartItems),
    });
  } catch (error) {
    next(error);
  }
};

export const refreshTokenController = refreshAccessToken;

export const logoutUser = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (refreshToken && typeof refreshToken === 'string') {
      try {
        const decoded = verifyRefreshToken(refreshToken);
        if (decoded?.userId) {
          await UserModel.findByIdAndUpdate(decoded.userId, { refreshToken: null, refresh_token: '' });
        }
      } catch (_) {}
    }

    res.clearCookie('refreshToken', getRefreshTokenCookieOptions(req));
    res.clearCookie('token');
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

export const logoutUserController = logoutUser;

export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user._id).populate('wishlist');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        isBlocked: true,
        code: 'ACCOUNT_BLOCKED',
        message: 'Your account has been blocked by Admin. Please contact the administrator.',
      });
    }

    const cartItems = await getCartItemsByUserId(user._id);

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role || 'USER',
        avatar: user.avatar,
        addresses: user.addresses || [],
        wishlist: user.wishlist || [],
        cart: cartItems,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const userProfileController = getCurrentUser;

export const updateProfile = async (req, res, next) => {
  try {
    let avatarUrl = typeof req.body.avatar === 'string' ? req.body.avatar : undefined;
    if (avatarUrl && avatarUrl.startsWith('data:image')) {
      try {
        const uploadResult = await uploadToCloudinary(avatarUrl, 'asg_foods/avatars');
        avatarUrl = uploadResult.secure_url || uploadResult.url;
      } catch (uploadErr) {
        console.error('Avatar Cloudinary upload notice:', uploadErr.message);
      }
    }

    const user = await UserModel.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      user.name = req.body.name.trim();
    }
    if (typeof req.body.phone === 'string') {
      user.phone = req.body.phone.trim();
    }
    if (avatarUrl) {
      user.avatar = avatarUrl;
    }
    if (typeof req.body.email === 'string' && req.body.email.trim()) {
      const cleanEmail = req.body.email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Invalid email address' });
      }
      if (cleanEmail !== user.email) {
        const emailTaken = await UserModel.findOne({ email: cleanEmail, _id: { $ne: user._id } });
        if (emailTaken) {
          return res.status(400).json({ success: false, message: 'This email is already in use by another account' });
        }
        user.email = cleanEmail;
      }
    }

    const updatedUser = await user.save();
    const cartItems = await getCartItemsByUserId(updatedUser._id);
    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: userPayload(updatedUser, cartItems),
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfileController = updateProfile;

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ success: false, message: 'Please provide valid current and new password' });
    }
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide current and new password' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Weak password: New password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special symbol (@$!%*?&_-#^).',
      });
    }

    const user = await UserModel.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password does not match' });
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    const { accessToken, refreshToken } = await issueTokens(user, res, req);
    const cartItems = await getCartItemsByUserId(user._id);

    return res.json({
      success: true,
      message: 'Password updated successfully across all sessions',
      accessToken,
      refreshToken,
      user: userPayload(user, cartItems),
    });
  } catch (error) {
    next(error);
  }
};

export const changePasswordController = changePassword;

export const toggleWishlist = async (req, res, next) => {
  try {
    const foodId = req.params.foodId;
    let isAdded = false;

    const user = await UserModel.findById(req.user._id);
    const index = user.wishlist.findIndex((id) => id.toString() === foodId);
    if (index > -1) {
      user.wishlist.splice(index, 1);
      isAdded = false;
    } else {
      user.wishlist.push(foodId);
      isAdded = true;
    }
    await user.save();
    return res.json({
      success: true,
      message: isAdded ? 'Added to wishlist' : 'Removed from wishlist',
      isAdded,
      wishlist: user.wishlist,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const { role, isBlocked, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (role && role !== 'All') {
      const upperRole = role.toUpperCase();
      query.role = { $in: [upperRole, role.toLowerCase()] };
    }

    if (isBlocked !== undefined && isBlocked !== '') {
      query.isBlocked = isBlocked === 'true' || isBlocked === true;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;

    const totalUsers = await UserModel.countDocuments(query);
    const users = await UserModel.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    return res.json({
      success: true,
      count: users.length,
      totalUsers,
      totalPages: Math.ceil(totalUsers / pageSize),
      currentPage: pageNumber,
      users,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleBlockUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await UserModel.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.role?.toUpperCase() === 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Administrator accounts cannot be blocked' });
    }

    user.isBlocked = !user.isBlocked;
    if (user.isBlocked) {
      user.refreshToken = null;
      user.refresh_token = null;
    }
    await user.save();

    const io = req.app.get('io');
    if (io && user.isBlocked) {
      const payload = {
        userId: user._id.toString(),
        isBlocked: true,
        message: 'Your account has been blocked by Admin. Please contact the administrator.',
      };
      io.to(`user:${user._id}`).emit('user_blocked', payload);
      io.emit('user_blocked', payload);
    }

    return res.json({
      success: true,
      message: `User is now ${user.isBlocked ? 'blocked' : 'unblocked'}`,
      isBlocked: user.isBlocked,
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { role } = req.body;
    if (typeof role === 'string') {
      role = role.toUpperCase();
      if (role === 'CUSTOMER') role = 'USER';
      if (role === 'DELIVERY_PARTNER') role = 'DELIVERY';
    }
    if (!['USER', 'ADMIN', 'DELIVERY', 'VENDOR'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified. Must be USER, ADMIN, DELIVERY, or VENDOR.',
      });
    }
    const user = await UserModel.findByIdAndUpdate(id, { role }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, message: 'User role updated', user });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await UserModel.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.role?.toUpperCase() === 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Administrator accounts cannot be deleted' });
    }

    if (req.user && req.user._id.toString() === id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own logged-in account' });
    }

    await UserModel.findByIdAndDelete(id);
    return res.json({
      success: true,
      message: `User "${user.name}" has been permanently deleted`,
      deletedUserId: id,
    });
  } catch (error) {
    next(error);
  }
};
