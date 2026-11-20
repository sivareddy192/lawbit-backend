import mongoose from 'mongoose';

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  description: { type: String, default: '' },
  logo: { type: String, default: '' },
  coverImage: { type: String, default: '' },
  email: { type: String, default: '' },
  alternatePhone: { type: String, default: '' },
  state: { type: String, default: '' },
  pinCode: { type: String, default: '' },
  openingTime: { type: String, default: '' },
  closingTime: { type: String, default: '' },
  operatingDays: [{ type: String }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'RestaurantApplication', default: null },
  approvalStatus: {
    type: String,
    enum: ['NOT_SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'ADDITIONAL_DOCUMENTS_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED'],
    default: 'NOT_SUBMITTED',
    index: true,
  },
  rejectionReason: { type: String, default: '' },
  documents: {
    fssai: { type: String, default: '' },
    gst: { type: String, default: '' },
    ownerIdentity: { type: String, default: '' },
    bankProof: { type: String, default: '' },
  },
  submittedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  phone: { type: String, default: '' },
  rating: { type: Number, default: 4.5, min: 0, max: 5 },
  numReviews: { type: Number, default: 0 },
  prepTime: { type: String, default: '25-35 mins' },
  deliveryFee: { type: Number, default: 0, min: 0 },
  isOpen: { type: Boolean, default: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
  isFeatured: { type: Boolean, default: false, index: true },
  cuisines: [{ type: String, trim: true }],
  location: {
    latitude: { type: Number, default: 31.2554 },
    longitude: { type: Number, default: 75.7052 },
  },
}, { timestamps: true });

restaurantSchema.pre('validate', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

export default mongoose.models.Restaurant || mongoose.model('Restaurant', restaurantSchema);
