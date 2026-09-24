import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import NGO from './models/NGO.js';
import Donation from './models/Donation.js';
import Pickup from './models/Pickup.js';
import Notification from './models/Notification.js';
import AuditLog from './models/AuditLog.js';
import Review from './models/Review.js';
import { createNotification } from './services/notificationService.js';
import { emailVerificationDelivery, phoneVerificationDelivery } from './services/verificationDeliveryService.js';
import { optionalAuth, requireAuth, requireRole } from './middleware/authMiddleware.js';
import { requireVerifiedNGO } from './middleware/roleMiddleware.js';
import { uploadImage } from './middleware/uploadMiddleware.js';
import { deleteImage, uploadImage as uploadToCloudinary } from './services/mediaService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const secret = process.env.JWT_SECRET;
const roleFromRequest = role => String(role || '').toUpperCase();

if (!secret) throw new Error('JWT_SECRET is not configured. Add it to backend/.env.');

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

function publicUser(user) {
  const value = user.toJSON ? user.toJSON() : user;
  return { ...value, role: value.role.toLowerCase(), emailVerified: Boolean(value.emailVerified), phoneVerified: Boolean(value.phoneVerified), verificationStatus: value.verificationStatus || (value.role === 'DONOR' ? 'APPROVED' : undefined) };
}

function publicDonation(donation) {
  const value = donation.toJSON ? donation.toJSON() : donation;
  return {
    ...value,
    pickupLocation: value.pickupAddress,
    pickupCoordinates: value.pickupLocation,
    expiryTime: value.expiryTime instanceof Date ? value.expiryTime.toISOString() : value.expiryTime,
    donorId: value.donorId?._id?.toString?.() || value.donorId?.toString?.() || value.donorId,
    donorName: value.donorId?.name || value.donorName,
    acceptedBy: value.acceptedBy?._id?.toString?.() || value.acceptedBy?.toString?.() || value.acceptedBy,
    acceptedByName: value.acceptedBy?.organizationName,
    ngoRejections: undefined
  };
}

function publicDonationListing(donation, req) {
  const listing = publicDonation(donation);
  const ownsDonation = req.user?.role === 'DONOR' && listing.donorId === req.user._id.toString();
  const verifiedNGOPartner = req.ngo && (listing.status === 'AVAILABLE' || listing.acceptedBy === req.ngo._id.toString());
  if (req.user?.role === 'ADMIN' || ownsDonation || verifiedNGOPartner) return listing;

  return {
    ...listing,
    pickupLocation: 'Exact pickup details shared with verified NGO partners',
    pickupCoordinates: undefined,
    donorId: undefined,
    donorName: undefined,
    acceptedBy: undefined,
    acceptedByName: undefined,
    issueReport: undefined,
    foodReview: undefined
  };
}

function publicPickup(pickup) {
  const value = pickup.toJSON ? pickup.toJSON() : pickup;
  const lastTrackingUpdate = value.trackingLocation?.recordedAt ? new Date(value.trackingLocation.recordedAt).getTime() : 0;
  const trackingIsFresh = Boolean(value.trackingEnabled && Number.isFinite(lastTrackingUpdate) && Date.now() - lastTrackingUpdate < 45000);
  return {
    ...value,
    id: value.id || value._id?.toString?.(),
    donationId: value.donationId?._id?.toString?.() || value.donationId?.toString?.() || value.donationId,
    donorId: value.donorId?._id?.toString?.() || value.donorId?.toString?.() || value.donorId,
    ngoId: value.ngoId?._id?.toString?.() || value.ngoId?.toString?.() || value.ngoId,
    donation: value.donationId?.foodName ? { id: value.donationId.id || value.donationId._id?.toString?.(), foodName: value.donationId.foodName, status: value.donationId.status } : undefined,
    ngoName: value.ngoId?.organizationName,
    donorName: value.donorId?.name,
    trackingEnabled: trackingIsFresh,
    trackingLocation: trackingIsFresh ? value.trackingLocation : undefined
  };
}

async function notify(userId, title, message, type, relatedDonationId, relatedPickupId, relatedNGOId) {
  if (userId) await createNotification({ recipient: userId, title, message, type, relatedDonation: relatedDonationId, relatedPickup: relatedPickupId, relatedNGO: relatedNGOId });
}

function publicNotification(notification) {
  const value = notification.toJSON ? notification.toJSON() : notification;
  return { ...value, id: value.id || value._id?.toString?.() };
}

function dateRange(query) {
  const range = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) range.$lte = new Date(query.to);
  if ((query.from && Number.isNaN(range.$gte.getTime())) || (query.to && Number.isNaN(range.$lte.getTime()))) throw Object.assign(new Error('Invalid date range.'), { status: 400 });
  if (range.$gte && range.$lte && range.$gte >= range.$lte) throw Object.assign(new Error('Date range must be valid and in order.'), { status: 400 });
  if (range.$gte && range.$lte && range.$lte - range.$gte > 366 * 24 * 60 * 60 * 1000) throw Object.assign(new Error('Date range cannot exceed one year.'), { status: 400 });
  return Object.keys(range).length ? { createdAt: range } : {};
}

async function audit(actor, action, entityType, entityId, metadata = {}) {
  return AuditLog.create({ actor, action, entityType, entityId, metadata });
}

function csvResponse(res, rows, filename) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [headers.join(','), ...rows.map(row => headers.map(header => quote(row[header])).join(','))].join('\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename=${filename}` }).send(csv);
}

function token(user) {
  return jwt.sign({ userId: user._id.toString(), role: user.role }, secret, { expiresIn: '7d' });
}

const protect = requireAuth(secret);

function requireApprovedDonor(req, res, next) {
  if (req.user.role !== 'DONOR') return res.status(403).json({ message: 'Only donors can create donations.' });
  if (req.user.verificationStatus !== 'APPROVED' || !req.user.isActive) return res.status(403).json({ message: 'Your donor account is awaiting Admin verification.' });
  next();
}

async function expireAvailableDonations() {
  await Donation.updateMany({ status: 'AVAILABLE', expiryTime: { $lte: new Date() } }, { $set: { status: 'EXPIRED' } });
}

