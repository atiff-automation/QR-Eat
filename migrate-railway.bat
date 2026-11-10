@echo off
echo ========================================
echo Railway Database Migration
echo ========================================
echo.
echo Using DATABASE_URL from the environment...
if "%DATABASE_URL%"=="" (
  echo ERROR: DATABASE_URL is not set. Set it before running this script.
  exit /b 1
)

echo.
echo Step 1: Resetting database (dropping all tables and clearing migration history)...
echo.
npx prisma migrate reset --force --skip-seed

echo.
echo Step 2: Deploying all migrations...
echo.
npx prisma migrate deploy

echo.
echo Step 3: Verifying migration status...
echo.
npx prisma migrate status

echo.
echo ========================================
echo Migration Complete!
echo ========================================
