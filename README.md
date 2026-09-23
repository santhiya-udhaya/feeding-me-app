# FeedingMe

A local full-stack food-donation starter. Donors can register, log in, post food, and track its workflow; NGO users can browse donations and update their status.

## Run it locally

1. In `backend`, copy `.env.example` to `.env` and set `MONGODB_URI` to your MongoDB Atlas connection string and `JWT_SECRET` to a long random value. Then run `npm install` and `npm run dev`.
2. In `frontend`, run `npm install` and `npm run dev`.
3. Open the address Vite shows (normally `http://localhost:5173`).

The API connects to MongoDB before starting. It will refuse to start when `MONGODB_URI` or `JWT_SECRET` is missing. `backend/src/data.json` is retained as an archive of the former prototype store and is no longer read or written.

Authentication uses JWTs with bcrypt-hashed passwords. Public registration supports donors and NGOs only; NGO profiles begin in `PENDING` verification. Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `ADMIN_NAME` in `backend/.env`, then run `npm run seed:admin` once to initialize an administrator.

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/donations`, `POST /api/donations`, `PATCH /api/donations/:id/status`
- `GET /api/donations/:id`, `GET /api/donations/my`
- `GET /api/dashboard`
- `GET/PUT /api/users/me`, `PUT /api/users/change-password`
- `GET/POST/PUT /api/ngos/profile`
- `GET /api/admin/ngos`, `GET /api/admin/ngos/pending`
- `PUT /api/admin/ngos/:id/verify`, `PUT /api/admin/ngos/:id/reject`
- `GET /api/donations/available`, `POST /api/donations/:id/accept`, `POST /api/donations/:id/cancel`
- `POST /api/pickups`, `GET /api/pickups/my`, `GET /api/pickups/ngo`, `GET /api/admin/pickups`
- `GET /api/pickups/:id`, `PUT /api/pickups/:id/status`
- `GET /api/notifications`, `GET /api/notifications/unread-count`
- `PUT /api/notifications/:id/read`, `PUT /api/notifications/read-all`, `DELETE /api/notifications/:id`
- `GET /api/ngos/nearby?latitude=...&longitude=...&radius=...`
- `GET /api/admin/dashboard/stats`, `GET /api/admin/analytics`
- `GET /api/admin/users`, `PUT /api/admin/users/:id/status`
- `GET /api/admin/donations`
- `GET /api/admin/reports/donations`, `/api/admin/reports/ngos`, `/api/admin/reports/pickups`
- Add `?format=csv` to admin report endpoints for CSV downloads.
- `GET /api/admin/system/health`
- `POST /api/donations` accepts optional multipart field `image`.
- `PUT /api/users/profile-image` accepts multipart field `image`.

All mutation endpoints except registration/login require `Authorization: Bearer <token>`.

## Donation and pickup workflow

```text
Donor
	↓
Create donation
	↓
AVAILABLE
	↓
Verified NGO accepts
	↓
ACCEPTED
	↓
Pickup scheduled
	↓
PICKUP_SCHEDULED
	↓
PICKUP_IN_PROGRESS
	↓
COLLECTED
	↓
COMPLETED
```

Acceptance uses an atomic MongoDB update, so only one verified NGO can claim an available donation. Pickup status transitions are validated server-side and update the related donation. Notifications are created for acceptance, scheduling, and pickup progress events.

## Phase 5 notifications and location

Notifications are stored in MongoDB with controlled event types and ownership enforced by the authenticated user. The frontend polls notification state every 45 seconds while signed in, and provides unread count, mark-read, mark-all-read, and delete actions.

Donation coordinates are optional. Donors can manually enter a pickup area or grant browser geolocation permission. Coordinates are stored separately from the address and rendered with Leaflet/OpenStreetMap only when available. The backend provides verified nearby NGO discovery using an approximate Haversine distance; it does not continuously track users or claim road distance.

## Phase 6 admin command center

All `/api/admin/*` endpoints require a current JWT whose database user has role `ADMIN`. Dashboard and analytics values are MongoDB aggregations, with optional bounded `from` and `to` date filters. Admin lists support pagination, filtering, and search. Reports exclude passwords and secrets; CSV output contains only operational fields. NGO verification and user activation changes are recorded in the `AuditLog` collection. System health reports API state, database state, environment name, and uptime without exposing environment variables.

## Phase 7 media uploads

Configure these backend variables before enabling successful uploads:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Images are accepted as JPEG, PNG, or WEBP up to 5 MB. Uploads use memory-only multipart handling and are stored in Cloudinary folders `feedingme/donations` and `feedingme/users`. MongoDB stores only the secure URL and Cloudinary metadata; image binaries are never stored in MongoDB. A failed database write removes a newly uploaded asset, while replacement deletes the old asset only after the new profile update succeeds.

## Deployment architecture

```text
GitHub
  ├─ frontend -> Vercel
  └─ backend  -> Render
                  ├─ MongoDB Atlas
                  └─ Cloudinary
```

Backend and frontend are separated by environment configuration. The frontend only uses browser-safe values such as `VITE_API_URL`; backend secrets remain in `backend/.env` and are never exposed to React.

## Production environment

Required backend environment variables:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/feedingme
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_URL=https://your-vercel-domain.vercel.app
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Required frontend environment variable:

```env
VITE_API_URL=https://your-render-backend-url
```

Use `.env.example` files as placeholders only; do not commit real credentials.

## Render and Vercel setup

Render (backend):
- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`

Vercel (frontend):
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Add environment variable: `VITE_API_URL`

## Security and deployment checklist

- `CLIENT_URL` is used for CORS and must be the deployed frontend URL.
- `VITE_API_URL` is used by the browser and must not expose server secrets.
- Health endpoint: `GET /health` returns safe status data only.
- Do not commit MongoDB Atlas, JWT, or Cloudinary credentials.
- Rotate any credentials that were previously committed to the repository.

## CI/CD

GitHub Actions in `.github/workflows/ci.yml` installs backend and frontend dependencies, runs the backend syntax check, and builds the frontend on push and pull request.

## Phase 3 checks

Run the backend syntax checks and frontend build before development:

```powershell
cd backend
node --check src/server.js
npm run seed:admin
cd ../frontend
npm run build
```
