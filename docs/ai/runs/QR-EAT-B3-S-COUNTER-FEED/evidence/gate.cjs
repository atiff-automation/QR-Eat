/* B3-S deployment gate harness (disposable Postgres + local Next server). */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const REPO = '/home/atiff/.local/share/opencode/worktree/770812/neon-pixel';
const { Client } = require(path.join(REPO, 'node_modules/pg'));
const BASE = 'http://127.0.0.1:3010';
const DB_URL = 'postgresql://gate@127.0.0.1:55432/qreat_gate';
const F = JSON.parse(fs.readFileSync('/tmp/opencode/b3s-gate/fixtures.json', 'utf8'));
const uuid = () => crypto.randomUUID();

const results = [];
const db = new Client({ connectionString: DB_URL });

function record(id, ok, detail) {
  results.push({ id, ok, at: new Date().toISOString(), detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + id + (detail ? ' :: ' + JSON.stringify(detail) : ''));
}
function check(id, condition, detail) { record(id, Boolean(condition), detail); return Boolean(condition); }

async function q(text, params) { const r = await db.query(text, params); return r.rows; }

async function api(method, p, token, body, extraHeaders) {
  const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
  Object.assign(headers, extraHeaders || {});
  const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function getOrder(token, id) {
  const r = await api('GET', '/api/orders/' + id, token);
  return { status: r.status, order: r.body && r.body.order, body: r.body };
}

async function createOrder(token, menuItemIds, sendToKitchen) {
  const body = { orderType: 'TAKEAWAY', items: menuItemIds.map((id, i) => ({ menuItemId: id, quantity: 1, clientItemId: 'gate-' + i })) };
  if (sendToKitchen !== undefined) body.sendToKitchen = sendToKitchen;
  const r = await api('POST', '/api/counter/orders', token, body, { 'idempotency-key': uuid() });
  if (r.status >= 300) throw new Error('createOrder failed ' + r.status + ' ' + JSON.stringify(r.body));
  return r.body.order;
}

function addItemsBody(version, menuItemId, key) {
  return { expectedVersion: version, idempotencyKey: key || uuid(), reason: 'customer_request', customerNotified: true, items: [{ menuItemId, quantity: 1 }] };
}
function cancelBody(version, key) {
  return { reason: 'customer_request', customerNotified: true, version, idempotencyKey: key || uuid() };
}

async function sseEvents(token, ms) {
  const controller = new AbortController();
  const res = await fetch(BASE + '/api/events/orders', { headers: { authorization: 'Bearer ' + token }, signal: controller.signal });
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
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line) { try { events.push(JSON.parse(line.slice(6))); } catch {} }
      }
    }
  } catch (e) { /* aborted */ }
  clearTimeout(timer);
  return events;
}

module.exports = { results, db, q, api, getOrder, createOrder, addItemsBody, cancelBody, sseEvents, check, record, F, uuid, BASE };

async function case1_tenants() {
  const staffA = await q('select id,email,"restaurantId" from staff where "restaurantId"=$1 order by email', [F.A.restaurantId]);
  const staffB = await q('select id,email,"restaurantId" from staff where "restaurantId"=$1 order by email', [F.B.restaurantId]);
  const rolesA = await q('select "roleTemplate" from user_roles where "restaurantId"=$1 order by 1', [F.A.restaurantId]);
  const overlap = staffA.filter((a) => staffB.some((b) => b.email === a.email));
  check('1.tenants.staff', staffA.length === 2 && staffB.length === 2 && overlap.length === 0, { staffA: staffA.length, staffB: staffB.length, overlap: overlap.length });
  check('1.tenants.roles', rolesA.map((r) => r.roleTemplate).join(',') === 'cashier,manager', rolesA);
  const listA = await api('GET', '/api/orders?limit=5', F.A.cashier.token);
  const listB = await api('GET', '/api/orders?limit=5', F.B.cashier.token);
  const aRows1 = listA.body.orders || [];
  const bRows1 = listB.body.orders || [];
  const crossA1 = aRows1.filter((o) => o.restaurantId !== F.A.restaurantId).length;
  const crossB1 = bRows1.filter((o) => o.restaurantId !== F.B.restaurantId).length;
  check('1.tenants.list', listA.status === 200 && listB.status === 200 && crossA1 === 0 && crossB1 === 0, { a: listA.status, b: listB.status, crossA1, crossB1 });
}

