import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema({
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    required: true
  },
  patientCode: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: true
  },
  age: {
    type: Number,
    required: true
  },
  ageUnit: {
    type: String,
    enum: ['years', 'months', 'days'],
    default: 'years'
  },
  phone: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

const Patient = mongoose.models.Patient || mongoose.model('Patient', patientSchema);
export default Patient;
export { Patient };
