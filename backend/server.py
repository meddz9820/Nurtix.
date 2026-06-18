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
    gender: Optional[Literal["female", "male", "other"]] = None


class User(BaseModel):
    id: str
    name: str
    role: str
    email: Optional[str] = None
    gender: Optional[str] = None


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
    location: dict
    online: bool = True
    gender: Optional[str] = None
    qualifications: List[str] = []
    trust_badges: List[str] = []


class Review(BaseModel):
    id: str
    doctor_id: str
    visit_id: Optional[str] = None
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
    patient_location: dict
    symptom_report_id: Optional[str] = None
    patient_gender: Optional[str] = None
    mcq_answers: Optional[dict] = None


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
    symptom_report_id: Optional[str] = None
    symptom_summary: Optional[dict] = None
    patient_gender: Optional[str] = None
    female_only: bool = False
    mcq_answers: Optional[dict] = None


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
        "qualifications": ["MBBS, AIIMS Delhi (2012)", "MD - Family Medicine, PGI Chandigarh (2016)", "Member, Indian Medical Association", "BLS & ACLS Certified"],
        "trust_badges": ["Govt ID verified", "Background checked", "Drug-screened", "Insurance covered"],
        "verified": True,
        "rating": 4.9,
        "reviews_count": 247,
        "years_experience": 11,
        "fee": 1499,
        "location": {"lat": 12.9716, "lng": 77.5946, "area": "Indiranagar"},
        "online": True,
        "gender": "female",
    },
    {
        "id": "doc-2",
        "name": "Dr. Marcus Chen",
        "specialty": "Internal Medicine",
        "bio": "Internal medicine specialist with expertise in acute care, fevers, and respiratory conditions. Available for late-night urgent calls.",
        "avatar": "https://images.unsplash.com/photo-1612531386530-97286d97c2d2?crop=entropy&cs=srgb&fm=jpg&w=400&q=85",
        "credentials": ["MD Internal Medicine", "Fellowship - Acute Care", "Board Certified"],
        "qualifications": ["MBBS, KMC Manipal (2014)", "MD - Internal Medicine, CMC Vellore (2018)", "Fellowship in Acute Care Medicine", "ECFMG Certified"],
        "trust_badges": ["Govt ID verified", "Background checked", "Drug-screened", "Insurance covered"],
        "verified": True,
        "rating": 4.8,
        "reviews_count": 189,
        "years_experience": 9,
        "fee": 1799,
        "location": {"lat": 12.9352, "lng": 77.6245, "area": "Koramangala"},
        "online": True,
        "gender": "male",
    },
    {
        "id": "doc-3",
        "name": "Dr. Sara Iyer",
        "specialty": "Pediatrics",
        "bio": "Pediatrician dedicated to infant and child wellness. Soft-spoken, patient with anxious parents, and skilled at quick diagnoses.",
        "avatar": "https://images.unsplash.com/photo-1758691463393-a2aa9900af8a?crop=entropy&cs=srgb&fm=jpg&w=400&q=85",
        "credentials": ["MBBS", "MD Pediatrics", "Neonatal Care Certified"],
        "qualifications": ["MBBS, Grant Medical College, Mumbai (2009)", "MD - Pediatrics, KEM Hospital (2013)", "Neonatal Care Specialist Certification", "Fellow, Indian Academy of Pediatrics"],
        "trust_badges": ["Govt ID verified", "Background checked", "Drug-screened", "Pediatric-safe protocols"],
        "verified": True,
        "rating": 5.0,
        "reviews_count": 312,
        "years_experience": 14,
        "fee": 1899,
        "location": {"lat": 12.9081, "lng": 77.6476, "area": "HSR Layout"},
        "online": True,
        "gender": "female",
    },
    {
        "id": "doc-4",
        "name": "Dr. Rajesh Kumar",
        "specialty": "Geriatric Care",
        "bio": "Geriatric care specialist for elderly patients. Patient, gentle, and experienced with chronic condition management at home.",
        "avatar": "https://images.unsplash.com/photo-1612531386530-97286d97c2d2?crop=entropy&cs=srgb&fm=jpg&w=400&q=85",
        "credentials": ["MD Geriatrics", "Palliative Care Certified", "Board Certified"],
        "qualifications": ["MBBS, MAMC Delhi (2006)", "MD - Geriatric Medicine, AIIMS Delhi (2010)", "Palliative Care Certification (UK)", "20+ years home care experience"],
        "trust_badges": ["Govt ID verified", "Background checked", "Drug-screened", "Elderly-care trained"],
        "verified": True,
        "rating": 4.7,
        "reviews_count": 156,
        "years_experience": 18,
        "fee": 1999,
        "location": {"lat": 12.9784, "lng": 77.6408, "area": "Whitefield"},
        "online": False,
        "gender": "male",
    },
    {
        "id": "doc-5",
        "name": "Dr. Nina Verma",
        "specialty": "General Practice",
        "bio": "GP with rapid response training. Fastest ETA in the network for urgent visits in central area.",
        "avatar": "https://images.unsplash.com/photo-1758691463393-a2aa9900af8a?crop=entropy&cs=srgb&fm=jpg&w=400&q=85",
        "credentials": ["MBBS", "Emergency Care Trained"],
        "qualifications": ["MBBS, BJ Medical College Pune (2018)", "Diploma in Emergency Medicine", "BLS/ACLS Certified", "Rapid Response Trained"],
        "trust_badges": ["Govt ID verified", "Background checked", "Drug-screened", "Insurance covered"],
        "verified": True,
        "rating": 4.85,
        "reviews_count": 98,
        "years_experience": 6,
        "fee": 1299,
        "location": {"lat": 12.9698, "lng": 77.7500, "area": "Marathahalli"},
        "online": True,
        "gender": "female",
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


SEED_DARK_STORES = [
    {
        "id": "ds-indiranagar",
        "name": "Indiranagar Hub",
        "area": "Indiranagar",
        "location": {"lat": 12.9716, "lng": 77.5946},
        "inventory": {
            "paracetamol_500": 240,
            "ibuprofen_400": 180,
            "amoxicillin_500": 90,
            "ors_sachets": 320,
            "cetirizine_10": 200,
            "antiseptic_kit": 60,
            "thermometer": 25,
            "bandages": 150,
        },
    },
    {
        "id": "ds-koramangala",
        "name": "Koramangala Hub",
        "area": "Koramangala",
        "location": {"lat": 12.9352, "lng": 77.6245},
        "inventory": {
            "paracetamol_500": 300,
            "ibuprofen_400": 200,
            "amoxicillin_500": 110,
            "ors_sachets": 280,
            "cetirizine_10": 240,
            "antiseptic_kit": 75,
            "thermometer": 30,
            "bandages": 180,
        },
    },
    {
        "id": "ds-hsr",
        "name": "HSR Layout Hub",
        "area": "HSR Layout",
        "location": {"lat": 12.9081, "lng": 77.6476},
        "inventory": {
            "paracetamol_500": 220,
            "ibuprofen_400": 160,
            "amoxicillin_500": 80,
            "ors_sachets": 250,
            "cetirizine_10": 190,
            "antiseptic_kit": 55,
            "thermometer": 20,
            "bandages": 140,
        },
    },
]

MED_CATALOG = {
    "paracetamol_500": {"name": "Paracetamol 500mg", "default_qty": 10},
    "ibuprofen_400": {"name": "Ibuprofen 400mg", "default_qty": 10},
    "amoxicillin_500": {"name": "Amoxicillin 500mg", "default_qty": 15},
    "ors_sachets": {"name": "ORS Sachets", "default_qty": 6},
    "cetirizine_10": {"name": "Cetirizine 10mg", "default_qty": 10},
    "antiseptic_kit": {"name": "Antiseptic Kit", "default_qty": 1},
    "thermometer": {"name": "Digital Thermometer", "default_qty": 1},
    "bandages": {"name": "Bandage Roll", "default_qty": 3},
}


@app.on_event("startup")
async def seed_data():
    # Force re-seed to pick up new schema fields (idempotent at app boot)
    await db.doctors.delete_many({})
    await db.doctors.insert_many([d.copy() for d in SEED_DOCTORS])
    if await db.reviews.count_documents({}) == 0:
        await db.reviews.insert_many([r.copy() for r in SEED_REVIEWS])
    # seed dark stores + doctor kits
    if await db.dark_stores.count_documents({}) == 0:
        await db.dark_stores.insert_many([s.copy() for s in SEED_DARK_STORES])
    logging.info("Seeded doctors / reviews / dark stores")


# ===== Routes =====
@api_router.get("/")
async def root():
    return {"message": "NURTIX API"}


@api_router.post("/auth/login", response_model=User)
async def login(payload: UserLogin):
    existing = await db.users.find_one({"name": payload.name, "role": payload.role}, {"_id": 0})
    if existing:
        # update gender if newly provided
        if payload.gender and existing.get("gender") != payload.gender:
            await db.users.update_one(
                {"id": existing["id"]}, {"$set": {"gender": payload.gender}}
            )
            existing["gender"] = payload.gender
        return User(**existing)
    user = User(
        id=str(uuid.uuid4()),
        name=payload.name,
        role=payload.role,
        email=payload.email,
        gender=payload.gender,
    )
    await db.users.insert_one(user.dict())
    return user


@api_router.get("/doctors", response_model=List[Doctor])
async def list_doctors(online_only: bool = False, gender: Optional[str] = None):
    query: dict = {}
    if online_only:
        query["online"] = True
    if gender:
        query["gender"] = gender
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
    summary = None
    urgency = payload.urgency
    symptoms = payload.symptoms
    if payload.symptom_report_id:
        rpt = await db.symptom_reports.find_one({"id": payload.symptom_report_id}, {"_id": 0})
        if rpt:
            summary = {
                "chief_complaint": rpt.get("chief_complaint"),
                "duration": rpt.get("duration"),
                "severity": rpt.get("severity"),
                "key_symptoms": rpt.get("key_symptoms", []),
                "red_flags": rpt.get("red_flags", []),
                "patient_summary": rpt.get("patient_summary"),
                "suggested_initial_medications": rpt.get("suggested_initial_medications", []),
                "triage_recommendation": rpt.get("triage_recommendation"),
                "urgency": rpt.get("urgency"),
            }
            urgency = rpt.get("urgency", urgency)
            symptoms = rpt.get("chief_complaint") or symptoms

    visit = Visit(
        id=str(uuid.uuid4()),
        patient_id=payload.patient_id,
        patient_name=payload.patient_name,
        address=payload.address,
        symptoms=symptoms,
        urgency=urgency,
        patient_location=payload.patient_location,
        status="pending",
        created_at=now_iso(),
        symptom_report_id=payload.symptom_report_id,
        symptom_summary=summary,
        patient_gender=payload.patient_gender,
        female_only=(payload.patient_gender == "female"),
        mcq_answers=payload.mcq_answers,
    )
    await db.visits.insert_one(visit.dict())
    return visit


@api_router.get("/visits/doctor/feed", response_model=List[Visit])
async def doctor_feed(doctor_id: Optional[str] = None):
    # SEQUENTIAL ROUTING LOCK: if doctor has an active trip, feed is empty
    if doctor_id:
        active_count = await db.visits.count_documents({
            "doctor_id": doctor_id,
            "status": {"$in": ["accepted", "en_route", "arrived"]},
        })
        if active_count > 0:
            return []
    query: dict = {"status": "pending"}
    if doctor_id:
        doc = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
        if doc and doc.get("gender") != "female":
            query["female_only"] = {"$ne": True}
    visits = await db.visits.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [Visit(**v) for v in visits]


@api_router.get("/visits/patient/{patient_id}", response_model=List[Visit])
async def patient_visits(patient_id: str):
    visits = await db.visits.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
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

    # count existing user turns to know if ready for report
    user_turn_count = await db.chat_messages.count_documents(
        {"session_id": payload.session_id, "role": "user"}
    )

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
    return {
        "reply": reply,
        "message_id": ai_msg.id,
        "user_turns": user_turn_count,
        "ready_for_report": user_turn_count >= 3,
    }


# ===== Symptom Report =====
REPORT_SYSTEM = """You are a medical triage report generator. Based on the conversation between patient and triage assistant, produce a concise, structured JSON summary for the visiting doctor.
Return ONLY valid JSON (no markdown) with keys:
{
  "chief_complaint": "one short line",
  "duration": "e.g., 2 days",
  "severity": "mild|moderate|severe",
  "key_symptoms": ["list of 2-5 symptoms"],
  "red_flags": ["list any urgent signs or empty list"],
  "patient_summary": "2-3 sentence summary",
  "suggested_initial_medications": [
     {"name": "generic OTC medicine", "reason": "brief rationale"}
  ],
  "triage_recommendation": "home_visit|emergency|self_care",
  "urgency": "routine|urgent|asap"
}
Keep suggested medications conservative OTC basics (e.g., paracetamol, ORS). Never prescribe antibiotics or schedule drugs.
If red flags detected, set triage_recommendation='emergency' and urgency='asap'.
"""


class SymptomReport(BaseModel):
    id: str
    session_id: str
    chief_complaint: str
    duration: str
    severity: str
    key_symptoms: List[str]
    red_flags: List[str]
    patient_summary: str
    suggested_initial_medications: List[dict]
    triage_recommendation: str
    urgency: str
    created_at: str


@api_router.post("/symptom-check/{session_id}/report", response_model=SymptomReport)
async def generate_report(session_id: str):
    msgs = await db.chat_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    if not msgs:
        raise HTTPException(404, "No conversation found")

    transcript = "\n".join(
        f"{'Patient' if m['role'] == 'user' else 'Assistant'}: {m['content']}" for m in msgs
    )

    import json as _json

    raw = ""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{session_id}-report",
            system_message=REPORT_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(
            UserMessage(text=f"Conversation transcript:\n{transcript}\n\nGenerate the JSON report now.")
        )
    except Exception as e:
        logging.exception("Report LLM error")

    # clean fenced code
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        data = _json.loads(cleaned)
    except Exception:
        data = {
            "chief_complaint": "Unspecified symptom",
            "duration": "Unknown",
            "severity": "moderate",
            "key_symptoms": [],
            "red_flags": [],
            "patient_summary": (msgs[0]["content"][:200] if msgs else ""),
            "suggested_initial_medications": [],
            "triage_recommendation": "home_visit",
            "urgency": "urgent",
        }

    report = SymptomReport(
        id=str(uuid.uuid4()),
        session_id=session_id,
        chief_complaint=data.get("chief_complaint", "Unspecified"),
        duration=data.get("duration", ""),
        severity=data.get("severity", "moderate"),
        key_symptoms=data.get("key_symptoms", []) or [],
        red_flags=data.get("red_flags", []) or [],
        patient_summary=data.get("patient_summary", ""),
        suggested_initial_medications=data.get("suggested_initial_medications", []) or [],
        triage_recommendation=data.get("triage_recommendation", "home_visit"),
        urgency=data.get("urgency", "urgent"),
        created_at=now_iso(),
    )
    # upsert (one report per session)
    await db.symptom_reports.update_one(
        {"session_id": session_id}, {"$set": report.dict()}, upsert=True
    )
    return report


@api_router.get("/symptom-check/{session_id}/report", response_model=Optional[SymptomReport])
async def get_report(session_id: str):
    r = await db.symptom_reports.find_one({"session_id": session_id}, {"_id": 0})
    return SymptomReport(**r) if r else None


# ===== MCQ Triage Wizard Report =====
class MCQAnswers(BaseModel):
    symptom_category: str
    duration: str
    severity: str
    patient_name: Optional[str] = "Patient"


SUGGESTED_MEDS_BY_CATEGORY = {
    "Fever/Chills": [
        {"name": "Paracetamol 500mg", "reason": "Reduces fever and body ache", "item_id": "paracetamol_500"},
        {"name": "ORS Sachets", "reason": "Maintain hydration", "item_id": "ors_sachets"},
    ],
    "Cough/Respiratory": [
        {"name": "Cetirizine 10mg", "reason": "Helps with allergic cough and congestion", "item_id": "cetirizine_10"},
        {"name": "Warm fluids", "reason": "Soothes the throat", "item_id": None},
    ],
    "Body Aches/Pain": [
        {"name": "Ibuprofen 400mg", "reason": "Anti-inflammatory pain relief", "item_id": "ibuprofen_400"},
        {"name": "Paracetamol 500mg", "reason": "Mild analgesic alternative", "item_id": "paracetamol_500"},
    ],
    "Gastrointestinal": [
        {"name": "ORS Sachets", "reason": "Rehydration is the priority", "item_id": "ors_sachets"},
        {"name": "Light diet (BRAT)", "reason": "Reduce gut irritation", "item_id": None},
    ],
    "Other": [
        {"name": "Doctor consultation", "reason": "Symptom unclear - in-person evaluation recommended", "item_id": None},
    ],
}


@api_router.post("/symptom-check/{session_id}/report-mcq", response_model=SymptomReport)
async def generate_mcq_report(session_id: str, payload: MCQAnswers):
    urgency = "asap" if payload.severity == "Severe" else ("urgent" if payload.severity == "Moderate" else "routine")
    triage = "emergency" if (payload.severity == "Severe" and payload.duration == "Less than 24 hours") else "home_visit"
    suggested = SUGGESTED_MEDS_BY_CATEGORY.get(payload.symptom_category, SUGGESTED_MEDS_BY_CATEGORY["Other"])
    summary = (
        f"{payload.patient_name} reports {payload.symptom_category.lower()} of {payload.severity.lower()} severity "
        f"for {payload.duration.lower()}. Home visit recommended for clinical assessment."
    )
    report = SymptomReport(
        id=str(uuid.uuid4()),
        session_id=session_id,
        chief_complaint=payload.symptom_category,
        duration=payload.duration,
        severity=payload.severity.lower(),
        key_symptoms=[payload.symptom_category],
        red_flags=[],
        patient_summary=summary,
        suggested_initial_medications=suggested,
        triage_recommendation=triage,
        urgency=urgency,
        created_at=now_iso(),
    )
    # also store the raw MCQ for downstream display
    doc = report.dict()
    doc["mcq_answers"] = {
        "symptom_category": payload.symptom_category,
        "duration": payload.duration,
        "severity": payload.severity,
    }
    await db.symptom_reports.update_one(
        {"session_id": session_id}, {"$set": doc}, upsert=True
    )
    return report



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
        status="pending",
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
    visit_id: Optional[str] = None


@api_router.post("/reviews", response_model=Review)
async def create_review(payload: ReviewCreate):
    if payload.visit_id:
        existing = await db.reviews.find_one({"visit_id": payload.visit_id}, {"_id": 0})
        if existing:
            return Review(**existing)
    review = Review(
        id=str(uuid.uuid4()),
        doctor_id=payload.doctor_id,
        visit_id=payload.visit_id,
        patient_name=payload.patient_name,
        rating=payload.rating,
        comment=payload.comment,
        created_at=now_iso(),
    )
    await db.reviews.insert_one(review.dict())
    revs = await db.reviews.find({"doctor_id": payload.doctor_id}, {"_id": 0}).to_list(1000)
    avg = round(sum(r["rating"] for r in revs) / len(revs), 2)
    await db.doctors.update_one(
        {"id": payload.doctor_id}, {"$set": {"rating": avg, "reviews_count": len(revs)}}
    )
    return review


@api_router.get("/visits/{visit_id}/review", response_model=Optional[Review])
async def get_visit_review(visit_id: str):
    r = await db.reviews.find_one({"visit_id": visit_id}, {"_id": 0})
    return Review(**r) if r else None


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

    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Transaction not found")

    try:
        st = await stripe.get_checkout_status(session_id)
        status_ = st.status
        payment_status = st.payment_status
        amount_total = st.amount_total
        currency = st.currency
    except Exception as e:
        logging.warning(f"checkout status upstream error: {e}; falling back to local tx")
        # Fallback to locally stored transaction state (webhook may have updated it)
        return {
            "status": tx.get("status", "open"),
            "payment_status": tx.get("payment_status", "initiated"),
            "amount_total": int(tx["amount"] * 100),
            "currency": tx["currency"],
        }

    if tx["payment_status"] != "paid" and payment_status == "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "status": status_}},
        )
        await db.invoices.update_one(
            {"id": tx["invoice_id"]}, {"$set": {"status": "paid"}}
        )
    elif status_ == "expired" and tx["payment_status"] == "initiated":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "expired", "status": "expired"}},
        )

    return {
        "status": status_,
        "payment_status": payment_status,
        "amount_total": amount_total,
        "currency": currency,
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


# ===== Decentralized Inventory =====
class QrCheckout(BaseModel):
    dark_store_id: str
    kit_code: str = "STANDARD_KIT_A"


@api_router.get("/dark-stores")
async def list_dark_stores():
    items = await db.dark_stores.find({}, {"_id": 0}).to_list(50)
    return items


@api_router.get("/doctors/{doctor_id}/kit")
async def get_kit(doctor_id: str):
    kit = await db.doctor_kits.find_one({"doctor_id": doctor_id}, {"_id": 0})
    return kit


@api_router.post("/doctors/{doctor_id}/kit/checkout")
async def kit_checkout(doctor_id: str, payload: QrCheckout):
    doc = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Doctor not found")
    store = await db.dark_stores.find_one({"id": payload.dark_store_id}, {"_id": 0})
    if not store:
        raise HTTPException(404, "Dark Store not found")

    standard_kit = {k: v["default_qty"] for k, v in MED_CATALOG.items()}
    # decrement store inventory atomically (simulated)
    for item_id, qty in standard_kit.items():
        current = store["inventory"].get(item_id, 0)
        if current < qty:
            raise HTTPException(400, f"Insufficient stock at {store['name']} for {item_id}")
    for item_id, qty in standard_kit.items():
        await db.dark_stores.update_one(
            {"id": store["id"]}, {"$inc": {f"inventory.{item_id}": -qty}}
        )

    kit_doc = {
        "doctor_id": doctor_id,
        "dark_store_id": store["id"],
        "dark_store_name": store["name"],
        "kit_code": payload.kit_code,
        "items": standard_kit,
        "checked_out_at": now_iso(),
    }
    await db.doctor_kits.update_one(
        {"doctor_id": doctor_id}, {"$set": kit_doc}, upsert=True
    )
    return kit_doc


@api_router.post("/visits/{visit_id}/validate-supply")
async def validate_supply(visit_id: str):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, "Visit not found")
    if not visit.get("doctor_id"):
        raise HTTPException(400, "Visit not assigned")
    kit = await db.doctor_kits.find_one({"doctor_id": visit["doctor_id"]}, {"_id": 0})
    if not kit:
        return {"ok": False, "reason": "No active kit. Scan a Dark Store QR first.", "missing": []}
    needed = []
    summary = visit.get("symptom_summary") or {}
    for m in summary.get("suggested_initial_medications", []) or []:
        iid = m.get("item_id")
        if iid and iid in MED_CATALOG:
            needed.append(iid)
    missing = [n for n in needed if (kit.get("items") or {}).get(n, 0) <= 0]
    return {"ok": len(missing) == 0, "needed": needed, "missing": missing, "kit_code": kit.get("kit_code")}


