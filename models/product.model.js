import mongoose from 'mongoose';

const sizeOptionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, default: 0, min: 0 },
  // Kept for products created before portion prices became absolute values.
  priceModifier: { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
}, { _id: false });

const addOnSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
}, { _id: false });

const productSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    default: null,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
  },
  image: {
    type: Array,
    default: [],
  },
  images: {
    type: [String],
    default: [],
  },
  category: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Category is required'],
    index: true,
  },
  subCategory: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'subCategory',
  }],
  unit: {
    type: String,
    default: '',
  },
  stock: {
    type: Number,
    default: null,
    min: 0,
  },
  lowStockThreshold: {
    type: Number,
    default: 5,
    min: 0,
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
  },
  more_details: {
    type: Object,
    default: {},
  },
  publish: {
    type: Boolean,
    default: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  finalPrice: {
    type: Number,
    default: 0,
  },
  isVeg: {
    type: Boolean,
    default: false,
    index: true,
  },
  isBestseller: {
    type: Boolean,
    default: false,
    index: true,
  },
  isFeatured: {
    type: Boolean,
    default: false,
    index: true,
  },
  inStock: {
    type: Boolean,
    default: true,
    index: true,
  },
  prepTime: {
    type: String,
    default: '20-25 mins',
  },
  calories: {
    type: Number,
    default: 450,
  },
  nutritionalInfo: {
    calories: { type: String, default: '450 kcal' },
    protein: { type: String, default: '28g' },
    carbs: { type: String, default: '38g' },
    fat: { type: String, default: '16g' },
  },
  ingredients: {
    type: [String],
    default: [],
  },
  sizes: [sizeOptionSchema],
  addOns: [addOnSchema],
  rating: {
    type: Number,
    default: 4.8,
    min: 0,
    max: 5,
  },
  numReviews: {
    type: Number,
    default: 0,
  },
  totalOrders: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

productSchema.index({ isFeatured: 1, inStock: 1 });
productSchema.index({ isBestseller: 1, inStock: 1 });
productSchema.index({ category: 1, isVeg: 1, price: 1 });
productSchema.index({ inStock: 1, createdAt: -1 });
productSchema.index({ rating: -1, totalOrders: -1 });

productSchema.pre('validate', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + Date.now().toString().slice(-4);
  }
  if ((!this.images || this.images.length === 0) && this.image && this.image.length > 0) {
    this.images = Array.isArray(this.image) ? this.image : [this.image];
  }
  if ((!this.image || this.image.length === 0) && this.images && this.images.length > 0) {
    this.image = this.images;
  }
  next();
});

productSchema.pre('save', function (next) {
  if (this.discount > 0) {
    this.finalPrice = Math.round(this.price - (this.price * this.discount / 100));
  } else {
    this.finalPrice = this.price;
  }
  if (this.stock !== null && this.stock !== undefined) {
    this.inStock = this.stock > 0;
  }
  next();
});

const ProductModel = mongoose.models.product || mongoose.models.Food || mongoose.model('product', productSchema, 'foods');
if (!mongoose.models.Food) {
  mongoose.model('Food', productSchema, 'foods');
}

export default ProductModel;
