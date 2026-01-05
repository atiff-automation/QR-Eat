@echo off
echo ========================================
echo Reset and Seed Railway Database
echo ========================================
echo.
echo Setting DATABASE_URL to Railway...
set DATABASE_URL=postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway

echo.
echo Step 1: Resetting database...
echo.
npx prisma migrate reset --force

echo.
echo ========================================
echo Complete!
echo ========================================
