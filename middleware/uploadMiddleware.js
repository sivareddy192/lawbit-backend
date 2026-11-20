import multer from 'multer';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (
    !file.mimetype ||
    file.mimetype.startsWith('image/') ||
    file.mimetype === 'application/pdf' ||
    /\.(pdf)$/i.test(file.originalname || '') ||
    /\.(jpg|jpeg|png|webp|gif|svg|avif|heic|heif)$/i.test(file.originalname || '')
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WEBP, GIF, SVG, AVIF, HEIC) are allowed!'), false);
  }
};

export const uploadSingleImage = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
}).single('image');

export const uploadMultipleImages = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
}).array('images', 6);

export default {
  uploadSingleImage,
  uploadMultipleImages,
};
