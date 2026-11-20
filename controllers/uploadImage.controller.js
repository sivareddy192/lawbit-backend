import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';

export const uploadImageController = async (req, res, next) => {
  try {
    const folder = req.body.folder || 'asg_foods/uploads';

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, folder);
      return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully to Cloudinary',
        url: result.secure_url || result.url,
        data: {
          url: result.secure_url || result.url,
          public_id: result.public_id,
        },
        public_id: result.public_id,
        isCloudinary: isCloudinaryConfigured(),
      });
    }

    if (req.body.image) {
      const result = await uploadToCloudinary(req.body.image, folder);
      return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully to Cloudinary',
        url: result.secure_url || result.url,
        data: {
          url: result.secure_url || result.url,
          public_id: result.public_id,
        },
        public_id: result.public_id,
        isCloudinary: isCloudinaryConfigured(),
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Please provide an image file or base64 image string',
    });
  } catch (error) {
    next(error);
  }
};

export const uploadImage = uploadImageController;

export const uploadMultipleImages = async (req, res, next) => {
  try {
    const folder = req.body.folder || 'asg_foods/dishes';
    const files = req.files || [];

    if (files.length === 0 && (!req.body.images || req.body.images.length === 0)) {
      return res.status(400).json({ success: false, message: 'Please upload at least one image' });
    }

    let uploadPromises = [];

    if (files.length > 0) {
      uploadPromises = files.map(file => uploadToCloudinary(file.buffer, folder));
    } else if (Array.isArray(req.body.images)) {
      uploadPromises = req.body.images.map(img => uploadToCloudinary(img, folder));
    }

    const results = await Promise.all(uploadPromises);
    const urls = results.map(r => r.secure_url || r.url);
    const publicIds = results.map(r => r.public_id);

    return res.status(200).json({
      success: true,
      count: urls.length,
      images: urls,
      public_ids: publicIds,
      isCloudinary: isCloudinaryConfigured(),
    });
  } catch (error) {
    next(error);
  }
};

export const uploadMultiple = uploadMultipleImages;

export const deleteImage = async (req, res, next) => {
  try {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ success: false, message: 'Please provide public_id to delete' });
    }

    const result = await deleteFromCloudinary(public_id);
    return res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      result,
    });
  } catch (error) {
    next(error);
  }
};