async function case2_addItems() {
  const A = F.A, B = F.B;
  // 2a PENDING: no add-on event; later order.created carries both lines once.
  const pending = await createOrder(A.cashier.token, [A.menu.burgerId], false);
  const v0 = (await getOrder(A.cashier.token, pending.id)).order.version;
  const add1 = await api('POST', '/api/orders/' + pending.id + '/items', A.cashier.token, addItemsBody(v0, A.menu.friesId));
  const v1 = (await getOrder(A.cashier.token, pending.id)).order.version;
  const pendingEvents = await q("select count(*)::int c from order_events where \"orderId\"=$1 and type='order.items.added'", [pending.id]);
  check('2a.pending.add.ok', add1.status === 200 && add1.body.success === true && add1.body.order.version === v0 + 1, { status: add1.status, version: add1.body.order && add1.body.order.version, routed: add1.body.ticket && add1.body.ticket.routed });
  check('2a.pending.no-event', pendingEvents[0].c === 0 && v1 === v0 + 1, { addOnEvents: pendingEvents[0].c, v0, v1 });

  const send = await api('POST', '/api/counter/orders/' + pending.id + '/send', A.cashier.token, {});
  const created = await q("select id, payload from order_events where \"orderId\"=$1 and type='order.created'", [pending.id]);
  const allItems = await q('select "menuItemId" from order_items where "orderId"=$1', [pending.id]);
  const names = created.flatMap((e) => (e.payload.items || []).map((i) => i.name));
  const burgerCount = names.filter((n) => n === 'Gate Burger').length;
  const friesCount = names.filter((n) => n === 'Gate Fries').length;
  check('2a.created-once', send.status === 200 && created.length === 1 && allItems.length === 2 && burgerCount === 1 && friesCount === 1, { send: send.status, tickets: created.length, items: allItems.length, names });
  global.PENDING_ORDER = pending.id;

  // 2b Live order: add-on ticket per routed station, only added lines.
  const live = await createOrder(A.cashier.token, [A.menu.burgerId], true);
  const lv = (await getOrder(A.cashier.token, live.id)).order.version;
  const key2 = uuid();
  const body2 = { expectedVersion: lv, idempotencyKey: key2, reason: 'customer_request', customerNotified: true, items: [{ menuItemId: A.menu.colaId, quantity: 1 }, { menuItemId: A.menu.friesId, quantity: 1 }] };
  const add2 = await api('POST', '/api/orders/' + live.id + '/items', A.cashier.token, body2);
  const addEvents = await q("select id, \"stationId\", payload, \"printStatus\" from order_events where \"orderId\"=$1 and type='order.items.added' order by id", [live.id]);
  const evNames = addEvents.map((e) => (e.payload.items || []).map((i) => i.name + 'x' + i.qty));
  const stations = new Set(addEvents.map((e) => e.stationId));
  const onlyAdded = addEvents.every((e) => (e.payload.items || []).every((i) => i.name === 'Gate Fries' || i.name === 'Gate Cola'));
  check('2b.live.add.ok', add2.status === 200 && add2.body.order.version === lv + 1 && add2.body.ticket.stationIds.length === 2, { status: add2.status, version: add2.body.order && add2.body.order.version, expected: lv + 1, ticket: add2.body.ticket });
  check('2b.live.one-per-station', addEvents.length === 2 && stations.size === 2 && onlyAdded, { events: addEvents.length, stations: stations.size, onlyAdded, evNames });
  check('2b.live.event-version', addEvents.every((e) => e.payload.orderVersion === lv + 1), { versions: addEvents.map((e) => e.payload.orderVersion) });
  check('2b.live.event-print', addEvents.every((e) => e.payload.printMode === 'COUNTER' && e.printStatus === 'PENDING'), addEvents.map((e) => ({ printMode: e.payload.printMode, printStatus: e.printStatus })));

  const stored = await q('select "subtotalAmount","taxAmount","serviceCharge","totalAmount",version from orders where id=$1', [live.id]);
  const row = stored[0];
  const expectTotals = { subtotal: 33, tax: 1.98, service: 0, total: 34.98 };
  const rt = add2.body.order;
  check('2b.live.totals', Number(row.subtotalAmount) === expectTotals.subtotal && Number(row.taxAmount) === expectTotals.tax && Number(row.serviceCharge) === expectTotals.service && Number(row.totalAmount) === expectTotals.total && rt.subtotalAmount === '33.00' && rt.serviceCharge === '0.00' && rt.totalAmount === '34.98', { db: row, api: { subtotal: rt.subtotalAmount, tax: rt.taxAmount, service: rt.serviceCharge, total: rt.totalAmount } });

  // 2c stale version -> 409
  const stale = await api('POST', '/api/orders/' + live.id + '/items', A.cashier.token, addItemsBody(lv, A.menu.friesId));
  check('2c.version-conflict', stale.status === 409 && stale.body.code === 'ORDER_VERSION_CONFLICT', { status: stale.status, code: stale.body.code });

  // 2d exact replay -> 200 duplicate, no second write
  const beforeReplay = await q('select (select count(*)::int from order_items where "orderId"=$1) items, (select count(*)::int from order_events where "orderId"=$1 and type=\'order.items.added\') events, (select count(*)::int from order_mutation_idempotency where "orderId"=$1) receipts', [live.id]);
  const replay = await api('POST', '/api/orders/' + live.id + '/items', A.cashier.token, body2);
  const afterReplay = await q('select (select count(*)::int from order_items where "orderId"=$1) items, (select count(*)::int from order_events where "orderId"=$1 and type=\'order.items.added\') events, (select count(*)::int from order_mutation_idempotency where "orderId"=$1) receipts, (select version from orders where id=$1) version', [live.id]);
  check('2d.idempotent-replay', replay.status === 200 && replay.body.isDuplicate === true && replay.body.ticket.replayed === true && JSON.stringify(beforeReplay[0]) === JSON.stringify({ items: afterReplay[0].items, events: afterReplay[0].events, receipts: afterReplay[0].receipts }), { status: replay.status, isDuplicate: replay.body.isDuplicate, before: beforeReplay[0], after: afterReplay[0] });

  // 2e same key, different body -> 409
  const reused = await api('POST', '/api/orders/' + live.id + '/items', A.cashier.token, { ...body2, items: [{ menuItemId: A.menu.burgerId, quantity: 1 }] });
  check('2e.key-reuse-409', reused.status === 409 && reused.body.code === 'IDEMPOTENCY_KEY_REUSED', { status: reused.status, code: reused.body.code });

  // 2f cross-tenant order -> 404, no write
  const liveB = await createOrder(B.cashier.token, [B.menu.burgerId], true);
  const vb = (await getOrder(B.cashier.token, liveB.id)).order.version;
  const cross = await api('POST', '/api/orders/' + liveB.id + '/items', A.cashier.token, addItemsBody(vb, B.menu.friesId));
  const bAfter = await q('select version from orders where id=$1', [liveB.id]);
  check('2f.cross-tenant-404', cross.status === 404 && cross.body.code === 'ORDER_NOT_FOUND' && bAfter[0].version === vb, { status: cross.status, code: cross.body.code, version: bAfter[0].version, expected: vb });

  // 2g list isolation with rows present: every row must belong to the caller's tenant.
  const la = await api('GET', '/api/orders?limit=50', A.cashier.token);
  const lb = await api('GET', '/api/orders?limit=50', B.cashier.token);
  const aRows = la.body.orders || [];
  const bRows = lb.body.orders || [];
  const crossA = aRows.filter((o) => o.restaurantId !== A.restaurantId).length;
  const crossB = bRows.filter((o) => o.restaurantId !== B.restaurantId).length;
  check('2g.list-isolation', la.status === 200 && lb.status === 200 && aRows.length > 0 && bRows.length > 0 && crossA === 0 && crossB === 0, { aRows: aRows.length, bRows: bRows.length, crossA, crossB });

  // 2h the same key string in another tenant must not replay tenant A's receipt.
  const crossKey = await api('POST', '/api/orders/' + liveB.id + '/items', B.cashier.token, { expectedVersion: vb, idempotencyKey: key2, reason: 'customer_request', customerNotified: true, items: [{ menuItemId: B.menu.colaId, quantity: 1 }] });
  const bReceipt = await q('select count(*)::int c from order_mutation_idempotency where "restaurantId"=$1 and "orderId"=$2 and "idempotencyKey"=$3', [B.restaurantId, liveB.id, key2]);
  const aAddEvents = await q("select count(*)::int c from order_events where \"orderId\"=$1 and type='order.items.added'", [live.id]);
  check('2h.cross-tenant-key-no-replay', crossKey.status === 200 && crossKey.body.isDuplicate === false && bReceipt[0].c === 1 && aAddEvents[0].c === 2, { status: crossKey.status, isDuplicate: crossKey.body.isDuplicate, bReceipt: bReceipt[0].c, aAddEvents: aAddEvents[0].c });

  global.LIVE_A = live.id; global.LIVE_B = liveB.id; global.LIVE_B_VERSION = vb;
}

