import express from "express";
import Database from "better-sqlite3";
import crypto from "crypto";

const PORT = process.env.PORT || 8787;
const DB_PATH = process.env.DB_PATH || "./data.sqlite";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "xiao123456";
const TOKEN_TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS || 168); // 7天

const app = express();
app.use(express.json({ limit: "20mb" })); // base64 icon

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

function nowISO(){ return new Date().toISOString(); }
function addHoursISO(h){
  const d = new Date();
  d.setHours(d.getHours() + h);
  return d.toISOString();
}
function cleanupSessions(){
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowISO());
}

function getNavData(){
  const row = db.prepare("SELECT v FROM kv WHERE k='nav_data'").get();
  if(!row){
    const init = { version: 1, updatedAt: nowISO(), categories: [] };
    db.prepare("INSERT INTO kv (k, v, updated_at) VALUES ('nav_data', ?, ?)").run(JSON.stringify(init), nowISO());
    return init;
  }
  try { return JSON.parse(row.v); }
  catch { return { version: 1, updatedAt: nowISO(), categories: [] }; }
}

function saveNavData(data){
  data.updatedAt = nowISO();
  db.prepare(`
    INSERT INTO kv (k, v, updated_at)
    VALUES ('nav_data', ?, ?)
    ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at
  `).run(JSON.stringify(data), nowISO());
  return data.updatedAt;
}

function requireToken(req, res, next){
  cleanupSessions();
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if(!token) return res.status(401).json({ error: "Missing token" });

  const row = db.prepare("SELECT token, username, expires_at FROM sessions WHERE token=?").get(token);
  if(!row) return res.status(401).json({ error: "Invalid token" });
  if(row.expires_at <= nowISO()) return res.status(401).json({ error: "Token expired" });

  req.user = { username: row.username };
  next();
}

/** ========= 核心处理函数（被多个路由复用） ========= */
function handleLogin(req, res){
  const { username, password } = req.body || {};
  if(username !== ADMIN_USER || password !== ADMIN_PASS){
    return res.status(401).json({ error: "Invalid credentials" });
  }
  cleanupSessions();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = addHoursISO(TOKEN_TTL_HOURS);
  db.prepare("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)")
    .run(token, username, expiresAt);
  res.json({ token, expiresAt });
}

function handleLogout(req, res){
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  db.prepare("DELETE FROM sessions WHERE token=?").run(token);
  res.json({ ok: true });
}

function handleGetData(req, res){
  res.json(getNavData());
}

function handlePostData(req, res){
  const data = req.body;
  if(!data || !Array.isArray(data.categories)){
    return res.status(400).json({ error: "Invalid payload: categories[] required" });
  }
  data.categories.forEach(c=>{
    c.subcategories ||= [];
    c.subcategories.forEach(s=>{
      s.sites ||= [];
      s.sites.forEach(site=>{
        if(typeof site.icon !== "string") site.icon = "";
      });
    });
  });

  const updatedAt = saveNavData(data);
  res.json({ ok: true, updatedAt });
}

/** ========= 双兼容路由 ========= */
// 友好提示：避免看到 Cannot GET
app.get("/", (req,res)=>res.type("text").send("nav-api ok. Use /api/data or /data"));
app.get("/api", (req,res)=>res.type("text").send("nav-api ok. Use /api/data"));
app.get("/api/", (req,res)=>res.type("text").send("nav-api ok. Use /api/data"));

// login：/api/login 和 /login
app.post("/api/login", handleLogin);
app.post("/login", handleLogin);

// logout：/api/logout 和 /logout（需要 token）
app.post("/api/logout", requireToken, handleLogout);
app.post("/logout", requireToken, handleLogout);

// data：GET/POST 都兼容 /api/data 与 /data
app.get("/api/data", handleGetData);
app.get("/data", handleGetData);

app.post("/api/data", requireToken, handlePostData);
app.post("/data", requireToken, handlePostData);

app.listen(PORT, () => console.log(`✅ nav-api listening on :${PORT}`));
