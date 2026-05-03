"""NURTIX backend API tests - covers auth, doctors, visits, symptom-check, reviews."""
import os
import uuid
import pytest
import requests

BASE_URL = "https://symptom-check-20.preview.emergentagent.com"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Health / doctors ----------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert "NURTIX" in r.json().get("message", "")


def test_list_doctors_seeded(s):
    r = s.get(f"{API}/doctors")
    assert r.status_code == 200
    docs = r.json()
    assert isinstance(docs, list) and len(docs) >= 5
    names = [d["name"] for d in docs]
    assert "Dr. Aisha Patel" in names
    assert all("id" in d and "fee" in d and "location" in d for d in docs)


def test_list_doctors_online_only(s):
    r = s.get(f"{API}/doctors?online_only=true")
    assert r.status_code == 200
    assert all(d["online"] is True for d in r.json())


def test_get_doctor_and_reviews(s):
    r = s.get(f"{API}/doctors/doc-1")
    assert r.status_code == 200
    assert r.json()["name"] == "Dr. Aisha Patel"
    rv = s.get(f"{API}/doctors/doc-1/reviews")
    assert rv.status_code == 200
    assert len(rv.json()) >= 1


def test_get_doctor_404(s):
    assert s.get(f"{API}/doctors/nope").status_code == 404


# ---------- Auth ----------
def test_login_patient(s):
    r = s.post(f"{API}/auth/login", json={"name": "TEST_Priya", "role": "patient"})
    assert r.status_code == 200
    u = r.json()
    assert u["role"] == "patient" and u["name"] == "TEST_Priya" and u["id"]


def test_login_doctor(s):
    r = s.post(f"{API}/auth/login", json={"name": "Dr. Aisha Patel", "role": "doctor"})
    assert r.status_code == 200
    assert r.json()["role"] == "doctor"


# ---------- Visits lifecycle ----------
@pytest.fixture(scope="module")
def patient(s):
    r = s.post(f"{API}/auth/login", json={"name": f"TEST_P_{uuid.uuid4().hex[:6]}", "role": "patient"})
    return r.json()


@pytest.fixture(scope="module")
def visit(s, patient):
    payload = {
        "patient_id": patient["id"],
        "patient_name": patient["name"],
        "address": "221B Baker St",
        "symptoms": "Fever and cough",
        "urgency": "urgent",
        "patient_location": {"lat": 12.97, "lng": 77.59},
    }
    r = s.post(f"{API}/visits", json=payload)
    assert r.status_code == 200
    v = r.json()
    assert v["status"] == "pending" and v["id"]
    return v


def test_patient_visits_history(s, patient, visit):
    r = s.get(f"{API}/visits/patient/{patient['id']}")
    assert r.status_code == 200
    ids = [v["id"] for v in r.json()]
    assert visit["id"] in ids


def test_doctor_feed_contains_pending(s, visit):
    r = s.get(f"{API}/visits/doctor/feed")
    assert r.status_code == 200
    ids = [v["id"] for v in r.json()]
    assert visit["id"] in ids


def test_accept_visit(s, visit):
    r = s.patch(f"{API}/visits/{visit['id']}/accept?doctor_id=doc-1")
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["status"] == "accepted"
    assert v["doctor_id"] == "doc-1"
    assert v["eta_minutes"] == 18
    assert v["fee"] == 1499

    # verify persistence
    g = s.get(f"{API}/visits/{visit['id']}").json()
    assert g["status"] == "accepted" and g["doctor_name"] == "Dr. Aisha Patel"


def test_accept_unavailable(s, visit):
    # already accepted -> should fail
    r = s.patch(f"{API}/visits/{visit['id']}/accept?doctor_id=doc-2")
    assert r.status_code == 400


def test_status_transitions(s, visit):
    for status in ["en_route", "arrived", "completed"]:
        r = s.patch(f"{API}/visits/{visit['id']}/status", json={"status": status})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == status
    g = s.get(f"{API}/visits/{visit['id']}").json()
    assert g["status"] == "completed" and g.get("completed_at")


def test_doctor_active_empty_after_complete(s):
    r = s.get(f"{API}/visits/doctor/doc-1/active")
    assert r.status_code == 200
    # completed visits should NOT appear
    assert all(v["status"] in ["accepted", "en_route", "arrived"] for v in r.json())


# ---------- Symptom checker (Claude) ----------
def test_symptom_check_claude(s):
    session_id = f"TEST_sess_{uuid.uuid4().hex[:8]}"
    r = s.post(f"{API}/symptom-check",
               json={"session_id": session_id, "message": "I have a mild headache and slight fever since morning."},
               timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "reply" in data and isinstance(data["reply"], str) and len(data["reply"]) > 10
    # Multi-turn
    r2 = s.post(f"{API}/symptom-check",
                json={"session_id": session_id, "message": "It's around 99.5F, no chills."},
                timeout=60)
    assert r2.status_code == 200
    assert len(r2.json()["reply"]) > 5

    # persistence
    msgs = s.get(f"{API}/symptom-check/{session_id}/messages").json()
    assert len(msgs) >= 4  # 2 user + 2 assistant
    roles = [m["role"] for m in msgs]
    assert "user" in roles and "assistant" in roles


# ---------- Reviews ----------
def test_create_review_updates_rating(s):
    r = s.post(f"{API}/reviews", json={
        "doctor_id": "doc-5",
        "patient_name": "TEST_Reviewer",
        "rating": 5,
        "comment": "TEST review comment"
    })
    assert r.status_code == 200
    rev = r.json()
    assert rev["id"] and rev["rating"] == 5
    # verify doctor snapshot updated
    d = s.get(f"{API}/doctors/doc-5").json()
    assert d["reviews_count"] >= 2
