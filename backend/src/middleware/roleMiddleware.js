import NGO from '../models/NGO.js';

export async function requireVerifiedNGO(req, res, next) {
  if (req.user.role !== 'NGO') return res.status(403).json({ success: false, message: 'This action is restricted to NGOs.' });
  const ngo = await NGO.findOne({ userId: req.user._id });
  if (!ngo || ngo.verificationStatus !== 'VERIFIED') return res.status(403).json({ success: false, message: 'Your NGO must be verified before using this feature.' });
  req.ngo = ngo;
  next();
}
