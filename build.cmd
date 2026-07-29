@echo off
setlocal
set "ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\build-java.ps1" -Root "%ROOT:~0,-1%"
exit /b %ERRORLEVEL%
