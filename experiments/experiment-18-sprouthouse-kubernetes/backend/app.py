"""SproutHouse: a transactional seed-library API backed by PostgreSQL."""
from __future__ import annotations

import hashlib
import json
import os
import re
import socket
import time
import uuid
from datetime import date, datetime

import psycopg
from flask import Flask, g, jsonify, request
from psycopg.rows import dict_row
from werkzeug.exceptions import HTTPException

VERSION = "1.0.0"
CATEGORIES = ("Herbs", "Vegetables", "Flowers")
STATUSES = ("reserved", "collected", "cancelled")
LIGHTS = ("Full sun", "Partial shade")
UNITS = ("packet", "bulb", "cutting")
MAX_STOCK = 10000
SEEDS = [
    ("Rainbow Carrot", "Heirloom colour mix", "Vegetables", "A joyful mix of purple, golden and orange roots. A lovely first crop for young growers.", 70, 30, "packet", "Full sun", "#edb789"),
    ("Genovese Basil", "Sweet Italian", "Herbs", "Large, fragrant leaves for windowsill pots, summer salads and a generous batch of pesto.", 35, 40, "packet", "Full sun", "#c7d6a0"),
    ("French Marigold", "Amber glow", "Flowers", "Compact amber blooms that bring pollinators and a little sunshine to the edge of a vegetable bed.", 55, 36, "packet", "Full sun", "#efc77d"),
    ("Sugar Snap Pea", "Cascadia", "Vegetables", "Crisp, sweet pods on manageable vines. Give them a simple trellis and pick often.", 60, 34, "packet", "Full sun", "#b8cfb1"),
    ("Lemon Sunflower", "Lemon Queen", "Flowers", "Tall, branching stems with soft lemon petals. Leave a few seed heads for visiting birds.", 80, 12, "packet", "Full sun", "#e4d99b"),
    ("Tuscan Kale", "Nero di Toscana", "Vegetables", "Beautiful blue-green leaves with a rich flavour. Harvest the outside leaves as the plant grows.", 60, 24, "packet", "Partial shade", "#b6c8bf"),
    ("Spearmint", "Garden mint", "Herbs", "Fresh, aromatic leaves for tea and summer drinks. Best grown in its own container.", 45, 16, "packet", "Partial shade", "#b9d4be"),
    ("Cherry Tomato", "Golden Sunrise", "Vegetables", "Sweet golden fruit for sunny balconies and generous summer bowls. Support the stems early.", 75, 18, "packet", "Full sun", "#e6b99b"),
    ("Calendula", "Sunset Buff", "Flowers", "Soft apricot and cream flowers that keep blooming when you pick them. A gentle cottage-garden favourite.", 50, 20, "packet", "Full sun", "#e6c5ac"),
    ("Coriander", "Leisure", "Herbs", "A slow-bolting variety for bright leaves and fragrant seed. Sow a little every few weeks.", 35, 26, "packet", "Partial shade", "#c4d0a7"),
    ("Scarlet Runner Bean", "Painted Lady", "Vegetables", "Climbing vines with two-tone flowers and tender beans. Makes a wonderful living screen.", 65, 22, "packet", "Full sun", "#dfb3a9"),
    ("Breakfast Radish", "French Breakfast", "Vegetables", "Quick-growing, mild roots with rosy shoulders and white tips. Ready in less than a month.", 25, 4, "packet", "Full sun", "#e2b5bb"),
]


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, fields=None):
        super().__init__(message)
        self.status, self.code, self.message, self.fields = status, code, message, fields


def connect():
    """Connections are short-lived; no shared connection crosses worker threads."""
    options = {"connect_timeout": 4, "row_factory": dict_row, "application_name": "sprouthouse-api"}
    if os.environ.get("DATABASE_URL"):
        return psycopg.connect(os.environ["DATABASE_URL"], **options)
    return psycopg.connect(
        host=os.environ.get("PGHOST", "postgres"), port=int(os.environ.get("PGPORT", "5432")),
        dbname=os.environ.get("PGDATABASE", "sprouthouse"), user=os.environ.get("PGUSER", "sprouthouse"),
        password=os.environ.get("PGPASSWORD", ""), **options,
    )


