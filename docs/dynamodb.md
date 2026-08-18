# AWS DynamoDB

KeplerTeX uses two DynamoDB tables with **on-demand (PAY_PER_REQUEST)** billing — no capacity planning required.

---

## Tables

### 1. `users` — User Accounts

Stores all user records regardless of auth provider (email/password or GitHub OAuth).

| Attribute | Type | Role | Description |
|---|---|---|---|
| `username` | String | **Partition Key (PK)** | Unique username; GitHub login name for OAuth users |
| `email` | String | GSI key | User email address |
| `passwordHash` | String | — | SHA-256 hash of password (email users only) |
| `accountToken` | String | — | 32-char hex session token used for API auth |
| `provider` | String | — | `"email"` or `"github"` |
| `githubId` | Number | — | GitHub user ID (GitHub users only) |
| `avatar_url` | String | — | GitHub avatar URL (GitHub users only) |
| `requestsToday` | Number | — | Compile count for the current day |
| `lastRequestDate` | String | — | ISO date string `YYYY-MM-DD` of last request |

**Global Secondary Index (GSI):** `email-index`
- Partition key: `email`
- Used by the Lambda to check for duplicate email registrations.

---

### 2. `CompileStats` — Global Compile Counters

Tracks compilation counts across all users for analytics.

| Attribute | Type | Role | Description |
|---|---|---|---|
| `pk` | String | **Partition Key (PK)** | `"global0"` through `"global9"` (sharded to avoid hot partitions) |
| `date` | String | **Sort Key (SK)** | ISO date string `YYYY-MM-DD` |
| `count` | Number | — | Number of compiles for that shard/date combination |

The Lambda writes to a random shard (`global0`–`global9`) on every successful compile using an **atomic ADD** update expression.

---

## Provisioning

### Option A — AWS (Production)

#### `users` table

```bash
aws dynamodb create-table \
  --table-name users \
  --attribute-definitions \
    AttributeName=username,AttributeType=S \
    AttributeName=email,AttributeType=S \
  --key-schema \
    AttributeName=username,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "email-index",
      "KeySchema": [{"AttributeName":"email","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]'
```

#### `CompileStats` table

```bash
aws dynamodb create-table \
  --table-name CompileStats \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=date,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=date,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

> The `AWS-DynamoDB/setup.sh` script only creates `CompileStats`. Run both commands above for a complete setup.

---

### Option B — Local (Development with DynamoDB Local)

#### 1. Start DynamoDB Local via Docker

```bash
docker run -d \
  --name dynamodb-local \
  -p 8001:8000 \
  amazon/dynamodb-local \
  -jar DynamoDBLocal.jar -sharedDb
```

#### 2. Create tables locally

```bash
# users table
aws dynamodb create-table \
  --endpoint-url http://localhost:8001 \
  --table-name users \
  --attribute-definitions \
    AttributeName=username,AttributeType=S \
    AttributeName=email,AttributeType=S \
  --key-schema \
    AttributeName=username,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName":"email-index",
      "KeySchema":[{"AttributeName":"email","KeyType":"HASH"}],
      "Projection":{"ProjectionType":"ALL"}
    }
  ]'

# CompileStats table
aws dynamodb create-table \
  --endpoint-url http://localhost:8001 \
  --table-name CompileStats \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=date,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=date,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

#### 3. Point the Lambda at the local endpoint

Add to your Lambda environment variables:

```
AWS_ENDPOINT_URL=http://localhost:8001
```

Or when running Lambda locally with `aws-lambda-rie`, export:

```bash
export AWS_ENDPOINT_URL=http://localhost:8001
```

#### 4. Verify tables exist

```bash
aws dynamodb list-tables --endpoint-url http://localhost:8001
```

---

## Connection in Lambda

The Lambda creates the DynamoDB client in [`index.mjs`](../keplertex-aws-lambda/index.mjs):

```js
const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const dynamo = DynamoDBDocumentClient.from(client);
```

The table names are injected as environment variables:

```
USERS_TABLE=users
EMAIL_INDEX=email-index
```

---

## Key Access Patterns

| Operation | Table | Method | Key(s) |
|---|---|---|---|
| Get user by username | `users` | `GetCommand` | `username` |
| Check email uniqueness | `users` | `QueryCommand` on `email-index` | `email` |
| Validate session token | `users` | `ScanCommand` on `accountToken` | — |
| Update daily counter | `users` | `UpdateCommand` | `username` |
| Increment global stats | `CompileStats` | `UpdateCommand` (ADD) | `pk`, `date` |

> **Note:** The token validation scan is a full table scan. For large user bases, consider adding a GSI on `accountToken`.
