"""Behaviour and persistence checks; uses isolated temporary databases."""
import os
import tempfile
import unittest
from datetime import date, timedelta

# The module-level WSGI app must also use a disposable directory in this process.
module_data = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = module_data.name
from app import create_app


class MorrowTests(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.TemporaryDirectory()
        self.config = dict(TESTING=True, DATA_DIR=self.data.name, SEED_DEMO=False)
        self.app = create_app(self.config)
        self.client = self.app.test_client()

    def tearDown(self):
        self.data.cleanup()

    def create(self, **values):
        return self.client.post("/api/tasks", json=dict(title="My next step", **values))

    def test_health_and_readiness(self):
        self.assertEqual(self.client.get("/healthz").json["status"], "healthy")
        self.assertEqual(self.client.get("/readyz").json["status"], "ready")

    def test_seed_once_and_six_samples(self):
        with tempfile.TemporaryDirectory() as directory:
            config = dict(TESTING=True, DATA_DIR=directory)
            first = create_app(config).test_client()
            self.assertEqual(len(first.get("/api/tasks").json["tasks"]), 6)
            second = create_app(config).test_client()
            self.assertEqual(len(second.get("/api/tasks").json["tasks"]), 6)

    def test_create_defaults_and_trim(self):
        response = self.client.post("/api/tasks", json={"title": "  Build something  "})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["task"]["title"], "Build something")
        self.assertEqual(response.json["task"]["status"], "todo")

    def test_edit_every_field(self):
        task_id = self.create().json["task"]["id"]
        values = dict(title="Changed", notes="A custom note", priority="high", status="doing", category="My category", due_date="2030-05-02")
        result = self.client.patch(f"/api/tasks/{task_id}", json=values)
        self.assertEqual(result.status_code, 200)
        for key, value in values.items():
            self.assertEqual(result.json["task"][key], value)

    def test_complete_and_reopen(self):
        task_id = self.create().json["task"]["id"]
        for status in ["done", "todo"]:
            result = self.client.patch(f"/api/tasks/{task_id}", json={"status": status})
            self.assertEqual(result.json["task"]["status"], status)

    def test_delete(self):
        task_id = self.create().json["task"]["id"]
        self.assertTrue(self.client.delete(f"/api/tasks/{task_id}").json["deleted"])
        self.assertEqual(self.client.get("/api/tasks").json["tasks"], [])

    def test_not_found(self):
        self.assertEqual(self.client.patch("/api/tasks/999", json={"title": "x"}).status_code, 404)
        self.assertEqual(self.client.delete("/api/tasks/999").status_code, 404)

    def test_invalid_title(self):
        for title in ["", "  ", None, 12, "x" * 161]:
            self.assertEqual(self.client.post("/api/tasks", json={"title": title}).status_code, 400)

    def test_invalid_priority_status_and_dates(self):
        for invalid in [{"priority": "urgent"}, {"status": []}, {"priority": {}}, {"due_date": "2026-02-30"}, {"due_date": "20260101"}]:
            self.assertEqual(self.create(**invalid).status_code, 400)

    def test_unknown_fields_and_empty_patch(self):
        self.assertEqual(self.create(admin=True).status_code, 400)
        task_id = self.create().json["task"]["id"]
        self.assertEqual(self.client.patch(f"/api/tasks/{task_id}", json={}).status_code, 400)

    def test_filter_search_and_sort(self):
        self.create(category="Research", priority="high", status="doing")
        self.client.post("/api/tasks", json={"title": "Alpha note", "category": "Personal"})
        for query in ["category=Research", "priority=high", "status=doing", "search=research"]:
            self.assertEqual(len(self.client.get("/api/tasks?" + query).json["tasks"]), 1)
        self.assertEqual(self.client.get("/api/tasks?sort=title").json["tasks"][0]["title"], "Alpha note")
        self.assertEqual(self.client.get("/api/tasks?sort=unexpected").status_code, 400)

    def test_sql_injection_is_only_text(self):
        self.create(notes="'); DROP TABLE tasks; --")
        self.assertEqual(self.client.get("/api/tasks?search=%27%20OR%201%3D1").json["tasks"], [])
        self.assertEqual(self.client.get("/api/stats").json["total"], 1)

    def test_overdue_and_completion_stats(self):
        yesterday = str(date.today() - timedelta(days=1))
        self.create(due_date=yesterday)
        self.create(due_date=yesterday, status="done")
        stats = self.client.get("/api/stats").json
        self.assertEqual((stats["overdue"], stats["completion"]), (1, 50))
        self.assertEqual(len(self.client.get("/api/tasks?status=overdue").json["tasks"]), 1)

    def test_empty_statistics(self):
        self.assertEqual(self.client.get("/api/stats").json["completion"], 0)

    def test_persistence_across_application_recreation(self):
        self.create(notes="Keep this across container restarts")
        second = create_app(self.config).test_client()
        self.assertEqual(second.get("/api/tasks").json["tasks"][0]["notes"], "Keep this across container restarts")

    def test_deleting_all_does_not_reseed(self):
        task_id = self.create().json["task"]["id"]
        self.client.delete(f"/api/tasks/{task_id}")
        second = create_app({**self.config, "SEED_DEMO": True}).test_client()
        self.assertEqual(second.get("/api/tasks").json["tasks"], [])

    def test_export_import_round_trip(self):
        self.create(category="Custom", notes="Portable details")
        exported = self.client.get("/api/export")
        self.assertIn("attachment", exported.headers["Content-Disposition"])
        self.assertEqual(self.client.post("/api/import", json=exported.json).status_code, 201)
        self.assertEqual(self.client.get("/api/stats").json["total"], 2)

    def test_import_validates_all_before_writing(self):
        response = self.client.post("/api/import", json={"tasks": [{"title": "Valid"}, {"title": ""}]})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/stats").json["total"], 0)

    def test_demo_reset_requires_explicit_confirmation(self):
        self.create()
        self.assertEqual(self.client.post("/api/demo/reset", json={}).status_code, 400)
        self.assertEqual(self.client.get("/api/stats").json["total"], 1)
        self.assertEqual(self.client.post("/api/demo/reset", json={"confirm": True}).json["count"], 6)

    def test_activity_tracks_changes(self):
        task_id = self.create().json["task"]["id"]
        self.client.patch(f"/api/tasks/{task_id}", json={"status": "done"})
        self.client.delete(f"/api/tasks/{task_id}")
        actions = [event["action"] for event in self.client.get("/api/activity").json["events"]]
        self.assertEqual(actions, ["deleted", "completed", "created"])

    def test_security_headers_and_json_errors(self):
        response = self.client.get("/api/tasks")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertIn("error", self.client.post("/api/tasks", data="{", content_type="application/json").json)


if __name__ == "__main__":
    unittest.main(verbosity=2)
