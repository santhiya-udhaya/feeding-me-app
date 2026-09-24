import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  donationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation', required: true, index: true },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  revieweeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reviewType: { type: String, enum: ['NGO_TO_DONOR', 'DONOR_TO_NGO'], required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  communication: { type: Number, min: 1, max: 5 },
  timeliness: { type: Number, min: 1, max: 5 },
  foodCondition: { type: String, enum: ['GOOD', 'NEEDS_ATTENTION', 'NOT_ACCEPTABLE'] },
  packagingCondition: { type: String, enum: ['GOOD', 'NEEDS_ATTENTION', 'POOR'] },
  quantityAccuracy: { type: String, enum: ['CORRECT', 'DIFFERENT'] },
  comment: { type: String, trim: true, maxlength: 1000 },
  thankYouMessage: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true, versionKey: false, toJSON: { transform: (_, ret) => { ret.id = ret._id.toString(); delete ret._id; return ret; } } });

reviewSchema.index({ donationId: 1, reviewerId: 1 }, { unique: true });
reviewSchema.index({ revieweeId: 1, createdAt: -1 });

export default mongoose.model('Review', reviewSchema);
