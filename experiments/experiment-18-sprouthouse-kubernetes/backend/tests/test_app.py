"""Run with: SKIP_DB_INIT=1 python -m unittest discover -s tests -v.

Set RUN_DATABASE_TESTS=1 with PostgreSQL connection variables for the concurrency
and transaction tests. Those tests create and clean only their own unique rows.
"""
import concurrent.futures
import json
import os
import unittest
import uuid
from unittest.mock import patch

os.environ["SKIP_DB_INIT"]="1"
import psycopg
from app import connect, create_app, initialize_database


class ValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app=create_app(init_db=False)
        cls.client=cls.app.test_client()

    def post_invalid(self,path,data,status=400):
        with patch("app.connect",side_effect=AssertionError("Invalid input reached PostgreSQL")):
            response=self.client.post(path,data=json.dumps(data),content_type="application/json")
        self.assertEqual(response.status_code,status,response.get_data(as_text=True))
        self.assertIn("message",response.get_json()["error"])

    def test_health_does_not_require_database(self):
        with patch("app.connect",side_effect=AssertionError("Liveness must not query PostgreSQL")):
            response=self.client.get("/healthz")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.get_json()["application"],"SproutHouse")

    def test_readiness_requires_database_and_hides_connection_details(self):
        with patch("app.connect",side_effect=psycopg.OperationalError("password=never-print-this")):
            response=self.client.get("/readyz")
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.get_json()["error"]["code"],"database_unavailable")
        self.assertNotIn("never-print",response.get_data(as_text=True))

    def test_routes_return_json_404_and_405(self):
        for response in [self.client.get("/missing"),self.client.delete("/api/catalog")]:
            self.assertIn(response.status_code,[404,405])
            self.assertIn("error",response.get_json())

    def test_request_identity_is_generated_and_safe(self):
        response=self.client.get("/healthz",headers={"X-Request-ID":"proof-123"})
        self.assertEqual(response.headers["X-Request-ID"],"proof-123")
        self.assertEqual(response.headers["Cache-Control"],"no-store")
        self.assertEqual(response.headers["X-Content-Type-Options"],"nosniff")

    def test_wrong_content_type_and_malformed_json(self):
        self.assertEqual(self.client.post("/api/catalog",data="name=Mint").status_code,415)
        self.assertEqual(self.client.post("/api/catalog",data="{",content_type="application/json").status_code,400)

    def test_json_object_is_required(self):
        for data in [[],["Mint"],"Mint",None,False]:
            with self.subTest(data=data):self.post_invalid("/api/catalog",data)

    def test_oversized_body_is_rejected(self):
        response=self.client.post("/api/catalog",json={"name":"x"*20000})
        self.assertEqual(response.status_code,413)

    def test_unknown_fields_do_not_reach_database(self):
        self.post_invalid("/api/catalog",{"name":"Mint","admin":True})

    def test_blank_name_and_control_characters(self):
        for value in ["", " ","M", "Mint\u0000garden", "x"*81]:
            with self.subTest(value=value):self.post_invalid("/api/catalog",{"name":value})

    def test_catalog_numeric_boundaries_and_boolean_rejection(self):
        for field,values in {"stock":[-1,10001,True,"3",[]],"days_to_harvest":[0,366,True,1.5,{}]}.items():
            for value in values:
                with self.subTest(field=field,value=value):self.post_invalid("/api/catalog",{"name":"Mint",field:value})

    def test_catalog_enums_and_colour_validation(self):
        for field,value in [("category","Other"),("light","Indoor"),("unit","crate"),("accent","red"),("accent","#123"),("category",{})]:
            with self.subTest(field=field,value=value):self.post_invalid("/api/catalog",{"name":"Mint",field:value})

    def test_reservation_fields_are_checked_before_database(self):
        base={"seed_id":1,"quantity":1,"member_name":"Asha Rao","member_email":"asha@example.invalid"}
        for field,value in [("seed_id",0),("seed_id",True),("quantity",0),("quantity",1001),("quantity",True),("member_name","A"),("member_email","bad-email"),("notes","x"*501)]:
            with self.subTest(field=field,value=value):self.post_invalid("/api/reservations",{**base,field:value})

    def test_invalid_idempotency_key_is_rejected(self):
        base={"seed_id":1,"quantity":1,"member_name":"Asha Rao","member_email":"asha@example.invalid"}
        with patch("app.connect",side_effect=AssertionError("Invalid key reached database")):
            response=self.client.post("/api/reservations",json=base,headers={"Idempotency-Key":"short"})
        self.assertEqual(response.status_code,400)

    def test_restock_quantity_and_note_boundaries(self):
        for data in [{"quantity":0},{"quantity":1001},{"quantity":False},{"quantity":2,"note":"x"*301}]:
            with self.subTest(data=data):self.post_invalid("/api/catalog/1/restock",data)

    def test_only_supported_terminal_statuses_are_accepted(self):
        for status in ["reserved","complete",True,[],None]:
            with self.subTest(status=status):
                with patch("app.connect",side_effect=AssertionError("Invalid transition reached database")):
                    response=self.client.patch("/api/reservations/1",json={"status":status})
                self.assertEqual(response.status_code,400)

    def test_invalid_search_and_category(self):
        with patch("app.connect",side_effect=AssertionError("Invalid search reached database")):
            self.assertEqual(self.client.get("/api/catalog?category=Unknown").status_code,400)
            self.assertEqual(self.client.get("/api/catalog?search="+"x"*121).status_code,400)