async function setStatus(token, orderId, status) {
  return api('PATCH', '/api/orders/' + orderId + '/status', token, { status });
}

async function chitCount(orderId) {
  const r = await q("select count(*)::int c from order_events where \"orderId\"=$1 and type='order.cancelled'", [orderId]);
  return r[0].c;
}

async function case3_cancel() {
  const A = F.A;
  const M = A.manager.token;
  const live = global.LIVE_A;
  const o = (await getOrder(M, live)).order;
  const patchDenied = await setStatus(M, live, 'CANCELLED');
  check('3.patch-cancelled-409', patchDenied.status === 409 && patchDenied.body.code === 'USE_CANCEL_ENDPOINT', { status: patchDenied.status, code: patchDenied.body.code });

  const key = uuid();
  const body = { reason: 'customer_request', reasonNotes: 'gate cancel', customerNotified: true, version: o.version, idempotencyKey: key };
  const cancel = await api('DELETE', '/api/orders/' + live, M, body);
  const after = await getOrder(M, live);
  const chits = await q("select id, \"stationId\", payload, \"printStatus\" from order_events where \"orderId\"=$1 and type='order.cancelled' order by id", [live]);
  const versions = chits.map((c) => c.payload.version);
  const totalsOk = chits.every((c) => c.payload.cancelledTotals && c.payload.cancelledTotals.totalAmount === '34.98' && c.payload.reason === 'customer_request');
  check('3.delete-cancel', cancel.status === 200 && after.order.status === 'CANCELLED' && after.order.version === o.version + 1, { status: cancel.status, orderStatus: after.order.status, version: after.order.version, expected: o.version + 1 });
  check('3.one-chit-per-station', chits.length === 2 && new Set(chits.map((c) => c.stationId)).size === 2, { chits: chits.length });
  check('3.chit-payload', versions.every((v) => v === o.version + 1) && totalsOk && chits.every((c) => c.printStatus === 'SKIPPED'), { versions, totalsOk, print: chits.map((c) => c.printStatus) });

  const beforeReplay = await q('select (select count(*)::int from order_events where "orderId"=$1 and type=\'order.cancelled\') chits, (select count(*)::int from audit_logs where "recordId"=$1) audits, (select count(*)::int from restaurant_changes where "entityId"=$1) changes', [live]);
  const replay = await api('DELETE', '/api/orders/' + live, M, body);
  const afterReplay = await q('select (select count(*)::int from order_events where "orderId"=$1 and type=\'order.cancelled\') chits, (select count(*)::int from audit_logs where "recordId"=$1) audits, (select count(*)::int from restaurant_changes where "entityId"=$1) changes, (select version from orders where id=$1) v', [live]);
  check('3.replay-writes-nothing', replay.status === 200 && replay.body.isDuplicate === true && JSON.stringify(beforeReplay[0]) === JSON.stringify({ chits: afterReplay[0].chits, audits: afterReplay[0].audits, changes: afterReplay[0].changes }) && afterReplay[0].v === o.version + 1, { status: replay.status, duplicate: replay.body.isDuplicate, before: beforeReplay[0], after: afterReplay[0] });

  // PENDING/no-ticket order -> no chit
  const freshPending = await createOrder(A.cashier.token, [A.menu.burgerId], false);
  const pv = (await getOrder(M, freshPending.id)).order.version;
  const pendingCancel = await api('DELETE', '/api/orders/' + freshPending.id, M, cancelBody(pv));
  check('3.pending-no-chit', pendingCancel.status === 200 && (await chitCount(freshPending.id)) === 0, { status: pendingCancel.status, chits: await chitCount(freshPending.id) });

  // Durability rows for the successful cancellation
  const rows = await q("select (select count(*)::int from audit_logs where \"recordId\"=$1 and description like 'order.cancelled%') audits, (select count(*)::int from restaurant_changes where \"entityId\"=$1) changes, (select count(*)::int from order_mutation_idempotency where \"orderId\"=$1 and operation='CANCEL') receipts", [live]);
  check('3.durable-rows', rows[0].audits >= 1 && rows[0].changes >= 1 && rows[0].receipts === 1, rows[0]);

  // VOID: served order, unpaid -> CANCELLED, no chit
  await q('insert into tables (id,"restaurantId","tableNumber","qrCodeToken","updatedAt") values ($1,$2,$3,$4,now()) on conflict do nothing', [uuid(), A.restaurantId, 'Gate1', 'gate-qr-' + A.restaurantId]);
  const tableId = (await q('select id from tables where "restaurantId"=$1 and "tableNumber"=$2', [A.restaurantId, 'Gate1']))[0].id;
  const mkDineIn = () => api('POST', '/api/counter/orders', A.cashier.token, { orderType: 'DINE_IN', tableId, items: [{ menuItemId: A.menu.burgerId, quantity: 1 }] }, { 'idempotency-key': uuid() }).then((r) => r.body.order);
  const voidOrder = await mkDineIn();
  for (const s of ['PREPARING', 'READY', 'SERVED']) {
    const r = await setStatus(M, voidOrder.id, s);
    if (r.status !== 200) { check('3.void.setup', false, { step: s, status: r.status, body: r.body }); break; }
  }
  const vv = (await getOrder(M, voidOrder.id)).order.version;
  const voided = await api('POST', '/api/orders/' + voidOrder.id + '/void', M, cancelBody(vv));
  const voidAfter = await getOrder(M, voidOrder.id);
  check('3.void-no-chit', voided.status === 200 && voidAfter.order.status === 'CANCELLED' && (await chitCount(voidOrder.id)) === 0, { status: voided.status, orderStatus: voidAfter.order.status, chits: await chitCount(voidOrder.id) });

  // REFUND: served, paid -> REFUNDED, no cancellation chit
  const refundOrder = await mkDineIn();
  for (const s of ['PREPARING', 'READY', 'SERVED']) { await setStatus(M, refundOrder.id, s); }
  const rv = (await getOrder(M, refundOrder.id)).order.version;
  const total = (await q('select "totalAmount" t from orders where id=$1', [refundOrder.id]))[0].t;
  await q('insert into payments (id,"orderId","paymentMethod",amount,"processingFee","netAmount",status,"receiptNumber","dailySeq","processedBy","processedByType","processedByStaffId","processedAt","completedAt","updatedAt") values ($1,$2,$3,$4,0,$4,\'PAID\',$5,1,$6,\'staff\',$6,now(),now(),now())', [uuid(), refundOrder.id, 'CASH', total, 'GATE-RCP-' + uuid(), A.staffId ? A.staffId : A.cashier.staffId]);
  await q('update orders set "paymentStatus"=\'PAID\', version=version+1 where id=$1', [refundOrder.id]);
  const rv2 = (await getOrder(M, refundOrder.id)).order.version;
  const refunded = await api('POST', '/api/orders/' + refundOrder.id + '/refund', M, cancelBody(rv2));
  const refundAfter = await getOrder(M, refundOrder.id);
  check('3.refund-no-chit', refunded.status === 200 && refundAfter.order.paymentStatus === 'REFUNDED' && (await chitCount(refundOrder.id)) === 0, { status: refunded.status, paymentStatus: refundAfter.order.paymentStatus, chits: await chitCount(refundOrder.id) });

  // Cross-tenant ticket fetch/ack
  const crossFetch = await api('GET', '/api/counter/orders/' + global.LIVE_B + '/print-tickets', A.cashier.token);
  const bEvents = await q("select id from order_events where \"orderId\"=$1 and type in ('order.created','order.items.added','order.cancelled') order by id limit 1", [global.LIVE_B]);
  const crossAck = await api('POST', '/api/counter/orders/' + global.LIVE_B + '/print-ack', A.cashier.token, { eventId: bEvents[0].id, success: true });
  check('3.cross-tenant-ticket', crossFetch.status === 404 && crossAck.status === 404, { fetch: crossFetch.status, ack: crossAck.status });
  global.VOID_ORDER = voidOrder.id;
}

