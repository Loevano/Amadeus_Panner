const LIMITS = {
  x: [-100, 100],
  y: [-100, 100],
  z: [-100, 100]
};

const OBJECT_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const ACTION_ID_RE = OBJECT_ID_RE;
const DEFAULT_OBJECT_TYPE = "point";
const DEFAULT_OBJECT_COLOR = "#1c4f89";
const DEFAULT_GROUP_COLOR = "#2f7f7a";
const RELATIVE_GROUP_PARAMS = new Set(["x", "y", "z"]);
const VIRTUAL_ALL_GROUP_ID = "all";
const VIRTUAL_ALL_GROUP_NAME = "All";

const CAMERA_DEFAULT = {
  yawDeg: 35,
  pitchDeg: 26,
  distance: 320,
  fovDeg: 56
};

const STATUS_POLL_TICK_MS = 1000;
const STATUS_RECONCILE_INTERVAL_MS = 15000;
const STATUS_EVENT_REFRESH_DEBOUNCE_MS = 80;
const SHOW_LIST_REFRESH_INTERVAL_MS = 10000;
const DEBUG_LOG_NOISY_TYPES = new Set(["object", "osc_out", "osc_in"]);
const DEBUG_LOG_NOISY_THROTTLE_MS = 250;
const LFO_PARAM_OPTIONS = ["x", "y", "z", "size", "gain"];
const LFO_POLARITIES = new Set(["bipolar", "unipolar"]);

