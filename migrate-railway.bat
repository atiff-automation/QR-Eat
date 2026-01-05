@echo off
echo ========================================
echo Railway Database Migration
echo ========================================
echo.
echo Setting DATABASE_URL to Railway...
set DATABASE_URL=postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway

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
