@echo off
setlocal
set ROOT=%~dp0
set SRC=%ROOT%src\main\java
set OUT=%ROOT%out\classes
set JAR=%ROOT%out\fe-monster-java.jar
set RUNJAR=%ROOT%out\fe-monster-java-%RANDOM%-%RANDOM%.jar
set RUNJAR_FILE=%ROOT%out\run-jar.txt
set SOURCES=%ROOT%build\sources.txt

if not exist "%ROOT%build" mkdir "%ROOT%build"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%SRC%' -Recurse -Filter *.java | ForEach-Object { '\"' + ($_.FullName -replace '\\','/') + '\"' } | Set-Content -Encoding ASCII -Path '%SOURCES%'"
javac -encoding UTF-8 -d "%OUT%" @"%SOURCES%"
if errorlevel 1 exit /b %ERRORLEVEL%

jar --create --file "%RUNJAR%" --main-class com.femonster.FeMonsterJavaApp -C "%OUT%" .
if errorlevel 1 exit /b %ERRORLEVEL%

copy /Y "%RUNJAR%" "%JAR%" >nul 2>nul
> "%RUNJAR_FILE%" echo %RUNJAR%
echo Built %RUNJAR%
endlocal
