@echo off
setlocal
set ROOT=%~dp0
if exist "%ROOT%out" rmdir /s /q "%ROOT%out"
if exist "%ROOT%build\sources.txt" del /f /q "%ROOT%build\sources.txt"
echo Cleaned Java build output.
endlocal
