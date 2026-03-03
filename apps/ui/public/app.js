const LIMITS = {
  x: [-100, 100],
  y: [-100, 100],
  z: [-100, 100]
};

const OBJECT_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_OBJECT_TYPE = "point";
const DEFAULT_OBJECT_COLOR = "#1c4f89";

const CAMERA_DEFAULT = {
  yawDeg: 35,
  pitchDeg: 26,
  distance: 320,
  fovDeg: 56
};

const state = {
  status: null,
  selectedObjectId: null,
  currentPage: "panner",
  draggingObjectId: null,
  draggingMode: null,
  draggingPlaneY: 0,
  draggingStartY: 0,
  draggingStartPointerY: 0,
  orbiting: false,
  activePointerId: null,
  lastPointer: { x: 0, y: 0 },
  lastDragSendMs: 0,
  logs: [],
  camera: {
    yawDeg: CAMERA_DEFAULT.yawDeg,
    pitchDeg: CAMERA_DEFAULT.pitchDeg,
    distance: CAMERA_DEFAULT.distance,
    fovDeg: CAMERA_DEFAULT.fovDeg
  }
};

const els = {
  statusLine: document.getElementById("statusLine"),
  mainLayout: document.getElementById("mainLayout"),
  viewPannerBtn: document.getElementById("viewPannerBtn"),
  viewObjectManagerBtn: document.getElementById("viewObjectManagerBtn"),
  showPathInput: document.getElementById("showPathInput"),
  loadShowBtn: document.getElementById("loadShowBtn"),
  showInfo: document.getElementById("showInfo"),
  sceneButtons: document.getElementById("sceneButtons"),
  actionButtons: document.getElementById("actionButtons"),
  objectSelect: document.getElementById("objectSelect"),
  xInput: document.getElementById("xInput"),
  yInput: document.getElementById("yInput"),
  zInput: document.getElementById("zInput"),
  sizeInput: document.getElementById("sizeInput"),
  gainInput: document.getElementById("gainInput"),
  algorithmInput: document.getElementById("algorithmInput"),
  muteInput: document.getElementById("muteInput"),
  applyObjectBtn: document.getElementById("applyObjectBtn"),
  cameraYaw: document.getElementById("cameraYaw"),
  cameraPitch: document.getElementById("cameraPitch"),
  cameraDistance: document.getElementById("cameraDistance"),
  cameraResetBtn: document.getElementById("cameraResetBtn"),
  cameraReadout: document.getElementById("cameraReadout"),
  managerObjectCount: document.getElementById("managerObjectCount"),
  managerAddId: document.getElementById("managerAddId"),
  managerAddType: document.getElementById("managerAddType"),
  managerAddColor: document.getElementById("managerAddColor"),
  managerAddBtn: document.getElementById("managerAddBtn"),
  managerObjectSelect: document.getElementById("managerObjectSelect"),
  managerRenameInput: document.getElementById("managerRenameInput"),
  managerRenameBtn: document.getElementById("managerRenameBtn"),
  managerTypeInput: document.getElementById("managerTypeInput"),
  managerTypeBtn: document.getElementById("managerTypeBtn"),
  managerColorInput: document.getElementById("managerColorInput"),
  managerColorBtn: document.getElementById("managerColorBtn"),
  managerRemoveBtn: document.getElementById("managerRemoveBtn"),
  managerClearBtn: document.getElementById("managerClearBtn"),
  managerObjectRows: document.getElementById("managerObjectRows"),
  eventLog: document.getElementById("eventLog"),
  canvas: document.getElementById("pannerCanvas")
};

const ctx = els.canvas.getContext("2d");

function clampValue(value, [min, max]) {
  return Math.max(min, Math.min(max, value));
}

function normalizeYaw(deg) {
  let value = deg;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function degToRad(value) {
  return value * (Math.PI / 180);
}

function normalizeHexColor(value, fallback = DEFAULT_OBJECT_COLOR) {
  const candidate = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(candidate)) return candidate;
  return fallback;
}

