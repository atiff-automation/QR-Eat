import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static guard for the two B3-S migrations. The real proof is
 * `prisma migrate deploy` against a disposable database (recorded in the run
 * log); these tests pin the properties that make the apply safe and repeatable.
 */

const IDEMPOTENCY_MIGRATION =
  'prisma/migrations/20261118120000_add_order_mutation_idempotency/migration.sql';
const PERMISSION_MIGRATION =
  'prisma/migrations/20261118120100_seed_orders_counter_serve/migration.sql';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('B3-S migrations', () => {
  const idempotency = read(IDEMPOTENCY_MIGRATION);
  const permission = read(PERMISSION_MIGRATION);
  const idempotencyDdl = idempotency.replace(/--.*$/gm, '');
  const permissionDdl = permission.replace(/--.*$/gm, '');

  it('creates the scoped idempotency table additively', () => {
    expect(idempotency).toContain('CREATE TABLE "order_mutation_idempotency"');
    expect(idempotency).toContain(
      'CREATE UNIQUE INDEX "order_mutation_idempotency_scope_key"'
    );
    expect(idempotency).toContain(
      '("restaurantId", "orderId", "operation", "idempotencyKey")'
    );
    expect(idempotencyDdl).not.toMatch(/REFERENCES/i);
    expect(idempotencyDdl).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });

  it('seeds the permission and cashier mapping idempotently', () => {
    expect(permission).toContain("'orders:counter_serve'");
    expect(permission).toContain("'cashier'");
    expect(permission.match(/ON CONFLICT/g)).toHaveLength(2);
    expect(permission).toContain('DO NOTHING');
    expect(permission).toContain('gen_random_uuid()::text');
    expect(permissionDdl).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });

  it('keeps the seed as the source template', () => {
    const seed = read('prisma/seed.ts');
    expect(seed).toContain("key: 'orders:counter_serve'");
    expect(seed).toContain("'orders:counter_serve'");
    expect(seed).toContain("template: 'cashier'");
  });
});
