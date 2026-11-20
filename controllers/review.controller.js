import ReviewModel from '../models/review.model.js';
import ProductModel from '../models/product.model.js';
import OrderModel from '../models/order.model.js';

export const getAllReviews = async (req, res, next) => {
  try {
    const reviews = await ReviewModel.find()
      .populate('food', 'name image slug')
      .sort({ createdAt: -1 })
      .limit(20);
    return res.json({ success: true, count: reviews.length, reviews });
  } catch (error) {
    next(error);
  }
};

export const getReviewsController = getAllReviews;

export const getFoodReviews = async (req, res, next) => {
  try {
    const foodId = req.params.foodId || req.params.productId;
    const reviews = await ReviewModel.find({
      $or: [{ food: foodId }, { productId: foodId }],
    }).sort({ createdAt: -1 });
    return res.json({ success: true, count: reviews.length, reviews });
  } catch (error) {
    next(error);
  }
};

export const getProductReviews = getFoodReviews;

export const addReview = async (req, res, next) => {
  try {
    const { foodId, productId, rating, comment, images } = req.body;
    const targetFoodId = foodId || productId || req.params.foodId;

    if (!rating || !comment) {
      return res.status(400).json({ success: false, message: 'Please provide rating and comment' });
    }

    const food = await ProductModel.findById(targetFoodId);
    if (!food) return res.status(404).json({ success: false, message: 'Food item not found' });

    const hasPurchased = await OrderModel.exists({
      user: req.user._id,
      'items.food': targetFoodId,
      orderStatus: 'Delivered',
    });

    const review = await ReviewModel.create({
      food: targetFoodId,
      productId: targetFoodId,
      user: req.user._id,
      userId: req.user._id,
      userName: req.user.name,
      userAvatar: req.user.avatar,
      rating: Number(rating),
      comment,
      images: Array.isArray(images) ? images : [],
      isVerifiedPurchase: Boolean(hasPurchased),
    });

    const allReviews = await ReviewModel.find({
      $or: [{ food: targetFoodId }, { productId: targetFoodId }],
    });
    const avgRating = (allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length).toFixed(1);

    food.rating = Number(avgRating);
    food.numReviews = allReviews.length;
    await food.save();

    return res.status(201).json({ success: true, message: 'Review added successfully', review });
  } catch (error) {
    next(error);
  }
};

export const addReviewController = addReview;

export const voteHelpful = async (req, res, next) => {
  try {
    const id = req.params.id;
    const review = await ReviewModel.findById(id);
    if (review) {
      review.helpfulVotes += 1;
      await review.save();
    }
    return res.json({ success: true, message: 'Marked helpful' });
  } catch (error) {
    next(error);
  }
};

export const voteReviewController = voteHelpful;

export const deleteReview = async (req, res, next) => {
  try {
    const id = req.params.id;
    await ReviewModel.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteReviewController = deleteReview;