function parseHexColor(hex) {
  const normalized = normalizeHexColor(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  const toPart = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toPart(r)}${toPart(g)}${toPart(b)}`;
}

function mixHex(colorA, colorB, ratio) {
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  const t = clampValue(ratio, [0, 1]);
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  );
}

function normalizeObjectId(raw) {
  let objectId = String(raw || "").trim();
  objectId = objectId.replace(/\s+/g, "-");
  objectId = objectId.replace(/[^A-Za-z0-9._-]/g, "-");
  objectId = objectId.replace(/-+/g, "-");
  objectId = objectId.replace(/^[-._]+/, "");
  objectId = objectId.replace(/[-._]+$/, "");
  if (objectId.length > 64) {
    objectId = objectId.slice(0, 64);
    objectId = objectId.replace(/[-._]+$/, "");
  }
  return objectId;
}

function uniqueObjectId(baseId) {
  const normalizedBase = normalizeObjectId(baseId) || "obj";
  const existing = new Set(getObjects().map((obj) => obj.objectId));

  if (!existing.has(normalizedBase)) {
    return normalizedBase;
  }

  let counter = 2;
  while (counter < 10000) {
    const suffix = `-${counter}`;
    const maxBaseLen = 64 - suffix.length;
    const trimmedBase = normalizedBase.slice(0, Math.max(1, maxBaseLen)).replace(/[-._]+$/, "") || "obj";
    const candidate = `${trimmedBase}${suffix}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }

  throw new Error("Could not generate a unique object ID");
}

function sanitizeObjectId(raw, options = {}) {
  const { allowAuto = false } = options;
  const normalized = normalizeObjectId(raw);
  const candidate = allowAuto ? uniqueObjectId(normalized || "obj") : normalized;

  if (!OBJECT_ID_RE.test(candidate)) {
    throw new Error("Object ID must use letters/numbers/dot/underscore/dash (max 64 chars)");
  }
  return candidate;
}

function vec(x, y, z) {
  return { x, y, z };
}

