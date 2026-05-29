import mongoose from 'mongoose';

const customParameterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  unit: {
    type: String,
    trim: true
  },
  normalLow: {
    type: Number
  },
  normalHigh: {
    type: Number
  },
  criticalLow: {
    type: Number
  },
  criticalHigh: {
    type: Number
  },
  isDerived: {
    type: Boolean,
    default: false
  }
}, { _id: false });

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
  customParameters: [customParameterSchema],
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