app.get('/health', (_, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.get('/api/health', (_, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

app.get('/api/impact', async (_, res, next) => {
  try {
    const [food, completed, donors, ngos, donationsOverTime] = await Promise.all([
      Donation.aggregate([{ $match: { status: 'COMPLETED' } }, { $group: { _id: null, quantity: { $sum: '$quantity' } } }]),
      Donation.countDocuments({ status: 'COMPLETED' }),
      User.countDocuments({ role: 'DONOR', verificationStatus: { $in: ['APPROVED', null] }, isActive: true }),
      NGO.countDocuments({ verificationStatus: 'VERIFIED' }),
      Donation.aggregate([{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, donations: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } } } }, { $sort: { _id: 1 } }, { $limit: 30 }])
    ]);
    res.json({ foodPortionsRescued: food[0]?.quantity || 0, completedDonations: completed, verifiedDonors: donors, verifiedNGOs: ngos, donationsOverTime });
  } catch (error) { next(error); }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, password, role = 'donor', phone } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedRole = roleFromRequest(role);
    if (!name || !normalizedEmail || !password) return res.status(400).json({ message: 'Name, email and password are required.' });
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return res.status(400).json({ message: 'Please provide a valid email address.' });
    if (String(password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (!['DONOR', 'NGO'].includes(normalizedRole)) return res.status(400).json({ message: 'Only donor and NGO registration is available.' });
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ message: 'An account with this email already exists.' });

    const user = await User.create({ name: String(name).trim(), email: normalizedEmail, password: await bcrypt.hash(password, 12), phone, role: normalizedRole, verificationStatus: 'PENDING' });
    if (normalizedRole === 'NGO') {
      const ngo = await NGO.create({ userId: user._id, organizationName: user.name, email: user.email, phone, verificationStatus: 'PENDING' });
      const admins = await User.find({ role: 'ADMIN', isActive: true }).select('_id');
      await Promise.all(admins.map(admin => createNotification({ recipient: admin._id, title: 'New NGO registration', message: `${user.name} submitted an NGO profile for verification.`, type: 'NGO_REGISTERED', relatedNGO: ngo._id })));
    } else {
      const admins = await User.find({ role: 'ADMIN', isActive: true }).select('_id');
      await Promise.all(admins.map(admin => createNotification({ recipient: admin._id, title: 'New donor registration', message: `${user.name} is waiting for donor verification.`, type: 'SYSTEM' })));
    }
    res.status(201).json({ token: token(user), user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Incorrect email or password.' });
    res.json({ token: token(user), user: publicUser(user) });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', protect, (req, res) => res.json(publicUser(req.user)));
app.get('/api/verification/status', protect, (req, res) => res.json({ emailVerified: Boolean(req.user.emailVerified), phoneVerified: Boolean(req.user.phoneVerified), emailDeliveryConfigured: emailVerificationDelivery.isConfigured(), phoneDeliveryConfigured: phoneVerificationDelivery.isConfigured() }));
app.post('/api/auth/email-verification/request', protect, async (_req, res) => res.status(503).json({ message: emailVerificationDelivery.isConfigured() ? 'Email verification is temporarily unavailable.' : 'Email verification delivery is not configured. No verification email was sent.' }));
app.post('/api/auth/phone-verification/request', protect, async (_req, res) => res.status(503).json({ message: phoneVerificationDelivery.isConfigured() ? 'Phone verification is temporarily unavailable.' : 'SMS verification delivery is not configured. No text message was sent.' }));
app.post('/api/auth/logout', protect, (_, res) => res.json({ message: 'Signed out successfully.' }));

app.get('/api/notifications', protect, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const notifications = await Notification.find({ userId: req.user._id }).populate('relatedDonationId', 'foodName status').populate('relatedPickupId', 'status').populate('relatedNGOId', 'organizationName').sort({ createdAt: -1 }).limit(limit);
    res.json(notifications.map(publicNotification));
  } catch (error) { next(error); }
});
app.get('/api/notifications/unread-count', protect, async (req, res, next) => {
  try { res.json({ count: await Notification.countDocuments({ userId: req.user._id, isRead: false }) }); } catch (error) { next(error); }
});
app.put('/api/notifications/:id/read', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID.' });
    const notification = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { isRead: true } }, { returnDocument: 'after' });
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json(publicNotification(notification));
  } catch (error) { next(error); }
});
app.put('/api/notifications/read-all', protect, async (req, res, next) => {
  try { const result = await Notification.updateMany({ userId: req.user._id, isRead: false }, { $set: { isRead: true } }); res.json({ updated: result.modifiedCount }); } catch (error) { next(error); }
});
app.delete('/api/notifications/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID.' });
    const result = await Notification.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ message: 'Notification deleted.' });
  } catch (error) { next(error); }
});

app.get('/api/users/me', protect, async (req, res) => res.json(publicUser(req.user)));
app.put('/api/users/me', protect, async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body.phone !== undefined) updates.phone = String(req.body.phone).trim();
    if (req.body.profileImage !== undefined) updates.profileImage = String(req.body.profileImage).trim();
    if (!updates.name && !updates.phone && !updates.profileImage) return res.status(400).json({ message: 'Provide a name, phone, or profile image to update.' });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { returnDocument: 'after', runValidators: true });
    res.json(publicUser(user));
  } catch (error) { next(error); }
});

app.put('/api/users/profile-image', protect, uploadImage.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'An image file is required.' });
    const uploaded = await uploadToCloudinary(req.file.buffer, 'feedingme/users');
    const previous = req.user.profileImageMetadata?.publicId;
    const user = await User.findByIdAndUpdate(req.user._id, { $set: { profileImage: uploaded.url, profileImageMetadata: uploaded } }, { returnDocument: 'after', runValidators: true });
    try { await deleteImage(previous); } catch { /* old media cleanup should not undo a successful profile update */ }
    res.json(publicUser(user));
  } catch (error) { next(error); }
});

app.put('/api/users/change-password', protect, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || String(newPassword).length < 8) return res.status(400).json({ message: 'A current password and a new password of at least 8 characters are required.' });
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) return res.status(401).json({ message: 'Current password is incorrect.' });
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password updated successfully.' });
  } catch (error) { next(error); }
});

const publicNGO = ngo => ngo ? { ...ngo.toJSON(), userId: ngo.userId?.toString?.() || ngo.userId } : null;
function recordVerification(ngo, status, note, actor) {
  ngo.verificationStatus = status;
  ngo.verificationNote = note || undefined;
  ngo.verifiedAt = status === 'VERIFIED' ? new Date() : undefined;
  if (status === 'REJECTED') ngo.rejectionReason = note || 'Verification requirements were not met.';
  else ngo.rejectionReason = undefined;
  ngo.verificationHistory.push({ status, note: note || undefined, actor, createdAt: new Date() });
  if (ngo.verificationHistory.length > 100) ngo.verificationHistory.splice(0, ngo.verificationHistory.length - 100);
}

app.get('/api/ngos/profile', protect, requireRole('NGO'), async (req, res, next) => {
  try { res.json(publicNGO(await NGO.findOne({ userId: req.user._id }))); } catch (error) { next(error); }
});
app.post('/api/ngos/profile', protect, requireRole('NGO'), async (req, res, next) => {
  try {
    const allowed = ['organizationName', 'description', 'registrationNumber', 'contactPerson', 'organizationType', 'phone', 'address', 'city', 'state', 'pincode', 'location', 'serviceRadius', 'serviceArea', 'foodCategoriesAccepted', 'pickupAvailability', 'operatingHours', 'website', 'documents'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    const profile = await NGO.findOne({ userId: req.user._id }) || new NGO({ userId: req.user._id, email: req.user.email });
    Object.assign(profile, updates, { email: req.user.email });
    recordVerification(profile, 'PENDING', 'Verification profile submitted for admin review.', req.user._id);
    await profile.save();
    res.status(201).json(publicNGO(profile));
  } catch (error) { next(error); }
});
app.put('/api/ngos/profile', protect, requireRole('NGO'), async (req, res, next) => {
  try {
    const allowed = ['organizationName', 'description', 'registrationNumber', 'contactPerson', 'organizationType', 'phone', 'address', 'city', 'state', 'pincode', 'location', 'serviceRadius', 'serviceArea', 'foodCategoriesAccepted', 'pickupAvailability', 'operatingHours', 'website', 'documents'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    const profile = await NGO.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: 'NGO profile not found.' });
    Object.assign(profile, updates);
    const nextStatus = profile.verificationStatus === 'VERIFIED' ? 'UNDER_REVIEW' : 'PENDING';
    recordVerification(profile, nextStatus, 'NGO profile updated; admin review is required.', req.user._id);
    await profile.save();
    res.json(publicNGO(profile));
  } catch (error) { next(error); }
});

