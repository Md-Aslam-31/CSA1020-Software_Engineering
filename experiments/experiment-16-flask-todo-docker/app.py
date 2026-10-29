"""Morrow Task Studio: a persistent Flask task workspace for a Docker lab."""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

FIELDS = {"title", "notes", "priority", "status", "due_date", "category"}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def validate(data, partial=False):
    if not isinstance(data, dict):
        raise ValueError("Send a JSON object.")
    if set(data) - FIELDS:
        raise ValueError("Unknown task fields: " + ", ".join(sorted(set(data) - FIELDS)))
    if partial and not data:
        raise ValueError("Provide at least one field to update.")
    result = {} if partial else dict(notes="", priority="medium", status="todo", due_date=None, category="Personal")
    result.update(data)
    if "title" in result:
        if not isinstance(result["title"], str) or not result["title"].strip() or len(result["title"].strip()) > 160:
            raise ValueError("Title must contain 1 to 160 characters.")
        result["title"] = result["title"].strip()
    elif not partial:
        raise ValueError("A task title is required.")
    for key, maximum in [("notes", 4000), ("category", 40)]:
        if key in result:
            if not isinstance(result[key], str) or len(result[key].strip()) > maximum:
                raise ValueError(f"{key.title()} must be text of at most {maximum} characters.")
            result[key] = result[key].strip()
    if "priority" in result and (not isinstance(result["priority"], str) or result["priority"] not in {"low", "medium", "high"}):
        raise ValueError("Priority must be low, medium or high.")
    if "status" in result and (not isinstance(result["status"], str) or result["status"] not in {"todo", "doing", "done"}):
        raise ValueError("Status must be todo, doing or done.")
    if "due_date" in result:
        value = result["due_date"]
        if value in (None, ""):
            result["due_date"] = None
        else:
            try:
                if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
                    raise ValueError()
            except (ValueError, TypeError):
                raise ValueError("Due date must use YYYY-MM-DD.") from None
    return result