async function installFailTrigger(orderId) {
  await q(`create or replace function gate_fail_change() returns trigger as $$
           begin
             if new."entityId" = '${orderId}' then
               raise exception 'gate: simulated change-row failure';
             end if;
             return new;
           end $$ language plpgsql;`);
  await q('drop trigger if exists gate_fail_change_trg on restaurant_changes');
  await q('create trigger gate_fail_change_trg before insert on restaurant_changes for each row execute function gate_fail_change()');
}
async function dropFailTrigger() {
  await q('drop trigger if exists gate_fail_change_trg on restaurant_changes');
  await q('drop function if exists gate_fail_change()');
}

async function case4_durability() {
  const A = F.A;
  const live = await createOrder(A.cashier.token, [A.menu.burgerId], true);
  const v = (await getOrder(A.cashier.token, live.id)).order.version;
  await installFailTrigger(live.id);
  const add = await api('POST', '/api/orders/' + live.id + '/items', A.cashier.token, addItemsBody(v, A.menu.friesId));
  const afterAdd = await q('select version, (select count(*)::int from order_items where "orderId"=$1) items, (select count(*)::int from order_events where "orderId"=$1 and type=\'order.items.added\') events, (select count(*)::int from order_mutation_idempotency where "orderId"=$1) receipts from orders where id=$1', [live.id]);
  check('4.add.failed-write-rolls-back', add.status === 500 && afterAdd[0].version === v && afterAdd[0].items === 1 && afterAdd[0].events === 0 && afterAdd[0].receipts === 0, { status: add.status, after: afterAdd[0] });

  const cancelTarget = await createOrder(A.cashier.token, [A.menu.burgerId], true);
  const cv = (await getOrder(A.manager.token, cancelTarget.id)).order.version;
  await installFailTrigger(cancelTarget.id);
  const cancel = await api('DELETE', '/api/orders/' + cancelTarget.id, A.manager.token, cancelBody(cv));
  const afterCancel = await q('select status, version, (select count(*)::int from order_events where "orderId"=$1 and type=\'order.cancelled\') chits, (select count(*)::int from order_mutation_idempotency where "orderId"=$1 and operation=\'CANCEL\') receipts from orders where id=$1', [cancelTarget.id]);
  check('4.cancel.failed-write-rolls-back', cancel.status === 500 && afterCancel[0].status === 'CONFIRMED' && afterCancel[0].version === cv && afterCancel[0].chits === 0 && afterCancel[0].receipts === 0, { status: cancel.status, after: afterCancel[0] });
  await dropFailTrigger();
  const recovered = await q('select count(*)::int c from restaurant_changes where "entityId"=$1', [live.id]);
  check('4.trigger-cleanup', recovered[0].c === 2, recovered[0]);
}

