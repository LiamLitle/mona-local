@echo off
rem Mona : double-clique sur ce fichier. La premiere fois, il installe tout (quelques minutes), ensuite l'application s'ouvre.
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.10 ou plus est necessaire : https://www.python.org/downloads/
  echo Pense a cocher "Add python.exe to PATH" pendant l'installation.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo Premiere installation, cela prend quelques minutes...
  python -m venv .venv || goto erreur
  ".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto erreur
  ".venv\Scripts\python.exe" -m pip install -r requirements-app.txt --quiet 2>nul
  ".venv\Scripts\python.exe" -m mona setup || goto erreur
)
start "" ".venv\Scripts\pythonw.exe" -m mona
exit /b 0
:erreur
echo.
echo L'installation a echoue. Copie le message ci-dessus dans une issue GitHub si besoin.
pause
exit /b 1
