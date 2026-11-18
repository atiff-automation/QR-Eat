/* Case 7b: cashier role-template fallback for orders:counter_serve. */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const REPO = '/home/atiff/.local/share/opencode/worktree/770812/neon-pixel';
const { Client } = require(path.join(REPO, 'node_modules/pg'));
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const F = JSON.parse(fs.readFileSync('/tmp/opencode/b3s-gate/fixtures.json', 'utf8'));
const A = F.A;
const B = 'http://127.0.0.1:3010';
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const db = new Client({ connectionString: 'postgresql://gate@127.0.0.1:55432/qreat_gate' });

(async () => {
  await db.connect();
  const rows = await db.query('select "permissionKey" from role_permissions where "roleTemplate"=\'cashier\'');
  const permissions = rows.rows.map((r) => r.permissionKey);
  if (permissions.includes('orders:counter_serve')) throw new Error('role_permissions row still present');
  const now = Math.floor(Date.now() / 1000);
  const sessionId = 'sess_gate_fallback_' + crypto.randomUUID();
  const roleJson = { id: A.cashier.userRoleId, userType: 'staff', roleTemplate: 'cashier', restaurantId: A.restaurantId, customPermissions: [], isActive: true };
  const payload = {
    userId: A.cashier.staffId, email: 'staff-a-cashier@gate.invalid', firstName: 'Gate', lastName: 'Cashier',
    currentRole: roleJson, availableRoles: [roleJson],
    restaurantContext: { id: A.restaurantId, name: 'Gate Tenant a', slug: 'gate-a', isActive: true, timezone: 'Asia/Kuala_Lumpur', currency: 'MYR' },
    permissions, sessionId, iat: now, exp: now + 3600, iss: 'qr-restaurant-system', sub: A.cashier.staffId,
  };
  const token = jwt.sign(payload, '[local-gate-key-redacted]', { algorithm: 'HS256' });
  await db.query('insert into user_sessions (id,"userId","sessionId","currentRoleId","restaurantContextId","jwtTokenHash",permissions,"expiresAt","deviceType") values ($1,$2,$3,$4,$5,$6,$7,now() + interval \'1 hour\',\'counter\')',
    [crypto.randomUUID(), A.cashier.staffId, sha256(sessionId), A.cashier.userRoleId, A.restaurantId, sha256(token), JSON.stringify(permissions)]);
  const h = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
  const create = await fetch(B + '/api/counter/orders', { method: 'POST', headers: { ...h, 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ orderType: 'TAKEAWAY', items: [{ menuItemId: A.menu.burgerId, quantity: 1 }] }) });
  const created = await create.json();
  const patch = await fetch(B + '/api/orders/' + created.order.id + '/status', { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'PREPARING' }) });
  const patchBody = await patch.json().catch(() => null);
  const order = await db.query('select status, version from orders where id=$1', [created.order.id]);
  const out = { tokenPermissions: permissions, hasCounterServe: permissions.includes('orders:counter_serve'), createStatus: create.status, patchStatus: patch.status, patchBody, order: order.rows[0] };
  fs.writeFileSync('/tmp/opencode/b3s-gate/case7b.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await db.end();
})().catch(async (e) => { console.error('CASE7B_FAILED', e); try { await db.end(); } catch {} process.exit(1); });
