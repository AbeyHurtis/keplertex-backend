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

## 📤 Step 2: Interact with the Docker Container to Compile LaTeX

### Scenario 1: You Have a `.tex` File

Assuming you have a LaTeX file named `document.tex` in your current directory:

```bash
docker run --rm -v "$(pwd)":/data -w /data texlive-image pdflatex document.tex
```



This command compiles `document.tex` and generates `document.pdf` in your current directory.

### Scenario 2: You Have LaTeX Code as a String

If you have LaTeX code in a string format, you can write it to a `.tex` file and then compile it:

**Example using a shell script:**

```bash
echo "\documentclass{article}\begin{document}Hello, World!\end{document}" > temp.tex
docker run --rm -v "$(pwd)":/data -w /data texlive-image pdflatex temp.tex
```



This will produce `temp.pdf` in your current directory.

---

## Automating with a Script

For convenience, you can create a shell script to automate the process:

```bash
#!/bin/bash

LATEX_CODE=$1
echo "$LATEX_CODE" > temp.tex
docker run --rm -v "$(pwd)":/data -w /data texlive-image pdflatex temp.tex
```



Save this script as `compile_latex.sh`, make it executable (`chmod +x compile_latex.sh`), and use it as follows:

```bash
./compile_latex.sh "\documentclass{article}\begin{document}Hello, World!\end{document}"
```



This will generate `temp.pdf` in your current directory.

---
