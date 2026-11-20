import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    default: null,
  },
  restaurantName: { type: String, default: '' },
  food: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
    required: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
  },
  name: { type: String, required: true },
  image: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  size: { type: String, default: 'Regular' },
  addOns: [{
    name: String,
    price: Number,
  }],
  itemTotal: { type: Number, required: true },
}, { _id: false });

const timelineEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  isCompleted: { type: Boolean, default: false },
}, { _id: false });

const complimentaryItemSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  value: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  reason: { type: String, default: '' },
  type: { type: String, default: 'FREEBIE' },
  image: { type: String, default: '' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  vendors: [{
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
    name: { type: String, default: '' },
    itemsSubtotal: { type: Number, default: 0 },
  }],
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
  },
  product_details: {
    name: String,
    image: Array,
  },
  paymentId: {
    type: String,
    default: '',
  },
  payment_status: {
    type: String,
    default: '',
  },
  delivery_address: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'address',
  },
  subTotalAmt: {
    type: Number,
    default: 0,
  },
  totalAmt: {
    type: Number,
    default: 0,
  },
  invoice_receipt: {
    type: String,
    default: '',
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  items: [orderItemSchema],
  complimentaryItems: [complimentaryItemSchema],
  customerLocation: {
    latitude: { type: Number, default: 31.2554 },
    longitude: { type: Number, default: 75.7052 },
    address: { type: String, default: '' },
  },
  restaurantLocation: {
    latitude: { type: Number, default: 31.2554 },
    longitude: { type: Number, default: 75.7052 },
    address: { type: String, default: 'AK Foods Kitchen, Law Gate, Phagwara, Punjab 144411' },
  },
  deliveryAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    houseFlat: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, default: '' },
    pincode: { type: String, required: true },
    landmark: { type: String, default: '' },
    latitude: { type: Number, default: 31.2554 },
    longitude: { type: Number, default: 75.7052 },
    formattedAddress: { type: String, default: '' },
  },
  paymentMethod: {
    type: String,
    enum: ['COD', 'ONLINE', 'UPI', 'CARD'],
    default: 'COD',
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
    default: 'Pending',
  },
  orderStatus: {
    type: String,
    enum: [
      'Placed', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled',
      'PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
      'placed', 'confirmed', 'preparing', 'out for delivery', 'delivered', 'cancelled',
      'Pending', 'pending',
    ],
    default: 'Placed',
    index: true,
  },
  deliveryStatus: {
    type: String,
    enum: [
      'Placed', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled',
      'PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
      'placed', 'confirmed', 'preparing', 'out for delivery', 'delivered', 'cancelled',
      'Pending', 'pending', 'Assigned', 'Picked Up', 'Order Placed',
    ],
    default: 'Placed',
  },
  itemsPrice: { type: Number, required: true },
  taxPrice: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  couponApplied: {
    code: { type: String, default: '' },
    discount: { type: Number, default: 0 },
  },
  totalAmount: { type: Number, required: true },
  deliveryInstructions: { type: String, default: '' },
  estimatedDeliveryTime: { type: String, default: '30-40 mins' },
  deliveryPartner: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    vehicleNumber: { type: String, default: '' },
    rating: { type: Number },
    avatar: { type: String, default: '' },
    currentLatitude: { type: Number },
    currentLongitude: { type: Number },
    latitude: { type: Number },
    longitude: { type: Number },
    lastUpdated: { type: Date },
    lastLocationUpdate: { type: Date },
  },
  trackingTimeline: [timelineEventSchema],
  cancellationReason: { type: String, default: '' },
  acceptedAt: { type: Date },
  deliveredAt: { type: Date },
}, {
  timestamps: true,
});

orderSchema.pre('save', function (next) {
  if (!this.deliveryStatus && this.orderStatus) {
    this.deliveryStatus = this.orderStatus;
  }
  if (!this.orderStatus && this.deliveryStatus) {
    this.orderStatus = this.deliveryStatus;
  }
  if (!this.orderStatus) {
    this.orderStatus = 'Placed';
  }
  if (!this.deliveryStatus) {
    this.deliveryStatus = 'Placed';
  }
  if (!this.userId && this.user) {
    this.userId = this.user;
  } else if (!this.user && this.userId) {
    this.user = this.userId;
  }
  if (!this.totalAmt && this.totalAmount) {
    this.totalAmt = this.totalAmount;
  } else if (!this.totalAmount && this.totalAmt) {
    this.totalAmount = this.totalAmt;
  }
  next();
});

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ deliveryStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ 'deliveryPartner.id': 1, orderStatus: 1 });
orderSchema.index({ 'deliveryPartner.phone': 1, orderStatus: 1 });
orderSchema.index({ createdAt: -1 });

const OrderModel = mongoose.models.order || mongoose.models.Order || mongoose.model('order', orderSchema);
if (!mongoose.models.Order) {
  mongoose.model('Order', orderSchema);
}

export default OrderModel;
