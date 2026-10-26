# BSF Backend

Backend for the BSF Smart Kitchen Waste Bin platform: notification delivery
(Email / WhatsApp), customer and machine records, audit trail and the alert
rules that decide when a message should be sent.

## Layout

```
src/
  server.js             HTTP API (node:http, no framework)
  worker.js             background notification worker
  config.js             reads /etc/bsf-backend.env
  db.js                 PostgreSQL pool, transactions, audit helper
  lib/                  routing, validation, error types
  middleware/auth.js    x-api-key guard for write endpoints
  providers/            email.js, whatsapp.js  <- vendor-specific code lives here
  services/             notification queue, alert fan-out, templates
db/
  migrate.js            migration runner
  migrations/*.sql      schema
deploy/                 systemd units + nginx snippet
```

## Why it is built this way

The customer has not supplied the Email / WhatsApp vendor API documentation or
credentials yet. Rather than guessing, every send goes through a queue and the
provider adapter **refuses to claim success while credentials are blank**:

- the job is stored with `status = 'waiting_config'`
- the API returns `EMAIL_PROVIDER_NOT_CONFIGURED` / `WHATSAPP_PROVIDER_NOT_CONFIGURED`
- nothing is dropped, and nothing is faked

When the documents arrive, only `src/providers/email.js` and
`src/providers/whatsapp.js` need editing. The database, the queue, the retry
logic, the API surface and the dashboard do not change.

## Setup (Ubuntu)

```bash
# 1. database
sudo -u postgres psql -c "CREATE DATABASE bsf;"
sudo -u postgres psql -c "CREATE USER bsf_app WITH PASSWORD '<generated>';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE bsf TO bsf_app;"

# 2. environment (chmod 600, never committed)
sudo cp .env.example /etc/bsf-backend.env
sudo nano /etc/bsf-backend.env

# 3. dependencies + schema
cd /var/www/bsf-backend
npm install --omit=dev
set -a; . /etc/bsf-backend.env; set +a
npm run migrate

# 4. services
sudo cp deploy/bsf-backend.service deploy/bsf-notification-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bsf-backend bsf-notification-worker
```

## API

Write endpoints accept either a Master Admin session or
`x-api-key: <INTERNAL_API_KEY>` for service-to-service calls. With
`AUTH_REQUIRED=true`, every API route except health/login requires a valid
session; tenant roles are scoped by the backend.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/v1/auth/login` | Vendor login; sets the BSF session cookie |
| GET | `/api/v1/auth/me` | Current authenticated user and role |
| POST | `/api/v1/auth/logout` | Revoke the current session |
| POST | `/api/v1/auth/refresh` | Reserved until the vendor provides a refresh endpoint |
| GET | `/api/v1/health` | minimal public readiness status |
| GET | `/api/v1/internal/health` | detailed status (service key or Master Admin) |
| GET | `/api/v1/meta/providers` | is Email / WhatsApp configured yet |
| GET | `/api/v1/notifications/logs` | delivery history |
| GET | `/api/v1/notifications/jobs` | queue contents |
| POST | `/api/v1/notifications/send` | enqueue a message |
| POST | `/api/v1/notifications/test/email` | dashboard test button |
| POST | `/api/v1/notifications/test/whatsapp` | dashboard test button |
| POST | `/api/v1/notifications/jobs/retry` | retry a job / requeue waiting_config |
| POST | `/api/v1/alerts/temperature` | threshold check + fan-out |
| GET/POST/PUT/DELETE | `/api/v1/clients` | client records |
| GET/POST/PUT/DELETE | `/api/v1/machines` | machine records + client linkage |
| GET/POST/PUT/DELETE | `/api/v1/users` | Master Admin / Client Admin / User |
| GET/POST/DELETE | `/api/v1/notification-recipients` | who receives alerts |
| GET/PUT | `/api/v1/notification-preferences` | per-scope channel preferences |
| GET/PUT | `/api/v1/alert-thresholds` | per-machine temperature limits |
| GET | `/api/v1/audit-logs` | change history |

### Vendor login and session security

The browser never calls the vendor login API directly. The backend:

1. receives `{ "userName": "...", "password": "..." }`;
2. hashes the password as 32-character uppercase MD5;
3. calls `VENDOR_LOGIN_URL` from the server;
4. maps vendor `type` 1/2/3 to `master_admin` / `client_admin` / `user`;
5. stores vendor tokens encrypted with AES-256-GCM;
6. sets an opaque `HttpOnly` session cookie and a separate CSRF cookie.

The raw vendor token is never returned to the browser. State-changing requests
must include the `X-CSRF-Token` header, and repeated login failures are rate
limited and written to the audit log. The same-origin `/api/gateway/` MQTT
bridge also requires a valid BSF session; unauthenticated device-data requests
are rejected.

Required environment values are documented in `.env.example`. Generate a key
with `openssl rand -base64 32`. `AUTH_COOKIE_SECURE=true` requires HTTPS; do not
disable it on a production site.

Production must run behind the Nginx TLS template in `deploy/nginx-tls-site.conf`.
Set `PUBLIC_ORIGIN`, `TRUST_PROXY=true` and `REQUIRE_HTTPS=true`; startup fails
closed when HTTPS, secure cookies, authentication or a strong internal API key
are not configured. The full migration checklist is in `../docs/security-deployment.md`.

### Data scoping rules

- **Master Admin** — no filter, sees every client and machine.
- **Client Admin** — `clientId` is fixed to their own client; the client filter
  is removed from the UI.
- **User** — `machineId` is fixed to their single machine.

The API accepts `clientId` / `machineId` filters for Master Admin views. For
Client Admin and User sessions, the backend overwrites those values from the
authenticated principal; browser-supplied scope is never trusted.

## Alert rule

`POST /api/v1/alerts/temperature` with `{ machineSerial, temperatureC }`:

1. resolve the machine and its effective threshold
   (machine override -> client default -> global default -> 12/58 C)
2. if the reading is outside the range, fan out to every enabled recipient
3. dedupe per machine + direction inside a 60 minute window
4. queue jobs for the worker

## Testing without vendor credentials

```bash
curl -s localhost:3000/api/v1/health | jq
curl -s -X POST localhost:3000/api/v1/notifications/test/email \
     -H 'content-type: application/json' \
     -d '{"to":"ops@example.com"}' | jq
```

The second call returns `providerConfigured: false` and the job stays in
`waiting_config`. Once credentials are added, either restart the worker or call
`POST /api/v1/notifications/jobs/retry {"allWaitingConfig":true}`.
## Smoke test

`scripts/smoke-test.sh` walks every endpoint that can be verified without
vendor credentials and prints a pass/fail summary. Run it after any change:

```bash
sudo bash -c 'set -a; . /etc/bsf-backend.env; set +a; cd /var/www/bsf-backend && bash scripts/smoke-test.sh'
```

It creates a throwaway client, machine and recipients, triggers both a high and
a low temperature breach, checks that deduplication works, confirms that no job
is reported as `sent` while credentials are blank, and then deletes its own
records. Pass `--keep` to inspect the data afterwards.
