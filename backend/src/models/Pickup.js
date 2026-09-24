import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({ latitude: { type: Number, min: -90, max: 90 }, longitude: { type: Number, min: -180, max: 180 }, accuracy: { type: Number, min: 0 }, recordedAt: Date }, { _id: false });

const pickupSchema = new mongoose.Schema({
  donationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation', required: true, index: true },
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO', required: true },
  pickupAddress: { type: String, required: true, trim: true },
  pickupLocation: locationSchema,
  trackingLocation: locationSchema,
  trackingEnabled: { type: Boolean, default: false },
  trackingStartedAt: Date,
  trackingStoppedAt: Date,
  scheduledAt: Date,
  status: { type: String, enum: ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'ON_THE_WAY', 'COLLECTED', 'COMPLETED', 'CANCELLED'], default: 'PENDING', index: true },
  collectedAt: Date,
  completedAt: Date,
  notes: { type: String, trim: true, maxlength: 1000 }
}, { timestamps: true, versionKey: false });

pickupSchema.index({ ngoId: 1, status: 1, scheduledAt: 1 });
pickupSchema.index({ donorId: 1, createdAt: -1 });
pickupSchema.index({ scheduledAt: 1 });

export default mongoose.model('Pickup', pickupSchema);