@unittest.skipUnless(os.environ.get("RUN_DATABASE_TESTS")=="1","Set RUN_DATABASE_TESTS=1 for real PostgreSQL tests")
class PostgreSQLTransactionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        initialize_database()
        cls.app=create_app(init_db=False)

    def setUp(self):
        self.token=uuid.uuid4().hex
        self.name="Transaction proof "+self.token[:12]
        with connect() as conn:
            self.seed_id=conn.execute("""INSERT INTO catalog(name,variety,category,description,days_to_harvest,stock,unit,light,accent)
                VALUES (%s,'Private test fixture','Herbs','Removed after the transaction test.',30,3,'packet','Full sun','#c8db9c') RETURNING id""",(self.name,)).fetchone()["id"]

    def tearDown(self):
        with connect() as conn:
            conn.execute("DELETE FROM request_keys WHERE reservation_id IN (SELECT id FROM reservations WHERE seed_id=%s)",(self.seed_id,))
            conn.execute("DELETE FROM reservations WHERE seed_id=%s",(self.seed_id,))
            conn.execute("DELETE FROM catalog WHERE id=%s",(self.seed_id,))
            conn.execute("DELETE FROM activity WHERE message LIKE %s",("%"+self.name+"%",))

    def reserve(self,index=0,quantity=1,key=None):
        with self.app.test_client() as client:
            return client.post("/api/reservations",json={"seed_id":self.seed_id,"quantity":quantity,"member_name":"Proof grower","member_email":"proof@example.invalid","notes":self.token},headers={"Idempotency-Key":key or f"{self.token}-{index}"})

    def stock(self):
        with connect() as conn:return conn.execute("SELECT stock FROM catalog WHERE id=%s",(self.seed_id,)).fetchone()["stock"]

    def test_parallel_reservations_never_oversell(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            responses=list(pool.map(self.reserve,range(12)))
        self.assertEqual(sum(r.status_code==201 for r in responses),3)
        self.assertEqual(sum(r.status_code==409 for r in responses),9)
        self.assertEqual(self.stock(),0)

    def test_concurrent_idempotency_key_debits_stock_once(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            responses=list(pool.map(lambda _:self.reserve(quantity=2,key=self.token),range(8)))
        self.assertEqual(sum(r.status_code==201 for r in responses),1)
        self.assertTrue(all(r.status_code in [200,201] for r in responses))
        self.assertEqual(len({r.get_json()["reservation"]["id"] for r in responses}),1)
        self.assertEqual(self.stock(),1)

    def test_cancel_race_restores_stock_exactly_once(self):
        rid=self.reserve(quantity=2).get_json()["reservation"]["id"]
        def cancel(_):
            with self.app.test_client() as client:return client.patch(f"/api/reservations/{rid}",json={"status":"cancelled"})
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:responses=list(pool.map(cancel,range(8)))
        self.assertTrue(all(r.status_code==200 for r in responses))
        self.assertEqual(self.stock(),3)
        with self.app.test_client() as client:self.assertEqual(client.patch(f"/api/reservations/{rid}",json={"status":"collected"}).status_code,409)

    def test_collection_keeps_stock_deducted_and_terminal(self):
        rid=self.reserve(quantity=2).get_json()["reservation"]["id"]
        with self.app.test_client() as client:
            for _ in range(2):self.assertEqual(client.patch(f"/api/reservations/{rid}",json={"status":"collected"}).status_code,200)
            self.assertEqual(client.patch(f"/api/reservations/{rid}",json={"status":"cancelled"}).status_code,409)
        self.assertEqual(self.stock(),1)

    def test_restock_accounts_for_reserved_capacity(self):
        with connect() as conn:conn.execute("UPDATE catalog SET stock=9999 WHERE id=%s",(self.seed_id,))
        rid=self.reserve(quantity=2).get_json()["reservation"]["id"]
        with self.app.test_client() as client:
            self.assertEqual(client.post(f"/api/catalog/{self.seed_id}/restock",json={"quantity":2}).status_code,409)
            self.assertEqual(client.post(f"/api/catalog/{self.seed_id}/restock",json={"quantity":1}).status_code,200)
            self.assertEqual(client.patch(f"/api/reservations/{rid}",json={"status":"cancelled"}).status_code,200)
        self.assertEqual(self.stock(),10000)

    def test_same_key_with_changed_payload_is_rejected(self):
        self.assertEqual(self.reserve(quantity=1,key=self.token).status_code,201)
        self.assertEqual(self.reserve(quantity=2,key=self.token).status_code,409)
        self.assertEqual(self.stock(),2)

    def test_parallel_initialization_is_safe_and_does_not_reseed(self):
        with connect() as conn:before=conn.execute("SELECT COUNT(*) AS n FROM catalog").fetchone()["n"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(lambda _:initialize_database(),range(6)))
        with connect() as conn:after=conn.execute("SELECT COUNT(*) AS n FROM catalog").fetchone()["n"]
        self.assertEqual(before,after)

    def test_readiness_and_runtime_query_real_postgresql(self):
        with self.app.test_client() as client:
            self.assertEqual(client.get("/readyz").status_code,200)
            runtime=client.get("/api/runtime").get_json()
        self.assertEqual(runtime["database"],"PostgreSQL")
        self.assertEqual(runtime["database_status"],"connected")
        self.assertTrue(runtime["database_version"])


if __name__=="__main__":unittest.main(verbosity=2)
