/*
 * Focused two-tenant concurrent-SSE check for AME-015.
 *
 * Mirrors the B3-S gate case-5 shape (two staff SSE streams opened
 * concurrently, one A add-on + one A cancellation) and adds an additive
 * coverage probe on `table_status_changed`, which instrumentation does not
 * subscribe but the SSE route does.
 *
 * Inputs (all optional, no secrets in this file):
 *   GATE_REPO      repository root (for node_modules/pg; default repo root)
 *   GATE_BASE      server base URL (default http://127.0.0.1:3015)
 *   GATE_DB_URL    disposable database URL (default local loopback)
 *   GATE_FIXTURES  path to fixtures.json (default tmpdir; keep tokens out of repo)
 *   GATE_OUT       results path (default tmpdir)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const REPO =
  process.env.GATE_REPO || path.resolve(__dirname, '../../../../..');
const BASE = process.env.GATE_BASE || 'http://127.0.0.1:3015';
const DB_URL =
  process.env.GATE_DB_URL ||
  'postgresql://postgres@127.0.0.1:55433/qreat_gate015';
const FIXTURES =
  process.env.GATE_FIXTURES ||
  path.join(os.tmpdir(), 'ame015-fixtures.json');
const OUT =
  process.env.GATE_OUT || path.join(os.tmpdir(), 'ame015-focus-results.json');
const { Client } = require(path.join(REPO, 'node_modules/pg'));
const F = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));

const uuid = () => crypto.randomUUID();
const db = new Client({ connectionString: DB_URL });
const results = [];

function check(id, condition, detail) {
  results.push({ id, ok: Boolean(condition), detail });
  console.log(
    (condition ? 'PASS ' : 'FAIL ') + id + ' :: ' + JSON.stringify(detail)
  );
  return Boolean(condition);
}

async function api(method, p, token, body, extraHeaders) {
  const headers = {
    authorization: 'Bearer ' + token,
    'content-type': 'application/json',
  };
  Object.assign(headers, extraHeaders || {});
  const res = await fetch(BASE + p, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

/** Collect parsed SSE frames for `ms`, returning the frames per type. */
async function sseEvents(token, ms) {
  const controller = new AbortController();
  const res = await fetch(BASE + '/api/events/orders', {
    headers: { authorization: 'Bearer ' + token },
    signal: controller.signal,
  });
  if (res.status !== 200) {
    throw new Error('SSE connection failed with status ' + res.status);
  }
  const events = [];
  const decoder = new TextDecoder();
  let buf = '';
  const reader = res.body.getReader();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line) {
          try {
            events.push(JSON.parse(line.slice(6)));
          } catch {
            /* keep-alive or partial frame */
          }
        }
      }
    }
  } catch {
    /* aborted at the deadline */
  }
  clearTimeout(timer);
  return events;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createOrder(token, menuItemId) {
  const r = await api(
    'POST',
    '/api/counter/orders',
    token,
    {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId, quantity: 1, clientItemId: 'ame015-0' }],
      sendToKitchen: true,
    },
    { 'idempotency-key': uuid() }
  );
  if (r.status >= 300) {
    throw new Error('createOrder failed ' + r.status + ' ' + JSON.stringify(r.body));
  }
  return r.body.order;
}

async function getOrder(token, id) {
  const r = await api('GET', '/api/orders/' + id, token);
  return r.body && r.body.order;
}

async function notify(channel, payload) {
  await db.query('select pg_notify($1, $2)', [channel, JSON.stringify(payload)]);
}

const signalPayload = (restaurantId, orderId) => ({
  orderId,
  restaurantId,
  orderNumber: 'AME015-1',
  orderVersion: 2,
  ticketCount: 1,
  timestamp: Date.now(),
});