app.get('/api/ngos/verified', async (_req, res, next) => {
  try {
    const ngos = await NGO.find({ verificationStatus: 'VERIFIED' }).select('organizationName description organizationType city state serviceArea foodCategoriesAccepted pickupAvailability operatingHours verifiedAt userId').sort({ organizationName: 1 });
    const userIds = ngos.map(ngo => ngo.userId);
    const ratings = await Review.aggregate([{ $match: { reviewType: 'DONOR_TO_NGO', revieweeId: { $in: userIds } } }, { $group: { _id: '$revieweeId', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }]);
    const ratingByUser = new Map(ratings.map(item => [item._id.toString(), item]));
    const [completed, pickupStats] = await Promise.all([
      Donation.aggregate([{ $match: { status: 'COMPLETED', acceptedBy: { $in: ngos.map(ngo => ngo._id) } } }, { $group: { _id: '$acceptedBy', completedDonations: { $sum: 1 }, mealsSupported: { $sum: { $cond: [{ $eq: ['$unit', 'meals'] }, '$quantity', 0] } } } }]),
      Pickup.aggregate([{ $match: { ngoId: { $in: ngos.map(ngo => ngo._id) } } }, { $group: { _id: '$ngoId', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } } } }])
    ]);
    const impactByNgo = new Map(completed.map(item => [item._id.toString(), item]));
    const pickupsByNgo = new Map(pickupStats.map(item => [item._id.toString(), item]));
    res.json(ngos.map(ngo => {
      const rating = ratingByUser.get(ngo.userId.toString());
      const impact = impactByNgo.get(ngo._id.toString());
      const pickup = pickupsByNgo.get(ngo._id.toString());
      return { id: ngo.id, organizationName: ngo.organizationName, description: ngo.description, organizationType: ngo.organizationType, city: ngo.city, state: ngo.state, serviceArea: ngo.serviceArea, foodCategoriesAccepted: ngo.foodCategoriesAccepted, pickupAvailability: ngo.pickupAvailability, operatingHours: ngo.operatingHours, verificationStatus: 'VERIFIED', verifiedAt: ngo.verifiedAt, completedDonations: impact?.completedDonations || 0, mealsSupported: impact?.mealsSupported || 0, pickupCompletionRate: pickup?.total ? Math.round((pickup.completed / pickup.total) * 100) : null, averageFoodExperienceRating: rating?.averageRating ? Math.round(rating.averageRating * 10) / 10 : null, reviewCount: rating?.reviewCount || 0 };
    }));
  } catch (error) { next(error); }
});

