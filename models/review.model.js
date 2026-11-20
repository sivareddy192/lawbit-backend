import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  userName: {
    type: String,
    required: true,
  },
  userAvatar: {
    type: String,
    default: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
  },
  food: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
    required: true,
    index: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    required: [true, 'Review comment is required'],
    trim: true,
  },
  images: {
    type: [String],
    default: [],
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: true,
  },
  helpfulVotes: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

reviewSchema.pre('save', function (next) {
  if (!this.userId && this.user) {
    this.userId = this.user;
  } else if (!this.user && this.userId) {
    this.user = this.userId;
  }
  if (!this.productId && this.food) {
    this.productId = this.food;
  } else if (!this.food && this.productId) {
    this.food = this.productId;
  }
  next();
});

const ReviewModel = mongoose.models.review || mongoose.models.Review || mongoose.model('review', reviewSchema);
if (!mongoose.models.Review) {
  mongoose.model('Review', reviewSchema);
}

export default ReviewModel;
