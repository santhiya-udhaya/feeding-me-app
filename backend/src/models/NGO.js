import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  latitude: { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 }
}, { _id: false });

const verificationHistorySchema = new mongoose.Schema({
  status: { type: String, enum: ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'MORE_INFORMATION_REQUIRED'], required: true },
  note: { type: String, trim: true, maxlength: 1000 },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const ngoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  organizationName: { type: String, required: true, trim: true, maxlength: 160 },
  contactPerson: { type: String, trim: true, maxlength: 120 },
  organizationType: { type: String, trim: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 2000 },
  registrationNumber: { type: String, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true },
  city: { type: String, trim: true, maxlength: 80 },
  state: { type: String, trim: true, maxlength: 80 },
  pincode: { type: String, trim: true, maxlength: 20 },
  location: locationSchema,
  serviceRadius: { type: Number, min: 0, default: 25 },
  serviceArea: { type: String, trim: true, maxlength: 200 },
  foodCategoriesAccepted: [{ type: String, trim: true, maxlength: 80 }],
  pickupAvailability: { type: String, trim: true, maxlength: 200 },
  operatingHours: { type: String, trim: true, maxlength: 200 },
  website: { type: String, trim: true, maxlength: 300 },
  documents: [{ type: String, trim: true }],
  verificationStatus: { type: String, enum: ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'MORE_INFORMATION_REQUIRED'], default: 'PENDING', index: true },
  rejectionReason: { type: String, trim: true, maxlength: 1000 },
  verificationNote: { type: String, trim: true, maxlength: 1000 },
  verificationHistory: { type: [verificationHistorySchema], default: [] },
  verifiedAt: Date
}, { timestamps: true, versionKey: false, toJSON: { transform: (_, ret) => { ret.id = ret._id.toString(); delete ret._id; return ret; } } });

ngoSchema.index({ city: 1, verificationStatus: 1, createdAt: -1 });

export default mongoose.model('NGO', ngoSchema);
