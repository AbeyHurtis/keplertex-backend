const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { fetch } = require("undici");
const crypto = require("crypto");

// ---- env ----
const {
  JWT_SECRET,
  USERS_TABLE,
  RL_TABLE,
  FREE_RPM = "30",
  PRO_RPM = "120",
  COMPILER_URL,
  INTERNAL_SHARED_SECRET
} = process.env;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Helpers
const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

function parseBody(event) {
  if (!event.body) return {};
  return event.isBase64Encoded ? JSON.parse(Buffer.from(event.body, "base64").toString()) : JSON.parse(event.body);
}

function getPathAndMethod(event) {
  // HTTP API shape
  const path = event.rawPath || event.path || "/";
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  return { path, method };
}

function signJwt(user) {
  return jwt.sign(
    { sub: user.userId, username: user.username, plan: user.plan },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1h" }
  );
}

function verifyAuth(event) {
  const h = event.headers?.authorization || event.headers?.Authorization || "";
  const [, token] = h.split(" ");
  if (!token) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
}

async function getUserByEmail(email) {
  const r = await ddb.send(new GetCommand({ TableName: USERS_TABLE, Key: { email } }));
  return r.Item;
}

async function createUser({ email, username, password }) {
  const existing = await getUserByEmail(email);
  if (existing) throw Object.assign(new Error("User exists"), { statusCode: 409 });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    email,
    userId: crypto.randomUUID(),
    username,
    passwordHash,
    plan: "free",
    createdAt: new Date().toISOString()
  };
  await ddb.send(new PutCommand({ TableName: USERS_TABLE, Item: user, ConditionExpression: "attribute_not_exists(email)" }));
  return user;
}

async function login({ email, password }) {
  const user = await getUserByEmail(email);
  if (!user) throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  return { access_token: signJwt(user), user: { userId: user.userId, username: user.username, plan: user.plan } };
}

function windowKey(userId, nowMs, windowSec = 60) {
  const bucket = Math.floor(nowMs / 1000 / windowSec);
  return `${userId}#${bucket}`;
}

async function rateLimit(user, now = Date.now()) {
  const perMin = user.plan === "pro" ? Number(PRO_RPM) : Number(FREE_RPM);
  const key = windowKey(user.sub, now, 60);
  const ttl = Math.floor(now / 1000) + 120; // keep items 2 minutes
  // Atomic increment with condition on limit
  const r = await ddb.send(new UpdateCommand({
    TableName: RL_TABLE,
    Key: { userWindow: key },
    UpdateExpression: "ADD #c :one SET #t = :ttl",
    ExpressionAttributeNames: { "#c": "count", "#t": "ttl" },
    ExpressionAttributeValues: { ":one": 1, ":ttl": ttl },
    ReturnValues: "ALL_NEW"
  }));
  const count = r.Attributes?.count || 0;
  if (count > perMin) {
    throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, extra: { limit: perMin, windowSeconds: 60 } });
  }
}

async function proxyCompile(user, event) {
  // Expect JSON body: { latexCode: "...", filename?: "main.tex" }
  const body = parseBody(event);
  if (!body?.latexCode) throw Object.assign(new Error("latexCode required"), { statusCode: 400 });

  const resp = await fetch(`${COMPILER_URL.replace(/\/$/, "")}/compile`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-auth": INTERNAL_SHARED_SECRET,
      "x-user-id": user.sub,
      "x-user-plan": user.plan
    },
    body: JSON.stringify(body)
  });

  const ct = resp.headers.get("content-type") || "";
  const status = resp.status;

  if (ct.includes("application/pdf")) {
    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      statusCode: status,
      isBase64Encoded: true,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'inline; filename="output.pdf"'
      },
      body: buf.toString("base64")
    };
  }

  // Forward JSON/text errors
  const text = await resp.text();
  let out;
  try { out = JSON.parse(text); } catch { out = { error: text }; }
  return json(status, out);
}

// ---- Lambda handler ----
exports.handler = async (event) => {
  try {
    const { path, method } = getPathAndMethod(event);

    // Routes
    if (path === "/signup" && method === "POST") {
      const body = parseBody(event);
      if (!body.email || !body.username || !body.password) return json(400, { error: "email, username, password required" });
      const user = await createUser(body);
      return json(201, { ok: true, user: { userId: user.userId, username: user.username, plan: user.plan } });
    }

    if (path === "/login" && method === "POST") {
      const body = parseBody(event);
      if (!body.email || !body.password) return json(400, { error: "email, password required" });
      const result = await login(body);
      return json(200, result);
    }

    if (path === "/compile" && method === "POST") {
      const user = verifyAuth(event);       // throws 401 if invalid
      await rateLimit(user);                // throws 429 if exceeded
      return await proxyCompile(user, event);
    }

    // default
    return json(404, { error: "Not found" });
  } catch (err) {
    const status = err.statusCode || 500;
    return json(status, { error: err.message || "Internal error", ...(err.extra || {}) });
  }
};