async function case5_sse() {
  const A = F.A, B = F.B;
  const pre = await api('GET', '/api/counter/changes?since=0', A.cashier.token);
  global.SSE_PRE_CURSOR = pre.body.cursor;
  const pa = sseEvents(A.cashier.token, 7000);
  const pb = sseEvents(B.cashier.token, 7000);
  await new Promise((r) => setTimeout(r, 1200));
  const order = await createOrder(A.cashier.token, [A.menu.burgerId], true);
  const v = (await getOrder(A.cashier.token, order.id)).order.version;
  const add = await api('POST', '/api/orders/' + order.id + '/items', A.cashier.token, addItemsBody(v, A.menu.friesId));
  const cancel = await api('DELETE', '/api/orders/' + order.id, A.manager.token, cancelBody(v + 1));
  const [evA, evB] = await Promise.all([pa, pb]);
  const typesA = evA.map((e) => e.type);
  const typesB = evB.map((e) => e.type);
  const signalA = evA.filter((e) => e.type === 'order_items_added' || e.type === 'order_cancelled');
  const leaked = evB.filter((e) => (e.data && e.data.orderId === order.id) || e.type === 'order_items_added' || e.type === 'order_cancelled');
  const addSignals = signalA.filter((e) => e.type === 'order_items_added').length;
  const cancelSignals = signalA.filter((e) => e.type === 'order_cancelled').length;
  check('5.sse.delivered', add.status === 200 && cancel.status === 200 && addSignals >= 1 && cancelSignals >= 1, { add: add.status, cancel: cancel.status, addSignals, cancelSignals, duplicateFrames: signalA.length - 2, typesA, typesB });
  check('5.sse.tenant-isolated', leaked.length === 0, { leaked: leaked.map((e) => e.type) });
  const forbidden = ['items', 'itemNames', 'reason', 'reasonNotes', 'customerName', 'customerPhone', 'notes', 'name'];
  const leaky = signalA.filter((e) => Object.keys(e.data || {}).some((k) => forbidden.includes(k)));
  check('5.sse.no-pii', signalA.length >= 2 && leaky.length === 0, { keys: [...new Set(signalA.map((e) => Object.keys(e.data || {}).join(',')))], leaky: leaky.length });
  const sigKeys = signalA.map((e) => e.data && e.data.orderVersion);
  check('5.sse.version', sigKeys.every((x) => typeof x === 'number' && x > 0), sigKeys);

  const changes = await api('GET', '/api/counter/changes?since=0', A.cashier.token);
  const cursor = changes.body.cursor;
  const sinceCursor = await api('GET', '/api/counter/changes?since=' + cursor, A.cashier.token);
  const all = await q('select max(id)::text m from restaurant_changes where "restaurantId"=$1', [A.restaurantId]);
  check('5.sse.reconnect-cursor', changes.status === 200 && sinceCursor.status === 200 && Number(sinceCursor.body.cursor) >= Number(cursor) && Number(all[0].m) >= Number(cursor), { cursor, next: sinceCursor.body.cursor, dbMax: all[0].m });
  const chitStations = await q("select count(distinct \"stationId\")::int c from order_events where \"orderId\"=$1 and type in ('order.created','order.items.added')", [order.id]);
  const addStations = await q("select count(distinct \"stationId\")::int c from order_events where \"orderId\"=$1 and type='order.items.added'", [order.id]);
  global.SSE_ORDER = order.id;
  global.SSE_CURSOR = cursor;
  global.SSE_CHITS = chitStations[0].c;
  global.SSE_ADDONS = addStations[0].c;
}

