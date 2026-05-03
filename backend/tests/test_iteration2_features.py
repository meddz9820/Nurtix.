"""NURTIX iteration 2: earnings, withdrawals, prescriptions, invoices."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://symptom-check-20.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ===== Helpers: create a fresh patient + visit + accept by doc-1 =====
@pytest.fixture(scope="module")
def completed_visit(s):
    """Create a visit, accept by doc-1, complete it. Returns the completed visit dict."""
    patient_name = f"TEST_P_{uuid.uuid4().hex[:6]}"
    login = s.post(f"{API}/auth/login", json={"name": patient_name, "role": "patient"}).json()
    visit_payload = {
        "patient_id": login["id"],
        "patient_name": patient_name,
        "address": "42 Baker St",
        "symptoms": "Mild fever and body ache",
        "urgency": "urgent",
        "patient_location": {"lat": 12.97, "lng": 77.59},
    }
    v = s.post(f"{API}/visits", json=visit_payload).json()
    assert v["status"] == "pending"
    accepted = s.patch(f"{API}/visits/{v['id']}/accept?doctor_id=doc-1").json()
    assert accepted["status"] == "accepted"
    assert accepted["fee"] == 1499
    # move through states
    for st in ["en_route", "arrived", "completed"]:
        r = s.patch(f"{API}/visits/{v['id']}/status", json={"status": st})
        assert r.status_code == 200, r.text
    return s.get(f"{API}/visits/{v['id']}").json()


@pytest.fixture(scope="module")
def accepted_visit(s):
    """Visit accepted by doc-1 but still in 'accepted' state (not completed)."""
    patient_name = f"TEST_P_{uuid.uuid4().hex[:6]}"
    login = s.post(f"{API}/auth/login", json={"name": patient_name, "role": "patient"}).json()
    vp = {
        "patient_id": login["id"],
        "patient_name": patient_name,
        "address": "10 Test Rd",
        "symptoms": "Cough",
        "urgency": "routine",
        "patient_location": {"lat": 12.97, "lng": 77.59},
    }
    v = s.post(f"{API}/visits", json=vp).json()
    s.patch(f"{API}/visits/{v['id']}/accept?doctor_id=doc-1").json()
    return s.get(f"{API}/visits/{v['id']}").json()


# ===================== EARNINGS =====================
class TestEarnings:
    def test_earnings_shape(self, s, completed_visit):
        r = s.get(f"{API}/doctors/doc-1/earnings")
        assert r.status_code == 200
        e = r.json()
        for k in [
            "visits_completed", "total_earned", "net_earned", "available",
            "withdrawn", "pending_withdrawal", "this_week_visits", "this_week_earnings",
        ]:
            assert k in e, f"missing {k}"
        # net = 85% of gross
        assert e["net_earned"] == int(round(e["total_earned"] * 0.85))
        assert e["visits_completed"] >= 1
        assert e["total_earned"] >= 1499

    def test_earnings_available_equation(self, s):
        e = s.get(f"{API}/doctors/doc-1/earnings").json()
        expected_avail = max(e["net_earned"] - e["withdrawn"] - e["pending_withdrawal"], 0)
        assert e["available"] == expected_avail


# ===================== WITHDRAWALS =====================
class TestWithdrawals:
    def test_withdraw_too_much_rejected(self, s):
        e = s.get(f"{API}/doctors/doc-1/earnings").json()
        r = s.post(f"{API}/doctors/doc-1/withdraw", json={"amount": e["available"] + 10_000})
        assert r.status_code == 400

    def test_withdraw_zero_rejected(self, s):
        r = s.post(f"{API}/doctors/doc-1/withdraw", json={"amount": 0})
        assert r.status_code == 400

    def test_withdraw_valid_and_pending(self, s):
        e = s.get(f"{API}/doctors/doc-1/earnings").json()
        if e["available"] < 100:
            pytest.skip("not enough available balance")
        amount = min(100, e["available"])
        r = s.post(f"{API}/doctors/doc-1/withdraw", json={"amount": amount})
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["amount"] == amount and w["status"] == "pending" and w["doctor_id"] == "doc-1"
        # list
        wds = s.get(f"{API}/doctors/doc-1/withdrawals").json()
        assert any(x["id"] == w["id"] for x in wds)
        # earnings shows pending_withdrawal increased
        e2 = s.get(f"{API}/doctors/doc-1/earnings").json()
        assert e2["pending_withdrawal"] >= amount
        assert e2["available"] == e["available"] - amount


# ===================== PRESCRIPTIONS =====================
class TestPrescriptions:
    def test_prescription_none_initially(self, s, accepted_visit):
        r = s.get(f"{API}/visits/{accepted_visit['id']}/prescription")
        assert r.status_code == 200
        assert r.json() is None

    def test_create_and_get_prescription(self, s, accepted_visit):
        payload = {
            "visit_id": accepted_visit["id"],
            "doctor_id": "doc-1",
            "diagnosis": "Viral fever",
            "medications": [
                {"name": "Paracetamol", "dosage": "500mg", "frequency": "TID", "duration": "3 days"},
                {"name": "Cetirizine", "dosage": "10mg", "frequency": "OD", "duration": "5 days"},
            ],
            "notes": "Rest and hydrate",
        }
        r = s.post(f"{API}/prescriptions", json=payload)
        assert r.status_code == 200, r.text
        rx = r.json()
        assert rx["id"] and rx["doctor_name"] == "Dr. Aisha Patel"
        assert rx["patient_name"] == accepted_visit["patient_name"]
        assert len(rx["medications"]) == 2
        # GET persisted
        got = s.get(f"{API}/visits/{accepted_visit['id']}/prescription").json()
        assert got["id"] == rx["id"]
        assert got["diagnosis"] == "Viral fever"

    def test_prescription_upsert_one_per_visit(self, s, accepted_visit):
        payload = {
            "visit_id": accepted_visit["id"],
            "doctor_id": "doc-1",
            "diagnosis": "Updated dx",
            "medications": [{"name": "Azithromycin", "dosage": "500mg", "frequency": "OD", "duration": "3 days"}],
            "notes": "updated",
        }
        s.post(f"{API}/prescriptions", json=payload)
        got = s.get(f"{API}/visits/{accepted_visit['id']}/prescription").json()
        assert got["diagnosis"] == "Updated dx"
        assert len(got["medications"]) == 1


# ===================== INVOICES =====================
class TestInvoices:
    def test_invoice_null_when_not_completed(self, s, accepted_visit):
        r = s.get(f"{API}/visits/{accepted_visit['id']}/invoice")
        assert r.status_code == 200
        assert r.json() is None

    def test_invoice_after_completion(self, s, completed_visit):
        r = s.get(f"{API}/visits/{completed_visit['id']}/invoice")
        assert r.status_code == 200
        inv = r.json()
        assert inv is not None
        fee = completed_visit["fee"] or 1499
        service = int(round(fee * 0.05))
        tax = int(round((fee + service) * 0.18))
        total = fee + service + tax
        assert inv["consultation_fee"] == fee
        assert inv["service_charge"] == service
        assert inv["tax"] == tax
        assert inv["total"] == total
        assert inv["status"] == "paid"
        assert inv["patient_name"] == completed_visit["patient_name"]

    def test_invoice_idempotent(self, s, completed_visit):
        r1 = s.get(f"{API}/visits/{completed_visit['id']}/invoice").json()
        r2 = s.get(f"{API}/visits/{completed_visit['id']}/invoice").json()
        assert r1["id"] == r2["id"]
        assert r1["issued_at"] == r2["issued_at"]

    def test_invoice_auto_created_on_status_complete(self, s):
        # new visit -> accept -> complete -> invoice should exist
        patient_name = f"TEST_P_{uuid.uuid4().hex[:6]}"
        login = s.post(f"{API}/auth/login", json={"name": patient_name, "role": "patient"}).json()
        v = s.post(f"{API}/visits", json={
            "patient_id": login["id"],
            "patient_name": patient_name,
            "address": "Test 5",
            "symptoms": "headache",
            "urgency": "routine",
            "patient_location": {"lat": 12.97, "lng": 77.59},
        }).json()
        s.patch(f"{API}/visits/{v['id']}/accept?doctor_id=doc-2").json()
        for st in ["en_route", "arrived", "completed"]:
            s.patch(f"{API}/visits/{v['id']}/status", json={"status": st})
        inv = s.get(f"{API}/visits/{v['id']}/invoice").json()
        assert inv is not None
        assert inv["consultation_fee"] == 1799  # doc-2 fee
