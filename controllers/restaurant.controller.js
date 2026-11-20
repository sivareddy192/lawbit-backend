import Restaurant from '../models/restaurant.model.js';
import ProductModel from '../models/product.model.js';
import NotificationModel from '../models/notification.model.js';
import cache from '../services/cacheService.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const invalidateRestaurantCache = () => cache.delPattern('asg:restaurants:*').catch(() => {});

export const getRestaurants = async (req, res, next) => {
  try {
    const cacheKey = `asg:restaurants:${JSON.stringify(req.query)}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
      return res.json(cached);
    }

    const { search, featured, open } = req.query;
    const query = {};
    query.approvalStatus = 'APPROVED';
    query.isActive = { $ne: false };
    if (search?.trim()) {
      const safe = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { cuisines: { $regex: safe, $options: 'i' } },
      ];
    }
    if (featured === 'true') query.isFeatured = true;
    if (open === 'true') query.isOpen = true;

    const restaurants = await Restaurant.find(query)
      .select('name slug coverImage cuisines city address rating isFeatured isOpen prepTime deliveryFee isActive approvalStatus')
      .sort({ isFeatured: -1, rating: -1, name: 1 })
      .lean();
    const payload = { success: true, restaurants };
    await cache.set(cacheKey, payload, 300);
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.json(payload);
  } catch (error) {
    next(error);
  }
};

export const getRestaurantBySlug = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findOne({
      slug: req.params.slug.toLowerCase(),
      approvalStatus: 'APPROVED',
      isActive: { $ne: false },
      isOpen: true,
    }).lean();
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });
    const foods = await ProductModel.find({ restaurant: restaurant._id, publish: true })
      .sort({ isBestseller: -1, totalOrders: -1, createdAt: -1 })
      .lean();
    return res.json({ success: true, restaurant, foods });
  } catch (error) {
    next(error);
  }
};

export const getAdminRestaurants = async (req, res, next) => {
  try {
    const restaurants = await Restaurant.find().sort({ createdAt: -1 }).populate('owner', 'name email role').lean();
    return res.json({ success: true, restaurants });
  } catch (error) {
    next(error);
  }
};

export const createRestaurant = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.create({
      ...req.body,
      cuisines: Array.isArray(req.body.cuisines)
        ? req.body.cuisines
        : String(req.body.cuisines || '').split(',').map((item) => item.trim()).filter(Boolean),
    });
    await invalidateRestaurantCache();
    return res.status(201).json({ success: true, restaurant });
  } catch (error) {
    next(error);
  }
};

export const updateRestaurant = async (req, res, next) => {
  try {
    const update = { ...req.body };
    if (typeof update.cuisines === 'string') {
      update.cuisines = update.cuisines.split(',').map((item) => item.trim()).filter(Boolean);
    }
    const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });
    await invalidateRestaurantCache();
    return res.json({ success: true, restaurant });
  } catch (error) {
    next(error);
  }
};

export const deleteRestaurant = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findByIdAndDelete(req.params.id);
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });
    await invalidateRestaurantCache();
    return res.json({ success: true, message: 'Restaurant removed' });
  } catch (error) {
    next(error);
  }
};

export const updateMarketplaceRestaurantStatus = async (req, res, next) => {
  try {
    const { status, isActive } = req.body;
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });

    if (status === 'SUSPENDED') {
      restaurant.approvalStatus = 'SUSPENDED';
      restaurant.isActive = false;
      restaurant.isOpen = false;
    } else if (status === 'APPROVED') {
      restaurant.approvalStatus = 'APPROVED';
      restaurant.isActive = typeof isActive === 'boolean' ? isActive : true;
      restaurant.isOpen = restaurant.isActive;
    } else if (typeof isActive === 'boolean') {
      restaurant.isActive = isActive;
      restaurant.isOpen = isActive;
    }
    await restaurant.save();
    await invalidateRestaurantCache();

    if (restaurant.owner) {
      await NotificationModel.create({
        user: restaurant.owner,
        recipientId: restaurant.owner,
        recipientRole: 'VENDOR',
        title: status === 'SUSPENDED' ? 'Restaurant suspended' : 'Restaurant reactivated',
        message: status === 'SUSPENDED'
          ? 'Your restaurant has been suspended and cannot receive new orders.'
          : 'Your restaurant status has been updated and it can receive customer orders.',
        type: 'system',
        notificationType: status === 'SUSPENDED' ? 'RESTAURANT_SUSPENDED' : 'RESTAURANT_REACTIVATED',
      });
    }

    return res.json({ success: true, restaurant });
  } catch (error) {
    next(error);
  }
};
