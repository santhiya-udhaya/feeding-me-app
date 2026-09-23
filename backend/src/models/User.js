import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  latitude: { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, select: false },
  phone: { type: String, trim: true, match: /^[+\d][\d\s().-]{6,24}$/ },
  role: { type: String, enum: ['DONOR', 'NGO', 'ADMIN'], required: true, default: 'DONOR' },
  verificationStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
  profileImage: { type: String, trim: true },
  profileImageMetadata: { publicId: String, url: String, width: Number, height: Number, format: String, bytes: Number },
  location: locationSchema,
  notificationPreferences: {
    donationUpdates: { type: Boolean, default: true },
    pickupUpdates: { type: Boolean, default: true },
    ngoUpdates: { type: Boolean, default: true },
    systemUpdates: { type: Boolean, default: true }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, versionKey: false, toJSON: { transform: (_, ret) => { ret.id = ret._id.toString(); delete ret._id; delete ret.password; return ret; } } });

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ name: 1 });

export default mongoose.model('User', userSchema);
