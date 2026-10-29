"""Packlight: a small, stateless Flask application for the CI/CD experiment."""
import math
import os

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge

app = Flask(__name__)
app.config.update(MAX_CONTENT_LENGTH=16 * 1024, JSON_SORT_KEYS=False)
VERSION = "1.0.0"
FIELDS = {"days", "travelers", "climate", "activity", "laundry"}


def error(code, message, status=400, fields=None):
    detail = {"code": code, "message": message}
    if fields:
        detail["fields"] = fields
    return jsonify(error=detail), status


def validate_trip(payload):
    if not isinstance(payload, dict):
        return None, {"body": "Send a JSON object with the five trip fields."}
    problems = {}
    missing, unknown = FIELDS - payload.keys(), payload.keys() - FIELDS
    if missing:
        problems["missing"] = ", ".join(sorted(missing))
    if unknown:
        problems["unknown"] = ", ".join(sorted(unknown))
    for field, maximum in (("days", 30), ("travelers", 8)):
        value = payload.get(field)
        if type(value) is not int or not 1 <= value <= maximum:
            problems[field] = f"Choose a whole number from 1 to {maximum}."
    for field, choices in (("climate", ("warm", "cool", "rainy")),
                           ("activity", ("city", "trail", "beach"))):
        if payload.get(field) not in choices:
            problems[field] = "Choose " + ", ".join(choices) + "."
    if type(payload.get("laundry")) is not bool:
        problems["laundry"] = "Use true or false."
    return (None, problems) if problems else ({field: payload[field] for field in sorted(FIELDS)}, None)


def packing_list(trip):
    people = trip["travelers"]
    units = min(trip["days"], 4) if trip["laundry"] else trip["days"]

    def group(name, values):
        return {"name": name, "items": [{"name": label, "quantity": count} for label, count in values]}

    essentials = [(name, people) for name in ("Toiletry kit", "Phone charger", "Water bottle", "Travel ID")]
    clothing = [("Tops", units * people), ("Underwear", (units + 1) * people),
                ("Socks", units * people), ("Bottoms", max(1, math.ceil(units / 3)) * people)]
    weather = {
        "warm": ("Sun hat", "Sunglasses"),
        "cool": ("Warm layer", "Compact jacket"),
        "rainy": ("Rain jacket", "Waterproof bag"),
    }
    activity = {
        "city": [("Walking shoes", people), ("Day bag", people)],
        "trail": [("Trail shoes", people), ("Headlamp", people), ("First aid kit", 1)],
        "beach": [("Swimwear", 2 * people), ("Sandals", people), ("Beach towel", people)],
    }
    categories = [group("Essentials", essentials), group("Clothing", clothing),
                  group("Weather extras", [(name, people) for name in weather[trip["climate"]]]),
                  group("Activity kit", activity[trip["activity"]])]
    return {"trip": trip, "categories": categories,
            "total_items": sum(item["quantity"] for category in categories for item in category["items"])}


@app.get("/")
def index():
    return render_template("index.html", version=VERSION)


@app.get("/healthz")
def health():
    return jsonify(status="ok")


@app.get("/api/version")
def version():
    return jsonify(application="Packlight", version=VERSION,
                   git_sha=os.environ.get("GIT_SHA", "development"),
                   build_number=os.environ.get("BUILD_NUMBER", "local"))


@app.post("/api/packing-list")
def create_packing_list():
    if not request.is_json:
        return error("unsupported_media_type", "Send the trip as application/json.", 415)
    trip, problems = validate_trip(request.get_json())
    if problems:
        return error("invalid_trip", "Please check your trip details.", fields=problems)
    return jsonify(packing_list(trip))


@app.errorhandler(BadRequest)
def malformed_json(_exception):
    return error("invalid_json", "The request body must contain valid JSON.")


@app.errorhandler(RequestEntityTooLarge)
def body_too_large(_exception):
    return error("request_too_large", "Keep the trip request below 16 KiB.", 413)


@app.after_request
def headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
    )
    if request.path.startswith("/api/") or request.path == "/healthz":
        response.headers["Cache-Control"] = "no-store"
    return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=False)
