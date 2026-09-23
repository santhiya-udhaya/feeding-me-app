import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';

dotenv.config({
  path: new URL('../.env', import.meta.url)
});

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const name = process.env.ADMIN_NAME || 'FeedingMe Admin';

if (!email || !password || password.length < 8) {
  throw new Error(
    'Set ADMIN_EMAIL, ADMIN_PASSWORD (8+ characters), and optionally ADMIN_NAME in backend/.env.'
  );
}

try {
  await connectDB();

  const hash = await bcrypt.hash(password, 12);

  await User.findOneAndUpdate(
    { email },
    {
      $set: {
        name,
        email,
        password: hash,
        role: 'ADMIN',
        verificationStatus: 'APPROVED',
        isActive: true
      }
    },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true
    }
  );

  console.log(`Admin account initialized for ${email}`);
} finally {
  await mongoose.disconnect();
}