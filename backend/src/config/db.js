import mongoose from 'mongoose';
import dns from 'node:dns';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured. Add it to backend/.env.');
  const dnsServer = process.env.MONGODB_DNS_SERVER || (process.platform === 'win32' && dns.getServers().includes('127.0.0.1') ? '172.16.1.246' : '');
  if (dnsServer) dns.setServers([dnsServer]);

  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}
