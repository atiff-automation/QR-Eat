-- B3-S: scoped idempotency receipts for add-items and cancellation.
--
-- Additive only. Soft references: there is deliberately no foreign key to
-- "orders" or "restaurants", so neither a retained receipt nor an order
-- cleanup can cascade unexpectedly. Dropping this table loses only retry
-- receipts; the order, ticket and audit history stay intact.
CREATE TABLE "order_mutation_idempotency" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_mutation_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_mutation_idempotency_scope_key"
    ON "order_mutation_idempotency"("restaurantId", "orderId", "operation", "idempotencyKey");

CREATE INDEX "order_mutation_idempotency_orderId_idx"
    ON "order_mutation_idempotency"("orderId");
