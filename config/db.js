import mongoose from 'mongoose';

export let isConnected = false;

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return true;
  }

  let uri = process.env.MONGO_URI;

  if (typeof uri === 'string') {
    if (uri.includes('.mongodb.net/?')) {
      uri = uri.replace('.mongodb.net/?', '.mongodb.net/asg_foods?');
    } else if (uri.includes('.mongodb.net') && !uri.includes('.mongodb.net/')) {
      uri = uri.replace('.mongodb.net', '.mongodb.net/asg_foods');
    }
  }

  try {
    await mongoose.connect(uri, {
      maxPoolSize: process.env.MONGO_MAX_POOL_SIZE ? Number(process.env.MONGO_MAX_POOL_SIZE) : 50,
      minPoolSize: process.env.MONGO_MIN_POOL_SIZE ? Number(process.env.MONGO_MIN_POOL_SIZE) : 10,
      maxIdleTimeMS: 30000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 5000,
      autoIndex: process.env.NODE_ENV !== 'production',
    });
    isConnected = true;
    console.log(`MongoDB Connected with Connection Pool (maxPool: 50, minPool: 10)`);
    return true;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    isConnected = false;
    return false;
  }
};

mongoose.connection.on('connected', () => {
  isConnected = true;
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
});

export default connectDB;
