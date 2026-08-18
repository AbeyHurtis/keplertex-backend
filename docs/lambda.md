# Lambda Function — `keplertex-aws-lambda`

The Lambda function (`index.mjs`) is the core business logic layer. It handles user authentication, session token validation, daily rate limiting, and proxies compile requests to the Docker compiler service.

---

## File

```
keplertex-aws-lambda/
├── index.mjs          ← Main handler (ES Module)
├── package.json
└── utils/
    └── Jobcleanup.sh  ← Manual workspace cleanup utility
```

**Runtime:** Node.js 20.x (ES Modules, `.mjs`)

**Handler:** `index.handler`

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@aws-sdk/client-dynamodb` | AWS SDK v3 | Low-level DynamoDB client |
| `@aws-sdk/lib-dynamodb` | AWS SDK v3 | Document client (marshalling) |
| `node-fetch` | ^3.3.2 | HTTP requests to compiler service |
| `crypto` | Node built-in | Password hashing, token generation |

Install:

```bash
cd keplertex-aws-lambda
npm install
```

---

## Environment Variables

All variables are required in production. Set them on the Lambda function configuration.

| Variable | Example Value | Description |
|---|---|---|
| `USERS_TABLE` | `users` | DynamoDB users table name |
| `EMAIL_INDEX` | `email-index` | Name of the email GSI on the users table |
| `COMPILER_SERVICE_URL` | `http://my-host:8000` | Base URL of the Docker compiler service (no trailing slash required) |
| `DAILY_LIMIT` | `50` | Maximum compile requests per user per day |
| `INTERNAL_SHARED_SECRET` | `<random-secret>` | Shared secret passed to the compiler service via `x-internal-auth` |
| `AWS_REGION` | `us-east-1` | AWS region for DynamoDB (defaults to `us-east-1` if unset) |

### Setting variables via CLI

```bash
aws lambda update-function-configuration \
  --function-name keplertex-api \
  --environment "Variables={
    USERS_TABLE=users,
    EMAIL_INDEX=email-index,
    COMPILER_SERVICE_URL=http://your-compiler-host:8000,
    DAILY_LIMIT=50,
    INTERNAL_SHARED_SECRET=your-secret-here,
    AWS_REGION=us-east-1
  }"
```

---

## Deploying the Lambda

### Step 1 — Install dependencies and package

```bash
cd keplertex-aws-lambda
npm install
zip -r lambda.zip index.mjs package.json node_modules/
```

### Step 2 — Deploy to AWS

**New function (first deploy):**

```bash
aws lambda create-function \
  --function-name keplertex-api \
  --runtime nodejs20.x \
  --role arn:aws:iam::<account-id>:role/keplertex-lambda-exec \
  --handler index.handler \
  --zip-file fileb://lambda.zip
```

> If using Terraform (API-Gateway), the function is created automatically. Use `update-function-code` for subsequent deploys.

**Update existing function:**

```bash
aws lambda update-function-code \
  --function-name keplertex-api \
  --zip-file fileb://lambda.zip
```

---

## Testing Locally

Use the [AWS Lambda Runtime Interface Emulator (RIE)](https://github.com/aws/aws-lambda-runtime-interface-emulator) for local testing.

```bash
# Run Lambda locally on port 9000
docker run \
  -v $(pwd):/var/task \
  -p 9000:8080 \
  -e USERS_TABLE=users \
  -e EMAIL_INDEX=email-index \
  -e COMPILER_SERVICE_URL=http://host.docker.internal:8000 \
  -e DAILY_LIMIT=50 \
  -e INTERNAL_SHARED_SECRET=dev-secret \
  -e AWS_REGION=us-east-1 \
  public.ecr.aws/lambda/nodejs:20 \
  index.handler
```

Invoke with:

```bash
curl -X POST http://localhost:9000/2015-03-31/functions/function/invocations \
  -H "Content-Type: application/json" \
  -d '{"rawPath":"/checklogin","requestContext":{"http":{"method":"GET"}},"headers":{"authorization":"<token>"}}'
```

---

## API Reference

All endpoints are exposed through the API Gateway invoke URL:

```
https://<id>.execute-api.us-east-1.amazonaws.com/dev/<path>
```

Authentication for user-facing endpoints uses a bearer token in the `Authorization` header, obtained from `/login` or `/signup`.

---

### `POST /signup`

Register a new user with email and password.

**Request body:**

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "MyPass@2024!"
}
```

**Password requirements:**
- Minimum 8 characters
- At least one number
- At least two special characters
- At least one uppercase letter

**Response `201`:**
```json
{ "token": "a3f8c2e1d4b6..." }
```

**Error responses:**

| Status | Body | Cause |
|---|---|---|
| `400` | `{"error":"Username in use"}` | Username already taken |
| `400` | `{"error":"It looks like you already have an account..."}` | Email already registered |
| `400` | `{"error":"Invalid email"}` | Email format invalid |
| `400` | `{"error":"Password must ..."}` | Password validation failed |

```bash
curl -X POST https://<api-url>/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"johndoe","email":"john@example.com","password":"MyPass@2024!"}'
```

---

### `POST /login`

Authenticate with username and password. Returns a session token.

**Request body:**

```json
{
  "username": "johndoe",
  "password": "MyPass@2024!"
}
```

**Response `200`:**
```json
{ "token": "a3f8c2e1d4b6..." }
```

**Response `401`:**
```json
{ "error": "Invalid credentials" }
```

```bash
curl -X POST https://<api-url>/login \
  -H "Content-Type: application/json" \
  -d '{"username":"johndoe","password":"MyPass@2024!"}'
