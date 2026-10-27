import json
import unittest
from app import create_app, EXAMPLE


class ParcelPilotTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app({"TESTING": True}).test_client()
        self.trip = dict(EXAMPLE)

    def assert_error(self, response, status):
        self.assertEqual(response.status_code, status, response.get_data(as_text=True))
        self.assertEqual(response.mimetype, "application/json")
        self.assertIn("message", response.json["error"])
        self.assertEqual(response.headers["X-Request-ID"], response.json["meta"]["request_id"])

    def test_home_and_local_assets(self):
        for path in ("/", "/static/styles.css", "/static/app.js", "/static/favicon.svg"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                response.close()

    def test_liveness_and_readiness(self):
        self.assertEqual(self.client.get("/healthz").json["status"], "healthy")
        self.assertEqual(self.client.get("/readyz").json["status"], "ready")

    def test_status_and_trace_headers(self):
        first = self.client.get("/api/v1/status")
        second = self.client.get("/api/v1/status")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json["data"]["storage"], "stateless")
        self.assertEqual(first.json["meta"]["served_by"], first.headers["X-Instance-ID"])
        self.assertNotEqual(first.headers["X-Request-ID"], second.headers["X-Request-ID"])
        self.assertEqual(first.headers["Cache-Control"], "no-store")
        self.assertEqual(first.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(first.headers["X-Frame-Options"], "DENY")

    def test_list_services_and_filter(self):
        self.assertEqual(self.client.get("/api/v1/services").json["data"]["count"], 3)
        filtered = self.client.get("/api/v1/services?max_base_fee=100").json["data"]
        self.assertEqual([item["code"] for item in filtered["services"]], ["economy", "express"])
        self.assertEqual(self.client.get("/api/v1/services?max_base_fee=0").json["data"]["count"], 0)

    def test_service_sort_and_invalid_filters(self):
        fastest = self.client.get("/api/v1/services?sort=handling_hours").json["data"]["services"][0]
        self.assertEqual(fastest["code"], "priority")
        for query in ("sort=unknown", "max_base_fee=oops", "max_base_fee=NaN", "max_base_fee=-1", "max_base_fee=Infinity"):
            with self.subTest(query=query):
                self.assert_error(self.client.get("/api/v1/services?" + query), 400)

    def test_service_detail_and_missing_service(self):
        self.assertEqual(self.client.get("/api/v1/services/express").json["data"]["base_fee"], 85)
        self.assert_error(self.client.get("/api/v1/services/unknown"), 404)

    def test_quote_price_and_breakdown(self):
        response = self.client.post("/api/v1/quotes", json=self.trip)
        self.assertEqual(response.status_code, 201)
        quote = response.json["data"]
        self.assertEqual(quote["total"], 760)
        self.assertEqual(quote["breakdown"], {"base": 85, "distance": 630, "weight": 45})
        self.assertEqual(quote["estimated_hours"], 13.4)
        self.assertEqual(quote["currency"], "INR")
        self.assertTrue(quote["quote_id"].startswith("PP-"))

    def test_three_services_compare_consistently(self):
        payload = {key: value for key, value in self.trip.items() if key != "service"}
        response = self.client.post("/api/v1/compare", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json["data"]
        self.assertEqual([quote["total"] for quote in data["quotes"]], [490, 760, 1042.5])
        self.assertEqual(data["cheapest"], "economy")
        self.assertEqual(data["fastest"], "priority")
        for quote in data["quotes"]:
            direct = self.client.post("/api/v1/quotes", json={**payload, "service": quote["service"]}).json["data"]
            self.assertEqual(direct["total"], quote["total"])

    def test_requests_do_not_depend_on_process_storage(self):
        first = self.client.post("/api/v1/quotes", json=self.trip).json["data"]
        other_client = create_app({"TESTING": True}).test_client()
        second = other_client.post("/api/v1/quotes", json=self.trip).json["data"]
        self.assertEqual(first["total"], second["total"])
        self.assertNotEqual(first["quote_id"], second["quote_id"])

    def test_boundaries(self):
        for distance, weight in ((1, 0.1), (20000, 500)):
            with self.subTest(distance=distance, weight=weight):
                self.assertEqual(self.client.post("/api/v1/quotes", json={**self.trip, "distance_km": distance, "weight_kg": weight}).status_code, 201)

    def test_numeric_validation_including_large_integers(self):
        for field, values in (("distance_km", (0, -1, 20001, True, "350", None, 10**400)), ("weight_kg", (0, -1, 500.1, True, "2.5", None, 10**400))):
            for value in values:
                with self.subTest(field=field, value=str(value)[:20]):
                    self.assert_error(self.client.post("/api/v1/quotes", json={**self.trip, field: value}), 400)

    def test_non_finite_numbers(self):
        for value in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(value=value):
                body = json.dumps({**self.trip, "distance_km": value})
                self.assert_error(self.client.post("/api/v1/quotes", data=body, content_type="application/json"), 400)

    def test_required_unknown_and_non_object_fields(self):
        missing = dict(self.trip)
        del missing["origin"]
        for body in (missing, {**self.trip, "typo": 5}, [], "hello", None):
            with self.subTest(body=body):
                self.assert_error(self.client.post("/api/v1/quotes", data=json.dumps(body), content_type="application/json"), 400)

    def test_city_and_service_validation(self):
        for body in ({**self.trip, "origin": " "}, {**self.trip, "origin": "x"*61}, {**self.trip, "destination": " chennai "}, {**self.trip, "service": "teleport"}, {**self.trip, "service": 4}):
            with self.subTest(body=body):
                self.assert_error(self.client.post("/api/v1/quotes", json=body), 400)
        trimmed = self.client.post("/api/v1/quotes", json={**self.trip, "origin": " Chennai "}).json["data"]
        self.assertEqual(trimmed["origin"], "Chennai")

    def test_json_transport_errors(self):
        self.assert_error(self.client.post("/api/v1/quotes", data="{", content_type="application/json"), 400)
        self.assert_error(self.client.post("/api/v1/quotes", data="hello", content_type="text/plain"), 415)
        self.assert_error(self.client.post("/api/v1/quotes", data="x"*17000, content_type="application/json"), 413)

    def test_unknown_route_and_wrong_method(self):
        self.assert_error(self.client.get("/api/v1/not-a-route"), 404)
        self.assert_error(self.client.get("/api/v1/quotes"), 405)

    def test_openapi_and_examples(self):
        document = self.client.get("/openapi.json")
        self.assertEqual(document.status_code, 200)
        self.assertEqual(document.json["openapi"], "3.1.0")
        self.assertIn("post", document.json["paths"]["/api/v1/quotes"])
        schema = document.json["paths"]["/api/v1/quotes"]["post"]["requestBody"]["content"]["application/json"]["schema"]
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(self.client.get("/api/v1/examples").json["data"]["quote"], EXAMPLE)


if __name__ == "__main__":
    unittest.main()
