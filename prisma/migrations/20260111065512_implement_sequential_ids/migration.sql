-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "dailySeq" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "dailySeq" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "daily_sequences" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "paymentCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_sequences_restaurantId_date_key" ON "daily_sequences"("restaurantId", "date");

-- AddForeignKey
ALTER TABLE "daily_sequences" ADD CONSTRAINT "daily_sequences_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
