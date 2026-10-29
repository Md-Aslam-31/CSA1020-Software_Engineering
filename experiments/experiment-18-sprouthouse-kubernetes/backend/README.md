# SproutHouse API

The API uses Flask, Gunicorn and PostgreSQL. It is a private shared demonstration
workspace, without a separate application login. Browser access is protected by
the private Codespaces forwarded port; this is not a production authentication
system.

Use `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD`, or `DATABASE_URL`.
The Kubernetes configuration supplies the password from a generated Secret.
Never include a real password in source files, screenshots or logs.

The backend listens on port 8000. `GET /healthz` is process liveness;
`GET /readyz` queries PostgreSQL. Startup retries the database for up to sixty
seconds and uses a PostgreSQL advisory transaction lock for schema/seed setup.
Two replicas and multiple Gunicorn workers can therefore start together.

| Route | Behaviour |
|---|---|
| `GET /api/catalog?search=&category=` | Search all text fields and filter Herbs, Vegetables or Flowers |
| `GET /api/overview` | Current available stock, active reservations, collected packets and low-stock count |
| `GET /api/reservations` | Newest reservations, codes, member details and statuses |
| `GET /api/activity` | Latest one hundred persisted events |
| `GET /api/runtime` | Actual pod identity, namespace, PostgreSQL name/version and table counts |
| `POST /api/catalog` | Add a seed variety; returns `{item: ...}` with HTTP 201 |
| `POST /api/catalog/{id}/restock` | Add 1–1000 units and an optional note; returns `{item: ...}` |
| `POST /api/reservations` | Reserve available stock atomically; returns `{reservation: ...}` with HTTP 201 |
| `PATCH /api/reservations/{id}` | Collect or cancel a reservation; returns `{reservation: ...}` |

`Idempotency-Key` is optional on reservation creation (8–120 ASCII letters,
digits, dots, colons, underscores or hyphens). Replaying the same normalized
request returns HTTP 200 and `Idempotent-Replayed: true`; a different request
with the same key returns HTTP 409. Concurrent duplicate requests debit stock
once. PostgreSQL row locks prevent overselling between backend replicas.

Reservations start as `reserved`. A collection keeps the stock deducted; a
cancellation restores it exactly once. Repeating the same terminal status is
safe. Switching from one terminal status to another is rejected with HTTP 409.
Restock capacity includes units held in active reservations so cancelling a
reservation cannot overflow the 10,000-unit stock constraint.

Errors return `{error: {code, message, fields?}}` with meaningful 400, 404, 409,
413, 415 or 503 responses. All database queries use bound parameters. Runtime
responses expose no passwords, connection URLs or private Kubernetes tokens.

Run input/security and route tests inside the backend container:

```bash
SKIP_DB_INIT=1 python -m unittest discover -s tests -v
```

With PostgreSQL connection variables available, add `RUN_DATABASE_TESTS=1` to
include real concurrency, idempotency, cancellation, collection, stock capacity
and concurrent schema initialization tests. Those tests create unique fixture
rows and clean only those fixtures in `tearDown`; they do not reset the library.
Tests are excluded from the runtime image by `.dockerignore`; mount or copy the
`tests` directory into a temporary test container to run them.
