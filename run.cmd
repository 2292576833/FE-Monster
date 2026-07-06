@echo off
setlocal
set ROOT=%~dp0
start "" wscript.exe "%ROOT%FE Monster.vbs" %*
endlocal
