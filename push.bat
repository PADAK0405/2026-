@echo off
title GitHub Push - 2026 Classroom Portal
echo ===================================================
echo   [GitHub Push] 2026 Classroom Portal
echo ===================================================
echo.

echo [1/2] Checking and staging changes...
git add .
git status -s

echo.
set /p COMMIT_MSG="커밋 메시지를 입력하세요 (엔터 시 기본 메시지 적용): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=update: 2026 학급 홈페이지 업데이트

git commit -m "%COMMIT_MSG%"

echo.
echo [2/2] Pushing commits to GitHub...
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
