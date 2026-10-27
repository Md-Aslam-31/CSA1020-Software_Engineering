"""ParcelPilot: a stateless Flask API for illustrative delivery estimates."""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import logging
import math
import os
import socket
import time
from uuid import uuid4

from flask import Flask, g, jsonify, render_template, request
from werkzeug.exceptions import BadRequest, HTTPException

VERSION = "1.0.0"
SERVICES = {
    "economy": {"name": "Economy", "description": "A lighter price for flexible plans.", "base_fee": 40, "per_km": 1.2, "per_kg": 12, "speed_kmh": 45, "handling_hours": 18},
    "express": {"name": "Express", "description": "A balanced choice for the everyday.", "base_fee": 85, "per_km": 1.8, "per_kg": 18, "speed_kmh": 65, "handling_hours": 8},
    "priority": {"name": "Priority", "description": "Less waiting, more momentum.", "base_fee": 140, "per_km": 2.4, "per_kg": 25, "speed_kmh": 80, "handling_hours": 3},
}
EXAMPLE = {"origin": "Chennai", "destination": "Bengaluru", "distance_km": 350, "weight_kg": 2.5, "service": "express"}


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(MAX_CONTENT_LENGTH=16384, JSON_SORT_KEYS=False)
    app.json.sort_keys = False
    if config:
        app.config.update(config)
    app.logger.setLevel(logging.INFO)

    def instance():
        return os.getenv("POD_NAME") or socket.gethostname()

    def meta():
        return {"request_id": g.request_id, "served_by": instance(), "namespace": os.getenv("POD_NAMESPACE", "standalone"), "mode": os.getenv("APP_MODE", "local"), "version": VERSION}

    def success(data, status=200):
        return jsonify(data=data, meta=meta()), status

    @app.before_request
    def begin_request():
        g.request_id = uuid4().hex
        g.started_at = time.perf_counter()

    @app.after_request
    def finish_request(response):
        response.headers["X-Request-ID"] = g.request_id
        response.headers["X-Instance-ID"] = instance()
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/api/") or request.path in ("/healthz", "/readyz"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["Server-Timing"] = "app;dur={:.2f}".format((time.perf_counter() - g.started_at) * 1000)
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error={"code": error.name.upper().replace(" ", "_"), "message": error.description}, meta=meta()), error.code

    @app.errorhandler(Exception)
    def internal_error(error):
        app.logger.exception("Unhandled error; request_id=%s", g.request_id)
        return jsonify(error={"code": "INTERNAL_ERROR", "message": "The request could not be completed."}, meta=meta()), 500

    def parse_trip(include_service):
        data = request.get_json()
        if not isinstance(data, dict):
            raise BadRequest("Send a JSON object containing the trip fields.")
        required = {"origin", "destination", "distance_km", "weight_kg"}
        if include_service:
            required.add("service")
        missing = sorted(required - data.keys())
        unknown = sorted(data.keys() - required)
        if missing:
            raise BadRequest("Missing fields: " + ", ".join(missing))
        if unknown:
            raise BadRequest("Unknown fields: " + ", ".join(unknown))
        result = {}
        for field in ("origin", "destination"):
            value = data[field]
            if not isinstance(value, str) or not 2 <= len(value.strip()) <= 60:
                raise BadRequest(field + " must be text between 2 and 60 characters.")
            result[field] = value.strip()
        if result["origin"].casefold() == result["destination"].casefold():
            raise BadRequest("Origin and destination must be different.")
        for field, minimum, maximum in (("distance_km", 1, 20000), ("weight_kg", 0.1, 500)):
            value = data[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum or not math.isfinite(value):
                raise BadRequest("{} must be a finite JSON number from {} to {}.".format(field, minimum, maximum))
            result[field] = value
        if include_service:
            service = data["service"]
            if not isinstance(service, str) or service not in SERVICES:
                raise BadRequest("service must be economy, express, or priority.")
            result["service"] = service
        return result

    def money(value):
        return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    def quote_for(trip, code):
        service = SERVICES[code]
        distance_cost = Decimal(str(trip["distance_km"])) * Decimal(str(service["per_km"]))
        weight_cost = Decimal(str(trip["weight_kg"])) * Decimal(str(service["per_kg"]))
        total = Decimal(service["base_fee"]) + distance_cost + weight_cost
        return {
            "quote_id": "PP-" + uuid4().hex[:10].upper(),
            "origin": trip["origin"], "destination": trip["destination"],
            "distance_km": trip["distance_km"], "weight_kg": trip["weight_kg"],
            "service": code, "service_name": service["name"], "currency": "INR",
            "breakdown": {"base": money(service["base_fee"]), "distance": money(distance_cost), "weight": money(weight_cost)},
            "total": money(total),
            "estimated_hours": round(service["handling_hours"] + trip["distance_km"] / service["speed_kmh"], 1),
            "note": "Illustrative lab rates and timings. This is not a booking or a carrier quote.",
        }

    @app.get("/")
    def workbench():
        return render_template("index.html", version=VERSION)

    @app.get("/healthz")
    def health():
        return jsonify(status="healthy", service="parcelpilot", version=VERSION)

    @app.get("/readyz")
    def readiness():
        return jsonify(status="ready", service="parcelpilot", version=VERSION)

    @app.get("/api/v1/status")
    def status():
        return success({
            "application": "ParcelPilot", "status": "ready", "version": VERSION,
            "instance": instance(), "namespace": os.getenv("POD_NAMESPACE", "standalone"),
            "mode": os.getenv("APP_MODE", "local"), "worker_pid": os.getpid(),
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "storage": "stateless", "currency": "INR",
        })

    @app.get("/api/v1/services")
    def services():
        sort = request.args.get("sort", "base_fee")
        if sort not in ("base_fee", "handling_hours"):
            raise BadRequest("sort must be base_fee or handling_hours.")
        limit = request.args.get("max_base_fee")
        max_fee = None
        if limit is not None:
            try:
                max_fee = float(limit)
            except ValueError:
                raise BadRequest("max_base_fee must be a finite non-negative number.")
            if not math.isfinite(max_fee) or max_fee < 0:
                raise BadRequest("max_base_fee must be a finite non-negative number.")
        records = [{"code": code, **value} for code, value in SERVICES.items()]
        if max_fee is not None:
            records = [item for item in records if item["base_fee"] <= max_fee]
        return success({"services": sorted(records, key=lambda item: item[sort]), "count": len(records), "currency": "INR", "rates": "illustrative lab data"})

    @app.get("/api/v1/services/<code>")
    def service_detail(code):
        if code not in SERVICES:
            return jsonify(error={"code": "NOT_FOUND", "message": "That service does not exist."}, meta=meta()), 404
        return success({"code": code, **SERVICES[code], "currency": "INR", "rates": "illustrative lab data"})

    @app.post("/api/v1/quotes")
    def create_quote():
        trip = parse_trip(True)
        return success(quote_for(trip, trip["service"]), 201)

    @app.post("/api/v1/compare")
    def compare():
        trip = parse_trip(False)
        quotes = [quote_for(trip, code) for code in SERVICES]
        quotes.sort(key=lambda value: value["total"])
        return success({"quotes": quotes, "cheapest": quotes[0]["service"], "fastest": min(quotes, key=lambda value: value["estimated_hours"])["service"]})

    @app.get("/api/v1/examples")
    def examples():
        return success({"quote": EXAMPLE, "compare": {key: value for key, value in EXAMPLE.items() if key != "service"}})

    @app.get("/openapi.json")
    def openapi():
        trip_properties = {
            "origin": {"type": "string", "minLength": 2, "maxLength": 60},
            "destination": {"type": "string", "minLength": 2, "maxLength": 60},
            "distance_km": {"type": "number", "minimum": 1, "maximum": 20000},
            "weight_kg": {"type": "number", "minimum": 0.1, "maximum": 500},
        }
        paths = {}
        for path, summary in (
            ("/healthz", "Container liveness"), ("/readyz", "Application readiness"),
            ("/api/v1/status", "Current instance identity"), ("/api/v1/services", "List and filter services"),
            ("/api/v1/examples", "Example request bodies"),
        ):
            paths[path] = {"get": {"summary": summary, "responses": {"200": {"description": "Success"}}}}
        paths["/api/v1/services/{code}"] = {"get": {"summary": "Get one service", "parameters": [{"name": "code", "in": "path", "required": True, "schema": {"type": "string", "enum": list(SERVICES)}}], "responses": {"200": {"description": "Service"}, "404": {"description": "Unknown service"}}}}
        for path, include_service in (("/api/v1/quotes", True), ("/api/v1/compare", False)):
            properties = dict(trip_properties)
            if include_service:
                properties["service"] = {"type": "string", "enum": list(SERVICES)}
            paths[path] = {"post": {
                "summary": "Create an estimate" if include_service else "Compare all services",
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}, "example": EXAMPLE if include_service else {k: v for k, v in EXAMPLE.items() if k != "service"}}}},
                "responses": {("201" if include_service else "200"): {"description": "Calculated estimate"}, "400": {"description": "Validation error"}, "413": {"description": "Body too large"}, "415": {"description": "JSON required"}},
            }}
        paths["/api/v1/services"]["get"]["parameters"] = [
            {"name": "sort", "in": "query", "schema": {"type": "string", "enum": ["base_fee", "handling_hours"]}},
            {"name": "max_base_fee", "in": "query", "schema": {"type": "number", "minimum": 0}},
        ]
        return jsonify(openapi="3.1.0", info={"title": "ParcelPilot API", "version": VERSION, "description": "Stateless delivery-quote teaching API. All rates and timings are illustrative."}, servers=[{"url": "/"}], paths=paths)

    return app


app = create_app()
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
