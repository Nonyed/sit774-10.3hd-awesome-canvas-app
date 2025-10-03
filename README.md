# SIT774 10.3HD — Complete Awesome Website

This repo contains a **Canvas drawing web app** that demonstrates:

- Advanced UI element: HTML5 `<canvas>` (plus pointer interactions, undo/redo, PNG export)
- Extended UI styling & interactions: Bootstrap 5, parallax hero, responsive cards
- **More complex Express routing** (14+ routes) and **enhanced error handling**
- **Dynamic JSON content**: drawing serialized to pure text (JSON) and sent to server
- **Permanent storage** using SQLite (`better-sqlite3`)
- **Optional secure auth**: bcrypt password hashing + server sessions (no plain-text)

> Built to satisfy SIT774 Task 10.3HD requirements. See the `Submission.pdf` for an overview.

---

## Quick start (macOS + VS Code)

1. **Install Node.js 18+** (check with `node -v`).
2. Open this folder in VS Code.
3. In the integrated terminal:
   ```bash
   npm install
   npm run start
   ```
4. Visit <http://localhost:3000> in your browser.

To auto-restart on save:

```bash
npm run dev
```

> The first run will create `db/app.db` and the required tables.

---

## Tech choices

- **Express** for routes + centralised error handling.
- **better-sqlite3** for simple, durable, zero-config DB.
- **zod** for input validation on all write endpoints.
- **express-session** + **bcrypt** for secure auth.
- **Bootstrap 5** for UI.

---

## API overview (selected)

- `GET /api/health` – health check
- `GET /api/version` – app meta
- `POST /auth/register` – create user (bcrypt-hashed)
- `POST /auth/login` / `POST /auth/logout` / `GET /auth/me`
- `POST /api/drawings` – create (auth required)
- `GET /api/drawings` – list (own + shared)
- `GET /api/drawings/:id` – fetch by id
- `PUT /api/drawings/:id` – update
- `DELETE /api/drawings/:id` – delete
- `POST /api/drawings/:id/share` – toggle shared
- `GET /api/search?q=term[&tool=pen]` – search titles (+ optional tool filter)

Payload example (text-only JSON model):
```json
{
  "title": "Sunset study",
  "data": {
    "strokes": [
      {"tool":"pen","color":"#222","size":6,"points":[[10,10],[50,60]]}
    ],
    "width": 1000,
    "height": 600
  },
  "shared": true
}
```

---

## Assessment links (fill in before submitting)

- **GitHub repository**: _add your repo URL here_
- **Panopto video (≤10 min)**: _add your Panopto link here_

---

## License

MIT
