from fastapi import FastAPI, APIRouter, HTTPException, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ===== Models =====
class UserLogin(BaseModel):
    name: str
    role: Literal["patient", "doctor"]
    email: Optional[str] = None


class User(BaseModel):
    id: str
    name: str
    role: str
    email: Optional[str] = None


class Doctor(BaseModel):
    id: str
    name: str
    specialty: str
    bio: str
    avatar: str
    credentials: List[str]
    verified: bool
    rating: float
    reviews_count: int
    years_experience: int
    fee: int
    location: dict  # {lat, lng, area}
    online: bool = True


class Review(BaseModel):
    id: str
    doctor_id: str
    patient_name: str
    rating: int
    comment: str
    created_at: str


class VisitCreate(BaseModel):
    patient_id: str
    patient_name: str
    address: str
    symptoms: str
    urgency: Literal["routine", "urgent", "asap"] = "urgent"
    patient_location: dict  # {lat, lng}


class Visit(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    address: str
    symptoms: str
    urgency: str
    patient_location: dict
    status: Literal["pending", "accepted", "en_route", "arrived", "completed", "cancelled"] = "pending"
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    doctor_avatar: Optional[str] = None
    eta_minutes: Optional[int] = None
    fee: Optional[int] = None
    created_at: str
    accepted_at: Optional[str] = None
    completed_at: Optional[str] = None


class StatusUpdate(BaseModel):
    status: Literal["accepted", "en_route", "arrived", "completed", "cancelled"]
    doctor_id: Optional[str] = None


class SymptomMessage(BaseModel):
    session_id: str
    message: str
    patient_name: Optional[str] = "Patient"


class ChatMessage(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str


# ===== Helpers =====
def doctor_doc_to_model(doc) -> dict:
    doc.pop("_id", None)
    return doc


# ===== Seed =====
SEED_DOCTORS = [
    {
        "id": "doc-1",
        "name": "Dr. Aisha Patel",
        "specialty": "Family Medicine",
        "bio": "Compassionate family physician with a focus on pediatric and elderly home care. Known for calming bedside manner and thorough diagnoses.",
        "avatar": "https://images.unsplash.com/photo-1758691463393-a2aa9900af8a?crop=entropy&cs=srgb&fm=jpg&w=400&q=85",
        "credentials": ["MBBS - AIIMS Delhi", "MD Family Medicine", "Board Certified", "12+ home visits/week"],
        "verified": True,
        "rating": 4.9,
        "reviews_count": 247,
        "years_experience": 11,
        "fee": 1499,
        "location": {"lat": 12.9716, "lng": 77.5946, "area": "Indiranagar"},
        "online": True,
    },
    {
        "id": "doc-2",
        "name": "Dr. Marcus Chen",
        "specialty": "Internal Medicine",
        "bio": "Internal medicine specialist with expertise in acute care, fevers, and respiratory conditions. Available for late-night urgent calls.",
        "avatar": "https://images.unsplash.com/photo-1612531386530-97286d97c2d2?crop=entropy&cs=srgb&fm=jpg&w=400&q=85",
        "credentials": ["MD Internal Medicine", "Fellowship - Acute Care", "Board Certified"],
        "verified": True,
        "rating": 4.8,
        "reviews_count": 189,
        "years_experience": 9,
        "fee": 1799,
        "location": {"lat": 12.9352, "lng": 77.6245, "area": "Koramangala"},
        "online": True,
    },
    {
        "id": "doc-3",
        "name": "Dr. Sara Iyer",
        "specialty": "Pediatrics",
        "bio": "Pediatrician dedicated to infant and child wellness. Soft-spoken, patient with anxious parents, and skilled at quick diagnoses.",
        "avatar": "https://images.unsplash.com/photo-1758691463393-a2aa9900af8a?crop=entropy&cs=srgb&fm=jpg&w=400&q=85",
        "credentials": ["MBBS", "MD Pediatrics", "Neonatal Care Certified"],
        "verified": True,
        "rating": 5.0,
        "reviews_count": 312,
        "years_experience": 14,
        "fee": 1899,
        "location": {"lat": 12.9081, "lng": 77.6476, "area": "HSR Layout"},
        "online": True,
    },
    {
        "id": "doc-4",
        "name": "Dr. Rajesh Kumar",
        "specialty": "Geriatric Care",
        "bio": "Geriatric care specialist for elderly patients. Patient, gentle, and experienced with chronic condition management at home.",
        "avatar": "https://images.unsplash.com/photo-1612531386530-97286d97c2d2?crop=entropy&cs=srgb&fm=jpg&w=400&q=85",
        "credentials": ["MD Geriatrics", "Palliative Care Certified", "Board Certified"],
        "verified": True,
        "rating": 4.7,
        "reviews_count": 156,
        "years_experience": 18,
        "fee": 1999,
        "location": {"lat": 12.9784, "lng": 77.6408, "area": "Whitefield"},
        "online": False,
    },
    {
        "id": "doc-5",
        "name": "Dr. Nina Verma",
        "specialty": "General Practice",
        "bio": "GP with rapid response training. Fastest ETA in the network for urgent visits in central area.",
        "avatar": "https://images.unsplash.com/photo-1758691463393-a2aa9900af8a?crop=entropy&cs=srgb&fm=jpg&w=400&q=85",
        "credentials": ["MBBS", "Emergency Care Trained"],
        "verified": True,
        "rating": 4.85,
        "reviews_count": 98,
        "years_experience": 6,
        "fee": 1299,
        "location": {"lat": 12.9698, "lng": 77.7500, "area": "Marathahalli"},
        "online": True,
    },
]

SEED_REVIEWS = [
    {"id": "rev-1", "doctor_id": "doc-1", "patient_name": "Priya R.", "rating": 5, "comment": "Dr. Patel arrived in 22 mins, was so gentle with my 8-month-old. Highly recommend.", "created_at": now_iso()},
    {"id": "rev-2", "doctor_id": "doc-1", "patient_name": "Ankit S.", "rating": 5, "comment": "Professional, thorough, and reassuring. Diagnosed my mom's UTI quickly.", "created_at": now_iso()},
    {"id": "rev-3", "doctor_id": "doc-2", "patient_name": "Kiran M.", "rating": 5, "comment": "Came at 11pm for my fever. Super calm and explained everything clearly.", "created_at": now_iso()},
    {"id": "rev-4", "doctor_id": "doc-3", "patient_name": "Meera T.", "rating": 5, "comment": "My toddler felt comfortable with her right away. A miracle worker with kids.", "created_at": now_iso()},
    {"id": "rev-5", "doctor_id": "doc-3", "patient_name": "Sunil V.", "rating": 5, "comment": "Best pediatric experience we've had. Worth every rupee.", "created_at": now_iso()},
    {"id": "rev-6", "doctor_id": "doc-5", "patient_name": "Rohan B.", "rating": 4, "comment": "Quick and efficient. Got prescription within 30 mins of booking.", "created_at": now_iso()},
]


@app.on_event("startup")
async def seed_data():
    if await db.doctors.count_documents({}) == 0:
        await db.doctors.insert_many([d.copy() for d in SEED_DOCTORS])
        logging.info("Seeded doctors")
    if await db.reviews.count_documents({}) == 0:
        await db.reviews.insert_many([r.copy() for r in SEED_REVIEWS])
        logging.info("Seeded reviews")


# ===== Routes =====
@api_router.get("/")
async def root():
    return {"message": "NURTIX API"}


@api_router.post("/auth/login", response_model=User)
async def login(payload: UserLogin):
    existing = await db.users.find_one({"name": payload.name, "role": payload.role}, {"_id": 0})
    if existing:
        return User(**existing)
    user = User(id=str(uuid.uuid4()), name=payload.name, role=payload.role, email=payload.email)
    await db.users.insert_one(user.dict())
    return user


@api_router.get("/doctors", response_model=List[Doctor])
async def list_doctors(online_only: bool = False):
    query = {"online": True} if online_only else {}
    docs = await db.doctors.find(query, {"_id": 0}).to_list(100)
    return [Doctor(**d) for d in docs]


@api_router.get("/doctors/{doctor_id}", response_model=Doctor)
async def get_doctor(doctor_id: str):
    doc = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Doctor not found")
    return Doctor(**doc)


@api_router.patch("/doctors/{doctor_id}/online")
async def toggle_online(doctor_id: str, online: bool):
    result = await db.doctors.update_one({"id": doctor_id}, {"$set": {"online": online}})
    if result.matched_count == 0:
        raise HTTPException(404, "Doctor not found")
    return {"online": online}


@api_router.get("/doctors/{doctor_id}/reviews", response_model=List[Review])
async def doctor_reviews(doctor_id: str):
    revs = await db.reviews.find({"doctor_id": doctor_id}, {"_id": 0}).to_list(100)
    return [Review(**r) for r in revs]


# Visits
@api_router.post("/visits", response_model=Visit)
async def create_visit(payload: VisitCreate):
    visit = Visit(
        id=str(uuid.uuid4()),
        patient_id=payload.patient_id,
        patient_name=payload.patient_name,
        address=payload.address,
        symptoms=payload.symptoms,
        urgency=payload.urgency,
        patient_location=payload.patient_location,
        status="pending",
        created_at=now_iso(),
    )
    await db.visits.insert_one(visit.dict())
    return visit


@api_router.get("/visits/patient/{patient_id}", response_model=List[Visit])
async def patient_visits(patient_id: str):
    visits = await db.visits.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [Visit(**v) for v in visits]


@api_router.get("/visits/doctor/feed", response_model=List[Visit])
async def doctor_feed():
    visits = await db.visits.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [Visit(**v) for v in visits]


@api_router.get("/visits/doctor/{doctor_id}/active", response_model=List[Visit])
async def doctor_active(doctor_id: str):
    visits = await db.visits.find(
        {"doctor_id": doctor_id, "status": {"$in": ["accepted", "en_route", "arrived"]}},
        {"_id": 0},
    ).to_list(100)
    return [Visit(**v) for v in visits]


@api_router.get("/visits/{visit_id}", response_model=Visit)
async def get_visit(visit_id: str):
    v = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Visit not found")
    return Visit(**v)


@api_router.patch("/visits/{visit_id}/accept", response_model=Visit)
async def accept_visit(visit_id: str, doctor_id: str):
    doc = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Doctor not found")
    eta = 18  # mock ETA
    update = {
        "status": "accepted",
        "doctor_id": doctor_id,
        "doctor_name": doc["name"],
        "doctor_avatar": doc["avatar"],
        "eta_minutes": eta,
        "fee": doc["fee"],
        "accepted_at": now_iso(),
    }
    result = await db.visits.find_one_and_update(
        {"id": visit_id, "status": "pending"},
        {"$set": update},
        return_document=True,
    )
    if not result:
        raise HTTPException(400, "Visit unavailable")
    result.pop("_id", None)
    return Visit(**result)


@api_router.patch("/visits/{visit_id}/status", response_model=Visit)
async def update_status(visit_id: str, payload: StatusUpdate):
    update = {"status": payload.status}
    if payload.status == "completed":
        update["completed_at"] = now_iso()
    result = await db.visits.find_one_and_update(
        {"id": visit_id}, {"$set": update}, return_document=True
    )
    if not result:
        raise HTTPException(404, "Visit not found")
    result.pop("_id", None)
    if payload.status == "completed":
        await ensure_invoice(result)
    return Visit(**result)


# Symptom checker (multi-turn Claude)
SYMPTOM_SYSTEM = """You are a calm, empathetic medical triage assistant for NURTIX home doctor visits.
Your job is to ask 3-5 brief screening questions to understand the patient's symptoms BEFORE a doctor is dispatched.
Rules:
- One question at a time. Keep replies under 3 sentences.
- Be warm, non-clinical, reassuring.
- After gathering enough info (3-5 turns), provide a brief summary and recommend: (a) book a home visit, (b) call emergency if red flags (chest pain, severe bleeding, unconsciousness, stroke signs), or (c) self-care for very minor issues.
- Always end with a clear next step.
- Never give medication dosages or definitive diagnoses.
"""


@api_router.post("/symptom-check")
async def symptom_check(payload: SymptomMessage):
    # store user message
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=payload.session_id,
        role="user",
        content=payload.message,
        created_at=now_iso(),
    )
    await db.chat_messages.insert_one(user_msg.dict())

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=payload.session_id,
            system_message=SYMPTOM_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        reply = await chat.send_message(UserMessage(text=payload.message))
    except Exception as e:
        logging.exception("LLM error")
        reply = "I'm having trouble connecting right now. Could you describe your main symptom briefly?"

    ai_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=payload.session_id,
        role="assistant",
        content=reply,
        created_at=now_iso(),
    )
    await db.chat_messages.insert_one(ai_msg.dict())
    return {"reply": reply, "message_id": ai_msg.id}


