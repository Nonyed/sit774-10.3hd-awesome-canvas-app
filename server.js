
import express from "express";
import session from "express-session";
import SQLite from "better-sqlite3";
import bcrypt from "bcrypt";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

const app = express();

// --- Security & middleware ---
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(express.static("public"));

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 },
  })
);

// --- Database ---
const db = new SQLite("db/app.db");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS drawings(
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    title TEXT NOT NULL,
    data TEXT NOT NULL, -- JSON string
    shared INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// --- Helpers ---
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}
function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// --- Validation schemas ---
const registerSchema = z.object({
  username: z.string().min(3).max(30),
  password: z.string().min(6).max(100),
});
const loginSchema = registerSchema;
const drawingSchema = z.object({
  title: z.string().min(1).max(200),
  // "data" is the TEXT-encoded JSON payload describing stroke commands
  data: z.object({
    strokes: z.array(
      z.object({
        tool: z.enum(["pen", "eraser", "rect", "circle", "line"]),
        color: z.string(), // CSS color string
        size: z.number().min(1).max(64),
        points: z.array(z.tuple([z.number(), z.number()])), // [[x,y], ...]
      })
    ).min(1),
    width: z.number().min(1),
    height: z.number().min(1),
    background: z.string().optional(),
  }),
  shared: z.boolean().optional(),
});

// --- Routes ---
// 1) Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// 2) Version/info
app.get("/api/version", (req, res) => {
  res.json({ app: "SIT774 10.3HD Canvas App", version: "1.0.0" });
});

// 3) Register (secure: hashed password)
app.post("/auth/register", asyncWrap(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { username, password } = parsed.data;
  const password_hash = await bcrypt.hash(password, 12);
  const created_at = new Date().toISOString();

  try {
    const stmt = db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)");
    const info = stmt.run(username, password_hash, created_at);
    res.status(201).json({ id: info.lastInsertRowid, username });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "Username already exists" });
    throw e;
  }
}));

// 4) Login
app.post("/auth/login", asyncWrap(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { username, password } = parsed.data;
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  req.session.user = { id: row.id, username: row.username };
  res.json({ id: row.id, username: row.username });
}));

// 5) Logout
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// 6) Current user
app.get("/auth/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

// 7) Create drawing
app.post("/api/drawings", requireAuth, asyncWrap(async (req, res) => {
  const parsed = drawingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = uuidv4();
  const created_at = new Date().toISOString();
  const updated_at = created_at;
  const { title, data, shared = false } = parsed.data;
  const stmt = db.prepare(`INSERT INTO drawings (id, user_id, title, data, shared, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?)`);
  stmt.run(id, req.session.user.id, title, JSON.stringify(data), shared ? 1 : 0, created_at, updated_at);
  res.status(201).json({ id, title });
}));

// 8) List drawings (own + shared)
app.get("/api/drawings", asyncWrap(async (req, res) => {
  const userId = req.session.user?.id;
  let rows;
  if (userId) {
    rows = db.prepare("SELECT * FROM drawings WHERE user_id = ? OR shared = 1 ORDER BY updated_at DESC").all(userId);
  } else {
    rows = db.prepare("SELECT * FROM drawings WHERE shared = 1 ORDER BY updated_at DESC").all();
  }
  res.json(rows.map(r => ({ ...r, data: JSON.parse(r.data) })));
}));

// 9) Get drawing by id
app.get("/api/drawings/:id", asyncWrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM drawings WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ...row, data: JSON.parse(row.data) });
}));

// 10) Update drawing
app.put("/api/drawings/:id", requireAuth, asyncWrap(async (req, res) => {
  const parsed = drawingSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const row = db.prepare("SELECT * FROM drawings WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.user_id !== req.session.user.id) return res.status(403).json({ error: "Forbidden" });

  const title = parsed.data.title ?? row.title;
  const data = parsed.data.data ? JSON.stringify(parsed.data.data) : row.data;
  const shared = parsed.data.shared === undefined ? row.shared : (parsed.data.shared ? 1 : 0);
  const updated_at = new Date().toISOString();

  db.prepare("UPDATE drawings SET title=?, data=?, shared=?, updated_at=? WHERE id = ?")
    .run(title, data, shared, updated_at, req.params.id);
  res.json({ id: req.params.id, title });
}));

// 11) Delete drawing
app.delete("/api/drawings/:id", requireAuth, asyncWrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM drawings WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.user_id !== req.session.user.id) return res.status(403).json({ error: "Forbidden" });
  db.prepare("DELETE FROM drawings WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

// 12) Toggle share
app.post("/api/drawings/:id/share", requireAuth, asyncWrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM drawings WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.user_id !== req.session.user.id) return res.status(403).json({ error: "Forbidden" });
  const newVal = row.shared ? 0 : 1;
  db.prepare("UPDATE drawings SET shared = ?, updated_at = ? WHERE id = ?")
    .run(newVal, new Date().toISOString(), req.params.id);
  res.json({ id: req.params.id, shared: !!newVal });
}));

// 13) Search by title (and optional tool type inside data)
app.get("/api/search", asyncWrap(async (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();
  const tool = (req.query.tool || "").toString().trim().toLowerCase();
  let rows = db.prepare("SELECT * FROM drawings WHERE title LIKE ? OR shared = 1 ORDER BY updated_at DESC")
               .all(`%${q}%`);
  if (tool) {
    rows = rows.filter(r => {
      try {
        const data = JSON.parse(r.data);
        return data.strokes.some(s => s.tool.toLowerCase() === tool);
      } catch {
        return false;
      }
    });
  }
  res.json(rows.map(r => ({ ...r, data: JSON.parse(r.data) })));
}));

// 14) 404 and error handlers
app.use((req, res, next) => {
  res.status(404).json({ error: "Route not found", route: req.originalUrl });
});
app.use((err, req, res, next) => {
  console.error("ERR:", err);
  res.status(500).json({ error: "Internal Server Error", details: process.env.NODE_ENV === "development" ? String(err) : undefined });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
