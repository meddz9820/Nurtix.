# NURTIX - Product Requirements Document

## Overview
NURTIX is a quick-commerce style healthcare mobile app (Expo React Native) for immediate, affordable home doctor visits aimed at infants, elderly, and busy professionals.

## MVP Scope
- Role selector landing (Patient / Doctor)
- Mock name-based auth (replaceable with Google OAuth later)
- Patient flow: dashboard → one-tap booking → live ETA tracking with mock map → visit history → AI symptom checker
- Doctor flow: online toggle → nearby job feed → accept job → manage active visit (en_route → arrived → completed) → profile with credentials/reviews
- Trust profile screen for any doctor with bio, verified credentials, ratings & reviews
- AI Symptom Checker powered by Claude Sonnet 4.5 via Emergent Universal LLM Key

## Stack
- Backend: FastAPI + MongoDB + emergentintegrations (Claude Sonnet 4.5)
- Frontend: Expo Router (Tabs + Stack), React Native, AsyncStorage
- Design: Deep Forest Green base + Electric Coral accents, light bg, generous spacing

## Future Iterations (deferred from MVP)
- Real Google Maps SDK integration (currently mock map)
- Stripe payment integration (test key already in env)
- Emergent Google OAuth
- Doctor credential upload + admin verification flow
- Push notifications + real-time location WebSocket
- Patient review submission UI (backend endpoint exists)

## API Endpoints
- POST /api/auth/login
- GET /api/doctors  (?online_only=true)
- GET /api/doctors/{id}
- PATCH /api/doctors/{id}/online
- GET /api/doctors/{id}/reviews
- POST /api/visits
- GET /api/visits/patient/{patient_id}
- GET /api/visits/doctor/feed
- GET /api/visits/doctor/{doctor_id}/active
- GET /api/visits/{id}
- PATCH /api/visits/{id}/accept?doctor_id=...
- PATCH /api/visits/{id}/status
- POST /api/symptom-check
- GET /api/symptom-check/{session_id}/messages
- POST /api/reviews
