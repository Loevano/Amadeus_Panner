const LIMITS = {
  x: [-100, 100],
  y: [-100, 100],
  z: [-100, 100]
};

const OBJECT_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_OBJECT_TYPE = "point";
const DEFAULT_OBJECT_COLOR = "#1c4f89";
const RELATIVE_GROUP_PARAMS = new Set(["x", "y", "z"]);
const VIRTUAL_ALL_GROUP_ID = "all";
const VIRTUAL_ALL_GROUP_NAME = "All";

const CAMERA_DEFAULT = {
  yawDeg: 35,
  pitchDeg: 26,
  distance: 320,
  fovDeg: 56
};

const state = {
  status: null,
  selectedObjectId: null,
  selectedObjectIds: [],
  selectedGroupId: null,
  selectedSceneId: null,
  currentPage: "panner",
  draggingObjectId: null,
  draggingObjectIds: [],
  draggingMode: null,
  draggingPlaneY: 0,
  draggingStartY: 0,
  draggingStartPointerY: 0,
  draggingOffsetXZ: { x: 0, z: 0 },
  draggingRelativeXZ: {},
  draggingRelativeY: {},
  dragSingleObjectOnly: false,
  lastDragSendMs: 0,
  orbiting: false,
  activePointerId: null,
  pointerDownHitObjectId: null,
  lastPointer: { x: 0, y: 0 },
  availableShowPaths: [],
  selectionBox: {
    active: false,
    additive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    baseSelection: []
  },
  debugEventsEnabled: true,
  eventSource: null,
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
  uiStatusBar: document.getElementById("uiStatusBar"),
  mainLayout: document.getElementById("mainLayout"),
  viewPannerBtn: document.getElementById("viewPannerBtn"),
  viewObjectManagerBtn: document.getElementById("viewObjectManagerBtn"),
  showPathInput: document.getElementById("showPathInput"),
  loadShowBtn: document.getElementById("loadShowBtn"),
  saveShowBtn: document.getElementById("saveShowBtn"),
  saveShowAsBtn: document.getElementById("saveShowAsBtn"),
  newShowBtn: document.getElementById("newShowBtn"),
  showInfo: document.getElementById("showInfo"),
  sceneSelectInput: document.getElementById("sceneSelectInput"),
  loadSceneBtn: document.getElementById("loadSceneBtn"),
  saveSceneBtn: document.getElementById("saveSceneBtn"),
  saveSceneAsBtn: document.getElementById("saveSceneAsBtn"),
  sceneButtons: document.getElementById("sceneButtons"),
  actionButtons: document.getElementById("actionButtons"),
  enableGroupsToggle: document.getElementById("enableGroupsToggle"),
  selectionSummary: document.getElementById("selectionSummary"),
  groupsSummary: document.getElementById("groupsSummary"),
  groupsToggleList: document.getElementById("groupsToggleList"),
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
  managerGroupSelect: document.getElementById("managerGroupSelect"),
  managerGroupId: document.getElementById("managerGroupId"),
  managerGroupName: document.getElementById("managerGroupName"),
  managerGroupSummary: document.getElementById("managerGroupSummary"),
  managerGroupCreateBtn: document.getElementById("managerGroupCreateBtn"),
  managerGroupUpdateBtn: document.getElementById("managerGroupUpdateBtn"),
  managerGroupDeleteBtn: document.getElementById("managerGroupDeleteBtn"),
  managerGroupLinkInputs: Array.from(document.querySelectorAll(".manager-group-link")),
  toggleDebugEventsBtn: document.getElementById("toggleDebugEventsBtn"),
  debugEventsState: document.getElementById("debugEventsState"),
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimBaseForNumericSuffix(base, fallbackBase, numeric) {
  const suffix = `-${numeric}`;
  const maxBaseLen = 64 - suffix.length;
  const trimmed = String(base || "").slice(0, Math.max(1, maxBaseLen)).replace(/[-._]+$/, "");
  return trimmed || fallbackBase;
}

function nextNumericId(baseId, fallbackBase, existingIds) {
  const normalizedBase = normalizeObjectId(baseId) || fallbackBase;
  const existing = new Set(existingIds.map((id) => String(id || "").trim()).filter(Boolean));

  if (!existing.has(normalizedBase)) {
    return normalizedBase;
  }

  const suffixMatch = normalizedBase.match(/^(.*?)-(\d+)$/);
  const rootBase = suffixMatch ? (suffixMatch[1] || fallbackBase) : normalizedBase;
  const root = rootBase || fallbackBase;
  const start = suffixMatch ? Math.max(2, Number.parseInt(suffixMatch[2], 10) + 1) : 2;

  const pattern = new RegExp(`^${escapeRegExp(root)}-(\\d+)$`);
  let maxSeen = existing.has(root) ? 1 : 0;
  for (const existingId of existing) {
    const match = existingId.match(pattern);
    if (!match) continue;
    const number = Number.parseInt(match[1], 10);
    if (Number.isFinite(number)) {
      maxSeen = Math.max(maxSeen, number);
    }
  }

  let counter = Math.max(start, maxSeen + 1);
  while (counter < 100000) {
    const trimmedRoot = trimBaseForNumericSuffix(root, fallbackBase, counter);
    const candidate = `${trimmedRoot}-${counter}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }

  throw new Error(`Could not generate a unique ${fallbackBase} ID`);
}

function uniqueObjectId(baseId) {
  return nextNumericId(baseId, "obj", getObjects().map((obj) => obj.objectId));
}

function suggestObjectBaseFromType(typeValue) {
  const normalizedType = normalizeObjectId(typeValue);
  if (!normalizedType) return "obj";
  const lower = normalizedType.toLowerCase();
  if (lower === DEFAULT_OBJECT_TYPE || lower === "object" || lower === "source") {
    return "obj";
  }
  return normalizedType;
}

function autoObjectId(rawObjectId, objectType) {
  const normalizedRaw = normalizeObjectId(rawObjectId);
  const base = normalizedRaw || suggestObjectBaseFromType(objectType);
  const candidate = uniqueObjectId(base);
  if (!OBJECT_ID_RE.test(candidate)) {
    throw new Error("Object ID must use letters/numbers/dot/underscore/dash (max 64 chars)");
  }
  return candidate;
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

function uniqueGroupId(baseId) {
  return nextNumericId(baseId, "group", getObjectGroups().map((group) => group.groupId));
}

function longestCommonPrefix(values) {
  if (!values.length) return "";
  let prefix = String(values[0] || "");
  for (let index = 1; index < values.length && prefix; index += 1) {
    const value = String(values[index] || "");
    while (prefix && !value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function suggestGroupBaseFromSelection(objectIds) {
  const ids = (Array.isArray(objectIds) ? objectIds : [])
    .map((objectId) => normalizeObjectId(objectId))
    .filter(Boolean);
  if (!ids.length) return "group";
  if (ids.length === 1) return `${ids[0]}-group`;

  const prefix = normalizeObjectId(longestCommonPrefix(ids).replace(/[-._]+$/, ""));
  if (prefix && prefix.length >= 2 && prefix.toLowerCase() !== "obj") {
    return `${prefix}-group`;
  }

  const selectedObjects = ids.map((objectId) => getObjectById(objectId)).filter(Boolean);
  const typeBases = [...new Set(selectedObjects.map((obj) => suggestObjectBaseFromType(obj.type)))].filter(
    (base) => base && base !== "obj"
  );
  if (typeBases.length === 1) {
    return `${typeBases[0]}-group`;
  }

  return "group";
}

function humanizeId(idValue) {
  const text = String(idValue || "")
    .replace(/[-._]+/g, " ")
    .trim();
  if (!text) return "";
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function autoGroupId(rawGroupId, selectedObjectIds) {
  const normalizedRaw = normalizeObjectId(rawGroupId);
  const base = normalizedRaw || suggestGroupBaseFromSelection(selectedObjectIds);
  const candidate = uniqueGroupId(base);
  if (!OBJECT_ID_RE.test(candidate)) {
    throw new Error("Group ID must use letters/numbers/dot/underscore/dash (max 64 chars)");
  }
  if (candidate.toLowerCase() === VIRTUAL_ALL_GROUP_ID) {
    throw new Error(`Group ID "${VIRTUAL_ALL_GROUP_NAME}" is reserved`);
  }
  return candidate;
}

function getSceneIds() {
  return Array.isArray(state.status?.show?.sceneIds) ? state.status.show.sceneIds : [];
}

function uniqueSceneId(baseId) {
  return nextNumericId(baseId, "scene", getSceneIds());
}

function sanitizeGroupId(raw, options = {}) {
  const { allowAuto = false } = options;
  const normalized = normalizeObjectId(raw);
  const candidate = allowAuto ? uniqueGroupId(normalized || "group") : normalized;
  if (!OBJECT_ID_RE.test(candidate)) {
    throw new Error("Group ID must use letters/numbers/dot/underscore/dash (max 64 chars)");
  }
  if (candidate.toLowerCase() === VIRTUAL_ALL_GROUP_ID) {
    throw new Error(`Group ID "${VIRTUAL_ALL_GROUP_NAME}" is reserved`);
  }
  return candidate;
}

function sanitizeSceneId(raw, options = {}) {
  const { allowAuto = false } = options;
  const normalized = normalizeObjectId(raw);
  const candidate = allowAuto ? uniqueSceneId(normalized || "scene") : normalized;
  if (!OBJECT_ID_RE.test(candidate)) {
    throw new Error("Scene ID must use letters/numbers/dot/underscore/dash (max 64 chars)");
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

function setUiStatus(message, level = "info") {
  if (!els.uiStatusBar) return;
  els.uiStatusBar.textContent = String(message || "");
  els.uiStatusBar.classList.remove("is-success", "is-error");
  if (level === "success") {
    els.uiStatusBar.classList.add("is-success");
  } else if (level === "error") {
    els.uiStatusBar.classList.add("is-error");
  }
}

function addLog(line) {
  state.logs.push(line);
  while (state.logs.length > 160) state.logs.shift();
  els.eventLog.innerHTML = state.logs
    .map((entry) => `<div class="log-line">${escapeHtml(entry)}</div>`)
    .join("");
  els.eventLog.scrollTop = els.eventLog.scrollHeight;

  // Keep UI feedback readable: ignore noisy timestamped debug stream entries.
  if (/^\d{4}-\d{2}-\d{2}T/.test(line)) return;
  if (/failed|error/i.test(line)) {
    setUiStatus(line, "error");
    return;
  }
  if (/loaded|saved|created|updated|enabled|disabled|recall|started|stopped|aborted|add|remove|rename|clear|set|patch/i.test(line)) {
    setUiStatus(line, "success");
    return;
  }
  setUiStatus(line, "info");
}

function renderDebugControls() {
  els.toggleDebugEventsBtn.textContent = state.debugEventsEnabled ? "Disable Debug Events" : "Enable Debug Events";
  els.debugEventsState.textContent = state.debugEventsEnabled ? "Live stream on" : "Live stream off";
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

function ensureShowPathOption(path) {
  const candidate = String(path || "").trim();
  if (!candidate || !els.showPathInput) return;
  const exists = Array.from(els.showPathInput.options).some((opt) => opt.value === candidate);
  if (exists) return;
  const option = document.createElement("option");
  option.value = candidate;
  option.textContent = candidate;
  els.showPathInput.appendChild(option);
}

function renderShowPathOptions(paths) {
  const normalized = [...new Set((Array.isArray(paths) ? paths : []).map((path) => String(path || "").trim()).filter(Boolean))];
  const currentPath = String(state.status?.show?.path || els.showPathInput.value || "showfiles/_template/show.json").trim();
  if (currentPath && !normalized.includes(currentPath)) {
    normalized.unshift(currentPath);
  }
  if (!normalized.length) {
    normalized.push("showfiles/_template/show.json");
  }

  els.showPathInput.innerHTML = "";
  for (const path of normalized) {
    const option = document.createElement("option");
    option.value = path;
    option.textContent = path;
    els.showPathInput.appendChild(option);
  }
  setInputValueIfIdle(els.showPathInput, currentPath || normalized[0]);
}

async function refreshShowList() {
  try {
    const data = await api("/api/show/list");
    state.availableShowPaths = Array.isArray(data.paths) ? data.paths : [];
    renderShowPathOptions(state.availableShowPaths);
  } catch (error) {
    if (!els.showPathInput.options.length) {
      renderShowPathOptions([]);
    }
    addLog(`show list failed: ${error.message}`);
  }
}

function getObjects() {
  return Array.isArray(state.status?.objects) ? state.status.objects : [];
}

function getObjectGroups() {
  return Array.isArray(state.status?.objectGroups) ? state.status.objectGroups : [];
}

function areGroupsEnabled() {
  return state.status?.groupsEnabled !== false;
}

function getVirtualAllGroup() {
  const objectIds = getObjects()
    .filter((obj) => !Boolean(obj.excludeFromAll))
    .map((obj) => obj.objectId);
  return {
    groupId: VIRTUAL_ALL_GROUP_ID,
    name: VIRTUAL_ALL_GROUP_NAME,
    objectIds,
    linkParams: [],
    enabled: true,
    virtual: true
  };
}

function getSelectableGroups() {
  if (!areGroupsEnabled()) return [];
  return getObjectGroups().filter((group) => isGroupEnabled(group));
}

function expandSelectionByEnabledGroups(objectIds) {
  const queue = [];
  const seen = new Set();
  const expanded = [];
  const enabledGroups = getSelectableGroups();

  for (const objectId of objectIds) {
    const normalized = String(objectId || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    queue.push(normalized);
    seen.add(normalized);
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const objectId = queue[cursor];
    cursor += 1;
    expanded.push(objectId);

    for (const group of enabledGroups) {
      const members = Array.isArray(group.objectIds) ? group.objectIds : [];
      if (!members.includes(objectId)) continue;
      for (const memberId of members) {
        const normalized = String(memberId || "").trim();
        if (!normalized || seen.has(normalized)) continue;
        queue.push(normalized);
        seen.add(normalized);
      }
    }
  }

  return expanded;
}

function syncSelectedIdsWithObjects() {
  const objects = getObjects();
  const objectIdSet = new Set(objects.map((obj) => obj.objectId));
  state.selectedObjectIds = state.selectedObjectIds.filter((objectId) => objectIdSet.has(objectId));

  if (state.selectedObjectIds.length) {
    state.selectedObjectIds = expandSelectionByEnabledGroups(state.selectedObjectIds).filter((objectId) => objectIdSet.has(objectId));
  }

  if (!state.selectedObjectIds.length && state.selectedObjectId && objectIdSet.has(state.selectedObjectId)) {
    state.selectedObjectIds = expandSelectionByEnabledGroups([state.selectedObjectId]).filter((objectId) => objectIdSet.has(objectId));
  }

  if (state.selectedObjectIds.length) {
    if (!state.selectedObjectIds.includes(state.selectedObjectId)) {
      state.selectedObjectId = state.selectedObjectIds[0];
    }
  } else {
    state.selectedObjectId = null;
  }
}

function setSelection(objectIds) {
  const uniqueSeeds = [];
  const seen = new Set();
  for (const objectId of objectIds) {
    const normalized = String(objectId || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    uniqueSeeds.push(normalized);
    seen.add(normalized);
  }
  const unique = expandSelectionByEnabledGroups(uniqueSeeds);
  state.selectedObjectIds = unique;
  state.selectedObjectId = unique.length ? unique[0] : null;
}

function setSingleSelection(objectId) {
  if (!objectId) {
    setSelection([]);
    return;
  }
  setSelection([objectId]);
}

function toggleSelection(objectId) {
  if (!objectId) return;
  const objectUnit = new Set(expandSelectionByEnabledGroups([objectId]));
  const hasAnySelected = state.selectedObjectIds.some((selectedId) => objectUnit.has(selectedId));
  if (hasAnySelected) {
    const next = state.selectedObjectIds.filter((selectedId) => !objectUnit.has(selectedId));
    setSelection(next);
  } else {
    setSelection([...objectUnit, ...state.selectedObjectIds]);
  }
}

function isObjectSelected(objectId) {
  return state.selectedObjectIds.includes(objectId);
}

function selectedObjectTargets() {
  syncSelectedIdsWithObjects();
  if (state.selectedObjectIds.length) return [...state.selectedObjectIds];
  if (state.selectedObjectId) return [state.selectedObjectId];
  return [];
}

function getSelectedObject() {
  syncSelectedIdsWithObjects();
  if (!state.selectedObjectId) return null;
  return getObjects().find((obj) => obj.objectId === state.selectedObjectId) || null;
}

function getSelectedGroup() {
  const groups = getObjectGroups();
  return groups.find((group) => group.groupId === state.selectedGroupId) || null;
}

function isGroupEnabled(group) {
  return group?.enabled !== false;
}

function livePropagateGroupLinks(previousByObjectId, patchByObjectId) {
  const groups = getSelectableGroups();
  if (!groups.length) return;

  const objectMap = new Map(getObjects().map((obj) => [obj.objectId, obj]));
  const directlyPatchedIds = new Set(Object.keys(patchByObjectId));

  for (const [sourceId, patch] of Object.entries(patchByObjectId)) {
    const sourcePrev = previousByObjectId[sourceId] || {};
    for (const group of groups) {
      const members = Array.isArray(group.objectIds) ? group.objectIds : [];
      if (!members.includes(sourceId)) continue;
      if (members.length && members.every((memberId) => directlyPatchedIds.has(memberId))) {
        continue;
      }
      const linkParams = new Set(Array.isArray(group.linkParams) ? group.linkParams : []);

      for (const targetId of members) {
        if (targetId === sourceId) continue;
        const target = objectMap.get(targetId);
        if (!target) continue;

        for (const [param, nextValue] of Object.entries(patch)) {
          if (!linkParams.has(param)) continue;

          if (RELATIVE_GROUP_PARAMS.has(param)) {
            const previousValue = Number(sourcePrev[param]);
            const afterValue = Number(nextValue);
            if (!Number.isFinite(previousValue) || !Number.isFinite(afterValue)) continue;
            const delta = afterValue - previousValue;
            const targetCurrent = Number(target[param]);
            if (!Number.isFinite(targetCurrent)) continue;
            target[param] = clampValue(targetCurrent + delta, LIMITS[param] || [-Infinity, Infinity]);
          } else {
            target[param] = nextValue;
          }
        }
      }
    }
  }
}

function selectedLinkParamsFromInputs() {
  return els.managerGroupLinkInputs
    .filter((input) => input.checked)
    .map((input) => String(input.dataset.param || "").trim())
    .filter(Boolean);
}

function applyLinkParamsToInputs(linkParams) {
  const selected = new Set(Array.isArray(linkParams) ? linkParams : []);
  for (const input of els.managerGroupLinkInputs) {
    const param = String(input.dataset.param || "");
    input.checked = selected.has(param);
  }
}

function setInputValueIfIdle(input, value) {
  if (document.activeElement === input) return;
  input.value = value;
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
    const isSelected = isObjectSelected(item.obj.objectId);
    const isPrimarySelected = item.obj.objectId === state.selectedObjectId;

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

    if (isPrimarySelected) {
      ctx.strokeStyle = "#003f3b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isSelected) {
      ctx.strokeStyle = "#12756f";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
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

  if (state.selectionBox.active) {
    const x = Math.min(state.selectionBox.startX, state.selectionBox.currentX);
    const y = Math.min(state.selectionBox.startY, state.selectionBox.currentY);
    const wBox = Math.abs(state.selectionBox.currentX - state.selectionBox.startX);
    const hBox = Math.abs(state.selectionBox.currentY - state.selectionBox.startY);
    ctx.save();
    ctx.fillStyle = "#006c6733";
    ctx.strokeStyle = "#006c67";
    ctx.lineWidth = 1.2;
    ctx.fillRect(x, y, wBox, hBox);
    ctx.strokeRect(x, y, wBox, hBox);
    ctx.restore();
  }
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
    els.sceneSelectInput.innerHTML = "";
    els.sceneSelectInput.disabled = true;
    els.loadSceneBtn.disabled = true;
    els.saveSceneBtn.disabled = true;
    els.saveSceneAsBtn.disabled = true;
    els.sceneButtons.innerHTML = "";
    els.actionButtons.innerHTML = "";
    return;
  }

  ensureShowPathOption(status.show.path);
  setInputValueIfIdle(els.showPathInput, String(status.show.path || ""));
  els.showInfo.textContent = `${status.show.name} (${status.show.version}) - ${status.show.path}`;

  const sceneIds = [...status.show.sceneIds];
  if (state.selectedSceneId && !sceneIds.includes(state.selectedSceneId)) {
    state.selectedSceneId = null;
  }
  if (!state.selectedSceneId) {
    state.selectedSceneId = status.activeSceneId || sceneIds[0] || null;
  }

  els.sceneSelectInput.innerHTML = "";
  for (const sceneId of sceneIds) {
    const opt = document.createElement("option");
    opt.value = sceneId;
    opt.textContent = sceneId;
    if (sceneId === state.selectedSceneId) opt.selected = true;
    els.sceneSelectInput.appendChild(opt);
  }
  els.sceneSelectInput.disabled = !sceneIds.length;
  els.loadSceneBtn.disabled = !sceneIds.length;
  els.saveSceneBtn.disabled = !sceneIds.length;
  els.saveSceneAsBtn.disabled = !sceneIds.length;

  els.sceneButtons.innerHTML = "";
  for (const sceneId of sceneIds) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = sceneId;

    if (sceneId === status.activeSceneId) {
      btn.style.borderColor = "var(--accent)";
      btn.style.fontWeight = "700";
    }

    btn.addEventListener("click", async () => {
      state.selectedSceneId = sceneId;
      await runSceneLoad(sceneId);
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

function selectedSceneIdOrThrow() {
  const sceneId = String(state.selectedSceneId || els.sceneSelectInput.value || "").trim();
  if (!sceneId) {
    throw new Error("No scene selected");
  }
  return sceneId;
}

async function runSceneLoad(sceneId = null) {
  try {
    const targetSceneId = sceneId || selectedSceneIdOrThrow();
    await api(`/api/scene/${encodeURIComponent(targetSceneId)}/recall`, "POST", {});
    state.selectedSceneId = targetSceneId;
    addLog(`scene load -> ${targetSceneId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`scene load failed: ${error.message}`);
  }
}

async function runSceneSave() {
  try {
    const sceneId = selectedSceneIdOrThrow();
    await api(`/api/scene/${encodeURIComponent(sceneId)}/save`, "POST", {});
    addLog(`scene save -> ${sceneId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`scene save failed: ${error.message}`);
  }
}

async function runSceneSaveAs() {
  try {
    const sourceSceneId = selectedSceneIdOrThrow();
    const suggestedSceneId = uniqueSceneId(sourceSceneId);
    const rawNewSceneId = prompt("New scene ID", suggestedSceneId);
    if (rawNewSceneId === null) {
      addLog("scene save-as cancelled");
      return;
    }
    const newSceneId = sanitizeSceneId(rawNewSceneId, { allowAuto: true });
    await api(`/api/scene/${encodeURIComponent(sourceSceneId)}/save-as`, "POST", { newSceneId });
    state.selectedSceneId = newSceneId;
    addLog(`scene save-as -> ${sourceSceneId} as ${newSceneId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`scene save-as failed: ${error.message}`);
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
  syncSelectedIdsWithObjects();
  const objects = getObjects();
  els.objectSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = objects.length ? "Primary selected object..." : "No objects";
  placeholder.disabled = true;
  placeholder.selected = !state.selectedObjectId;
  els.objectSelect.appendChild(placeholder);

  for (const obj of objects) {
    const option = document.createElement("option");
    option.value = obj.objectId;
    option.textContent = obj.objectId;
    if (obj.objectId === state.selectedObjectId) option.selected = true;
    els.objectSelect.appendChild(option);
  }

  els.objectSelect.disabled = !objects.length;
}

function renderSelectionSummary() {
  const selectedIds = selectedObjectTargets();
  if (!selectedIds.length) {
    els.selectionSummary.textContent = "Selected: 0";
    return;
  }

  if (selectedIds.length === 1) {
    els.selectionSummary.textContent = `Selected: 1 (${selectedIds[0]})`;
    return;
  }

  els.selectionSummary.textContent = `Selected: ${selectedIds.length} (primary: ${state.selectedObjectId || "-"})`;
}

function renderInspector() {
  const selectedIds = selectedObjectTargets();
  const obj = getSelectedObject();
  renderSelectionSummary();

  els.applyObjectBtn.disabled = selectedIds.length === 0;
  els.applyObjectBtn.textContent = selectedIds.length > 1 ? `Apply To ${selectedIds.length} Objects` : "Apply Object Update";

  if (!obj) {
    for (const input of [els.xInput, els.yInput, els.zInput, els.sizeInput, els.gainInput, els.algorithmInput]) {
      setInputValueIfIdle(input, "");
    }
    els.muteInput.checked = false;
    return;
  }

  setInputValueIfIdle(els.xInput, String(Number(obj.x).toFixed(2)));
  setInputValueIfIdle(els.yInput, String(Number(obj.y).toFixed(2)));
  setInputValueIfIdle(els.zInput, String(Number(obj.z).toFixed(2)));
  setInputValueIfIdle(els.sizeInput, String(Number(obj.size).toFixed(2)));
  setInputValueIfIdle(els.gainInput, String(Number(obj.gain).toFixed(2)));
  setInputValueIfIdle(els.algorithmInput, String(obj.algorithm || "default"));
  els.muteInput.checked = Boolean(obj.mute);
}

async function setGroupEnabled(groupId, enabled) {
  try {
    await api(`/api/groups/${encodeURIComponent(groupId)}/update`, "POST", { enabled: Boolean(enabled) });
    addLog(`group ${enabled ? "enabled" : "disabled"} -> ${groupId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`group toggle failed (${groupId}): ${error.message}`);
  }
}

async function setGroupsEnabled(enabled) {
  try {
    await api("/api/groups/enabled", "POST", { enabled: Boolean(enabled) });
    addLog(`groups ${enabled ? "enabled" : "disabled"}`);
    await refreshStatus();
  } catch (error) {
    addLog(`groups master toggle failed: ${error.message}`);
    await refreshStatus();
  }
}

function renderGroupsPanel() {
  const groups = [...getObjectGroups()].sort((a, b) => String(a.groupId).localeCompare(String(b.groupId)));
  const groupsEnabled = areGroupsEnabled();
  els.enableGroupsToggle.checked = groupsEnabled;
  els.groupsToggleList.innerHTML = "";

  if (!groups.length) {
    els.groupsSummary.textContent = groupsEnabled ? "No groups" : "Groups disabled";
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = groupsEnabled ? "Create groups in Object Manager." : "Enable groups to apply group links.";
    els.groupsToggleList.appendChild(empty);
    return;
  }

  const enabledCount = groups.filter((group) => isGroupEnabled(group)).length;
  els.groupsSummary.textContent = groupsEnabled ? `${enabledCount}/${groups.length} groups enabled` : "Groups disabled";

  for (const group of groups) {
    const row = document.createElement("label");
    row.className = "group-toggle-row";

    const meta = document.createElement("span");
    meta.className = "group-toggle-meta";

    const name = document.createElement("span");
    name.className = "group-toggle-name";
    name.textContent = String(group.name || group.groupId);
    meta.appendChild(name);

    const detail = document.createElement("span");
    detail.className = "muted";
    detail.textContent = `${group.groupId} | ${group.objectIds.length} object${group.objectIds.length === 1 ? "" : "s"}`;
    meta.appendChild(detail);

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = isGroupEnabled(group);
    toggle.disabled = !groupsEnabled;
    toggle.addEventListener("change", () => {
      void setGroupEnabled(group.groupId, toggle.checked);
    });

    row.appendChild(meta);
    row.appendChild(toggle);
    els.groupsToggleList.appendChild(row);
  }
}

function renderGroupsManager() {
  const selectedObjectIds = selectedObjectTargets();
  const groups = [...getObjectGroups()].sort((a, b) => String(a.groupId).localeCompare(String(b.groupId)));

  if (state.selectedGroupId && !groups.find((group) => group.groupId === state.selectedGroupId)) {
    state.selectedGroupId = null;
  }
  if (!state.selectedGroupId && groups.length) {
    state.selectedGroupId = groups[0].groupId;
  }

  els.managerGroupSelect.innerHTML = "";
  const newOpt = document.createElement("option");
  newOpt.value = "";
  newOpt.textContent = "New group...";
  if (!state.selectedGroupId) newOpt.selected = true;
  els.managerGroupSelect.appendChild(newOpt);

  for (const group of groups) {
    const option = document.createElement("option");
    option.value = group.groupId;
    option.textContent = `${group.groupId} (${group.objectIds.length})${isGroupEnabled(group) ? "" : " [off]"}`;
    if (group.groupId === state.selectedGroupId) option.selected = true;
    els.managerGroupSelect.appendChild(option);
  }

  const selectedGroup = getSelectedGroup();
  if (selectedGroup) {
    setInputValueIfIdle(els.managerGroupId, String(selectedGroup.groupId));
    setInputValueIfIdle(els.managerGroupName, String(selectedGroup.name || selectedGroup.groupId));
    applyLinkParamsToInputs(selectedGroup.linkParams || []);
    els.managerGroupSummary.textContent = `Group members: ${selectedGroup.objectIds.length}. Update will replace members with current selection (${selectedObjectIds.length}).`;
  } else {
    const suggestedId = uniqueGroupId(suggestGroupBaseFromSelection(selectedObjectIds));
    if (!String(els.managerGroupId.value || "").trim()) {
      setInputValueIfIdle(els.managerGroupId, suggestedId);
    }
    if (!selectedLinkParamsFromInputs().length) {
      applyLinkParamsToInputs(["x", "y", "z"]);
    }
    if (!String(els.managerGroupName.value || "").trim()) {
      const groupName = humanizeId(String(els.managerGroupId.value || suggestedId));
      setInputValueIfIdle(els.managerGroupName, groupName || String(els.managerGroupId.value || suggestedId));
    }
    els.managerGroupSummary.textContent = `${groups.length} group${groups.length === 1 ? "" : "s"} total. Create/Update uses current selection (${selectedObjectIds.length}).`;
  }

  els.managerGroupUpdateBtn.disabled = !state.selectedGroupId;
  els.managerGroupDeleteBtn.disabled = !state.selectedGroupId;
}

function renderManager() {
  syncSelectedIdsWithObjects();
  const objects = getObjects();
  const groups = getObjectGroups();
  const allGroup = getVirtualAllGroup();
  const allMembers = new Set(allGroup.objectIds);
  const selectedIds = selectedObjectTargets();
  if (!String(els.managerAddId.value || "").trim()) {
    const suggestedAddId = uniqueObjectId(suggestObjectBaseFromType(els.managerAddType.value || DEFAULT_OBJECT_TYPE));
    setInputValueIfIdle(els.managerAddId, suggestedAddId);
  }
  els.managerObjectCount.textContent = `${objects.length} object${objects.length === 1 ? "" : "s"}`;

  els.managerObjectSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = objects.length ? "Primary selected object..." : "No objects";
  placeholder.disabled = true;
  placeholder.selected = !state.selectedObjectId;
  els.managerObjectSelect.appendChild(placeholder);

  for (const obj of objects) {
    const opt = document.createElement("option");
    opt.value = obj.objectId;
    opt.textContent = obj.objectId;
    if (obj.objectId === state.selectedObjectId) opt.selected = true;
    els.managerObjectSelect.appendChild(opt);
  }
  els.managerObjectSelect.disabled = !objects.length;

  const selected = getSelectedObject();
  if (selected) {
    setInputValueIfIdle(els.managerRenameInput, selected.objectId);
    setInputValueIfIdle(els.managerTypeInput, String(selected.type || DEFAULT_OBJECT_TYPE));
    setInputValueIfIdle(els.managerColorInput, normalizeHexColor(selected.color, DEFAULT_OBJECT_COLOR));
  } else {
    setInputValueIfIdle(els.managerRenameInput, "");
    setInputValueIfIdle(els.managerTypeInput, DEFAULT_OBJECT_TYPE);
    setInputValueIfIdle(els.managerColorInput, DEFAULT_OBJECT_COLOR);
  }
  els.managerRenameBtn.disabled = selectedIds.length !== 1;

  els.managerObjectRows.innerHTML = "";
  for (const obj of objects) {
    const row = document.createElement("tr");
    const rowIsSelected = isObjectSelected(obj.objectId);
    if (rowIsSelected) row.classList.add("is-selected");
    if (obj.objectId === state.selectedObjectId) row.classList.add("is-primary");

    const positionText = `${Number(obj.x).toFixed(1)}, ${Number(obj.y).toFixed(1)}, ${Number(obj.z).toFixed(1)}`;
    const color = normalizeHexColor(obj.color, DEFAULT_OBJECT_COLOR);
    const groupLabels = groups
      .filter((group) => Array.isArray(group.objectIds) && group.objectIds.includes(obj.objectId))
      .map((group) => `${group.groupId}${isGroupEnabled(group) ? "" : " (off)"}`);
    if (allMembers.has(obj.objectId)) {
      groupLabels.unshift(VIRTUAL_ALL_GROUP_NAME);
    }
    const groupText = groupLabels.length ? groupLabels.join(", ") : "-";
    const excludeFromAll = Boolean(obj.excludeFromAll);

    row.innerHTML = `
      <td class="sel-cell"><input class="row-select-toggle" type="checkbox" ${rowIsSelected ? "checked" : ""} aria-label="Select ${escapeHtml(obj.objectId)}" /></td>
      <td>${escapeHtml(obj.objectId)}</td>
      <td>${escapeHtml(String(obj.type || DEFAULT_OBJECT_TYPE))}</td>
      <td><span class="color-chip" style="background:${escapeHtml(color)}"></span>${escapeHtml(color)}</td>
      <td>${escapeHtml(positionText)}</td>
      <td class="groups-cell">${escapeHtml(groupText)}</td>
      <td class="all-exclude-cell"><input class="row-exclude-all-toggle" type="checkbox" ${excludeFromAll ? "checked" : ""} aria-label="Exclude ${escapeHtml(obj.objectId)} from All" /></td>
    `;

    const checkbox = row.querySelector(".row-select-toggle");
    if (checkbox) {
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      checkbox.addEventListener("change", () => {
        toggleSelection(obj.objectId);
        renderAll();
      });
    }

    const excludeToggle = row.querySelector(".row-exclude-all-toggle");
    if (excludeToggle) {
      excludeToggle.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      excludeToggle.addEventListener("change", async () => {
        try {
          await api(`/api/object/${encodeURIComponent(obj.objectId)}`, "POST", { excludeFromAll: excludeToggle.checked });
          addLog(`object ${excludeToggle.checked ? "excluded" : "included"} in All -> ${obj.objectId}`);
          await refreshStatus();
        } catch (error) {
          addLog(`exclude-from-all failed (${obj.objectId}): ${error.message}`);
          await refreshStatus();
        }
      });
    }

    row.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey) {
        toggleSelection(obj.objectId);
      } else {
        setSingleSelection(obj.objectId);
      }
      renderAll();
    });

    els.managerObjectRows.appendChild(row);
  }

  renderGroupsManager();
}

function renderAll() {
  syncSelectedIdsWithObjects();
  renderStatusLine();
  renderShowControls();
  renderDebugControls();
  renderObjectSelect();
  renderInspector();
  renderGroupsPanel();
  renderManager();
  syncCameraInputs();
  renderPanner();
}

async function refreshStatus() {
  try {
    state.status = await api("/api/status");
    await refreshShowList();
    syncSelectedIdsWithObjects();
    const groups = getObjectGroups();
    if (state.selectedGroupId && !groups.find((group) => group.groupId === state.selectedGroupId)) {
      state.selectedGroupId = null;
    }
    renderAll();
  } catch (error) {
    els.statusLine.textContent = `Status request failed: ${error.message}`;
    setUiStatus(`Status request failed: ${error.message}`, "error");
  }
}

async function pushObjectPatch(objectId, patch, options = {}) {
  const { propagateGroupLinks = true } = options;
  if (!objectId) return;
  try {
    await api(`/api/object/${encodeURIComponent(objectId)}`, "POST", {
      ...patch,
      propagateGroupLinks: Boolean(propagateGroupLinks)
    });
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

function selectionRectObjectIds(startX, startY, currentX, currentY) {
  const left = Math.min(startX, currentX);
  const right = Math.max(startX, currentX);
  const top = Math.min(startY, currentY);
  const bottom = Math.max(startY, currentY);
  const camera = getCameraBasis();
  const objectIds = [];

  for (const obj of getObjects()) {
    const projected = projectPoint(camera, vec(Number(obj.x), Number(obj.y), Number(obj.z)));
    if (!projected) continue;
    if (projected.x >= left && projected.x <= right && projected.y >= top && projected.y <= bottom) {
      objectIds.push(obj.objectId);
    }
  }

  return objectIds;
}

function beginObjectDrag(objectId, point, useHeightMode, options = {}) {
  const { singleObjectOnly = false } = options;
  if (!getObjectById(objectId)) return;
  state.dragSingleObjectOnly = Boolean(singleObjectOnly);
  const selectedIds = selectedObjectTargets();
  if (state.dragSingleObjectOnly) {
    state.draggingObjectIds = [objectId];
  } else {
    state.draggingObjectIds = selectedIds.includes(objectId) ? selectedIds : [objectId];
  }
  state.draggingObjectId = objectId;
  state.lastDragSendMs = 0;
  configureDragMode(useHeightMode ? "y" : "xz", point);
}

function configureDragMode(mode, point) {
  const anchorObjectId = state.draggingObjectId;
  if (!anchorObjectId) return;
  const anchor = getObjectById(anchorObjectId);
  if (!anchor) return;
  state.draggingMode = mode;

  if (mode === "y") {
    state.draggingStartY = Number(anchor.y);
    state.draggingStartPointerY = point.y;
    state.draggingRelativeY = {};
    for (const objectId of state.draggingObjectIds) {
      const obj = getObjectById(objectId);
      if (!obj) continue;
      state.draggingRelativeY[objectId] = Number(obj.y) - Number(anchor.y);
    }
  } else {
    state.draggingPlaneY = Number(anchor.y);
    state.draggingOffsetXZ = { x: 0, z: 0 };
    const camera = getCameraBasis();
    const ray = screenRay(camera, point.x, point.y);
    const planeHit = intersectRayPlaneY(ray, state.draggingPlaneY);
    if (planeHit) {
      state.draggingOffsetXZ = {
        x: Number(anchor.x) - planeHit.x,
        z: Number(anchor.z) - planeHit.z
      };
    }
    state.draggingRelativeXZ = {};
    for (const objectId of state.draggingObjectIds) {
      const obj = getObjectById(objectId);
      if (!obj) continue;
      state.draggingRelativeXZ[objectId] = {
        x: Number(obj.x) - Number(anchor.x),
        z: Number(obj.z) - Number(anchor.z)
      };
    }
  }
}

function maybeSendDragBatch(patchByObjectId, options = {}) {
  const { propagateGroupLinks = true } = options;
  const now = Date.now();
  if (now - state.lastDragSendMs > 70) {
    state.lastDragSendMs = now;
    for (const [objectId, patch] of Object.entries(patchByObjectId)) {
      void pushObjectPatch(objectId, patch, { propagateGroupLinks });
    }
  }
}

async function finalizeObjectDrag() {
  if (!state.draggingObjectIds.length) return;
  await Promise.all(
    state.draggingObjectIds.map((objectId) => {
      const obj = getObjectById(objectId);
      if (!obj) return Promise.resolve();
      return pushObjectPatch(
        objectId,
        {
          x: Number(obj.x),
          y: Number(obj.y),
          z: Number(obj.z)
        },
        { propagateGroupLinks: false }
      );
    })
  );
  await refreshStatus();
}

function applySelectionBox(additive) {
  const selectedInRect = selectionRectObjectIds(
    state.selectionBox.startX,
    state.selectionBox.startY,
    state.selectionBox.currentX,
    state.selectionBox.currentY
  );
  if (additive) {
    setSelection([...state.selectionBox.baseSelection, ...selectedInRect]);
  } else {
    setSelection(selectedInRect);
  }
}

function resetPointerInteraction() {
  state.draggingObjectId = null;
  state.draggingObjectIds = [];
  state.draggingMode = null;
  state.draggingPlaneY = 0;
  state.draggingStartY = 0;
  state.draggingStartPointerY = 0;
  state.draggingOffsetXZ = { x: 0, z: 0 };
  state.draggingRelativeXZ = {};
  state.draggingRelativeY = {};
  state.dragSingleObjectOnly = false;
  state.orbiting = false;
  state.activePointerId = null;
  state.pointerDownHitObjectId = null;
  state.selectionBox.active = false;
  state.selectionBox.additive = false;
  state.selectionBox.baseSelection = [];
}

function finishSelectionInteraction(event) {
  const dx = state.selectionBox.currentX - state.selectionBox.startX;
  const dy = state.selectionBox.currentY - state.selectionBox.startY;
  const draggedFar = Math.hypot(dx, dy) > 6;
  const additive = state.selectionBox.additive;
  const hitObjectId = state.pointerDownHitObjectId;

  if (!draggedFar) {
    if (hitObjectId) {
      if (additive) {
        toggleSelection(hitObjectId);
      } else {
        setSingleSelection(hitObjectId);
      }
    } else if (!additive) {
      setSelection([]);
    }
  } else {
    applySelectionBox(additive);
  }

  if (event?.pointerId !== undefined) {
    try {
      els.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release errors when pointer capture is already gone.
    }
  }
  resetPointerInteraction();
}

async function managerAddObject() {
  try {
    const rawObjectId = els.managerAddId.value;
    const objectType = String(els.managerAddType.value || DEFAULT_OBJECT_TYPE).trim() || DEFAULT_OBJECT_TYPE;
    const objectId = autoObjectId(rawObjectId, objectType);
    const objectColor = normalizeHexColor(els.managerAddColor.value, DEFAULT_OBJECT_COLOR);
    await api("/api/object/add", "POST", {
      objectId,
      type: objectType,
      color: objectColor
    });
    if (String(rawObjectId || "").trim() !== objectId) {
      addLog(`object id normalized -> ${objectId}`);
    }
    els.managerAddId.value = uniqueObjectId(suggestObjectBaseFromType(objectType));
    setSingleSelection(objectId);
    addLog(`object add -> ${objectId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`object add failed: ${error.message}`);
  }
}

async function managerRenameObject() {
  try {
    const selectedIds = selectedObjectTargets();
    if (selectedIds.length !== 1) {
      throw new Error("Rename requires exactly one selected object");
    }
    const currentId = selectedIds[0];
    if (!currentId) {
      throw new Error("No object selected");
    }
    const newObjectId = sanitizeObjectId(els.managerRenameInput.value);
    await api(`/api/object/${encodeURIComponent(currentId)}/rename`, "POST", { newObjectId });
    setSingleSelection(newObjectId);
    addLog(`object rename -> ${currentId} to ${newObjectId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`object rename failed: ${error.message}`);
  }
}

async function managerSetType() {
  try {
    const objectIds = selectedObjectTargets();
    if (!objectIds.length) {
      throw new Error("No objects selected");
    }
    const type = String(els.managerTypeInput.value || DEFAULT_OBJECT_TYPE).trim() || DEFAULT_OBJECT_TYPE;
    await Promise.all(
      objectIds.map((objectId) => api(`/api/object/${encodeURIComponent(objectId)}`, "POST", { type }))
    );
    addLog(`object type set -> ${objectIds.join(", ")} = ${type}`);
    await refreshStatus();
  } catch (error) {
    addLog(`set type failed: ${error.message}`);
  }
}

async function managerSetColor() {
  try {
    const objectIds = selectedObjectTargets();
    if (!objectIds.length) {
      throw new Error("No objects selected");
    }
    const color = normalizeHexColor(els.managerColorInput.value, DEFAULT_OBJECT_COLOR);
    await Promise.all(
      objectIds.map((objectId) => api(`/api/object/${encodeURIComponent(objectId)}`, "POST", { color }))
    );
    addLog(`object color set -> ${objectIds.join(", ")} = ${color}`);
    await refreshStatus();
  } catch (error) {
    addLog(`set color failed: ${error.message}`);
  }
}

async function managerRemoveSelected() {
  try {
    const objectIds = selectedObjectTargets();
    if (!objectIds.length) {
      throw new Error("No objects selected");
    }
    await Promise.all(
      objectIds.map((objectId) => api(`/api/object/${encodeURIComponent(objectId)}/remove`, "POST", {}))
    );
    setSelection([]);
    addLog(`object remove -> ${objectIds.join(", ")}`);
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
    setSelection([]);
    addLog("object clear -> all");
    await refreshStatus();
  } catch (error) {
    addLog(`clear failed: ${error.message}`);
  }
}

async function managerCreateGroup() {
  try {
    const selectedObjectIds = selectedObjectTargets();
    if (!selectedObjectIds.length) {
      throw new Error("Select one or more objects before creating a group");
    }
    const rawGroupId = els.managerGroupId.value;
    const groupId = autoGroupId(rawGroupId, selectedObjectIds);
    const suggestedName = humanizeId(groupId);
    const name = String(els.managerGroupName.value || suggestedName || groupId).trim() || groupId;
    const linkParams = selectedLinkParamsFromInputs();
    await api("/api/groups/create", "POST", {
      groupId,
      name,
      objectIds: selectedObjectIds,
      linkParams
    });
    if (String(rawGroupId || "").trim() !== groupId) {
      addLog(`group id normalized -> ${groupId}`);
    }
    if (!String(els.managerGroupName.value || "").trim() && suggestedName) {
      els.managerGroupName.value = suggestedName;
    }
    state.selectedGroupId = groupId;
    addLog(`group create -> ${groupId} (${selectedObjectIds.length} members)`);
    await refreshStatus();
  } catch (error) {
    addLog(`group create failed: ${error.message}`);
  }
}

async function managerUpdateGroup() {
  try {
    const groupId = state.selectedGroupId || sanitizeGroupId(els.managerGroupId.value);
    if (!groupId) {
      throw new Error("No group selected");
    }
    const selectedObjectIds = selectedObjectTargets();
    if (!selectedObjectIds.length) {
      throw new Error("Select one or more objects before updating the group");
    }
    const name = String(els.managerGroupName.value || groupId).trim() || groupId;
    const linkParams = selectedLinkParamsFromInputs();
    await api(`/api/groups/${encodeURIComponent(groupId)}/update`, "POST", {
      name,
      objectIds: selectedObjectIds,
      linkParams
    });
    state.selectedGroupId = groupId;
    addLog(`group update -> ${groupId} (${selectedObjectIds.length} members)`);
    await refreshStatus();
  } catch (error) {
    addLog(`group update failed: ${error.message}`);
  }
}

async function managerDeleteGroup() {
  try {
    const groupId = state.selectedGroupId || sanitizeGroupId(els.managerGroupId.value);
    if (!groupId) {
      throw new Error("No group selected");
    }
    if (!confirm(`Delete group "${groupId}"?`)) {
      return;
    }
    await api(`/api/groups/${encodeURIComponent(groupId)}/delete`, "POST", {});
    state.selectedGroupId = null;
    addLog(`group delete -> ${groupId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`group delete failed: ${error.message}`);
  }
}

function requestedShowPath() {
  return String(els.showPathInput.value || "").trim() || "showfiles/_template/show.json";
}

async function loadShowFromInput() {
  try {
    const showPath = requestedShowPath();
    await api("/api/show/load", "POST", { path: showPath });
    state.selectedSceneId = null;
    addLog(`show loaded -> ${showPath}`);
    await refreshStatus();
  } catch (error) {
    addLog(`show load failed: ${error.message}`);
  }
}

async function saveShow() {
  try {
    const data = await api("/api/show/save", "POST", {});
    addLog(`show saved -> ${data.path || state.status?.show?.path || "-"}`);
    await refreshStatus();
  } catch (error) {
    addLog(`show save failed: ${error.message}`);
  }
}

async function saveShowAs() {
  try {
    const showPath = requestedShowPath();
    await api("/api/show/save", "POST", {
      path: showPath,
      setAsCurrent: true
    });
    addLog(`show saved as -> ${showPath}`);
    await refreshStatus();
  } catch (error) {
    addLog(`show save-as failed: ${error.message}`);
  }
}

async function createNewShow() {
  const showPath = requestedShowPath();
  try {
    await api("/api/show/new", "POST", { path: showPath, overwrite: false });
    state.selectedSceneId = null;
    addLog(`show created -> ${showPath}`);
    await refreshStatus();
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("already exists")) {
      const confirmed = confirm(`Show file already exists at "${showPath}". Overwrite it?`);
      if (!confirmed) {
        addLog("new show cancelled");
        return;
      }
      try {
        await api("/api/show/new", "POST", { path: showPath, overwrite: true });
        state.selectedSceneId = null;
        addLog(`show overwritten -> ${showPath}`);
        await refreshStatus();
      } catch (overwriteError) {
        addLog(`new show failed: ${overwriteError.message}`);
      }
      return;
    }
    addLog(`new show failed: ${error.message}`);
  }
}

function setupHandlers() {
  els.viewPannerBtn.addEventListener("click", () => {
    setPage("panner");
  });

  els.viewObjectManagerBtn.addEventListener("click", () => {
    setPage("object-manager");
  });

  els.loadShowBtn.addEventListener("click", () => {
    void loadShowFromInput();
  });

  els.saveShowBtn.addEventListener("click", () => {
    void saveShow();
  });

  els.saveShowAsBtn.addEventListener("click", () => {
    void saveShowAs();
  });

  els.newShowBtn.addEventListener("click", () => {
    void createNewShow();
  });

  els.sceneSelectInput.addEventListener("change", () => {
    state.selectedSceneId = String(els.sceneSelectInput.value || "").trim() || null;
    renderShowControls();
  });

  els.loadSceneBtn.addEventListener("click", () => {
    void runSceneLoad();
  });

  els.saveSceneBtn.addEventListener("click", () => {
    void runSceneSave();
  });

  els.saveSceneAsBtn.addEventListener("click", () => {
    void runSceneSaveAs();
  });

  els.enableGroupsToggle.addEventListener("change", () => {
    void setGroupsEnabled(els.enableGroupsToggle.checked);
  });

  els.objectSelect.addEventListener("change", () => {
    setSingleSelection(els.objectSelect.value);
    renderAll();
  });

  els.applyObjectBtn.addEventListener("click", async () => {
    const objectIds = selectedObjectTargets();
    if (!objectIds.length) return;
    const patch = selectedObjectPatchFromInputs();
    await Promise.all(objectIds.map((id) => pushObjectPatch(id, patch)));
    addLog(`object patch -> ${objectIds.join(", ")}`);
    await refreshStatus();
  });

  els.managerObjectSelect.addEventListener("change", () => {
    setSingleSelection(els.managerObjectSelect.value);
    renderAll();
  });

  els.managerAddBtn.addEventListener("click", () => {
    void managerAddObject();
  });

  els.managerAddType.addEventListener("input", () => {
    if (String(els.managerAddId.value || "").trim()) return;
    const suggestedAddId = uniqueObjectId(suggestObjectBaseFromType(els.managerAddType.value || DEFAULT_OBJECT_TYPE));
    setInputValueIfIdle(els.managerAddId, suggestedAddId);
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

  els.managerGroupSelect.addEventListener("change", () => {
    state.selectedGroupId = els.managerGroupSelect.value || null;
    renderManager();
  });

  els.managerGroupCreateBtn.addEventListener("click", () => {
    void managerCreateGroup();
  });

  els.managerGroupUpdateBtn.addEventListener("click", () => {
    void managerUpdateGroup();
  });

  els.managerGroupDeleteBtn.addEventListener("click", () => {
    void managerDeleteGroup();
  });

  els.toggleDebugEventsBtn.addEventListener("click", () => {
    if (state.debugEventsEnabled) {
      if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
      }
      state.debugEventsEnabled = false;
      addLog("debug events stream disabled");
    } else {
      state.debugEventsEnabled = true;
      setupEventStream();
      addLog("debug events stream enabled");
    }
    renderDebugControls();
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
    if (event.button !== 0) return;

    const pt = toCanvasPoint(event);
    const singleObjectOverride = event.ctrlKey && !event.metaKey;
    state.activePointerId = event.pointerId;
    state.lastPointer = pt;
    const hit = pickObject(pt);
    state.pointerDownHitObjectId = hit?.obj.objectId || null;

    if (event.altKey) {
      state.orbiting = true;
      state.selectionBox.active = false;
    } else if (hit && (singleObjectOverride || !event.metaKey)) {
      if (!singleObjectOverride) {
        if (!isObjectSelected(hit.obj.objectId)) {
          setSingleSelection(hit.obj.objectId);
        } else if (state.selectedObjectId !== hit.obj.objectId) {
          state.selectedObjectId = hit.obj.objectId;
        }
      }
      state.selectionBox.active = false;
      state.orbiting = false;
      beginObjectDrag(hit.obj.objectId, pt, event.shiftKey, { singleObjectOnly: singleObjectOverride });
      renderAll();
    } else {
      const additive = event.metaKey;
      state.orbiting = false;
      state.selectionBox.active = true;
      state.selectionBox.additive = additive;
      state.selectionBox.startX = pt.x;
      state.selectionBox.startY = pt.y;
      state.selectionBox.currentX = pt.x;
      state.selectionBox.currentY = pt.y;
      state.selectionBox.baseSelection = additive ? [...selectedObjectTargets()] : [];
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
      const anchor = getObjectById(state.draggingObjectId);
      if (!anchor) return;

      const wantedMode = event.shiftKey ? "y" : "xz";
      if (state.draggingMode !== wantedMode) {
        configureDragMode(wantedMode, pt);
        state.lastPointer = pt;
        return;
      }

      if (state.draggingMode === "y") {
        const nextAnchorY = clampValue(state.draggingStartY - (pt.y - state.draggingStartPointerY) * 0.6, LIMITS.y);
        const patchByObjectId = {};
        const previousByObjectId = {};
        for (const objectId of state.draggingObjectIds) {
          const obj = getObjectById(objectId);
          if (!obj) continue;
          previousByObjectId[objectId] = { y: Number(obj.y) };
          const relY = Number(state.draggingRelativeY[objectId] || 0);
          const nextY = clampValue(nextAnchorY + relY, LIMITS.y);
          obj.y = nextY;
          patchByObjectId[objectId] = { y: nextY };
        }
        if (!state.dragSingleObjectOnly) {
          livePropagateGroupLinks(previousByObjectId, patchByObjectId);
        }
        renderInspector();
        renderManager();
        renderPanner();
        maybeSendDragBatch(patchByObjectId, { propagateGroupLinks: false });
      } else {
        const camera = getCameraBasis();
        const ray = screenRay(camera, pt.x, pt.y);
        const hitPoint = intersectRayPlaneY(ray, state.draggingPlaneY);
        if (hitPoint) {
          const nextAnchorX = clampValue(hitPoint.x + state.draggingOffsetXZ.x, LIMITS.x);
          const nextAnchorZ = clampValue(hitPoint.z + state.draggingOffsetXZ.z, LIMITS.z);
          const patchByObjectId = {};
          const previousByObjectId = {};
          for (const objectId of state.draggingObjectIds) {
            const obj = getObjectById(objectId);
            if (!obj) continue;
            previousByObjectId[objectId] = { x: Number(obj.x), z: Number(obj.z) };
            const relXZ = state.draggingRelativeXZ[objectId] || { x: 0, z: 0 };
            const nextX = clampValue(nextAnchorX + Number(relXZ.x || 0), LIMITS.x);
            const nextZ = clampValue(nextAnchorZ + Number(relXZ.z || 0), LIMITS.z);
            obj.x = nextX;
            obj.z = nextZ;
            patchByObjectId[objectId] = { x: nextX, z: nextZ };
          }
          if (!state.dragSingleObjectOnly) {
            livePropagateGroupLinks(previousByObjectId, patchByObjectId);
          }
          renderInspector();
          renderManager();
          renderPanner();
          maybeSendDragBatch(patchByObjectId, { propagateGroupLinks: false });
        }
      }
    } else if (state.orbiting) {
      state.camera.yawDeg = normalizeYaw(state.camera.yawDeg + dx * 0.25);
      state.camera.pitchDeg = clampValue(state.camera.pitchDeg - dy * 0.2, [8, 80]);
      syncCameraInputs();
      renderPanner();
    } else if (state.selectionBox.active) {
      state.selectionBox.currentX = pt.x;
      state.selectionBox.currentY = pt.y;
      if (Math.hypot(state.selectionBox.currentX - state.selectionBox.startX, state.selectionBox.currentY - state.selectionBox.startY) > 3) {
        applySelectionBox(state.selectionBox.additive);
      }
      renderPanner();
    }

    state.lastPointer = pt;
  });

  els.canvas.addEventListener("pointerup", async (event) => {
    if (state.currentPage !== "panner") return;
    if (state.activePointerId !== event.pointerId) return;
    if (state.draggingObjectId) {
      await finalizeObjectDrag();
      try {
        els.canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore release errors when pointer capture is already gone.
      }
      resetPointerInteraction();
    } else if (state.selectionBox.active) {
      finishSelectionInteraction(event);
    } else {
      try {
        els.canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore release errors when pointer capture is already gone.
      }
      resetPointerInteraction();
    }
    renderAll();
  });

  els.canvas.addEventListener("pointercancel", async (event) => {
    if (state.currentPage !== "panner") return;
    if (state.activePointerId !== event.pointerId) return;
    if (state.draggingObjectId) {
      await finalizeObjectDrag();
    }
    try {
      els.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release errors when pointer capture is already gone.
    }
    resetPointerInteraction();
    renderAll();
  });

  window.addEventListener("resize", () => {
    renderPanner();
  });
}

function setupEventStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  if (!state.debugEventsEnabled) return;

  const events = new EventSource("/api/events");
  state.eventSource = events;
  const types = ["status", "show", "scene", "object", "object_manager", "object_group", "action", "osc_in", "osc_out", "osc_error", "system"];

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
    if (!state.debugEventsEnabled) return;
    addLog("event stream disconnected, retrying...");
  };
}

async function start() {
  setUiStatus("Connecting...");
  syncCameraInputs();
  setPage("panner");
  setupHandlers();
  setupEventStream();
  await refreshStatus();

  setInterval(() => {
    if (state.activePointerId === null) {
      void refreshStatus();
    }
  }, 1000);
}

start();
