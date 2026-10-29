"""Exercise Morrow through HTTP without replacing the user's existing tasks."""
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
import json
import os
import time
import urllib.request
import urllib.error
import urllib.parse
import uuid

BASE = os.environ.get("MORROW_BASE_URL", "http://127.0.0.1:8096").rstrip("/")
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "evidence/live-api-tests.json"
PREFIX = "HTTP verification " + uuid.uuid4().hex[:10]
results = []
created = []


def request(method, path, data=None, raw=None, content_type="application/json"):
    body = raw if raw is not None else json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(BASE + path, data=body, method=method,
                                 headers={"Content-Type": content_type})
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            status, headers, body = response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        status, headers, body = error.code, dict(error.headers), error.read()
    text = body.decode("utf-8")
    try:
        response_data = json.loads(text)
    except json.JSONDecodeError:
        response_data = text
    return status, response_data, headers, round(time.monotonic() - start, 3)


def check(name, method, path, status=200, data=None, validate=lambda payload: True, **kwargs):
    got, payload, headers, elapsed = request(method, path, data, **kwargs)
    passed = got == status and bool(validate(payload))
    results.append(dict(name=name, method=method, path=path, expected_status=status,
                        actual_status=got, passed=passed, seconds=elapsed,
                        response=payload if len(json.dumps(payload)) < 2500 else "response omitted for size"))
    print(("PASS " if passed else "FAIL ") + name, flush=True)
    if not passed:
        raise AssertionError(f"{name}: expected {status}, got {got}: {payload}")
    return payload, headers


try:
    check("Browser application served", "GET", "/", validate=lambda body: "Morrow" in body)
    check("Liveness", "GET", "/healthz", validate=lambda body: body["status"] == "healthy")
    check("SQLite readiness", "GET", "/readyz", validate=lambda body: body["status"] == "ready")
    baseline, _ = check("Initial statistics coherent", "GET", "/api/stats",
                         validate=lambda x: x["total"] == x["todo"] + x["doing"] + x["done"])
    due = str(date.today() - timedelta(days=1))
    task_data = dict(title=PREFIX, notes="A note with <script>literal text</script> and user's choice.",
                     priority="high", status="todo", due_date=due, category="HTTP Verification")
    payload, _ = check("Create custom overdue task", "POST", "/api/tasks", 201, task_data,
                       validate=lambda x: x["task"]["title"] == PREFIX and x["task"]["overdue"] is True)
    task_id = payload["task"]["id"]
    created.append(task_id)
    check("Search in task notes", "GET", "/api/tasks?search=literal%20text",
          validate=lambda x: any(t["id"] == task_id for t in x["tasks"]))
    check("Filter status priority and category", "GET", "/api/tasks?status=todo&priority=high&category=HTTP%20Verification",
          validate=lambda x: any(t["id"] == task_id for t in x["tasks"]) and all(t["status"] == "todo" and t["priority"] == "high" for t in x["tasks"]))
    check("Overdue filter", "GET", "/api/tasks?status=overdue",
          validate=lambda x: any(t["id"] == task_id for t in x["tasks"]) and all(t["overdue"] for t in x["tasks"]))
    for status in ["doing", "done", "todo"]:
        check("Transition task to " + status, "PATCH", f"/api/tasks/{task_id}", data={"status": status},
              validate=lambda x, status=status: x["task"]["status"] == status and x["task"]["overdue"] == (status != "done"))
    edits = dict(title=PREFIX + " edited", notes="Updated notes", priority="low", due_date=str(date.today() + timedelta(days=5)), category="Custom category")
    check("Edit title notes priority deadline category", "PATCH", f"/api/tasks/{task_id}", data=edits,
          validate=lambda x: all(x["task"][k] == v for k, v in edits.items()) and x["task"]["overdue"] is False)
    check("Clear optional due date", "PATCH", f"/api/tasks/{task_id}", data={"due_date": ""},
          validate=lambda x: x["task"]["due_date"] is None)
    for sort in ["newest", "oldest", "due", "priority", "title"]:
        check("Supported sort " + sort, "GET", "/api/tasks?sort=" + sort,
              validate=lambda x: isinstance(x["tasks"], list))
    for label, bad in [("blank title", {"title": " "}), ("unknown field", {"title": "X", "password": "no"}),
                       ("invalid priority", {"title": "X", "priority": "urgent"}), ("array priority", {"title": "X", "priority": []}),
                       ("object status", {"title": "X", "status": {}}), ("invalid date", {"title": "X", "due_date": "2026-02-30"})]:
        check("Reject " + label, "POST", "/api/tasks", 400, bad, validate=lambda x: isinstance(x.get("error"), str))
    check("Reject empty update", "PATCH", f"/api/tasks/{task_id}", 400, {})
    check("Reject invalid sort", "GET", "/api/tasks?sort=DROP", 400)
    check("Reject malformed JSON", "POST", "/api/tasks", 400, raw=b'{"title":', validate=lambda x: "error" in x)
    check("Reject non JSON media type", "POST", "/api/tasks", 415, raw=b"title=X", content_type="text/plain")
    exported, headers = check("Portable JSON export", "GET", "/api/export",
                              validate=lambda x: any(t["title"] == edits["title"] for t in x["tasks"]) and all("id" not in t for t in x["tasks"]))
    before_import, _ = check("Fixture count before rejected import", "GET", "/api/tasks?search=" + urllib.parse.quote(PREFIX))
    check("Reject import atomically", "POST", "/api/import", 400,
          {"tasks": [{"title": PREFIX + " rejected import"}, {"title": ""}]})
    check("Rejected import changed no fixture records", "GET", "/api/tasks?search=" + urllib.parse.quote(PREFIX), validate=lambda x: len(x["tasks"]) == len(before_import["tasks"]))
    check("Import custom task", "POST", "/api/import", 201,
          {"tasks": [{"title": PREFIX + " imported", "priority": "medium", "status": "doing", "category": "HTTP Verification"}]},
          validate=lambda x: x["imported"] == 1)
    # Retrieve imported IDs without relying on a new-ID response from import.
    _, fixtures, _, _ = request("GET", "/api/tasks?search=" + urllib.parse.quote(PREFIX))
    created.extend(t["id"] for t in fixtures["tasks"] if t["id"] not in created)
    check("Activity includes edits and import", "GET", "/api/activity",
          validate=lambda x: any(t["title"].startswith(PREFIX) for t in x["events"]))
    check("Reset requires explicit confirmation", "POST", "/api/demo/reset", 400, {"confirm": False})
    check("Delete task", "DELETE", f"/api/tasks/{task_id}", validate=lambda x: x["deleted"] is True)
    created.remove(task_id)
    check("Deleted task cannot be edited", "PATCH", f"/api/tasks/{task_id}", 404, {"title": "Missing"})
finally:
    cleanup = []
    for task_id in created:
        status, _, _, _ = request("DELETE", f"/api/tasks/{task_id}")
        cleanup.append(dict(id=task_id, status=status))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(dict(checked_at=datetime.now(timezone.utc).isoformat(), base_url=BASE,
                                     passed=sum(x["passed"] for x in results), total=len(results),
                                     checks=results, cleanup=cleanup), indent=2) + "\n", encoding="utf-8")
print(f"{sum(x['passed'] for x in results)}/{len(results)} checks passed. Evidence: {OUTPUT}")
