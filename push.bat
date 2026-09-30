@echo off
title GitHub Push - 2026 Classroom Portal
echo ===================================================
echo   [GitHub Push] 2026 Classroom Portal
echo ===================================================
echo.
if exist scripts\scrape_meals.js (
    echo [1/2] Syncing latest Gaon High School meals...
    node scripts\scrape_meals.js
    node scripts\build_meal_js.js
    git add meals.json meal.js
    git commit -m "chore: auto-sync latest Gaon High School meals" >nul 2>&1
)

echo [2/2] Pushing latest commits to GitHub...
echo.

git push origin main

echo.
if %ERRORLEVEL% equ 0 (
    echo ===================================================
    echo   [SUCCESS] GitHub push completed successfully!
    echo ===================================================
) else (
    echo ===================================================
    echo   [ERROR] Git push failed. Please check above error.
    echo ===================================================
)
echo.
pause
