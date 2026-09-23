import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  type: { type: String, enum: ['DONATION_CREATED', 'DONATION_ACCEPTED', 'DONATION_CANCELLED', 'DONATION_EXPIRING', 'DONATION_EXPIRED', 'PICKUP_SCHEDULED', 'PICKUP_STARTED', 'PICKUP_COLLECTED', 'PICKUP_COMPLETED', 'PICKUP_CANCELLED', 'NGO_REGISTERED', 'NGO_VERIFIED', 'NGO_REJECTED', 'SYSTEM'], required: true, index: true },
  relatedDonationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation' },
  relatedPickupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pickup' },
  relatedNGOId: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO' },
  isRead: { type: Boolean, default: false }
}, { timestamps: true, versionKey: false });

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
