import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHttpClient } from '../src/api/http.js';

let received = null;
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  received = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
  };

  res.writeHead(req.url === '/login' ? 200 : 401, { 'Content-Type': 'application/json' });
  if (req.url === '/login') {
    res.end(JSON.stringify({ ok: true, data: { user: { userName: 'admin', role: 'master_admin' } } }));
  } else {
    res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } }));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const client = createHttpClient({ baseUrl: `http://127.0.0.1:${port}` });

test.after(() => new Promise((resolve) => server.close(resolve)));

test('frontend login posts JSON, includes cookies and sends CSRF on writes', async () => {
  globalThis.document = { cookie: 'bsf_csrf=csrf-value' };
  const data = await client.post('/login', { userName: 'admin', password: '123456' });
  assert.equal(data.user.role, 'master_admin');
  assert.equal(received.method, 'POST');
  assert.equal(received.body.userName, 'admin');
  assert.equal(received.headers['x-csrf-token'], 'csrf-value');
});

test('backend error envelope is returned as a readable API error', async () => {
  await assert.rejects(
    () => client.get('/error'),
    (err) => err.message === 'Invalid username or password' && err.code === 'INVALID_CREDENTIALS'
  );
  assert.equal(received.headers['x-csrf-token'], undefined);
});
