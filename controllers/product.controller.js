import ProductModel from '../models/product.model.js';
import cache from '../services/cacheService.js';

export const getAllFoods = async (req, res, next) => {
  try {
    const {
      search,
      category,
      isVeg,
      isBestseller,
      isFeatured,
      minPrice,
      maxPrice,
      minRating,
      sort,
      restaurant,
      page = 1,
      limit = 30,
    } = req.query;

    const cacheKey = `asg:foods:${JSON.stringify({
      search: search || '',
      category: category || '',
      isVeg: isVeg || '',
      isBestseller: isBestseller || '',
      isFeatured: isFeatured || '',
      minPrice: minPrice || '',
      maxPrice: maxPrice || '',
      minRating: minRating || '',
      sort: sort || '',
      restaurant: restaurant || '',
      page: Number(page),
      limit: Number(limit),
    })}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
      return res.json(cached);
    }

    const query = {};
    if (restaurant && typeof restaurant === 'string' && /^[0-9a-fA-F]{24}$/.test(restaurant)) {
      query.restaurant = restaurant;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { description: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    if (category && typeof category === 'string' && category !== 'All' && category !== 'all') {
      const safeCategory = category.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.category = { $regex: new RegExp(`^${safeCategory}$`, 'i') };
    }

    if (isVeg !== undefined && isVeg !== '') {
      query.isVeg = isVeg === 'true' || isVeg === true;
    }

    if (isBestseller === 'true') query.isBestseller = true;
    if (isFeatured === 'true') query.isFeatured = true;

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (minRating) query.rating = { $gte: Number(minRating) };

    let sortOptions = { createdAt: -1 };
    if (sort === 'price-low') sortOptions = { price: 1 };
    else if (sort === 'price-high') sortOptions = { price: -1 };
    else if (sort === 'rating') sortOptions = { rating: -1 };
    else if (sort === 'popular') sortOptions = { totalOrders: -1, rating: -1 };

    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;

    const [totalFoods, foods] = await Promise.all([
      ProductModel.countDocuments(query),
      ProductModel.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(pageSize)
        .populate('restaurant', 'name slug logo isOpen rating prepTime deliveryFee')
        .lean(),
    ]);

    const responsePayload = {
      success: true,
      count: foods.length,
      totalFoods,
      totalPages: Math.ceil(totalFoods / pageSize),
      currentPage: pageNumber,
      foods,
      data: foods,
    };

    cache.set(cacheKey, responsePayload, 180).catch(() => {});

    res.setHeader('X-Cache-Status', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.json(responsePayload);
  } catch (error) {
    next(error);
  }
};

export const getProductController = getAllFoods;
export const getAllProducts = getAllFoods;

export const getFoodBySlug = async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const cacheKey = `asg:foods:slug:${slug}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cached);
    }

    const food = await ProductModel.findOne({ slug })
      .populate('restaurant', 'name slug logo isOpen rating prepTime deliveryFee address')
      .lean();
    if (!food) return res.status(404).json({ success: false, message: 'Food item not found' });
    const relatedFoods = await ProductModel.find({ category: food.category, _id: { $ne: food._id } })
      .limit(4)
      .lean();

    const responsePayload = { success: true, food, relatedFoods };
    cache.set(cacheKey, responsePayload, 300).catch(() => {});

    return res.json(responsePayload);
  } catch (error) {
    next(error);
  }
};

export const getProductBySlug = getFoodBySlug;

export const getFoodById = async (req, res, next) => {
  try {
    const food = await ProductModel.findById(req.params.id).lean();
    if (!food) return res.status(404).json({ success: false, message: 'Food item not found' });
    return res.json({ success: true, food });
  } catch (error) {
    next(error);
  }
};

export const getProductById = getFoodById;

export const getFeaturedFoods = async (req, res, next) => {
  try {
    const cacheKey = 'asg:featured:list';
    const cached = await cache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cached);
    }

    const foods = await ProductModel.find({ isFeatured: true, inStock: true })
      .limit(8)
      .lean();
    const payload = { success: true, foods };
    cache.set(cacheKey, payload, 300).catch(() => {});
    return res.json(payload);
  } catch (error) {
    next(error);
  }
};

export const getFeaturedProducts = getFeaturedFoods;

