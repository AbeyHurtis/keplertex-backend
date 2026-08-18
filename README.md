# KeplerTeX Backend

> Cloud-first LaTeX compilation backend powering the KeplerTeX VS Code extension. Compiles `.tex` documents to PDF (and other formats) without requiring a local TeX installation.

---

## Architecture Overview

```
VS Code Extension
       │
       ▼
 AWS API Gateway  (public HTTPS endpoint)
       │
       ▼
 AWS Lambda (Node.js 20)  ── keplertex-aws-lambda/index.mjs
       │   Auth & rate limiting via DynamoDB
       │   Forwards compile request with internal secret
       ▼
 Docker Compiler Service (FastAPI + TeX Live)  ── Docker-Build/server.py
       │
       └── Writes compile stats back to DynamoDB (CompileStats)
```

| Component | Technology | Purpose |
|---|---|---|
| **API Gateway** | AWS API Gateway (REST) + Terraform | Public HTTPS entry point, routes to Lambda |
| **Lambda Function** | Node.js 20 / ES Module | Auth, rate limiting, proxy to compiler |
| **Compiler Service** | Python 3 / FastAPI / TeX Live | Compiles LaTeX to PDF / HTML / SVG |
| **DynamoDB** | AWS DynamoDB (on-demand billing) | User records and daily compile counters |

---

## Repository Structure

```
keplertex-backend/
├── README.md                    ← You are here (global overview)
├── docs/
│   ├── api-gateway.md           ← IaC setup, IAM policy, deployment
│   ├── dynamodb.md              ← Table schema, local setup, connection
│   ├── docker-compiler.md       ← Build, run, all endpoints, curl examples
│   └── lambda.md                ← API reference, env vars, curl examples
├── API-Gateway/
│   └── setup.tf                 ← Terraform config for API GW + Lambda
├── AWS-DynamoDB/
│   └── setup.sh                 ← DynamoDB table creation script
├── Docker-Build/                ← Monolithic (v1) compiler image
│   ├── Dockerfile
│   ├── server.py
│   ├── entrypoint.sh
│   └── requirements.txt
└── keplertex-aws-lambda/        ← Lambda handler
    ├── index.mjs
    ├── package.json
    └── utils/
        └── Jobcleanup.sh
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| AWS CLI | v2 | https://aws.amazon.com/cli/ |
| Terraform | >= 1.5 | https://www.terraform.io/downloads |
| Node.js | 20.x | https://nodejs.org |
| Docker | 24+ | https://www.docker.com |

---

## Quick Start (First-Time Setup Order)

1. **[Docker Compiler](docs/docker-compiler.md)** — Build and run the LaTeX engine locally first.
2. **[DynamoDB](docs/dynamodb.md)** — Provision the tables (local or AWS).
3. **[Lambda](docs/lambda.md)** — Deploy the function with the correct environment variables.
4. **[API Gateway](docs/api-gateway.md)** — Deploy Terraform IaC to expose the public endpoint.

---

## AWS Account Bootstrap

```bash
# Configure credentials
aws configure
# Prompts: Access Key ID, Secret Access Key, region (us-east-1), output format (json)

# Verify
aws sts get-caller-identity
```

---

## License

Distributed under the Apache-2.0 License.
