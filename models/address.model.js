import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  address_line: {
    type: String,
    default: '',
  },
  city: {
    type: String,
    default: '',
  },
  state: {
    type: String,
    default: '',
  },
  pincode: {
    type: String,
    default: '',
  },
  country: {
    type: String,
    default: '',
  },
  mobile: {
    type: Number,
    default: null,
  },
  status: {
    type: Boolean,
    default: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  fullName: { 
    type: String,
    default: '',
  },
  phone: {
    type: String,
    default: '',
  },
  houseFlat: {
    type: String,
    default: '',
  },
  street: {
    type: String,
    default: '',
  },
  landmark: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'Home',
  },
  latitude: {
    type: Number,
    default: null,
  },
  longitude: {
    type: Number,
    default: null,
  },
  formattedAddress: {
    type: String,
    default: '',
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

const AddressModel = mongoose.models.address || mongoose.model('address', addressSchema);

export { addressSchema };
export default AddressModel;