app.get('/api/admin/ngos', protect, requireRole('ADMIN'), async (_, res, next) => { try { res.json((await NGO.find().sort({ createdAt: -1 })).map(publicNGO)); } catch (error) { next(error); } });
app.get('/api/admin/ngos/pending', protect, requireRole('ADMIN'), async (_, res, next) => { try { res.json((await NGO.find({ verificationStatus: { $in: ['PENDING', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED'] } }).sort({ createdAt: -1 })).map(publicNGO)); } catch (error) { next(error); } });
app.get('/api/admin/ngos/:id/verification-history', protect, requireRole('ADMIN'), async (req, res, next) => {
  try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid NGO ID.' }); const ngo = await NGO.findById(req.params.id).select('verificationHistory'); if (!ngo) return res.status(404).json({ message: 'NGO not found.' }); res.json(ngo.verificationHistory); } catch (error) { next(error); }
});
app.put('/api/admin/ngos/:id/under-review', protect, requireRole('ADMIN'), async (req, res, next) => {
  try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid NGO ID.' }); const ngo = await NGO.findById(req.params.id); if (!ngo) return res.status(404).json({ message: 'NGO not found.' }); const note = String(req.body.note || '').trim(); recordVerification(ngo, 'UNDER_REVIEW', note || 'Application is under review.', req.user._id); await ngo.save(); await audit(req.user._id, 'ADMIN_STARTED_NGO_REVIEW', 'NGO', ngo._id, { note }); res.json(publicNGO(ngo)); } catch (error) { next(error); }
});
app.put('/api/admin/ngos/:id/verify', protect, requireRole('ADMIN'), async (req, res, next) => {
  try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid NGO ID.' }); const ngo = await NGO.findById(req.params.id); if (!ngo) return res.status(404).json({ message: 'NGO not found.' }); const note = String(req.body.note || '').trim(); recordVerification(ngo, 'VERIFIED', note || 'Approved by an administrator.', req.user._id); await ngo.save(); await audit(req.user._id, 'ADMIN_VERIFIED_NGO', 'NGO', ngo._id, { note }); await notify(ngo.userId, 'NGO verified', 'Your NGO profile has been verified. You can now accept donations.', 'NGO_VERIFIED', undefined, undefined, ngo._id); res.json(publicNGO(ngo)); } catch (error) { next(error); }
});
app.put('/api/admin/ngos/:id/reject', protect, requireRole('ADMIN'), async (req, res, next) => {
  try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid NGO ID.' }); const reason = String(req.body.reason || 'Verification requirements were not met.').trim(); if (reason.length > 1000) return res.status(400).json({ message: 'Verification notes must be 1,000 characters or fewer.' }); const ngo = await NGO.findById(req.params.id); if (!ngo) return res.status(404).json({ message: 'NGO not found.' }); recordVerification(ngo, 'REJECTED', reason, req.user._id); await ngo.save(); await audit(req.user._id, 'ADMIN_REJECTED_NGO', 'NGO', ngo._id, { reason }); await notify(ngo.userId, 'NGO verification update', `Your NGO profile was rejected. Reason: ${reason}`, 'NGO_REJECTED', undefined, undefined, ngo._id); res.json(publicNGO(ngo)); } catch (error) { next(error); }
});
app.put('/api/admin/ngos/:id/request-info', protect, requireRole('ADMIN'), async (req, res, next) => {
  try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid NGO ID.' }); const note = String(req.body.note || '').trim(); if (!note || note.length > 1000) return res.status(400).json({ message: 'A verification note of 1,000 characters or fewer is required.' }); const ngo = await NGO.findById(req.params.id); if (!ngo) return res.status(404).json({ message: 'NGO not found.' }); recordVerification(ngo, 'MORE_INFORMATION_REQUIRED', note, req.user._id); await ngo.save(); await audit(req.user._id, 'ADMIN_REQUESTED_NGO_INFORMATION', 'NGO', ngo._id, { note }); await notify(ngo.userId, 'NGO information requested', note, 'NGO_INFO_REQUIRED', undefined, undefined, ngo._id); res.json(publicNGO(ngo)); } catch (error) { next(error); }
});

app.get('/api/admin/donors', protect, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const filter = { role: 'DONOR' };
    if (req.query.status) filter.verificationStatus = String(req.query.status).toUpperCase();
    if (req.query.search) { const search = String(req.query.search).trim(); filter.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }]; }
    const [items, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(filter)]);
    res.json({ items: items.map(publicUser), page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});
app.get('/api/admin/donors/pending', protect, requireRole('ADMIN'), async (_, res, next) => {
  try { res.json((await User.find({ role: 'DONOR', verificationStatus: 'PENDING' }).sort({ createdAt: -1 })).map(publicUser)); } catch (error) { next(error); }
});
app.put('/api/admin/donors/:id/verify', protect, requireRole('ADMIN'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donor ID.' });
    const donor = await User.findOneAndUpdate({ _id: req.params.id, role: 'DONOR' }, { $set: { verificationStatus: 'APPROVED' } }, { returnDocument: 'after' });
    if (!donor) return res.status(404).json({ message: 'Donor not found.' });
    await audit(req.user._id, 'ADMIN_VERIFIED_DONOR', 'USER', donor._id);
    await notify(donor._id, 'Donor account approved', 'Your donor account has been approved. You can now create food donations.', 'DONOR_VERIFIED');
    res.json(publicUser(donor));
  } catch (error) { next(error); }
});
app.put('/api/admin/donors/:id/reject', protect, requireRole('ADMIN'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donor ID.' });
    const donor = await User.findOneAndUpdate({ _id: req.params.id, role: 'DONOR' }, { $set: { verificationStatus: 'REJECTED' } }, { returnDocument: 'after' });
    if (!donor) return res.status(404).json({ message: 'Donor not found.' });
    await audit(req.user._id, 'ADMIN_REJECTED_DONOR', 'USER', donor._id);
    await notify(donor._id, 'Donor account requires verification', 'Your donor account has not been approved. Please review your account details and contact support.', 'DONOR_REJECTED');
    res.json(publicUser(donor));
  } catch (error) { next(error); }
});

app.get('/api/donations', optionalAuth(secret), async (req, res, next) => {
  try {
    await expireAvailableDonations();
    const filter = req.query.status ? { status: String(req.query.status).toUpperCase() } : {};
    if (req.user?.role === 'NGO') {
      req.ngo = await NGO.findOne({ userId: req.user._id, verificationStatus: 'VERIFIED' }).select('_id');
    }
    const donations = await Donation.find(req.ngo ? { ...filter, 'ngoRejections.ngoId': { $ne: req.ngo._id } } : filter).populate('donorId', 'name').populate('acceptedBy', 'organizationName').sort({ createdAt: -1 });
    res.json(donations.map(donation => publicDonationListing(donation, req)));
  } catch (error) { next(error); }
});

app.get('/api/donations/my', protect, requireRole('DONOR'), async (req, res, next) => {
  try { await expireAvailableDonations(); const donations = await Donation.find({ donorId: req.user._id }).populate('acceptedBy', 'organizationName').sort({ createdAt: -1 }); res.json(donations.map(publicDonation)); }
  catch (error) { next(error); }
});

app.get('/api/donations/available', protect, requireVerifiedNGO, async (req, res, next) => {
  try {
    await expireAvailableDonations();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const filter = { status: 'AVAILABLE', expiryTime: { $gt: new Date() }, 'ngoRejections.ngoId': { $ne: req.ngo._id } };
    if (req.query.category) filter.category = String(req.query.category).toUpperCase();
    const [items, total] = await Promise.all([Donation.find(filter).populate('donorId', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Donation.countDocuments(filter)]);
    res.json({ donations: items.map(publicDonation), page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

app.post('/api/donations/:id/accept', protect, requireVerifiedNGO, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const now = new Date();
    const donation = await Donation.findOneAndUpdate({ _id: req.params.id, status: 'AVAILABLE', expiryTime: { $gt: now } }, { $set: { status: 'ACCEPTED', acceptedBy: req.ngo._id, acceptedAt: now } }, { returnDocument: 'after' }).populate('donorId', 'name');
    if (!donation) {
      const existing = await Donation.findById(req.params.id).select('status expiryTime');
      if (!existing) return res.status(404).json({ message: 'Donation not found.' });
      if (existing.status === 'AVAILABLE' && existing.expiryTime <= now) { await Donation.updateOne({ _id: existing._id, status: 'AVAILABLE' }, { $set: { status: 'EXPIRED' } }); return res.status(410).json({ message: 'Donation has expired.' }); }
      return res.status(409).json({ message: 'Donation has already been accepted.' });
    }
    await notify(donation.donorId._id, 'Donation accepted', `${req.ngo.organizationName} accepted your ${donation.foodName} donation.`, 'DONATION_ACCEPTED', donation._id);
    await notify(req.user._id, 'Donation accepted', `You accepted ${donation.foodName}.`, 'DONATION_ACCEPTED', donation._id);
    res.json(publicDonation(donation));
  } catch (error) { next(error); }
});

app.post('/api/donations/:id/cancel', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ message: 'Donation not found.' });
    const isDonor = donation.donorId.toString() === req.user._id.toString();
    const isAcceptedNGO = req.user.role === 'NGO' && donation.acceptedBy?.toString() === (await NGO.findOne({ userId: req.user._id }))?._id?.toString();
    if (!isDonor && !isAcceptedNGO) return res.status(403).json({ message: 'You are not authorized to cancel this donation.' });
    if (!['AVAILABLE', 'ACCEPTED'].includes(donation.status)) return res.status(400).json({ message: 'This donation can no longer be cancelled.' });
    donation.status = isAcceptedNGO ? 'AVAILABLE' : 'CANCELLED';
    if (isAcceptedNGO) { donation.acceptedBy = undefined; donation.acceptedAt = undefined; }
    await donation.save();
    res.json(publicDonation(donation));
  } catch (error) { next(error); }
});

app.get('/api/donations/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const donation = await Donation.findById(req.params.id).populate('donorId', 'name').populate('acceptedBy', 'organizationName');
    if (!donation) return res.status(404).json({ message: 'Donation not found.' });
    const ownsDonation = donation.donorId?._id?.toString() === req.user._id.toString() || donation.donorId?.toString() === req.user._id.toString();
    const ngo = req.user.role === 'NGO' ? await NGO.findOne({ userId: req.user._id, verificationStatus: 'VERIFIED' }).select('_id') : null;
    const isAvailableForNGO = ngo && donation.status === 'AVAILABLE';
    const isAssignedNGO = ngo && donation.acceptedBy?._id?.toString() === ngo._id.toString();
    if (!ownsDonation && !isAvailableForNGO && !isAssignedNGO && req.user.role !== 'ADMIN') return res.status(403).json({ message: 'You do not have permission to view this donation.' });
    res.json(publicDonation(donation));
  } catch (error) { next(error); }
});

app.post('/api/donations', protect, requireApprovedDonor, uploadImage.single('image'), async (req, res, next) => {
  let uploaded;
  try {
    const { foodName, foodType, category, quantity, unit, quantityUnit, servings, expiryTime, preparedAt, packagingInformation, pickupLocation, pickupAddress, latitude, longitude, description, imageUrl } = req.body;
    const expiry = new Date(expiryTime);
    const preparation = preparedAt ? new Date(preparedAt) : undefined;
    const address = pickupAddress || pickupLocation;
    if (!foodName || !foodType || !quantity || !unit || !address || !expiryTime) return res.status(400).json({ message: 'Please complete all required donation details.' });
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return res.status(400).json({ message: 'Quantity must be a positive number.' });
    if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) return res.status(400).json({ message: 'Expiry time must be in the future.' });
    if (preparation && (Number.isNaN(preparation.getTime()) || preparation > new Date())) return res.status(400).json({ message: 'Preparation time must be a valid time in the past.' });
    const hasCoordinates = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
    if (req.file) uploaded = await uploadToCloudinary(req.file.buffer, 'feedingme/donations');
    const donation = await Donation.create({ donorId: req.user._id, foodName, foodType, category: category || 'OTHER', quantity: Number(quantity), unit, quantityUnit: quantityUnit || unit, servings: servings ? Number(servings) : undefined, preparedAt: preparation, packagingInformation, expiryTime: expiry, pickupAddress: address, pickupLocation: hasCoordinates ? { latitude: Number(latitude), longitude: Number(longitude) } : undefined, location: hasCoordinates ? { type: 'Point', coordinates: [Number(longitude), Number(latitude)] } : undefined, description, imageUrl: uploaded?.url || imageUrl, image: uploaded });
    await notify(req.user._id, 'Donation created', `${foodName} is now available for verified NGOs.`, 'DONATION_CREATED', donation._id);
    res.status(201).json(publicDonation(await donation.populate('donorId', 'name')));
  } catch (error) { if (uploaded?.publicId) await deleteImage(uploaded.publicId).catch(() => {}); next(error); }
});

app.post('/api/donations/:id/reject', protect, requireVerifiedNGO, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const reason = String(req.body.reason || '').trim();
    if (!reason || reason.length > 1000) return res.status(400).json({ message: 'A reason of 1,000 characters or fewer is required.' });
    const donation = await Donation.findOne({ _id: req.params.id, status: 'AVAILABLE', expiryTime: { $gt: new Date() }, 'ngoRejections.ngoId': { $ne: req.ngo._id } });
    if (!donation) return res.status(409).json({ message: 'This donation is no longer available to review.' });
    donation.ngoRejections.push({ ngoId: req.ngo._id, userId: req.user._id, reason, createdAt: new Date() });
    await donation.save();
    await notify(donation.donorId, 'Donation update', 'An NGO reviewed this listing and passed. Your donation remains available to other verified partners.', 'SYSTEM', donation._id);
    res.json({ message: 'Feedback recorded; the donation remains available to other verified NGOs.' });
  } catch (error) { next(error); }
});

