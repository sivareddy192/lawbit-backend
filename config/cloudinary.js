import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const isCloudinaryConfigured = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

export const uploadToCloudinary = async (fileInput, folder = 'asg_foods') => {
  if (!isCloudinaryConfigured()) {
    console.warn('⚠️ Cloudinary is not fully configured in .env. Using fallback URL.');
    if (typeof fileInput === 'string') {
      return {
        url: fileInput,
        secure_url: fileInput,
        public_id: `fallback_${Date.now()}`,
      };
    }
    const base64Data = `data:image/jpeg;base64,${fileInput.toString('base64')}`;
    return {
      url: base64Data,
      secure_url: base64Data,
      public_id: `fallback_${Date.now()}`,
    };
  }

  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(fileInput)) {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          transformation: fileInput ? [
            { quality: 'auto', fetch_format: 'auto' },
            { max_width: 1200, crop: 'limit' },
          ] : undefined,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({
            url: result.secure_url || result.url,
            secure_url: result.secure_url || result.url,
            public_id: result.public_id,
            format: result.format,
            bytes: result.bytes,
          });
        }
      );
      uploadStream.end(fileInput);
    } else {
      cloudinary.uploader.upload(
        fileInput,
        {
          folder,
          resource_type: 'image',
          transformation: [
            { quality: 'auto', fetch_format: 'auto' },
            { max_width: 1200, crop: 'limit' },
          ],
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({
            url: result.secure_url || result.url,
            secure_url: result.secure_url || result.url,
            public_id: result.public_id,
            format: result.format,
            bytes: result.bytes,
          });
        }
      );
    }
  });
};

export const deleteFromCloudinary = async (publicId) => {
  if (!isCloudinaryConfigured() || !publicId || publicId.startsWith('fallback_')) {
    return { result: 'ok' };
  }

  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    return null;
  }
};

export default cloudinary;
