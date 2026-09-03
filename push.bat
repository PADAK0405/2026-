@echo off
chcp 65001 > nul
echo ========================================================
echo   2026 학급 포털 - GitHub 푸시 (Git Push)
echo ========================================================
echo.
echo GitHub 인증 및 푸시를 진행합니다...
echo.

git push -u origin main

echo.
if %ERRORLEVEL% equ 0 (
    echo [성공] GitHub에 정상적으로 푸시되었습니다!
) else (
    echo [오류] 푸시 중 문제가 발생했습니다. 에러 메시지를 확인해 주세요.
)
echo.
echo 창을 닫으려면 아무 키나 누르세요...
pause > nul
