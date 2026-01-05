@echo off
echo ========================================
echo Creating Tables in Railway Database
echo ========================================
echo.
echo Setting DATABASE_URL to Railway...
set DATABASE_URL=postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway

echo.
echo Running SQL script to create tables...
echo.
psql %DATABASE_URL% -f insert-tables.sql

echo.
echo ========================================
echo Complete!
echo ========================================
