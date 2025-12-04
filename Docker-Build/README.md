To create a Docker image that hosts TeX Live and enables LaTeX-to-PDF compilation, follow these steps:

---

## Step 1: Create a Docker Image with TeX Live

### Option 1: Use a Prebuilt TeX Live Docker Image

You can utilize existing Docker images that come with TeX Live pre-installed. For instance, the `mingc/latex` image provides a full TeX Live installation.([GitHub][1])

**Usage Example:**

```bash
docker run --rm -v "$(pwd)":/data -w /data mingc/latex pdflatex yourfile.tex
```



This command mounts your current directory into the container's `/data` directory and runs `pdflatex` on `yourfile.tex`.

### Option 2: Build a Custom Docker Image

If you prefer a custom setup, you can create your own Dockerfile:

```Dockerfile
FROM debian:bullseye-slim

RUN apt-get update && \
    apt-get install -y texlive-latex-base texlive-latex-extra texlive-fonts-recommended && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /data
```



**Build the Image:**

```bash
docker build -t texlive-image .
```



**Run the Container:**

```bash
docker run --rm -v "$(pwd)":/data -w /data texlive-image pdflatex yourfile.tex
```
---