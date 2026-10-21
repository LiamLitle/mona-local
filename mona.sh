#!/usr/bin/env sh
# Mona (macOS, Linux) : la première fois, installe tout (quelques minutes), ensuite l'application s'ouvre.
cd "$(dirname "$0")" || exit 1
command -v python3 >/dev/null 2>&1 || { echo "Python 3.10 ou plus est nécessaire : https://www.python.org/downloads/"; exit 1; }
if [ ! -x .venv/bin/python ]; then
  echo "Première installation, cela prend quelques minutes..."
  python3 -m venv .venv || exit 1
  .venv/bin/python -m pip install --upgrade pip --quiet
  .venv/bin/python -m pip install -r requirements.txt || exit 1
  .venv/bin/python -m pip install -r requirements-app.txt --quiet 2>/dev/null
  .venv/bin/python -m mona setup || exit 1
fi
exec .venv/bin/python -m mona "$@"
