import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { addressSchema } from './address.model.js';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
  },
  phone: {
    type: String,
    trim: true,
    default: '',
  },
  mobile: {
    type: Number,
    default: null,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false,
  },
  passwordChangedAt: {
    type: Date,
    default: null,
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false,
  },
  lockUntil: {
    type: Date,
    default: null,
    select: false,
  },
  role: {
    type: String,
    enum: ['USER', 'ADMIN', 'DELIVERY', 'VENDOR'],
    default: 'USER',
  },
  avatar: {
    type: String,
    default: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
  },
  addresses: [addressSchema],
  address_details: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'address',
  }],
  shopping_cart: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'cartProduct',
  }],
  orderHistory: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'order',
  }],
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
  }],
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isOnline: {
    type: Boolean,
    default: true,
  },
  verify_email: {
    type: Boolean,
    default: false,
  },
  last_login_date: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Suspended'],
    default: 'Active',
  },
  vehicleType: {
    type: String,
    default: 'Motorbike',
  },
  vehicleNumber: {
    type: String,
    default: 'TS 09 EA 4521',
  },
  driverRating: {
    type: Number,
    default: 4.9,
  },
  totalDeliveries: {
    type: Number,
    default: 0,
  },
  refresh_token: {
    type: String,
    default: '',
  },
  refreshToken: {
    type: String,
    select: false,
    default: null,
  },
  forgot_password_otp: {
    type: String,
    default: null,
  },
  forgot_password_expiry: {
    type: Date,
    default: null,
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
}, {
  timestamps: true,
});

userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });
userSchema.index({ refreshToken: 1 });
userSchema.index({ refresh_token: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if user changed password after the JWT token was issued (stolen token defense)
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

const UserModel = mongoose.models.User || mongoose.models.user || mongoose.model('User', userSchema);
if (!mongoose.models.user) {
  mongoose.model('user', userSchema);
}

export default UserModel;