app.post('/api/donations/:id/report', protect, requireVerifiedNGO, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const reason = String(req.body.reason || '').trim();
    if (!reason || reason.length > 1000) return res.status(400).json({ message: 'A report reason of 1,000 characters or fewer is required.' });
    const donation = await Donation.findOne({ _id: req.params.id, acceptedBy: req.ngo._id, status: { $in: ['ACCEPTED', 'PICKUP_SCHEDULED', 'PICKUP_IN_PROGRESS', 'COLLECTED'] } });
    if (!donation) return res.status(404).json({ message: 'Only the NGO assigned to an active donation can report it.' });
    if (donation.issueReport?.reportedAt && !donation.issueReport?.resolvedAt) return res.status(409).json({ message: 'This donation already has an open report.' });
    donation.issueReport = { reportedBy: req.user._id, reason, reportedAt: new Date() };
    await donation.save();
    const admins = await User.find({ role: 'ADMIN', isActive: true }).select('_id');
    await Promise.all([
      notify(donation.donorId, 'NGO reported a food issue', `${donation.foodName}: ${reason}. Please review and respond from your donor dashboard.`, 'FOOD_ISSUE_REPORTED', donation._id),
      ...admins.map(admin => notify(admin._id, 'Food issue reported', `${donation.foodName}: ${reason}`, 'FOOD_ISSUE_REPORTED', donation._id))
    ]);
    await audit(req.user._id, 'NGO_REPORTED_FOOD_ISSUE', 'DONATION', donation._id, { reason });
    res.status(201).json(publicDonation(donation));
  } catch (error) { next(error); }
});

app.put('/api/donations/:id/report/respond', protect, requireRole('DONOR'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const response = String(req.body.response || '').trim();
    if (response.length < 4 || response.length > 1000) return res.status(400).json({ message: 'Write a response between 4 and 1,000 characters.' });
    const donation = await Donation.findOne({ _id: req.params.id, donorId: req.user._id }).populate('acceptedBy', 'organizationName');
    if (!donation?.issueReport?.reportedAt) return res.status(404).json({ message: 'Food issue report not found.' });
    if (donation.issueReport.resolvedAt) return res.status(409).json({ message: 'This food issue has already been resolved.' });
    donation.issueReport.donorResponse = response;
    donation.issueReport.donorRespondedAt = new Date();
    donation.issueReport.resolutionNote = response;
    donation.issueReport.resolvedAt = new Date();
    await donation.save();
    await notify(donation.issueReport.reportedBy, 'Donor responded to food issue', `${donation.foodName}: ${response}`, 'SYSTEM', donation._id);
    await audit(req.user._id, 'DONOR_RESOLVED_FOOD_REPORT', 'DONATION', donation._id, { response });
    res.json(publicDonation(donation));
  } catch (error) { next(error); }
});

app.put('/api/donations/:id/food-review', protect, requireVerifiedNGO, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const { foodCondition, packagingCondition, quantityAccuracy, comments = '' } = req.body;
    if (!['GOOD', 'NEEDS_ATTENTION', 'NOT_ACCEPTABLE'].includes(foodCondition) || !['GOOD', 'NEEDS_ATTENTION', 'POOR'].includes(packagingCondition) || !['CORRECT', 'DIFFERENT'].includes(quantityAccuracy) || String(comments).length > 1000) return res.status(400).json({ message: 'Choose valid food, packaging, and quantity review values.' });
    const donation = await Donation.findOne({ _id: req.params.id, acceptedBy: req.ngo._id, status: { $in: ['COLLECTED', 'COMPLETED'] } });
    if (!donation) return res.status(404).json({ message: 'A food review is available only to the assigned NGO after pickup.' });
    if (donation.foodReview?.reviewedAt) return res.status(409).json({ message: 'A food review has already been recorded for this donation.' });
    donation.foodReview = { reviewedBy: req.user._id, foodCondition, packagingCondition, quantityAccuracy, comments: String(comments).trim(), reviewedAt: new Date() };
    await donation.save();
    await notify(donation.donorId, 'Donation condition reviewed', `The receiving NGO recorded a condition review for ${donation.foodName}.`, 'SYSTEM', donation._id);
    res.status(201).json(publicDonation(donation));
  } catch (error) { next(error); }
});

app.post('/api/donations/:id/reviews', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const donation = await Donation.findOne({ _id: req.params.id, status: 'COMPLETED' }).populate('acceptedBy', 'userId organizationName');
    if (!donation) return res.status(409).json({ message: 'Reviews can only be submitted for completed donations.' });
    let revieweeId; let reviewType;
    if (req.user.role === 'DONOR' && donation.donorId.toString() === req.user._id.toString() && donation.acceptedBy?.userId) { revieweeId = donation.acceptedBy.userId; reviewType = 'DONOR_TO_NGO'; }
    else if (req.user.role === 'NGO' && donation.acceptedBy?.userId?.toString() === req.user._id.toString()) { revieweeId = donation.donorId; reviewType = 'NGO_TO_DONOR'; }
    else return res.status(403).json({ message: 'Only the donor and assigned NGO can review this completed donation.' });
    const rating = Number(req.body.rating);
    const communication = Number(req.body.communication);
    const timeliness = Number(req.body.timeliness);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !Number.isInteger(communication) || communication < 1 || communication > 5 || !Number.isInteger(timeliness) || timeliness < 1 || timeliness > 5) return res.status(400).json({ message: 'Ratings must be whole numbers from 1 to 5.' });
    const comment = String(req.body.comment || '').trim(); const thankYouMessage = String(req.body.thankYouMessage || '').trim();
    if (comment.length > 1000 || thankYouMessage.length > 500) return res.status(400).json({ message: 'Review text exceeds the allowed length.' });
    if (reviewType === 'NGO_TO_DONOR' && (!['GOOD', 'NEEDS_ATTENTION', 'NOT_ACCEPTABLE'].includes(req.body.foodCondition) || !['GOOD', 'NEEDS_ATTENTION', 'POOR'].includes(req.body.packagingCondition) || !['CORRECT', 'DIFFERENT'].includes(req.body.quantityAccuracy))) return res.status(400).json({ message: 'A food-condition, packaging, and quantity review is required.' });
    const review = await Review.create({ donationId: donation._id, reviewerId: req.user._id, revieweeId, reviewType, rating, communication, timeliness, ...(reviewType === 'NGO_TO_DONOR' ? { foodCondition: req.body.foodCondition, packagingCondition: req.body.packagingCondition, quantityAccuracy: req.body.quantityAccuracy, thankYouMessage } : {}), comment });
    await notify(revieweeId, thankYouMessage ? 'A thank-you from your partner' : 'A donation review is ready', thankYouMessage || `A ${rating}-star review was added for ${donation.foodName}.`, 'REVIEW_RECEIVED', donation._id);
    res.status(201).json(review);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'You have already reviewed this donation.' });
    next(error);
  }
});

