FROM debian:bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV TEXLIVE_VERSION=2025

# Install dependencies
RUN apt-get update && apt-get install -y \
    nano \
    perl \
    wget \
    xz-utils \
    fontconfig \
    python3 \
    python3-pip\
    && rm -rf /var/lib/apt/lists/*

# Install TeX Live
# WORKDIR /tmp
RUN wget https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz \
    && tar -xzf install-tl-unx.tar.gz \
    && cd install-tl-* \
    && perl ./install-tl --no-interaction --scheme=full \
    && cd /tmp && rm -rf install-tl*

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
    
# Set working directory for document compilation
WORKDIR /workspace

COPY server.py .

# Set entrypoint script to dynamically resolve arch and run pdflatex
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose FastAPI port 
EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]