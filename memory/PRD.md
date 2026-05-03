# NURTIX - Product Requirements Document

## Overview
NURTIX is a quick-commerce style healthcare mobile app (Expo React Native) for immediate, affordable home doctor visits for infants, elderly, and busy professionals.

## Iteration 1 (MVP)
- Role selector, mock auth, patient booking dashboard, AI Symptom Checker (Claude Sonnet 4.5), live ETA tracking (mock map), doctor portal with feed/accept, trust profile with credentials/reviews.

## Iteration 2
- Doctor Earnings dashboard (available balance, weekly stats, 15% platform fee breakdown, withdrawal history)
- Withdrawal request flow
- E-Prescriptions (doctor writes, patient views)
- E-Invoices (auto-generated on completion, 5% service + 18% GST)

## Iteration 3 (Stripe)
- **Stripe Checkout (REAL, test mode)**: Patient can tap "Pay ₹X with Stripe" on any unpaid completed-visit invoice → redirects to real Stripe-hosted checkout → on return polls `/api/payments/checkout/status/{session_id}` → invoice auto-flips to PAID
  - Backend uses `emergentintegrations` StripeCheckout with `sk_test_emergent`
  - Security: server-decided amount (never trust client), dynamic origin-based success/cancel URLs, `payment_transactions` collection with idempotent status updates
  - Stripe webhook endpoint at `/api/webhook/stripe`
  - Defensive fallback on checkout-status upstream errors (returns local tx state)
- **Doctor Stripe Connect bank linking**: Earnings screen now has a "Connect bank account" card. Doctor enters account holder + number + IFSC → backend stores masked details (`connect_status=verified_simulated`). Withdrawals are gated on having linked bank.
  - **Actual payout is MOCKED** (withdrawal stays `pending`); production requires a full Stripe Connect Express onboarding + platform account.

## Stack
- Backend: FastAPI + MongoDB + emergentintegrations (Claude Sonnet 4.5 + Stripe Checkout)
- Frontend: Expo Router + AsyncStorage + expo-web-browser (Stripe redirect)
- Design: Deep Forest Green + Electric Coral, light bg, generous spacing

## Key API Endpoints
- Auth / Doctors / Visits / Reviews (unchanged)
- Symptom: POST /api/symptom-check
- Prescriptions: POST /api/prescriptions, GET /api/visits/{id}/prescription
- Invoices: GET /api/visits/{id}/invoice (auto-created pending on complete)
- Earnings: GET /api/doctors/{id}/earnings
- Withdrawals: POST/GET /api/doctors/{id}/withdrawals
- Bank: POST/GET /api/doctors/{id}/bank
- **Payments**: POST /api/payments/checkout/session, GET /api/payments/checkout/status/{session_id}, POST /api/webhook/stripe

## Mocked / Deferred
- Google Maps SDK (mock map image)
- Real Stripe Connect Express payouts (bank details stored, payout mocked)
- Push notifications, real-time location WebSocket
- Patient review submission UI
- PDF export for Rx / Invoices
- Google OAuth / full credential verification
