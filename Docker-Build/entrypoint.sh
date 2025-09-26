#!/bin/bash

# Detect correct platform directory (e.g., aarch64 or x86_64)
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
  TEXBIN="/usr/local/texlive/2025/bin/x86_64-linux"
elif [ "$ARCH" = "aarch64" ]; then
  TEXBIN="/usr/local/texlive/2025/bin/aarch64-linux"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi

export PATH="$TEXBIN:$PATH"

# Run FastAPI app with Uvicorn
# exec uvicorn server:app --host 0.0.0.0 --port 8000
exec uvicorn server:app --host 0.0.0.0 --port $PORT