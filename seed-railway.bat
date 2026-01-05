@echo off
echo ========================================
echo Seeding Railway Database
echo ========================================
echo.
echo Setting DATABASE_URL to Railway...
set DATABASE_URL=postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway

echo.
echo Running seed script...
echo.
npx tsx prisma/seed.ts

echo.
echo ========================================
echo Seeding Complete!
echo ========================================