(async () => {
  await db.connect();

  const A = F.A;
  const B = F.B;
  const started = Date.now();

  // Two concurrent first connections on a cold route path: this is the B3-S
  // shape that produced two LISTEN clients and duplicate frames before the fix.
  const streamA = sseEvents(A.cashier.token, 9000);
  const streamB = sseEvents(B.cashier.token, 9000);
  await sleep(1500);

  // Real producers: create, add-on, whole-order cancellation (tenant A only).
  const order = await createOrder(A.cashier.token, A.menu.burgerId);
  const v = (await getOrder(A.cashier.token, order.id)).version;
  const add = await api(
    'POST',
    '/api/orders/' + order.id + '/items',
    A.cashier.token,
    {
      expectedVersion: v,
      idempotencyKey: uuid(),
      reason: 'customer_request',
      customerNotified: true,
      items: [{ menuItemId: A.menu.friesId, quantity: 1 }],
    }
  );
  const cancel = await api('DELETE', '/api/orders/' + order.id, A.manager.token, {
    reason: 'customer_request',
    customerNotified: true,
    version: v + 1,
    idempotencyKey: uuid(),
  });

  // Additive-coverage probe on a channel instrumentation never subscribes.
  const tableA = { tableId: uuid(), restaurantId: A.restaurantId, previousStatus: 'AVAILABLE', newStatus: 'OCCUPIED', updatedBy: 'system', timestamp: Date.now() };
  const tableB = { tableId: uuid(), restaurantId: B.restaurantId, previousStatus: 'AVAILABLE', newStatus: 'OCCUPIED', updatedBy: 'system', timestamp: Date.now() };
  await notify('table_status_changed', tableA);
  await sleep(150);
  await notify('table_status_changed', tableB);

  const [evA, evB] = await Promise.all([streamA, streamB]);

  const isSignal = (e) =>
    e.type === 'order_items_added' || e.type === 'order_cancelled';
  const signalA = evA.filter(isSignal);
  const addSignals = signalA.filter((e) => e.type === 'order_items_added').length;
  const cancelSignals = signalA.filter((e) => e.type === 'order_cancelled').length;
  const duplicateFrames = signalA.length - 2;

  const leaked = evB.filter(
    (e) =>
      (e.data && e.data.restaurantId === A.restaurantId) ||
      (e.data && e.data.orderId === order.id) ||
      isSignal(e)
  );

  const tableOnA = evA.filter(
    (e) => e.type === 'table_status_changed' && e.data && e.data.tableId === tableA.tableId
  );
  const tableBLeakOnA = evA.filter(
    (e) => e.type === 'table_status_changed' && e.data && e.data.tableId === tableB.tableId
  );
  const tableOnB = evB.filter(
    (e) => e.type === 'table_status_changed' && e.data && e.data.tableId === tableB.tableId
  );

  check(
    '5.sse.delivered',
    add.status === 200 && cancel.status === 200 && addSignals >= 1 && cancelSignals >= 1,
    { add: add.status, cancel: cancel.status, addSignals, cancelSignals, duplicateFrames, typesA: evA.map((e) => e.type) }
  );
  check('5.sse.delivered.exactly-once', addSignals === 1 && cancelSignals === 1 && duplicateFrames === 0, {
    addSignals,
    cancelSignals,
    duplicateFrames,
  });
  check('5.sse.tenant-isolated', leaked.length === 0, {
    leaked: leaked.map((e) => e.type),
    typesB: evB.map((e) => e.type),
  });
  check('5.sse.additive-coverage', tableOnA.length === 1, {
    frames: tableOnA.length,
    type: tableOnA[0] && tableOnA[0].type,
    note: 'table_status_changed is not in the instrumentation channel list',
  });
  check('5.sse.tenant-isolated.table-status', tableBLeakOnA.length === 0 && tableOnB.length === 1, {
    tableBOnA: tableBLeakOnA.length,
    tableBOnB: tableOnB.length,
  });

  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    durationMs: Date.now() - started,
    total: results.length,
    failed: results.filter((r) => !r.ok).length,
    duplicateFrames,
    tenantIsolated: leaked.length === 0,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log('SUMMARY ' + JSON.stringify({ total: summary.total, failed: summary.failed, duplicateFrames }));
  await db.end();
  process.exit(summary.failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('FOCUS_FAILED', e && e.stack ? e.stack : e);
  try {
    await db.end();
  } catch {}
  process.exit(2);
});
