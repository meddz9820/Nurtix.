# NURTIX - Product Requirements Document

## Overview
NURTIX is a quick-commerce style healthcare mobile app (Expo React Native) for immediate, affordable home doctor visits aimed at infants, elderly, and busy professionals.

## Iteration 1 (MVP)
- Role selector landing (Patient / Doctor)
- Mock name-based auth (replaceable with Google OAuth later)
- Patient flow: dashboard → one-tap booking → live ETA tracking with mock map → visit history → AI symptom checker (Claude Sonnet 4.5)
- Doctor flow: online toggle → nearby job feed → accept job → manage active visit (en_route → arrived → completed) → profile with credentials/reviews
- Trust profile for any doctor with bio, verified credentials, ratings & reviews

## Iteration 2 (Added)
- **Doctor Earnings tab**: Available balance card, weekly/total stats, gross → platform fee (15%) → net breakdown, withdrawal history
- **Withdrawals**: Request withdrawal via modal (bank transfer); stays pending server-side (mocked payout)
- **E-Prescriptions**: Doctor writes diagnosis + multiple medications (name/dosage/frequency/duration) + notes from active visit card. Upsert logic. Patient views a clean, signed Rx page via tracking/visit history
- **E-Invoices**: Auto-generated on visit completion (consultation fee + 5% service + 18% GST). Clean receipt layout with PAID badge. Completion requires prescription (UI guard).

## Stack
- Backend: FastAPI + MongoDB + emergentintegrations (Claude Sonnet 4.5)
- Frontend: Expo Router (Tabs + Stack), React Native, AsyncStorage
- Design: Deep Forest Green base + Electric Coral accents, light bg, generous spacing

## Future Iterations (deferred)
- Real Google Maps SDK integration (currently mock map)
- Stripe payment integration (test key already in env)
- Real payout for withdrawals (Stripe Connect / Razorpay)
- Emergent Google OAuth
- Doctor credential upload + admin verification flow
- Push notifications + real-time location WebSocket
- Patient review submission UI
- PDF download for prescriptions/invoices
- True calendar-week earnings filter

## Key API Endpoints
- Auth: POST /api/auth/login
- Doctors: GET /api/doctors, GET /api/doctors/{id}, PATCH /api/doctors/{id}/online, GET /api/doctors/{id}/reviews
- Visits: POST /api/visits, GET /api/visits/patient/{pid}, GET /api/visits/doctor/feed, GET /api/visits/doctor/{did}/active, GET /api/visits/{id}, PATCH /api/visits/{id}/accept, PATCH /api/visits/{id}/status
- AI: POST /api/symptom-check, GET /api/symptom-check/{sid}/messages
- Prescriptions: POST /api/prescriptions, GET /api/visits/{id}/prescription
- Invoices: GET /api/visits/{id}/invoice (auto-created on status=completed)
- Earnings/Withdrawals: GET /api/doctors/{id}/earnings, POST /api/doctors/{id}/withdraw, GET /api/doctors/{id}/withdrawals
- Reviews: POST /api/reviews