@api_router.get("/symptom-check/{session_id}/messages", response_model=List[ChatMessage])
async def get_chat_messages(session_id: str):
    msgs = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [ChatMessage(**m) for m in msgs]


# ===== Prescriptions =====
class MedicationItem(BaseModel):
    name: str
    dosage: str
    frequency: str
    duration: str


class PrescriptionCreate(BaseModel):
    visit_id: str
    doctor_id: str
    diagnosis: str
    medications: List[MedicationItem]
    notes: Optional[str] = ""


class Prescription(BaseModel):
    id: str
    visit_id: str
    doctor_id: str
    doctor_name: str
    patient_name: str
    diagnosis: str
    medications: List[MedicationItem]
    notes: str
    created_at: str


@api_router.post("/prescriptions", response_model=Prescription)
async def create_prescription(payload: PrescriptionCreate):
    visit = await db.visits.find_one({"id": payload.visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, "Visit not found")
    doc = await db.doctors.find_one({"id": payload.doctor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Doctor not found")
    rx = Prescription(
        id=str(uuid.uuid4()),
        visit_id=payload.visit_id,
        doctor_id=payload.doctor_id,
        doctor_name=doc["name"],
        patient_name=visit["patient_name"],
        diagnosis=payload.diagnosis,
        medications=payload.medications,
        notes=payload.notes or "",
        created_at=now_iso(),
    )
    # upsert (one prescription per visit)
    await db.prescriptions.update_one(
        {"visit_id": payload.visit_id}, {"$set": rx.dict()}, upsert=True
    )
    return rx


@api_router.get("/visits/{visit_id}/prescription", response_model=Optional[Prescription])
async def get_prescription(visit_id: str):
    rx = await db.prescriptions.find_one({"visit_id": visit_id}, {"_id": 0})
    return Prescription(**rx) if rx else None


# ===== Invoices =====
class Invoice(BaseModel):
    id: str
    visit_id: str
    patient_name: str
    doctor_name: str
    consultation_fee: int
    service_charge: int
    tax: int
    total: int
    status: str  # "paid" | "pending"
    issued_at: str


async def ensure_invoice(visit: dict) -> dict:
    existing = await db.invoices.find_one({"visit_id": visit["id"]}, {"_id": 0})
    if existing:
        return existing
    fee = visit.get("fee") or 1499
    service = int(round(fee * 0.05))
    tax = int(round((fee + service) * 0.18))
    total = fee + service + tax
    inv = Invoice(
        id=str(uuid.uuid4()),
        visit_id=visit["id"],
        patient_name=visit["patient_name"],
        doctor_name=visit.get("doctor_name") or "NURTIX Doctor",
        consultation_fee=fee,
        service_charge=service,
        tax=tax,
        total=total,
        status="paid",
        issued_at=now_iso(),
    )
    await db.invoices.insert_one(inv.dict())
    return inv.dict()


@api_router.get("/visits/{visit_id}/invoice", response_model=Optional[Invoice])
async def get_invoice(visit_id: str):
    v = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Visit not found")
    if v["status"] != "completed":
        return None
    inv = await ensure_invoice(v)
    inv.pop("_id", None)
    return Invoice(**inv)


# ===== Earnings & Withdrawals =====
class WithdrawRequest(BaseModel):
    amount: int
    method: str = "bank_transfer"


class Withdrawal(BaseModel):
    id: str
    doctor_id: str
    amount: int
    method: str
    status: str  # "pending" | "completed"
    requested_at: str


@api_router.get("/doctors/{doctor_id}/earnings")
async def doctor_earnings(doctor_id: str):
    completed = await db.visits.find(
        {"doctor_id": doctor_id, "status": "completed"}, {"_id": 0}
    ).to_list(1000)
    total_earned = sum((v.get("fee") or 0) for v in completed)
    # doctor gets 85% (platform fee 15%)
    net_earned = int(round(total_earned * 0.85))
    withdrawals = await db.withdrawals.find({"doctor_id": doctor_id}, {"_id": 0}).to_list(1000)
    withdrawn = sum(w["amount"] for w in withdrawals if w["status"] == "completed")
    pending_wd = sum(w["amount"] for w in withdrawals if w["status"] == "pending")
    available = net_earned - withdrawn - pending_wd
    last7 = completed[-7:] if len(completed) > 7 else completed
    return {
        "visits_completed": len(completed),
        "total_earned": total_earned,
        "net_earned": net_earned,
        "available": max(available, 0),
        "withdrawn": withdrawn,
        "pending_withdrawal": pending_wd,
        "this_week_visits": len(last7),
        "this_week_earnings": int(round(sum((v.get("fee") or 0) for v in last7) * 0.85)),
    }


@api_router.post("/doctors/{doctor_id}/withdraw", response_model=Withdrawal)
async def request_withdrawal(doctor_id: str, payload: WithdrawRequest):
    earnings = await doctor_earnings(doctor_id)
    if payload.amount <= 0 or payload.amount > earnings["available"]:
        raise HTTPException(400, "Invalid withdrawal amount")
    wd = Withdrawal(
        id=str(uuid.uuid4()),
        doctor_id=doctor_id,
        amount=payload.amount,
        method=payload.method,
        status="pending",
        requested_at=now_iso(),
    )
    await db.withdrawals.insert_one(wd.dict())
    return wd


@api_router.get("/doctors/{doctor_id}/withdrawals", response_model=List[Withdrawal])
async def list_withdrawals(doctor_id: str):
    wds = await db.withdrawals.find({"doctor_id": doctor_id}, {"_id": 0}).sort("requested_at", -1).to_list(100)
    return [Withdrawal(**w) for w in wds]


# Submit a review
class ReviewCreate(BaseModel):
    doctor_id: str
    patient_name: str
    rating: int
    comment: str


@api_router.post("/reviews", response_model=Review)
async def create_review(payload: ReviewCreate):
    review = Review(
        id=str(uuid.uuid4()),
        doctor_id=payload.doctor_id,
        patient_name=payload.patient_name,
        rating=payload.rating,
        comment=payload.comment,
        created_at=now_iso(),
    )
    await db.reviews.insert_one(review.dict())
    # update doctor rating snapshot
    revs = await db.reviews.find({"doctor_id": payload.doctor_id}, {"_id": 0}).to_list(1000)
    avg = round(sum(r["rating"] for r in revs) / len(revs), 2)
    await db.doctors.update_one(
        {"id": payload.doctor_id}, {"$set": {"rating": avg, "reviews_count": len(revs)}}
    )
    return review


# ===== Payments (Stripe Checkout) =====
class PaymentTransaction(BaseModel):
    id: str
    visit_id: str
    invoice_id: str
    patient_id: str
    amount: float
    currency: str
    session_id: str
    payment_status: str
    status: str
    metadata: dict
    created_at: str


class CheckoutRequest(BaseModel):
    visit_id: str
    origin_url: str


@api_router.post("/payments/checkout/session")
async def create_checkout(payload: CheckoutRequest, request: Request):
    if not STRIPE_API_KEY:
        raise HTTPException(500, "Stripe not configured")
    v = await db.visits.find_one({"id": payload.visit_id}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Visit not found")
    if v["status"] != "completed":
        raise HTTPException(400, "Visit not completed yet")

    inv = await ensure_invoice(v)
    if isinstance(inv, dict):
        inv.pop("_id", None)
    if inv["status"] == "paid":
        raise HTTPException(400, "Invoice already paid")

    amount = float(inv["total"])
    currency = "inr"
    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/invoice/{v['id']}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/invoice/{v['id']}"

    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    req = CheckoutSessionRequest(
        amount=amount,
        currency=currency,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "visit_id": v["id"],
            "invoice_id": inv["id"],
            "patient_id": v["patient_id"],
            "type": "visit_payment",
        },
    )
    session = await stripe.create_checkout_session(req)

    tx = PaymentTransaction(
        id=str(uuid.uuid4()),
        visit_id=v["id"],
        invoice_id=inv["id"],
        patient_id=v["patient_id"],
        amount=amount,
        currency=currency,
        session_id=session.session_id,
        payment_status="initiated",
        status="open",
        metadata={"type": "visit_payment"},
        created_at=now_iso(),
    )
    await db.payment_transactions.insert_one(tx.dict())
    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/payments/checkout/status/{session_id}")
async def check_status(session_id: str, request: Request):
    if not STRIPE_API_KEY:
        raise HTTPException(500, "Stripe not configured")
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    st = await stripe.get_checkout_status(session_id)
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Transaction not found")

    if tx["payment_status"] != "paid" and st.payment_status == "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "status": st.status}},
        )
        await db.invoices.update_one(
            {"id": tx["invoice_id"]}, {"$set": {"status": "paid"}}
        )
    elif st.status == "expired" and tx["payment_status"] == "initiated":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "expired", "status": "expired"}},
        )

    return {
        "status": st.status,
        "payment_status": st.payment_status,
        "amount_total": st.amount_total,
        "currency": st.currency,
    }


