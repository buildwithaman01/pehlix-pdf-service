import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    required: true
  },
  visitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Visit',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  reportCode: {
    type: String,
    required: true
  },
  qrVerificationId: {
    type: String
  },
  pdfUrl: {
    type: String
  },
  pathologistNote: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'generating', 'generated', 'delivered', 'failed'],
    default: 'pending'
  },
  generatedAt: {
    type: Date
  },
  version: {
    type: Number,
    default: 1
  },
  isAmended: {
    type: Boolean,
    default: false
  },
  amendmentReason: {
    type: String,
    trim: true
  },
  amendedAt: {
    type: Date
  },
  amendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  originalReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report'
  },
  previousPdfUrl: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
export default Report;
export { Report };
