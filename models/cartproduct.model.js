import mongoose from 'mongoose';

const cartProductSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
    required: true,
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  unit: {
    type: String,
    default: 'Regular',
  },
  size: {
    type: String,
    default: 'Regular',
  },
  addOns: {
    type: Array,
    default: [],
  },
}, {
  timestamps: true,
});

cartProductSchema.index({ userId: 1, productId: 1, unit: 1 });

const CartProductModel = mongoose.models.cartProduct || mongoose.model('cartProduct', cartProductSchema, 'cartproducts');

export default CartProductModel;