app.get('/api/donations/:id/reviews', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const donation = await Donation.findById(req.params.id).populate('acceptedBy', 'userId');
    if (!donation) return res.status(404).json({ message: 'Donation not found.' });
    const isDonor = donation.donorId.toString() === req.user._id.toString();
    const isAssignedNGO = req.user.role === 'NGO' && donation.acceptedBy?.userId?.toString() === req.user._id.toString();
    if (!isDonor && !isAssignedNGO && req.user.role !== 'ADMIN') return res.status(403).json({ message: 'You cannot view reviews for this donation.' });
    const reviews = await Review.find({ donationId: donation._id }).populate('reviewerId', 'name role').populate('revieweeId', 'name role').sort({ createdAt: 1 });
    res.json(reviews);
  } catch (error) { next(error); }
});

app.get('/api/admin/food-reports', protect, requireRole('ADMIN'), async (_req, res, next) => {
  try { const donations = await Donation.find({ 'issueReport.reportedAt': { $exists: true } }).populate('donorId', 'name').populate('acceptedBy', 'organizationName').populate('issueReport.reportedBy', 'name').sort({ 'issueReport.reportedAt': -1 }).limit(100); res.json(donations.map(publicDonation)); } catch (error) { next(error); }
});

app.put('/api/admin/donations/:id/report/resolve', protect, requireRole('ADMIN'), async (req, res, next) => {
  try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' }); const resolutionNote = String(req.body.note || '').trim(); if (!resolutionNote || resolutionNote.length > 1000) return res.status(400).json({ message: 'A resolution note of 1,000 characters or fewer is required.' }); const donation = await Donation.findById(req.params.id); if (!donation?.issueReport?.reportedAt) return res.status(404).json({ message: 'Food report not found.' }); donation.issueReport.resolvedAt = new Date(); donation.issueReport.resolutionNote = resolutionNote; await donation.save(); await audit(req.user._id, 'ADMIN_RESOLVED_FOOD_REPORT', 'DONATION', donation._id, { resolutionNote }); res.json(publicDonation(donation)); } catch (error) { next(error); }
});

app.get('/api/ngos/nearby', protect, async (req, res, next) => {
  try {
    const latitude = Number(req.query.latitude); const longitude = Number(req.query.longitude); const radius = Math.min(Math.max(Number(req.query.radius) || 25, 1), 100);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ message: 'Latitude and longitude are required.' });
    const ngos = await NGO.find({ verificationStatus: 'VERIFIED', 'location.latitude': { $exists: true }, 'location.longitude': { $exists: true } }).select('organizationName address city location serviceRadius');
    const toRadians = value => value * Math.PI / 180;
    const nearby = ngos.map(ngo => { const dLat = toRadians(ngo.location.latitude - latitude); const dLon = toRadians(ngo.location.longitude - longitude); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(latitude)) * Math.cos(toRadians(ngo.location.latitude)) * Math.sin(dLon / 2) ** 2; const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return { id: ngo.id, organizationName: ngo.organizationName, city: ngo.city, serviceRadius: ngo.serviceRadius, location: { latitude: Math.round(ngo.location.latitude * 100) / 100, longitude: Math.round(ngo.location.longitude * 100) / 100 }, distanceKm: Math.round(distanceKm * 10) / 10 }; }).filter(ngo => ngo.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm);
    res.json(nearby);
  } catch (error) { next(error); }
});

app.patch('/api/donations/:id/status', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid donation ID.' });
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ message: 'Donation not found.' });
    const requested = String(req.body.status || '').toUpperCase();
    const transitions = {
      AVAILABLE: ['CANCELLED', 'ACCEPTED'], ACCEPTED: ['PICKUP_ASSIGNED', 'CANCELLED'], PICKUP_ASSIGNED: ['PICKED_UP'], PICKED_UP: ['COMPLETED'], REQUESTED: ['ACCEPTED', 'REJECTED'], REJECTED: [], CANCELLED: [], COMPLETED: [], EXPIRED: []
    };
    if (!transitions[donation.status]?.includes(requested)) return res.status(400).json({ message: `Cannot change ${donation.status} to ${requested}.` });
    if (donation.donorId.toString() === req.user._id.toString() && !['CANCELLED'].includes(requested)) return res.status(403).json({ message: 'Donors can only cancel their own available donations.' });
    if (req.user.role !== 'NGO' && requested !== 'CANCELLED') return res.status(403).json({ message: 'Only an NGO can progress a donation.' });
    if (req.user.role === 'NGO') {
      const ngo = await NGO.findOne({ userId: req.user._id });
      if (!ngo || ngo.verificationStatus !== 'VERIFIED') return res.status(403).json({ message: 'Only verified NGOs can accept donations.' });
      if (requested === 'ACCEPTED') { if (donation.expiryTime <= new Date()) { donation.status = 'EXPIRED'; await donation.save(); return res.status(400).json({ message: 'This donation has expired.' }); } donation.acceptedBy = ngo._id; donation.acceptedAt = new Date(); }
    }
    donation.status = requested;
    if (requested === 'COMPLETED') donation.completedAt = new Date();
    await donation.save();
    res.json(publicDonation(await donation.populate([{ path: 'donorId', select: 'name' }, { path: 'acceptedBy', select: 'organizationName' }])));
  } catch (error) { next(error); }
});

app.post('/api/pickups', protect, requireVerifiedNGO, async (req, res, next) => {
  try {
    const { donationId, scheduledDate, scheduledTime, notes, pickupAddress, pickupLocation } = req.body;
    if (!mongoose.isValidObjectId(donationId)) return res.status(400).json({ message: 'A valid donation is required.' });
    if (!scheduledDate || !scheduledTime) return res.status(400).json({ message: 'Pickup date and time are required.' });
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) return res.status(400).json({ message: 'Pickup must be scheduled for a future time.' });
    const donation = await Donation.findOneAndUpdate({ _id: donationId, status: 'ACCEPTED', acceptedBy: req.ngo._id, expiryTime: { $gt: new Date() } }, { $set: { status: 'PICKUP_SCHEDULED' } }, { returnDocument: 'after' });
    if (!donation) return res.status(409).json({ message: 'Only the NGO that accepted an active donation can schedule its pickup.' });
    const pickup = await Pickup.create({ donationId: donation._id, donorId: donation.donorId, ngoId: req.ngo._id, pickupAddress: pickupAddress || donation.pickupAddress, pickupLocation: pickupLocation || donation.pickupLocation, scheduledAt, status: 'SCHEDULED', notes });
    await notify(donation.donorId, 'Pickup scheduled', `Pickup for ${donation.foodName} is scheduled for ${scheduledAt.toLocaleString()}.`, 'PICKUP_SCHEDULED', donation._id, pickup._id);
    await notify(req.user._id, 'Pickup scheduled', `Pickup for ${donation.foodName} is scheduled.`, 'PICKUP_SCHEDULED', donation._id, pickup._id);
    res.status(201).json(publicPickup(await pickup.populate([{ path: 'donationId', select: 'foodName status' }, { path: 'ngoId', select: 'organizationName' }])));
  } catch (error) { next(error); }
});

