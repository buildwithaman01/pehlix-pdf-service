import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  pincode: { type: String, trim: true }
}, { _id: false });

const labSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  address: addressSchema,
  logo: {
    type: String,
    trim: true
  },
  reportHeader: {
    type: String,
    trim: true
  },
  reportFooter: {
    type: String,
    trim: true
  },
  nablNumber: {
    type: String,
    trim: true
  },
  gstNumber: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    required: true
  }
}, {
  timestamps: true
});

const Lab = mongoose.models.Lab || mongoose.model('Lab', labSchema);
export default Lab;
export { Lab };
