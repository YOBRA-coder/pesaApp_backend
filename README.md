# 💰 PesaApp — Kenyan Fintech Platform

Full-stack fintech app with wallet, M-Pesa, games, forex signals, bills payment, referrals & KYC.

## 🗂 Project Structure

```
pesaapp/
├── frontend/          # React + TypeScript + Vite + Tailwind
├── backend/           # Node.js + Express + TypeScript + Prisma
└── docs/              # API docs, architecture
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- pnpm (recommended)

### 1. Clone & Install
```bash
git clone <your-repo>
cd pesaapp

# Install frontend deps
cd frontend && pnpm install

# Install backend deps
cd ../backend && pnpm install
```

### 2. Environment Setup
```bash
# Backend
cp backend/.env.example backend/.env
# Fill in all values in backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

### 3. Database Setup
```bash
cd backend
pnpm prisma migrate dev --name init
pnpm prisma db seed
```

### 4. Run Dev Servers
```bash
# Terminal 1 - Backend
cd backend && pnpm dev

# Terminal 2 - Frontend
cd frontend && pnpm dev
```

Frontend: http://localhost:5173  
Backend API: http://localhost:3000

## 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State | Zustand + React Query |
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma |
| Database | PostgreSQL 15 |
| Cache/Queue | Redis (BullMQ) |
| Auth | JWT + OTP via Africa's Talking |
| Payments | M-Pesa Daraja + Flutterwave |
| KYC | Smile Identity |
| File Storage | Cloudinary |

## 📋 Features
- ✅ Auth (Phone OTP + JWT)
- ✅ KYC (ID + Selfie via Smile Identity)
- ✅ Wallet (Deposit, Withdraw, Send)
- ✅ M-Pesa STK Push + B2C
- ✅ Flutterwave fallback payments
- ✅ Bill payments (KPLC, Water, Airtime)
- ✅ Games (Aviator/Crash engine)
- ✅ Forex/Crypto signals
- ✅ Referral system
- ✅ Transaction history
- ✅ Admin dashboard
