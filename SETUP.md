# 🚀 PesaApp — Complete Setup Guide

## Step 1: Start Databases

```bash
# Start PostgreSQL + Redis with Docker
docker compose up -d

# Verify they're running
docker compose ps
```

## Step 2: Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy and fill environment variables
cp .env.example .env
# Edit .env with your API keys (see below)

# Generate Prisma client
npx prisma generate

# Run migrations (creates all tables)
npx prisma migrate dev --name init

# Seed database (creates admin + sample data)
npx tsx prisma/seed.ts

# Start dev server
npm run dev
# → API running at http://localhost:3000
```

## Step 3: Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Start dev server
npm run dev
# → App running at http://localhost:5173
```

---

## 🔑 API Keys You Need

### 1. M-Pesa Daraja (Payments)
- Register at: https://developer.safaricom.co.ke
- Create an app → get Consumer Key & Secret
- Use sandbox shortcode: `174379`
- Sandbox passkey: from Daraja portal

### 2. Africa's Talking (SMS/OTP)
- Register at: https://africastalking.com
- Go to Sandbox → get API Key
- Username: `sandbox` for testing

### 3. Smile Identity (KYC)
- Register at: https://www.smileidentity.com
- Get Partner ID and API Key from dashboard
- Use `sandbox` environment for testing

### 4. Flutterwave (Fallback Payments)
- Register at: https://flutterwave.com
- Dashboard → API Keys → Test keys

### 5. Cloudinary (File Storage)
- Register at: https://cloudinary.com
- Dashboard → copy Cloud Name, API Key, API Secret

---

## 📡 M-Pesa Callback Setup (Testing)

For local testing, use **ngrok** to expose localhost:

```bash
# Install ngrok
npm install -g ngrok

# Expose backend
ngrok http 3000

# Copy the HTTPS URL e.g. https://abc123.ngrok.io
# Set in .env:
MPESA_CALLBACK_URL=https://abc123.ngrok.io/api/v1/payments/mpesa/callback
MPESA_TIMEOUT_URL=https://abc123.ngrok.io/api/v1/payments/mpesa/timeout
MPESA_RESULT_URL=https://abc123.ngrok.io/api/v1/payments/mpesa/b2c/result
```

---

## 🗂 Full File Structure

```
pesaapp/
├── docker-compose.yml          # PostgreSQL + Redis
├── README.md
│
├── backend/
│   ├── .env.example            # All environment variables
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma       # Full database schema
│   │   └── seed.ts             # Seed admin + sample data
│   └── src/
│       ├── index.ts            # Server entry point
│       ├── app.ts              # Express + middleware + routes
│       ├── config/
│       │   ├── database.ts     # Prisma singleton
│       │   └── redis.ts        # Redis connection + helpers
│       ├── controllers/
│       │   └── auth.controller.ts
│       ├── middleware/
│       │   ├── auth.middleware.ts   # JWT auth + admin guard
│       │   ├── errorHandler.ts
│       │   ├── notFound.ts
│       │   └── validate.ts
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── wallet.routes.ts
│       │   ├── payment.routes.ts   # M-Pesa + FLW callbacks
│       │   ├── kyc.routes.ts
│       │   ├── game.routes.ts
│       │   ├── signal.routes.ts
│       │   ├── bill.routes.ts
│       │   ├── referral.routes.ts
│       │   ├── user.routes.ts
│       │   ├── notification.routes.ts
│       │   └── admin.routes.ts
│       ├── services/
│       │   ├── mpesa.service.ts        # STK Push + B2C
│       │   ├── flutterwave.service.ts  # Fallback payments
│       │   ├── wallet.service.ts       # Deposit/withdraw/send
│       │   ├── kyc.service.ts          # Smile Identity
│       │   ├── game.service.ts         # Provably fair engine
│       │   ├── bill.service.ts         # KPLC/water/airtime
│       │   ├── sms.service.ts          # Africa's Talking
│       │   └── cloudinary.service.ts   # File uploads
│       └── utils/
│           ├── jwt.ts          # Token generation + verify
│           ├── otp.ts          # OTP generate + hash
│           ├── logger.ts       # Winston logger
│           └── AppError.ts     # Custom error class
│
└── frontend/
    ├── .env.example
    ├── index.html              # PWA entry
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── public/
    │   └── manifest.json       # PWA manifest
    └── src/
        ├── main.tsx            # React entry + providers
        ├── App.tsx             # Router + route guards
        ├── index.css           # Tailwind + global styles
        ├── store/
        │   └── authStore.ts    # Zustand auth state
        ├── services/
        │   └── api.ts          # Axios + auto token refresh
        ├── hooks/
        │   └── useApi.ts       # All React Query hooks
        ├── types/
        │   └── index.ts        # TypeScript interfaces
        ├── utils/
        │   └── format.ts       # KES format, dates, helpers
        ├── components/
        │   └── layout/
        │       └── AppLayout.tsx   # Sidebar + topbar
        └── pages/
            ├── auth/
            │   ├── LoginPage.tsx      # Phone input
            │   └── VerifyOtpPage.tsx  # OTP 6-digit input
            ├── DashboardPage.tsx
            ├── WalletPage.tsx         # Deposit/withdraw/send tabs
            ├── KycPage.tsx            # ID + selfie upload
            ├── GamesPage.tsx          # Game grid
            ├── games/
            │   └── AviatorPage.tsx    # Live Aviator game
            ├── InvestPage.tsx         # Signals + subscriptions
            ├── ReferralsPage.tsx      # Referral tree + earnings
            ├── BillsPage.tsx          # KPLC/water/airtime
            ├── ProfilePage.tsx        # User settings
            ├── TransactionsPage.tsx   # Full history
            └── NotFoundPage.tsx
```

---

## 🏗 Production Deployment

### Backend: Railway or Render
```bash
# Build
npm run build

# Set all env vars in Railway/Render dashboard
# Add PostgreSQL + Redis addons
# Deploy from GitHub
```

### Frontend: Vercel
```bash
# Set VITE_API_URL=https://your-backend.railway.app/api/v1
# Deploy from GitHub → Vercel detects Vite automatically
```

### Domain + SSL
- Get domain from Namecheap / GoDaddy (.co.ke recommended)
- Point to Vercel (frontend) + Railway (backend)
- Both platforms handle SSL automatically

---

## 💡 Next Steps After Setup

1. **Test M-Pesa STK Push** with Safaricom sandbox
2. **Upload test ID + selfie** to test KYC flow
3. **Play Aviator** with test balance
4. **Set up admin account** via seed + test admin routes
5. **Add Firebase** for push notifications
6. **Integrate real KPLC API** for token purchase