function addVec(a, b) {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function subVec(a, b) {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scaleVec(v, s) {
  return vec(v.x * s, v.y * s, v.z * s);
}

function dotVec(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVec(a, b) {
  return vec(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
}

function normalizeVec(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-7) return vec(0, 0, 0);
  return vec(v.x / len, v.y / len, v.z / len);
}

function addLog(line) {
  state.logs.push(line);
  while (state.logs.length > 160) state.logs.shift();
  els.eventLog.innerHTML = state.logs
    .map((entry) => `<div class="log-line">${escapeHtml(entry)}</div>`)
    .join("");
  els.eventLog.scrollTop = els.eventLog.scrollHeight;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

function getObjects() {
  return Array.isArray(state.status?.objects) ? state.status.objects : [];
}

function getSelectedObject() {
  const objects = getObjects();
  if (!state.selectedObjectId && objects[0]) {
    state.selectedObjectId = objects[0].objectId;
  }
  return objects.find((obj) => obj.objectId === state.selectedObjectId) || null;
}

function getObjectById(objectId) {
  return getObjects().find((obj) => obj.objectId === objectId) || null;
}

function syncCameraInputs() {
  els.cameraYaw.value = String(Math.round(state.camera.yawDeg));
  els.cameraPitch.value = String(Math.round(state.camera.pitchDeg));
  els.cameraDistance.value = String(Math.round(state.camera.distance));
  els.cameraReadout.textContent = `Yaw ${Math.round(state.camera.yawDeg)}°, Pitch ${Math.round(state.camera.pitchDeg)}°, Zoom ${Math.round(state.camera.distance)}`;
}

function setPage(nextPage) {
  state.currentPage = nextPage;
  els.mainLayout.dataset.page = nextPage;
  els.viewPannerBtn.classList.toggle("is-active", nextPage === "panner");
  els.viewObjectManagerBtn.classList.toggle("is-active", nextPage === "object-manager");
  els.viewPannerBtn.setAttribute("aria-selected", nextPage === "panner" ? "true" : "false");
  els.viewObjectManagerBtn.setAttribute("aria-selected", nextPage === "object-manager" ? "true" : "false");
  if (nextPage === "panner") {
    renderPanner();
  }
}

function getCameraBasis() {
  const yaw = degToRad(state.camera.yawDeg);
  const pitch = degToRad(state.camera.pitchDeg);
  const distance = state.camera.distance;

  const position = vec(
    Math.sin(yaw) * Math.cos(pitch) * distance,
    Math.sin(pitch) * distance,
    Math.cos(yaw) * Math.cos(pitch) * distance
  );

  const target = vec(0, 0, 0);
  const forward = normalizeVec(subVec(target, position));
  const worldUp = vec(0, 1, 0);

  let right = normalizeVec(crossVec(forward, worldUp));
  if (Math.hypot(right.x, right.y, right.z) < 1e-6) {
    right = vec(1, 0, 0);
  }
  const up = normalizeVec(crossVec(right, forward));

  const focal = (els.canvas.height / 2) / Math.tan(degToRad(state.camera.fovDeg) / 2);
  return { position, forward, right, up, focal };
}

function projectPoint(camera, point) {
  const relative = subVec(point, camera.position);
  const xCamera = dotVec(relative, camera.right);
  const yCamera = dotVec(relative, camera.up);
  const zCamera = dotVec(relative, camera.forward);

  if (zCamera <= 0.5) return null;

  return {
    x: els.canvas.width / 2 + (xCamera * camera.focal) / zCamera,
    y: els.canvas.height / 2 - (yCamera * camera.focal) / zCamera,
    depth: zCamera
  };
}

function screenRay(camera, sx, sy) {
  const x = (sx - els.canvas.width / 2) / camera.focal;
  const y = -(sy - els.canvas.height / 2) / camera.focal;
  const direction = normalizeVec(
    addVec(
      camera.forward,
      addVec(scaleVec(camera.right, x), scaleVec(camera.up, y))
    )
  );

  return { origin: camera.position, direction };
}

function intersectRayPlaneY(ray, planeY) {
  const denom = ray.direction.y;
  if (Math.abs(denom) < 1e-6) return null;

  const t = (planeY - ray.origin.y) / denom;
  if (t <= 0) return null;

  return addVec(ray.origin, scaleVec(ray.direction, t));
}

function resizeCanvasToDisplaySize() {
  const rect = els.canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(240, Math.round(rect.height));

  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
    return true;
  }

  return false;
}

function drawLine3D(camera, a, b, color, width = 1, alpha = 1) {
  const pa = projectPoint(camera, a);
  const pb = projectPoint(camera, b);
  if (!pa || !pb) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
  ctx.restore();
}

function drawGroundGrid(camera) {
  for (let i = -100; i <= 100; i += 20) {
    const alpha = i === 0 ? 0.6 : 0.24;
    const color = i === 0 ? "#5f758a" : "#8aa0b5";
    drawLine3D(camera, vec(i, -100, -100), vec(i, -100, 100), color, 1, alpha);
    drawLine3D(camera, vec(-100, -100, i), vec(100, -100, i), color, 1, alpha);
  }
}

function drawRoomBox(camera) {
  const corners = [
    vec(-100, -100, -100),
    vec(100, -100, -100),
    vec(100, -100, 100),
    vec(-100, -100, 100),
    vec(-100, 100, -100),
    vec(100, 100, -100),
    vec(100, 100, 100),
    vec(-100, 100, 100)
  ];

  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  for (const [a, b] of edges) {
    drawLine3D(camera, corners[a], corners[b], "#8ea3b5", 1.2, 0.5);
  }
}

function drawAxes(camera) {
  drawLine3D(camera, vec(-110, 0, 0), vec(110, 0, 0), "#b44747", 2, 0.85);
  drawLine3D(camera, vec(0, -110, 0), vec(0, 110, 0), "#348057", 2, 0.85);
  drawLine3D(camera, vec(0, 0, -110), vec(0, 0, 110), "#356aa8", 2, 0.85);
}

function objectRadiusPx(obj, depth) {
  const size = Number(obj.size || 0);
  const base = 8 + size * 0.2;
  return clampValue(base * (240 / depth), [4, 30]);
}

function pickObject(canvasPoint) {
  const camera = getCameraBasis();
  let best = null;
  let bestDist = Infinity;

  for (const obj of getObjects()) {
    const projected = projectPoint(camera, vec(Number(obj.x), Number(obj.y), Number(obj.z)));
    if (!projected) continue;

    const radius = objectRadiusPx(obj, projected.depth);
    const dist = Math.hypot(canvasPoint.x - projected.x, canvasPoint.y - projected.y);

    if (dist <= radius + 10 && dist < bestDist) {
      best = { obj, projected, radius };
      bestDist = dist;
    }
  }

  return best;
}

function renderPanner() {
  if (state.currentPage !== "panner") return;

  resizeCanvasToDisplaySize();

  const w = els.canvas.width;
  const h = els.canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#f7fbff");
  gradient.addColorStop(1, "#d4e0ea");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const camera = getCameraBasis();
  drawGroundGrid(camera);
  drawRoomBox(camera);
  drawAxes(camera);

  const renderables = [];
  for (const obj of getObjects()) {
    const x = Number(obj.x);
    const y = Number(obj.y);
    const z = Number(obj.z);
    const projected = projectPoint(camera, vec(x, y, z));
    if (!projected) continue;

    const floorProjected = projectPoint(camera, vec(x, -100, z));
    renderables.push({
      obj,
      projected,
      floorProjected,
      radius: objectRadiusPx(obj, projected.depth)
    });
  }

  renderables.sort((a, b) => b.projected.depth - a.projected.depth);

  for (const item of renderables) {
    const isSelected = item.obj.objectId === state.selectedObjectId;

    if (item.floorProjected) {
      const shadowRadius = Math.max(5, item.radius * 0.9);
      ctx.save();
      ctx.fillStyle = "#00000024";
      ctx.beginPath();
      ctx.ellipse(item.floorProjected.x, item.floorProjected.y, shadowRadius * 1.2, shadowRadius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawLine3D(
        camera,
        vec(Number(item.obj.x), Number(item.obj.y), Number(item.obj.z)),
        vec(Number(item.obj.x), -100, Number(item.obj.z)),
        "#7f94a8",
        1,
        0.36
      );
    }

    const cx = item.projected.x;
    const cy = item.projected.y;
    const radius = item.radius;
    const baseColor = normalizeHexColor(item.obj.color, DEFAULT_OBJECT_COLOR);
    const colorOuter = isSelected ? mixHex(baseColor, "#003f3b", 0.38) : mixHex(baseColor, "#14253b", 0.52);
    const colorInner = isSelected ? mixHex(baseColor, "#ffffff", 0.52) : mixHex(baseColor, "#ffffff", 0.28);

    const fill = ctx.createRadialGradient(
      cx - radius * 0.35,
      cy - radius * 0.45,
      radius * 0.2,
      cx,
      cy,
      radius * 1.1
    );

    fill.addColorStop(0, colorInner);
    fill.addColorStop(1, colorOuter);

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = "#003f3b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (item.obj.mute) {
      ctx.strokeStyle = "#972d2d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.7, cy - radius * 0.7);
      ctx.lineTo(cx + radius * 0.7, cy + radius * 0.7);
      ctx.moveTo(cx + radius * 0.7, cy - radius * 0.7);
      ctx.lineTo(cx - radius * 0.7, cy + radius * 0.7);
      ctx.stroke();
    }

    const typeText = String(item.obj.type || DEFAULT_OBJECT_TYPE);
    const label = `${item.obj.objectId} [${typeText}] (${Number(item.obj.x).toFixed(1)}, ${Number(item.obj.y).toFixed(1)}, ${Number(item.obj.z).toFixed(1)})`;
    ctx.font = "12px IBM Plex Sans, sans-serif";
    const tw = ctx.measureText(label).width;
    const tx = cx + radius + 6;
    const ty = cy - radius - 6;

    ctx.fillStyle = "#ffffffd8";
    ctx.fillRect(tx - 4, ty - 12, tw + 8, 16);
    ctx.fillStyle = "#102538";
    ctx.fillText(label, tx, ty);
  }

  ctx.fillStyle = "#385067";
  ctx.font = "12px IBM Plex Sans, sans-serif";
  ctx.fillText("X axis: red | Y axis: green | Z axis: blue", 12, 20);
}

function renderStatusLine() {
  const status = state.status;
  if (!status) {
    els.statusLine.textContent = "Connecting...";
    return;
  }

  els.statusLine.textContent = `Mode: ${status.mode} | Scene: ${status.activeSceneId || "-"} | OSC out/in: ${status.osc.outboundCount}/${status.osc.inboundCount} | HTTP ${status.server.host}:${status.server.httpPort}`;
}

function renderShowControls() {
  const status = state.status;
  if (!status?.show) {
    els.showInfo.textContent = "No show loaded";
    els.sceneButtons.innerHTML = "";
    els.actionButtons.innerHTML = "";
    return;
  }

  els.showInfo.textContent = `${status.show.name} (${status.show.version}) - ${status.show.path}`;

  els.sceneButtons.innerHTML = "";
  for (const sceneId of status.show.sceneIds) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = sceneId;

    if (sceneId === status.activeSceneId) {
      btn.style.borderColor = "var(--accent)";
      btn.style.fontWeight = "700";
    }

    btn.addEventListener("click", async () => {
      try {
        await api(`/api/scene/${encodeURIComponent(sceneId)}/recall`, "POST", {});
        addLog(`scene recall -> ${sceneId}`);
        await refreshStatus();
      } catch (error) {
        addLog(`scene recall failed: ${error.message}`);
      }
    });

    els.sceneButtons.appendChild(btn);
  }

  els.actionButtons.innerHTML = "";
  for (const actionId of status.show.actionIds) {
    const row = document.createElement("div");
    row.className = "action-chip";

    const title = document.createElement("strong");
    title.textContent = actionId;
    row.appendChild(title);

    const start = document.createElement("button");
    start.type = "button";
    start.textContent = "Start";
    start.addEventListener("click", () => runAction(actionId, "start"));
    row.appendChild(start);

    const stop = document.createElement("button");
    stop.type = "button";
    stop.textContent = "Stop";
    stop.addEventListener("click", () => runAction(actionId, "stop"));
    row.appendChild(stop);

    const abort = document.createElement("button");
    abort.type = "button";
    abort.textContent = "Abort";
    abort.className = "danger";
    abort.addEventListener("click", () => runAction(actionId, "abort"));
    row.appendChild(abort);

    els.actionButtons.appendChild(row);
  }
}

async function runAction(actionId, command) {
  try {
    await api(`/api/action/${encodeURIComponent(actionId)}/${command}`, "POST", {});
    addLog(`action ${command} -> ${actionId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action ${command} failed for ${actionId}: ${error.message}`);
  }
}

function renderObjectSelect() {
  const objects = getObjects();
  els.objectSelect.innerHTML = "";

  for (const obj of objects) {
    const option = document.createElement("option");
    option.value = obj.objectId;
    option.textContent = obj.objectId;
    if (obj.objectId === state.selectedObjectId) option.selected = true;
    els.objectSelect.appendChild(option);
  }

  if (!objects.find((obj) => obj.objectId === state.selectedObjectId)) {
    state.selectedObjectId = objects[0] ? objects[0].objectId : null;
  }
}

function renderInspector() {
  const obj = getSelectedObject();
  if (!obj) {
    for (const input of [els.xInput, els.yInput, els.zInput, els.sizeInput, els.gainInput, els.algorithmInput]) {
      input.value = "";
    }
    els.muteInput.checked = false;
    return;
  }

  els.xInput.value = String(Number(obj.x).toFixed(2));
  els.yInput.value = String(Number(obj.y).toFixed(2));
  els.zInput.value = String(Number(obj.z).toFixed(2));
  els.sizeInput.value = String(Number(obj.size).toFixed(2));
  els.gainInput.value = String(Number(obj.gain).toFixed(2));
  els.algorithmInput.value = String(obj.algorithm || "default");
  els.muteInput.checked = Boolean(obj.mute);
}

function renderManager() {
  const objects = getObjects();
  els.managerObjectCount.textContent = `${objects.length} object${objects.length === 1 ? "" : "s"}`;

  els.managerObjectSelect.innerHTML = "";
  for (const obj of objects) {
    const opt = document.createElement("option");
    opt.value = obj.objectId;
    opt.textContent = obj.objectId;
    if (obj.objectId === state.selectedObjectId) opt.selected = true;
    els.managerObjectSelect.appendChild(opt);
  }

  const selected = getSelectedObject();
  if (selected) {
    els.managerRenameInput.value = selected.objectId;
    els.managerTypeInput.value = String(selected.type || DEFAULT_OBJECT_TYPE);
    els.managerColorInput.value = normalizeHexColor(selected.color, DEFAULT_OBJECT_COLOR);
  } else {
    els.managerRenameInput.value = "";
    els.managerTypeInput.value = DEFAULT_OBJECT_TYPE;
    els.managerColorInput.value = DEFAULT_OBJECT_COLOR;
  }

  els.managerObjectRows.innerHTML = "";
  for (const obj of objects) {
    const row = document.createElement("tr");
    if (obj.objectId === state.selectedObjectId) row.classList.add("is-selected");

    const positionText = `${Number(obj.x).toFixed(1)}, ${Number(obj.y).toFixed(1)}, ${Number(obj.z).toFixed(1)}`;
    const color = normalizeHexColor(obj.color, DEFAULT_OBJECT_COLOR);

    row.innerHTML = `
      <td>${escapeHtml(obj.objectId)}</td>
      <td>${escapeHtml(String(obj.type || DEFAULT_OBJECT_TYPE))}</td>
      <td><span class="color-chip" style="background:${escapeHtml(color)}"></span>${escapeHtml(color)}</td>
      <td>${escapeHtml(positionText)}</td>
    `;

    row.addEventListener("click", () => {
      state.selectedObjectId = obj.objectId;
      renderAll();
    });

    els.managerObjectRows.appendChild(row);
  }
}

function renderAll() {
  renderStatusLine();
  renderShowControls();
  renderObjectSelect();
  renderInspector();
  renderManager();
  syncCameraInputs();
  renderPanner();
}

async function refreshStatus() {
  try {
    state.status = await api("/api/status");
    const objects = getObjects();
    if (!objects.find((obj) => obj.objectId === state.selectedObjectId)) {
      state.selectedObjectId = objects[0] ? objects[0].objectId : null;
    }
    renderAll();
  } catch (error) {
    els.statusLine.textContent = `Status request failed: ${error.message}`;
  }
}

async function pushObjectPatch(objectId, patch) {
  if (!objectId) return;
  try {
    await api(`/api/object/${encodeURIComponent(objectId)}`, "POST", patch);
  } catch (error) {
    addLog(`object update failed (${objectId}): ${error.message}`);
  }
}

function selectedObjectPatchFromInputs() {
  return {
    x: Number(els.xInput.value),
    y: Number(els.yInput.value),
    z: Number(els.zInput.value),
    size: Number(els.sizeInput.value),
    gain: Number(els.gainInput.value),
    mute: Boolean(els.muteInput.checked),
    algorithm: String(els.algorithmInput.value || "default")
  };
}

function toCanvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  const sx = els.canvas.width / rect.width;
  const sy = els.canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * sx,
    y: (event.clientY - rect.top) * sy
  };
}

