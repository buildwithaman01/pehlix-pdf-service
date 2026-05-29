import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    index: true
  },
  role: {
    type: String,
    enum: [
      'owner',
      'pathologist',
      'technician',
      'receptionist',
      'phlebotomist',
      'doctor',
      'patient',
      'collectionCenter',
      'superAdmin'
    ],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
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
  isActive: {
    type: Boolean,
    default: true
  },
  signature: {
    type: String,
    trim: true
  },
  qualifications: {
    type: String,
    trim: true
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  signatureImageKey: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
export { User };
