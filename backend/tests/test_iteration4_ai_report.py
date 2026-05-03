"""Iteration 4 tests: AI symptom report + visit with symptom_report_id.

Covers:
- POST /api/symptom-check returns user_turns + ready_for_report
- POST /api/symptom-check/{sid}/report returns structured report
- GET /api/symptom-check/{sid}/report returns saved report (or null)
- POST /api/visits with symptom_report_id copies summary into visit
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://symptom-check-20.preview.emergentagent.com"
API = f"{BASE_URL.rstrip('/')}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Symptom check -- new fields ----------
@pytest.fixture(scope="module")
def chat_session(s):
    """Run a 3-turn symptom conversation and return the session_id."""
    sid = f"TEST_s4_{uuid.uuid4().hex[:8]}"
    turns = [
        "I have had a mild headache and slight fever since yesterday.",
        "Temperature is around 99.8F, no chills. Adult, 32 yrs.",
        "Just a dull headache and tiredness. No chest pain, no vomiting.",
    ]
    last = None
    for msg in turns:
        r = s.post(f"{API}/symptom-check",
                   json={"session_id": sid, "message": msg}, timeout=90)
        assert r.status_code == 200, r.text
        last = r.json()
    return {"session_id": sid, "last": last}


def test_symptom_check_returns_user_turns_and_ready(s, chat_session):
    last = chat_session["last"]
    assert "user_turns" in last, "user_turns missing from response"
    assert "ready_for_report" in last, "ready_for_report missing from response"
    assert isinstance(last["user_turns"], int)
    assert last["user_turns"] >= 3
    assert last["ready_for_report"] is True


def test_symptom_check_first_turn_not_ready(s):
    sid = f"TEST_s4b_{uuid.uuid4().hex[:8]}"
    r = s.post(f"{API}/symptom-check",
               json={"session_id": sid, "message": "Stomach ache after lunch."}, timeout=90)
    assert r.status_code == 200
    d = r.json()
    assert d.get("user_turns") == 1
    assert d.get("ready_for_report") is False


# ---------- Generate report ----------
@pytest.fixture(scope="module")
def report(s, chat_session):
    sid = chat_session["session_id"]
    r = s.post(f"{API}/symptom-check/{sid}/report", timeout=120)
    assert r.status_code == 200, r.text
    return r.json()


def test_report_has_required_structured_fields(report):
    required = [
        "id", "session_id", "chief_complaint", "duration", "severity",
        "key_symptoms", "red_flags", "patient_summary",
        "suggested_initial_medications", "triage_recommendation", "urgency",
    ]
    for k in required:
        assert k in report, f"report missing field: {k}"
    assert isinstance(report["key_symptoms"], list)
    assert isinstance(report["red_flags"], list)
    assert isinstance(report["suggested_initial_medications"], list)
    assert report["triage_recommendation"] in ("home_visit", "emergency", "self_care")
    assert report["urgency"] in ("routine", "urgent", "asap")
    assert report["severity"] in ("mild", "moderate", "severe")
    assert len(report["patient_summary"]) > 10
    assert len(report["chief_complaint"]) > 0


def test_get_report_persisted(s, chat_session, report):
    sid = chat_session["session_id"]
    r = s.get(f"{API}/symptom-check/{sid}/report")
    assert r.status_code == 200
    data = r.json()
    assert data is not None, "GET report returned null after POST"
    assert data["id"] == report["id"]
    assert data["session_id"] == sid
    assert data["chief_complaint"] == report["chief_complaint"]


def test_get_report_none_for_unknown_session(s):
    sid = f"TEST_no_report_{uuid.uuid4().hex[:8]}"
    r = s.get(f"{API}/symptom-check/{sid}/report")
    assert r.status_code == 200
    assert r.json() is None


# ---------- Visit with symptom_report_id ----------
def test_create_visit_with_symptom_report_copies_summary(s, chat_session, report):
    # create a patient
    p = s.post(f"{API}/auth/login",
               json={"name": f"TEST_P4_{uuid.uuid4().hex[:6]}", "role": "patient"}).json()
    payload = {
        "patient_id": p["id"],
        "patient_name": p["name"],
        "address": "12 Linden Ave, Indiranagar",
        "symptoms": "ignored-should-be-overwritten",
        "urgency": "routine",  # should be overwritten by report.urgency
        "patient_location": {"lat": 12.9716, "lng": 77.5946},
        "symptom_report_id": report["id"],
    }
    r = s.post(f"{API}/visits", json=payload)
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["symptom_report_id"] == report["id"]
    assert v["symptom_summary"] is not None, "visit.symptom_summary not copied"
    summary = v["symptom_summary"]
    # summary should carry forward key fields from the report
    for k in ("chief_complaint", "patient_summary", "suggested_initial_medications",
              "key_symptoms", "triage_recommendation", "urgency"):
        assert k in summary, f"summary missing {k}"
    assert summary["chief_complaint"] == report["chief_complaint"]
    # urgency should be from report, not payload
    assert v["urgency"] == report["urgency"]
    # symptoms text should become chief_complaint
    assert v["symptoms"] == report["chief_complaint"]

    # verify persistence
    g = s.get(f"{API}/visits/{v['id']}").json()
    assert g["symptom_summary"] is not None
    assert g["symptom_summary"]["chief_complaint"] == report["chief_complaint"]


def test_create_visit_without_report_has_null_summary(s):
    p = s.post(f"{API}/auth/login",
               json={"name": f"TEST_P4b_{uuid.uuid4().hex[:6]}", "role": "patient"}).json()
    payload = {
        "patient_id": p["id"],
        "patient_name": p["name"],
        "address": "1 Test Rd",
        "symptoms": "Plain fever",
        "urgency": "urgent",
        "patient_location": {"lat": 12.9716, "lng": 77.5946},
    }
    r = s.post(f"{API}/visits", json=payload)
    assert r.status_code == 200
    v = r.json()
    assert v.get("symptom_report_id") is None
    assert v.get("symptom_summary") is None
    assert v["symptoms"] == "Plain fever"
    assert v["urgency"] == "urgent"


# ---------- Doctor feed + active include symptom fields ----------
def test_doctor_feed_exposes_symptom_summary_field(s):
    r = s.get(f"{API}/visits/doctor/feed")
    assert r.status_code == 200
    visits = r.json()
    # at least structurally every returned visit has the field (even if None)
    for v in visits:
        assert "symptom_summary" in v
        assert "symptom_report_id" in v
