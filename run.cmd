@echo off
setlocal
set ROOT=%~dp0
call "%ROOT%build.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%
set RUNJAR=%ROOT%out\fe-monster-java.jar
if exist "%ROOT%out\run-jar.txt" set /p RUNJAR=<"%ROOT%out\run-jar.txt"
java -jar "%RUNJAR%" %*
endlocal
