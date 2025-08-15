import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";
import fetch from "node-fetch";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const dynamo = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE;
const COMPILER_SERVICE_URL = process.env.COMPILER_SERVICE_URL;
const DAILY_LIMIT = 20;

// GitHub OAuth config
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

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
    //   const { path, httpMethod, body } = event;
    const path = event.rawPath || event.path;
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    const body = event.body || event.requestContext?.http?.body;

    if (path === "/compile" && httpMethod === "POST") {
        return compileLatex(event);
    }
    const data = body ? JSON.parse(body) : {};

    console.log("******************")
    console.log({ path, httpMethod, body, data });
    console.log("******************")

    if (path === "/signup" && httpMethod === "POST") {
        return signup(data);
    }

    if (path === "/signup/github" && httpMethod === "POST") {
        return githubSignup(data.code);
    }
    if (path === "/login" && httpMethod === "POST") {
        return login(data);
    }
    if (path === "/login/github" && httpMethod === "POST") {
        return githubLogin(data.code);
    }
    if (path === "/checklogin" && httpMethod === "GET") {
        return checkLogin(event);
    }

    return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
}

// Email/password signup
async function signup({ email, password }) {
    const user = await dynamo.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { email }
    }));
    if (user.Item) {
        return { statusCode: 400, body: JSON.stringify({ error: "User exists" }) };
    }

    const passwordHash = hashPassword(password);
    const token = generateToken();

    await dynamo.send(new PutCommand({
        TableName: USERS_TABLE,
        Item: {
            email,
            passwordHash,
            accountToken: token,
            provider: "email",
            requestsToday: 0,
            lastRequestDate: new Date().toISOString().split("T")[0],
        },
    }));

    return { statusCode: 201, body: JSON.stringify({ token }) };
}

// Email/password login
async function login({ email, password }) {
    const user = await dynamo.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { email }
    }));
    if (!user.Item || user.Item.passwordHash !== hashPassword(password)) {
        return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
    }
    return { statusCode: 200, body: JSON.stringify({ token: user.Item.accountToken }) };
}

// GitHub signup
async function githubSignup(code) {
    const githubData = await getGithubUser(code);
    const { id: githubId, email, login: username, avatar_url } = githubData;

    // Check if user already exists
    const existing = await dynamo.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: "githubId = :gid",
        ExpressionAttributeValues: { ":gid": githubId },
    }));

    if (existing.Items.length > 0) {
        return { statusCode: 400, body: JSON.stringify({ error: "GitHub account already linked" }) };
    }

    const token = generateToken();
    await dynamo.send(new PutCommand({
        TableName: USERS_TABLE,
        Item: {
            email: email || `${githubId}@github.local`,
            githubId,
            username,
            avatar_url,
            accountToken: token,
            provider: "github",
            requestsToday: 0,
            lastRequestDate: new Date().toISOString().split("T")[0],
        },
    }));

    return { statusCode: 201, body: JSON.stringify({ token }) };
}

// GitHub login
async function githubLogin(code) {
    const githubData = await getGithubUser(code);
    const { id: githubId } = githubData;

    const user = await dynamo.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: "githubId = :gid",
        ExpressionAttributeValues: { ":gid": githubId },
    }));

    if (user.Items.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ error: "No account linked with this GitHub" }) };
    }

    return { statusCode: 200, body: JSON.stringify({ token: user.Items[0].accountToken }) };
}

// Get GitHub user data
async function getGithubUser(access_token) {

    // Fetch GitHub user profile
    const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${access_token}` }
    });
    const userJson = await userRes.json();

    // If email not in profile, fetch separately
    if (!userJson.email) {
        const emailRes = await fetch("https://api.github.com/user/emails", {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const emails = await emailRes.json();
        const primaryEmail = emails.find(e => e.primary)?.email;
        userJson.email = primaryEmail || null;
    }

    return userJson;
}

// Check login
async function checkLogin(event) {
    const token = event.headers.authorization;
    console.log("**********");
    console.log("check login event : ", event);
    console.log("token : ", token);
    console.log("**********");
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: "No token" }) };

    const user = await dynamo.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: "accountToken = :accountToken",
        ExpressionAttributeValues: { ":accountToken": token },
    }));

    console.log("---------")
    console.log("user checklogin: ", user); 
    console.log("----------")

    if (user.Items.length === 0) {
        console.log("user Items == 0 ")
        return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) };
    }

    return { statusCode: 200, body: JSON.stringify({ message: "Valid token" }) };
}

// Compile LaTeX
async function compileLatex(event) {
    const token = event.headers.authorization;
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: "No token" }) };

    // Find user
    const user = await dynamo.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: "accountToken = :accountToken",
        ExpressionAttributeValues: { ":accountToken": token },
    }));


    console.log("**********");
    console.log("user from compileLatex: ", user);
    console.log("**********");

    if (user.Items.length === 0) {
        return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) };
    }

    // Rate limiting
    const today = new Date().toISOString().split("T")[0];
    let { requestsToday, lastRequestDate } = user.Items[0];

    if (today !== lastRequestDate) {
        requestsToday = 0;
        lastRequestDate = today;
    }

    if (requestsToday >= DAILY_LIMIT) {
        return { statusCode: 429, body: JSON.stringify({ error: "Daily limit reached" }) };
    }

    await dynamo.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { email: user.Items[0].email },
        UpdateExpression: "SET requestsToday = :req, lastRequestDate = :date",
        ExpressionAttributeValues: {
            ":req": requestsToday + 1,
            ":date": today,
        },
    }));

    // Forward multipart form-data to compiler service
    const buffer = Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8");

    
    const res = await fetch(`${COMPILER_SERVICE_URL}/compile`, {
        method: "POST",
        headers: {
            "Content-Type": event.headers["content-type"],
            "x-internal-auth": process.env.INTERNAL_SHARED_SECRET
        },
        body: buffer
    });

    if (!res.ok) {
        const text = await res.text();
        return { statusCode: res.status, body: text };
    }

    const pdfBuffer = await res.arrayBuffer();
    return {
        statusCode: 200,
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from(pdfBuffer).toString("base64"),
        isBase64Encoded: true,
    };
}
