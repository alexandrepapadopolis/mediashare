REM ambiente.bat
@echo off
setlocal EnableExtensions

REM Force UTF-8 codepage (reduces mojibake when PS1 is UTF-8)
chcp 65001 >nul

REM Resolve script directory (with trailing backslash)
set "SCRIPT_DIR=%~dp0"

echo [BAT] Running: powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%ambiente.ps1" %*

powershell.exe ^
  -NoLogo ^
  -NoProfile ^
  -ExecutionPolicy Bypass ^
  -File "%SCRIPT_DIR%ambiente.ps1" %*

exit /b %ERRORLEVEL%