def samples():
    today = date.today()
    return [
        dict(title="Map the next chapter", notes="Choose three outcomes that would make this week feel meaningful.", priority="high", status="todo", due_date=str(today), category="Planning"),
        dict(title="Polish the project presentation", notes="Add screenshots, rehearse the demo and check every link.", priority="high", status="doing", due_date=str(today + timedelta(days=1)), category="Study"),
        dict(title="Take a screen free evening", notes="An hour outside, a favourite playlist and no notifications.", priority="low", status="todo", due_date=str(today + timedelta(days=3)), category="Personal"),
        dict(title="Review last week’s notes", notes="Turn the useful ideas into small, actionable next steps.", priority="medium", status="todo", due_date=str(today - timedelta(days=1)), category="Study"),
        dict(title="Build a quieter morning routine", notes="Water, a short walk and ten minutes to plan the day.", priority="medium", status="doing", due_date=None, category="Personal"),
        dict(title="Set up the Docker workspace", notes="Build the Flask image and verify persistent task storage.", priority="high", status="done", due_date=str(today - timedelta(days=1)), category="Project"),
    ]


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(DATA_DIR=os.environ.get("DATA_DIR", str(Path(__file__).parent / "instance")), MAX_CONTENT_LENGTH=1024 * 1024, SEED_DEMO=True)
    if config:
        app.config.update(config)
    folder = Path(app.config["DATA_DIR"])
    folder.mkdir(parents=True, exist_ok=True)
    db_path = folder / "tasks.db"

    @contextmanager
    def connect():
        conn = sqlite3.connect(db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=10000")
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def event(conn, action, task):
        conn.execute("INSERT INTO activity(action,title,created_at) VALUES(?,?,?)", (action, task["title"], now()))

    def insert(conn, task, action="created"):
        stamp = now()
        cursor = conn.execute("INSERT INTO tasks(title,notes,priority,status,due_date,category,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", tuple(task[key] for key in ["title", "notes", "priority", "status", "due_date", "category"]) + (stamp, stamp))
        event(conn, action, task)
        return dict(conn.execute("SELECT * FROM tasks WHERE id=?", (cursor.lastrowid,)).fetchone())

    with connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,notes TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL,due_date TEXT,category TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,title TEXT NOT NULL,created_at TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        conn.execute("BEGIN IMMEDIATE")
        if not conn.execute("SELECT 1 FROM settings WHERE key='initialized'").fetchone():
            if app.config["SEED_DEMO"]:
                for sample in samples():
                    insert(conn, sample, "sample added")
            conn.execute("INSERT INTO settings VALUES('initialized','1')")

    def output(task):
        item = dict(task)
        item["overdue"] = bool(item["due_date"] and item["due_date"] < date.today().isoformat() and item["status"] != "done")
        return item

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(ValueError)
    def invalid(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.errorhandler(sqlite3.Error)
    def storage_error(error):
        app.logger.error("Task storage error: %s", error)
        return jsonify(error="Task storage is temporarily unavailable. Please try again."), 503

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/healthz")
    def health():
        return jsonify(status="healthy", app="Morrow Task Studio", version=os.environ.get("APP_VERSION", "1.0.0"))

    @app.get("/readyz")
    def ready():
        with connect() as conn:
            conn.execute("SELECT COUNT(*) FROM tasks").fetchone()
        return jsonify(status="ready", storage="sqlite")

    @app.get("/api/tasks")
    def list_tasks():
        clauses, params = [], []
        for key in ["status", "priority", "category"]:
            if request.args.get(key) and request.args[key] != "all":
                if key == "status" and request.args[key] == "overdue":
                    clauses.append("due_date < ? AND status != 'done'"); params.append(date.today().isoformat())
                else:
                    clauses.append(f"{key}=?"); params.append(request.args[key])
        if request.args.get("search"):
            clauses.append("(instr(lower(title),lower(?))>0 OR instr(lower(notes),lower(?))>0 OR instr(lower(category),lower(?))>0)")
            params += [request.args["search"]] * 3
        sorts = {"newest": "id DESC", "oldest": "id ASC", "due": "due_date IS NULL, due_date ASC, id DESC", "priority": "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id DESC", "title": "title COLLATE NOCASE, id DESC"}
        order = request.args.get("sort", "newest")
        if order not in sorts:
            raise ValueError("Sort must be newest, oldest, due, priority or title.")
        sql = "SELECT * FROM tasks" + (" WHERE " + " AND ".join(clauses) if clauses else "") + " ORDER BY " + sorts[order]
        with connect() as conn:
            tasks = [output(row) for row in conn.execute(sql, params)]
        return jsonify(tasks=tasks)

    @app.post("/api/tasks")
    def create_task():
        task = validate(request.get_json())
        with connect() as conn:
            task = insert(conn, task)
        return jsonify(task=output(task)), 201

    @app.patch("/api/tasks/<int:task_id>")
    def edit_task(task_id):
        changes = validate(request.get_json(), partial=True)
        with connect() as conn:
            existing = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
            if existing is None:
                return jsonify(error="This task was not found."), 404
            updates = list(changes) + ["updated_at"]
            conn.execute("UPDATE tasks SET " + ", ".join(f"{key}=?" for key in updates) + " WHERE id=?", list(changes.values()) + [now(), task_id])
            task = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
            event(conn, "completed" if changes.get("status") == "done" else "updated", task)
        return jsonify(task=output(task))

    @app.delete("/api/tasks/<int:task_id>")
    def delete_task(task_id):
        with connect() as conn:
            existing = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
            if existing is None:
                return jsonify(error="This task was not found."), 404
            event(conn, "deleted", existing)
            conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
        return jsonify(deleted=True, id=task_id)

    @app.get("/api/stats")
    def stats():
        with connect() as conn:
            counts = dict(total=0, todo=0, doing=0, done=0, overdue=0)
            for row in conn.execute("SELECT status,due_date FROM tasks"):
                counts["total"] += 1
                counts[row["status"]] += 1
                counts["overdue"] += int(bool(row["due_date"] and row["due_date"] < date.today().isoformat() and row["status"] != "done"))
        counts["completion"] = round(100 * counts["done"] / counts["total"]) if counts["total"] else 0
        return jsonify(counts)

    @app.get("/api/activity")
    def activity():
        with connect() as conn:
            events = [dict(row) for row in conn.execute("SELECT * FROM activity ORDER BY id DESC LIMIT 20")]
        return jsonify(events=events)

    @app.get("/api/export")
    def export():
        with connect() as conn:
            tasks = [{key: row[key] for key in FIELDS} for row in conn.execute("SELECT * FROM tasks ORDER BY id")]
        response = jsonify(app="Morrow Task Studio", version=1, exported_at=now(), tasks=tasks)
        response.headers["Content-Disposition"] = 'attachment; filename="morrow-tasks.json"'
        return response

    @app.post("/api/import")
    def import_tasks():
        data = request.get_json()
        if not isinstance(data, dict) or not isinstance(data.get("tasks"), list) or not 1 <= len(data["tasks"]) <= 500:
            raise ValueError("Import a JSON object with 1 to 500 tasks.")
        tasks = [validate(task) for task in data["tasks"]]
        with connect() as conn:
            for task in tasks:
                insert(conn, task, "imported")
        return jsonify(imported=len(tasks)), 201

    @app.post("/api/demo/reset")
    def reset_demo():
        data = request.get_json()
        if not isinstance(data, dict) or data.get("confirm") is not True:
            raise ValueError("Send confirm=true to replace all tasks with six demo tasks.")
        with connect() as conn:
            conn.execute("DELETE FROM tasks")
            conn.execute("DELETE FROM activity")
            for task in samples():
                insert(conn, task, "sample added")
        return jsonify(reset=True, count=6)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8096, debug=False)
