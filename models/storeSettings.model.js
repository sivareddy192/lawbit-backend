import mongoose from 'mongoose';

export const defaultStoreSettings = {
  storeOpen: true,
  openingTime: '10:00 AM',
  closingTime: '11:30 PM',
  openDays: 'Monday - Sunday (All 7 Days)',
  restaurantName: 'AK Foods - Crispy & Delicious',
  phone: '+91 98765 00000',
  email: 'support@asgfoods.com',
  address: 'Law Gate, LPU, Phagwara, Punjab 144411',
  deliveryRadius: '12 km',
  baseDeliveryFee: 0,
  freeDeliveryThreshold: 0,
  taxPercentage: 5,
  estimatedDeliveryTime: '25-35 mins',
  fssaiLicense: '10020042001234',
  adminWhatsApp: '+91 72075 60098',
  whatsappAlertsEnabled: true,
};

const storeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    ...Object.fromEntries(
      Object.entries(defaultStoreSettings).map(([key, value]) => [
        key,
        { type: typeof value === 'boolean' ? Boolean : typeof value === 'number' ? Number : String, default: value },
      ])
    ),
  },
  { timestamps: true }
);

export const StoreSettingsModel = mongoose.model('store_settings', storeSettingsSchema);