async function pickupList(req, res, next, filter) {
  try {
    const query = { ...filter };
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const [items, total] = await Promise.all([Pickup.find(query).populate('donationId', 'foodName status').populate('ngoId', 'organizationName').populate('donorId', 'name').sort({ scheduledAt: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit), Pickup.countDocuments(query)]);
    res.json({ pickups: items.map(publicPickup), page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
}

app.get('/api/pickups/my', protect, requireRole('DONOR'), (req, res, next) => pickupList(req, res, next, { donorId: req.user._id }));
app.get('/api/pickups/ngo', protect, requireVerifiedNGO, (req, res, next) => pickupList(req, res, next, { ngoId: req.ngo._id }));
app.get('/api/admin/pickups', protect, requireRole('ADMIN'), (req, res, next) => pickupList(req, res, next, {}));

app.get('/api/pickups/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid pickup ID.' });
    const pickup = await Pickup.findById(req.params.id).populate('donationId', 'foodName status').populate('ngoId', 'organizationName userId').populate('donorId', 'name');
    if (!pickup) return res.status(404).json({ message: 'Pickup not found.' });
    const allowed = req.user.role === 'ADMIN' || pickup.donorId._id.toString() === req.user._id.toString() || pickup.ngoId.userId.toString() === req.user._id.toString();
    if (!allowed) return res.status(403).json({ message: 'You are not authorized to view this pickup.' });
    res.json(publicPickup(pickup));
  } catch (error) { next(error); }
});

app.put('/api/pickups/:id/tracking', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid pickup ID.' });
    const pickup = await Pickup.findById(req.params.id).populate('ngoId', 'userId');
    if (!pickup) return res.status(404).json({ message: 'Pickup not found.' });
    if (req.user.role !== 'NGO' || pickup.ngoId.userId.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Only the assigned NGO can share pickup location.' });
    if (pickup.status !== 'IN_PROGRESS') return res.status(409).json({ message: 'Live location sharing is available only while a pickup is in progress.' });
    const enabled = req.body.enabled === true;
    if (!enabled) {
      pickup.trackingEnabled = false;
      pickup.trackingLocation = undefined;
      pickup.trackingStoppedAt = new Date();
      await pickup.save();
      return res.json(publicPickup(pickup));
    }
    const latitude = Number(req.body.latitude); const longitude = Number(req.body.longitude); const accuracy = req.body.accuracy == null ? undefined : Number(req.body.accuracy);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000))) return res.status(400).json({ message: 'A valid current location is required to share tracking.' });
    const recordedAt = new Date();
    if (pickup.trackingLocation?.recordedAt && recordedAt - pickup.trackingLocation.recordedAt < 5000) return res.status(429).json({ message: 'Location updates are limited to one every five seconds.' });
    if (!pickup.trackingEnabled) pickup.trackingStartedAt = recordedAt;
    pickup.trackingEnabled = true;
    pickup.trackingLocation = { latitude, longitude, accuracy, recordedAt };
    pickup.trackingStoppedAt = undefined;
    await pickup.save();
    res.json(publicPickup(pickup));
  } catch (error) { next(error); }
});

app.put('/api/pickups/:id/status', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid pickup ID.' });
    const pickup = await Pickup.findById(req.params.id).populate('donationId').populate('ngoId', 'organizationName userId');
    if (!pickup) return res.status(404).json({ message: 'Pickup not found.' });
    const authorized = req.user.role === 'ADMIN' || pickup.ngoId.userId.toString() === req.user._id.toString();
    if (!authorized) return res.status(403).json({ message: 'Only the assigned NGO or an admin can update this pickup.' });
    const nextStatus = String(req.body.status || '').toUpperCase();
    const transitions = { PENDING: ['SCHEDULED', 'CANCELLED'], SCHEDULED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COLLECTED'], COLLECTED: ['COMPLETED'], COMPLETED: [], CANCELLED: [] };
    if (!transitions[pickup.status]?.includes(nextStatus)) return res.status(400).json({ message: `Cannot change pickup from ${pickup.status} to ${nextStatus}.` });
    const donationStatus = { IN_PROGRESS: 'PICKUP_IN_PROGRESS', COLLECTED: 'COLLECTED', COMPLETED: 'COMPLETED' }[nextStatus];
    if (donationStatus) { pickup.donationId.status = donationStatus; if (nextStatus === 'COLLECTED') pickup.collectedAt = new Date(); if (nextStatus === 'COMPLETED') pickup.completedAt = new Date(); await pickup.donationId.save(); }
    pickup.status = nextStatus;
    if (['COLLECTED', 'COMPLETED', 'CANCELLED'].includes(nextStatus)) { pickup.trackingEnabled = false; pickup.trackingLocation = undefined; pickup.trackingStoppedAt = new Date(); }
    await pickup.save();
    const notificationType = { IN_PROGRESS: 'PICKUP_STARTED', COLLECTED: 'PICKUP_COLLECTED', COMPLETED: 'PICKUP_COMPLETED' }[nextStatus];
    await notify(pickup.donorId, `Pickup ${nextStatus.toLowerCase()}`, `The pickup for ${pickup.donationId.foodName} is now ${nextStatus.toLowerCase().replace('_', ' ')}.`, notificationType, pickup.donationId._id, pickup._id);
    if (nextStatus === 'COMPLETED') await notify(pickup.ngoId.userId, 'Donation completed', `${pickup.donationId.foodName} has been completed.`, 'PICKUP_COMPLETED', pickup.donationId._id, pickup._id);
    res.json(publicPickup(await pickup.populate([{ path: 'donationId', select: 'foodName status' }, { path: 'ngoId', select: 'organizationName' }])));
  } catch (error) { next(error); }
});

app.get('/api/dashboard', protect, async (req, res, next) => {
  try {
    await expireAvailableDonations();
    const filter = req.user.role === 'DONOR' ? { donorId: req.user._id } : {};
    const donations = await Donation.find(filter);
    res.json({ total: donations.length, available: donations.filter(item => item.status === 'AVAILABLE').length, completed: donations.filter(item => item.status === 'COMPLETED').length, meals: donations.reduce((sum, item) => sum + (item.unit === 'meals' ? item.quantity : 0), 0), recent: donations.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map(publicDonation) });
  } catch (error) { next(error); }
});

