import mongoose from 'mongoose';

let cachedConnection = null;

export async function connectDB() {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  cachedConnection = await mongoose.connect(uri, options);
  console.log('MongoDB connected successfully (cached)');
  return cachedConnection;
}
