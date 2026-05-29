import mongoose from 'mongoose';

const testParameterSchema = new mongoose.Schema({
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

const testMasterSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    trim: true
  },
  sampleType: {
    type: String,
    trim: true
  },
  container: {
    type: String,
    trim: true
  },
  basePrice: {
    type: Number,
    required: true,
    default: 0
  },
  parameters: [testParameterSchema],
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    index: true
  },
  isCustom: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const TestMaster = mongoose.models.TestMaster || mongoose.model('TestMaster', testMasterSchema);
export default TestMaster;
export { TestMaster };