function maybeSendDragPatch(objectId, patch) {
  const now = Date.now();
  if (now - state.lastDragSendMs > 70) {
    state.lastDragSendMs = now;
    void pushObjectPatch(objectId, patch);
  }
}

async function finalizePointerInteraction() {
  if (state.draggingObjectId) {
    const obj = getObjectById(state.draggingObjectId);
    if (obj) {
      await pushObjectPatch(state.draggingObjectId, {
        x: Number(obj.x),
        y: Number(obj.y),
        z: Number(obj.z)
      });
      await refreshStatus();
    }
  }

  state.draggingObjectId = null;
  state.draggingMode = null;
  state.orbiting = false;
  state.activePointerId = null;
}

async function managerAddObject() {
  try {
    const rawObjectId = els.managerAddId.value;
    const objectId = sanitizeObjectId(rawObjectId, { allowAuto: true });
    const objectType = String(els.managerAddType.value || DEFAULT_OBJECT_TYPE).trim() || DEFAULT_OBJECT_TYPE;
    const objectColor = normalizeHexColor(els.managerAddColor.value, DEFAULT_OBJECT_COLOR);
    await api("/api/object/add", "POST", {
      objectId,
      type: objectType,
      color: objectColor
    });
    if (String(rawObjectId || "").trim() !== objectId) {
      addLog(`object id normalized -> ${objectId}`);
    }
    els.managerAddId.value = objectId;
    state.selectedObjectId = objectId;
    addLog(`object add -> ${objectId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`object add failed: ${error.message}`);
  }
}

async function managerRenameObject() {
  try {
    const currentId = state.selectedObjectId;
    if (!currentId) {
      throw new Error("No object selected");
    }
    const newObjectId = sanitizeObjectId(els.managerRenameInput.value);
    await api(`/api/object/${encodeURIComponent(currentId)}/rename`, "POST", { newObjectId });
    state.selectedObjectId = newObjectId;
    addLog(`object rename -> ${currentId} to ${newObjectId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`object rename failed: ${error.message}`);
  }
}

async function managerSetType() {
  try {
    const objectId = state.selectedObjectId;
    if (!objectId) {
      throw new Error("No object selected");
    }
    const type = String(els.managerTypeInput.value || DEFAULT_OBJECT_TYPE).trim() || DEFAULT_OBJECT_TYPE;
    await api(`/api/object/${encodeURIComponent(objectId)}`, "POST", { type });
    addLog(`object type set -> ${objectId} = ${type}`);
    await refreshStatus();
  } catch (error) {
    addLog(`set type failed: ${error.message}`);
  }
}

async function managerSetColor() {
  try {
    const objectId = state.selectedObjectId;
    if (!objectId) {
      throw new Error("No object selected");
    }
    const color = normalizeHexColor(els.managerColorInput.value, DEFAULT_OBJECT_COLOR);
    await api(`/api/object/${encodeURIComponent(objectId)}`, "POST", { color });
    addLog(`object color set -> ${objectId} = ${color}`);
    await refreshStatus();
  } catch (error) {
    addLog(`set color failed: ${error.message}`);
  }
}

async function managerRemoveSelected() {
  try {
    const objectId = state.selectedObjectId;
    if (!objectId) {
      throw new Error("No object selected");
    }
    await api(`/api/object/${encodeURIComponent(objectId)}/remove`, "POST", {});
    addLog(`object remove -> ${objectId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`remove failed: ${error.message}`);
  }
}

async function managerClearAll() {
  if (!confirm("Clear all objects from current runtime state?")) {
    return;
  }
  try {
    await api("/api/object/clear", "POST", {});
    state.selectedObjectId = null;
    addLog("object clear -> all");
    await refreshStatus();
  } catch (error) {
    addLog(`clear failed: ${error.message}`);
  }
}

function setupHandlers() {
  els.viewPannerBtn.addEventListener("click", () => {
    setPage("panner");
  });

  els.viewObjectManagerBtn.addEventListener("click", () => {
    setPage("object-manager");
  });

  els.loadShowBtn.addEventListener("click", async () => {
    try {
      const showPath = els.showPathInput.value.trim();
      await api("/api/show/load", "POST", { path: showPath });
      addLog(`show loaded -> ${showPath}`);
      await refreshStatus();
    } catch (error) {
      addLog(`show load failed: ${error.message}`);
    }
  });

  els.objectSelect.addEventListener("change", () => {
    state.selectedObjectId = els.objectSelect.value;
    renderAll();
  });

  els.applyObjectBtn.addEventListener("click", async () => {
    const id = state.selectedObjectId;
    if (!id) return;
    await pushObjectPatch(id, selectedObjectPatchFromInputs());
    await refreshStatus();
  });

  els.managerObjectSelect.addEventListener("change", () => {
    state.selectedObjectId = els.managerObjectSelect.value;
    renderAll();
  });

  els.managerAddBtn.addEventListener("click", () => {
    void managerAddObject();
  });

  els.managerRenameBtn.addEventListener("click", () => {
    void managerRenameObject();
  });

  els.managerTypeBtn.addEventListener("click", () => {
    void managerSetType();
  });

  els.managerColorBtn.addEventListener("click", () => {
    void managerSetColor();
  });

  els.managerRemoveBtn.addEventListener("click", () => {
    void managerRemoveSelected();
  });

  els.managerClearBtn.addEventListener("click", () => {
    void managerClearAll();
  });

  const cameraInputHandler = () => {
    state.camera.yawDeg = normalizeYaw(Number(els.cameraYaw.value));
    state.camera.pitchDeg = clampValue(Number(els.cameraPitch.value), [8, 80]);
    state.camera.distance = clampValue(Number(els.cameraDistance.value), [140, 720]);
    syncCameraInputs();
    renderPanner();
  };

  els.cameraYaw.addEventListener("input", cameraInputHandler);
  els.cameraPitch.addEventListener("input", cameraInputHandler);
  els.cameraDistance.addEventListener("input", cameraInputHandler);

  els.cameraResetBtn.addEventListener("click", () => {
    state.camera.yawDeg = CAMERA_DEFAULT.yawDeg;
    state.camera.pitchDeg = CAMERA_DEFAULT.pitchDeg;
    state.camera.distance = CAMERA_DEFAULT.distance;
    syncCameraInputs();
    renderPanner();
  });

  els.canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  els.canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.camera.distance = clampValue(state.camera.distance + event.deltaY * 0.3, [140, 720]);
    syncCameraInputs();
    renderPanner();
  }, { passive: false });

  els.canvas.addEventListener("pointerdown", (event) => {
    if (state.currentPage !== "panner") return;

    const pt = toCanvasPoint(event);
    state.activePointerId = event.pointerId;
    state.lastPointer = pt;

    const hit = pickObject(pt);
    if (hit && event.button !== 2) {
      state.draggingObjectId = hit.obj.objectId;
      state.draggingMode = event.shiftKey ? "y" : "xz";
      state.draggingPlaneY = Number(hit.obj.y);
      state.draggingStartY = Number(hit.obj.y);
      state.draggingStartPointerY = pt.y;
      state.orbiting = false;
      state.selectedObjectId = hit.obj.objectId;
      renderAll();
    } else {
      state.draggingObjectId = null;
      state.draggingMode = null;
      state.orbiting = true;
    }

    els.canvas.setPointerCapture(event.pointerId);
    renderPanner();
  });

  els.canvas.addEventListener("pointermove", (event) => {
    if (state.currentPage !== "panner") return;
    if (state.activePointerId !== event.pointerId) return;

    const pt = toCanvasPoint(event);
    const dx = pt.x - state.lastPointer.x;
    const dy = pt.y - state.lastPointer.y;

    if (state.draggingObjectId) {
      const obj = getObjectById(state.draggingObjectId);
      if (!obj) return;

      const wantedMode = event.shiftKey ? "y" : "xz";
      if (state.draggingMode !== wantedMode) {
        state.draggingMode = wantedMode;
        state.draggingStartY = Number(obj.y);
        state.draggingStartPointerY = pt.y;
        state.draggingPlaneY = Number(obj.y);
      }

      if (state.draggingMode === "y") {
        const nextY = clampValue(state.draggingStartY - (pt.y - state.draggingStartPointerY) * 0.6, LIMITS.y);
        obj.y = nextY;
        renderInspector();
        renderManager();
        renderPanner();
        maybeSendDragPatch(state.draggingObjectId, { y: nextY });
      } else {
        const camera = getCameraBasis();
        const ray = screenRay(camera, pt.x, pt.y);
        const hit = intersectRayPlaneY(ray, state.draggingPlaneY);
        if (hit) {
          const nextX = clampValue(hit.x, LIMITS.x);
          const nextZ = clampValue(hit.z, LIMITS.z);
          obj.x = nextX;
          obj.z = nextZ;
          renderInspector();
          renderManager();
          renderPanner();
          maybeSendDragPatch(state.draggingObjectId, { x: nextX, z: nextZ });
        }
      }
    } else if (state.orbiting) {
      state.camera.yawDeg = normalizeYaw(state.camera.yawDeg + dx * 0.25);
      state.camera.pitchDeg = clampValue(state.camera.pitchDeg - dy * 0.2, [8, 80]);
      syncCameraInputs();
      renderPanner();
    }

    state.lastPointer = pt;
  });

  els.canvas.addEventListener("pointerup", async (event) => {
    if (state.currentPage !== "panner") return;
    if (state.activePointerId !== event.pointerId) return;
    await finalizePointerInteraction();
  });

  els.canvas.addEventListener("pointercancel", async (event) => {
    if (state.currentPage !== "panner") return;
    if (state.activePointerId !== event.pointerId) return;
    await finalizePointerInteraction();
  });

  window.addEventListener("resize", () => {
    renderPanner();
  });
}

function setupEventStream() {
  const events = new EventSource("/api/events");
  const types = ["status", "show", "scene", "object", "object_manager", "action", "osc_in", "osc_out", "osc_error", "system"];

  for (const type of types) {
    events.addEventListener(type, (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        addLog(`${parsed.at} [${parsed.type}] ${JSON.stringify(parsed.payload)}`);
      } catch {
        addLog(`[${type}] ${ev.data}`);
      }
    });
  }

  events.onerror = () => {
    addLog("event stream disconnected, retrying...");
  };
}

async function start() {
  syncCameraInputs();
  setPage("panner");
  setupHandlers();
  setupEventStream();
  await refreshStatus();

  setInterval(() => {
    if (!state.draggingObjectId && !state.orbiting) {
      void refreshStatus();
    }
  }, 1000);
}

start();
