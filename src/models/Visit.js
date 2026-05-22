import mongoose from 'mongoose';

const visitSchema = new mongoose.Schema({
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    required: true
  },
  visitCode: {
    type: String,
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  tests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabTest'
  }],
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor'
  },
  expectedReportTime: {
    type: Date
  },
  nablRequired: {
    type: Boolean,
    default: false
  },
  isNabl: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const Visit = mongoose.models.Visit || mongoose.model('Visit', visitSchema);
export default Visit;
export { Visit };