app.get('/api/admin/dashboard/stats', protect, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const range = dateRange(req.query);
    const [users, donorVerification, ngos, donations, pickups, impact] = await Promise.all([
      User.aggregate([{ $match: range }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { ...range, role: 'DONOR' } }, { $group: { _id: { $ifNull: ['$verificationStatus', 'APPROVED'] }, count: { $sum: 1 } } }]),
      NGO.aggregate([{ $match: range }, { $group: { _id: '$verificationStatus', count: { $sum: 1 } } }]),
      Donation.aggregate([{ $match: range }, { $group: { _id: '$status', count: { $sum: 1 }, quantity: { $sum: '$quantity' } } }]),
      Pickup.aggregate([{ $match: range }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Donation.aggregate([{ $match: range }, { $group: { _id: null, totalQuantity: { $sum: '$quantity' }, completedQuantity: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$quantity', 0] } } } }])
    ]);
    const mapCounts = records => Object.fromEntries(records.map(record => [record._id, record.count]));
    const userCounts = mapCounts(users); const donorCounts = mapCounts(donorVerification); const ngoCounts = mapCounts(ngos); const donationCounts = mapCounts(donations); const pickupCounts = mapCounts(pickups);
    res.json({ users: { total: users.reduce((sum, item) => sum + item.count, 0), donors: userCounts.DONOR || 0, pendingDonors: donorCounts.PENDING || 0, verifiedDonors: donorCounts.APPROVED || 0, rejectedDonors: donorCounts.REJECTED || 0, ngos: userCounts.NGO || 0, admins: userCounts.ADMIN || 0 }, donors: { total: userCounts.DONOR || 0, pending: donorCounts.PENDING || 0, verified: donorCounts.APPROVED || 0, rejected: donorCounts.REJECTED || 0 }, ngos: { total: ngos.reduce((sum, item) => sum + item.count, 0), pending: ngoCounts.PENDING || 0, verified: ngoCounts.VERIFIED || 0, rejected: ngoCounts.REJECTED || 0 }, donations: { total: donations.reduce((sum, item) => sum + item.count, 0), available: donationCounts.AVAILABLE || 0, accepted: donationCounts.ACCEPTED || 0, completed: donationCounts.COMPLETED || 0, expired: donationCounts.EXPIRED || 0, cancelled: donationCounts.CANCELLED || 0 }, pickups: { total: pickups.reduce((sum, item) => sum + item.count, 0), active: (pickupCounts.PENDING || 0) + (pickupCounts.SCHEDULED || 0) + (pickupCounts.IN_PROGRESS || 0), completed: pickupCounts.COMPLETED || 0 }, impact: impact[0] || { totalQuantity: 0, completedQuantity: 0 } });
  } catch (error) { next(error); }
});

app.get('/api/admin/analytics', protect, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const range = dateRange(req.query); const match = Object.keys(range).length ? range : {};
    const [donationsOverTime, donationStatuses, categories, usersOverTime, pickupsByStatus, ngosByStatus] = await Promise.all([
      Donation.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, donations: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, expired: { $sum: { $cond: [{ $eq: ['$status', 'EXPIRED'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } } } }, { $sort: { _id: 1 } }]),
      Donation.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Donation.aggregate([{ $match: match }, { $group: { _id: '$category', quantity: { $sum: '$quantity' }, count: { $sum: 1 } } }, { $sort: { quantity: -1 } }]),
      User.aggregate([{ $match: match }, { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, role: '$role' }, count: { $sum: 1 } } }, { $sort: { '_id.date': 1 } }]),
      Pickup.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      NGO.aggregate([{ $match: match }, { $group: { _id: '$verificationStatus', count: { $sum: 1 } } }])
    ]);
    res.json({ donationsOverTime, donationStatuses, categories, usersOverTime, pickupsByStatus, ngosByStatus });
  } catch (error) { next(error); }
});

app.get('/api/admin/users', protect, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100); const filter = {};
    if (req.query.role) filter.role = String(req.query.role).toUpperCase(); if (req.query.status) filter.isActive = req.query.status === 'active';
    if (req.query.search) { const search = String(req.query.search).trim(); filter.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }]; }
    const [items, total] = await Promise.all([User.find(filter).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(filter)]);
    res.json({ items: items.map(publicUser), page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

app.put('/api/admin/users/:id/status', protect, requireRole('ADMIN'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' }); const isActive = req.body.isActive === true; const target = await User.findById(req.params.id); if (!target) return res.status(404).json({ message: 'User not found.' });
    if (!isActive && target.role === 'ADMIN' && target.isActive && await User.countDocuments({ role: 'ADMIN', isActive: true }) <= 1) return res.status(409).json({ message: 'The last active admin cannot be deactivated.' });
    target.isActive = isActive; await target.save(); await audit(req.user._id, isActive ? 'ADMIN_ACTIVATED_USER' : 'ADMIN_DEACTIVATED_USER', 'USER', target._id); res.json(publicUser(target));
  } catch (error) { next(error); }
});

app.get('/api/admin/donations', protect, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100); const filter = dateRange(req.query); if (req.query.status) filter.status = String(req.query.status).toUpperCase(); if (req.query.category) filter.category = String(req.query.category).toUpperCase(); if (req.query.search) filter.foodName = { $regex: String(req.query.search).trim(), $options: 'i' };
    const [items, total] = await Promise.all([Donation.find(filter).populate('donorId', 'name email').populate('acceptedBy', 'organizationName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Donation.countDocuments(filter)]); res.json({ items: items.map(publicDonation), page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

app.get('/api/admin/reports/donations', protect, requireRole('ADMIN'), async (req, res, next) => {
  try { const filter = dateRange(req.query); const rows = await Donation.find(filter).populate('donorId', 'name').populate('acceptedBy', 'organizationName').select('foodName category quantity unit status expiryTime createdAt donorId acceptedBy').lean(); const report = rows.map(row => ({ food: row.foodName, category: row.category, quantity: row.quantity, unit: row.unit, status: row.status, expiry: row.expiryTime?.toISOString?.() || row.expiryTime, created: row.createdAt?.toISOString?.() || row.createdAt, donor: row.donorId?.name, ngo: row.acceptedBy?.organizationName })); if (req.query.format === 'csv') return csvResponse(res, report, 'feedingme-donations.csv'); res.json(report); } catch (error) { next(error); }
});
app.get('/api/admin/reports/ngos', protect, requireRole('ADMIN'), async (req, res, next) => {
  try { const filter = dateRange(req.query); const rows = await NGO.find(filter).select('organizationName registrationNumber city state verificationStatus createdAt').lean(); const report = rows.map(row => ({ organization: row.organizationName, registrationNumber: row.registrationNumber, city: row.city, state: row.state, status: row.verificationStatus, created: row.createdAt?.toISOString?.() || row.createdAt })); if (req.query.format === 'csv') return csvResponse(res, report, 'feedingme-ngos.csv'); res.json(report); } catch (error) { next(error); }
});
app.get('/api/admin/reports/pickups', protect, requireRole('ADMIN'), async (req, res, next) => {
  try { const filter = dateRange(req.query); const rows = await Pickup.find(filter).populate('donationId', 'foodName').populate('ngoId', 'organizationName').populate('donorId', 'name').select('donationId ngoId donorId scheduledAt status createdAt').lean(); const report = rows.map(row => ({ donation: row.donationId?.foodName, ngo: row.ngoId?.organizationName, donor: row.donorId?.name, scheduled: row.scheduledAt?.toISOString?.() || row.scheduledAt, status: row.status, created: row.createdAt?.toISOString?.() || row.createdAt })); if (req.query.format === 'csv') return csvResponse(res, report, 'feedingme-pickups.csv'); res.json(report); } catch (error) { next(error); }
});
app.get('/api/admin/system/health', protect, requireRole('ADMIN'), (_, res) => res.json({ api: 'healthy', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', environment: process.env.NODE_ENV || 'development', uptime: Math.round(process.uptime()) }));

app.use((error, _req, res, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Image must be 5 MB or smaller.' });
  if (error?.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ message: error.message || 'Only JPEG, PNG, and WEBP images are supported.' });
  if (error?.status) return res.status(error.status).json({ message: error.message });
  if (error?.code === 11000) return res.status(409).json({ message: 'A record with that value already exists.' });
  if (error?.name === 'ValidationError') return res.status(400).json({ message: Object.values(error.errors).map(item => item.message).join(' ') });
  console.error(error.message);
  res.status(500).json({ message: 'Unable to complete the request.' });
});

async function start() {
  try {
    await connectDB();
    app.listen(port, () => console.log(`FeedingMe API on http://localhost:${port}`));
  } catch (error) {
    console.error(`Database connection failed: ${error.message}`);
    process.exitCode = 1;
  }
}

start();
