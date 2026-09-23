import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  latitude: { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 }
}, { _id: false });

const donationSchema = new mongoose.Schema({
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  foodName: { type: String, required: true, trim: true, maxlength: 160 },
  foodType: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, enum: ['COOKED_FOOD', 'PACKAGED_FOOD', 'GROCERIES', 'FRUITS', 'VEGETABLES', 'BAKERY', 'OTHER'], default: 'OTHER', index: true },
  description: { type: String, trim: true, maxlength: 2000 },
  quantity: { type: Number, required: true, min: 0.01 },
  unit: { type: String, required: true, trim: true, maxlength: 30 },
  quantityUnit: { type: String, trim: true, maxlength: 30 },
  servings: { type: Number, min: 0 },
  imageUrl: { type: String, trim: true },
  image: {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
    width: Number,
    height: Number,
    format: { type: String, trim: true },
    bytes: Number
  },
  expiryTime: { type: Date, required: true, index: true },
  pickupAddress: { type: String, required: true, trim: true, maxlength: 300 },
  pickupLocation: locationSchema,
  location: { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number], validate: value => !value || value.length === 2 } },
  status: { type: String, enum: ['AVAILABLE', 'REQUESTED', 'ACCEPTED', 'PICKUP_SCHEDULED', 'PICKUP_IN_PROGRESS', 'COLLECTED', 'COMPLETED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'REJECTED', 'CANCELLED', 'EXPIRED'], default: 'AVAILABLE', index: true },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO' },
  acceptedAt: Date,
  completedAt: Date
}, { timestamps: true, versionKey: false, toJSON: { transform: (_, ret) => { ret.id = ret._id.toString(); ret.pickupLocation = ret.pickupLocation || undefined; delete ret._id; return ret; } } });

donationSchema.index({ status: 1, expiryTime: 1, category: 1 });
donationSchema.index({ acceptedBy: 1, createdAt: -1 });
donationSchema.index({ createdAt: -1 });
donationSchema.index({ location: '2dsphere' });

export default mongoose.model('Donation', donationSchema);
