import CartProductModel from '../models/cartproduct.model.js';
import UserModel from '../models/user.model.js';
import ProductModel from '../models/product.model.js';

export const syncUserCartController = async (request, response) => {
  try {
    const userId = request.userId || request.user?._id;
    if (!userId) {
      return response.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { cartItems } = request.body;
    if (!Array.isArray(cartItems)) {
      return response.status(400).json({ success: false, message: 'cartItems must be an array' });
    }

    await CartProductModel.deleteMany({ userId });

    const newDocs = [];
    for (const item of cartItems) {
      const pid = item.productId || item.foodId || item._id || item.food?._id;
      if (!pid) continue;
      newDocs.push({
        userId,
        productId: pid,
        quantity: Math.max(1, Number(item.quantity) || 1),
        unit: item.size || item.unit || 'Regular',
        size: item.size || item.unit || 'Regular',
        addOns: Array.isArray(item.addOns) ? item.addOns : [],
      });
    }

    let insertedIds = [];
    if (newDocs.length > 0) {
      const inserted = await CartProductModel.insertMany(newDocs);
      insertedIds = inserted.map(doc => doc._id);
      await UserModel.findByIdAndUpdate(userId, { shopping_cart: insertedIds });
    } else {
      await UserModel.findByIdAndUpdate(userId, { shopping_cart: [] });
    }

    const savedCart = await CartProductModel.find({ userId })
      .populate('productId')
      .lean();
    const validItems = savedCart.filter(item => item.productId);

    return response.json({
      success: true,
      message: 'Cart synced to database successfully',
      data: validItems,
      cart: validItems,
    });
  } catch (error) {
    console.error('SYNC CART ERROR:', error);
    return response.status(500).json({
      success: false,
      message: error.message || 'Failed to sync cart',
    });
  }
};

export const addToCartItemController = async (request, response) => {
  try {
    const userId = request.userId || request.user?._id;
    if (!userId) {
      return response.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (Array.isArray(request.body?.cartItems)) {
      return syncUserCartController(request, response);
    }

    const { productId, foodId, quantity = 1, unit, size, addOns } = request.body;
    const pid = productId || foodId;

    if (!pid) {
      return response.status(400).json({
        message: 'Provide productId',
        error: true,
        success: false,
      });
    }

    const chosenSize = size || unit || 'Regular';

    const existing = await CartProductModel.findOne({
      userId,
      productId: pid,
      unit: chosenSize,
    });

    let savedItem;
    if (existing) {
      existing.quantity += Number(quantity) || 1;
      if (addOns) existing.addOns = addOns;
      savedItem = await existing.save();
    } else {
      savedItem = await CartProductModel.create({
        userId,
        productId: pid,
        quantity: Math.max(1, Number(quantity) || 1),
        unit: chosenSize,
        size: chosenSize,
        addOns: addOns || [],
      });
      await UserModel.findByIdAndUpdate(userId, { $addToSet: { shopping_cart: savedItem._id } });
    }

    const populated = await CartProductModel.findById(savedItem._id).populate('productId').lean();

    return response.json({
      data: populated,
      message: 'Item added successfully',
      error: false,
      success: true,
    });
  } catch (error) {
    console.error('ADD TO CART ERROR:', error);
    return response.status(500).json({
      message: error.message || 'Internal Server Error',
      error: true,
      success: false,
    });
  }
};

export const getCartItemController = async (request, response) => {
  try {
    const userId = request.userId || request.user?._id;
    if (!userId) {
      return response.json({
        data: [],
        cart: [],
        error: false,
        success: true,
      });
    }

    const cartItems = await CartProductModel.find({ userId })
      .populate('productId')
      .lean();

    const validItems = cartItems.filter((item) => item.productId);

    return response.json({
      data: validItems,
      cart: validItems,
      error: false,
      success: true,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
};

export const updateCartItemQtyController = async (request, response) => {
  try {
    const userId = request.userId || request.user?._id;
    const { _id, qty, quantity } = request.body;
    const newQty = qty != null ? qty : quantity;

    if (!_id || newQty == null) {
      return response.status(400).json({
        message: 'Provide _id and qty',
        success: false,
      });
    }

    if (Number(newQty) <= 0) {
      await CartProductModel.deleteOne({ _id, userId });
      await UserModel.findByIdAndUpdate(userId, { $pull: { shopping_cart: _id } });
      return response.json({ message: 'Item removed', success: true });
    }

    const updated = await CartProductModel.findOneAndUpdate(
      { _id, userId },
      { quantity: Number(newQty) },
      { new: true }
    ).populate('productId');

    return response.json({
      message: 'Cart updated',
      success: true,
      data: updated,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || error,
      success: false,
    });
  }
};

export const deleteCartItemQtyController = async (request, response) => {
  try {
    const userId = request.userId || request.user?._id;
    const { _id } = request.body;
    const targetId = _id || request.params?.id;

    if (!targetId) {
      return response.status(400).json({
        message: 'Provide _id',
        error: true,
        success: false,
      });
    }

    await CartProductModel.deleteOne({ _id: targetId, userId });
    await UserModel.findByIdAndUpdate(userId, { $pull: { shopping_cart: targetId } });

    return response.json({
      message: 'Item removed',
      error: false,
      success: true,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
};

export const getCartItemsByUserId = async (userId) => {
  if (!userId) return [];
  try {
    const items = await CartProductModel.find({ userId })
      .populate('productId')
      .lean();
    return items.filter((item) => item.productId);
  } catch (error) {
    console.error('Error fetching cart products:', error.message);
    return [];
  }
};

export const clearUserCart = async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    if (userId) {
      await CartProductModel.deleteMany({ userId });
      await UserModel.findByIdAndUpdate(userId, { shopping_cart: [] });
    }
    return res.json({
      message: 'Cart cleared',
      error: false,
      success: true,
      data: [],
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
};

export const getUserCart = getCartItemController;
export const updateUserCart = addToCartItemController;
export const addToCart = addToCartItemController;
export const getCart = getCartItemController;
export const deleteCartItem = deleteCartItemQtyController;
export const syncCart = syncUserCartController;
