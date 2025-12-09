-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "customerSessionId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "variationId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "specialInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cart_items_customerSessionId_idx" ON "cart_items"("customerSessionId");

-- CreateIndex
CREATE INDEX "cart_items_menuItemId_idx" ON "cart_items"("menuItemId");

-- CreateIndex
CREATE INDEX "customer_sessions_tableId_idx" ON "customer_sessions"("tableId");

-- CreateIndex
CREATE INDEX "customer_sessions_status_idx" ON "customer_sessions"("status");

-- CreateIndex
CREATE INDEX "customer_sessions_tableId_status_idx" ON "customer_sessions"("tableId", "status");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_customerSessionId_fkey" FOREIGN KEY ("customerSessionId") REFERENCES "customer_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "menu_item_variations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
