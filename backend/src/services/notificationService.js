import Notification from '../models/Notification.js';
import User from '../models/User.js';

export const notificationTypes = [
  'DONATION_CREATED', 'DONATION_ACCEPTED', 'DONATION_CANCELLED', 'DONATION_EXPIRING', 'DONATION_EXPIRED',
  'PICKUP_SCHEDULED', 'PICKUP_STARTED', 'PICKUP_COLLECTED', 'PICKUP_COMPLETED', 'PICKUP_CANCELLED',
  'NGO_REGISTERED', 'NGO_VERIFIED', 'NGO_REJECTED', 'NGO_INFO_REQUIRED', 'FOOD_ISSUE_REPORTED', 'REVIEW_RECEIVED', 'DONOR_VERIFIED', 'DONOR_REJECTED', 'SYSTEM'
];

export async function createNotification({ recipient, type, title, message, relatedDonation, relatedPickup, relatedNGO }) {
  if (!recipient || !notificationTypes.includes(type)) return null;
  const user = await User.findById(recipient).select('notificationPreferences');
  const preferenceKey = type.startsWith('DONATION_') ? 'donationUpdates' : type.startsWith('PICKUP_') ? 'pickupUpdates' : type.startsWith('NGO_') ? 'ngoUpdates' : 'systemUpdates';
  if (user?.notificationPreferences?.[preferenceKey] === false) return null;
  const duplicate = type === 'FOOD_ISSUE_REPORTED' ? false : await Notification.exists({ userId: recipient, type, relatedDonationId: relatedDonation || null, relatedPickupId: relatedPickup || null, relatedNGOId: relatedNGO || null });
  if (duplicate) return null;
  return Notification.create({ userId: recipient, type, title, message, relatedDonationId: relatedDonation, relatedPickupId: relatedPickup, relatedNGOId: relatedNGO });
}