```

---

### `POST /signup/github`

Register a new user via GitHub OAuth. The client must exchange the GitHub OAuth code client-side before calling this endpoint.

**Request body:**

```json
{ "code": "<github-access-token>" }
```

> Pass the **access token** (not the authorization code). The GitHub OAuth exchange must happen before calling this endpoint.

**Response `201`:**
```json
{ "token": "a3f8c2e1d4b6..." }
```

**Response `400`:**
```json
{ "error": "GitHub account already linked" }
```

---

### `POST /login/github`

Authenticate with a GitHub access token.

**Request body:**

```json
{ "code": "<github-access-token>" }
```

**Response `200`:**
```json
{ "token": "a3f8c2e1d4b6..." }
```

**Response `404`:**
```json
{ "error": "No account linked with this GitHub" }
```

---

### `GET /checklogin`

Validates an existing session token.

**Request headers:**

```
Authorization: <token>
```

**Response `200`:**
```json
{ "message": "Valid token" }
```

**Response `401`:**
```json
{ "error": "Invalid token" }
```

```bash
curl -H "Authorization: a3f8c2e1d4b6..." https://<api-url>/checklogin
```

---

### `GET /checkusername`

Checks whether a username is already taken.

**Query parameter:** `?username=johndoe`

**Response `200`:**
```json
{ "exists": false }
```

```bash
curl "https://<api-url>/checkusername?username=johndoe"
```

---

### `POST /compile`

Compile a LaTeX document. Requires a valid session token. Enforces the daily rate limit.

**Request headers:**

```
Authorization: <token>
Content-Type: multipart/form-data
```

**Form fields:**

| Field | Type | Description |
|---|---|---|
| `file` | ZIP file | LaTeX project archive |
| `main_file` | string (optional) | Entry `.tex` file, defaults to `main.tex` |

**Response `200`:** Binary PDF with `Content-Type: application/pdf` (base64-encoded by Lambda, decoded by API Gateway).

**Error responses:**

| Status | Body | Cause |
|---|---|---|
| `401` | `{"error":"No token"}` | Missing Authorization header |
| `401` | `{"error":"Invalid token"}` | Token not found in DynamoDB |
| `429` | `{"error":"Daily limit reached"}` | User hit daily compile limit |

```bash
curl -X POST https://<api-url>/compile \
  -H "Authorization: a3f8c2e1d4b6..." \
  -F "file=@project.zip" \
  -F "main_file=main.tex" \
  --output output.pdf
```

---

## Rate Limiting Logic

On every `/compile` request:

1. Fetches the user record from DynamoDB.
2. If `lastRequestDate` is not today, resets `requestsToday` to `0`.
3. If `requestsToday >= DAILY_LIMIT` → returns `429`.
4. Otherwise, increments `requestsToday` and updates `lastRequestDate`.
5. Forwards the request to the compiler service.
6. On success, asynchronously increments a random shard in `CompileStats`.

---

## Security Notes

- Passwords are hashed with **SHA-256** before storage. No plaintext passwords are ever stored.
- Session tokens are 32-byte random hex strings generated with `crypto.randomBytes`.
- The `INTERNAL_SHARED_SECRET` is passed in the `x-internal-auth` header to the compiler service and never exposed in API responses.
- GitHub OAuth tokens are **not stored** — only the user's GitHub login (username) and ID are persisted.
