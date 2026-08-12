@echo off
setlocal
set ROOT=%~dp0
set MAIN=%ROOT%native\windows\build\winforms\FE Monster.exe
set JAR=%ROOT%out\fe-monster-java.jar
if not exist "%MAIN%" goto fallback
if not exist "%JAR%" goto fallback
start "" "%MAIN%" %*
exit /b 0

:fallback
start "" /b wscript.exe //B "%ROOT%FE Monster.vbs" %*
endlocal
