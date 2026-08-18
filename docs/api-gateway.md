# API Gateway

The API Gateway is the public HTTPS entry point for all KeplerTeX backend operations. It is provisioned with Terraform and uses **AWS_PROXY** integration to forward requests directly to the Lambda function.

---

## File

```
API-Gateway/setup.tf
```

---

## Prerequisites

| Tool | Version |
|---|---|
| Terraform | >= 1.5 |
| AWS CLI | v2, configured with sufficient permissions |

---

## IAM Policy Requirements

The deploying IAM user/role needs the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:AddPermission",
        "lambda:GetFunction",
        "apigateway:*"
      ],
      "Resource": "*"
    }
  ]
}
```

The Lambda execution role (`keplertex-lambda-exec`) created by Terraform is automatically assigned **AWSLambdaBasicExecutionRole**, which grants:

- `logs:CreateLogGroup`
- `logs:CreateLogStream`
- `logs:PutLogEvents`

---

## Setup & Deployment

### Step 1 — Package the Lambda function

Terraform expects a `lambda.zip` in the `API-Gateway/` directory.

```bash
cd keplertex-aws-lambda
npm install
zip -r ../API-Gateway/lambda.zip index.mjs package.json node_modules/
```

### Step 2 — Initialize Terraform

```bash
cd API-Gateway
terraform init
```

### Step 3 — Review the plan

```bash
terraform plan
```

### Step 4 — Deploy

```bash
terraform apply
```

Type `yes` when prompted. Terraform will output the invoke URL on completion:

```
keplertex_api_invoke_url = "https://<id>.execute-api.us-east-1.amazonaws.com/dev"
```

### Step 5 — Configure Lambda environment variables

After deployment, set the required environment variables on the Lambda function (see [lambda.md](lambda.md) for the full list):

```bash
aws lambda update-function-configuration \
  --function-name keplertex-api \
  --environment "Variables={
    USERS_TABLE=users,
    COMPILER_SERVICE_URL=http://<your-compiler-host>:8000,
    DAILY_LIMIT=50,
    EMAIL_INDEX=email-index,
    INTERNAL_SHARED_SECRET=<your-secret>,
    AWS_REGION=us-east-1
  }"
```

---

## Terraform Resource Summary

| Resource | Name | Purpose |
|---|---|---|
| `aws_iam_role` | `keplertex-lambda-exec` | Lambda execution role |
| `aws_iam_role_policy_attachment` | `lambda_basic` | Grants Lambda CloudWatch logging |
| `aws_lambda_function` | `keplertex-api` | The Lambda function (Node.js 20) |
| `aws_api_gateway_rest_api` | `KeplertexAPI` | REST API |
| `aws_api_gateway_resource` | `/keplertex` | API resource path |
| `aws_api_gateway_method` | `GET /keplertex` | HTTP method |
| `aws_api_gateway_integration` | Lambda proxy | Routes requests to Lambda |
| `aws_lambda_permission` | `AllowAPIGatewayInvoke` | Allows API GW to invoke Lambda |
| `aws_api_gateway_deployment` | `dev` stage | Deploys the API |

---

## Runtime Configuration

| Setting | Value |
|---|---|
| Runtime | `nodejs20.x` |
| Handler | `index.handler` |
| Stage | `dev` |
| Region | `us-east-1` (configurable in `setup.tf` line 2) |
| Integration type | `AWS_PROXY` |

---

## Tear Down

```bash
cd API-Gateway
terraform destroy
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Error: lambda.zip not found` | Package step skipped | Run the zip command in Step 1 |
| `403 Forbidden` from API | `authorization` is set to `NONE` but request missing headers | Ensure Lambda validates the token internally |
| `502 Bad Gateway` | Lambda threw an unhandled exception | Check CloudWatch logs: `aws logs tail /aws/lambda/keplertex-api --follow` |
