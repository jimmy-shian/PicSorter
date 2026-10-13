@echo off
rem ============================================================
rem PicSorter APK Builder & Release Packager
rem
rem Highlights:
rem 1. Auto reads version from package.json
rem 2. Runs TypeScript typecheck (optional skip via -notypecheck)
rem 3. Automatically detects / generates release signing keystore
rem    or falls back cleanly to debug keystore
rem 4. Forces JS bundle regeneration & Hermes bytecode compile
rem 5. Outputs formatted APK to project root (e.g. PicSorter-v1.0.2-arm64.apk)
rem
rem Usage:
rem   build-apk.bat                 Standard release build (arm64-v8a)
rem   build-apk.bat -universal      Universal APK (all architectures)
rem   build-apk.bat -clean          Clean Gradle cache before build
rem   build-apk.bat -notypecheck    Skip TypeScript validation
rem   build-apk.bat -genkey         Generate release.keystore for production signing
rem ============================================================
setlocal EnableDelayedExpansion
cd /d %~dp0

set ARCH=arm64-v8a
set DO_CLEAN=0
set DO_TYPECHECK=1
set GEN_KEY=0

:parse_args
if "%~1"=="" goto after_args
if /i "%~1"=="-clean" (
  set DO_CLEAN=1
)
if /i "%~1"=="-universal" (
  set ARCH=armeabi-v7a,arm64-v8a,x86,x86_64
)
if /i "%~1"=="-notypecheck" (
  set DO_TYPECHECK=0
)
if /i "%~1"=="-genkey" (
  set GEN_KEY=1
)
shift
goto parse_args
:after_args

rem --- Read version from package.json ---
for /f "delims=" %%v in ('node -p "require('./package.json').version" 2^>nul') do set VER=%%v
if "%VER%"=="" set VER=1.0.0
set DEST=PicSorter-v%VER%-arm64.apk
if not "%ARCH%"=="arm64-v8a" (
  set DEST=PicSorter-v%VER%-universal.apk
)

echo ============================================================
echo   PicSorter Build APK
echo   Version : %VER%
echo   Arch    : %ARCH%
echo   Output  : %DEST%
echo ============================================================

rem --- Check or generate release keystore if requested ---
if "%GEN_KEY%"=="1" (
  if exist "android\app\release.keystore" (
    echo [Keystore] android\app\release.keystore already exists.
  ) else (
    echo [Keystore] Generating new production keystore: android\app\release.keystore ...
    keytool -genkeypair -v -storetype PKCS12 -keystore android\app\release.keystore -alias picsorter -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=PicSorter, OU=App, O=PicSorter, L=Taipei, ST=Taiwan, C=TW"
    if errorlevel 1 (
      echo [Warning] keytool failed. Please ensure JDK/keytool is in PATH.
    ) else (
      echo [Keystore] Created android\app\release.keystore successfully.
    )
  )
)

rem --- Auto detect Android SDK ---
if "%ANDROID_HOME%"=="" (
  if exist "%LOCALAPPDATA%\Android\Sdk" (
    set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
    set ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk
  )
)

rem --- [Step 1/3] TypeScript Typecheck ---
if "%DO_TYPECHECK%"=="1" (
  echo [1/3] Typechecking via npx tsc --noEmit ...
  call npx tsc --noEmit
  if errorlevel 1 (
    echo [ERROR] TypeScript compilation errors found! Fix them or use -notypecheck.
    goto :err
  )
) else (
  echo [1/3] Skipping TypeScript typecheck.
)

rem --- [Step 2/3] Gradle Assemble Release ---
echo [2/3] Building Android Release APK ...
cd android
if "%DO_CLEAN%"=="1" (
  echo Gradle clean + assembleRelease ...
  call gradlew.bat :app:clean :app:assembleRelease --console=plain -PreactNativeArchitectures=%ARCH%
) else (
  echo Rebuilding JS bundle + assembleRelease ...
  call gradlew.bat :app:cleanCreateBundleReleaseJsAndAssets :app:assembleRelease --console=plain -PreactNativeArchitectures=%ARCH%
)
if errorlevel 1 goto :err
cd /d %~dp0

rem --- [Step 3/3] Copy and name output APK ---
set SRC_APK=android\app\build\outputs\apk\release\app-release.apk
if not exist "%SRC_APK%" (
  echo [ERROR] Missing %SRC_APK%
  goto :err
)

echo [3/3] Copying to %DEST% ...
copy /y "%SRC_APK%" "%DEST%" >nul
if errorlevel 1 goto :err

echo ============================================================
for %%f in ("%DEST%") do echo [SUCCESS] Created: %%~nxf (%%~zf bytes)
echo Output file located at: %~dp0%DEST%
echo ============================================================
goto :end

:err
cd /d %~dp0
echo [FAILED] Build failed with errorlevel=%errorlevel%
exit /b 1

:end
endlocal
