-- Diagnostic queries for Table Status Investigation
-- Run these in Prisma Studio or pgAdmin

-- 1. Check Table 1 orders and their statuses
SELECT 
  o.id,
  o."orderNumber",
  o.status as order_status,
  o."paymentStatus",
  o."createdAt",
  o."updatedAt",
  COUNT(oi.id) as item_count
FROM "Order" o
LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
WHERE o."tableId" = (SELECT id FROM "Table" WHERE "tableNumber" = '1' LIMIT 1)
GROUP BY o.id, o."orderNumber", o.status, o."paymentStatus", o."createdAt", o."updatedAt"
ORDER BY o."createdAt" DESC;

-- 2. Check Table 2 orders and their statuses
SELECT 
  o.id,
  o."orderNumber",
  o.status as order_status,
  o."paymentStatus",
  o."createdAt",
  o."updatedAt",
  COUNT(oi.id) as item_count
FROM "Order" o
LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
WHERE o."tableId" = (SELECT id FROM "Table" WHERE "tableNumber" = '2' LIMIT 1)
GROUP BY o.id, o."orderNumber", o.status, o."paymentStatus", o."createdAt", o."updatedAt"
ORDER BY o."createdAt" DESC;

-- 3. Check what the API filter is counting (pending/confirmed/preparing)
SELECT 
  t."tableNumber",
  t.status as table_status,
  COUNT(o.id) FILTER (WHERE o.status IN ('pending', 'confirmed', 'preparing')) as items_pending_count,
  COUNT(o.id) FILTER (WHERE o.status = 'ready') as items_ready_count,
  COUNT(o.id) FILTER (WHERE o.status = 'served') as items_served_count,
  COUNT(o.id) FILTER (WHERE o.status = 'completed') as items_completed_count,
  COUNT(o.id) as total_orders
FROM "Table" t
LEFT JOIN "Order" o ON o."tableId" = t.id
WHERE t."tableNumber" IN ('1', '2')
GROUP BY t.id, t."tableNumber", t.status
ORDER BY t."tableNumber";

-- 4. Check table status directly
SELECT 
  "tableNumber",
  status,
  "updatedAt"
FROM "Table"
WHERE "tableNumber" IN ('1', '2')
ORDER BY "tableNumber";

-- 5. Check if there are any orders with unexpected statuses
SELECT 
  t."tableNumber",
  o.status,
  COUNT(*) as count
FROM "Table" t
LEFT JOIN "Order" o ON o."tableId" = t.id
WHERE t."tableNumber" IN ('1', '2')
GROUP BY t."tableNumber", o.status
ORDER BY t."tableNumber", o.status;
