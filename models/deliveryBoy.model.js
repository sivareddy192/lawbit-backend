import mongoose from 'mongoose';

const deliveryBoySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
  },
  avatar: {
    type: String,
    default: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
  },
  vehicleType: {
    type: String,
    default: 'Motorbike',
  },
  vehicleNumber: {
    type: String,
    default: 'TS 09 EA 4521',
  },
  drivingLicenseNumber: {
    type: String,
    default: '',
  },
  isOnline: {
    type: Boolean,
    default: true,
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  rating: {
    type: Number,
    default: 4.9,
    min: 0,
    max: 5,
  },
  totalDeliveries: {
    type: Number,
    default: 0,
  },
  currentLatitude: {
    type: Number,
    default: 31.2530,
  },
  currentLongitude: {
    type: Number,
    default: 75.7020,
  },
  lastLocationUpdate: {
    type: Date,
    default: Date.now,
  },
  activeOrders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'order',
  }],
}, {
  timestamps: true,
});

deliveryBoySchema.index({ isOnline: 1, isAvailable: 1 });
deliveryBoySchema.index({ currentLatitude: 1, currentLongitude: 1 });

const DeliveryBoyModel = mongoose.models.deliveryBoy || mongoose.models.DeliveryBoy || mongoose.model('deliveryBoy', deliveryBoySchema);

export default DeliveryBoyModel;
