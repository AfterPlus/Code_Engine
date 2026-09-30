@echo off
rem Starts the Code Engine and opens it in the browser. Close this window (or press Ctrl+C) to stop it.
if "%JAVA_HOME%"=="" set "JAVA_HOME=C:\Users\Admin\.jdks\openjdk-26.0.1"
cd /d "%~dp0backend"
start "" cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:8080"
call mvnw.cmd spring-boot:run
