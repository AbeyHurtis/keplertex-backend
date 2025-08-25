from fastapi import FastAPI, BackgroundTasks, File, UploadFile, Header, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from typing import List
import subprocess
import shutil
import uuid
import os

app = FastAPI()
SECRET = os.environ['INTERNAL_SHARED_SECRET']

# Test Command
# curl -X POST http://localhost:8000/compile \
#   -F 'tex_file=@./test.tex' \
#   --output output.pdf

# curl -X POST http://localhost:5000/compile \
#   -H "x-internal-auth:ReplaceInternalSecret" \
#   -F "tex_file=@test.tex" \
#   --output output.pdf

# Test Command - Deployment
# curl -X POST https://texlive-latest.onrender.com/compile \
#   -F 'tex_file=@./main.tex' \
#   --output output.pdf

@app.middleware("http")
async def verify_internal_secret(request, call_next): 
    if request.headers.get("x-internal-auth") != SECRET:
        raise HTTPException(status_code=403, detail="forbidden")
    return await call_next(request)

def cleanup_files(job_id):
    # Clean up all generated files
    shutil.rmtree(job_id, ignore_errors=True)

    

@app.get("/")
def read_root():
    return {"Tex": "Live"}


@app.post("/compile")
async def compile_latex(background_tasks: BackgroundTasks,
                        tex_file: UploadFile = File(...),
                        bib_files: List[UploadFile] = File(None),
                        x_internal_auth: str = Header(None)):
    
    # Check secret
    if x_internal_auth != SECRET:
        return PlainTextResponse("Forbidden", status_code=403)

    job_id = str(uuid.uuid4())
    tex_file_name = f"{job_id}.tex"
    pdf_file = f"{job_id}.pdf"

    try:
        # write create folder for job id 
        os.makedirs(job_id, exist_ok=True)
        
        # Write the LaTeX source code to a .tex file
        with open(f"./{job_id}/{tex_file_name}", "wb") as f:
            content = await tex_file.read()
            f.write(content)

        # Run pdflatex (twice is common for references/toc)
        subprocess.run(["pdflatex", tex_file_name], cwd=job_id,
                       check=True,
                       stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE)
        
        if bib_files: 
            for bib_file in bib_files: 
                bib_file_name = f"{bib_file.filename}"
                with open(f"./{job_id}/{bib_file_name}", "wb") as f:
                    content = await bib_file.read()
                    f.write(content)
        
            subprocess.run(["bibtex", job_id], cwd=job_id,
                           check=True,
                           stdout=subprocess.PIPE, 
                           stderr=subprocess.PIPE)
            
            subprocess.run(["pdflatex", tex_file_name], cwd=job_id,
                        check=True,
                       stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE)

        subprocess.run(["pdflatex", tex_file_name], cwd=job_id,
                       check=True,
                       stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE)
        
        # Debuging lines
        # result = subprocess.run(["pdflatex", tex_file_name], check=True,
        # stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # print(result.stdout.decode())
        # print(result.stderr.decode())
        # print("Current working directory:", os.getcwd())
        # print("List of files:", os.listdir())
        # print("Looking for PDF:", pdf_file)

        # Schedule cleanup after response is sent
        background_tasks.add_task(cleanup_files, job_id)

        # Return the compiled PDF
        return FileResponse(f"./{job_id}/{pdf_file}", media_type='application/pdf',
                            filename='output.pdf')

    except subprocess.CalledProcessError as e:
        return PlainTextResponse(f"LaTeX compilation failed:\n{e.stderr.decode()}",
                                 status_code=500)