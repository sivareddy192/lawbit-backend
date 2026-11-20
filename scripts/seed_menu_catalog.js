import 'dotenv/config';
import connectDB from '../config/db.js';
import RestaurantModel from '../models/restaurant.model.js';
import ProductModel from '../models/product.model.js';
import CategoryModel from '../models/category.model.js';
import cache from '../services/cacheService.js';

const dishTemplates = [
  {
    name: 'Crispy Chicken Wings',
    description: 'Hot, crispy chicken wings served with house sauce.',
    price: 299,
    discount: 10,
    isVeg: false,
    isFeatured: true,
    isBestseller: true,
  },
  {
    name: 'Smash Chicken Burger',
    description: 'Juicy chicken patty, cheese, fresh vegetables and burger sauce.',
    price: 249,
    discount: 15,
    isVeg: false,
    isFeatured: true,
  },
  {
    name: 'Cheesy Margherita Pizza',
    description: 'Classic pizza topped with mozzarella and tomato sauce.',
    price: 349,
    discount: 10,
    isVeg: true,
    isFeatured: true,
  },
  {
    name: 'Peri Peri Loaded Fries',
    description: 'Crispy fries loaded with cheese sauce and peri peri seasoning.',
    price: 199,
    discount: 0,
    isVeg: true,
    isFeatured: false,
  },
  {
    name: 'Paneer Tikka Bowl',
    description: 'Grilled paneer, fresh vegetables and creamy house dressing.',
    price: 279,
    discount: 12,
    isVeg: true,
    isFeatured: true,
  },
  {
    name: 'Chocolate Thick Shake',
    description: 'Rich chocolate shake topped with whipped cream.',
    price: 179,
    discount: 5,
    isVeg: true,
    isFeatured: false,
  },
];

const run = async () => {
  await connectDB();
  let restaurants = await RestaurantModel.find({ isActive: { $ne: false } }).limit(1).lean();
  let restaurant;

  if (restaurants.length === 0) {
    restaurant = await RestaurantModel.create({
      name: 'AK Foods',
      slug: 'ak-foods',
      description: 'Fresh crispy chicken, burgers, pizza and more.',
      address: 'Law Gate, LPU, Phagwara',
      city: 'Phagwara',
      approvalStatus: 'APPROVED',
      isActive: true,
      isOpen: true,
      isFeatured: true,
      cuisines: ['Chicken', 'Burgers', 'Pizza', 'Fast Food'],
    });
  } else {
    restaurant = restaurants[0];
  }
  let categories = await CategoryModel.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean();

  if (categories.length === 0) {
    const defaults = [
      ['Chicken', 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=500&q=80'],
      ['Burgers', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80'],
      ['Pizza', 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=500&q=80'],
      ['Sides', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=500&q=80'],
    ];
    for (const [name, image] of defaults) {
      await CategoryModel.findOneAndUpdate(
        { name },
        { $set: { name, image, isActive: true } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    categories = await CategoryModel.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean();
  }

  const imageByCategory = {
    chicken: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80',
    burgers: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
    pizza: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80',
    sides: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80',
  };

  let seededCount = 0;
  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    const categoryKey = category.name.toLowerCase();
    const image = imageByCategory[categoryKey] ||
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80';

    for (let dishIndex = 0; dishIndex < 3; dishIndex += 1) {
      const template = dishTemplates[(index + dishIndex) % dishTemplates.length];
      const name = `${template.name} - ${category.name}`;
      const slug = `${name}-${restaurant._id.toString().slice(-6)}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      await ProductModel.findOneAndUpdate(
      { restaurant: restaurant._id, name },
      {
        $set: {
          ...template,
          name,
          slug,
          category: category.name,
          categoryName: category.name,
          restaurant: restaurant._id,
          images: [image],
          inStock: true,
          publish: true,
          prepTime: '20-25 mins',
          ingredients: [],
          finalPrice: template.discount > 0
            ? Math.round(template.price - (template.price * template.discount / 100))
            : template.price,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
      seededCount += 1;
    }
  }

  await cache.invalidateCatalogueCache();
  console.log(`Seeded ${seededCount} menu items across ${categories.length} categories for ${restaurant.name}`);
  process.exit(0);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
