# NURTIX - Product Requirements Document

## Overview
NURTIX is a quick-commerce style healthcare mobile app (Expo React Native) for immediate, affordable home doctor visits.

## Iterations
- **Iter 1 (MVP)** – role selector, mock auth, AI symptom checker (chat), mock-map ETA tracking, doctor portal with feed/accept, trust profile.
- **Iter 2** – Earnings dashboard, withdrawals, e-prescriptions, e-invoices (auto on completion).
- **Iter 3** – Real Stripe Checkout for invoice payments; Stripe Connect bank linking (payout MOCKED).
- **Iter 4** – AI-first end-to-end flow (Claude-generated structured report attached to visit; raw + suggested OTC shown to doctor); PDF export/share for Rx + Invoice.
- **Iter 5 (Operational Blueprint)** – major upgrade per the user's blueprint:
  - Patient symptom checker replaced with **deterministic 3-question MCQ wizard** (Category / Duration / Severity) → "Generating your AI Report..." → existing report screen with "Send report & book doctor".
  - Doctor feed + active cards show **AI TRIAGE REPORT panel** AND **PATIENT RAW DATA panel** with the exact MCQ selections.
  - **Sequential routing lock**: `/api/visits/doctor/feed?doctor_id=X` returns [] while doctor has any active visit; unlocks on completion.
  - **Decentralized Inventory**: 3 seeded Dark Stores (Indiranagar / Koramangala / HSR), each with full inventory dict. New Doctor "Kit" tab with mock **QR Scan Check-Out** (decrements store, binds kit to doctor), kit grid view, **Wastage Ledger** portal.
  - **Pre-trip Supply Validation** runs when doctor presses "Start trip"; warns if kit lacks recommended items.
  - **Tri-party reconciliation on End Visit**: a dispense modal lets the doctor pick items + quantities; submission deducts from kit, logs `inventory_transactions` against the source Dark Store, sets visit.status=completed with `dispensed_receipt`, and attaches the dispensed list to the invoice.

## Stack
- Backend: FastAPI + MongoDB + emergentintegrations (Claude Sonnet 4.5, Stripe Checkout)
- Frontend: Expo Router, AsyncStorage, expo-web-browser (Stripe), expo-print + expo-sharing (PDF)
- Theme retained: Deep Forest Green + Electric Coral + cream

## Key New Endpoints (Iter 5)
- `POST /api/symptom-check/{sid}/report-mcq` – deterministic MCQ → structured report
- `GET /api/dark-stores`
- `POST /api/doctors/{id}/kit/checkout`, `GET /api/doctors/{id}/kit`
- `POST /api/visits/{id}/validate-supply`
- `POST /api/visits/end` – tri-party reconciliation
- `POST/GET /api/doctors/{id}/wastage`
- `GET /api/visits/doctor/feed?doctor_id=` now returns [] when doctor has an active trip (sequential lock)

## Mocked / Deferred
- **Stripe Connect payout to bank** – withdrawals stay `pending`.
- QR scan – modal hub picker simulates the locker scan.
- Google Maps SDK – mock tile image.

- Fork 1: Fixed doctor Active page crash (ITEM_LABELS now shared from src/lib/api.ts); larger +/- buttons in end-visit modal.