export const getBestsellerFoods = async (req, res, next) => {
  try {
    const cacheKey = 'asg:bestsellers:list';
    const cached = await cache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cached);
    }

    let foods = await ProductModel.find({
      isBestseller: true,
      inStock: true,
      publish: { $ne: false },
    })
      .sort({ totalOrders: -1, rating: -1, createdAt: -1 })
      .limit(8)
      .lean();

    if (foods.length === 0) {
      foods = await ProductModel.find({
        inStock: true,
        publish: { $ne: false },
      })
        .sort({ isFeatured: -1, totalOrders: -1, rating: -1, createdAt: -1 })
        .limit(8)
        .lean();
    }
    const payload = { success: true, foods };
    cache.set(cacheKey, payload, 300).catch(() => {});
    return res.json(payload);
  } catch (error) {
    next(error);
  }
};

export const getBestsellerProducts = getBestsellerFoods;

export const createProduct = async (req, res, next) => {
  try {
    const {
      restaurant,
      name,
      description,
      category,
      subCategory,
      price,
      discount,
      images,
      image,
      isVeg,
      isFeatured,
      isBestseller,
      inStock,
      stock,
      prepTime,
      calories,
      nutritionalInfo,
      ingredients,
      sizes,
      addOns,
      unit,
      more_details,
    } = req.body;

    const imgList = images || (image ? (Array.isArray(image) ? image : [image]) : []);

    const product = await ProductModel.create({
      restaurant: restaurant || null,
      name,
      description,
      category,
      subCategory: subCategory || [],
      price: Number(price),
      discount: Number(discount) || 0,
      images: imgList,
      image: imgList,
      isVeg: Boolean(isVeg),
      isFeatured: Boolean(isFeatured),
      isBestseller: Boolean(isBestseller),
      inStock: inStock !== undefined ? Boolean(inStock) : true,
      stock: stock !== undefined ? Number(stock) : null,
      prepTime: prepTime || '20-25 mins',
      calories: Number(calories) || 450,
      nutritionalInfo: nutritionalInfo || {},
      ingredients: Array.isArray(ingredients) ? ingredients : [],
      sizes: Array.isArray(sizes) ? sizes : [],
      addOns: Array.isArray(addOns) ? addOns : [],
      unit: unit || '',
      more_details: more_details || {},
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('catalogue_updated', { type: 'foods', timestamp: Date.now() });
      io.emit('foods_updated', { timestamp: Date.now() });
    }

    cache.invalidateCatalogueCache().catch(() => {});

    return res.status(201).json({ success: true, message: 'Product created', food: product, product });
  } catch (error) {
    next(error);
  }
};

export const createFood = createProduct;
export const addProduct = createProduct;

export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await ProductModel.findById(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    Object.assign(product, req.body);
    if (req.body.price !== undefined || req.body.discount !== undefined) {
      const price = Number(req.body.price !== undefined ? req.body.price : product.price);
      const discount = Number(req.body.discount !== undefined ? req.body.discount : product.discount);
      product.finalPrice = discount > 0 ? Math.round(price - (price * discount) / 100) : price;
    }

    if (req.body.images) {
      product.images = req.body.images;
      product.image = req.body.images;
    }

    await product.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('catalogue_updated', { type: 'foods', timestamp: Date.now() });
      io.emit('foods_updated', { timestamp: Date.now() });
    }

    cache.invalidateCatalogueCache().catch(() => {});

    return res.json({ success: true, message: 'Product updated', food: product, product });
  } catch (error) {
    next(error);
  }
};

export const updateFood = updateProduct;

export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await ProductModel.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const io = req.app.get('io');
    if (io) {
      io.emit('catalogue_updated', { type: 'foods', timestamp: Date.now() });
      io.emit('foods_updated', { timestamp: Date.now() });
    }

    cache.invalidateCatalogueCache().catch(() => {});

    return res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

export const deleteFood = deleteProduct;

export const toggleProductStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await ProductModel.findById(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.inStock = !product.inStock;
    await product.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('catalogue_updated', { type: 'foods', timestamp: Date.now() });
      io.emit('foods_updated', { timestamp: Date.now() });
    }

    return res.json({
      success: true,
      message: `Product is now ${product.inStock ? 'in stock' : 'out of stock'}`,
      inStock: product.inStock,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleFoodStock = toggleProductStock;

export const toggleProductFeatured = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await ProductModel.findById(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.isFeatured = !product.isFeatured;
    await product.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('catalogue_updated', { type: 'foods', timestamp: Date.now() });
      io.emit('foods_updated', { timestamp: Date.now() });
    }

    return res.json({
      success: true,
      message: `Product is ${product.isFeatured ? 'now featured' : 'no longer featured'}`,
      isFeatured: product.isFeatured,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleFoodFeatured = toggleProductFeatured;
