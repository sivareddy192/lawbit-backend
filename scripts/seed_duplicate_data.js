import 'dotenv/config';
import connectDB from '../config/db.js';
import mongoose from 'mongoose';

await connectDB();

const db = mongoose.connection.db;
const users = db.collection('users');
const restaurants = db.collection('restaurants');
const applications = db.collection('restaurantapplications');
const categories = db.collection('categories');
const products = db.collection('products');
const orders = db.collection('orders');

await users.updateMany({ role: 'admin' }, { $set: { role: 'ADMIN' } });

const vendor = await users.findOne({ role: 'VENDOR' });
let restaurant = await restaurants.findOne();
if (!restaurant) {
  restaurant = { name: 'Spice Hub', slug: 'spice-hub', address: 'Law Gate, Phagwara', city: 'Phagwara', phone: '9876543210', cuisines: ['Indian', 'Fast Food'], approvalStatus: 'PENDING', isOpen: false, createdAt: new Date(), updatedAt: new Date() };
  const result = await restaurants.insertOne(restaurant);
  restaurant._id = result.insertedId;
}

if (vendor) {
  await restaurants.updateOne({ _id: restaurant._id }, { $set: { owner: vendor._id, approvalStatus: 'PENDING', isOpen: false } });
  await applications.updateOne(
    { restaurant: restaurant._id, applicant: vendor._id },
    { $set: { restaurant: restaurant._id, applicant: vendor._id, status: 'PENDING', reviewNotes: '' }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
}

const categorySeeds = [
  ['Burgers', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600'],
  ['Pizza', 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600'],
  ['Biryani', 'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600'],
  ['Chinese', 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=600'],
  ['Desserts', 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600'],
  ['Beverages', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600'],
];

for (const [name, image] of categorySeeds) {
  await categories.updateOne(
    { name },
    { $set: { name, image, description: `${name} dishes`, isActive: true }, $setOnInsert: { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), createdAt: new Date() } },
    { upsert: true }
  );
}

const menuSeeds = [
  ['Classic Veg Burger', 'Burgers', 149, true, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'],
  ['Chicken Tandoori Burger', 'Burgers', 249, false, 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800'],
  ['Farmhouse Pizza', 'Pizza', 399, true, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800'],
  ['Paneer Pizza', 'Pizza', 349, true, 'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=800'],
  ['Chicken Dum Biryani', 'Biryani', 299, false, 'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=800'],
  ['Veg Biryani', 'Biryani', 229, true, 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=800'],
  ['Chicken Fried Rice', 'Chinese', 249, false, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800'],
  ['Veg Noodles', 'Chinese', 199, true, 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800'],
  ['Chocolate Brownie', 'Desserts', 179, true, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800'],
  ['Cold Coffee', 'Beverages', 129, true, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800'],
];

for (let i = 0; i < menuSeeds.length; i++) {
  const [name, category, price, isVeg, image] = menuSeeds[i];
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await products.updateOne(
    { slug },
    {
      $set: {
        restaurant: restaurant._id, name, slug, category, price, finalPrice: price,
        discount: i % 3 === 0 ? 10 : 0, description: `Freshly prepared ${name} from Spice Hub.`,
        images: [image], image: [image], isVeg, publish: true, inStock: i !== 9,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}

const customer = await users.findOne({ role: 'USER' }) || vendor;
if (customer) {
  const now = Date.now();
  const burger = await products.findOne({ category: 'Burgers' });
  const pizza = await products.findOne({ category: 'Pizza' });
  for (let i = 0; i < 3; i++) {
    const product = i % 2 ? burger : pizza;
    if (!product) continue;
    const quantity = i === 2 ? 2 : 1;
    const itemPrice = product.finalPrice || product.price;
    const orderId = `AK${(now + i).toString().slice(-8)}`;
    await orders.updateOne(
      { orderId },
      {
        $set: {
          user: customer._id, userId: customer._id, orderId,
          items: [{ restaurant: restaurant._id, restaurantName: restaurant.name, food: product._id, productId: product._id, name: product.name, image: product.images?.[0] || '', price: itemPrice, quantity, size: 'Regular', itemTotal: itemPrice * quantity }],
          itemsPrice: itemPrice * quantity, totalAmount: itemPrice * quantity + 40, totalAmt: itemPrice * quantity + 40,
          deliveryAddress: { fullName: customer.name, phone: customer.phone || '9876543210', houseFlat: `10-4-${i + 1}`, street: 'Law Gate Road', city: 'Phagwara', state: 'Punjab', pincode: '144411' },
          paymentMethod: i % 2 ? 'UPI' : 'COD', paymentStatus: i % 2 ? 'Completed' : 'Pending',
          orderStatus: ['Placed', 'Preparing', 'Delivered'][i], deliveryStatus: ['Placed', 'Preparing', 'Delivered'][i],
          vendors: [{ restaurant: restaurant._id, name: restaurant.name, itemsSubtotal: itemPrice * quantity }],
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  }
}

await mongoose.disconnect();
console.log('Database seed complete');
