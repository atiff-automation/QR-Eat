@echo off
echo ========================================
echo Fixing Railway Database Schema
echo ========================================
echo.
echo Setting DATABASE_URL to Railway...
set DATABASE_URL=postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway

echo.
echo Step 1: Generating Prisma Client...
echo.
npx prisma generate

echo.
echo Step 2: Deploying migrations again...
echo.
npx prisma migrate deploy

echo.
echo Step 3: Running seed script...
echo.
npx tsx prisma/seed.ts

echo.
echo ========================================
echo Complete!
echo ========================================
