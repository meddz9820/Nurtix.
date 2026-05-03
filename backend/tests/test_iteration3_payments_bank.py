"""Iteration 3 tests: Stripe Checkout + Doctor bank setup."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
# Fallback: read from frontend .env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def completed_visit(session):
    """Create a patient -> visit -> accept -> complete to get a payable invoice."""
    user = session.post(f"{API}/auth/login",
                        json={"name": f"TEST_payer_{uuid.uuid4().hex[:6]}",
                              "role": "patient"}).json()
    visit = session.post(f"{API}/visits", json={
        "patient_id": user["id"],
        "patient_name": user["name"],
        "address": "TEST 1 Test Lane",
        "symptoms": "TEST fever",
        "urgency": "urgent",
        "patient_location": {"lat": 12.97, "lng": 77.59},
    }).json()
    # accept by doc-1
    session.patch(f"{API}/visits/{visit['id']}/accept?doctor_id=doc-1")
    # mark completed
    r = session.patch(f"{API}/visits/{visit['id']}/status",
                      json={"status": "completed"})
    assert r.status_code == 200
    return visit


# ---------- Payments ----------
class TestPayments:
    def test_invoice_created_pending_not_paid(self, session, completed_visit):
        """Invoice on completion MUST be 'pending' (not auto-paid) for Stripe flow."""
        inv = session.get(f"{API}/visits/{completed_visit['id']}/invoice").json()
        assert inv is not None
        assert inv["status"] == "pending", \
            f"Invoice status should be 'pending' so Pay button shows, got '{inv['status']}'"

    def test_create_checkout_session_returns_url(self, session, completed_visit):
        r = session.post(f"{API}/payments/checkout/session", json={
            "visit_id": completed_visit["id"],
            "origin_url": "https://example.com",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("http")
        assert "session_id" in data and data["session_id"]

    def test_checkout_status_returns_fields(self, session, completed_visit):
        r = session.post(f"{API}/payments/checkout/session", json={
            "visit_id": completed_visit["id"],
            "origin_url": "https://example.com",
        })
        if r.status_code != 200:
            pytest.skip("session create failed")
        sid = r.json()["session_id"]
        s = session.get(f"{API}/payments/checkout/status/{sid}")
        assert s.status_code == 200, s.text
        d = s.json()
        for k in ("status", "payment_status", "amount_total", "currency"):
            assert k in d

    def test_unknown_visit_returns_404(self, session):
        r = session.post(f"{API}/payments/checkout/session", json={
            "visit_id": "nonexistent-visit-id",
            "origin_url": "https://example.com",
        })
        assert r.status_code == 404

    def test_non_completed_visit_returns_400(self, session):
        # Create a fresh pending visit
        u = session.post(f"{API}/auth/login",
                         json={"name": f"TEST_pending_{uuid.uuid4().hex[:6]}",
                               "role": "patient"}).json()
        v = session.post(f"{API}/visits", json={
            "patient_id": u["id"], "patient_name": u["name"],
            "address": "TEST", "symptoms": "TEST",
            "urgency": "routine",
            "patient_location": {"lat": 12.9, "lng": 77.5},
        }).json()
        r = session.post(f"{API}/payments/checkout/session", json={
            "visit_id": v["id"], "origin_url": "https://example.com",
        })
        assert r.status_code == 400, r.text

    def test_webhook_endpoint_exists(self, session):
        r = session.post(f"{API}/webhook/stripe", data="{}",
                         headers={"Content-Type": "application/json"})
        # Should not be 404
        assert r.status_code != 404


# ---------- Doctor Bank ----------
class TestBank:
    DOC_ID = "doc-2"

    def test_save_bank_valid(self, session):
        r = session.post(f"{API}/doctors/{self.DOC_ID}/bank", json={
            "account_holder": "TEST Marcus Chen",
            "account_number": "1234567890",
            "ifsc": "hdfc0001234",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["account_holder"] == "TEST Marcus Chen"
        assert d["account_number_masked"].endswith("7890")
        assert "1234567890" not in d["account_number_masked"]
        assert d["ifsc"] == "HDFC0001234"  # uppercased
        assert d["connect_status"] == "verified_simulated"

    def test_get_bank_returns_saved(self, session):
        r = session.get(f"{API}/doctors/{self.DOC_ID}/bank")
        assert r.status_code == 200
        d = r.json()
        assert d and d["account_holder"] == "TEST Marcus Chen"

    def test_save_bank_invalid_short_number(self, session):
        r = session.post(f"{API}/doctors/doc-3/bank", json={
            "account_holder": "TEST",
            "account_number": "123",
            "ifsc": "ABCD0001",
        })
        assert r.status_code == 400

    def test_save_bank_unknown_doctor(self, session):
        r = session.post(f"{API}/doctors/doc-nonexistent/bank", json={
            "account_holder": "TEST",
            "account_number": "12345678",
            "ifsc": "ABCD0001",
        })
        assert r.status_code == 404