async function case6_ticketsChanges() {
  const A = F.A, B = F.B;
  const orderId = global.SSE_ORDER;
  const t = await api('GET', '/api/counter/orders/' + orderId + '/print-tickets', A.cashier.token);
  const tickets = t.body.tickets || [];
  const chits = tickets.filter((x) => x.type === 'order.cancelled');
  const addOns = tickets.filter((x) => x.type === 'order.items.added');
  check('6.tickets.projection', t.status === 200 && chits.length === global.SSE_CHITS && addOns.length === global.SSE_ADDONS, { tickets: tickets.length, chits: chits.length, addOns: addOns.length });
  check('6.tickets.counterAutoPrint', chits.every((c) => c.printStatus === 'SKIPPED' && c.counterAutoPrint === true && c.canAck === true) && addOns.every((a) => a.printStatus === 'PENDING' && a.counterAutoPrint === true), { chits: chits.map((c) => [c.printStatus, c.counterAutoPrint, c.canAck]), addOns: addOns.map((a) => [a.printStatus, a.counterAutoPrint]) });

  const chit = chits[0];
  const ack1 = await api('POST', '/api/counter/orders/' + orderId + '/print-ack', A.cashier.token, { eventId: chit.eventId, success: true });
  const ack2 = await api('POST', '/api/counter/orders/' + orderId + '/print-ack', A.cashier.token, { eventId: chit.eventId, success: true });
  check('6.ack.skipped-printable-once', ack1.status === 200 && ack1.body.ticket.printStatus === 'PRINTED' && ack1.body.ticket.printedBy === 'COUNTER' && ack2.status === 200 && ack2.body.replayed === true, { first: ack1.body.ticket && ack1.body.ticket.printStatus, replayed: ack2.body.replayed });
  const afterAck = await api('GET', '/api/counter/orders/' + orderId + '/print-tickets', A.cashier.token);
  const acked = (afterAck.body.tickets || []).find((x) => x.eventId === chit.eventId);
  check('6.ack.printed-terminal-projection', acked && acked.printStatus === 'PRINTED' && acked.counterAutoPrint === false && acked.printedBy === 'COUNTER', { printStatus: acked && acked.printStatus, auto: acked && acked.counterAutoPrint });
  const downgrade = await api('POST', '/api/counter/orders/' + orderId + '/print-ack', A.cashier.token, { eventId: chit.eventId, success: false, error: 'gate reprint failure' });
  const still = await getOrder(A.cashier.token, orderId);
  const dbChit = await q('select "printStatus", "printError" from order_events where id=$1', [chit.eventId]);
  check('6.printed-terminal', downgrade.status === 200 && dbChit[0].printStatus === 'PRINTED' && still.order.status === 'CANCELLED', { ackStatus: downgrade.status, downgrade: downgrade.body.downgraded, db: dbChit[0] });

  // STATION mode is never Counter authority
  await q("update stations set settings = jsonb_set(settings::jsonb, '{printMode}', '\"STATION\"') where id=$1", [B.stations.grillId]);
  const bOrder = await api('POST', '/api/counter/orders', B.manager.token, { orderType: 'TAKEAWAY', items: [{ menuItemId: B.menu.burgerId, quantity: 1 }] }, { 'idempotency-key': uuid(), 'x-station-override': 'true' });
  const bt = await api('GET', '/api/counter/orders/' + bOrder.body.order.id + '/print-tickets', B.manager.token);
  const stationTicket = (bt.body.tickets || [])[0];
  check('6.counterAutoPrint.station-mode', bOrder.status < 300 && stationTicket && stationTicket.printMode === 'STATION' && stationTicket.counterAutoPrint === false && stationTicket.canAck === false, { create: bOrder.status, ticket: stationTicket && { printMode: stationTicket.printMode, auto: stationTicket.counterAutoPrint, canAck: stationTicket.canAck } });
  await q("update stations set settings = jsonb_set(settings::jsonb, '{printMode}', '\"COUNTER\"') where id=$1", [B.stations.grillId]);

  // Cursor advance + 410 resync
  const since = await api('GET', '/api/counter/changes?since=' + global.SSE_PRE_CURSOR, A.cashier.token);
  const rows = since.body.changes || [];
  check('6.changes.cursor-advance', since.status === 200 && rows.some((r) => r.entityId === orderId && r.entityType === 'order') && since.body.nextSeq > Number(global.SSE_PRE_CURSOR), { status: since.status, rows: rows.length, nextSeq: since.body.nextSeq });
  const maxId = (await q('select coalesce(max(id),0)::text m from restaurant_changes'))[0].m;
  await q('delete from restaurant_changes where "restaurantId"=$1', [A.restaurantId]);
  await q('insert into restaurant_changes (id,"restaurantId","entityType","entityId",operation) values ($1,$2,\'order\',$3,\'upsert\')', [String(Number(maxId) + 1000), A.restaurantId, orderId]);
  const expired = await api('GET', '/api/counter/changes?since=1', A.cashier.token);
  check('6.changes.410-resync', expired.status === 410 && expired.body.code === 'CURSOR_EXPIRED' && expired.body.snapshot === '/api/counter/pending', { status: expired.status, code: expired.body.code, snapshot: expired.body.snapshot });
}

