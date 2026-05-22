import mongoose from 'mongoose';

const labTestSchema = new mongoose.Schema({
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    required: true,
    index: true
  },
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestMaster',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  price: {
    type: Number,
    required: true
  },
  customTurnaroundTime: {
    type: Number // in hours
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const LabTest = mongoose.models.LabTest || mongoose.model('LabTest', labTestSchema);
export default LabTest;
export { LabTest };
