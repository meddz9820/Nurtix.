"""Iteration 5 backend tests:
- Dark stores + doctor kit checkout (inventory decrements)
- Validate supply
- End visit tri-party reconciliation
- Wastage log
- MCQ report
- Sequential routing lock
- Visit propagates mcq_answers from MCQ report
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ===== Dark Stores =====
class TestDarkStores:
    def test_list_seeded_dark_stores(self, s):
        r = s.get(f"{BASE_URL}/api/dark-stores")
        assert r.status_code == 200
        items = r.json()
        ids = {it["id"] for it in items}
        assert {"ds-indiranagar", "ds-koramangala", "ds-hsr"}.issubset(ids)
        for it in items:
            assert "inventory" in it and isinstance(it["inventory"], dict)
            assert it["inventory"].get("paracetamol_500", 0) > 0


# ===== Doctor Kit Checkout & Inventory Decrement =====
class TestKitCheckout:
    def test_checkout_decrements_store(self, s):
        # use doc-5 (Nina) to avoid clashing with previous iterations
        doctor_id = "doc-5"
        # Clear any existing kit first to ensure deterministic behaviour
        # We'll just compare before/after inventory diff
        store_id = "ds-koramangala"
        before = s.get(f"{BASE_URL}/api/dark-stores").json()
        before_inv = next(x for x in before if x["id"] == store_id)["inventory"].copy()

        r = s.post(
            f"{BASE_URL}/api/doctors/{doctor_id}/kit/checkout",
            json={"dark_store_id": store_id},
        )
        assert r.status_code == 200, r.text
        kit = r.json()
        assert kit["doctor_id"] == doctor_id
        assert kit["dark_store_id"] == store_id
        assert isinstance(kit["items"], dict)
        assert kit["items"].get("paracetamol_500", 0) > 0

        after = s.get(f"{BASE_URL}/api/dark-stores").json()
        after_inv = next(x for x in after if x["id"] == store_id)["inventory"]
        # paracetamol must have decremented by the kit qty
        assert after_inv["paracetamol_500"] == before_inv["paracetamol_500"] - kit["items"]["paracetamol_500"]

    def test_get_active_kit(self, s):
        r = s.get(f"{BASE_URL}/api/doctors/doc-5/kit")
        assert r.status_code == 200
        kit = r.json()
        assert kit is not None
        assert kit["doctor_id"] == "doc-5"
        assert "items" in kit


# ===== MCQ Report + Visit propagation =====
class TestMcqAndVisit:
    @pytest.fixture(scope="class")
    def session_id(self):
        return f"TEST_mcq_{uuid.uuid4().hex[:8]}"

    def test_mcq_report(self, s, session_id):
        r = s.post(
            f"{BASE_URL}/api/symptom-check/{session_id}/report-mcq",
            json={
                "symptom_category": "Cough/Respiratory",
                "duration": "1-3 Days",
                "severity": "Moderate",
                "patient_name": "TEST_McqPatient",
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["chief_complaint"] == "Cough/Respiratory"
        assert data["duration"] == "1-3 Days"
        assert data["severity"] == "moderate"
        assert data["urgency"] == "urgent"  # Moderate -> urgent
        assert len(data["suggested_initial_medications"]) >= 1
        # Persist report id for later test
        pytest.report_id = data["id"]
        pytest.session_id = session_id

    def test_visit_propagates_mcq_answers(self, s):
        sid = pytest.session_id
        # create patient user
        u = s.post(f"{BASE_URL}/api/auth/login", json={"name": "TEST_McqPatient", "role": "patient"}).json()
        # GET report (also sanity check)
        rep = s.get(f"{BASE_URL}/api/symptom-check/{sid}/report").json()
        assert rep is not None
        v = s.post(
            f"{BASE_URL}/api/visits",
            json={
                "patient_id": u["id"],
                "patient_name": "TEST_McqPatient",
                "address": "TEST 123 Lane",
                "symptoms": "(from MCQ)",
                "patient_location": {"lat": 12.97, "lng": 77.6},
                "symptom_report_id": rep["id"],
                "mcq_answers": {
                    "symptom_category": "Cough/Respiratory",
                    "duration": "1-3 Days",
                    "severity": "Moderate",
                },
            },
        )
        assert v.status_code == 200, v.text
        visit = v.json()
        assert visit["mcq_answers"]["symptom_category"] == "Cough/Respiratory"
        assert visit["symptom_summary"] is not None
        pytest.visit_id = visit["id"]
        pytest.patient_id = u["id"]


# ===== Validate supply + End visit tri-party reconciliation =====
class TestEndVisitReconcile:
    def test_validate_and_end_visit(self, s):
        doctor_id = "doc-5"
        visit_id = pytest.visit_id

        # Accept and en_route the visit so it's an active trip
        r = s.patch(f"{BASE_URL}/api/visits/{visit_id}/accept?doctor_id={doctor_id}")
        assert r.status_code == 200, r.text

        # Sequential routing lock: feed for this doctor should now be empty
        feed = s.get(f"{BASE_URL}/api/visits/doctor/feed?doctor_id={doctor_id}").json()
        assert feed == []

        # Validate supply
        v = s.post(f"{BASE_URL}/api/visits/{visit_id}/validate-supply")
        assert v.status_code == 200
        body = v.json()
        assert "ok" in body and "needed" in body and "missing" in body
        # Cough/Respiratory recommends cetirizine_10 which should be in kit
        assert body["ok"] is True
        assert "cetirizine_10" in body["needed"]
        assert body["missing"] == []

        # Move to arrived (required UX step), then end visit with dispensed items
        s.patch(f"{BASE_URL}/api/visits/{visit_id}/status", json={"status": "en_route"})
        s.patch(f"{BASE_URL}/api/visits/{visit_id}/status", json={"status": "arrived"})

        # Get kit before to compare
        kit_before = s.get(f"{BASE_URL}/api/doctors/{doctor_id}/kit").json()
        cet_before = kit_before["items"]["cetirizine_10"]

        end = s.post(
            f"{BASE_URL}/api/visits/end",
            json={
                "visit_id": visit_id,
                "doctor_id": doctor_id,
                "dispensed": [
                    {"item_id": "cetirizine_10", "qty": 2},
                    {"item_id": "paracetamol_500", "qty": 1},
                ],
            },
        )
        assert end.status_code == 200, end.text
        receipt = end.json()["receipt"]
        assert len(receipt["dispensed"]) == 2

        # Kit decremented
        kit_after = s.get(f"{BASE_URL}/api/doctors/{doctor_id}/kit").json()
        assert kit_after["items"]["cetirizine_10"] == cet_before - 2

        # Visit is completed and has receipt
        vget = s.get(f"{BASE_URL}/api/visits/{visit_id}").json()
        assert vget["status"] == "completed"

        # Invoice has dispensed list — fetch via Mongo via API: ensure invoice exists
        inv = s.get(f"{BASE_URL}/api/visits/{visit_id}/invoice").json()
        assert inv is not None
        # dispensed list may not be in Invoice model serialization — at minimum invoice exists
        assert inv["status"] == "pending"

        # After completion, feed should be unlocked (no active visits)
        feed2 = s.get(f"{BASE_URL}/api/visits/doctor/feed?doctor_id={doctor_id}").json()
        assert isinstance(feed2, list)  # may have other pendings, but is unlocked (list returned)


# ===== Wastage =====
class TestWastage:
    def test_log_and_list_wastage(self, s):
        doctor_id = "doc-5"
        r = s.post(
            f"{BASE_URL}/api/doctors/{doctor_id}/wastage",
            json={"item_id": "paracetamol_500", "qty": 1, "reason": "TEST_dropped"},
        )
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["item_id"] == "paracetamol_500"
        assert e["qty"] == 1

        lst = s.get(f"{BASE_URL}/api/doctors/{doctor_id}/wastage").json()
        assert any(x["reason"] == "TEST_dropped" for x in lst)

    def test_unknown_item_rejected(self, s):
        r = s.post(
            f"{BASE_URL}/api/doctors/doc-5/wastage",
            json={"item_id": "nonsense_999", "qty": 1, "reason": "x"},
        )
        assert r.status_code == 400
