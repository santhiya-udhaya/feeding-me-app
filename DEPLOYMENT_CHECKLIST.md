# Deployment Checklist

- [ ] MongoDB Atlas cluster created
- [ ] Atlas database user created with a strong password
- [ ] Network access allowed for Render/Vercel and local admin IPs
- [ ] Cloudinary account configured
- [ ] Backend `.env` includes `PORT`, `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, `CLOUDINARY_*`
- [ ] Frontend `.env.local` / Vercel env includes `VITE_API_URL`
- [ ] CORS configured with backend `CLIENT_URL`
- [ ] HTTPS enabled on frontend and backend
- [ ] Vercel project configured with Vite build and `dist` output
- [ ] Render project configured with `npm install` and `npm start`
- [ ] Health endpoint `/health` returns safe status JSON
- [ ] Authentication and authorization tested
- [ ] Donation workflow tested end-to-end
- [ ] Pickup workflow tested end-to-end
- [ ] Notification flow tested
- [ ] Admin dashboard and analytics tested
- [ ] Production tests passed
- [ ] GitHub Actions workflow configured
