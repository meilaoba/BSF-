import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

// numeric/decimal columns come back as strings by default; the dashboard wants
// numbers for metrics such as temperature.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'bsf-backend',
});

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Runs `fn` inside a transaction, rolling back on any thrown error.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db] rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck() {
  const started = Date.now();
  const { rows } = await pool.query('SELECT 1 AS ok, current_database() AS db, version() AS version');
  return {
    ok: rows[0].ok === 1,
    database: rows[0].db,
    serverVersion: String(rows[0].version).split(' ').slice(0, 2).join(' '),
    latencyMs: Date.now() - started,
  };
}

export async function closePool() {
  await pool.end();
}

/**
 * Writes an audit trail row. Failures here must never break the request path.
 */
export async function audit(entry) {
  try {
    await query(
      `INSERT INTO audit_logs
         (actor_type, actor_id, actor_label, action, entity_type, entity_id,
          before, after, metadata, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.actorType ?? 'system',
        entry.actorId ?? null,
        entry.actorLabel ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId != null ? String(entry.entityId) : null,
        entry.before ? JSON.stringify(entry.before) : null,
        entry.after ? JSON.stringify(entry.after) : null,
        JSON.stringify(entry.metadata ?? {}),
        entry.ip ?? null,
        entry.userAgent ?? null,
      ]
    );
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
}