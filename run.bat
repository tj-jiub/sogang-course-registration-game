@echo off
cd /d "%~dp0"

echo 로컬 서버를 시작합니다...
start "sogang-course-registration-game server" cmd /k "npx --yes serve -l 4173 ."

echo 서버가 뜰 때까지 잠시 기다립니다...
timeout /t 5 /nobreak >nul

start "" http://localhost:4173

echo.
echo 브라우저가 안 열렸다면 http://localhost:4173 주소로 직접 접속하세요.
echo 서버를 끄려면 새로 뜬 "sogang-course-registration-game server" 창을 닫으세요.
pause >nul
