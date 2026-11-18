const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const PORT = Number(process.env.PORT) || 3000;
const MAX_CONTENT_LENGTH = 1024 * 1024;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "pastes.json");
const PUBLIC_DIR = path.join(__dirname, "dist");
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const EXPIRATIONS = new Set(["never", "10m", "1h", "1d", "7d"]);
const VIEW_LIMITS = new Set(["never", "1", "5", "10", "25", "100"]);
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Resource-Policy": "same-origin"
};

let database;
let schemaPromise;

if (!POSTGRES_URL && !process.env.VERCEL) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "{}", { flag: "wx" });
  }
}

function readPastes() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writePastes(pastes) {
  const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(pastes), { mode: 0o600 });
  fs.renameSync(temporaryFile, DATA_FILE);
}

function getDatabase() {
  if (!POSTGRES_URL) {
    if (process.env.VERCEL) {
      throw Object.assign(new Error("PostgreSQL is not configured. Set POSTGRES_URL in the Vercel project settings."), { status: 503 });
    }
    return null;
  }
  if (!database) {
    const { neon } = require("@neondatabase/serverless");
    database = neon(POSTGRES_URL);
  }
  return database;
}

async function ensureDatabaseSchema(sql) {
  if (!schemaPromise) {
    schemaPromise = sql`
      CREATE TABLE IF NOT EXISTS pastes (
        id VARCHAR(12) PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ,
        max_views INTEGER,
        views INTEGER NOT NULL DEFAULT 0
      )
    `;
  }
  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

async function createPaste(paste) {
  const sql = getDatabase();
  if (!sql) {
    const pastes = readPastes();
    pastes[paste.id] = paste;
    writePastes(pastes);
    return;
  }

  await ensureDatabaseSchema(sql);
  await sql`
    INSERT INTO pastes (id, title, content, created_at, expires_at, max_views, views)
    VALUES (
      ${paste.id},
      ${paste.title},
      ${paste.content},
      ${paste.createdAt},
      ${paste.expiresAt},
      ${paste.maxViews},
      ${paste.views}
    )
  `;
}

async function getPasteForViewing(id) {
  const sql = getDatabase();
  if (!sql) {
    const pastes = readPastes();
    const paste = pastes[id];
    if (!paste || (paste.expiresAt && Date.now() >= Date.parse(paste.expiresAt)) ||
        (paste.maxViews !== null && paste.views >= paste.maxViews)) {
      if (paste) {
        delete pastes[id];
        writePastes(pastes);
      }
      return null;
    }
    paste.views += 1;
    writePastes(pastes);
    return paste;
  }

  await ensureDatabaseSchema(sql);
  const rows = await sql`
    UPDATE pastes
    SET views = views + 1
    WHERE id = ${id}
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (max_views IS NULL OR views < max_views)
    RETURNING id, title, content, created_at, expires_at, max_views, views
  `;
  if (rows.length === 0) {
    await sql`
      DELETE FROM pastes
      WHERE id = ${id}
        AND (
          (expires_at IS NOT NULL AND expires_at <= NOW())
          OR (max_views IS NOT NULL AND views >= max_views)
        )
    `;
    return null;
  }

  const [row] = rows;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    maxViews: row.max_views,
    views: row.views
  };
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS
  });
  response.end(JSON.stringify(value));
}

function readRequestBody(request) {
  if (request.body !== undefined) {
    if (typeof request.body === "string") {
      try {
        return Promise.resolve(JSON.parse(request.body));
      } catch {
        return Promise.reject(Object.assign(new Error("Request body must be valid JSON"), { status: 400 }));
      }
    }
    return Promise.resolve(request.body);
  }

  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_CONTENT_LENGTH + 4096) {
        tooLarge = true;
        body = "";
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Request body is too large"), { status: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON"), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function expirationDate(expiration) {
  const durations = {
    "10m": 10 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000
  };
  return durations[expiration] ? new Date(Date.now() + durations[expiration]).toISOString() : null;
}

function isCrossOriginApiRequest(request) {
  if (request.headers["sec-fetch-site"] === "cross-site") return true;
  if (!request.headers.origin) return false;
  try {
    return new URL(request.headers.origin).host !== request.headers.host;
  } catch {
    return true;
  }
}

function serveStatic(response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const isPasteRoute = /^\/[A-Za-z0-9_-]{12}$/.test(decodedPath);
  const relativePath = decodedPath === "/" || isPasteRoute
    ? "index.html"
    : decodedPath.replace(/^[/\\]+/, "");
  const publicRoot = path.resolve(PUBLIC_DIR);
  const filePath = path.resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
  };
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      ...SECURITY_HEADERS,
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' https://*.neon.tech https://*.neon.build; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const isPasteApi = pathname === "/api/pastes" || pathname.startsWith("/api/pastes/");
  if (isPasteApi && isCrossOriginApiRequest(request)) {
    sendJson(response, 403, { error: "Cross-origin requests are not allowed." });
    return;
  }

  if (request.method === "POST" && pathname === "/api/pastes") {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
      sendJson(response, 415, { error: "Content-Type must be application/json." });
      return;
    }

    let body;
    try {
      body = await readRequestBody(request);
    } catch (error) {
      sendJson(response, error.status || 400, { error: error.message });
      return;
    }

    const { content, title = "", expiration = "never", maxViews = "never" } = body || {};
    if (typeof content !== "string" || !content.trim()) {
      sendJson(response, 400, { error: "Paste content cannot be empty." });
      return;
    }
    if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_LENGTH) {
      sendJson(response, 413, { error: "Paste content must be 1 MB or smaller." });
      return;
    }
    if (typeof title !== "string" || title.length > 120) {
      sendJson(response, 400, { error: "Title must be 120 characters or fewer." });
      return;
    }
    if (!EXPIRATIONS.has(expiration) || !VIEW_LIMITS.has(String(maxViews))) {
      sendJson(response, 400, { error: "Choose a valid expiration and view limit." });
      return;
    }

    const id = crypto.randomBytes(9).toString("base64url");
    const paste = {
      id,
      title: title.trim(),
      content,
      createdAt: new Date().toISOString(),
      expiresAt: expirationDate(expiration),
      maxViews: maxViews === "never" ? null : Number(maxViews),
      views: 0
    };
    await createPaste(paste);
    sendJson(response, 201, { id, url: `/${id}` });
    return;
  }

  const pasteMatch = pathname.match(/^\/api\/pastes\/([A-Za-z0-9_-]{12})$/);
  if (request.method === "GET" && pasteMatch) {
    const paste = await getPasteForViewing(pasteMatch[1]);
    if (!paste) {
      sendJson(response, 404, { error: "This paste has expired or reached its view limit." });
      return;
    }

    sendJson(response, 200, {
      id: paste.id,
      title: paste.title,
      content: paste.content,
      createdAt: paste.createdAt,
      expiresAt: paste.expiresAt,
      maxViews: paste.maxViews,
      views: paste.views
    });
    return;
  }

  if (request.method === "GET") {
    serveStatic(response, pathname);
    return;
  }
  sendJson(response, 405, { error: "Method not allowed." });
}

function requestHandler(request, response) {
  handleRequest(request, response).catch((error) => {
    console.error("Request failed:", error);
    if (!response.headersSent) {
      sendJson(response, error.status || 500, {
        error: error.status ? error.message : "Something went wrong. Please try again."
      });
    } else {
      response.destroy(error);
    }
  });
}

if (require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`QuickPaste is running at http://localhost:${PORT}`);
  });
}

module.exports = requestHandler;
