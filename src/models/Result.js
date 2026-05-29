import mongoose from 'mongoose';

const parameterResultSchema = new mongoose.Schema({
  parameterName: {
    type: String,
    required: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed
  },
  unit: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['normal', 'low', 'high', 'criticalLow', 'criticalHigh'],
    default: 'normal'
  },
  isFlagged: {
    type: Boolean,
    default: false
  },
  isOverride: {
    type: Boolean,
    default: false
  },
  overrideReason: {
    type: String,
    trim: true
  },
  appliedRangeLabel: {
    type: String,
    trim: true
  }
}, { _id: false });

const resultSchema = new mongoose.Schema({
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    required: true,
    index: true
  },
  visitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Visit',
    required: true,
    index: true
  },
  sampleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sample'
  },
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestMaster',
    required: true
  },
  enteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  parameters: [parameterResultSchema],
  isCritical: {
    type: Boolean,
    default: false
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  isRejected: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const Result = mongoose.models.Result || mongoose.model('Result', resultSchema);
export default Result;
export { Result };