@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    if not STRIPE_API_KEY:
        return {"ok": False}
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    try:
        resp = await stripe.handle_webhook(body, sig)
    except Exception as e:
        logging.exception("Webhook error")
        return {"ok": False, "error": str(e)}
    if resp.payment_status == "paid" and resp.session_id:
        tx = await db.payment_transactions.find_one(
            {"session_id": resp.session_id}, {"_id": 0}
        )
        if tx and tx["payment_status"] != "paid":
            await db.payment_transactions.update_one(
                {"session_id": resp.session_id},
                {"$set": {"payment_status": "paid", "status": "complete"}},
            )
            await db.invoices.update_one(
                {"id": tx["invoice_id"]}, {"$set": {"status": "paid"}}
            )
    return {"ok": True}


# ===== Doctor Stripe Connect (bank setup — payout MOCKED) =====
class BankDetails(BaseModel):
    account_holder: str
    account_number: str
    ifsc: str


@api_router.post("/doctors/{doctor_id}/bank")
async def save_bank(doctor_id: str, payload: BankDetails):
    doc = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Doctor not found")
    if len(payload.account_number) < 4:
        raise HTTPException(400, "Invalid account number")
    bank = {
        "account_holder": payload.account_holder,
        "account_number_masked": "•••• " + payload.account_number[-4:],
        "ifsc": payload.ifsc.upper(),
        "connect_status": "verified_simulated",
        "linked_at": now_iso(),
    }
    await db.doctors.update_one({"id": doctor_id}, {"$set": {"bank": bank}})
    return bank


@api_router.get("/doctors/{doctor_id}/bank")
async def get_bank(doctor_id: str):
    doc = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Doctor not found")
    return doc.get("bank")




app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
