# Docker Compiler Service

The compiler service is a Dockerized **FastAPI** server running inside a full **TeX Live 2025** environment. It receives a raw `.tex` file (and optional `.bib` files), compiles them with `pdflatex`, and streams back the resulting PDF. It is an internal service — all requests must carry the `x-internal-auth` header.

---

## File Structure

```
Docker-Build/
├── Dockerfile        ← Single-stage image: Debian + TeX Live 2025 + FastAPI
├── server.py         ← FastAPI application
├── entrypoint.sh     ← Arch-aware TeX Live PATH setup + uvicorn start
└── requirements.txt  ← fastapi[standard], python-multipart
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `INTERNAL_SHARED_SECRET` | **Yes** | Secret token; every request must send this value in the `x-internal-auth` header |
| `PORT` | **Yes** | Port uvicorn listens on (e.g. `8000`) |

---

## Build

Run from the `Docker-Build/` directory. The build installs TeX Live in full scheme (~4 GB) and takes several minutes on first run.

```bash
cd Docker-Build
docker build -t keplertex:v1.0 .
```

---

## Run

```bash
docker run -d \
  -p 8000:8000 \
  -e PORT=8000 \
  -e INTERNAL_SHARED_SECRET=<your-secret> \
  --name keplertex-compiler \
  keplertex:v1.0
```

The server is available at `http://localhost:8000`.

---

## How It Works

### `entrypoint.sh`

At container startup, the script detects the host CPU architecture and adds the correct TeX Live binary path before starting uvicorn:

```
x86_64  → /usr/local/texlive/2025/bin/x86_64-linux
aarch64 → /usr/local/texlive/2025/bin/aarch64-linux
```

Unsupported architectures cause a hard exit with a descriptive message.

### Authentication Middleware (`server.py`)

Every incoming request is checked by an HTTP middleware before it reaches any endpoint:

```python
@app.middleware("http")
async def verify_internal_secret(request, call_next):
    if request.headers.get("x-internal-auth") != SECRET:
        raise HTTPException(status_code=403, detail="forbidden")
    return await call_next(request)
```

A `403 Forbidden` is returned for any request with a missing or incorrect `x-internal-auth` value.

### Compilation Pipeline

Each `/compile` request:

1. Generates a UUID job ID and creates an isolated working directory `/<job_id>/`.
2. Writes the uploaded `.tex` file to `/<job_id>/<uuid>.tex`.
3. Runs `pdflatex` (pass 1).
4. If `.bib` files are provided, writes them, runs `bibtex`, then `pdflatex` again (pass 2).
5. Runs `pdflatex` a final time.
6. Streams the resulting PDF back to the caller.
7. Schedules background cleanup of the job directory.

```
pdflatex (pass 1)
    │
    ├── if bib_files provided:
    │       write .bib files
    │       bibtex
    │       pdflatex (pass 2)
    │
    └── pdflatex (final pass)
```

On any non-zero `pdflatex`/`bibtex` exit code, `read_syntax_error` extracts lines starting with `!` (LaTeX error marker) and `l.` (line number references) from stdout, falling back to the last 10 lines of stderr if none are found. The extracted text is returned as `500 Plain Text`.

---

## API Endpoints

### `GET /`

Health check.

**Response `200`:**
```json
{ "Tex": "Live" }
```

```bash
curl -H "x-internal-auth: <your-secret>" http://localhost:8000/
```

---

### `POST /compile`

Compile a `.tex` file to PDF, with optional BibTeX bibliography files.

**Headers:**

| Header | Required | Description |
|---|---|---|
| `x-internal-auth` | Yes | Must match `INTERNAL_SHARED_SECRET` |

**Form fields (`multipart/form-data`):**

| Field | Type | Required | Description |
|---|---|---|---|
| `tex_file` | `UploadFile` | Yes | The `.tex` source file |
| `bib_files` | `List[UploadFile]` | No | One or more `.bib` bibliography files |

**Response `200`:** Binary PDF stream with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename=output.pdf`.

**Response `403`:** Plain text `Forbidden` — wrong or missing `x-internal-auth`.

**Response `500`:** Plain text with extracted LaTeX error lines from the pdflatex log.

**Without bibliography:**

```bash
curl -X POST http://localhost:8000/compile \
  -H "x-internal-auth: <your-secret>" \
  -F "tex_file=@main.tex" \
  --output output.pdf
```

**With bibliography:**

```bash
curl -X POST http://localhost:8000/compile \
  -H "x-internal-auth: <your-secret>" \
  -F "tex_file=@main.tex" \
  -F "bib_files=@references.bib" \
  --output output.pdf
```

---

## Error Reference

| HTTP Status | Format | Cause |
|---|---|---|
| `403` | Plain text `Forbidden` | Missing or incorrect `x-internal-auth` header |
| `500` | Plain text with LaTeX error lines | `pdflatex` or `bibtex` exited with non-zero code |

---

## Quick Reference

| Purpose | Command |
|---|---|
| Build image | `docker build -t keplertex:v1.0 .` |
| Run container | `docker run -d -p 8000:8000 -e PORT=8000 -e INTERNAL_SHARED_SECRET=secret keplertex:v1.0` |
| Health check | `curl -H "x-internal-auth: secret" http://localhost:8000/` |
| Compile (no bib) | `curl -X POST http://localhost:8000/compile -H "x-internal-auth: secret" -F "tex_file=@main.tex" --output output.pdf` |
| Compile (with bib) | `curl -X POST http://localhost:8000/compile -H "x-internal-auth: secret" -F "tex_file=@main.tex" -F "bib_files=@refs.bib" --output output.pdf` |
| Stop container | `docker stop keplertex-compiler && docker rm keplertex-compiler` |
| Remove image | `docker rmi keplertex:v1.0` |
