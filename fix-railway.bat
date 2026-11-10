@echo off
echo ========================================
echo Fixing Railway Database Schema
echo ========================================
echo.
echo Using DATABASE_URL from the environment...
if "%DATABASE_URL%"=="" (
  echo ERROR: DATABASE_URL is not set. Set it before running this script.
  exit /b 1
)

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
