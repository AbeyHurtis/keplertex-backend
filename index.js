import AWS from "aws-sdk";
import crypto from "crypto";
import fetch from "node-fetch";

const dynamo = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE;
const COMPILER_SERVICE_URL = process.env.COMPILER_SERVICE_URL;
const DAILY_LIMIT = 20;

// Hash password
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Generate token
function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

// Main Lambda handler
export async function handler(event) {
  const { path, httpMethod, body } = event;
  const data = body ? JSON.parse(body) : {};

  if (path === "/signup" && httpMethod === "POST") {
    return signup(data);
  }
  if (path === "/login" && httpMethod === "POST") {
    return login(data);
  }
  if (path === "/checklogin" && httpMethod === "GET") {
    return checkLogin(event);
  }
  if (path === "/compile" && httpMethod === "POST") {
    return compileLatex(event);
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ error: "Not found" }),
  };
}

// Signup
async function signup({ email, password }) {
  const user = await dynamo.get({ TableName: USERS_TABLE, Key: { email } }).promise();
  if (user.Item) {
    return { statusCode: 400, body: JSON.stringify({ error: "User exists" }) };
  }

  const passwordHash = hashPassword(password);
  const token = generateToken();

  await dynamo.put({
    TableName: USERS_TABLE,
    Item: {
      email,
      passwordHash,
      token,
      requestsToday: 0,
      lastRequestDate: new Date().toISOString().split("T")[0],
    },
  }).promise();

  return { statusCode: 201, body: JSON.stringify({ token }) };
}

// Login
async function login({ email, password }) {
  const user = await dynamo.get({ TableName: USERS_TABLE, Key: { email } }).promise();
  if (!user.Item || user.Item.passwordHash !== hashPassword(password)) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ token: user.Item.token }) };
}

// Check login
async function checkLogin(event) {
  const token = event.headers.Authorization;
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "No token" }) };

  const user = await dynamo.scan({
    TableName: USERS_TABLE,
    FilterExpression: "token = :token",
    ExpressionAttributeValues: { ":token": token },
  }).promise();

  if (user.Items.length === 0) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ message: "Valid token" }) };
}

// Compile LaTeX
async function compileLatex(event) {
  const token = event.headers.Authorization;
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "No token" }) };

  const user = await dynamo.scan({
    TableName: USERS_TABLE,
    FilterExpression: "token = :token",
    ExpressionAttributeValues: { ":token": token },
  }).promise();

  if (user.Items.length === 0) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) };
  }

  // Rate limit check
  const today = new Date().toISOString().split("T")[0];
  let requestsToday = user.Items[0].requestsToday;
  let lastRequestDate = user.Items[0].lastRequestDate;

  if (today !== lastRequestDate) {
    requestsToday = 0;
    lastRequestDate = today;
  }

  if (requestsToday >= DAILY_LIMIT) {
    return { statusCode: 429, body: JSON.stringify({ error: "Daily limit reached" }) };
  }

  // Update usage
  await dynamo.update({
    TableName: USERS_TABLE,
    Key: { email: user.Items[0].email },
    UpdateExpression: "SET requestsToday = :req, lastRequestDate = :date",
    ExpressionAttributeValues: {
      ":req": requestsToday + 1,
      ":date": today,
    },
  }).promise();

  // Forward to compiler service
  const { latexRaw } = JSON.parse(event.body);
  const res = await fetch(`${COMPILER_SERVICE_URL}/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latexRaw }),
  });

  const pdfBuffer = await res.arrayBuffer();
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from(pdfBuffer).toString("base64"),
    isBase64Encoded: true,
  };
}
