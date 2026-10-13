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

All write endpoints accept `x-api-key: <INTERNAL_API_KEY>` when that variable is
set. Read endpoints are open to the reverse proxy.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/v1/health` | service + database + queue + provider status |
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

### Data scoping rules

- **Master Admin** — no filter, sees every client and machine.
- **Client Admin** — `clientId` is fixed to their own client; the client filter
  is removed from the UI.
- **User** — `machineId` is fixed to their single machine.

The API accepts `clientId` / `machineId` filters so the frontend can render
these views. The session layer being added later MUST overwrite those values
from the authenticated principal; the browser must never be trusted for them.

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