import CategoryModel from '../models/category.model.js';
import ProductModel from '../models/product.model.js';
import cache from '../services/cacheService.js';

export const getAllCategories = async (req, res, next) => {
  try {
    const cacheKey = 'asg:categories:all';
    const cached = await cache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600');
      return res.json(cached);
    }

    const categories = await CategoryModel.find({ isActive: { $ne: false } })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const products = await ProductModel.find(
      { publish: { $ne: false } },
      'category categoryName inStock'
    ).lean();

    const countsMap = new Map();
    products.forEach((prod) => {
      const catKeys = new Set();
      if (typeof prod.category === 'string' && prod.category.trim()) {
        catKeys.add(prod.category.trim().toLowerCase());
      } else if (prod.category && typeof prod.category === 'object') {
        if (prod.category.name) catKeys.add(String(prod.category.name).trim().toLowerCase());
        if (prod.category._id) catKeys.add(String(prod.category._id));
      }
      if (prod.categoryName) {
        catKeys.add(String(prod.categoryName).trim().toLowerCase());
      }

      catKeys.forEach((key) => {
        countsMap.set(key, (countsMap.get(key) || 0) + 1);
      });
    });

    const enrichedCategories = categories.map((cat) => {
      const catNameLower = (cat.name || '').trim().toLowerCase();
      const catIdStr = cat._id?.toString();
      const catSlug = (cat.slug || '').trim().toLowerCase();

      const realCount =
        countsMap.get(catNameLower) ||
        (catIdStr ? countsMap.get(catIdStr) : 0) ||
        (catSlug ? countsMap.get(catSlug) : 0) ||
        0;

      return {
        ...cat,
        itemCount: realCount,
      };
    });

    const responsePayload = {
      success: true,
      count: enrichedCategories.length,
      categories: enrichedCategories,
    };

    cache.set(cacheKey, responsePayload, 300).catch(() => {});

    res.setHeader('X-Cache-Status', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600');
    return res.json(responsePayload);
  } catch (error) {
    next(error);
  }
};

export const getCategoryController = getAllCategories;

export const getCategoryBySlug = async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const category = await CategoryModel.findOne({ slug }).lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    return res.json({ success: true, category });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const { name, image, description, sortOrder } = req.body;
    if (!name || !image) {
      return res.status(400).json({ success: false, message: 'Name and image are required' });
    }

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const existingCategory = await CategoryModel.findOne({
      $or: [{ slug }, { name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } }],
    });
    if (existingCategory) {
      return res.status(400).json({ success: false, message: 'Category with this name already exists' });
    }

    const category = await CategoryModel.create({
      name: name.trim(),
      slug,
      image,
      description: description || '',
      sortOrder: Number(sortOrder) || 0,
      isActive: true,
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('catalogue_updated', { type: 'categories', timestamp: Date.now() });
      io.emit('categories_updated', { timestamp: Date.now() });
      io.emit('foods_updated', { timestamp: Date.now() });
    }

    cache.invalidateCatalogueCache().catch(() => {});

    return res.status(201).json({ success: true, message: 'Category created', category });
  } catch (error) {
    next(error);
  }
};

export const addCategoryController = createCategory;

export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, image, description, sortOrder, isActive } = req.body;

    const category = await CategoryModel.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const oldName = category.name;

    if (name && name.trim()) {
      category.name = name.trim();
      category.slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
    if (image) category.image = image;
    if (description !== undefined) category.description = description;
    if (sortOrder !== undefined) category.sortOrder = Number(sortOrder);
    if (isActive !== undefined) category.isActive = Boolean(isActive);

    const savedCategory = await category.save();

    if (name && name.trim() && name.trim() !== oldName) {
      await ProductModel.updateMany(
        { category: { $regex: new RegExp(`^${oldName}$`, 'i') } },
        { category: name.trim(), categoryName: name.trim() }
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('catalogue_updated', { type: 'categories', timestamp: Date.now() });
      io.emit('categories_updated', { timestamp: Date.now() });
      io.emit('foods_updated', { timestamp: Date.now() });
    }

    cache.invalidateCatalogueCache().catch(() => {});

    return res.json({ success: true, message: 'Category updated', category: savedCategory });
  } catch (error) {
    next(error);
  }
};

export const updateCategoryController = updateCategory;

export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await CategoryModel.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const count = await ProductModel.countDocuments({ category: category.name });
    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${count} food item(s) are in this category. Reassign them first.`,
      });
    }

    await CategoryModel.findByIdAndDelete(id);

    const io = req.app.get('io');
    if (io) {
      io.emit('catalogue_updated', { type: 'categories', timestamp: Date.now() });
      io.emit('categories_updated', { timestamp: Date.now() });
    }

    cache.invalidateCatalogueCache().catch(() => {});

    return res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    next(error);
  }
};

export const deleteCategoryController = deleteCategory;