const state = {
  status: null,
  selectedObjectId: null,
  selectedObjectIds: [],
  selectedGroupId: null,
  selectedSceneId: null,
  selectedActionId: null,
  selectedActionGroupId: null,
  selectedActionGroupEntryIndex: null,
  selectedActionGroupEntryGroupId: null,
  selectedActionLfoIndex: null,
  selectedActionLfoActionId: null,
  selectedActionLfoTargetIndex: null,
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
  pannerContextObjectId: null,
  debugEventsEnabled: false,
  lastDebugLogByTypeMs: {},
  eventSource: null,
  statusRefreshInFlight: false,
  statusRefreshQueued: false,
  statusRefreshTimerId: null,
  lastStatusRefreshMs: 0,
  showListRefreshInFlight: false,
  lastShowListRefreshMs: 0,
  runtimeFrameScheduled: false,
  runtimeFrameNeedsInspector: false,
  runtimeFrameNeedsManager: false,
  runtimeFrameNeedsActionDebug: false,
  actionLfoAutoApplyTimerId: null,
  actionLfoAutoApplyInFlight: false,
  actionLfoAutoApplyQueued: false,
  groupManagerDraft: {
    groupId: null,
    memberIds: null,
    linkParams: null
  },
  draftSuggestedIds: {
    action: "",
    actionGroup: "",
    objectGroup: ""
  },
  lfoDebugStatsByKey: {},
  lfoDebugLastValueByKey: {},
  lastLfoDebugEventByAction: {},
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
  viewActionManagerBtn: document.getElementById("viewActionManagerBtn"),
  viewActionGroupManagerBtn: document.getElementById("viewActionGroupManagerBtn"),
  viewModulationManagerBtn: document.getElementById("viewModulationManagerBtn"),
  viewObjectManagerBtn: document.getElementById("viewObjectManagerBtn"),
  viewGroupManagerBtn: document.getElementById("viewGroupManagerBtn"),
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
  managerGroupColor: document.getElementById("managerGroupColor"),
  managerGroupSummary: document.getElementById("managerGroupSummary"),
  managerGroupCreateBtn: document.getElementById("managerGroupCreateBtn"),
  managerGroupUpdateBtn: document.getElementById("managerGroupUpdateBtn"),
  managerGroupDeleteBtn: document.getElementById("managerGroupDeleteBtn"),
  managerGroupLinkInputs: Array.from(document.querySelectorAll(".manager-group-link")),
  actionManagerSummary: document.getElementById("actionManagerSummary"),
  modulationManagerSummary: document.getElementById("modulationManagerSummary"),
  actionManagerRows: document.getElementById("actionManagerRows"),
  actionManagerIdInput: document.getElementById("actionManagerIdInput"),
  actionManagerNameInput: document.getElementById("actionManagerNameInput"),
  actionManagerDurationInput: document.getElementById("actionManagerDurationInput"),
  actionManagerOnEndInput: document.getElementById("actionManagerOnEndInput"),
  actionManagerOscStartInput: document.getElementById("actionManagerOscStartInput"),
  actionManagerOscStopInput: document.getElementById("actionManagerOscStopInput"),
  actionManagerOscAbortInput: document.getElementById("actionManagerOscAbortInput"),
  actionManagerEnabledInput: document.getElementById("actionManagerEnabledInput"),
  actionManagerCreateBtn: document.getElementById("actionManagerCreateBtn"),
  actionManagerSaveBtn: document.getElementById("actionManagerSaveBtn"),
  actionManagerSaveAsBtn: document.getElementById("actionManagerSaveAsBtn"),
  actionManagerDeleteBtn: document.getElementById("actionManagerDeleteBtn"),
  actionGroupManagerSelect: document.getElementById("actionGroupManagerSelect"),
  actionGroupManagerIdInput: document.getElementById("actionGroupManagerIdInput"),
  actionGroupManagerNameInput: document.getElementById("actionGroupManagerNameInput"),
  actionGroupManagerOscTriggerInput: document.getElementById("actionGroupManagerOscTriggerInput"),
  actionGroupManagerEnabledInput: document.getElementById("actionGroupManagerEnabledInput"),
  actionGroupManagerCreateBtn: document.getElementById("actionGroupManagerCreateBtn"),
  actionGroupManagerSaveBtn: document.getElementById("actionGroupManagerSaveBtn"),
  actionGroupManagerDeleteBtn: document.getElementById("actionGroupManagerDeleteBtn"),
  actionGroupEntryTypeInput: document.getElementById("actionGroupEntryTypeInput"),
  actionGroupEntryActionSelect: document.getElementById("actionGroupEntryActionSelect"),
  actionGroupEntryLfoSelect: document.getElementById("actionGroupEntryLfoSelect"),
  actionGroupEntryLfosEnabledInput: document.getElementById("actionGroupEntryLfosEnabledInput"),
  actionGroupEntryNameInput: document.getElementById("actionGroupEntryNameInput"),
  actionGroupEntryAddBtn: document.getElementById("actionGroupEntryAddBtn"),
  actionGroupEntryTriggerBtn: document.getElementById("actionGroupEntryTriggerBtn"),
  actionGroupEntryClearBtn: document.getElementById("actionGroupEntryClearBtn"),
  actionGroupEntryRows: document.getElementById("actionGroupEntryRows"),
  actionGroupListSummary: document.getElementById("actionGroupListSummary"),
  actionGroupListRows: document.getElementById("actionGroupListRows"),
  actionManagerLfoIdInput: document.getElementById("actionManagerLfoIdInput"),
  actionManagerLfoWaveInput: document.getElementById("actionManagerLfoWaveInput"),
  actionManagerLfoRateInput: document.getElementById("actionManagerLfoRateInput"),
  actionManagerLfoDepthInput: document.getElementById("actionManagerLfoDepthInput"),
  actionManagerLfoOffsetInput: document.getElementById("actionManagerLfoOffsetInput"),
  actionManagerLfoPolarityBtn: document.getElementById("actionManagerLfoPolarityBtn"),
  actionManagerLfoEnabledInput: document.getElementById("actionManagerLfoEnabledInput"),
  actionManagerLfoAddBtn: document.getElementById("actionManagerLfoAddBtn"),
  actionManagerLfoAddTargetBtn: document.getElementById("actionManagerLfoAddTargetBtn"),
  actionManagerLfoClearBtn: document.getElementById("actionManagerLfoClearBtn"),
  actionManagerSelectedLfoSummary: document.getElementById("actionManagerSelectedLfoSummary"),
  actionManagerLfoTargetsSummary: document.getElementById("actionManagerLfoTargetsSummary"),
  actionManagerLfoTargetObjectInput: document.getElementById("actionManagerLfoTargetObjectInput"),
  actionManagerLfoTargetParamInput: document.getElementById("actionManagerLfoTargetParamInput"),
  actionManagerLfoTargetPhaseInput: document.getElementById("actionManagerLfoTargetPhaseInput"),
  actionManagerLfoTargetRows: document.getElementById("actionManagerLfoTargetRows"),
  actionManagerLfoRows: document.getElementById("actionManagerLfoRows"),
  actionManagerLfoDebugSummary: document.getElementById("actionManagerLfoDebugSummary"),
  actionManagerLfoDebugRows: document.getElementById("actionManagerLfoDebugRows"),
  groupManagerSummary: document.getElementById("groupManagerSummary"),
  groupManagerRows: document.getElementById("groupManagerRows"),
  groupManagerEditSelect: document.getElementById("groupManagerEditSelect"),
  groupManagerEditName: document.getElementById("groupManagerEditName"),
  groupManagerEditColor: document.getElementById("groupManagerEditColor"),
  groupManagerEditLinkInputs: Array.from(document.querySelectorAll(".group-manager-link-input")),
  groupManagerEditMembers: document.getElementById("groupManagerEditMembers"),
  groupManagerMembersSummary: document.getElementById("groupManagerMembersSummary"),
  groupManagerEditSummary: document.getElementById("groupManagerEditSummary"),
  groupManagerCreateBtn: document.getElementById("groupManagerCreateBtn"),
  groupManagerEditSaveBtn: document.getElementById("groupManagerEditSaveBtn"),
  groupManagerEditDeleteBtn: document.getElementById("groupManagerEditDeleteBtn"),
  toggleDebugEventsBtn: document.getElementById("toggleDebugEventsBtn"),
  debugEventsState: document.getElementById("debugEventsState"),
  eventLog: document.getElementById("eventLog"),
  canvas: document.getElementById("pannerCanvas"),
  pannerContextMenu: document.getElementById("pannerContextMenu")
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

function deriveIdBaseFromName(nameValue, fallbackBase = "item") {
  const normalizedName = normalizeObjectId(String(nameValue || "").toLowerCase());
  if (normalizedName) return normalizedName;
  const normalizedFallback = normalizeObjectId(String(fallbackBase || "").toLowerCase());
  return normalizedFallback || "item";
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

function normalizeObjectSeriesBase(baseId) {
  const normalized = normalizeObjectId(baseId);
  if (!normalized) return "";
  if (!normalized.startsWith("obj-")) return normalized;
  const numericTail = normalized.slice(4);
  if (!/^\d+(?:-\d+)+$/.test(numericTail)) return normalized;
  const firstPart = numericTail.split("-")[0] || "1";
  return `obj-${firstPart}`;
}

function uniqueObjectId(baseId) {
  return nextNumericId(
    normalizeObjectSeriesBase(baseId) || baseId,
    "obj",
    getObjects().map((obj) => obj.objectId)
  );
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

function suggestGroupColorFromSelection(objectIds) {
  const selectedObjects = (Array.isArray(objectIds) ? objectIds : [])
    .map((objectId) => getObjectById(objectId))
    .filter(Boolean);
  if (!selectedObjects.length) return DEFAULT_GROUP_COLOR;
  const uniqueColors = [
    ...new Set(selectedObjects.map((obj) => normalizeHexColor(obj.color, DEFAULT_OBJECT_COLOR)))
  ];
  if (uniqueColors.length === 1) {
    return uniqueColors[0];
  }
  return DEFAULT_GROUP_COLOR;
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

function getActionIds() {
  return Array.isArray(state.status?.show?.actionIds) ? state.status.show.actionIds : [];
}

function uniqueActionId(baseId) {
  return nextNumericId(baseId, "action", getActionIds());
}

function getActionGroupIds() {
  return Array.isArray(state.status?.show?.actionGroupIds) ? state.status.show.actionGroupIds : [];
}

function uniqueActionGroupId(baseId) {
  return nextNumericId(baseId, "group", getActionGroupIds());
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

function sanitizeActionId(raw, options = {}) {
  const { allowAuto = false, allowEmpty = false } = options;
  const normalized = normalizeObjectId(raw);
  if (!normalized && allowEmpty) {
    return "";
  }
  const candidate = allowAuto ? uniqueActionId(normalized || "action") : normalized;
  if (!ACTION_ID_RE.test(candidate)) {
    throw new Error("Action ID must use letters/numbers/dot/underscore/dash (max 64 chars)");
  }
  return candidate;
}

function sanitizeActionGroupId(raw, options = {}) {
  const { allowAuto = false, allowEmpty = false } = options;
  const normalized = normalizeObjectId(raw);
  if (!normalized && allowEmpty) {
    return "";
  }
  const candidate = allowAuto ? uniqueActionGroupId(normalized || "group") : normalized;
  if (!ACTION_ID_RE.test(candidate)) {
    throw new Error("Action group ID must use letters/numbers/dot/underscore/dash (max 64 chars)");
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

  const lineEl = document.createElement("div");
  lineEl.className = "log-line";
  lineEl.textContent = String(line);
  els.eventLog.appendChild(lineEl);
  while (els.eventLog.childElementCount > 160 && els.eventLog.firstElementChild) {
    els.eventLog.removeChild(els.eventLog.firstElementChild);
  }
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

function shouldLogEventType(eventType) {
  if (!eventType) return false;
  if (eventType === "osc_error") return true;
  if (!state.debugEventsEnabled) return false;
  if (!DEBUG_LOG_NOISY_TYPES.has(eventType)) return true;

  const nowMs = Date.now();
  const lastMs = Number(state.lastDebugLogByTypeMs[eventType] || 0);
  if ((nowMs - lastMs) < DEBUG_LOG_NOISY_THROTTLE_MS) {
    return false;
  }
  state.lastDebugLogByTypeMs[eventType] = nowMs;
  return true;
}

function renderDebugControls() {
  els.toggleDebugEventsBtn.textContent = state.debugEventsEnabled ? "Disable Debug Log" : "Enable Debug Log";
  els.debugEventsState.textContent = state.debugEventsEnabled ? "Debug log on (sync on)" : "Debug log off (sync on)";
}

function scheduleStatusRefresh(delayMs = 0) {
  if (state.statusRefreshTimerId !== null) return;
  state.statusRefreshTimerId = setTimeout(() => {
    state.statusRefreshTimerId = null;
    void refreshStatus();
  }, Math.max(0, Number(delayMs) || 0));
}

function scheduleRuntimeFrame(options = {}) {
  state.runtimeFrameNeedsInspector = state.runtimeFrameNeedsInspector || Boolean(options.inspector);
  state.runtimeFrameNeedsManager = state.runtimeFrameNeedsManager || Boolean(options.manager);
  state.runtimeFrameNeedsActionDebug = state.runtimeFrameNeedsActionDebug || Boolean(options.actionDebug);
  if (state.runtimeFrameScheduled) return;

  state.runtimeFrameScheduled = true;
  requestAnimationFrame(() => {
    state.runtimeFrameScheduled = false;

    renderPanner();
    if (state.runtimeFrameNeedsInspector) {
      renderInspector();
    }
    if (state.runtimeFrameNeedsManager) {
      renderManager();
    }
    if (state.runtimeFrameNeedsActionDebug) {
      renderSelectedActionLfoDebug();
    }

    state.runtimeFrameNeedsInspector = false;
    state.runtimeFrameNeedsManager = false;
    state.runtimeFrameNeedsActionDebug = false;
  });
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

function getActionsById() {
  const actionsById = state.status?.show?.actionsById;
  return actionsById && typeof actionsById === "object" ? actionsById : {};
}

function getGlobalLfosById() {
  const globalLfosById = state.status?.show?.globalLfosById;
  return globalLfosById && typeof globalLfosById === "object" ? globalLfosById : {};
}

function getActionById(actionId) {
  const normalized = String(actionId || "").trim();
  if (!normalized) return null;
  return getActionsById()[normalized] || null;
}

function getActionGroupsById() {
  const actionGroupsById = state.status?.show?.actionGroupsById;
  return actionGroupsById && typeof actionGroupsById === "object" ? actionGroupsById : {};
}

function getActionGroupById(groupId) {
  const normalized = String(groupId || "").trim();
  if (!normalized) return null;
  return getActionGroupsById()[normalized] || null;
}

function closePannerContextMenu() {
  if (!els.pannerContextMenu) return;
  if (els.pannerContextMenu.hidden) return;
  els.pannerContextMenu.hidden = true;
  els.pannerContextMenu.innerHTML = "";
  state.pannerContextObjectId = null;
}

function createPannerMenuItem(label, options = {}) {
  const disabled = Boolean(options.disabled);
  const submenu = options.submenu instanceof HTMLElement ? options.submenu : null;
  const onClick = typeof options.onClick === "function" ? options.onClick : null;

  const item = document.createElement("div");
  item.className = "panner-menu-item";
  if (disabled) {
    item.classList.add("is-disabled");
  }
  item.textContent = String(label || "");

  if (submenu) {
    item.classList.add("has-submenu");
    item.appendChild(submenu);
  } else if (onClick && !disabled) {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
  }

  return item;
}

async function toggleObjectGroupMembershipFromPanner(objectId, groupId) {
  try {
    const targetObjectId = String(objectId || "").trim();
    const targetGroupId = String(groupId || "").trim();
    if (!targetObjectId || !targetGroupId) return;

    const group = getObjectGroups().find((candidate) => String(candidate.groupId || "").trim() === targetGroupId);
    if (!group) {
      throw new Error(`Group not found: ${targetGroupId}`);
    }

    const currentMembers = Array.isArray(group.objectIds) ? [...new Set(group.objectIds.map((memberId) => String(memberId || "").trim()).filter(Boolean))] : [];
    const isMember = currentMembers.includes(targetObjectId);
    const nextMembers = isMember
      ? currentMembers.filter((memberId) => memberId !== targetObjectId)
      : [...currentMembers, targetObjectId];
    nextMembers.sort((a, b) => a.localeCompare(b));

    await api(`/api/groups/${encodeURIComponent(targetGroupId)}/update`, "POST", { objectIds: nextMembers });
    state.selectedGroupId = targetGroupId;
    addLog(`group ${isMember ? "remove" : "add"} member -> ${targetObjectId} ${isMember ? "from" : "to"} ${targetGroupId}`);
    closePannerContextMenu();
    await refreshStatus();
  } catch (error) {
    addLog(`panner group update failed: ${error.message}`);
    await refreshStatus();
  }
}

function normalizeLfoPolarity(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (LFO_POLARITIES.has(normalized)) {
    return normalized;
  }
  return "bipolar";
}

function lfoHasAssignedTarget(lfo) {
  const objectId = String(lfo?.objectId || lfo?.object_id || "").trim();
  const parameter = String(lfo?.parameter || "").trim();
  return Boolean(objectId && LFO_PARAM_OPTIONS.includes(parameter));
}

function lfoTargetLabel(lfo) {
  if (!lfoHasAssignedTarget(lfo)) {
    return "";
  }
  const objectId = String(lfo?.objectId || lfo?.object_id || "").trim();
  const parameter = String(lfo?.parameter || "").trim();
  return `${objectId}.${parameter}`;
}

function lfoSignature(lfo) {
  const source = lfo && typeof lfo === "object" ? lfo : {};
  const wave = String(source.wave || "sine").trim().toLowerCase();
  const rateHz = parseFiniteNumber(source.rateHz, 0).toFixed(6);
  const depth = parseFiniteNumber(source.depth, 0).toFixed(6);
  const offset = parseFiniteNumber(source.offset, 0).toFixed(6);
  const phaseDeg = parseFiniteNumber(source.phaseDeg, 0).toFixed(6);
  const polarity = normalizeLfoPolarity(source.polarity);
  return [wave, rateHz, depth, offset, phaseDeg, polarity].join("|");
}

function lfoDisplayId(lfo, fallback = "") {
  const source = lfo && typeof lfo === "object" ? lfo : {};
  const rawId = String(source.lfoId || source.lfo_id || fallback || "").trim();
  return rawId;
}

function lfoSelectorKey(lfo, fallback = "") {
  const lfoId = lfoDisplayId(lfo, fallback);
  if (lfoId) return `id:${lfoId}`;
  return `sig:${lfoSignature(lfo)}`;
}

function updateLfoPolarityButton(polarity) {
  if (!els.actionManagerLfoPolarityBtn) return;
  const normalized = normalizeLfoPolarity(polarity);
  els.actionManagerLfoPolarityBtn.dataset.polarity = normalized;
  els.actionManagerLfoPolarityBtn.textContent = normalized === "unipolar" ? "Unipolar" : "Bipolar";
  els.actionManagerLfoPolarityBtn.setAttribute("aria-pressed", normalized === "unipolar" ? "true" : "false");
}

function collectLfoGroups(lfos = []) {
  const groupsBySelector = new Map();
  for (let index = 0; index < lfos.length; index += 1) {
    const lfo = lfos[index] || {};
    const fallbackId = `lfo-${index + 1}`;
    const selector = lfoSelectorKey(lfo, fallbackId);
    let group = groupsBySelector.get(selector);
    if (!group) {
      const lfoId = lfoDisplayId(lfo, fallbackId) || fallbackId;
      group = {
        selector,
        lfoId,
        representativeIndex: index,
        lfo,
        entryIndices: [],
        targetLabels: [],
        targetCount: 0
      };
      groupsBySelector.set(selector, group);
    }
    group.entryIndices.push(index);
    const targetLabel = lfoTargetLabel(lfo);
    if (targetLabel) {
      group.targetCount += 1;
      if (!group.targetLabels.includes(targetLabel)) {
        group.targetLabels.push(targetLabel);
      }
    }
  }
  return Array.from(groupsBySelector.values())
    .sort((a, b) => a.lfoId.localeCompare(b.lfoId));
}

async function upsertActionLfoTargetMapping(actionId, selectorKey, objectId, parameter, options = {}) {
  const normalizedActionId = String(actionId || "").trim();
  const normalizedSelectorKey = String(selectorKey || "").trim();
  const normalizedObjectId = String(objectId || "").trim();
  const normalizedParam = String(parameter || "").trim();
  const normalizedPhaseInput = parseFiniteNumber(options.mappingPhaseDeg, Number.NaN);
  const hasPhaseInput = Number.isFinite(normalizedPhaseInput);

  if (!normalizedActionId || !normalizedSelectorKey || !normalizedObjectId || !LFO_PARAM_OPTIONS.includes(normalizedParam)) {
    throw new Error("Invalid LFO mapping request");
  }

  const action = getActionById(normalizedActionId);
  if (!action) {
    throw new Error(`Action not found: ${normalizedActionId}`);
  }

  const lfos = Array.isArray(action.lfos) ? action.lfos : [];
  const sourceIndex = lfos.findIndex((candidate, candidateIndex) => {
    const fallbackId = `lfo-${candidateIndex + 1}`;
    return lfoSelectorKey(candidate, fallbackId) === normalizedSelectorKey;
  });
  if (sourceIndex < 0) {
    throw new Error(`LFO not found: ${normalizedActionId}`);
  }
  const sourceLfo = lfos[sourceIndex] || {};

  const existingIndex = lfos.findIndex((candidate, candidateIndex) => {
    const fallbackId = `lfo-${candidateIndex + 1}`;
    if (lfoSelectorKey(candidate, fallbackId) !== normalizedSelectorKey) return false;
    const candidateObjectId = String(candidate?.objectId || "").trim();
    const candidateParam = String(candidate?.parameter || "").trim();
    return candidateObjectId === normalizedObjectId && candidateParam === normalizedParam;
  });

  let nextLfos = null;
  let mappingPhaseDeg = 0;
  let created = false;

  if (existingIndex >= 0) {
    const currentLfo = lfos[existingIndex] || {};
    mappingPhaseDeg = hasPhaseInput
      ? normalizedPhaseInput
      : parseFiniteNumber(currentLfo.mappingPhaseDeg, 0);
    nextLfos = [...lfos];
    nextLfos[existingIndex] = {
      ...currentLfo,
      objectId: normalizedObjectId,
      parameter: normalizedParam,
      mappingPhaseDeg
    };
  } else {
    mappingPhaseDeg = hasPhaseInput
      ? normalizedPhaseInput
      : parseFiniteNumber(sourceLfo.mappingPhaseDeg, 0);
    const linkedLfo = {
      ...(sourceLfo || {}),
      objectId: normalizedObjectId,
      parameter: normalizedParam,
      mappingPhaseDeg
    };
    nextLfos = [...lfos, linkedLfo];
    created = true;
  }

  await api(`/api/action/${encodeURIComponent(normalizedActionId)}/update`, "POST", { lfos: nextLfos });
  state.selectedActionId = normalizedActionId;
  state.selectedActionLfoActionId = normalizedActionId;
  const nextGroups = collectLfoGroups(nextLfos);
  const selectedGroup = nextGroups.find((group) => group.selector === normalizedSelectorKey) || null;
  state.selectedActionLfoIndex = selectedGroup ? selectedGroup.representativeIndex : null;
  const selectedTargetIndex = nextLfos.findIndex((candidate, candidateIndex) => {
    const fallbackId = `lfo-${candidateIndex + 1}`;
    if (lfoSelectorKey(candidate, fallbackId) !== normalizedSelectorKey) return false;
    const candidateObjectId = String(candidate?.objectId || "").trim();
    const candidateParam = String(candidate?.parameter || "").trim();
    return candidateObjectId === normalizedObjectId && candidateParam === normalizedParam;
  });
  state.selectedActionLfoTargetIndex = selectedTargetIndex >= 0 ? selectedTargetIndex : null;
  return {
    actionId: normalizedActionId,
    objectId: normalizedObjectId,
    parameter: normalizedParam,
    mappingPhaseDeg,
    created
  };
}

async function linkActionLfoTargetFromPanner(actionId, selectorKey, objectId, parameter, options = {}) {
  try {
    const result = await upsertActionLfoTargetMapping(actionId, selectorKey, objectId, parameter, options);
    if (result.created) {
      addLog(`action lfo link -> ${result.actionId} ${result.objectId}.${result.parameter} (phase ${result.mappingPhaseDeg}°)`);
    } else {
      addLog(`action lfo mapping phase -> ${result.actionId} ${result.objectId}.${result.parameter} = ${result.mappingPhaseDeg}°`);
    }
    if (options.closeContextMenu !== false) {
      closePannerContextMenu();
    }
    await refreshStatus();
  } catch (error) {
    addLog(`panner lfo link failed: ${error.message}`);
    await refreshStatus();
  }
}

function buildGroupContextSubmenu(objectId) {
  const submenu = document.createElement("div");
  submenu.className = "panner-submenu";

  const groups = [...getObjectGroups()].sort((a, b) => String(a.groupId || "").localeCompare(String(b.groupId || "")));
  if (!groups.length) {
    submenu.appendChild(createPannerMenuItem("No groups", { disabled: true }));
    return submenu;
  }

  for (const group of groups) {
    const groupId = String(group.groupId || "").trim();
    if (!groupId) continue;
    const members = Array.isArray(group.objectIds) ? group.objectIds.map((memberId) => String(memberId || "").trim()) : [];
    const isMember = members.includes(objectId);
    const enabledSuffix = group.enabled === false ? " [off]" : "";
    const label = `${isMember ? "✓ " : ""}${groupId}${enabledSuffix}`;
    submenu.appendChild(createPannerMenuItem(label, {
      onClick: () => {
        void toggleObjectGroupMembershipFromPanner(objectId, groupId);
      }
    }));
  }

  return submenu;
}

function collectActionLfoEntries() {
  const entries = [];
  const actionsById = getActionsById();
  const actionIds = Object.keys(actionsById).sort((a, b) => a.localeCompare(b));
  for (const actionId of actionIds) {
    const action = actionsById[actionId] || {};
    const lfos = Array.isArray(action.lfos) ? action.lfos : [];
    const groups = collectLfoGroups(lfos);
    for (const group of groups) {
      entries.push({
        actionId,
        index: group.representativeIndex,
        lfo: group.lfo,
        selector: group.selector,
        lfoId: group.lfoId,
        targetCount: group.targetCount,
        targets: group.targetLabels,
        action
      });
    }
  }
  return entries
    .sort((a, b) => String(a.actionId || "").localeCompare(String(b.actionId || "")) || (a.index - b.index));
}

function buildLfoParamSubmenu(objectId, entry) {
  const submenu = document.createElement("div");
  submenu.className = "panner-submenu";

  const action = getActionById(entry?.actionId);
  const lfos = Array.isArray(action?.lfos) ? action.lfos : [];
  const targetObjectId = String(objectId || "").trim();
  const selector = String(entry?.selector || "").trim();
  for (const param of LFO_PARAM_OPTIONS) {
    const isLinked = lfos.some((candidate, candidateIndex) => {
      if (lfoSelectorKey(candidate, `lfo-${candidateIndex + 1}`) !== selector) return false;
      const candidateObjectId = String(candidate?.objectId || "").trim();
      const candidateParam = String(candidate?.parameter || "").trim();
      return candidateObjectId === targetObjectId && candidateParam === param;
    });
    const label = `${isLinked ? "✓ " : ""}${param}`;
    submenu.appendChild(createPannerMenuItem(label, {
      onClick: () => {
        void linkActionLfoTargetFromPanner(entry.actionId, selector, targetObjectId, param);
      }
    }));
  }

  return submenu;
}

function buildLfoContextSubmenu(objectId) {
  const submenu = document.createElement("div");
  submenu.className = "panner-submenu";

  const entries = collectActionLfoEntries();
  if (!entries.length) {
    submenu.appendChild(createPannerMenuItem("No LFOs in actions", { disabled: true }));
    return submenu;
  }

  for (const entry of entries) {
    const lfo = entry && entry.lfo && typeof entry.lfo === "object" ? entry.lfo : {};
    const wave = String(lfo.wave || "sine");
    const rateHz = parseFiniteNumber(lfo.rateHz, 0).toFixed(3);
    const targetLabel = entry.targets.slice(0, 2).join(", ");
    const moreSuffix = entry.targetCount > 2 ? ` +${entry.targetCount - 2}` : "";
    const targetSummary = entry.targetCount ? `${targetLabel}${moreSuffix}` : "no targets";
    const lfoId = String(entry.lfoId || `lfo-${entry.index + 1}`);
    const label = `${entry.actionId} ${lfoId} (${wave} ${rateHz}Hz) [${targetSummary}]`;
    submenu.appendChild(createPannerMenuItem(label, {
      submenu: buildLfoParamSubmenu(objectId, entry)
    }));
  }

  return submenu;
}

function openPannerContextMenu(objectId, clientX, clientY) {
  const targetObjectId = String(objectId || "").trim();
  if (!targetObjectId || !els.pannerContextMenu) return;

  const menu = els.pannerContextMenu;
  menu.innerHTML = "";

  const title = document.createElement("p");
  title.className = "panner-context-title";
  title.textContent = `Object: ${targetObjectId}`;
  menu.appendChild(title);

  menu.appendChild(createPannerMenuItem("Groups", {
    submenu: buildGroupContextSubmenu(targetObjectId)
  }));
  menu.appendChild(createPannerMenuItem("LFOs", {
    submenu: buildLfoContextSubmenu(targetObjectId)
  }));

  state.pannerContextObjectId = targetObjectId;
  menu.hidden = false;
  menu.style.left = `${Math.round(clientX)}px`;
  menu.style.top = `${Math.round(clientY)}px`;

  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const clampedLeft = Math.max(margin, Math.min(clientX, window.innerWidth - rect.width - margin));
  const clampedTop = Math.max(margin, Math.min(clientY, window.innerHeight - rect.height - margin));
  menu.style.left = `${Math.round(clampedLeft)}px`;
  menu.style.top = `${Math.round(clampedTop)}px`;
}

function areGroupsEnabled() {
  return state.status?.groupsEnabled !== false;
}

function areLfosEnabled() {
  return state.status?.lfosEnabled !== false;
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

function maybeRefreshShowList(previousPath, nextPath) {
  const previous = String(previousPath || "").trim();
  const next = String(nextPath || "").trim();
  const now = Date.now();
  const dueByPathChange = previous !== next;
  const dueByInterval = !state.lastShowListRefreshMs || (now - state.lastShowListRefreshMs) >= SHOW_LIST_REFRESH_INTERVAL_MS;
  if (!dueByPathChange && !dueByInterval) return;
  if (state.showListRefreshInFlight) return;

  state.showListRefreshInFlight = true;
  void refreshShowList().finally(() => {
    state.lastShowListRefreshMs = Date.now();
    state.showListRefreshInFlight = false;
  });
}

function applyObjectRuntimeUpdate(payload) {
  if (!state.status || !payload || typeof payload !== "object") return;
  const object = payload.object;
  if (!object || typeof object !== "object") return;

  const objectId = String(object.objectId || object.object_id || "").trim();
  if (!objectId) return;

  const objects = Array.isArray(state.status.objects) ? [...state.status.objects] : [];
  const nextObject = { ...object, objectId };
  const index = objects.findIndex((candidate) => String(candidate?.objectId || "").trim() === objectId);
  if (index >= 0) {
    objects[index] = nextObject;
  } else {
    objects.push(nextObject);
  }
  state.status.objects = objects;

  scheduleRuntimeFrame({
    inspector: state.selectedObjectId === objectId,
    manager: state.currentPage === "object-manager",
    actionDebug: state.currentPage === "modulation-manager"
  });
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

function groupColorOrNull(group) {
  const raw = String(group?.color || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  return null;
}

function isColorLinkedForGroup(group) {
  const linkParams = Array.isArray(group?.linkParams) ? group.linkParams : [];
  return linkParams.includes("color");
}

function effectiveGroupColorForObject(objectId) {
  if (!areGroupsEnabled()) return null;
  const targetId = String(objectId || "").trim();
  if (!targetId) return null;

  const groups = [...getObjectGroups()]
    .filter((group) => isGroupEnabled(group))
    .sort((a, b) => String(a.groupId || "").localeCompare(String(b.groupId || "")));

  for (const group of groups) {
    const members = Array.isArray(group.objectIds) ? group.objectIds : [];
    if (!members.includes(targetId)) continue;
    if (!isColorLinkedForGroup(group)) continue;
    const color = groupColorOrNull(group);
    if (color) return color;
  }
  return null;
}

function effectiveObjectColor(obj) {
  const baseColor = normalizeHexColor(obj?.color, DEFAULT_OBJECT_COLOR);
  return effectiveGroupColorForObject(obj?.objectId) || baseColor;
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
  closePannerContextMenu();
  state.currentPage = nextPage;
  els.mainLayout.dataset.page = nextPage;
  els.viewPannerBtn.classList.toggle("is-active", nextPage === "panner");
  els.viewActionManagerBtn.classList.toggle("is-active", nextPage === "action-manager");
  els.viewActionGroupManagerBtn.classList.toggle("is-active", nextPage === "action-group-manager");
  els.viewModulationManagerBtn.classList.toggle("is-active", nextPage === "modulation-manager");
  els.viewObjectManagerBtn.classList.toggle("is-active", nextPage === "object-manager");
  els.viewGroupManagerBtn.classList.toggle("is-active", nextPage === "group-manager");
  els.viewPannerBtn.setAttribute("aria-selected", nextPage === "panner" ? "true" : "false");
  els.viewActionManagerBtn.setAttribute("aria-selected", nextPage === "action-manager" ? "true" : "false");
  els.viewActionGroupManagerBtn.setAttribute("aria-selected", nextPage === "action-group-manager" ? "true" : "false");
  els.viewModulationManagerBtn.setAttribute("aria-selected", nextPage === "modulation-manager" ? "true" : "false");
  els.viewObjectManagerBtn.setAttribute("aria-selected", nextPage === "object-manager" ? "true" : "false");
  els.viewGroupManagerBtn.setAttribute("aria-selected", nextPage === "group-manager" ? "true" : "false");
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
    const baseColor = effectiveObjectColor(item.obj);
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

  els.statusLine.textContent = `Mode: ${status.mode} | Scene: ${status.activeSceneId || "-"} | LFOs: ${status.lfosEnabled === false ? "off" : "on"} | OSC out/in: ${status.osc.outboundCount}/${status.osc.inboundCount} | HTTP ${status.server.host}:${status.server.httpPort}`;
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
  const actionsById = getActionsById();
  const runningActions = new Set(Array.isArray(state.status?.runningActions) ? state.status.runningActions : []);
  for (const actionId of status.show.actionIds) {
    const action = actionsById[actionId] || null;
    const enabled = action?.enabled !== false;
    const isRunning = runningActions.has(actionId);
    const row = document.createElement("div");
    row.className = "action-chip";

    const title = document.createElement("strong");
    title.textContent = enabled ? actionId : `${actionId} [off]`;
    row.appendChild(title);

    const start = document.createElement("button");
    start.type = "button";
    start.textContent = "Start";
    start.disabled = !enabled || isRunning;
    start.addEventListener("click", () => runAction(actionId, "start"));
    row.appendChild(start);

    const stop = document.createElement("button");
    stop.type = "button";
    stop.textContent = "Stop";
    stop.disabled = !isRunning;
    stop.addEventListener("click", () => runAction(actionId, "stop"));
    row.appendChild(stop);

    const abort = document.createElement("button");
    abort.type = "button";
    abort.textContent = "Abort";
    abort.className = "danger";
    abort.disabled = !isRunning;
    abort.addEventListener("click", () => runAction(actionId, "abort"));
    row.appendChild(abort);

    els.actionButtons.appendChild(row);
  }

  const actionGroupsById = getActionGroupsById();
  const actionGroupIds = Array.isArray(status.show.actionGroupIds)
    ? [...status.show.actionGroupIds]
    : Object.keys(actionGroupsById).sort((a, b) => a.localeCompare(b));
  for (const groupId of actionGroupIds) {
    const group = actionGroupsById[groupId] || null;
    const enabled = group?.enabled !== false;
    const row = document.createElement("div");
    row.className = "action-chip";

    const title = document.createElement("strong");
    title.textContent = enabled ? `Group: ${groupId}` : `Group: ${groupId} [off]`;
    row.appendChild(title);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = "Trigger";
    trigger.disabled = !enabled;
    trigger.addEventListener("click", async () => {
      try {
        await api(`/api/action-group/${encodeURIComponent(groupId)}/trigger`, "POST", {});
        addLog(`action group trigger -> ${groupId}`);
        await refreshStatus();
      } catch (error) {
        addLog(`action group trigger failed: ${error.message}`);
        await refreshStatus();
      }
    });
    row.appendChild(trigger);

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

function parseFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMs(ms) {
  const numeric = Number(ms);
  if (!Number.isFinite(numeric) || numeric < 0) return "-";
  return `${(numeric / 1000).toFixed(2)}s`;
}

function lfoDebugKey(actionId, objectId, parameter, index) {
  return `${actionId}:${index}:${objectId}:${parameter}`;
}

function clearLfoDebugStats(actionId) {
  const prefix = `${String(actionId || "").trim()}:`;
  if (!prefix || prefix === ":") return;
  for (const key of Object.keys(state.lfoDebugStatsByKey)) {
    if (key.startsWith(prefix)) {
      delete state.lfoDebugStatsByKey[key];
    }
  }
  for (const key of Object.keys(state.lfoDebugLastValueByKey)) {
    if (key.startsWith(prefix)) {
      delete state.lfoDebugLastValueByKey[key];
    }
  }
}

function getObjectParamNumber(objectId, parameter) {
  const object = getObjectById(objectId);
  if (!object || !parameter) return null;
  const value = Number(object[parameter]);
  return Number.isFinite(value) ? value : null;
}

function applyLfoDebugSamples(payload) {
  if (!payload || typeof payload !== "object") return;
  const actionId = String(payload.actionId || "").trim();
  if (!actionId) return;
  const samples = Array.isArray(payload.samples) ? payload.samples : [];

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!sample || typeof sample !== "object") continue;
    const objectId = String(sample.objectId || "").trim();
    const parameter = String(sample.parameter || "").trim();
    if (!objectId || !parameter) continue;

    const value = Number(sample.value);
    if (!Number.isFinite(value)) continue;
    const key = lfoDebugKey(actionId, objectId, parameter, index);
    state.lfoDebugLastValueByKey[key] = value;

    let stats = state.lfoDebugStatsByKey[key];
    if (!stats) {
      stats = { min: value, max: value, last: value };
    } else {
      const min = Number.isFinite(stats.min) ? stats.min : value;
      const max = Number.isFinite(stats.max) ? stats.max : value;
      stats.min = Math.min(min, value);
      stats.max = Math.max(max, value);
      stats.last = value;
    }
    state.lfoDebugStatsByKey[key] = stats;
  }
}

function selectedActionIdOrThrow() {
  const actionId = String(
    state.selectedActionId || ""
  ).trim();
  if (!actionId) {
    throw new Error("No action selected");
  }
  return actionId;
}

function selectedActionOrNull() {
  const actionId = String(state.selectedActionId || "").trim();
  if (!actionId) return null;
  return getActionById(actionId);
}

function defaultActionOscPath(actionId, verb) {
  return `/art/action/${actionId}/${verb}`;
}

function defaultActionGroupOscPath(groupId) {
  return `/art/action-group/${groupId}/trigger`;
}

function selectedActionGroupIdOrThrow() {
  const groupId = String(state.selectedActionGroupId || els.actionGroupManagerSelect?.value || "").trim();
  if (!groupId) {
    throw new Error("No action group selected");
  }
  return groupId;
}

function selectedActionGroupOrNull() {
  const groupId = String(state.selectedActionGroupId || "").trim();
  if (!groupId) return null;
  return getActionGroupById(groupId);
}

function describeActionGroupEntry(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const entryType = String(source.entryType || "").trim();
  if (entryType === "lfosEnabled") {
    const enabled = source.enabled !== false;
    return {
      name: enabled ? "Enable all LFOs" : "Disable all LFOs",
      detail: enabled ? "Global LFO state -> enabled" : "Global LFO state -> disabled"
    };
  }
  if (entryType === "actionLfoEnabled") {
    const enabled = source.enabled !== false;
    const actionId = String(source.actionId || "").trim() || "-";
    const lfoId = String(source.lfoId || "").trim() || "-";
    return {
      name: `${enabled ? "Enable" : "Disable"} ${actionId}.${lfoId}`,
      detail: `Global LFO ${enabled ? "enable" : "disable"} -> ${lfoId} (entry action: ${actionId})`
    };
  }
  const actionId = String(source.actionId || "").trim() || "-";
  const command = String(source.command || "start").trim().toLowerCase();
  const commandLabel = command === "stop" ? "Stop" : (command === "abort" ? "Abort" : "Start");
  return {
    name: `${commandLabel} ${actionId}`,
    detail: `Action ${command} -> ${actionId}`
  };
}

function actionGroupEntryTypeInputValue(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const entryType = String(source.entryType || "").trim();
  if (entryType === "lfosEnabled") {
    return source.enabled === false ? "lfos-disable" : "lfos-enable";
  }
  if (entryType === "actionLfoEnabled") {
    return source.enabled === false ? "action-lfo-disable" : "action-lfo-enable";
  }
  const command = String(source.command || "start").trim().toLowerCase();
  if (command === "stop") return "action-stop";
  if (command === "abort") return "action-abort";
  return "action-start";
}

function actionGroupEntryTypeLabel(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const entryType = String(source.entryType || "").trim();
  if (entryType === "lfosEnabled") {
    return "Global LFO State";
  }
  if (entryType === "actionLfoEnabled") {
    return source.enabled === false ? "Disable Global LFO" : "Enable Global LFO";
  }
  const command = String(source.command || "start").trim().toLowerCase();
  if (command === "stop") return "Stop Action";
  if (command === "abort") return "Abort Action";
  return "Start Action";
}

function actionGroupEntryTargetLabel(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const entryType = String(source.entryType || "").trim();
  if (entryType === "lfosEnabled") {
    return source.enabled === false ? "Disable all LFOs" : "Enable all LFOs";
  }
  if (entryType === "actionLfoEnabled") {
    const actionId = String(source.actionId || "").trim() || "-";
    const lfoId = String(source.lfoId || "").trim() || "-";
    return `${actionId}.${lfoId}`;
  }
  return String(source.actionId || "").trim() || "-";
}

function setSelectValueIfOptionExists(selectElement, value, fallbackValue = null) {
  if (!(selectElement instanceof HTMLSelectElement)) return;
  const optionValues = new Set(Array.from(selectElement.options).map((option) => String(option.value || "").trim()));
  const nextValue = String(value || "").trim();
  if (nextValue && optionValues.has(nextValue)) {
    selectElement.value = nextValue;
    return;
  }
  if (fallbackValue === null || fallbackValue === undefined) return;
  const fallback = String(fallbackValue || "").trim();
  if (optionValues.has(fallback)) {
    selectElement.value = fallback;
  }
}

function reflectActionGroupEntryToInputs(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  setSelectValueIfOptionExists(
    els.actionGroupEntryTypeInput,
    actionGroupEntryTypeInputValue(source),
    "action-start"
  );
  setSelectValueIfOptionExists(els.actionGroupEntryActionSelect, String(source.actionId || "").trim());
  setSelectValueIfOptionExists(els.actionGroupEntryLfoSelect, String(source.lfoId || "").trim());
  if (String(source.entryType || "").trim() === "lfosEnabled") {
    setSelectValueIfOptionExists(
      els.actionGroupEntryLfosEnabledInput,
      source.enabled === false ? "false" : "true",
      "true"
    );
  }
  updateActionGroupEntryInputsState();
}

function updateActionGroupEntryNamePreview() {
  if (!els.actionGroupEntryNameInput) return;
  try {
    const entry = actionGroupEntryPayloadFromInputs();
    const description = describeActionGroupEntry(entry);
    els.actionGroupEntryNameInput.value = description.name;
  } catch {
    els.actionGroupEntryNameInput.value = "";
  }
}

async function runActionGroupEntry(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const entryType = String(source.entryType || "").trim();
  if (entryType === "lfosEnabled") {
    const enabled = source.enabled !== false;
    await api("/api/lfos/enabled", "POST", { enabled });
    return `lfos ${enabled ? "enabled" : "disabled"}`;
  }
  if (entryType === "actionLfoEnabled") {
    const actionId = String(source.actionId || "").trim();
    const lfoId = String(source.lfoId || "").trim();
    if (!actionId || !lfoId) {
      throw new Error("Action LFO entry requires action and LFO");
    }
    await api("/api/action-lfo/enabled", "POST", {
      actionId,
      lfoId,
      enabled: source.enabled !== false
    });
    return `global lfo ${source.enabled !== false ? "enabled" : "disabled"} -> ${lfoId}`;
  }
  const actionId = String(source.actionId || "").trim();
  if (!actionId) {
    throw new Error("Action entry requires an action");
  }
  const command = String(source.command || "start").trim().toLowerCase();
  if (command !== "start" && command !== "stop" && command !== "abort") {
    throw new Error(`Unsupported action command: ${command}`);
  }
  await api(`/api/action/${encodeURIComponent(actionId)}/${command}`, "POST", {});
  return `action ${command} -> ${actionId}`;
}

function actionIdsInGroup(group) {
  const entries = Array.isArray(group?.entries) ? group.entries : [];
  const actionIds = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const entryType = String(entry.entryType || "").trim();
    if (entryType !== "action" && entryType !== "actionLfoEnabled") continue;
    const actionId = String(entry.actionId || "").trim();
    if (actionId) {
      actionIds.push(actionId);
    }
  }
  return [...new Set(actionIds)];
}

async function triggerActionGroupById(groupId) {
  const normalizedGroupId = String(groupId || "").trim();
  if (!normalizedGroupId) {
    throw new Error("No action group selected");
  }
  await api(`/api/action-group/${encodeURIComponent(normalizedGroupId)}/trigger`, "POST", {});
  addLog(`action group trigger -> ${normalizedGroupId}`);
}

async function stopActionGroupById(groupId) {
  const normalizedGroupId = String(groupId || "").trim();
  if (!normalizedGroupId) {
    throw new Error("No action group selected");
  }
  const group = getActionGroupById(normalizedGroupId);
  if (!group) {
    throw new Error(`Action group not found: ${normalizedGroupId}`);
  }
  const actionIds = actionIdsInGroup(group);
  if (!actionIds.length) {
    addLog(`action group stop -> ${normalizedGroupId} (no action entries)`);
    return;
  }
  const failures = [];
  for (const actionId of actionIds) {
    try {
      await api(`/api/action/${encodeURIComponent(actionId)}/stop`, "POST", {});
    } catch (error) {
      failures.push(`${actionId}: ${error.message}`);
    }
  }
  if (failures.length) {
    throw new Error(failures.join(" | "));
  }
  addLog(`action group stop -> ${normalizedGroupId} (${actionIds.join(", ")})`);
}

function actionGroupPayloadFromInputs(baseGroup = null, options = {}) {
  const base = baseGroup && typeof baseGroup === "object" ? baseGroup : {};
  const fallbackGroupId = String(options.fallbackGroupId || state.selectedActionGroupId || "group").trim() || "group";
  const lockGroupId = Boolean(options.lockGroupId);
  const inputName = String(els.actionGroupManagerNameInput.value || "").trim();
  const rawGroupId = String(els.actionGroupManagerIdInput.value || "").trim();
  const selectedGroup = selectedActionGroupOrNull();
  const selectedGroupId = String(selectedGroup?.groupId || "").trim();
  const selectedGroupName = String(selectedGroup?.name || selectedGroupId).trim();
  const preferNameDerivedId = Boolean(options.preferNameDerivedId);
  const deriveFromSelectedGroup = Boolean(
    selectedGroupId
    && rawGroupId === selectedGroupId
    && inputName
    && inputName !== selectedGroupName
  );
  const shouldDeriveFromName = Boolean(
    preferNameDerivedId
    && inputName
    && (
      !rawGroupId
      || rawGroupId === String(state.draftSuggestedIds.actionGroup || "").trim()
      || deriveFromSelectedGroup
    )
  );
  const groupIdSeed = lockGroupId
    ? fallbackGroupId
    : (shouldDeriveFromName
      ? deriveIdBaseFromName(inputName, fallbackGroupId)
      : (rawGroupId || fallbackGroupId));
  const groupId = sanitizeActionGroupId(groupIdSeed, { allowAuto: !lockGroupId });
  const name = inputName || humanizeId(groupId) || groupId;
  const triggerPath = String(
    els.actionGroupManagerOscTriggerInput.value
    || defaultActionGroupOscPath(groupId)
  ).trim();
  return {
    groupId,
    name,
    enabled: Boolean(els.actionGroupManagerEnabledInput.checked),
    entries: Array.isArray(base.entries) ? base.entries : [],
    oscTriggers: {
      trigger: triggerPath
    }
  };
}

function actionGroupEntryPayloadFromInputs() {
  const entryType = String(els.actionGroupEntryTypeInput.value || "action-start").trim();
  const actionId = String(els.actionGroupEntryActionSelect.value || "").trim();

  if (entryType === "action-lfo-enable" || entryType === "action-lfo-disable") {
    if (!actionId) {
      throw new Error("Select an action for the LFO entry");
    }
    const lfoId = String(els.actionGroupEntryLfoSelect.value || "").trim();
    if (!lfoId) {
      throw new Error("Select an LFO for the entry");
    }
    return {
      entryType: "actionLfoEnabled",
      actionId,
      lfoId,
      enabled: entryType === "action-lfo-enable"
    };
  }

  if (entryType === "lfos-enable") {
    return { entryType: "lfosEnabled", enabled: true };
  }
  if (entryType === "lfos-disable") {
    return { entryType: "lfosEnabled", enabled: false };
  }

  if (!actionId) {
    throw new Error("Select an action for the entry");
  }
  const command = entryType === "action-stop" ? "stop" : (entryType === "action-abort" ? "abort" : "start");
  return {
    entryType: "action",
    actionId,
    command
  };
}

function updateActionGroupEntryInputsState() {
  const entryType = String(els.actionGroupEntryTypeInput.value || "action-start").trim();
  const isGlobalLfoEntry = entryType === "lfos-enable" || entryType === "lfos-disable";
  const isActionLfoEntry = entryType === "action-lfo-enable" || entryType === "action-lfo-disable";
  els.actionGroupEntryActionSelect.disabled = isGlobalLfoEntry;
  els.actionGroupEntryLfoSelect.disabled = !isActionLfoEntry;
  els.actionGroupEntryLfosEnabledInput.disabled = !isGlobalLfoEntry;
  if (isGlobalLfoEntry && document.activeElement !== els.actionGroupEntryLfosEnabledInput) {
    els.actionGroupEntryLfosEnabledInput.value = entryType === "lfos-disable" ? "false" : "true";
  }
  updateActionGroupEntryNamePreview();
}

function actionPayloadFromInputs(baseAction = null, options = {}) {
  const base = baseAction && typeof baseAction === "object" ? baseAction : {};
  const fallbackActionId = String(options.fallbackActionId || state.selectedActionId || "action").trim() || "action";
  const inputName = String(els.actionManagerNameInput.value || "").trim();
  const rawActionId = String(els.actionManagerIdInput.value || "").trim();
  const selectedAction = selectedActionOrNull();
  const selectedActionId = String(selectedAction?.actionId || "").trim();
  const selectedActionName = String(selectedAction?.name || selectedActionId).trim();
  const preferNameDerivedId = Boolean(options.preferNameDerivedId);
  const deriveFromSelectedAction = Boolean(
    selectedActionId
    && rawActionId === selectedActionId
    && inputName
    && inputName !== selectedActionName
  );
  const shouldDeriveFromName = Boolean(
    preferNameDerivedId
    && inputName
    && (
      !rawActionId
      || rawActionId === String(state.draftSuggestedIds.action || "").trim()
      || deriveFromSelectedAction
    )
  );
  const actionIdSeed = shouldDeriveFromName
    ? deriveIdBaseFromName(inputName, fallbackActionId)
    : (rawActionId || fallbackActionId);
  const actionId = sanitizeActionId(actionIdSeed, { allowAuto: true });
  const name = inputName || humanizeId(actionId) || actionId;
  const durationMs = Math.max(0, Math.round(parseFiniteNumber(els.actionManagerDurationInput.value, 0)));
  const onEndActionId = sanitizeActionId(els.actionManagerOnEndInput.value || "", { allowAuto: false, allowEmpty: true });
  const oscStart = String(els.actionManagerOscStartInput.value || defaultActionOscPath(actionId, "start")).trim();
  const oscStop = String(els.actionManagerOscStopInput.value || defaultActionOscPath(actionId, "stop")).trim();
  const oscAbort = String(els.actionManagerOscAbortInput.value || defaultActionOscPath(actionId, "abort")).trim();

  return {
    actionId,
    name,
    durationMs,
    enabled: Boolean(els.actionManagerEnabledInput.checked),
    onEndActionId: onEndActionId || "",
    tracks: Array.isArray(base.tracks) ? base.tracks : [],
    lfos: Array.isArray(base.lfos) ? base.lfos : [],
    oscTriggers: {
      start: oscStart,
      stop: oscStop,
      abort: oscAbort
    }
  };
}

function uniqueLfoId(baseId, existingLfos = [], skipSelector = "") {
  const ids = [];
  for (let index = 0; index < existingLfos.length; index += 1) {
    const candidate = existingLfos[index] || {};
    const selector = lfoSelectorKey(candidate, `lfo-${index + 1}`);
    if (skipSelector && selector === skipSelector) {
      continue;
    }
    const candidateId = lfoDisplayId(candidate, "");
    if (candidateId) {
      ids.push(candidateId);
    }
  }
  return nextNumericId(baseId, "lfo", ids);
}

function lfoPayloadFromInputs(baseLfo = null, options = {}) {
  const base = baseLfo && typeof baseLfo === "object" ? baseLfo : {};
  const existingLfos = Array.isArray(options.existingLfos) ? options.existingLfos : [];
  const selectedSelector = String(options.selectedSelector || "").trim();
  const autoUniqueId = Boolean(options.autoUniqueId);
  const wave = String(els.actionManagerLfoWaveInput.value || "sine").trim().toLowerCase();
  const rateHz = Math.max(0, parseFiniteNumber(els.actionManagerLfoRateInput.value, 0));
  const depth = parseFiniteNumber(els.actionManagerLfoDepthInput.value, 0);
  const offset = parseFiniteNumber(els.actionManagerLfoOffsetInput.value, 0);
  const phaseDeg = parseFiniteNumber(base.phaseDeg, 0);
  const polarity = normalizeLfoPolarity(els.actionManagerLfoPolarityBtn?.dataset?.polarity || base.polarity);
  const enabledValue = Boolean(els.actionManagerLfoEnabledInput?.checked);
  const rawIdInput = String(els.actionManagerLfoIdInput.value || "").trim();
  const baseLfoId = sanitizeActionId(base.lfoId || base.lfo_id || "", { allowEmpty: true });
  const lfoIdSeed = rawIdInput || baseLfoId || "lfo";
  let lfoId = rawIdInput
    ? sanitizeActionId(rawIdInput)
    : uniqueLfoId(lfoIdSeed, existingLfos, selectedSelector);

  const existingIds = new Set();
  for (let index = 0; index < existingLfos.length; index += 1) {
    const candidate = existingLfos[index] || {};
    const selector = lfoSelectorKey(candidate, `lfo-${index + 1}`);
    if (selectedSelector && selector === selectedSelector) {
      continue;
    }
    const candidateId = lfoDisplayId(candidate, "");
    if (candidateId) {
      existingIds.add(candidateId);
    }
  }
  if (existingIds.has(lfoId)) {
    if (!autoUniqueId) {
      throw new Error(`LFO name already exists: ${lfoId}`);
    }
    lfoId = uniqueLfoId(lfoId, existingLfos, selectedSelector);
  }

  return {
    lfoId,
    wave,
    rateHz,
    depth,
    offset,
    phaseDeg,
    polarity,
    enabled: enabledValue
  };
}

function setLfoInputsFromModel(lfo) {
  if (!lfo || typeof lfo !== "object") return;
  setInputValueIfIdle(els.actionManagerLfoIdInput, String(lfo.lfoId || lfo.lfo_id || ""));
  setInputValueIfIdle(els.actionManagerLfoWaveInput, String(lfo.wave || "sine"));
  setInputValueIfIdle(els.actionManagerLfoRateInput, String(parseFiniteNumber(lfo.rateHz, 0)));
  setInputValueIfIdle(els.actionManagerLfoDepthInput, String(parseFiniteNumber(lfo.depth, 0)));
  setInputValueIfIdle(els.actionManagerLfoOffsetInput, String(parseFiniteNumber(lfo.offset, 0)));
  updateLfoPolarityButton(lfo.polarity);
  if (!document.activeElement || document.activeElement !== els.actionManagerLfoEnabledInput) {
    els.actionManagerLfoEnabledInput.checked = lfo.enabled !== false;
  }
}

async function actionManagerCreate() {
  try {
    const payload = actionPayloadFromInputs(null, { fallbackActionId: "action", preferNameDerivedId: true });
    await api("/api/action/create", "POST", payload);
    if (String(els.actionManagerIdInput.value || "").trim() !== payload.actionId) {
      addLog(`action id normalized -> ${payload.actionId}`);
    }
    state.selectedActionId = payload.actionId;
    addLog(`action create -> ${payload.actionId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action create failed: ${error.message}`);
  }
}

async function actionManagerSave() {
  try {
    const actionId = selectedActionIdOrThrow();
    const currentAction = selectedActionOrNull();
    if (!currentAction) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const payload = actionPayloadFromInputs(currentAction, { fallbackActionId: actionId });
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", payload);
    addLog(`action save -> ${actionId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action save failed: ${error.message}`);
  }
}

async function actionManagerSaveAs() {
  try {
    const sourceActionId = selectedActionIdOrThrow();
    const currentAction = selectedActionOrNull();
    if (!currentAction) {
      throw new Error(`Action not found: ${sourceActionId}`);
    }

    const suggestedActionId = uniqueActionId(deriveIdBaseFromName(currentAction.name, sourceActionId));
    const rawNewActionId = prompt("New action ID", suggestedActionId);
    if (rawNewActionId === null) {
      addLog("action save-as cancelled");
      return;
    }

    const newActionId = sanitizeActionId(rawNewActionId, { allowAuto: true });
    const payload = actionPayloadFromInputs(currentAction, { fallbackActionId: sourceActionId });
    await api(`/api/action/${encodeURIComponent(sourceActionId)}/save-as`, "POST", {
      ...payload,
      newActionId
    });

    if (String(rawNewActionId || "").trim() !== newActionId) {
      addLog(`action id normalized -> ${newActionId}`);
    }
    state.selectedActionId = newActionId;
    addLog(`action save-as -> ${sourceActionId} as ${newActionId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action save-as failed: ${error.message}`);
  }
}

async function actionManagerDelete() {
  try {
    const actionId = selectedActionIdOrThrow();
    if (!confirm(`Delete action "${actionId}"?`)) {
      return;
    }
    await api(`/api/action/${encodeURIComponent(actionId)}/delete`, "POST", {});
    if (state.selectedActionId === actionId) {
      state.selectedActionId = null;
    }
    addLog(`action delete -> ${actionId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action delete failed: ${error.message}`);
  }
}

async function actionManagerToggleEnabled(actionId, enabled) {
  try {
    const normalizedActionId = String(actionId || "").trim();
    if (!normalizedActionId) {
      throw new Error("No action selected");
    }
    await api(`/api/action/${encodeURIComponent(normalizedActionId)}/update`, "POST", {
      enabled: Boolean(enabled)
    });
    addLog(`action ${enabled ? "enabled" : "disabled"} -> ${normalizedActionId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action toggle failed: ${error.message}`);
    await refreshStatus();
  }
}

async function actionGroupManagerToggleEnabled(groupId, enabled) {
  try {
    const normalizedGroupId = String(groupId || "").trim();
    if (!normalizedGroupId) {
      throw new Error("No action group selected");
    }
    await api(`/api/action-group/${encodeURIComponent(normalizedGroupId)}/update`, "POST", {
      enabled: Boolean(enabled)
    });
    addLog(`action group ${enabled ? "enabled" : "disabled"} -> ${normalizedGroupId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group toggle failed: ${error.message}`);
    await refreshStatus();
  }
}

async function actionGroupManagerCreate() {
  try {
    const groupId = sanitizeActionGroupId("group", { allowAuto: true });
    const payload = {
      groupId,
      name: humanizeId(groupId) || groupId,
      enabled: true,
      entries: [],
      oscTriggers: {
        trigger: defaultActionGroupOscPath(groupId)
      }
    };
    await api("/api/action-group/create", "POST", payload);
    state.draftSuggestedIds.actionGroup = "";
    state.selectedActionGroupId = payload.groupId;
    state.selectedActionGroupEntryGroupId = payload.groupId;
    state.selectedActionGroupEntryIndex = null;
    addLog(`action group create -> ${payload.groupId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group create failed: ${error.message}`);
  }
}

async function actionGroupManagerSave() {
  try {
    const groupId = selectedActionGroupIdOrThrow();
    const currentGroup = selectedActionGroupOrNull();
    if (!currentGroup) {
      throw new Error(`Action group not found: ${groupId}`);
    }
    const payload = actionGroupPayloadFromInputs(currentGroup, { fallbackGroupId: groupId, lockGroupId: true });
    await api(`/api/action-group/${encodeURIComponent(groupId)}/update`, "POST", payload);
    addLog(`action group save -> ${groupId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group save failed: ${error.message}`);
  }
}

async function actionGroupManagerDelete() {
  try {
    const groupId = selectedActionGroupIdOrThrow();
    if (!confirm(`Delete action group "${groupId}"?`)) {
      return;
    }
    await api(`/api/action-group/${encodeURIComponent(groupId)}/delete`, "POST", {});
    if (state.selectedActionGroupId === groupId) {
      state.selectedActionGroupId = null;
    }
    if (state.selectedActionGroupEntryGroupId === groupId) {
      state.selectedActionGroupEntryGroupId = null;
      state.selectedActionGroupEntryIndex = null;
    }
    addLog(`action group delete -> ${groupId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group delete failed: ${error.message}`);
  }
}

async function actionGroupManagerTrigger(groupId = null) {
  try {
    const targetGroupId = String(groupId || selectedActionGroupIdOrThrow()).trim();
    await triggerActionGroupById(targetGroupId);
    await refreshStatus();
  } catch (error) {
    addLog(`action group trigger failed: ${error.message}`);
  }
}

async function actionGroupManagerStop(groupId = null) {
  try {
    const targetGroupId = String(groupId || selectedActionGroupIdOrThrow()).trim();
    await stopActionGroupById(targetGroupId);
    await refreshStatus();
  } catch (error) {
    addLog(`action group stop failed: ${error.message}`);
    await refreshStatus();
  }
}

async function actionGroupEntryTrigger() {
  try {
    const entry = actionGroupEntryPayloadFromInputs();
    const description = describeActionGroupEntry(entry);
    await runActionGroupEntry(entry);
    addLog(`action group entry trigger -> ${description.name}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group entry trigger failed: ${error.message}`);
    await refreshStatus();
  }
}

async function actionGroupEntryTriggerByIndex(index) {
  try {
    const groupId = selectedActionGroupIdOrThrow();
    const group = selectedActionGroupOrNull();
    if (!group) {
      throw new Error(`Action group not found: ${groupId}`);
    }
    const entries = Array.isArray(group.entries) ? group.entries : [];
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
      throw new Error("Invalid action group entry index");
    }
    const entry = entries[index];
    const description = describeActionGroupEntry(entry);
    await runActionGroupEntry(entry);
    addLog(`action group entry trigger -> ${groupId} #${index + 1} (${description.name})`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group entry trigger failed: ${error.message}`);
    await refreshStatus();
  }
}

async function actionGroupEntryAdd() {
  try {
    const groupId = selectedActionGroupIdOrThrow();
    const group = selectedActionGroupOrNull();
    if (!group) {
      throw new Error(`Action group not found: ${groupId}`);
    }
    const entry = actionGroupEntryPayloadFromInputs();
    const description = describeActionGroupEntry(entry);
    const entries = Array.isArray(group.entries) ? [...group.entries, entry] : [entry];
    await api(`/api/action-group/${encodeURIComponent(groupId)}/update`, "POST", { entries });
    state.selectedActionGroupEntryGroupId = groupId;
    state.selectedActionGroupEntryIndex = entries.length - 1;
    addLog(`action group entry add -> ${groupId} (${description.name})`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group entry add failed: ${error.message}`);
  }
}

async function actionGroupEntryRemove(index) {
  try {
    const groupId = selectedActionGroupIdOrThrow();
    const group = selectedActionGroupOrNull();
    if (!group) {
      throw new Error(`Action group not found: ${groupId}`);
    }
    const entries = Array.isArray(group.entries) ? group.entries : [];
    if (index < 0 || index >= entries.length) return;
    const nextEntries = entries.filter((_, entryIndex) => entryIndex !== index);
    await api(`/api/action-group/${encodeURIComponent(groupId)}/update`, "POST", { entries: nextEntries });
    if (state.selectedActionGroupEntryGroupId === groupId && Number.isInteger(state.selectedActionGroupEntryIndex)) {
      if (state.selectedActionGroupEntryIndex === index) {
        state.selectedActionGroupEntryIndex = null;
      } else if (state.selectedActionGroupEntryIndex > index) {
        state.selectedActionGroupEntryIndex -= 1;
      }
    }
    addLog(`action group entry remove -> ${groupId} #${index + 1}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group entry remove failed: ${error.message}`);
  }
}

async function actionGroupEntryClear() {
  try {
    const groupId = selectedActionGroupIdOrThrow();
    const group = selectedActionGroupOrNull();
    if (!group) {
      throw new Error(`Action group not found: ${groupId}`);
    }
    const entries = Array.isArray(group.entries) ? group.entries : [];
    if (!entries.length) {
      return;
    }
    if (!confirm(`Clear all entries from "${groupId}"?`)) {
      return;
    }
    await api(`/api/action-group/${encodeURIComponent(groupId)}/update`, "POST", { entries: [] });
    if (state.selectedActionGroupEntryGroupId === groupId) {
      state.selectedActionGroupEntryIndex = null;
    }
    addLog(`action group entries cleared -> ${groupId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group entry clear failed: ${error.message}`);
  }
}

async function actionManagerAddLfo() {
  try {
    cancelActionLfoAutoApplyTimer();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    const lfo = lfoPayloadFromInputs(null, { existingLfos: currentLfos, autoUniqueId: true });
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", {
      lfos: [...currentLfos, lfo]
    });
    state.selectedActionLfoActionId = actionId;
    state.selectedActionLfoIndex = currentLfos.length;
    state.selectedActionLfoTargetIndex = null;
    addLog(`action lfo add -> ${actionId} (${lfo.lfoId})`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo add failed: ${error.message}`);
  }
}

async function actionManagerAddLfoTarget() {
  try {
    cancelActionLfoAutoApplyTimer();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    const selectedIndex = Number.isInteger(state.selectedActionLfoIndex) ? state.selectedActionLfoIndex : -1;
    const groups = collectLfoGroups(currentLfos);
    const selectedGroup = groups.find((group) => group.representativeIndex === selectedIndex) || null;
    if (!selectedGroup) {
      throw new Error("Select an LFO row to add a target");
    }

    const objects = getObjects();
    if (!objects.length) {
      throw new Error("No objects available");
    }
    const selectedObjectId = String(els.actionManagerLfoTargetObjectInput?.value || "").trim();
    const fallbackObjectId = String(state.selectedObjectId || objects[0]?.objectId || "").trim();
    const objectId = sanitizeObjectId(selectedObjectId || fallbackObjectId);
    if (!objectId) {
      throw new Error("Target object ID is required");
    }
    const targetObject = objects.find((obj) => String(obj.objectId || "").trim() === objectId);
    if (!targetObject) {
      throw new Error(`Object not found: ${objectId}`);
    }

    const parameter = String(els.actionManagerLfoTargetParamInput?.value || "").trim().toLowerCase();
    if (!LFO_PARAM_OPTIONS.includes(parameter)) {
      throw new Error(`Invalid parameter: ${parameter}`);
    }

    const mappingPhaseDeg = parseFiniteNumber(els.actionManagerLfoTargetPhaseInput?.value, 0);
    const result = await upsertActionLfoTargetMapping(actionId, selectedGroup.selector, objectId, parameter, {
      mappingPhaseDeg
    });
    if (result.created) {
      addLog(`action lfo target add -> ${result.actionId} ${result.objectId}.${result.parameter} (phase ${result.mappingPhaseDeg}°)`);
    } else {
      addLog(`action lfo target update -> ${result.actionId} ${result.objectId}.${result.parameter} (phase ${result.mappingPhaseDeg}°)`);
    }
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo add target failed: ${error.message}`);
  }
}

async function actionManagerUpdateLfoTargetPhase(index, mappingPhaseDeg) {
  try {
    cancelActionLfoAutoApplyTimer();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    if (!Number.isInteger(index) || index < 0 || index >= currentLfos.length) {
      throw new Error("Invalid LFO target index");
    }

    const selectedIndex = Number.isInteger(state.selectedActionLfoIndex) ? state.selectedActionLfoIndex : -1;
    const groups = collectLfoGroups(currentLfos);
    const selectedGroup = groups.find((group) => group.representativeIndex === selectedIndex) || null;
    if (!selectedGroup) {
      throw new Error("Select an LFO row to edit targets");
    }
    if (!selectedGroup.entryIndices.includes(index)) {
      throw new Error("Target does not belong to selected LFO");
    }

    const lfo = currentLfos[index] || {};
    if (!lfoHasAssignedTarget(lfo)) {
      throw new Error("Target mapping is missing object/parameter");
    }

    const nextLfos = [...currentLfos];
    nextLfos[index] = {
      ...lfo,
      mappingPhaseDeg: parseFiniteNumber(mappingPhaseDeg, parseFiniteNumber(lfo.mappingPhaseDeg, 0))
    };
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", { lfos: nextLfos });
    state.selectedActionLfoActionId = actionId;
    const nextGroups = collectLfoGroups(nextLfos);
    const nextSelectedGroup = nextGroups.find((group) => group.selector === selectedGroup.selector) || null;
    state.selectedActionLfoIndex = nextSelectedGroup ? nextSelectedGroup.representativeIndex : null;
    state.selectedActionLfoTargetIndex = index;

    const targetLabel = lfoTargetLabel(nextLfos[index]) || `target #${index + 1}`;
    const nextPhaseDeg = parseFiniteNumber(nextLfos[index].mappingPhaseDeg, 0);
    addLog(`action lfo target phase -> ${actionId} ${targetLabel} = ${nextPhaseDeg}°`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo target phase failed: ${error.message}`);
  }
}

async function actionManagerRemoveLfoTarget(index) {
  try {
    cancelActionLfoAutoApplyTimer();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    if (!Number.isInteger(index) || index < 0 || index >= currentLfos.length) {
      return;
    }

    const selectedIndex = Number.isInteger(state.selectedActionLfoIndex) ? state.selectedActionLfoIndex : -1;
    const groups = collectLfoGroups(currentLfos);
    const selectedGroup = groups.find((group) => group.representativeIndex === selectedIndex) || null;
    if (!selectedGroup) {
      throw new Error("Select an LFO row to remove targets");
    }
    if (!selectedGroup.entryIndices.includes(index)) {
      return;
    }

    const removedLfo = currentLfos[index] || {};
    const removedLabel = lfoTargetLabel(removedLfo) || `target #${index + 1}`;
    const nextLfos = currentLfos.filter((_, entryIndex) => entryIndex !== index);
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", { lfos: nextLfos });
    state.selectedActionLfoActionId = actionId;
    const nextGroups = collectLfoGroups(nextLfos);
    const nextSelectedGroup = nextGroups.find((group) => group.selector === selectedGroup.selector) || null;
    state.selectedActionLfoIndex = nextSelectedGroup
      ? nextSelectedGroup.representativeIndex
      : (nextGroups[0]?.representativeIndex ?? null);
    state.selectedActionLfoTargetIndex = null;
    addLog(`action lfo target remove -> ${actionId} ${removedLabel}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo target remove failed: ${error.message}`);
  }
}

function cancelActionLfoAutoApplyTimer() {
  if (state.actionLfoAutoApplyTimerId !== null) {
    clearTimeout(state.actionLfoAutoApplyTimerId);
    state.actionLfoAutoApplyTimerId = null;
  }
  state.actionLfoAutoApplyQueued = false;
}

async function flushActionLfoAutoApply() {
  if (state.actionLfoAutoApplyInFlight) {
    state.actionLfoAutoApplyQueued = true;
    return;
  }
  state.actionLfoAutoApplyInFlight = true;
  try {
    await actionManagerUpdateLfo({ logSuccess: false, quietErrors: true, refreshOnError: false });
  } finally {
    state.actionLfoAutoApplyInFlight = false;
    if (state.actionLfoAutoApplyQueued) {
      state.actionLfoAutoApplyQueued = false;
      await flushActionLfoAutoApply();
    }
  }
}

function scheduleActionLfoAutoApply(delayMs = 260) {
  cancelActionLfoAutoApplyTimer();
  const waitMs = Math.max(0, Math.round(parseFiniteNumber(delayMs, 0)));
  state.actionLfoAutoApplyTimerId = setTimeout(() => {
    state.actionLfoAutoApplyTimerId = null;
    void flushActionLfoAutoApply();
  }, waitMs);
}

async function actionManagerUpdateLfo(options = {}) {
  const logSuccess = options.logSuccess !== false;
  const quietErrors = Boolean(options.quietErrors);
  const refreshOnError = options.refreshOnError !== false;
  try {
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    const selectedIndex = Number.isInteger(state.selectedActionLfoIndex) ? state.selectedActionLfoIndex : -1;
    const groups = collectLfoGroups(currentLfos);
    const selectedGroup = groups.find((group) => group.representativeIndex === selectedIndex) || null;
    if (!selectedGroup) {
      throw new Error("Select an LFO row to update");
    }
    const updatedLfo = lfoPayloadFromInputs(selectedGroup.lfo, {
      existingLfos: currentLfos,
      selectedSelector: selectedGroup.selector
    });
    const nextLfos = [...currentLfos];
    for (const entryIndex of selectedGroup.entryIndices) {
      const currentEntry = nextLfos[entryIndex] || {};
      nextLfos[entryIndex] = {
        ...currentEntry,
        ...updatedLfo
      };
    }
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", {
      lfos: nextLfos
    });
    state.selectedActionLfoActionId = actionId;
    state.selectedActionLfoIndex = selectedGroup.representativeIndex;
    if (logSuccess) {
      addLog(`action lfo update -> ${actionId} ${updatedLfo.lfoId} (targets: ${selectedGroup.targetCount})`);
    }
    await refreshStatus();
    return true;
  } catch (error) {
    if (!quietErrors) {
      addLog(`action lfo update failed: ${error.message}`);
    }
    if (refreshOnError) {
      await refreshStatus();
    }
    return false;
  }
}

async function actionManagerRemoveLfo(index) {
  try {
    cancelActionLfoAutoApplyTimer();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    const groups = collectLfoGroups(currentLfos);
    const selectedGroup = groups.find((group) => group.representativeIndex === index) || null;
    if (!selectedGroup) {
      return;
    }
    const removedIndices = [...selectedGroup.entryIndices].sort((a, b) => a - b);
    const removedSet = new Set(removedIndices);
    const nextLfos = currentLfos.filter((_, lfoIndex) => !removedSet.has(lfoIndex));
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", {
      lfos: nextLfos
    });
    state.selectedActionLfoActionId = actionId;
    state.selectedActionLfoTargetIndex = null;
    if (Number.isInteger(state.selectedActionLfoIndex)) {
      if (removedSet.has(state.selectedActionLfoIndex)) {
        state.selectedActionLfoIndex = null;
      } else {
        let removedBefore = 0;
        for (const removedIndex of removedIndices) {
          if (removedIndex < state.selectedActionLfoIndex) {
            removedBefore += 1;
          }
        }
        state.selectedActionLfoIndex -= removedBefore;
      }
    }
    addLog(`action lfo remove -> ${actionId} ${selectedGroup.lfoId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo remove failed: ${error.message}`);
  }
}

async function actionManagerToggleLfoEnabled(index, enabled) {
  try {
    cancelActionLfoAutoApplyTimer();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    const groups = collectLfoGroups(currentLfos);
    const selectedGroup = groups.find((group) => group.representativeIndex === index) || null;
    if (!selectedGroup) {
      return;
    }
    const nextLfos = [...currentLfos];
    for (const entryIndex of selectedGroup.entryIndices) {
      const currentEntry = nextLfos[entryIndex] || {};
      nextLfos[entryIndex] = {
        ...currentEntry,
        enabled: Boolean(enabled)
      };
    }
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", {
      lfos: nextLfos
    });
    state.selectedActionLfoActionId = actionId;
    state.selectedActionLfoIndex = selectedGroup.representativeIndex;
    addLog(`action lfo ${enabled ? "enabled" : "disabled"} -> ${actionId} ${selectedGroup.lfoId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo toggle failed: ${error.message}`);
    await refreshStatus();
  }
}

async function actionManagerClearLfos() {
  try {
    cancelActionLfoAutoApplyTimer();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    if (!currentLfos.length) {
      return;
    }
    if (!confirm(`Clear all LFOs from "${actionId}"?`)) {
      return;
    }
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", { lfos: [] });
    state.selectedActionLfoActionId = actionId;
    state.selectedActionLfoIndex = null;
    state.selectedActionLfoTargetIndex = null;
    addLog(`action lfo clear -> ${actionId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo clear failed: ${error.message}`);
  }
}

function renderActionLfoDebug(selectedAction, selectedLfoGroup, isRunning) {
  if (!els.actionManagerLfoDebugRows || !els.actionManagerLfoDebugSummary) return;

  const actionId = String(selectedAction?.actionId || state.selectedActionId || "").trim();
  const lfos = Array.isArray(selectedAction?.lfos) ? selectedAction.lfos : [];
  const selectedGroup = selectedLfoGroup && typeof selectedLfoGroup === "object" ? selectedLfoGroup : null;
  const lfosEnabled = areLfosEnabled();
  const detail = actionId ? state.status?.runningActionDetails?.[actionId] : null;
  const startedAtMs = Number(detail?.startedAtMs || 0);
  const elapsedMs = startedAtMs > 0 ? Math.max(0, Date.now() - startedAtMs) : 0;
  const latestEvent = actionId ? state.lastLfoDebugEventByAction[actionId] : null;

  els.actionManagerLfoDebugRows.innerHTML = "";
  if (!selectedAction) {
    const row = document.createElement("tr");
    row.innerHTML = '<td class="muted" colspan="6">No action selected.</td>';
    els.actionManagerLfoDebugRows.appendChild(row);
    els.actionManagerLfoDebugSummary.textContent = "No LFO debug data.";
    return;
  }

  if (!selectedGroup) {
    const row = document.createElement("tr");
    row.innerHTML = '<td class="muted" colspan="6">Select an LFO to monitor its targets.</td>';
    els.actionManagerLfoDebugRows.appendChild(row);
    els.actionManagerLfoDebugSummary.textContent = "No LFO selected.";
    return;
  }

  const targetEntries = [];
  const selectedEntryIndices = Array.isArray(selectedGroup.entryIndices) ? selectedGroup.entryIndices : [];
  for (const entryIndex of selectedEntryIndices) {
    if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= lfos.length) continue;
    const lfo = lfos[entryIndex] || {};
    if (!lfoHasAssignedTarget(lfo)) continue;
    targetEntries.push({ lfo, index: entryIndex });
  }

  if (!targetEntries.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td class="muted" colspan="6">Selected LFO has no assigned targets.</td>';
    els.actionManagerLfoDebugRows.appendChild(row);
    const selectedLfoId = String(selectedGroup.lfoId || "").trim() || "lfo";
    els.actionManagerLfoDebugSummary.textContent = `LFO ${selectedLfoId} has no target mappings.`;
    return;
  }

  let movingTargets = 0;
  for (const targetEntry of targetEntries) {
    const lfo = targetEntry.lfo || {};
    const index = targetEntry.index;
    const objectId = String(lfo.objectId || lfo.object_id || "").trim();
    const parameter = String(lfo.parameter || "").trim();
    const targetLabel = objectId && parameter ? `${objectId}.${parameter}` : "-";
    const key = lfoDebugKey(actionId, objectId, parameter, index);
    const sampleValue = Number(state.lfoDebugLastValueByKey[key]);
    const objectValue = getObjectParamNumber(objectId, parameter);
    const currentValue = Number.isFinite(sampleValue) ? sampleValue : objectValue;

    let stats = state.lfoDebugStatsByKey[key];
    if (!stats) {
      stats = { min: null, max: null, last: null };
    }
    if (Number.isFinite(currentValue)) {
      if (!Number.isFinite(stats.min)) stats.min = currentValue;
      if (!Number.isFinite(stats.max)) stats.max = currentValue;
      stats.min = Math.min(stats.min, currentValue);
      stats.max = Math.max(stats.max, currentValue);
      stats.last = currentValue;
      state.lfoDebugStatsByKey[key] = stats;
    }

    const min = Number.isFinite(stats.min) ? stats.min : null;
    const max = Number.isFinite(stats.max) ? stats.max : null;
    const span = Number.isFinite(min) && Number.isFinite(max) ? (max - min) : null;
    if (Number.isFinite(span) && span > 0.01) {
      movingTargets += 1;
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(targetLabel)}</td>
      <td>${Number.isFinite(currentValue) ? escapeHtml(currentValue.toFixed(3)) : '<span class="muted">n/a</span>'}</td>
      <td>${Number.isFinite(min) ? escapeHtml(min.toFixed(3)) : '<span class="muted">n/a</span>'}</td>
      <td>${Number.isFinite(max) ? escapeHtml(max.toFixed(3)) : '<span class="muted">n/a</span>'}</td>
      <td>${Number.isFinite(span) ? escapeHtml(span.toFixed(3)) : '<span class="muted">n/a</span>'}</td>
      <td>${lfosEnabled ? (isRunning ? "running" : "idle") : "disabled"}</td>
    `;
    els.actionManagerLfoDebugRows.appendChild(row);
  }

  const selectedLfoId = String(selectedGroup.lfoId || "").trim() || "lfo";
  const eventLabel = latestEvent
    ? ` | last frame: ${formatMs(Number(latestEvent.elapsedMs || 0))} (${Array.isArray(latestEvent.samples) ? latestEvent.samples.length : 0} samples)`
    : "";
  els.actionManagerLfoDebugSummary.textContent = `LFO ${selectedLfoId} | ${lfosEnabled ? (isRunning ? "running" : "idle") : "LFOs disabled"} | elapsed: ${formatMs(elapsedMs)} | moving targets: ${movingTargets}/${targetEntries.length}${eventLabel}`;
}

function renderSelectedActionLfoDebug() {
  const selectedAction = selectedActionOrNull();
  const selectedLfos = Array.isArray(selectedAction?.lfos) ? selectedAction.lfos : [];
  const selectedLfoGroups = collectLfoGroups(selectedLfos);
  const selectedLfoGroup = Number.isInteger(state.selectedActionLfoIndex)
    ? (selectedLfoGroups.find((group) => group.representativeIndex === state.selectedActionLfoIndex) || null)
    : null;
  const runningActions = new Set(Array.isArray(state.status?.runningActions) ? state.status.runningActions : []);
  const runtimeActionId = String(selectedAction?.actionId || state.selectedActionId || "").trim();
  const isRunning = Boolean(runtimeActionId && runningActions.has(runtimeActionId));
  renderActionLfoDebug(selectedAction, selectedLfoGroup, isRunning);
}

function renderActionManager() {
  const actionsById = getActionsById();
  const actionIds = Object.keys(actionsById).sort((a, b) => a.localeCompare(b));
  const actionGroupsById = getActionGroupsById();
  const actionGroupIds = Object.keys(actionGroupsById).sort((a, b) => a.localeCompare(b));
  const runningActions = new Set(Array.isArray(state.status?.runningActions) ? state.status.runningActions : []);

  if (state.selectedActionId && !actionIds.includes(state.selectedActionId)) {
    state.selectedActionId = null;
  }
  if (!state.selectedActionId && actionIds.length) {
    state.selectedActionId = actionIds[0];
  }
  if (state.selectedActionGroupId && !actionGroupIds.includes(state.selectedActionGroupId)) {
    state.selectedActionGroupId = null;
  }
  if (!state.selectedActionGroupId && actionGroupIds.length) {
    state.selectedActionGroupId = actionGroupIds[0];
  }

  els.actionGroupManagerSelect.innerHTML = "";
  if (!actionGroupIds.length) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No groups";
    emptyOption.disabled = true;
    emptyOption.selected = true;
    els.actionGroupManagerSelect.appendChild(emptyOption);
  } else {
    for (const groupId of actionGroupIds) {
      const group = actionGroupsById[groupId] || {};
      const groupName = String(group.name || groupId).trim();
      const optionLabel = groupName && groupName !== groupId ? `${groupName} (${groupId})` : groupId;
      const option = document.createElement("option");
      option.value = groupId;
      option.textContent = group.enabled === false ? `${optionLabel} [off]` : optionLabel;
      if (groupId === state.selectedActionGroupId) {
        option.selected = true;
      }
      els.actionGroupManagerSelect.appendChild(option);
    }
  }
  els.actionGroupManagerSelect.disabled = !actionGroupIds.length;

  const currentEntryActionId = String(els.actionGroupEntryActionSelect.value || "").trim();
  const currentEntryLfoId = String(els.actionGroupEntryLfoSelect.value || "").trim();
  els.actionGroupEntryActionSelect.innerHTML = "";
  if (!actionIds.length) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No actions";
    emptyOption.disabled = true;
    emptyOption.selected = true;
    els.actionGroupEntryActionSelect.appendChild(emptyOption);
  } else {
    for (const actionId of actionIds) {
      const option = document.createElement("option");
      option.value = actionId;
      option.textContent = actionId;
      if (actionId === currentEntryActionId) {
        option.selected = true;
      }
      els.actionGroupEntryActionSelect.appendChild(option);
    }
    if (!currentEntryActionId || !actionIds.includes(currentEntryActionId)) {
      els.actionGroupEntryActionSelect.value = actionIds[0];
    }
  }
  els.actionGroupEntryActionSelect.disabled = !actionIds.length;

  const entryActionId = String(els.actionGroupEntryActionSelect.value || "").trim();
  const entryAction = entryActionId ? actionsById[entryActionId] : null;
  const entryActionLfos = Array.isArray(entryAction?.lfos) ? entryAction.lfos : [];
  const globalLfosById = getGlobalLfosById();
  const globalLfoIds = Object.keys(globalLfosById).sort((a, b) => a.localeCompare(b));

  els.actionGroupEntryLfoSelect.innerHTML = "";
  if (!globalLfoIds.length) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No LFOs";
    emptyOption.disabled = true;
    emptyOption.selected = true;
    els.actionGroupEntryLfoSelect.appendChild(emptyOption);
  } else {
    for (const lfoId of globalLfoIds) {
      const globalLfo = globalLfosById[lfoId] || {};
      const mappedCount = entryActionLfos.reduce((count, lfo, index) => {
        const candidateId = lfoDisplayId(lfo, `lfo-${index + 1}`);
        return candidateId === lfoId ? count + 1 : count;
      }, 0);
      const wave = String(globalLfo.wave || "sine");
      const rateHz = parseFiniteNumber(globalLfo.rateHz, 0).toFixed(3);
      const option = document.createElement("option");
      option.value = lfoId;
      option.textContent = `${lfoId} (${wave} ${rateHz}Hz${mappedCount ? `, mapped ${mappedCount}` : ", unmapped"})`;
      if (lfoId === currentEntryLfoId) {
        option.selected = true;
      }
      els.actionGroupEntryLfoSelect.appendChild(option);
    }
    if (!currentEntryLfoId || !globalLfoIds.includes(currentEntryLfoId)) {
      els.actionGroupEntryLfoSelect.value = globalLfoIds[0];
    }
  }
  els.actionGroupEntryLfoSelect.disabled = !globalLfoIds.length;

  const selectedActionId = String(state.selectedActionId || "").trim();
  const selectedAction = selectedActionId ? actionsById[selectedActionId] : null;
  const selectedActionRuntimeId = String(selectedAction?.actionId || selectedActionId).trim();
  const isRunning = selectedActionRuntimeId ? runningActions.has(selectedActionRuntimeId) : false;
  const runningList = [...runningActions].sort((a, b) => a.localeCompare(b));
  els.actionManagerSummary.textContent = `${actionIds.length} action${actionIds.length === 1 ? "" : "s"} | groups: ${actionGroupIds.length} | running: ${runningList.length ? runningList.join(", ") : "-"}`;
  const selectedLfoCount = Array.isArray(selectedAction?.lfos) ? collectLfoGroups(selectedAction.lfos).length : 0;
  const selectedActionLabel = selectedActionId || "-";
  els.modulationManagerSummary.textContent = `Action: ${selectedActionLabel} | LFOs: ${selectedLfoCount} | running: ${isRunning ? "yes" : "no"}`;

  els.actionManagerRows.innerHTML = "";
  if (!actionIds.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td class="muted" colspan="8">No actions created yet.</td>';
    els.actionManagerRows.appendChild(row);
  } else {
    for (const actionId of actionIds) {
      const action = actionsById[actionId] || {};
      const runtimeActionId = String(action.actionId || actionId).trim() || actionId;
      const durationMs = Math.max(0, Math.round(parseFiniteNumber(action.durationMs, 0)));
      const lfoCount = Array.isArray(action.lfos) ? collectLfoGroups(action.lfos).length : 0;
      const onEndActionId = String(action.onEndActionId || "").trim();
      const actionIsRunning = runningActions.has(runtimeActionId);
      const actionEnabled = action.enabled !== false;
      const playDisabled = !actionEnabled || actionIsRunning;
      const stopDisabled = !actionIsRunning;
      const row = document.createElement("tr");
      row.dataset.actionId = actionId;
      row.tabIndex = 0;
      if (actionId === state.selectedActionId) {
        row.classList.add("is-selected");
      }
      row.innerHTML = `
        <td>
          <button
            type="button"
            class="action-enabled-toggle${actionEnabled ? " is-on" : ""}"
            data-action-toggle-enabled="${actionEnabled ? "true" : "false"}"
            aria-pressed="${actionEnabled ? "true" : "false"}"
          >${actionEnabled ? "On" : "Off"}</button>
        </td>
        <td>${escapeHtml(actionId)}</td>
        <td>${escapeHtml(String(action.name || actionId))}</td>
        <td>${escapeHtml(String(durationMs))} ms</td>
        <td>${actionIsRunning ? "Yes" : "No"}</td>
        <td>${escapeHtml(String(lfoCount))}</td>
        <td>${onEndActionId ? escapeHtml(onEndActionId) : '<span class="muted">-</span>'}</td>
        <td class="action-manager-row-actions-cell">
          <div class="action-manager-row-actions">
            <button type="button" data-action-command="start"${playDisabled ? " disabled" : ""}>Play</button>
            <button type="button" data-action-command="stop"${stopDisabled ? " disabled" : ""}>Stop</button>
          </div>
        </td>
      `;
      els.actionManagerRows.appendChild(row);
    }
  }

  els.actionManagerOnEndInput.innerHTML = "";
  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "None";
  noneOption.selected = true;
  els.actionManagerOnEndInput.appendChild(noneOption);
  for (const actionId of actionIds) {
    if (selectedAction && actionId === selectedActionId) continue;
    const option = document.createElement("option");
    option.value = actionId;
    option.textContent = actionId;
    if (selectedAction && String(selectedAction.onEndActionId || "") === actionId) {
      option.selected = true;
      noneOption.selected = false;
    }
    els.actionManagerOnEndInput.appendChild(option);
  }

  if (selectedAction) {
    state.draftSuggestedIds.action = "";
    const actionId = String(selectedAction.actionId || state.selectedActionId || "action");
    setInputValueIfIdle(els.actionManagerIdInput, actionId);
    setInputValueIfIdle(els.actionManagerNameInput, String(selectedAction.name || actionId));
    setInputValueIfIdle(els.actionManagerDurationInput, String(Math.max(0, Math.round(parseFiniteNumber(selectedAction.durationMs, 0)))));
    setInputValueIfIdle(els.actionManagerOscStartInput, String(selectedAction.oscTriggers?.start || defaultActionOscPath(actionId, "start")));
    setInputValueIfIdle(els.actionManagerOscStopInput, String(selectedAction.oscTriggers?.stop || defaultActionOscPath(actionId, "stop")));
    setInputValueIfIdle(els.actionManagerOscAbortInput, String(selectedAction.oscTriggers?.abort || defaultActionOscPath(actionId, "abort")));
    els.actionManagerEnabledInput.checked = selectedAction.enabled !== false;
    if (!document.activeElement || document.activeElement !== els.actionManagerOnEndInput) {
      els.actionManagerOnEndInput.value = String(selectedAction.onEndActionId || "");
    }
  } else {
    const suggestedActionId = uniqueActionId("action");
    state.draftSuggestedIds.action = suggestedActionId;
    if (!String(els.actionManagerIdInput.value || "").trim()) {
      setInputValueIfIdle(els.actionManagerIdInput, suggestedActionId);
    }
    if (!String(els.actionManagerNameInput.value || "").trim()) {
      setInputValueIfIdle(els.actionManagerNameInput, humanizeId(els.actionManagerIdInput.value || suggestedActionId) || suggestedActionId);
    }
    if (!String(els.actionManagerDurationInput.value || "").trim()) {
      setInputValueIfIdle(els.actionManagerDurationInput, "4000");
    }
    const fallbackId = String(els.actionManagerIdInput.value || suggestedActionId).trim() || suggestedActionId;
    if (!String(els.actionManagerOscStartInput.value || "").trim()) {
      setInputValueIfIdle(els.actionManagerOscStartInput, defaultActionOscPath(fallbackId, "start"));
    }
    if (!String(els.actionManagerOscStopInput.value || "").trim()) {
      setInputValueIfIdle(els.actionManagerOscStopInput, defaultActionOscPath(fallbackId, "stop"));
    }
    if (!String(els.actionManagerOscAbortInput.value || "").trim()) {
      setInputValueIfIdle(els.actionManagerOscAbortInput, defaultActionOscPath(fallbackId, "abort"));
    }
    if (!document.activeElement || document.activeElement !== els.actionManagerEnabledInput) {
      els.actionManagerEnabledInput.checked = true;
    }
    if (!document.activeElement || document.activeElement !== els.actionManagerOnEndInput) {
      els.actionManagerOnEndInput.value = "";
    }
  }

  const selectedActionGroupId = String(state.selectedActionGroupId || "").trim();
  const selectedActionGroup = selectedActionGroupId ? actionGroupsById[selectedActionGroupId] : null;
  if (selectedActionGroup) {
    const groupId = String(selectedActionGroup.groupId || selectedActionGroupId || "group");
    const draftGroupId = String(state.draftSuggestedIds.actionGroup || "").trim();
    const keepDraftGroupId = Boolean(
      document.activeElement === els.actionGroupManagerNameInput
      && draftGroupId
      && draftGroupId !== groupId
    );
    if (keepDraftGroupId) {
      els.actionGroupManagerIdInput.value = draftGroupId;
    } else {
      state.draftSuggestedIds.actionGroup = "";
      els.actionGroupManagerIdInput.value = groupId;
    }
    setInputValueIfIdle(els.actionGroupManagerNameInput, String(selectedActionGroup.name || groupId));
    setInputValueIfIdle(
      els.actionGroupManagerOscTriggerInput,
      String(selectedActionGroup.oscTriggers?.trigger || defaultActionGroupOscPath(groupId))
    );
    els.actionGroupManagerEnabledInput.checked = selectedActionGroup.enabled !== false;
  } else {
    const suggestedGroupId = sanitizeActionGroupId(
      deriveIdBaseFromName(String(els.actionGroupManagerNameInput.value || "").trim(), "group"),
      { allowAuto: true }
    );
    state.draftSuggestedIds.actionGroup = suggestedGroupId;
    els.actionGroupManagerIdInput.value = suggestedGroupId;
    if (!String(els.actionGroupManagerNameInput.value || "").trim()) {
      setInputValueIfIdle(els.actionGroupManagerNameInput, humanizeId(suggestedGroupId) || suggestedGroupId);
    }
    if (!String(els.actionGroupManagerOscTriggerInput.value || "").trim()) {
      setInputValueIfIdle(els.actionGroupManagerOscTriggerInput, defaultActionGroupOscPath(suggestedGroupId));
    }
    if (!document.activeElement || document.activeElement !== els.actionGroupManagerEnabledInput) {
      els.actionGroupManagerEnabledInput.checked = true;
    }
  }

  if (state.selectedActionGroupEntryGroupId !== selectedActionGroupId) {
    state.selectedActionGroupEntryGroupId = selectedActionGroupId || null;
    state.selectedActionGroupEntryIndex = null;
  }

  const selectedGroupEntries = Array.isArray(selectedActionGroup?.entries) ? selectedActionGroup.entries : [];
  if (!selectedActionGroup) {
    state.selectedActionGroupEntryIndex = null;
  } else if (
    !Number.isInteger(state.selectedActionGroupEntryIndex)
    || state.selectedActionGroupEntryIndex < 0
    || state.selectedActionGroupEntryIndex >= selectedGroupEntries.length
  ) {
    state.selectedActionGroupEntryIndex = null;
  }

  els.actionGroupEntryRows.innerHTML = "";
  if (!selectedActionGroup) {
    const row = document.createElement("tr");
    row.className = "action-group-entry-empty-row";
    row.innerHTML = '<td class="muted action-group-entry-empty-cell" colspan="5">Select an action group to view entries.</td>';
    els.actionGroupEntryRows.appendChild(row);
  } else if (!selectedGroupEntries.length) {
    const row = document.createElement("tr");
    row.className = "action-group-entry-empty-row";
    row.innerHTML = '<td class="muted action-group-entry-empty-cell" colspan="5">No entries configured.</td>';
    els.actionGroupEntryRows.appendChild(row);
  } else {
    selectedGroupEntries.forEach((entry, index) => {
      const description = describeActionGroupEntry(entry);
      const typeLabel = actionGroupEntryTypeLabel(entry);
      const targetLabel = actionGroupEntryTargetLabel(entry);
      const row = document.createElement("tr");
      row.className = "action-group-entry-row";
      row.dataset.entryIndex = String(index);
      row.tabIndex = 0;
      if (index === state.selectedActionGroupEntryIndex) {
        row.classList.add("is-selected");
      }
      row.innerHTML = `
        <td>${index + 1}</td>
        <td class="action-group-entry-name-cell" title="${escapeHtml(description.detail)}">${escapeHtml(description.name)}</td>
        <td>${escapeHtml(typeLabel)}</td>
        <td class="action-group-entry-target-cell">${escapeHtml(targetLabel)}</td>
        <td class="action-manager-row-actions-cell">
          <div class="action-manager-row-actions">
            <button type="button" data-action-group-entry-command="test">Test</button>
            <button class="danger" type="button" data-action-group-entry-command="remove">Remove</button>
          </div>
        </td>
      `;

      const selectEntry = () => {
        state.selectedActionGroupEntryIndex = index;
        reflectActionGroupEntryToInputs(entry);
        renderActionManager();
      };

      const triggerBtn = row.querySelector('button[data-action-group-entry-command="test"]');
      if (triggerBtn instanceof HTMLButtonElement) {
        triggerBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          void actionGroupEntryTriggerByIndex(index);
        });
      }

      const removeBtn = row.querySelector('button[data-action-group-entry-command="remove"]');
      if (removeBtn instanceof HTMLButtonElement) {
        removeBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          void actionGroupEntryRemove(index);
        });
      }

      row.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("button, input, select, textarea, a")) {
          return;
        }
        selectEntry();
      });
      row.addEventListener("keydown", (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("button, input, select, textarea, a")) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectEntry();
      });

      els.actionGroupEntryRows.appendChild(row);
    });
  }

  els.actionGroupListRows.innerHTML = "";
  if (!actionGroupIds.length) {
    els.actionGroupListSummary.textContent = "No action groups.";
    const row = document.createElement("tr");
    row.className = "action-group-list-empty-row";
    row.innerHTML = '<td class="muted action-group-list-empty" colspan="5">Create an action group to see it here.</td>';
    els.actionGroupListRows.appendChild(row);
  } else {
    const selectedLabel = selectedActionGroupId || "-";
    els.actionGroupListSummary.textContent = `${actionGroupIds.length} group${actionGroupIds.length === 1 ? "" : "s"} | selected: ${selectedLabel}`;
    for (const groupId of actionGroupIds) {
      const group = actionGroupsById[groupId] || {};
      const enabled = group.enabled !== false;
      const entryCount = Array.isArray(group.entries) ? group.entries.length : 0;
      const actionIds = actionIdsInGroup(group);
      const groupName = String(group.name || "").trim();
      const displayName = groupName || humanizeId(groupId) || groupId;
      const entryLabel = `${entryCount} entr${entryCount === 1 ? "y" : "ies"}`;

      const row = document.createElement("tr");
      row.className = "action-group-list-row";
      row.dataset.groupId = groupId;
      row.tabIndex = 0;
      if (groupId === selectedActionGroupId) {
        row.classList.add("is-selected");
      }
      if (!enabled) {
        row.classList.add("is-disabled");
      }
      row.innerHTML = `
        <td class="action-group-enabled-cell">
          <button
            type="button"
            class="action-enabled-toggle action-group-enabled-toggle${enabled ? " is-on" : ""}"
            data-action-group-toggle-enabled="${enabled ? "true" : "false"}"
            aria-pressed="${enabled ? "true" : "false"}"
          >${enabled ? "On" : "Off"}</button>
        </td>
        <td>${escapeHtml(groupId)}</td>
        <td class="action-group-list-name-cell">${escapeHtml(displayName)}</td>
        <td>${escapeHtml(entryLabel)}</td>
        <td class="action-manager-row-actions-cell">
          <div class="action-manager-row-actions">
            <button type="button" data-action-group-command="play"${enabled ? "" : " disabled"}>Play</button>
            <button type="button" data-action-group-command="stop"${actionIds.length ? "" : " disabled"}>Stop</button>
          </div>
        </td>
      `;

      const selectGroup = () => {
        state.selectedActionGroupId = groupId;
        renderActionManager();
      };
      row.addEventListener("click", (event) => {
        const target = event.target;
        const enabledToggle = target instanceof Element
          ? target.closest("button[data-action-group-toggle-enabled]")
          : null;
        if (enabledToggle instanceof HTMLButtonElement) {
          const enabledNow = String(enabledToggle.dataset.actionGroupToggleEnabled || "").toLowerCase() !== "false";
          state.selectedActionGroupId = groupId;
          renderActionManager();
          void actionGroupManagerToggleEnabled(groupId, !enabledNow);
          return;
        }
        if (target instanceof Element && target.closest("button")) {
          return;
        }
        selectGroup();
      });
      row.addEventListener("keydown", (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("button")) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectGroup();
      });

      const playBtn = row.querySelector('button[data-action-group-command="play"]');
      if (playBtn instanceof HTMLButtonElement) {
        playBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          state.selectedActionGroupId = groupId;
          renderActionManager();
          void actionGroupManagerTrigger(groupId);
        });
      }
      const stopBtn = row.querySelector('button[data-action-group-command="stop"]');
      if (stopBtn instanceof HTMLButtonElement) {
        stopBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          state.selectedActionGroupId = groupId;
          renderActionManager();
          void actionGroupManagerStop(groupId);
        });
      }

      els.actionGroupListRows.appendChild(row);
    }
  }
  updateActionGroupEntryInputsState();

  if (!selectedAction) {
    state.selectedActionLfoActionId = null;
    state.selectedActionLfoIndex = null;
    state.selectedActionLfoTargetIndex = null;
  } else if (state.selectedActionLfoActionId !== selectedActionRuntimeId) {
    state.selectedActionLfoActionId = selectedActionRuntimeId;
    state.selectedActionLfoIndex = null;
    state.selectedActionLfoTargetIndex = null;
  }

  els.actionManagerSaveBtn.disabled = !selectedAction;
  els.actionManagerSaveAsBtn.disabled = !selectedAction;
  els.actionManagerDeleteBtn.disabled = !selectedAction;
  els.actionGroupManagerSaveBtn.disabled = !selectedActionGroup;
  els.actionGroupManagerDeleteBtn.disabled = !selectedActionGroup;
  let entryPayloadValid = true;
  try {
    actionGroupEntryPayloadFromInputs();
  } catch {
    entryPayloadValid = false;
  }
  els.actionGroupEntryAddBtn.disabled = !selectedActionGroup || !entryPayloadValid;
  els.actionGroupEntryTriggerBtn.disabled = !entryPayloadValid;
  els.actionGroupEntryClearBtn.disabled = !selectedActionGroup || !selectedGroupEntries.length;
  els.actionManagerLfoAddBtn.disabled = !selectedAction;
  const selectedLfos = Array.isArray(selectedAction?.lfos) ? selectedAction.lfos : [];
  const selectedLfoGroups = collectLfoGroups(selectedLfos);
  if (Number.isInteger(state.selectedActionLfoIndex)) {
    const hasMatchingGroup = selectedLfoGroups.some((group) => group.representativeIndex === state.selectedActionLfoIndex);
    if (!hasMatchingGroup) {
      state.selectedActionLfoIndex = null;
      state.selectedActionLfoTargetIndex = null;
    }
  }
  const selectedLfoGroup = Number.isInteger(state.selectedActionLfoIndex)
    ? (selectedLfoGroups.find((group) => group.representativeIndex === state.selectedActionLfoIndex) || null)
    : null;
  const hasSelectedLfo = Boolean(selectedLfoGroup);
  if (!hasSelectedLfo) {
    cancelActionLfoAutoApplyTimer();
    state.selectedActionLfoTargetIndex = null;
  }
  const objects = [...getObjects()]
    .sort((a, b) => String(a.objectId || "").localeCompare(String(b.objectId || "")));
  const hasObjects = objects.length > 0;
  const canEditLfoTargets = Boolean(selectedAction && hasSelectedLfo && hasObjects);
  els.actionManagerLfoAddTargetBtn.disabled = !canEditLfoTargets;
  els.actionManagerLfoClearBtn.disabled = !selectedAction || !selectedLfos.length;
  if (els.actionManagerLfoTargetObjectInput) {
    const previousObjectId = String(els.actionManagerLfoTargetObjectInput.value || "").trim();
    const preferredObjectId = objects.some((obj) => String(obj.objectId || "").trim() === previousObjectId)
      ? previousObjectId
      : String(state.selectedObjectId || objects[0]?.objectId || "").trim();
    els.actionManagerLfoTargetObjectInput.innerHTML = "";
    if (!objects.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No objects";
      option.disabled = true;
      option.selected = true;
      els.actionManagerLfoTargetObjectInput.appendChild(option);
    } else {
      for (const obj of objects) {
        const objectId = String(obj.objectId || "").trim();
        if (!objectId) continue;
        const option = document.createElement("option");
        option.value = objectId;
        option.textContent = objectId;
        if (objectId === preferredObjectId) {
          option.selected = true;
        }
        els.actionManagerLfoTargetObjectInput.appendChild(option);
      }
      if (!String(els.actionManagerLfoTargetObjectInput.value || "").trim() && preferredObjectId) {
        els.actionManagerLfoTargetObjectInput.value = preferredObjectId;
      }
    }
    els.actionManagerLfoTargetObjectInput.disabled = !canEditLfoTargets;
  }
  if (els.actionManagerLfoTargetParamInput) {
    const currentParam = String(els.actionManagerLfoTargetParamInput.value || "").trim().toLowerCase();
    if (!LFO_PARAM_OPTIONS.includes(currentParam)) {
      let fallbackParam = "y";
      const firstTargetLabel = selectedLfoGroup?.targetLabels?.find(Boolean) || "";
      if (firstTargetLabel.includes(".")) {
        const candidateParam = firstTargetLabel.split(".").pop() || "";
        if (LFO_PARAM_OPTIONS.includes(candidateParam)) {
          fallbackParam = candidateParam;
        }
      }
      els.actionManagerLfoTargetParamInput.value = fallbackParam;
    }
    els.actionManagerLfoTargetParamInput.disabled = !canEditLfoTargets;
  }
  if (els.actionManagerLfoTargetPhaseInput) {
    const currentPhase = parseFiniteNumber(els.actionManagerLfoTargetPhaseInput.value, Number.NaN);
    if (!Number.isFinite(currentPhase)) {
      els.actionManagerLfoTargetPhaseInput.value = "0";
    }
    els.actionManagerLfoTargetPhaseInput.disabled = !canEditLfoTargets;
  }

  const selectedTargetEntries = [];
  if (selectedLfoGroup) {
    for (const entryIndex of selectedLfoGroup.entryIndices) {
      if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= selectedLfos.length) continue;
      const entry = selectedLfos[entryIndex] || {};
      if (!lfoHasAssignedTarget(entry)) continue;
      const objectId = String(entry.objectId || entry.object_id || "").trim();
      const parameter = String(entry.parameter || "").trim();
      selectedTargetEntries.push({
        entryIndex,
        lfo: entry,
        objectId,
        parameter,
        targetLabel: `${objectId}.${parameter}`,
        mappingPhaseDeg: parseFiniteNumber(entry.mappingPhaseDeg, 0),
        enabled: entry.enabled !== false
      });
    }
  }
  if (!selectedAction || !hasSelectedLfo) {
    state.selectedActionLfoTargetIndex = null;
  } else if (Number.isInteger(state.selectedActionLfoTargetIndex)) {
    const hasMatchingTarget = selectedTargetEntries.some((entry) => entry.entryIndex === state.selectedActionLfoTargetIndex);
    if (!hasMatchingTarget) {
      state.selectedActionLfoTargetIndex = null;
    }
  }
  if (!Number.isInteger(state.selectedActionLfoTargetIndex) && selectedTargetEntries.length) {
    state.selectedActionLfoTargetIndex = selectedTargetEntries[0].entryIndex;
  }
  const selectedTargetEntry = Number.isInteger(state.selectedActionLfoTargetIndex)
    ? (selectedTargetEntries.find((entry) => entry.entryIndex === state.selectedActionLfoTargetIndex) || null)
    : null;
  if (selectedTargetEntry) {
    if (els.actionManagerLfoTargetObjectInput) {
      const selectedObjectId = selectedTargetEntry.objectId;
      const hasSelectedObjectOption = Array.from(els.actionManagerLfoTargetObjectInput.options)
        .some((option) => String(option.value || "").trim() === selectedObjectId);
      if (hasSelectedObjectOption) {
        setInputValueIfIdle(els.actionManagerLfoTargetObjectInput, selectedObjectId);
      }
    }
    if (els.actionManagerLfoTargetParamInput && LFO_PARAM_OPTIONS.includes(selectedTargetEntry.parameter)) {
      setInputValueIfIdle(els.actionManagerLfoTargetParamInput, selectedTargetEntry.parameter);
    }
    if (els.actionManagerLfoTargetPhaseInput) {
      setInputValueIfIdle(els.actionManagerLfoTargetPhaseInput, String(selectedTargetEntry.mappingPhaseDeg));
    }
  }

  if (els.actionManagerLfoTargetsSummary) {
    if (!selectedAction) {
      els.actionManagerLfoTargetsSummary.textContent = "Select an action to manage LFO targets.";
    } else if (!hasSelectedLfo) {
      els.actionManagerLfoTargetsSummary.textContent = "Select an LFO to manage targets.";
    } else if (!selectedTargetEntries.length) {
      const lfoId = String(selectedLfoGroup?.lfoId || "").trim() || "lfo";
      els.actionManagerLfoTargetsSummary.textContent = `LFO ${lfoId} has no targets yet.`;
    } else {
      const lfoId = String(selectedLfoGroup?.lfoId || "").trim() || "lfo";
      const selectedTargetLabel = selectedTargetEntry ? selectedTargetEntry.targetLabel : "-";
      els.actionManagerLfoTargetsSummary.textContent = `LFO ${lfoId} targets: ${selectedTargetEntries.length} | selected: ${selectedTargetLabel}`;
    }
  }

  if (!selectedAction || !hasSelectedLfo) {
    els.actionManagerSelectedLfoSummary.textContent = "Selected LFO: none";
    if (selectedAction && !String(els.actionManagerLfoIdInput.value || "").trim()) {
      setInputValueIfIdle(els.actionManagerLfoIdInput, uniqueLfoId("lfo", selectedLfos));
    }
    updateLfoPolarityButton(els.actionManagerLfoPolarityBtn?.dataset?.polarity || "bipolar");
    if (!document.activeElement || document.activeElement !== els.actionManagerLfoEnabledInput) {
      els.actionManagerLfoEnabledInput.checked = true;
    }
  } else {
    const selectedLfo = selectedLfoGroup.lfo;
    if (selectedLfo && typeof selectedLfo === "object") {
      setLfoInputsFromModel(selectedLfo);
      const lfoId = selectedLfoGroup.lfoId;
      const wave = String(selectedLfo.wave || "sine");
      const rateHz = parseFiniteNumber(selectedLfo.rateHz, 0);
      const polarityLabel = normalizeLfoPolarity(selectedLfo.polarity) === "unipolar" ? "unipolar" : "bipolar";
      const enabledLabel = selectedLfo.enabled === false ? "off" : "on";
      const targetSummary = selectedLfoGroup.targetCount ? `${selectedLfoGroup.targetCount}` : "0";
      els.actionManagerSelectedLfoSummary.textContent = `Selected LFO: ${lfoId} (${wave}, ${rateHz.toFixed(3)} Hz, ${polarityLabel}, ${enabledLabel}) | targets: ${targetSummary}`;
    } else {
      els.actionManagerSelectedLfoSummary.textContent = "Selected LFO: none";
    }
  }

  els.actionManagerLfoRows.innerHTML = "";
  if (!selectedAction || !selectedLfoGroups.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td class="muted" colspan="9">No LFOs configured.</td>';
    els.actionManagerLfoRows.appendChild(row);
  } else {
    selectedLfoGroups.forEach((group) => {
      const lfo = group.lfo && typeof group.lfo === "object" ? group.lfo : {};
      const index = group.representativeIndex;
      const row = document.createElement("tr");
      row.dataset.lfoIndex = String(index);
      row.tabIndex = 0;
      if (index === state.selectedActionLfoIndex) {
        row.classList.add("is-selected");
      }
      const lfoId = group.lfoId || lfoDisplayId(lfo, `lfo-${index + 1}`);
      const polarity = normalizeLfoPolarity(lfo.polarity);
      const polarityLabel = polarity === "unipolar" ? "Unipolar" : "Bipolar";
      const targetText = group.targetLabels.slice(0, 2).join(", ");
      const moreSuffix = group.targetCount > 2 ? ` +${group.targetCount - 2}` : "";
      const targetSummary = group.targetCount ? `${targetText}${moreSuffix}` : "No targets";
      const lfoEnabled = lfo.enabled !== false;
      if (!lfoEnabled) {
        row.classList.add("is-disabled");
      }
      row.innerHTML = `
        <td class="action-lfo-enabled-cell">
          <button
            type="button"
            class="action-enabled-toggle action-lfo-enabled-toggle ${lfoEnabled ? "is-on" : ""}"
            data-action-lfo-toggle-enabled="${lfoEnabled ? "true" : "false"}"
            data-index="${index}"
            aria-pressed="${lfoEnabled ? "true" : "false"}"
          >${lfoEnabled ? "On" : "Off"}</button>
        </td>
        <td>${escapeHtml(lfoId)}</td>
        <td>${escapeHtml(String(lfo.wave || "sine"))}</td>
        <td>${escapeHtml(String(parseFiniteNumber(lfo.rateHz, 0).toFixed(3)))}</td>
        <td>${escapeHtml(String(parseFiniteNumber(lfo.depth, 0).toFixed(3)))}</td>
        <td>${escapeHtml(String(parseFiniteNumber(lfo.offset, 0).toFixed(3)))}</td>
        <td>${escapeHtml(polarityLabel)}</td>
        <td>${escapeHtml(targetSummary)}</td>
        <td class="action-manager-row-actions-cell">
          <div class="action-manager-row-actions">
            <button class="danger action-lfo-remove-btn" data-index="${index}" type="button">Remove</button>
          </div>
        </td>
      `;
      const toggleBtn = row.querySelector(".action-lfo-enabled-toggle");
      if (toggleBtn instanceof HTMLButtonElement) {
        toggleBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const enabledNow = String(toggleBtn.dataset.actionLfoToggleEnabled || "").toLowerCase() !== "false";
          void actionManagerToggleLfoEnabled(index, !enabledNow);
        });
      }
      const removeBtn = row.querySelector(".action-lfo-remove-btn");
      if (removeBtn) {
        removeBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          void actionManagerRemoveLfo(index);
        });
      }
      const selectLfo = () => {
        state.selectedActionLfoActionId = selectedActionRuntimeId;
        state.selectedActionLfoIndex = index;
        state.selectedActionLfoTargetIndex = null;
        setLfoInputsFromModel(lfo);
        renderActionManager();
      };
      row.addEventListener("click", () => {
        selectLfo();
      });
      row.addEventListener("keydown", (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("button, input, select, textarea, a")) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectLfo();
      });
      els.actionManagerLfoRows.appendChild(row);
    });
  }

  if (els.actionManagerLfoTargetRows) {
    els.actionManagerLfoTargetRows.innerHTML = "";
    if (!selectedAction) {
      const row = document.createElement("tr");
      row.innerHTML = '<td class="muted" colspan="4">Select an action to manage targets.</td>';
      els.actionManagerLfoTargetRows.appendChild(row);
    } else if (!hasSelectedLfo) {
      const row = document.createElement("tr");
      row.innerHTML = '<td class="muted" colspan="4">Select an LFO to view targets.</td>';
      els.actionManagerLfoTargetRows.appendChild(row);
    } else if (!selectedTargetEntries.length) {
      const row = document.createElement("tr");
      row.innerHTML = '<td class="muted" colspan="4">No targets assigned. Use Add Target above.</td>';
      els.actionManagerLfoTargetRows.appendChild(row);
    } else {
      for (const targetEntry of selectedTargetEntries) {
        const row = document.createElement("tr");
        row.dataset.lfoTargetIndex = String(targetEntry.entryIndex);
        row.tabIndex = 0;
        if (targetEntry.entryIndex === state.selectedActionLfoTargetIndex) {
          row.classList.add("is-selected");
        }
        if (targetEntry.enabled === false) {
          row.classList.add("is-disabled");
        }
        row.innerHTML = `
          <td>${escapeHtml(targetEntry.targetLabel)}</td>
          <td>
            <input
              class="action-lfo-target-phase-input"
              type="number"
              step="1"
              value="${escapeHtml(String(targetEntry.mappingPhaseDeg))}"
              data-lfo-target-index="${targetEntry.entryIndex}"
              aria-label="Mapping phase for ${escapeHtml(targetEntry.targetLabel)}"
            />
          </td>
          <td>${targetEntry.enabled ? "On" : "Off"}</td>
          <td class="action-manager-row-actions-cell">
            <div class="action-manager-row-actions">
              <button type="button" data-action-lfo-target-command="update" data-index="${targetEntry.entryIndex}">Save</button>
              <button class="danger" type="button" data-action-lfo-target-command="remove" data-index="${targetEntry.entryIndex}">Remove</button>
            </div>
          </td>
        `;

        const phaseInput = row.querySelector(".action-lfo-target-phase-input");
        const saveBtn = row.querySelector('button[data-action-lfo-target-command="update"]');
        const removeBtn = row.querySelector('button[data-action-lfo-target-command="remove"]');
        const entryIndex = targetEntry.entryIndex;

        if (phaseInput instanceof HTMLInputElement) {
          phaseInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void actionManagerUpdateLfoTargetPhase(entryIndex, parseFiniteNumber(phaseInput.value, targetEntry.mappingPhaseDeg));
          });
        }
        if (saveBtn instanceof HTMLButtonElement && phaseInput instanceof HTMLInputElement) {
          saveBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            void actionManagerUpdateLfoTargetPhase(entryIndex, parseFiniteNumber(phaseInput.value, targetEntry.mappingPhaseDeg));
          });
        }
        if (removeBtn instanceof HTMLButtonElement) {
          removeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            void actionManagerRemoveLfoTarget(entryIndex);
          });
        }
        const selectTarget = () => {
          state.selectedActionLfoTargetIndex = entryIndex;
          renderActionManager();
        };
        row.addEventListener("click", (event) => {
          const target = event.target;
          if (target instanceof Element && target.closest("button, input, select, textarea, a")) {
            return;
          }
          selectTarget();
        });
        row.addEventListener("keydown", (event) => {
          const target = event.target;
          if (target instanceof Element && target.closest("button, input, select, textarea, a")) {
            return;
          }
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectTarget();
        });

        els.actionManagerLfoTargetRows.appendChild(row);
      }
    }
  }

  renderActionLfoDebug(selectedAction, selectedLfoGroup, isRunning);
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

async function setLfosEnabled(enabled) {
  try {
    await api("/api/lfos/enabled", "POST", { enabled: Boolean(enabled) });
    addLog(`lfos ${enabled ? "enabled" : "disabled"}`);
    await refreshStatus();
  } catch (error) {
    addLog(`lfos toggle failed: ${error.message}`);
    await refreshStatus();
  }
}

function renderGroupsPanel() {
  const customGroups = [...getObjectGroups()].sort((a, b) => String(a.groupId).localeCompare(String(b.groupId)));
  const groups = [getVirtualAllGroup(), ...customGroups];
  const groupsEnabled = areGroupsEnabled();
  els.enableGroupsToggle.checked = groupsEnabled;
  els.groupsToggleList.innerHTML = "";

  const enabledCount = groups.filter((group) => isGroupEnabled(group)).length;
  els.groupsSummary.textContent = groupsEnabled ? `${enabledCount}/${groups.length} groups enabled` : "Groups disabled";

  for (const group of groups) {
    const isVirtualAll = Boolean(group.virtual);
    const row = document.createElement("label");
    row.className = "group-toggle-row";
    const groupColor = normalizeHexColor(group.color, DEFAULT_GROUP_COLOR);

    const meta = document.createElement("span");
    meta.className = "group-toggle-meta";

    const name = document.createElement("span");
    name.className = "group-toggle-name";
    const chip = document.createElement("span");
    chip.className = "group-color-chip";
    chip.style.background = groupColor;
    const title = document.createElement("span");
    title.textContent = isVirtualAll ? `${String(group.name || group.groupId)} (locked)` : String(group.name || group.groupId);
    name.appendChild(chip);
    name.appendChild(title);
    meta.appendChild(name);

    const detail = document.createElement("span");
    detail.className = "muted";
    detail.textContent = `${group.groupId} | ${group.objectIds.length} object${group.objectIds.length === 1 ? "" : "s"}${isVirtualAll ? " | system" : ""}`;
    meta.appendChild(detail);

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = isVirtualAll ? groupsEnabled : isGroupEnabled(group);
    toggle.disabled = isVirtualAll || !groupsEnabled;
    if (!isVirtualAll) {
      toggle.addEventListener("change", () => {
        void setGroupEnabled(group.groupId, toggle.checked);
      });
    }

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
    state.draftSuggestedIds.objectGroup = "";
    setInputValueIfIdle(els.managerGroupId, String(selectedGroup.groupId));
    setInputValueIfIdle(els.managerGroupName, String(selectedGroup.name || selectedGroup.groupId));
    setInputValueIfIdle(els.managerGroupColor, normalizeHexColor(selectedGroup.color, DEFAULT_GROUP_COLOR));
    applyLinkParamsToInputs(selectedGroup.linkParams || []);
    els.managerGroupSummary.textContent = `Group members: ${selectedGroup.objectIds.length}. Update will replace members with current selection (${selectedObjectIds.length}).`;
  } else {
    const suggestedId = uniqueGroupId(suggestGroupBaseFromSelection(selectedObjectIds));
    state.draftSuggestedIds.objectGroup = suggestedId;
    const suggestedColor = suggestGroupColorFromSelection(selectedObjectIds);
    if (!String(els.managerGroupId.value || "").trim()) {
      setInputValueIfIdle(els.managerGroupId, suggestedId);
    }
    if (!selectedLinkParamsFromInputs().length) {
      applyLinkParamsToInputs(["x", "y", "z"]);
    }
    setInputValueIfIdle(els.managerGroupColor, normalizeHexColor(els.managerGroupColor.value, suggestedColor));
    if (!String(els.managerGroupName.value || "").trim()) {
      const groupName = humanizeId(String(els.managerGroupId.value || suggestedId));
      setInputValueIfIdle(els.managerGroupName, groupName || String(els.managerGroupId.value || suggestedId));
    }
    els.managerGroupSummary.textContent = `${groups.length} group${groups.length === 1 ? "" : "s"} total. Create can be empty; Update uses current selection (${selectedObjectIds.length}).`;
  }

  els.managerGroupUpdateBtn.disabled = !state.selectedGroupId;
  els.managerGroupDeleteBtn.disabled = !state.selectedGroupId;
}

function summarizeGroupItems(values, maxVisible = 4) {
  const normalized = (Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean);
  if (!normalized.length) {
    return { preview: "-", full: "" };
  }
  if (normalized.length <= maxVisible) {
    const text = normalized.join(", ");
    return { preview: text, full: text };
  }
  const preview = `${normalized.slice(0, maxVisible).join(", ")} +${normalized.length - maxVisible}`;
  return { preview, full: normalized.join(", ") };
}

function selectedGroupManagerLinkParams() {
  return els.groupManagerEditLinkInputs
    .filter((input) => input.checked)
    .map((input) => String(input.dataset.param || "").trim())
    .filter(Boolean);
}

function applyGroupManagerLinkParams(linkParams) {
  const selected = new Set(Array.isArray(linkParams) ? linkParams : []);
  for (const input of els.groupManagerEditLinkInputs) {
    const param = String(input.dataset.param || "").trim();
    input.checked = selected.has(param);
  }
}

function selectedGroupManagerMemberIds() {
  const inputs = Array.from(els.groupManagerEditMembers.querySelectorAll("input[data-object-id]"));
  return inputs
    .filter((input) => input.checked)
    .map((input) => String(input.dataset.objectId || "").trim())
    .filter(Boolean);
}

function clearGroupManagerDraft() {
  state.groupManagerDraft.groupId = null;
  state.groupManagerDraft.memberIds = null;
  state.groupManagerDraft.linkParams = null;
}

function captureGroupManagerDraftFromEditor() {
  const selectedGroup = getSelectedGroup();
  const groupId = String(selectedGroup?.groupId || "").trim();
  if (!groupId) {
    clearGroupManagerDraft();
    return;
  }
  state.groupManagerDraft.groupId = groupId;
  state.groupManagerDraft.memberIds = selectedGroupManagerMemberIds();
  state.groupManagerDraft.linkParams = selectedGroupManagerLinkParams();
}

function renderGroupManagerDraftSummary() {
  const selectedGroup = getSelectedGroup();
  if (!selectedGroup) {
    if (els.groupManagerMembersSummary) {
      els.groupManagerMembersSummary.textContent = "Members";
    }
    els.groupManagerEditSummary.textContent = "No group selected.";
    return;
  }

  const groupId = String(selectedGroup.groupId || "").trim();
  const memberCount = selectedGroupManagerMemberIds().length;
  const linkCount = selectedGroupManagerLinkParams().length;
  if (els.groupManagerMembersSummary) {
    els.groupManagerMembersSummary.textContent = `Members (${memberCount})`;
  }
  els.groupManagerEditSummary.textContent = `Editing ${groupId}: ${memberCount} member${memberCount === 1 ? "" : "s"}, ${linkCount} linked param${linkCount === 1 ? "" : "s"}.`;
}

function renderGroupManagerEditor(selectedGroup, objects) {
  const hasGroup = Boolean(selectedGroup);
  els.groupManagerEditName.disabled = !hasGroup;
  els.groupManagerEditColor.disabled = !hasGroup;
  els.groupManagerEditSaveBtn.disabled = !hasGroup;
  els.groupManagerEditDeleteBtn.disabled = !hasGroup;
  for (const input of els.groupManagerEditLinkInputs) {
    input.disabled = !hasGroup;
  }

  if (!hasGroup) {
    clearGroupManagerDraft();
    els.groupManagerEditSelect.innerHTML = '<option value="">No groups</option>';
    setInputValueIfIdle(els.groupManagerEditName, "");
    setInputValueIfIdle(els.groupManagerEditColor, DEFAULT_GROUP_COLOR);
    applyGroupManagerLinkParams([]);
    els.groupManagerEditMembers.innerHTML = '<p class="muted">No members available.</p>';
    renderGroupManagerDraftSummary();
    return;
  }

  const groupId = String(selectedGroup.groupId || "").trim();
  const members = (Array.isArray(selectedGroup.objectIds) ? selectedGroup.objectIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const linkParams = (Array.isArray(selectedGroup.linkParams) ? selectedGroup.linkParams : [])
    .map((param) => String(param || "").trim())
    .filter(Boolean);
  const hasDraftForGroup = state.groupManagerDraft.groupId === groupId;
  const memberSet = new Set(
    (hasDraftForGroup && Array.isArray(state.groupManagerDraft.memberIds)
      ? state.groupManagerDraft.memberIds
      : members
    )
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );
  const draftLinkParams = hasDraftForGroup && Array.isArray(state.groupManagerDraft.linkParams)
    ? state.groupManagerDraft.linkParams
    : linkParams;

  setInputValueIfIdle(els.groupManagerEditName, String(selectedGroup.name || groupId));
  setInputValueIfIdle(els.groupManagerEditColor, normalizeHexColor(selectedGroup.color, DEFAULT_GROUP_COLOR));
  applyGroupManagerLinkParams(draftLinkParams);

  els.groupManagerEditMembers.innerHTML = "";
  if (!objects.length) {
    els.groupManagerEditMembers.innerHTML = '<p class="muted">No objects available.</p>';
  } else {
    for (const objectId of objects.map((obj) => String(obj.objectId || "").trim()).filter(Boolean)) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.objectId = objectId;
      checkbox.checked = memberSet.has(objectId);
      label.appendChild(checkbox);
      label.append(` ${objectId}`);
      els.groupManagerEditMembers.appendChild(label);
    }
  }

  renderGroupManagerDraftSummary();
}

function renderGroupManager() {
  const objects = [...getObjects()].sort((a, b) => String(a.objectId || "").localeCompare(String(b.objectId || "")));
  const groups = [...getObjectGroups()].sort((a, b) => String(a.groupId || "").localeCompare(String(b.groupId || "")));

  if (state.selectedGroupId && !groups.find((group) => group.groupId === state.selectedGroupId)) {
    state.selectedGroupId = null;
  }
  if (!state.selectedGroupId && groups.length) {
    state.selectedGroupId = groups[0].groupId;
  }

  els.groupManagerEditSelect.innerHTML = "";
  if (!groups.length) {
    els.groupManagerEditSelect.innerHTML = '<option value="">No groups</option>';
  } else {
    for (const group of groups) {
      const option = document.createElement("option");
      option.value = group.groupId;
      option.textContent = `${group.groupId} (${Array.isArray(group.objectIds) ? group.objectIds.length : 0})`;
      if (group.groupId === state.selectedGroupId) option.selected = true;
      els.groupManagerEditSelect.appendChild(option);
    }
  }

  els.groupManagerRows.innerHTML = "";
  els.groupManagerSummary.textContent = groups.length
    ? `${groups.length} group${groups.length === 1 ? "" : "s"}`
    : "No groups";

  if (!groups.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td class="muted" colspan="7">No groups created yet.</td>';
    els.groupManagerRows.appendChild(row);
    renderGroupManagerEditor(null, objects);
    return;
  }

  for (const group of groups) {
    const groupId = String(group.groupId || "").trim();
    const groupName = String(group.name || groupId).trim() || groupId;
    const groupColor = normalizeHexColor(group.color, DEFAULT_GROUP_COLOR);
    const groupEnabled = isGroupEnabled(group);
    const memberSummary = summarizeGroupItems(group.objectIds, 3);
    const linkSummary = summarizeGroupItems(group.linkParams, 4);

    const row = document.createElement("tr");
    row.dataset.groupId = groupId;
    row.tabIndex = 0;
    if (groupId === state.selectedGroupId) {
      row.classList.add("is-selected");
    }
    if (!groupEnabled) {
      row.classList.add("is-disabled");
    }
    row.innerHTML = `
      <td class="group-manager-enabled-cell">
        <button
          type="button"
          class="action-enabled-toggle group-manager-enabled-toggle ${groupEnabled ? "is-on" : ""}"
          data-group-toggle-enabled="${groupEnabled ? "true" : "false"}"
          aria-pressed="${groupEnabled ? "true" : "false"}"
        >${groupEnabled ? "On" : "Off"}</button>
      </td>
      <td>${escapeHtml(groupId)}</td>
      <td>${escapeHtml(groupName)}</td>
      <td><span class="color-chip" style="background:${escapeHtml(groupColor)}"></span>${escapeHtml(groupColor)}</td>
      <td title="${escapeHtml(memberSummary.full)}">${escapeHtml(memberSummary.preview)}</td>
      <td title="${escapeHtml(linkSummary.full)}">${escapeHtml(linkSummary.preview)}</td>
      <td class="group-manager-actions action-manager-row-actions-cell">
        <div class="action-manager-row-actions">
          <button class="group-manager-edit-btn" type="button">Edit</button>
          <button class="group-manager-delete-btn danger" type="button">Delete</button>
        </div>
      </td>
    `;
    els.groupManagerRows.appendChild(row);
  }

  renderGroupManagerEditor(getSelectedGroup(), objects);
}

function renderManager() {
  syncSelectedIdsWithObjects();
  const objects = getObjects();
  const orderedObjectIds = objects.map((obj) => String(obj.objectId || "").trim()).filter(Boolean);
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
    row.dataset.objectId = obj.objectId;
    row.tabIndex = 0;

    const positionText = `${Number(obj.x).toFixed(1)}, ${Number(obj.y).toFixed(1)}, ${Number(obj.z).toFixed(1)}`;
    const objectColor = normalizeHexColor(obj.color, DEFAULT_OBJECT_COLOR);
    const groupColor = effectiveGroupColorForObject(obj.objectId);
    const color = groupColor || objectColor;
    const colorSuffix = groupColor && groupColor !== objectColor ? " (group)" : "";
    const groupLabels = groups
      .filter((group) => Array.isArray(group.objectIds) && group.objectIds.includes(obj.objectId))
      .map((group) => `${group.groupId}${isGroupEnabled(group) ? "" : " (off)"}`);
    if (allMembers.has(obj.objectId)) {
      groupLabels.unshift(VIRTUAL_ALL_GROUP_NAME);
    }
    const groupText = groupLabels.length ? groupLabels.join(", ") : "-";
    const excludeFromAll = Boolean(obj.excludeFromAll);

    row.innerHTML = `
      <td>${escapeHtml(obj.objectId)}</td>
      <td>${escapeHtml(String(obj.type || DEFAULT_OBJECT_TYPE))}</td>
      <td><span class="color-chip" style="background:${escapeHtml(color)}"></span>${escapeHtml(color)}${escapeHtml(colorSuffix)}</td>
      <td>${escapeHtml(positionText)}</td>
      <td class="groups-cell">${escapeHtml(groupText)}</td>
      <td class="all-exclude-cell"><input class="row-exclude-all-toggle" type="checkbox" ${excludeFromAll ? "checked" : ""} aria-label="Exclude ${escapeHtml(obj.objectId)} from All" /></td>
    `;

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
      const target = event.target;
      if (target instanceof Element && target.closest("button, input, select, textarea, a")) {
        return;
      }
      const targetId = String(obj.objectId || "").trim();
      const isAdditive = event.metaKey || event.ctrlKey;
      const isRange = event.shiftKey;
      if (isRange) {
        const targetIndex = orderedObjectIds.indexOf(targetId);
        const anchorId = orderedObjectIds.includes(state.selectedObjectId) ? state.selectedObjectId : targetId;
        const anchorIndex = orderedObjectIds.indexOf(anchorId);
        if (targetIndex >= 0 && anchorIndex >= 0) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          const rangeIds = orderedObjectIds.slice(start, end + 1);
          const nextIds = isAdditive
            ? [...new Set([...selectedObjectTargets(), ...rangeIds])]
            : rangeIds;
          setSelection(nextIds);
          if (state.selectedObjectIds.includes(targetId)) {
            state.selectedObjectId = targetId;
          }
        } else {
          setSingleSelection(targetId);
        }
      } else if (isAdditive) {
        const wasSelected = isObjectSelected(targetId);
        toggleSelection(targetId);
        if (!wasSelected && state.selectedObjectIds.includes(targetId)) {
          state.selectedObjectId = targetId;
        }
      } else {
        setSingleSelection(targetId);
      }
      renderAll();
    });

    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("button, input, select, textarea, a")) return;
      event.preventDefault();
      const targetId = String(obj.objectId || "").trim();
      const isAdditive = event.metaKey || event.ctrlKey;
      if (isAdditive) {
        const wasSelected = isObjectSelected(targetId);
        toggleSelection(targetId);
        if (!wasSelected && state.selectedObjectIds.includes(targetId)) {
          state.selectedObjectId = targetId;
        }
      } else {
        setSingleSelection(targetId);
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
  renderActionManager();
  renderDebugControls();
  renderObjectSelect();
  renderInspector();
  renderGroupsPanel();
  renderManager();
  renderGroupManager();
  syncCameraInputs();
  renderPanner();
}

async function refreshStatus() {
  if (state.statusRefreshInFlight) {
    state.statusRefreshQueued = true;
    return;
  }

  state.statusRefreshInFlight = true;
  try {
    const previousShowPath = String(state.status?.show?.path || "");
    state.status = await api("/api/status");
    state.lastStatusRefreshMs = Date.now();
    const nextShowPath = String(state.status?.show?.path || "");
    maybeRefreshShowList(previousShowPath, nextShowPath);
    syncSelectedIdsWithObjects();
    const actionIds = getActionIds();
    if (state.selectedActionId && !actionIds.includes(state.selectedActionId)) {
      state.selectedActionId = null;
    }
    if (!state.selectedActionId && actionIds.length) {
      state.selectedActionId = actionIds[0];
    }
    const actionGroupIds = Object.keys(getActionGroupsById()).sort((a, b) => a.localeCompare(b));
    if (state.selectedActionGroupId && !actionGroupIds.includes(state.selectedActionGroupId)) {
      state.selectedActionGroupId = null;
    }
    if (!state.selectedActionGroupId && actionGroupIds.length) {
      state.selectedActionGroupId = actionGroupIds[0];
    }
    const groups = getObjectGroups();
    if (state.selectedGroupId && !groups.find((group) => group.groupId === state.selectedGroupId)) {
      state.selectedGroupId = null;
    }
    renderAll();
  } catch (error) {
    els.statusLine.textContent = `Status request failed: ${error.message}`;
    setUiStatus(`Status request failed: ${error.message}`, "error");
  } finally {
    state.statusRefreshInFlight = false;
    if (state.statusRefreshQueued) {
      state.statusRefreshQueued = false;
      void refreshStatus();
    }
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
    const inputName = String(els.managerGroupName.value || "").trim();
    const rawGroupId = String(els.managerGroupId.value || "").trim();
    const selectedGroup = getSelectedGroup();
    const selectedGroupId = String(selectedGroup?.groupId || "").trim();
    const selectedGroupName = String(selectedGroup?.name || selectedGroupId).trim();
    const deriveFromSelectedGroup = Boolean(
      selectedGroupId
      && rawGroupId === selectedGroupId
      && inputName
      && inputName !== selectedGroupName
    );
    const shouldDeriveFromName = Boolean(
      inputName
      && (
        !rawGroupId
        || rawGroupId === String(state.draftSuggestedIds.objectGroup || "").trim()
        || deriveFromSelectedGroup
      )
    );
    const groupIdSeed = shouldDeriveFromName
      ? deriveIdBaseFromName(inputName, suggestGroupBaseFromSelection(selectedObjectIds))
      : rawGroupId;
    const groupId = autoGroupId(groupIdSeed, selectedObjectIds);
    const suggestedName = humanizeId(groupId);
    const name = inputName || suggestedName || groupId;
    const groupColor = normalizeHexColor(
      els.managerGroupColor.value,
      suggestGroupColorFromSelection(selectedObjectIds)
    );
    const linkParams = selectedLinkParamsFromInputs();
    await api("/api/groups/create", "POST", {
      groupId,
      name,
      color: groupColor,
      objectIds: selectedObjectIds,
      linkParams
    });
    if (rawGroupId && rawGroupId !== groupId) {
      addLog(`group id normalized -> ${groupId}`);
    }
    if (!String(els.managerGroupName.value || "").trim() && suggestedName) {
      els.managerGroupName.value = suggestedName;
    }
    setInputValueIfIdle(els.managerGroupColor, groupColor);
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
    const groupColor = normalizeHexColor(els.managerGroupColor.value, DEFAULT_GROUP_COLOR);
    const linkParams = selectedLinkParamsFromInputs();
    await api(`/api/groups/${encodeURIComponent(groupId)}/update`, "POST", {
      name,
      color: groupColor,
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

async function groupManagerDeleteById(groupId) {
  const normalizedGroupId = String(groupId || "").trim();
  if (!normalizedGroupId) return;
  if (!confirm(`Delete group "${normalizedGroupId}"?`)) {
    return;
  }

  try {
    await api(`/api/groups/${encodeURIComponent(normalizedGroupId)}/delete`, "POST", {});
    if (state.selectedGroupId === normalizedGroupId) {
      state.selectedGroupId = null;
    }
    addLog(`group deleted -> ${normalizedGroupId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`group delete failed (${normalizedGroupId}): ${error.message}`);
  }
}

async function groupManagerCreate() {
  try {
    const selectedGroup = getSelectedGroup();
    const memberIdsFromEditor = selectedGroup ? selectedGroupManagerMemberIds() : [];
    const fallbackSelection = selectedObjectTargets();
    const objectIds = memberIdsFromEditor.length ? memberIdsFromEditor : fallbackSelection;

    const inputName = String(els.groupManagerEditName.value || "").trim();
    const fallbackBaseId = selectedGroup
      ? `${String(selectedGroup.groupId || "group")}-copy`
      : suggestGroupBaseFromSelection(objectIds);
    const baseId = inputName ? deriveIdBaseFromName(inputName, fallbackBaseId) : fallbackBaseId;
    const groupId = sanitizeGroupId(baseId, { allowAuto: true });

    const name = inputName || humanizeId(groupId) || groupId;
    const color = normalizeHexColor(
      els.groupManagerEditColor.value,
      suggestGroupColorFromSelection(objectIds)
    );
    const linkParams = selectedGroup ? selectedGroupManagerLinkParams() : ["x", "y", "z"];

    await api("/api/groups/create", "POST", {
      groupId,
      name,
      color,
      objectIds,
      linkParams
    });
    state.selectedGroupId = groupId;
    addLog(`group create -> ${groupId} (${objectIds.length} members)`);
    await refreshStatus();
  } catch (error) {
    addLog(`group create failed: ${error.message}`);
  }
}

async function groupManagerSaveEditor() {
  const selectedGroup = getSelectedGroup();
  if (!selectedGroup) {
    addLog("group update failed: No group selected");
    return;
  }
  const groupId = String(selectedGroup.groupId || "").trim();
  if (!groupId) {
    addLog("group update failed: Invalid group ID");
    return;
  }

  try {
    const name = String(els.groupManagerEditName.value || groupId).trim() || groupId;
    const color = normalizeHexColor(els.groupManagerEditColor.value, DEFAULT_GROUP_COLOR);
    const linkParams = selectedGroupManagerLinkParams();
    const objectIds = selectedGroupManagerMemberIds();

    await api(`/api/groups/${encodeURIComponent(groupId)}/update`, "POST", {
      name,
      color,
      linkParams,
      objectIds
    });
    clearGroupManagerDraft();
    addLog(`group updated -> ${groupId} (${objectIds.length} members)`);
    await refreshStatus();
  } catch (error) {
    addLog(`group update failed (${groupId}): ${error.message}`);
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

  els.viewActionManagerBtn.addEventListener("click", () => {
    setPage("action-manager");
  });

  els.viewActionGroupManagerBtn.addEventListener("click", () => {
    setPage("action-group-manager");
  });

  els.viewModulationManagerBtn.addEventListener("click", () => {
    setPage("modulation-manager");
  });

  els.viewObjectManagerBtn.addEventListener("click", () => {
    setPage("object-manager");
  });

  els.viewGroupManagerBtn.addEventListener("click", () => {
    setPage("group-manager");
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

  els.actionGroupManagerSelect.addEventListener("change", () => {
    state.selectedActionGroupId = String(els.actionGroupManagerSelect.value || "").trim() || null;
    renderActionManager();
  });

  els.actionGroupEntryTypeInput.addEventListener("change", () => {
    renderActionManager();
  });

  els.actionGroupEntryActionSelect.addEventListener("change", () => {
    renderActionManager();
  });

  els.actionGroupEntryLfoSelect.addEventListener("change", () => {
    renderActionManager();
  });

  els.actionGroupEntryLfosEnabledInput.addEventListener("change", () => {
    renderActionManager();
  });

  els.actionManagerRows.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const enabledToggle = target.closest("button[data-action-toggle-enabled]");
    if (enabledToggle instanceof HTMLButtonElement) {
      const row = enabledToggle.closest("tr");
      if (!row) return;
      const actionId = String(row.dataset.actionId || "").trim();
      if (!actionId) return;
      const isEnabledNow = String(enabledToggle.dataset.actionToggleEnabled || "").trim().toLowerCase() === "true";
      event.preventDefault();
      state.selectedActionId = actionId;
      void actionManagerToggleEnabled(actionId, !isEnabledNow);
      return;
    }
    const commandButton = target.closest("button[data-action-command]");
    if (commandButton instanceof HTMLButtonElement) {
      const command = String(commandButton.dataset.actionCommand || "").trim().toLowerCase();
      if (command !== "start" && command !== "stop") return;
      const row = commandButton.closest("tr");
      if (!row) return;
      const actionId = String(row.dataset.actionId || "").trim();
      if (!actionId) return;
      event.preventDefault();
      state.selectedActionId = actionId;
      void runAction(actionId, command);
      return;
    }
    const row = target.closest("tr");
    if (!row) return;
    const actionId = String(row.dataset.actionId || "").trim();
    if (!actionId) return;
    state.selectedActionId = actionId;
    renderActionManager();
  });

  els.actionManagerRows.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button, input, select, textarea, a")) return;
    const row = target.closest("tr");
    if (!row) return;
    const actionId = String(row.dataset.actionId || "").trim();
    if (!actionId) return;
    event.preventDefault();
    state.selectedActionId = actionId;
    renderActionManager();
  });

  els.actionManagerCreateBtn.addEventListener("click", () => {
    void actionManagerCreate();
  });

  els.actionManagerSaveBtn.addEventListener("click", () => {
    void actionManagerSave();
  });

  els.actionManagerSaveAsBtn.addEventListener("click", () => {
    void actionManagerSaveAs();
  });

  els.actionManagerDeleteBtn.addEventListener("click", () => {
    void actionManagerDelete();
  });

  els.actionGroupManagerCreateBtn.addEventListener("click", () => {
    void actionGroupManagerCreate();
  });

  els.actionGroupManagerSaveBtn.addEventListener("click", () => {
    void actionGroupManagerSave();
  });

  els.actionGroupManagerDeleteBtn.addEventListener("click", () => {
    void actionGroupManagerDelete();
  });

  els.actionGroupEntryAddBtn.addEventListener("click", () => {
    void actionGroupEntryAdd();
  });

  els.actionGroupEntryTriggerBtn.addEventListener("click", () => {
    void actionGroupEntryTrigger();
  });

  els.actionGroupEntryClearBtn.addEventListener("click", () => {
    void actionGroupEntryClear();
  });

  els.actionManagerNameInput.addEventListener("input", () => {
    const nameValue = String(els.actionManagerNameInput.value || "").trim();
    if (!nameValue) return;

    const selectedAction = selectedActionOrNull();
    const currentId = String(els.actionManagerIdInput.value || "").trim();
    if (selectedAction && currentId === String(selectedAction.actionId || "").trim()) {
      return;
    }

    const suggestedId = String(state.draftSuggestedIds.action || "").trim();
    if (currentId && suggestedId && currentId !== suggestedId) {
      return;
    }

    const previousId = currentId || suggestedId || "action";
    const derivedActionId = sanitizeActionId(deriveIdBaseFromName(nameValue, "action"), { allowAuto: true });
    if (!derivedActionId || derivedActionId === currentId) {
      return;
    }

    setInputValueIfIdle(els.actionManagerIdInput, derivedActionId);
    state.draftSuggestedIds.action = derivedActionId;

    const currentStart = String(els.actionManagerOscStartInput.value || "").trim();
    const currentStop = String(els.actionManagerOscStopInput.value || "").trim();
    const currentAbort = String(els.actionManagerOscAbortInput.value || "").trim();
    if (!currentStart || currentStart === defaultActionOscPath(previousId, "start")) {
      setInputValueIfIdle(els.actionManagerOscStartInput, defaultActionOscPath(derivedActionId, "start"));
    }
    if (!currentStop || currentStop === defaultActionOscPath(previousId, "stop")) {
      setInputValueIfIdle(els.actionManagerOscStopInput, defaultActionOscPath(derivedActionId, "stop"));
    }
    if (!currentAbort || currentAbort === defaultActionOscPath(previousId, "abort")) {
      setInputValueIfIdle(els.actionManagerOscAbortInput, defaultActionOscPath(derivedActionId, "abort"));
    }
  });

  els.actionGroupManagerNameInput.addEventListener("input", () => {
    const nameValue = String(els.actionGroupManagerNameInput.value || "").trim();
    if (!nameValue) return;

    const currentId = String(els.actionGroupManagerIdInput.value || "").trim();
    const suggestedId = String(state.draftSuggestedIds.actionGroup || "").trim();
    if (currentId && suggestedId && currentId !== suggestedId) {
      return;
    }

    const previousId = currentId || suggestedId || "group";
    const derivedGroupId = sanitizeActionGroupId(deriveIdBaseFromName(nameValue, "group"), { allowAuto: true });
    if (!derivedGroupId || derivedGroupId === currentId) {
      return;
    }

    els.actionGroupManagerIdInput.value = derivedGroupId;
    state.draftSuggestedIds.actionGroup = derivedGroupId;

    const currentTrigger = String(els.actionGroupManagerOscTriggerInput.value || "").trim();
    if (!currentTrigger || currentTrigger === defaultActionGroupOscPath(previousId)) {
      setInputValueIfIdle(els.actionGroupManagerOscTriggerInput, defaultActionGroupOscPath(derivedGroupId));
    }
  });

  els.actionGroupManagerIdInput.addEventListener("input", () => {
    const proposedGroupId = sanitizeActionGroupId(els.actionGroupManagerIdInput.value || "group", { allowAuto: true });
    state.draftSuggestedIds.actionGroup = proposedGroupId;
    if (!String(els.actionGroupManagerNameInput.value || "").trim()) {
      setInputValueIfIdle(els.actionGroupManagerNameInput, humanizeId(proposedGroupId) || proposedGroupId);
    }
    if (!String(els.actionGroupManagerOscTriggerInput.value || "").trim()) {
      setInputValueIfIdle(els.actionGroupManagerOscTriggerInput, defaultActionGroupOscPath(proposedGroupId));
    }
  });

  els.managerGroupName.addEventListener("input", () => {
    if (state.selectedGroupId) return;
    const nameValue = String(els.managerGroupName.value || "").trim();
    if (!nameValue) return;

    const currentId = String(els.managerGroupId.value || "").trim();
    const suggestedId = String(state.draftSuggestedIds.objectGroup || "").trim();
    if (currentId && suggestedId && currentId !== suggestedId) {
      return;
    }

    const selectedObjectIds = selectedObjectTargets();
    const fallbackBase = suggestGroupBaseFromSelection(selectedObjectIds);
    try {
      const derivedId = sanitizeGroupId(deriveIdBaseFromName(nameValue, fallbackBase), { allowAuto: true });
      if (derivedId && derivedId !== currentId) {
        setInputValueIfIdle(els.managerGroupId, derivedId);
      }
      state.draftSuggestedIds.objectGroup = derivedId;
    } catch {
      const fallbackId = uniqueGroupId(fallbackBase);
      setInputValueIfIdle(els.managerGroupId, fallbackId);
      state.draftSuggestedIds.objectGroup = fallbackId;
    }
  });

  els.actionManagerLfoAddBtn.addEventListener("click", () => {
    void actionManagerAddLfo();
  });

  els.actionManagerLfoAddTargetBtn.addEventListener("click", () => {
    void actionManagerAddLfoTarget();
  });

  els.actionManagerLfoClearBtn.addEventListener("click", () => {
    void actionManagerClearLfos();
  });

  const scheduleSelectedLfoAutoApply = () => {
    scheduleActionLfoAutoApply();
  };
  els.actionManagerLfoWaveInput.addEventListener("change", scheduleSelectedLfoAutoApply);
  els.actionManagerLfoRateInput.addEventListener("input", scheduleSelectedLfoAutoApply);
  els.actionManagerLfoDepthInput.addEventListener("input", scheduleSelectedLfoAutoApply);
  els.actionManagerLfoOffsetInput.addEventListener("input", scheduleSelectedLfoAutoApply);
  els.actionManagerLfoEnabledInput.addEventListener("change", scheduleSelectedLfoAutoApply);

  if (els.actionManagerLfoPolarityBtn) {
    els.actionManagerLfoPolarityBtn.addEventListener("click", () => {
      const current = normalizeLfoPolarity(els.actionManagerLfoPolarityBtn.dataset.polarity);
      updateLfoPolarityButton(current === "unipolar" ? "bipolar" : "unipolar");
      scheduleSelectedLfoAutoApply();
    });
  }

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

  els.groupManagerEditSelect.addEventListener("change", () => {
    state.selectedGroupId = String(els.groupManagerEditSelect.value || "").trim() || null;
    renderGroupManager();
  });

  els.groupManagerEditSaveBtn.addEventListener("click", () => {
    void groupManagerSaveEditor();
  });

  els.groupManagerCreateBtn.addEventListener("click", () => {
    void groupManagerCreate();
  });

  els.groupManagerEditDeleteBtn.addEventListener("click", () => {
    const selectedGroup = getSelectedGroup();
    if (!selectedGroup) return;
    void groupManagerDeleteById(selectedGroup.groupId);
  });

  els.groupManagerEditMembers.addEventListener("change", () => {
    captureGroupManagerDraftFromEditor();
    renderGroupManagerDraftSummary();
  });

  for (const input of els.groupManagerEditLinkInputs) {
    input.addEventListener("change", () => {
      captureGroupManagerDraftFromEditor();
      renderGroupManagerDraftSummary();
    });
  }

  els.groupManagerRows.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest("tr");
    if (!row) return;
    const groupId = String(row.dataset.groupId || "").trim();
    if (!groupId) return;
    const enabledToggle = target.closest("button[data-group-toggle-enabled]");
    if (enabledToggle instanceof HTMLButtonElement) {
      const enabledNow = String(enabledToggle.dataset.groupToggleEnabled || "").toLowerCase() !== "false";
      state.selectedGroupId = groupId;
      renderGroupManager();
      void setGroupEnabled(groupId, !enabledNow);
      return;
    }
    if (target.closest(".group-manager-delete-btn")) {
      void groupManagerDeleteById(groupId);
      return;
    }
    if (target.closest(".group-manager-edit-btn")) {
      state.selectedGroupId = groupId;
      renderGroupManager();
      return;
    }
    state.selectedGroupId = groupId;
    renderGroupManager();
  });

  els.groupManagerRows.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button, input, select, textarea, a")) return;
    const row = target.closest("tr");
    if (!row) return;
    const groupId = String(row.dataset.groupId || "").trim();
    if (!groupId) return;
    event.preventDefault();
    state.selectedGroupId = groupId;
    renderGroupManager();
  });

  els.toggleDebugEventsBtn.addEventListener("click", () => {
    state.debugEventsEnabled = !state.debugEventsEnabled;
    if (state.debugEventsEnabled) {
      state.lastDebugLogByTypeMs = {};
    }
    addLog(state.debugEventsEnabled ? "debug log enabled (sync unchanged)" : "debug log disabled (sync unchanged)");
    renderDebugControls();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!els.pannerContextMenu || els.pannerContextMenu.hidden) return;
    const target = event.target;
    if (!(target instanceof Node)) {
      closePannerContextMenu();
      return;
    }
    if (!els.pannerContextMenu.contains(target)) {
      closePannerContextMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePannerContextMenu();
    }
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
    closePannerContextMenu();
    if (state.currentPage !== "panner") return;

    const pt = toCanvasPoint(event);
    const hit = pickObject(pt);
    if (!hit || !hit.obj) return;
    const objectId = String(hit.obj.objectId || "").trim();
    if (!objectId) return;

    if (!isObjectSelected(objectId)) {
      setSingleSelection(objectId);
    } else if (state.selectedObjectId !== objectId) {
      state.selectedObjectId = objectId;
    }
    renderAll();
    openPannerContextMenu(objectId, event.clientX, event.clientY);
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
    closePannerContextMenu();

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
    closePannerContextMenu();
    renderPanner();
  });
}

function setupEventStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  const events = new EventSource("/api/events");
  state.eventSource = events;
  const types = ["status", "show", "scene", "object", "object_manager", "object_group", "action", "action_group", "action_lfo", "lfo_debug", "osc_in", "osc_out", "osc_error", "system"];

  for (const type of types) {
    events.addEventListener(type, (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (type === "object") {
          applyObjectRuntimeUpdate(parsed.payload);
        }
        if (type === "action") {
          const actionPayload = parsed.payload && typeof parsed.payload === "object" ? parsed.payload : {};
          const actionId = String(actionPayload.actionId || "").trim();
          const actionState = String(actionPayload.state || "").trim();
          const isCurrentlyRunning = actionId
            ? Array.isArray(state.status?.runningActions) && state.status.runningActions.includes(actionId)
            : false;
          if (actionId && actionState === "started" && !isCurrentlyRunning) {
            clearLfoDebugStats(actionId);
            delete state.lastLfoDebugEventByAction[actionId];
          }
          scheduleStatusRefresh(STATUS_EVENT_REFRESH_DEBOUNCE_MS);
        }
        if (type === "lfo_debug") {
          const payload = parsed.payload && typeof parsed.payload === "object" ? parsed.payload : {};
          const actionId = String(payload.actionId || "").trim();
          applyLfoDebugSamples(payload);
          if (actionId) {
            state.lastLfoDebugEventByAction[actionId] = payload;
          }
          if (state.currentPage === "modulation-manager") {
            renderSelectedActionLfoDebug();
          }
        }
        if (type === "show" || type === "scene" || type === "object_manager" || type === "object_group" || type === "action_group" || type === "action_lfo") {
          scheduleStatusRefresh(0);
        }
        if (shouldLogEventType(type)) {
          addLog(`${parsed.at} [${parsed.type}] ${JSON.stringify(parsed.payload)}`);
        }
      } catch {
        if (shouldLogEventType(type)) {
          addLog(`[${type}] ${ev.data}`);
        }
      }
    });
  }

  events.onerror = () => {
    addLog("event stream disconnected, retrying...");
  };
}

async function start() {
  setUiStatus("Connecting...");
  updateLfoPolarityButton("bipolar");
  syncCameraInputs();
  setPage("panner");
  setupHandlers();
  setupEventStream();
  await refreshShowList();
  await refreshStatus();

  setInterval(() => {
    const hasLiveStream = Boolean(state.eventSource && state.eventSource.readyState === EventSource.OPEN);
    const stale = (Date.now() - Number(state.lastStatusRefreshMs || 0)) >= STATUS_RECONCILE_INTERVAL_MS;
    if (!hasLiveStream || stale) {
      scheduleStatusRefresh(0);
    }
  }, STATUS_POLL_TICK_MS);
}

start();
