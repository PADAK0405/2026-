@echo off
title GitHub Push - 2026 Classroom Portal
echo ===================================================
echo   [GitHub Push] 2026 Classroom Portal
echo ===================================================
echo.
echo Pushing latest commits to GitHub...
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
