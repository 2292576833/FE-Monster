@echo off
setlocal
set ROOT=%~dp0
set ROOT_PATH=%ROOT:~0,-1%
set SRC=%ROOT%src\main\java
set COMMUNITY_SRC=%ROOT%src\community-proprietary\java
set OUT=%ROOT%out\classes
set JAR=%ROOT%out\fe-monster-java.jar
set RUNJAR=%ROOT%out\fe-monster-java-%RANDOM%-%RANDOM%.jar
set RUNJAR_FILE=%ROOT%out\run-jar.txt
set SOURCES=%ROOT%build\sources.txt
set JAVAC=javac
set JAR_TOOL=jar

if defined JAVA_HOME if exist "%JAVA_HOME%\bin\javac.exe" (
  set "JAVAC=%JAVA_HOME%\bin\javac.exe"
  set "JAR_TOOL=%JAVA_HOME%\bin\jar.exe"
)
if exist "C:\java26\bin\javac.exe" (
  set "JAVAC=C:\java26\bin\javac.exe"
  set "JAR_TOOL=C:\java26\bin\jar.exe"
)
if exist "D:\java26\bin\javac.exe" (
  set "JAVAC=D:\java26\bin\javac.exe"
  set "JAR_TOOL=D:\java26\bin\jar.exe"
)
if exist "E:\java26\bin\javac.exe" (
  set "JAVAC=E:\java26\bin\javac.exe"
  set "JAR_TOOL=E:\java26\bin\jar.exe"
)
if defined FE_JAVA_HOME if exist "%FE_JAVA_HOME%\bin\javac.exe" (
  set "JAVAC=%FE_JAVA_HOME%\bin\javac.exe"
  set "JAR_TOOL=%FE_JAVA_HOME%\bin\jar.exe"
)
if defined FE_JAVA26_HOME if exist "%FE_JAVA26_HOME%\bin\javac.exe" (
  set "JAVAC=%FE_JAVA26_HOME%\bin\javac.exe"
  set "JAR_TOOL=%FE_JAVA26_HOME%\bin\jar.exe"
)
if exist "%ROOT%runtime\java\bin\javac.exe" (
  set "JAVAC=%ROOT%runtime\java\bin\javac.exe"
  set "JAR_TOOL=%ROOT%runtime\java\bin\jar.exe"
)

if not exist "%ROOT%build" mkdir "%ROOT%build"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"

powershell -NoProfile -File "%ROOT%scripts\check-license-boundaries.ps1" -Root "%ROOT_PATH%"
if errorlevel 1 exit /b %ERRORLEVEL%

powershell -NoProfile -Command "$roots = @('%SRC%'); if (Test-Path '%COMMUNITY_SRC%') { $roots += '%COMMUNITY_SRC%' }; Get-ChildItem -Path $roots -Recurse -Filter *.java | ForEach-Object { '\"' + ($_.FullName -replace '\\','/') + '\"' } | Set-Content -Encoding ASCII -Path '%SOURCES%'"
echo Using Java compiler: "%JAVAC%"
"%JAVAC%" -encoding UTF-8 --release 17 -d "%OUT%" @"%SOURCES%"
if errorlevel 1 exit /b %ERRORLEVEL%

"%JAR_TOOL%" --create --file "%RUNJAR%" --main-class com.femonster.FeMonsterJavaApp -C "%OUT%" .
if errorlevel 1 exit /b %ERRORLEVEL%

copy /Y "%RUNJAR%" "%JAR%" >nul 2>nul
> "%RUNJAR_FILE%" echo %RUNJAR%
echo Built %RUNJAR%
endlocal
