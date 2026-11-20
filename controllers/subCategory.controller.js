import SubCategoryModel from '../models/subCategory.model.js';
import ProductModel from '../models/product.model.js';

export const AddSubCategoryController = async (req, res, next) => {
  try {
    const { name, image, category } = req.body;

    if (!name) {
      return res.status(400).json({
        message: 'Provide name',
        error: true,
        success: false,
      });
    }

    const payload = {
      name,
      image: image || '',
      category: Array.isArray(category) ? category : (category ? [category] : []),
    };

    const createSubCategory = new SubCategoryModel(payload);
    const save = await createSubCategory.save();

    return res.status(201).json({
      message: 'Sub Category Created',
      data: save,
      error: false,
      success: true,
    });
  } catch (error) {
    next(error);
  }
};

export const createSubCategory = AddSubCategoryController;

export const getSubCategoryController = async (req, res, next) => {
  try {
    const data = await SubCategoryModel.find()
      .sort({ createdAt: -1 })
      .populate('category');

    return res.json({
      message: 'Sub Category data',
      data: data,
      error: false,
      success: true,
    });
  } catch (error) {
    next(error);
  }
};

export const getSubCategory = getSubCategoryController;
export const getSubCategories = getSubCategoryController;

export const updateSubCategoryController = async (req, res, next) => {
  try {
    const { _id, name, image, category } = req.body;
    const targetId = _id || req.params.id;

    const checkSub = await SubCategoryModel.findById(targetId);

    if (!checkSub) {
      return res.status(404).json({
        message: 'Check your _id',
        error: true,
        success: false,
      });
    }

    const updateSubCategory = await SubCategoryModel.findByIdAndUpdate(
      targetId,
      {
        name: name || checkSub.name,
        image: image || checkSub.image,
        category: category ? (Array.isArray(category) ? category : [category]) : checkSub.category,
      },
      { new: true }
    );

    return res.json({
      message: 'Updated Successfully',
      data: updateSubCategory,
      error: false,
      success: true,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSubCategory = updateSubCategoryController;

export const deleteSubCategoryController = async (req, res, next) => {
  try {
    const { _id } = req.body;
    const targetId = _id || req.params.id;

    const deleteSub = await SubCategoryModel.findByIdAndDelete(targetId);

    return res.json({
      message: 'Deleted successfully',
      data: deleteSub,
      error: false,
      success: true,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSubCategory = deleteSubCategoryController;
