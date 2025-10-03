// Canvas drawing logic with JSON stroke model and simple undo/redo
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
let drawing = false;
let currentStroke = null;
let strokes = [];
let undone = [];

const toolSel = document.getElementById("tool");
const sizeSel = document.getElementById("size");
const colorSel = document.getElementById("color");
const clearBtn = document.getElementById("clearBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const modelPreview = document.getElementById("modelPreview");
const titleInput = document.getElementById("title");
const saveBtn = document.getElementById("saveBtn");
const exportBtn = document.getElementById("exportBtn");
const jsonBtn = document.getElementById("jsonBtn");
const galleryGrid = document.getElementById("galleryGrid");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const userIndicator = document.getElementById("userIndicator");

const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const authUser = document.getElementById("authUser");
const authPass = document.getElementById("authPass");

function toJSONModel() {
  const data = {
    strokes: strokes,
    width: canvas.width,
    height: canvas.height,
  };
  modelPreview.textContent = JSON.stringify(data, null, 2);
  return data;
}

function drawStroke(s) {
  ctx.save();
  if (s.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
  } else {
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.size;
  ctx.strokeStyle = s.color;

  if (["pen", "eraser", "line"].includes(s.tool)) {
    ctx.beginPath();
    const pts = s.points;
    if (pts.length === 1) {
      const [x, y] = pts[0];
      ctx.arc(x, y, s.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    } else {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.stroke();
    }
  } else if (s.tool === "rect" && s.points.length >= 2) {
    const [x0, y0] = s.points[0];
    const [x1, y1] = s.points[s.points.length - 1];
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  } else if (s.tool === "circle" && s.points.length >= 2) {
    const [x0, y0] = s.points[0];
    const [x1, y1] = s.points[s.points.length - 1];
    const r = Math.hypot(x1 - x0, y1 - y0);
    ctx.beginPath();
    ctx.arc(x0, y0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function redrawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach(drawStroke);
  toJSONModel();
}

canvas.addEventListener("pointerdown", (e) => {
  drawing = true;
  undone = [];
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  currentStroke = {
    tool: toolSel.value,
    color: colorSel.value,
    size: Number(sizeSel.value),
    points: [[x, y]],
  };
  strokes.push(currentStroke);
  redrawAll();
});
canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  currentStroke.points.push([x, y]);
  redrawAll();
});
window.addEventListener("pointerup", () => {
  drawing = false;
  currentStroke = null;
});

clearBtn.addEventListener("click", () => {
  strokes = [];
  undone = [];
  redrawAll();
});
undoBtn.addEventListener("click", () => {
  if (strokes.length) {
    undone.push(strokes.pop());
    redrawAll();
  }
});
redoBtn.addEventListener("click", () => {
  if (undone.length) {
    strokes.push(undone.pop());
    redrawAll();
  }
});

exportBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = (titleInput.value || "drawing") + ".png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});
jsonBtn.addEventListener("click", () => {
  alert(modelPreview.textContent);
});

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

saveBtn.addEventListener("click", async () => {
  try {
    if (!titleInput.value.trim()) return alert("Please enter a title");
    const body = {
      title: titleInput.value.trim(),
      data: toJSONModel(),
      shared: true,
    };
    const out = await api("/api/drawings", { method: "POST", body: JSON.stringify(body) });
    alert("Saved with id " + out.id);
    await loadGallery();
  } catch (e) {
    alert("Save failed: " + e.message);
  }
});

async function loadGallery(q = "") {
  let items;
  if (q) {
    items = await api(`/api/search?q=${encodeURIComponent(q)}`);
  } else {
    items = await api("/api/drawings");
  }
  galleryGrid.innerHTML = "";
  for (const d of items) {
    const col = document.createElement("div");
    col.className = "col-md-4";
    const card = document.createElement("div");
    card.className = "card h-100 shadow-sm";
    const canvasEl = document.createElement("canvas");
    canvasEl.width = 600; canvasEl.height = 360;
    canvasEl.className = "w-100 border-bottom";
    const cctx = canvasEl.getContext("2d");
    // replay strokes
    d.data.strokes.forEach(s => drawStroke.call({ ctx: cctx }, s)); // reuse
    // hack: bind drawStroke to local ctx
    function drawStrokeLocal(s) {
      const SAVED = ctx;
    }
    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `<h5 class="card-title">${d.title}</h5>
    <p class="card-text small text-muted">Tools used: ${[...new Set(d.data.strokes.map(s=>s.tool))].join(", ")}</p>
    <div class="d-flex gap-2">
      <a class="btn btn-sm btn-outline-primary" href="/api/drawings/${d.id}" target="_blank">JSON</a>
    </div>`;
    card.appendChild(canvasEl);
    card.appendChild(body);
    col.appendChild(card);
    galleryGrid.appendChild(col);

    // replay with local context
    const tempCtx = canvasEl.getContext("2d");
    tempCtx.lineCap = "round"; tempCtx.lineJoin = "round";
    for (const s of d.data.strokes) {
      // minimal re-implementation for cards
      tempCtx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";
      tempCtx.lineWidth = s.size; tempCtx.strokeStyle = s.color;
      if (["pen", "eraser", "line"].includes(s.tool)) {
        tempCtx.beginPath();
        const pts = s.points;
        if (pts.length === 1) {
          const [x,y] = pts[0];
          tempCtx.arc(x,y,s.size/2,0,Math.PI*2);
          tempCtx.fillStyle = s.color;
          tempCtx.fill();
        } else {
          tempCtx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) tempCtx.lineTo(pts[i][0], pts[i][1]);
          tempCtx.stroke();
        }
      } else if (s.tool === "rect" && s.points.length >= 2) {
        const [x0,y0] = s.points[0];
        const [x1,y1] = s.points[s.points.length-1];
        tempCtx.strokeRect(x0,y0,x1-x0,y1-y0);
      } else if (s.tool === "circle" && s.points.length >= 2) {
        const [x0,y0] = s.points[0];
        const [x1,y1] = s.points[s.points.length-1];
        const r = Math.hypot(x1-x0,y1-y0);
        tempCtx.beginPath(); tempCtx.arc(x0,y0,r,0,Math.PI*2); tempCtx.stroke();
      }
    }
  }
}

searchBtn.addEventListener("click", () => loadGallery(searchInput.value.trim()));

// --- Auth ---
async function refreshMe() {
  const me = await api("/auth/me").catch(()=>({ user: null }));
  if (me.user) userIndicator.textContent = `Signed in as ${me.user.username}`;
  else userIndicator.textContent = "Not signed in";
}
loginBtn.addEventListener("click", async () => {
  try {
    await api("/auth/login", { method: "POST", body: JSON.stringify({ username: authUser.value, password: authPass.value }) });
    await refreshMe();
    bootstrap.Modal.getInstance(document.getElementById('authModal'))?.hide();
    await loadGallery();
  } catch (e) { alert(e.message); }
});
registerBtn.addEventListener("click", async () => {
  try {
    await api("/auth/register", { method: "POST", body: JSON.stringify({ username: authUser.value, password: authPass.value }) });
    await api("/auth/login", { method: "POST", body: JSON.stringify({ username: authUser.value, password: authPass.value }) });
    await refreshMe();
    bootstrap.Modal.getInstance(document.getElementById('authModal'))?.hide();
  } catch (e) { alert(e.message); }
});

// init
refreshMe();
loadGallery();
redrawAll();