def initialize_database():
    """One transaction/advisory lock makes startup safe across replicas."""
    attempts = int(os.environ.get("DB_STARTUP_ATTEMPTS", "30"))
    for attempt in range(attempts):
        try:
            with connect() as conn:
                conn.execute("SELECT pg_advisory_xact_lock(18262018)")
                conn.execute("""CREATE TABLE IF NOT EXISTS catalog (
                    id BIGSERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL, variety VARCHAR(80) NOT NULL DEFAULT '',
                    category VARCHAR(20) NOT NULL CHECK (category IN ('Herbs','Vegetables','Flowers')),
                    description VARCHAR(500) NOT NULL DEFAULT '', days_to_harvest INTEGER NOT NULL CHECK (days_to_harvest BETWEEN 1 AND 365),
                    stock INTEGER NOT NULL CHECK (stock BETWEEN 0 AND 10000), unit VARCHAR(20) NOT NULL,
                    light VARCHAR(30) NOT NULL, accent VARCHAR(7) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
                conn.execute("""CREATE TABLE IF NOT EXISTS reservations (
                    id BIGSERIAL PRIMARY KEY, seed_id BIGINT NOT NULL REFERENCES catalog(id),
                    member_name VARCHAR(80) NOT NULL, member_email VARCHAR(150) NOT NULL,
                    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
                    status VARCHAR(20) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','collected','cancelled')),
                    notes VARCHAR(500) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    collected_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
                conn.execute("""CREATE TABLE IF NOT EXISTS activity (
                    id BIGSERIAL PRIMARY KEY, kind VARCHAR(30) NOT NULL, message VARCHAR(500) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
                conn.execute("""CREATE TABLE IF NOT EXISTS request_keys (
                    key VARCHAR(120) PRIMARY KEY, request_hash CHAR(64) NOT NULL,
                    reservation_id BIGINT NOT NULL REFERENCES reservations(id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
                conn.execute("CREATE INDEX IF NOT EXISTS reservations_status_seed ON reservations(status,seed_id)")
                if conn.execute("SELECT COUNT(*) AS n FROM catalog").fetchone()["n"] == 0:
                    with conn.cursor() as cursor:
                        cursor.executemany("""INSERT INTO catalog
                            (name,variety,category,description,days_to_harvest,stock,unit,light,accent)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""", SEEDS)
                    conn.execute("INSERT INTO activity(kind,message) VALUES ('welcome',%s)",
                                 ("The seed library opened with twelve varieties. A little shared can grow into a lot.",))
            return
        except (psycopg.OperationalError, psycopg.InterfaceError):
            if attempt + 1 == attempts:
                raise RuntimeError("PostgreSQL did not become available during startup.") from None
            time.sleep(2)


def body(allowed):
    if not request.is_json:
        raise ApiError(415, "json_required", "Send this request as application/json.")
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ApiError(400, "invalid_json", "The request must contain a valid JSON object.")
    unknown = sorted(set(value) - set(allowed))
    if unknown:
        raise ApiError(400, "unknown_fields", "Some fields are not supported.", {key: "Unknown field." for key in unknown})
    return value


def text_field(data, key, *, minimum=0, maximum=80, default="", email=False, multiline=False):
    value = data.get(key, default)
    if not isinstance(value, str):
        raise ApiError(400, "validation_error", "Please check the highlighted fields.", {key: "Enter text."})
    value = value.strip()
    controls = any(ord(char) < 32 and not (multiline and char in "\n\r\t") for char in value)
    if controls or len(value) < minimum or len(value) > maximum:
        raise ApiError(400, "validation_error", "Please check the highlighted fields.", {key: f"Use {minimum}–{maximum} characters."})
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        raise ApiError(400, "validation_error", "Please check the highlighted fields.", {key: "Enter a valid email address."})
    return value


def integer(data, key, minimum, maximum, default=None):
    value = data.get(key, default)
    if type(value) is not int or not minimum <= value <= maximum:
        raise ApiError(400, "validation_error", "Please check the highlighted fields.", {key: f"Use a whole number from {minimum} to {maximum}."})
    return value


def enum(data, key, values, default=None):
    value = data.get(key, default)
    if value not in values or not isinstance(value, str):
        raise ApiError(400, "validation_error", "Please check the highlighted fields.", {key: "Choose one of: " + ", ".join(values) + "."})
    return value


def reservation_input(data):
    return {
        "seed_id": integer(data, "seed_id", 1, 2147483647),
        "quantity": integer(data, "quantity", 1, 1000),
        "member_name": text_field(data, "member_name", minimum=2, maximum=80),
        "member_email": text_field(data, "member_email", minimum=3, maximum=150, email=True),
        "notes": text_field(data, "notes", maximum=500, multiline=True),
    }


def catalog_input(data):
    accent = text_field(data, "accent", maximum=7, default="#c8db9c")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
        raise ApiError(400, "validation_error", "Choose a valid packet colour.", {"accent": "Use a six-digit hex colour, such as #c8db9c."})
    return {
        "name": text_field(data, "name", minimum=2, maximum=80),
        "variety": text_field(data, "variety", maximum=80),
        "category": enum(data, "category", CATEGORIES, "Vegetables"),
        "description": text_field(data, "description", maximum=500, multiline=True),
        "days_to_harvest": integer(data, "days_to_harvest", 1, 365, 60),
        "stock": integer(data, "stock", 0, MAX_STOCK, 0),
        "unit": enum(data, "unit", UNITS, "packet"),
        "light": enum(data, "light", LIGHTS, "Full sun"), "accent": accent.lower(),
    }


def serializable(row):
    value = dict(row)
    for key, item in value.items():
        if isinstance(item, (datetime, date)):
            value[key] = item.isoformat()
    return value


def reservation_row(conn, reservation_id):
    row = conn.execute("""SELECT r.*, c.name AS seed_name, c.variety AS seed_variety, c.unit
        FROM reservations r JOIN catalog c ON c.id=r.seed_id WHERE r.id=%s""", (reservation_id,)).fetchone()
    if row is None:
        raise ApiError(404, "not_found", "That reservation could not be found.")
    value = serializable(row)
    value["code"] = f"SH-{row['id']:05d}"
    return value


def create_app(*, init_db=True):
    app = Flask(__name__)
    app.config.update(MAX_CONTENT_LENGTH=16384, JSON_SORT_KEYS=False)
    app.json.sort_keys = False
    if init_db:
        initialize_database()

    @app.before_request
    def identify_request():
        supplied = request.headers.get("X-Request-ID", "")
        g.request_id = supplied if re.fullmatch(r"[a-zA-Z0-9_.:-]{1,80}", supplied) else str(uuid.uuid4())

    @app.after_request
    def response_headers(response):
        response.headers["X-Request-ID"] = g.get("request_id", "")
        response.headers["X-Backend-Pod"] = os.environ.get("POD_NAME", socket.gethostname())
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(ApiError)
    def api_error(error):
        payload = {"code": error.code, "message": error.message}
        if error.fields:
            payload["fields"] = error.fields
        return jsonify(error=payload), error.status

    @app.errorhandler(psycopg.Error)
    def database_error(error):
        app.logger.error("Database request failed (%s)", type(error).__name__)
        return jsonify(error={"code": "database_unavailable", "message": "The seed store is temporarily unavailable. Please try again."}), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        message = "The request is too large." if error.code == 413 else error.description
        return jsonify(error={"code": "http_" + str(error.code), "message": message}), error.code

    @app.get("/healthz")
    def health():
        return jsonify(status="healthy", application="SproutHouse", version=VERSION)

    @app.get("/readyz")
    def ready():
        with connect() as conn:
            conn.execute("SELECT 1 FROM catalog LIMIT 1").fetchone()
        return jsonify(status="ready", database="connected")

    @app.get("/api/catalog")
    def catalog():
        search = request.args.get("search", "").strip()
        category = request.args.get("category", "").strip()
        if len(search) > 120:
            raise ApiError(400, "invalid_search", "Keep your search under 120 characters.")
        if category and category not in CATEGORIES:
            raise ApiError(400, "invalid_category", "Choose a category from the seed library.")
        conditions, params = [], []
        if search:
            conditions.append("concat_ws(' ',name,variety,description) ILIKE %s")
            params.append("%" + search + "%")
        if category:
            conditions.append("category=%s"); params.append(category)
        query = "SELECT * FROM catalog" + (" WHERE " + " AND ".join(conditions) if conditions else "") + " ORDER BY id"
        with connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return jsonify(items=[serializable(row) for row in rows], categories=list(CATEGORIES))

    @app.get("/api/overview")
    def overview():
        with connect() as conn:
            data = dict(conn.execute("""SELECT COUNT(*) AS total_varieties, COALESCE(SUM(stock),0) AS available_packets,
                COUNT(*) FILTER (WHERE stock<=5) AS low_stock_count FROM catalog""").fetchone())
            data.update(conn.execute("""SELECT COUNT(*) FILTER (WHERE status='reserved') AS active_reservations,
                COALESCE(SUM(quantity) FILTER (WHERE status='collected'),0) AS collected_packets FROM reservations""").fetchone())
        return jsonify(data)

    @app.get("/api/reservations")
    def reservations():
        with connect() as conn:
            rows = conn.execute("""SELECT r.*,c.name AS seed_name,c.variety AS seed_variety,c.unit
                FROM reservations r JOIN catalog c ON c.id=r.seed_id ORDER BY r.id DESC""").fetchall()
        values=[]
        for row in rows:
            value=serializable(row);value["code"]=f"SH-{row['id']:05d}";values.append(value)
        return jsonify(items=values, statuses=list(STATUSES))

    @app.get("/api/activity")
    def activity():
        with connect() as conn:
            rows=conn.execute("SELECT * FROM activity ORDER BY id DESC LIMIT 100").fetchall()
        return jsonify(items=[serializable(row) for row in rows])

    @app.get("/api/runtime")
    def runtime():
        with connect() as conn:
            db=conn.execute("SELECT current_database() AS name,current_setting('server_version') AS version").fetchone()
            counts=conn.execute("""SELECT (SELECT COUNT(*) FROM catalog) AS catalog,
                (SELECT COUNT(*) FROM reservations) AS reservations,(SELECT COUNT(*) FROM activity) AS activity""").fetchone()
        return jsonify(application="SproutHouse",version=VERSION,backend_pod=os.environ.get("POD_NAME",socket.gethostname()),
                       namespace=os.environ.get("POD_NAMESPACE","local"),database="PostgreSQL",database_status="connected",
                       database_name=db["name"],database_version=db["version"],counts=counts)

    @app.post("/api/reservations")
    def reserve():
        data=reservation_input(body(["seed_id","quantity","member_name","member_email","notes"]))
        key=request.headers.get("Idempotency-Key")
        if key is not None and not re.fullmatch(r"[A-Za-z0-9_.:-]{8,120}",key):
            raise ApiError(400,"invalid_idempotency_key","Use an 8–120 character request key containing letters, numbers, dots, hyphens, underscores or colons.")
        digest=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()).hexdigest()
        with connect() as conn:
            if key:
                conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",(key,))
                previous=conn.execute("SELECT * FROM request_keys WHERE key=%s",(key,)).fetchone()
                if previous:
                    if previous["request_hash"]!=digest:
                        raise ApiError(409,"idempotency_conflict","This request key was already used for a different reservation.")
                    response=jsonify(reservation=reservation_row(conn,previous["reservation_id"]))
                    response.headers["Idempotent-Replayed"]="true"
                    return response,200
            seed=conn.execute("SELECT * FROM catalog WHERE id=%s FOR UPDATE",(data["seed_id"],)).fetchone()
            if seed is None:raise ApiError(404,"not_found","That seed variety could not be found.")
            if seed["stock"]<data["quantity"]:
                raise ApiError(409,"insufficient_stock",f"Only {seed['stock']} {seed['unit']}(s) are available now. Please choose a smaller quantity.",{"quantity":"The available stock changed. Refresh and try again."})
            conn.execute("UPDATE catalog SET stock=stock-%s WHERE id=%s",(data["quantity"],data["seed_id"]))
            row=conn.execute("""INSERT INTO reservations(seed_id,quantity,member_name,member_email,notes)
                VALUES (%s,%s,%s,%s,%s) RETURNING id""",tuple(data[k] for k in ["seed_id","quantity","member_name","member_email","notes"])).fetchone()
            reservation_id=row["id"]
            if key:conn.execute("INSERT INTO request_keys(key,request_hash,reservation_id) VALUES (%s,%s,%s)",(key,digest,reservation_id))
            conn.execute("INSERT INTO activity(kind,message) VALUES ('reserved',%s)",(f"{data['member_name']} reserved {data['quantity']} × {seed['name']}.",))
            result=reservation_row(conn,reservation_id)
        return jsonify(reservation=result),201

    @app.patch("/api/reservations/<int:reservation_id>")
    def change_reservation(reservation_id):
        data=body(["status"])
        target=enum(data,"status",("collected","cancelled"))
        with connect() as conn:
            row=conn.execute("SELECT * FROM reservations WHERE id=%s FOR UPDATE",(reservation_id,)).fetchone()
            if row is None:raise ApiError(404,"not_found","That reservation could not be found.")
            if row["status"]==target:return jsonify(reservation=reservation_row(conn,reservation_id))
            if row["status"]!="reserved":raise ApiError(409,"invalid_transition","This reservation is already complete. Create a new reservation to reserve more seeds.")
            seed=conn.execute("SELECT * FROM catalog WHERE id=%s FOR UPDATE",(row["seed_id"],)).fetchone()
            if target=="cancelled":conn.execute("UPDATE catalog SET stock=stock+%s WHERE id=%s",(row["quantity"],row["seed_id"]))
            conn.execute("""UPDATE reservations SET status=%s,updated_at=CURRENT_TIMESTAMP,
                collected_at=CASE WHEN %s='collected' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=%s""",(target,target,reservation_id))
            action="collected" if target=="collected" else "cancelled"
            conn.execute("INSERT INTO activity(kind,message) VALUES (%s,%s)",(action,f"{row['member_name']} {action} reservation SH-{row['id']:05d} for {seed['name']}."))
            result=reservation_row(conn,reservation_id)
        return jsonify(reservation=result)

    @app.post("/api/catalog")
    def add_seed():
        data=catalog_input(body(["name","variety","category","description","days_to_harvest","stock","unit","light","accent"]))
        with connect() as conn:
            row=conn.execute("""INSERT INTO catalog(name,variety,category,description,days_to_harvest,stock,unit,light,accent)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",tuple(data.values())).fetchone()
            conn.execute("INSERT INTO activity(kind,message) VALUES ('new_variety',%s)",(f"{data['name']} joined the library with {data['stock']} {data['unit']}(s).",))
        return jsonify(item=serializable(row)),201

    @app.post("/api/catalog/<int:seed_id>/restock")
    def restock(seed_id):
        data=body(["quantity","note"])
        quantity=integer(data,"quantity",1,1000)
        note=text_field(data,"note",maximum=300,multiline=True)
        with connect() as conn:
            seed=conn.execute("SELECT * FROM catalog WHERE id=%s FOR UPDATE",(seed_id,)).fetchone()
            if seed is None:raise ApiError(404,"not_found","That seed variety could not be found.")
            held=conn.execute("SELECT COALESCE(SUM(quantity),0) AS n FROM reservations WHERE seed_id=%s AND status='reserved'",(seed_id,)).fetchone()["n"]
            if seed["stock"]+held+quantity>MAX_STOCK:
                raise ApiError(409,"capacity_exceeded","Available and reserved stock together cannot exceed 10,000 packets.",{"quantity":"Choose a smaller restock quantity."})
            row=conn.execute("UPDATE catalog SET stock=stock+%s WHERE id=%s RETURNING *",(quantity,seed_id)).fetchone()
            message=f"{seed['name']} received {quantity} more {seed['unit']}(s)."+(" "+note if note else "")
            conn.execute("INSERT INTO activity(kind,message) VALUES ('restocked',%s)",(message,))
        return jsonify(item=serializable(row))

    return app


app=create_app(init_db=os.environ.get("SKIP_DB_INIT")!="1")

if __name__=="__main__":
    app.run(host="0.0.0.0",port=int(os.environ.get("PORT","8000")),debug=False)