class DispenseItem(BaseModel):
    item_id: str
    qty: int = 1


class EndVisitPayload(BaseModel):
    visit_id: str
    doctor_id: str
    dispensed: List[DispenseItem]


@api_router.post("/visits/end")
async def end_visit_and_reconcile(payload: EndVisitPayload):
    visit = await db.visits.find_one({"id": payload.visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, "Visit not found")
    kit = await db.doctor_kits.find_one({"doctor_id": payload.doctor_id}, {"_id": 0})
    if not kit:
        raise HTTPException(400, "No active kit found")

    # 1) Deduct from doctor kit
    deducted = []
    for d in payload.dispensed:
        if d.item_id not in MED_CATALOG:
            continue
        current = (kit.get("items") or {}).get(d.item_id, 0)
        if current < d.qty:
            raise HTTPException(400, f"Insufficient {d.item_id} in doctor kit ({current} < {d.qty})")
        deducted.append({
            "item_id": d.item_id,
            "name": MED_CATALOG[d.item_id]["name"],
            "qty": d.qty,
        })
    for d in deducted:
        await db.doctor_kits.update_one(
            {"doctor_id": payload.doctor_id},
            {"$inc": {f"items.{d['item_id']}": -d["qty"]}},
        )
    # 2) Log depletion at dark store master count (re-use the store the kit came from)
    if kit.get("dark_store_id"):
        for d in deducted:
            await db.inventory_transactions.insert_one({
                "id": str(uuid.uuid4()),
                "dark_store_id": kit["dark_store_id"],
                "doctor_id": payload.doctor_id,
                "visit_id": payload.visit_id,
                "item_id": d["item_id"],
                "qty": d["qty"],
                "type": "dispensed_to_patient",
                "at": now_iso(),
            })
    # 3) Issue itemized receipt — store on visit & invoice
    receipt = {
        "dispensed": deducted,
        "kit_code": kit.get("kit_code"),
        "dark_store": kit.get("dark_store_name"),
        "issued_at": now_iso(),
    }
    await db.visits.update_one(
        {"id": payload.visit_id},
        {"$set": {"status": "completed", "completed_at": now_iso(), "dispensed_receipt": receipt}},
    )
    visit["status"] = "completed"
    visit["completed_at"] = now_iso()
    visit["dispensed_receipt"] = receipt
    await ensure_invoice(visit)
    await db.invoices.update_one(
        {"visit_id": payload.visit_id}, {"$set": {"dispensed": deducted}}
    )
    return {"ok": True, "receipt": receipt}


class WastageEntry(BaseModel):
    item_id: str
    qty: int
    reason: str


@api_router.post("/doctors/{doctor_id}/wastage")
async def log_wastage(doctor_id: str, payload: WastageEntry):
    if payload.item_id not in MED_CATALOG:
        raise HTTPException(400, "Unknown item")
    kit = await db.doctor_kits.find_one({"doctor_id": doctor_id}, {"_id": 0})
    if kit:
        current = (kit.get("items") or {}).get(payload.item_id, 0)
        deduct = min(current, payload.qty)
        if deduct > 0:
            await db.doctor_kits.update_one(
                {"doctor_id": doctor_id},
                {"$inc": {f"items.{payload.item_id}": -deduct}},
            )
    entry = {
        "id": str(uuid.uuid4()),
        "doctor_id": doctor_id,
        "item_id": payload.item_id,
        "item_name": MED_CATALOG[payload.item_id]["name"],
        "qty": payload.qty,
        "reason": payload.reason,
        "at": now_iso(),
    }
    await db.wastage_log.insert_one(entry)
    entry.pop("_id", None)
    return entry


@api_router.get("/doctors/{doctor_id}/wastage")
async def list_wastage(doctor_id: str):
    items = await db.wastage_log.find({"doctor_id": doctor_id}, {"_id": 0}).sort("at", -1).to_list(100)
    return items


# Re-include router so the newly added inventory routes are registered
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