async function case8_concurrency() {
  const A = F.A;
  const o = await createOrder(A.cashier.token, [A.menu.burgerId], true);
  const v = (await getOrder(A.cashier.token, o.id)).order.version;
  const [r1, r2] = await Promise.all([
    api('POST', '/api/orders/' + o.id + '/items', A.cashier.token, addItemsBody(v, A.menu.friesId)),
    api('POST', '/api/orders/' + o.id + '/items', A.cashier.token, addItemsBody(v, A.menu.colaId)),
  ]);
  const statuses = [r1.status, r2.status].sort();
  const rows = await q('select version, (select count(*)::int from order_items where "orderId"=$1) items, (select count(*)::int from order_events where "orderId"=$1 and type=\'order.items.added\') events, (select count(*)::int from order_mutation_idempotency where "orderId"=$1) receipts from orders where id=$1', [o.id]);
  check('8.add.single-winner', statuses[0] === 200 && statuses[1] === 409 && rows[0].version === v + 1 && rows[0].items === 2 && rows[0].events === 1 && rows[0].receipts === 1, { statuses, after: rows[0] });

  const c = await createOrder(A.cashier.token, [A.menu.burgerId], true);
  const cv = (await getOrder(A.manager.token, c.id)).order.version;
  const key = uuid();
  const body = { reason: 'customer_request', customerNotified: true, version: cv, idempotencyKey: key };
  const [d1, d2] = await Promise.all([
    api('DELETE', '/api/orders/' + c.id, A.manager.token, body),
    api('DELETE', '/api/orders/' + c.id, A.manager.token, body),
  ]);
  const cRows = await q('select version, (select count(*)::int from order_events where "orderId"=$1 and type=\'order.cancelled\') chits, (select count(*)::int from order_mutation_idempotency where "orderId"=$1 and operation=\'CANCEL\') receipts from orders where id=$1', [c.id]);
  check('8.cancel.same-key-once', d1.status === 200 && d2.status === 200 && cRows[0].version === cv + 1 && cRows[0].chits === 1 && cRows[0].receipts === 1, { statuses: [d1.status, d2.status], after: cRows[0] });

  const e = await createOrder(A.cashier.token, [A.menu.burgerId], true);
  const ev = (await getOrder(A.manager.token, e.id)).order.version;
  const [x1, x2] = await Promise.all([
    api('DELETE', '/api/orders/' + e.id, A.manager.token, cancelBody(ev)),
    api('DELETE', '/api/orders/' + e.id, A.manager.token, cancelBody(ev)),
  ]);
  const eRows = await q('select version, (select count(*)::int from order_events where "orderId"=$1 and type=\'order.cancelled\') chits from orders where id=$1', [e.id]);
  const st = [x1.status, x2.status].sort();
  check('8.cancel.different-keys-one-winner', st[0] === 200 && st[1] === 409 && eRows[0].version === ev + 1 && eRows[0].chits === 1, { statuses: [x1.status, x2.status], after: eRows[0] });
}

(async () => {
  await db.connect();
  const cases = [case1_tenants, case2_addItems, case3_cancel, case4_durability, case5_sse, case6_ticketsChanges, case8_concurrency];
  for (const c of cases) {
    try { await c(); } catch (e) { record(c.name + '.UNCAUGHT', false, { error: String(e && e.stack || e) }); }
  }
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync('/tmp/opencode/b3s-gate/evidence.json', JSON.stringify({ results, failed: failed.length, at: new Date().toISOString() }, null, 2));
  console.log('SUMMARY ' + JSON.stringify({ total: results.length, failed: failed.length }));
  await db.end();
})().catch(async (e) => { console.error('HARNESS_FAILED', e); try { await db.end(); } catch {} process.exit(1); });
