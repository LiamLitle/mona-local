#!/usr/bin/env sh
# Mona (macOS, Linux) : la première fois, installe tout (quelques minutes), ensuite l'application s'ouvre.
cd "$(dirname "$0")" || exit 1
command -v python3 >/dev/null 2>&1 || { echo "Python 3.10 ou plus est nécessaire : https://www.python.org/downloads/"; exit 1; }
if [ ! -x .venv/bin/python ]; then
  echo "Première installation, cela prend quelques minutes..."
  if ! python3 -m venv .venv 2>/dev/null; then
    rm -rf .venv
    echo "Il manque le module « venv » de Python. Sous Debian ou Ubuntu :"
    echo "  sudo apt install python3-venv python3-pip"
    echo "puis relance ./mona.sh"
    exit 1
  fi
  .venv/bin/python -m pip install --upgrade pip --quiet
  .venv/bin/python -m pip install -r requirements.txt || exit 1
  .venv/bin/python -m pip install -r requirements-app.txt --quiet 2>/dev/null
  .venv/bin/python -m mona setup || {
    echo
    echo "Si Chrome ne démarre pas faute de bibliothèques système (Linux), lance :"
    echo "  sudo .venv/bin/python -m playwright install-deps chromium"
    echo "puis relance ./mona.sh"
    exit 1
  }
fi
exec .venv/bin/python -m mona "$@"
