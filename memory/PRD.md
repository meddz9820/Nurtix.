# NURTIX - Product Requirements Document

## Overview
NURTIX is a quick-commerce style healthcare mobile app (Expo React Native) for immediate, affordable home doctor visits for infants, elderly, and busy professionals.

## Iteration 1 (MVP)
- Role selector, mock auth, patient dashboard, AI Symptom Checker, live ETA mock map, doctor portal, trust profile

## Iteration 2
- Doctor Earnings dashboard (balance, 15% platform fee), Withdrawal flow, E-Prescriptions, E-Invoices (auto on completion, 5% + 18% GST)

## Iteration 3 (Stripe)
- Real Stripe Checkout (test mode) for patient invoice payments (server-decided amount, webhook, idempotent status)
- Stripe Connect bank linking for doctors (payout MOCKED pending real platform onboarding)

## Iteration 4 (AI-First E2E Flow per user spec)
Patient: login → symptom checker chat → after ≥3 user turns, "Generate AI report" CTA appears → Claude Sonnet 4.5 generates structured JSON report (chief complaint, severity, key symptoms, red flags, suggested OTC meds, triage recommendation, urgency) → patient reviews in a clean Rx-style summary screen → "Send report & book doctor" creates visit with the symptom_summary snapshot attached → live ETA tracking.

Doctor side: every pending/active visit card shows an **AI TRIAGE REPORT** panel with patient_summary, key symptom chips, and AI-suggested OTC medications — **before** accepting, so the doctor already knows the context and can bring basic medications.

PDF export: `expo-print` + `expo-sharing` with branded HTML templates for **Prescriptions** and **Invoices** — "Download / Share PDF" button on both screens; web fallback opens browser print dialog.

## Stack
- Backend: FastAPI + MongoDB + emergentintegrations (Claude Sonnet 4.5 + Stripe Checkout)
- Frontend: Expo Router + AsyncStorage + expo-web-browser (Stripe) + expo-print / expo-sharing (PDF)

## Key New Endpoints (Iter 4)
- POST /api/symptom-check (now returns `user_turns`, `ready_for_report`)
- POST /api/symptom-check/{session_id}/report — generates structured JSON report (Claude)
- GET /api/symptom-check/{session_id}/report
- POST /api/visits now accepts `symptom_report_id` and copies `symptom_summary` snapshot + adopts urgency

## Mocked / Deferred
- Google Maps SDK (mock tile image)
- Real Stripe Connect Express payouts (bank saved, payout mocked)
- Push notifications, real-time location WebSocket
- Patient review submission UI
- Google OAuth / full credential verification admin flow
