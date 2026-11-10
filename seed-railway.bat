@echo off
echo ========================================
echo Seeding Railway Database
echo ========================================
echo.
echo Using DATABASE_URL from the environment...
if "%DATABASE_URL%"=="" (
  echo ERROR: DATABASE_URL is not set. Set it before running this script.
  exit /b 1
)

echo.
echo Running seed script...
echo.
npx tsx prisma/seed.ts

echo.
echo ========================================
echo Seeding Complete!
echo ========================================
