import os
import unittest
from unittest.mock import patch

from app import app


class PackingTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.trip = {"days": 4, "travelers": 2, "climate": "warm", "activity": "city", "laundry": False}

    def post(self, **changes):
        return self.client.post("/api/packing-list", json={**self.trip, **changes})

    @staticmethod
    def quantities(data):
        return {item["name"]: item["quantity"] for group in data["categories"] for item in group["items"]}

    def test_home_and_assets_are_served(self):
        page = self.client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b"Packlight", page.data)
        for asset in ("/static/app.js", "/static/styles.css"):
            with self.client.get(asset) as response:
                self.assertEqual(response.status_code, 200)

    def test_health_endpoint(self):
        self.assertEqual(self.client.get("/healthz").get_json(), {"status": "ok"})

    def test_metadata_reports_runtime_build(self):
        with patch.dict(os.environ, {"GIT_SHA": "abc123", "BUILD_NUMBER": "7.1"}):
            self.assertEqual(self.client.get("/api/version").get_json(), {
                "application": "Packlight", "version": "1.0.0", "git_sha": "abc123", "build_number": "7.1"})

    def test_default_trip_and_exact_quantities(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["trip"], self.trip)
        self.assertEqual(data["total_items"], 46)
        self.assertEqual(self.quantities(data), {
            "Toiletry kit": 2, "Phone charger": 2, "Water bottle": 2, "Travel ID": 2,
            "Tops": 8, "Underwear": 10, "Socks": 8, "Bottoms": 4,
            "Sun hat": 2, "Sunglasses": 2, "Walking shoes": 2, "Day bag": 2})

    def test_rainy_trail_kit_has_shared_first_aid(self):
        data = self.post(climate="rainy", activity="trail").get_json()
        quantities = self.quantities(data)
        self.assertEqual(data["total_items"], 47)
        self.assertEqual(quantities["Rain jacket"], 2)
        self.assertEqual(quantities["Trail shoes"], 2)
        self.assertEqual(quantities["First aid kit"], 1)
        self.assertNotIn("Sun hat", quantities)

    def test_cool_beach_variation(self):
        quantities = self.quantities(self.post(climate="cool", activity="beach").get_json())
        self.assertEqual(quantities["Warm layer"], 2)
        self.assertEqual(quantities["Swimwear"], 4)
        self.assertEqual(quantities["Beach towel"], 2)

    def test_laundry_caps_clothes_at_four_day_rotation(self):
        normal = self.post(days=12).get_json()
        laundry = self.post(days=12, laundry=True).get_json()
        self.assertEqual(self.quantities(normal)["Tops"], 24)
        self.assertEqual(self.quantities(laundry)["Tops"], 8)
        self.assertLess(laundry["total_items"], normal["total_items"])

    def test_short_laundry_trip_does_not_inflate_clothes(self):
        self.assertEqual(self.post(days=1).get_json()["categories"],
                         self.post(days=1, laundry=True).get_json()["categories"])

    def test_minimum_and_maximum_groups_are_bounded(self):
        for days, travelers in ((1, 1), (30, 8)):
            with self.subTest(days=days, travelers=travelers):
                data = self.post(days=days, travelers=travelers).get_json()
                self.assertTrue(all(type(item["quantity"]) is int and item["quantity"] > 0
                                    for group in data["categories"] for item in group["items"]))
                self.assertEqual(data["total_items"], sum(self.quantities(data).values()))

    def test_invalid_numeric_ranges_rejected(self):
        for changes in ({"days": 0}, {"days": 31}, {"travelers": 0}, {"travelers": 9}):
            with self.subTest(changes=changes):
                self.assertEqual(self.post(**changes).status_code, 400)

    def test_numeric_booleans_strings_and_floats_rejected(self):
        for field in ("days", "travelers"):
            for value in (True, False, "2", 2.5, None):
                with self.subTest(field=field, value=value):
                    self.assertEqual(self.post(**{field: value}).status_code, 400)

    def test_invalid_enumerations_rejected(self):
        for changes in ({"climate": "snow"}, {"climate": ["warm"]}, {"activity": "ski"}, {"activity": None}):
            with self.subTest(changes=changes):
                self.assertEqual(self.post(**changes).status_code, 400)

    def test_laundry_requires_json_boolean(self):
        for value in ("true", "false", 1, 0, None):
            with self.subTest(value=value):
                self.assertEqual(self.post(laundry=value).status_code, 400)

    def test_missing_field_rejected_with_field_details(self):
        trip = dict(self.trip)
        del trip["days"]
        response = self.client.post("/api/packing-list", json=trip)
        self.assertEqual(response.status_code, 400)
        self.assertIn("days", response.get_json()["error"]["fields"])

    def test_unknown_field_rejected(self):
        response = self.post(password="not-an-app-field")
        self.assertEqual(response.status_code, 400)
        self.assertIn("unknown", response.get_json()["error"]["fields"])

    def test_json_nonobjects_rejected(self):
        for body in ("null", "[]", '"trip"', "1"):
            with self.subTest(body=body):
                response = self.client.post("/api/packing-list", data=body, content_type="application/json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json()["error"]["code"], "invalid_trip")

    def test_content_type_and_malformed_json(self):
        self.assertEqual(self.client.post("/api/packing-list", data="{}").status_code, 415)
        response = self.client.post("/api/packing-list", data="{broken", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "invalid_json")

    def test_oversized_request_rejected(self):
        response = self.client.post("/api/packing-list", data=" " * 17000, content_type="application/json")
        self.assertEqual(response.status_code, 413)

    def test_stateless_deterministic_results(self):
        first = self.post().get_json()
        self.post(days=10, travelers=8)
        self.assertEqual(first, self.post().get_json())

    def test_json_is_not_cached_and_no_debug_headers(self):
        response = self.client.get("/api/version")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("script-src 'self'", response.headers["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main()
