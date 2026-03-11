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
const GROUP_COLOR_PALETTE = [
  "#2f7f7a",
  "#1c4f89",
  "#8a5a14",
  "#9b3e7f",
  "#3f7f2f",
  "#9a2f2f",
  "#5d4db8",
  "#5e4a3b",
  "#1f7f99",
  "#8f7a1a"
];
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
const STREAMDECK_CONFIG_REFRESH_INTERVAL_MS = 10000;
const DRAG_PATCH_SEND_INTERVAL_MS = 16;
const DEBUG_LOG_NOISY_TYPES = new Set(["object", "osc_out", "osc_in"]);
const DEBUG_LOG_NOISY_THROTTLE_MS = 250;
const LFO_PARAM_OPTIONS = ["x", "y", "z", "size", "gain"];
const LFO_TARGET_SCOPE_OBJECT = "object";
const LFO_TARGET_SCOPE_GROUP = "group";
const LFO_POLARITIES = new Set(["bipolar", "unipolar"]);
const ACTION_RULE_TYPES = new Set(["modulationControl", "parameterRamp"]);
const ACTION_RULE_MODULATION_PARAMS = new Set([
  "enabled",
  "wave",
  "rateHz",
  "depth",
  "offset",
  "phaseDeg",
  "mappingPhaseDeg",
  "polarity"
]);
const ACTION_RULE_MODULATION_DISCRETE_VALUES = {
  enabled: ["true", "false"],
  wave: ["sine", "triangle", "square", "saw"],
  polarity: ["bipolar", "unipolar"]
};
const OSC_PREFIX_DEFAULTS = {
  objectPathPrefix: "/art/object",
  scenePathPrefix: "/art/scene",
  actionPathPrefix: "/art/action",
  actionGroupPathPrefix: "/art/action-group"
};
const RANDOM_ID_HASH_LENGTH = 10;
const THEME_STORAGE_KEY = "amadeus-ui-theme";
const CLIENT_UPDATE_SESSION_ID = (() => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `ui-${crypto.randomUUID()}`;
  }
  return `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
})();

const state = {
  status: null,
  selectedObjectId: null,
  selectedObjectIds: [],
  groupSelectEnabled: true,
  selectedGroupId: null,
  selectedSceneId: null,
  selectedActionId: null,
  selectedActionGroupId: null,
  selectedActionGroupEntryIndex: null,
  selectedActionGroupEntryGroupId: null,
  selectedActionLfoIndex: null,
  selectedActionLfoActionId: null,
  selectedActionLfoTargetIndex: null,
  uiTheme: "light",
  currentPage: "panner",
  objectUpdateSessionId: CLIENT_UPDATE_SESSION_ID,
  objectUpdateSeqByObjectId: {},
  draggingObjectId: null,
  draggingObjectIds: [],
  draggingMode: null,
  draggingPlaneY: 0,
  draggingStartY: 0,
  draggingStartPointerY: 0,
  draggingOffsetXZ: { x: 0, z: 0 },
  draggingRelativeXZ: {},
  draggingRelativeY: {},
  dragGestureId: 0,
  dragPatchInFlightByObjectId: {},
  dragQueuedPatchByObjectId: {},
  dragQueuedOptionsByObjectId: {},
  dragLastTargetPatchByObjectId: {},
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
  managerRenameAutoTimerId: null,
  managerTypeAutoTimerId: null,
  managerColorAutoTimerId: null,
  groupManagerAutoSaveTimerId: null,
  actionGroupAutoSaveTimerId: null,
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
  configDraft: null,
  configDraftDirty: false,
  streamdeckLayoutConfig: null,
  streamdeckConfigLastFetchMs: 0,
  streamdeckConfigRefreshInFlight: false,
  streamdeckConfigError: "",
  managerStructureRenderKey: "",
  managerPositionRenderKey: "",
  camera: {
    yawDeg: CAMERA_DEFAULT.yawDeg,
    pitchDeg: CAMERA_DEFAULT.pitchDeg,
    distance: CAMERA_DEFAULT.distance,
    fovDeg: CAMERA_DEFAULT.fovDeg
  }
};

const els = {
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  statusLine: document.getElementById("statusLine"),
  uiStatusBar: document.getElementById("uiStatusBar"),
  mainLayout: document.getElementById("mainLayout"),
  viewPannerBtn: document.getElementById("viewPannerBtn"),
  viewActionManagerBtn: document.getElementById("viewActionManagerBtn"),
  viewActionGroupManagerBtn: document.getElementById("viewActionGroupManagerBtn"),
  viewModulationManagerBtn: document.getElementById("viewModulationManagerBtn"),
  viewObjectManagerBtn: document.getElementById("viewObjectManagerBtn"),
  viewGroupManagerBtn: document.getElementById("viewGroupManagerBtn"),
  viewControlBtn: document.getElementById("viewControlBtn"),
  viewConfigurationBtn: document.getElementById("viewConfigurationBtn"),
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
  managerAddName: document.getElementById("managerAddName"),
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
  managerGroupSelectToggle: document.getElementById("managerGroupSelectToggle"),
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
  actionManagerRuleTypeInput: document.getElementById("actionManagerRuleTypeInput"),
  actionManagerRuleModFields: document.getElementById("actionManagerRuleModFields"),
  actionManagerRuleModTargetInput: document.getElementById("actionManagerRuleModTargetInput"),
  actionManagerRuleModParamInput: document.getElementById("actionManagerRuleModParamInput"),
  actionManagerRuleModValueInput: document.getElementById("actionManagerRuleModValueInput"),
  actionManagerRuleModValueSelect: document.getElementById("actionManagerRuleModValueSelect"),
  actionManagerRuleModEmptyNote: document.getElementById("actionManagerRuleModEmptyNote"),
  actionManagerRuleRampFields: document.getElementById("actionManagerRuleRampFields"),
  actionManagerRuleRampTargetInput: document.getElementById("actionManagerRuleRampTargetInput"),
  actionManagerRuleRampStartInput: document.getElementById("actionManagerRuleRampStartInput"),
  actionManagerRuleRampEndInput: document.getElementById("actionManagerRuleRampEndInput"),
  actionManagerRuleRampSpeedInput: document.getElementById("actionManagerRuleRampSpeedInput"),
  actionManagerRuleRampRelativeInput: document.getElementById("actionManagerRuleRampRelativeInput"),
  actionManagerRuleRampEmptyNote: document.getElementById("actionManagerRuleRampEmptyNote"),
  actionManagerOnEndInput: document.getElementById("actionManagerOnEndInput"),
  actionManagerOscStartInput: document.getElementById("actionManagerOscStartInput"),
  actionManagerOscStopInput: document.getElementById("actionManagerOscStopInput"),
  actionManagerOscAbortInput: document.getElementById("actionManagerOscAbortInput"),
  actionManagerCreateBtn: document.getElementById("actionManagerCreateBtn"),
  actionManagerSaveBtn: document.getElementById("actionManagerSaveBtn"),
  actionManagerSaveAsBtn: document.getElementById("actionManagerSaveAsBtn"),
  actionManagerDeleteBtn: document.getElementById("actionManagerDeleteBtn"),
  actionGroupManagerSelect: document.getElementById("actionGroupManagerSelect"),
  actionGroupManagerIdInput: document.getElementById("actionGroupManagerIdInput"),
  actionGroupManagerNameInput: document.getElementById("actionGroupManagerNameInput"),
  actionGroupManagerOscTriggerInput: document.getElementById("actionGroupManagerOscTriggerInput"),
  actionGroupManagerCreateBtn: document.getElementById("actionGroupManagerCreateBtn"),
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
  actionManagerLfoAddBtn: document.getElementById("actionManagerLfoAddBtn"),
  actionManagerLfoAddTargetBtn: document.getElementById("actionManagerLfoAddTargetBtn"),
  actionManagerLfoClearBtn: document.getElementById("actionManagerLfoClearBtn"),
  actionManagerSelectedLfoSummary: document.getElementById("actionManagerSelectedLfoSummary"),
  actionManagerLfoTargetsSummary: document.getElementById("actionManagerLfoTargetsSummary"),
  actionManagerLfoTargetScopeInput: document.getElementById("actionManagerLfoTargetScopeInput"),
  actionManagerLfoTargetObjectInput: document.getElementById("actionManagerLfoTargetObjectInput"),
  actionManagerLfoTargetParamInput: document.getElementById("actionManagerLfoTargetParamInput"),
  actionManagerLfoTargetPhaseInput: document.getElementById("actionManagerLfoTargetPhaseInput"),
  actionManagerLfoTargetSpreadInput: document.getElementById("actionManagerLfoTargetSpreadInput"),
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
  groupManagerEditDeleteBtn: document.getElementById("groupManagerEditDeleteBtn"),
  configurationSummary: document.getElementById("configurationSummary"),
  configOscOutHostInput: document.getElementById("configOscOutHostInput"),
  configOscOutPortInput: document.getElementById("configOscOutPortInput"),
  configOscInPortInput: document.getElementById("configOscInPortInput"),
  configOscObjectPrefixInput: document.getElementById("configOscObjectPrefixInput"),
  configOscScenePrefixInput: document.getElementById("configOscScenePrefixInput"),
  configOscActionPrefixInput: document.getElementById("configOscActionPrefixInput"),
  configOscActionGroupPrefixInput: document.getElementById("configOscActionGroupPrefixInput"),
  configSaveBtn: document.getElementById("configSaveBtn"),
  configResetBtn: document.getElementById("configResetBtn"),
  streamdeckConfigRefreshBtn: document.getElementById("streamdeckConfigRefreshBtn"),
  streamdeckConfigSummary: document.getElementById("streamdeckConfigSummary"),
  streamdeckConfigMeta: document.getElementById("streamdeckConfigMeta"),
  streamdeckConfigPagesRows: document.getElementById("streamdeckConfigPagesRows"),
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

function trimBaseForSuffix(base, fallbackBase, suffixToken) {
  const suffix = `-${suffixToken}`;
  const maxBaseLen = 64 - suffix.length;
  const trimmed = String(base || "").slice(0, Math.max(1, maxBaseLen)).replace(/[-._]+$/, "");
  return trimmed || fallbackBase;
}

function trimBaseForNumericSuffix(base, fallbackBase, numeric) {
  return trimBaseForSuffix(base, fallbackBase, String(numeric));
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

function randomHashId(length = RANDOM_ID_HASH_LENGTH) {
  const numericLength = Number(length);
  const targetLength = Number.isFinite(numericLength)
    ? Math.max(6, Math.min(32, Math.round(numericLength)))
    : RANDOM_ID_HASH_LENGTH;
  const alphabet = "0123456789abcdef";
  let token = "";

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(targetLength);
    crypto.getRandomValues(bytes);
    for (let index = 0; index < targetLength; index += 1) {
      token += alphabet[bytes[index] & 15];
    }
    return token;
  }

  for (let index = 0; index < targetLength; index += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
}

function uniqueIdWithHashSuffix(_baseId, fallbackBase, existingIds) {
  const existingLower = new Set(
    (Array.isArray(existingIds) ? existingIds : [])
      .map((id) => String(id || "").trim().toLowerCase())
      .filter(Boolean)
  );

  for (let attempt = 0; attempt < 1024; attempt += 1) {
    const candidate = randomHashId(RANDOM_ID_HASH_LENGTH);
    if (!existingLower.has(candidate.toLowerCase())) {
      return candidate;
    }
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
  return uniqueIdWithHashSuffix(
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

function suggestObjectNameFromType(typeValue) {
  const base = suggestObjectBaseFromType(typeValue);
  return humanizeId(base) || "Object";
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
  return uniqueIdWithHashSuffix(baseId, "group", getObjectGroups().map((group) => group.groupId));
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

function hslToHex(h, s, l) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const sat = clampValue(parseFiniteNumber(s, 0), [0, 100]) / 100;
  const light = clampValue(parseFiniteNumber(l, 0), [0, 100]) / 100;
  const chroma = (1 - Math.abs((2 * light) - 1)) * sat;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (segment >= 0 && segment < 1) {
    r1 = chroma;
    g1 = x;
  } else if (segment < 2) {
    r1 = x;
    g1 = chroma;
  } else if (segment < 3) {
    g1 = chroma;
    b1 = x;
  } else if (segment < 4) {
    g1 = x;
    b1 = chroma;
  } else if (segment < 5) {
    r1 = x;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = x;
  }
  const match = light - (chroma / 2);
  const toHex = (channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function suggestDistinctGroupColor(preferredColors = []) {
  const usedColors = new Set(
    getObjectGroups()
      .map((group) => normalizeHexColor(group?.color, DEFAULT_GROUP_COLOR))
  );
  const candidateColors = [
    ...preferredColors.map((color) => normalizeHexColor(color, DEFAULT_GROUP_COLOR)),
    ...GROUP_COLOR_PALETTE.map((color) => normalizeHexColor(color, DEFAULT_GROUP_COLOR)),
    normalizeHexColor(DEFAULT_GROUP_COLOR, DEFAULT_GROUP_COLOR)
  ];
  for (const candidateColor of candidateColors) {
    if (!usedColors.has(candidateColor)) {
      return candidateColor;
    }
  }

  for (let index = 0; index < 360; index += 1) {
    const hue = (index * 137.508) % 360;
    const generatedColor = hslToHex(hue, 58, 42);
    if (!usedColors.has(generatedColor)) {
      return generatedColor;
    }
  }

  return normalizeHexColor(DEFAULT_GROUP_COLOR, DEFAULT_GROUP_COLOR);
}

function suggestGroupColorFromSelection(objectIds) {
  const selectedObjects = (Array.isArray(objectIds) ? objectIds : [])
    .map((objectId) => getObjectById(objectId))
    .filter(Boolean);
  if (!selectedObjects.length) {
    return suggestDistinctGroupColor([DEFAULT_GROUP_COLOR]);
  }
  const uniqueColors = [
    ...new Set(selectedObjects.map((obj) => normalizeHexColor(obj.color, DEFAULT_OBJECT_COLOR)))
  ];
  if (uniqueColors.length === 1) {
    return suggestDistinctGroupColor([uniqueColors[0]]);
  }
  return suggestDistinctGroupColor([DEFAULT_GROUP_COLOR]);
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
  if (Array.isArray(state.status?.show?.actionIds)) {
    return state.status.show.actionIds;
  }
  return Object.keys(getActionsById()).sort((a, b) => a.localeCompare(b));
}

function uniqueActionId(baseId) {
  return uniqueIdWithHashSuffix(baseId, "action", getActionIds());
}

function getActionGroupIds() {
  return Array.isArray(state.status?.show?.actionGroupIds) ? state.status.show.actionGroupIds : [];
}

function uniqueActionGroupId(baseId) {
  return uniqueIdWithHashSuffix(baseId, "group", getActionGroupIds());
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
  if (/loaded|saved|created|updated|enabled|disabled|recall|started|stopped|aborted|add|delete|deleted|remove|rename|clear|set|patch/i.test(line)) {
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

function cancelManagerRenameAutoApplyTimer() {
  if (state.managerRenameAutoTimerId !== null) {
    clearTimeout(state.managerRenameAutoTimerId);
    state.managerRenameAutoTimerId = null;
  }
}

function cancelManagerTypeAutoApplyTimer() {
  if (state.managerTypeAutoTimerId !== null) {
    clearTimeout(state.managerTypeAutoTimerId);
    state.managerTypeAutoTimerId = null;
  }
}

function cancelManagerColorAutoApplyTimer() {
  if (state.managerColorAutoTimerId !== null) {
    clearTimeout(state.managerColorAutoTimerId);
    state.managerColorAutoTimerId = null;
  }
}

function cancelManagerEditAutoApplyTimers() {
  cancelManagerRenameAutoApplyTimer();
  cancelManagerTypeAutoApplyTimer();
  cancelManagerColorAutoApplyTimer();
}

function scheduleManagerRenameAutoApply(delayMs = 300) {
  const selectedIds = selectedObjectTargets();
  cancelManagerRenameAutoApplyTimer();
  if (selectedIds.length !== 1) return;
  const expectedCurrentId = String(selectedIds[0] || "").trim();
  if (!expectedCurrentId) return;
  state.managerRenameAutoTimerId = setTimeout(() => {
    state.managerRenameAutoTimerId = null;
    void managerRenameObject({ auto: true, expectedCurrentId });
  }, Math.max(0, Number(delayMs) || 0));
}

// Debounced Object Manager input saves: apply only to the same selected object
// that was active when the timer was started.
function scheduleManagerTypeAutoApply(delayMs = 320) {
  const selectedIds = selectedObjectTargets();
  cancelManagerTypeAutoApplyTimer();
  if (selectedIds.length !== 1) return;
  const expectedObjectId = String(selectedIds[0] || "").trim();
  if (!expectedObjectId) return;
  state.managerTypeAutoTimerId = setTimeout(() => {
    state.managerTypeAutoTimerId = null;
    void managerSetType({ auto: true, expectedObjectId });
  }, Math.max(0, Number(delayMs) || 0));
}

function scheduleManagerColorAutoApply(delayMs = 220) {
  const selectedIds = selectedObjectTargets();
  cancelManagerColorAutoApplyTimer();
  if (selectedIds.length !== 1) return;
  const expectedObjectId = String(selectedIds[0] || "").trim();
  if (!expectedObjectId) return;
  state.managerColorAutoTimerId = setTimeout(() => {
    state.managerColorAutoTimerId = null;
    void managerSetColor({ auto: true, expectedObjectId });
  }, Math.max(0, Number(delayMs) || 0));
}

function cancelGroupManagerAutoSaveTimer() {
  if (state.groupManagerAutoSaveTimerId !== null) {
    clearTimeout(state.groupManagerAutoSaveTimerId);
    state.groupManagerAutoSaveTimerId = null;
  }
}

function scheduleGroupManagerAutoSave(delayMs = 450) {
  const selectedGroup = getSelectedGroup();
  const selectedGroupId = String(selectedGroup?.groupId || "").trim();
  if (!selectedGroupId) return;
  cancelGroupManagerAutoSaveTimer();
  state.groupManagerAutoSaveTimerId = setTimeout(() => {
    state.groupManagerAutoSaveTimerId = null;
    void groupManagerSaveEditor({ auto: true, expectedGroupId: selectedGroupId });
  }, Math.max(0, Number(delayMs) || 0));
}

function cancelActionGroupAutoSaveTimer() {
  if (state.actionGroupAutoSaveTimerId !== null) {
    clearTimeout(state.actionGroupAutoSaveTimerId);
    state.actionGroupAutoSaveTimerId = null;
  }
}

function scheduleActionGroupAutoSave(delayMs = 450) {
  const selectedGroup = selectedActionGroupOrNull();
  const selectedGroupId = String(selectedGroup?.groupId || "").trim();
  if (!selectedGroupId) return;
  cancelActionGroupAutoSaveTimer();
  state.actionGroupAutoSaveTimerId = setTimeout(() => {
    state.actionGroupAutoSaveTimerId = null;
    void actionGroupManagerSave({ auto: true, expectedGroupId: selectedGroupId });
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

function setTextIfChanged(element, value) {
  if (!(element instanceof HTMLElement)) return;
  const next = String(value || "");
  if (element.textContent === next) return;
  element.textContent = next;
}

function managerPositionText(obj) {
  return `${Number(obj.x).toFixed(1)}, ${Number(obj.y).toFixed(1)}, ${Number(obj.z).toFixed(1)}`;
}

// Keep table row nodes stable during rapid runtime motion updates (e.g. LFO modulation).
function updateManagerObjectPositionCells(objects) {
  const objectsById = new Map(
    (Array.isArray(objects) ? objects : []).map((obj) => [String(obj.objectId || "").trim(), obj])
  );
  const rows = els.managerObjectRows.querySelectorAll("tr[data-object-id]");
  for (const row of rows) {
    const objectId = String(row.dataset.objectId || "").trim();
    if (!objectId) continue;
    const obj = objectsById.get(objectId);
    if (!obj) continue;
    const positionCell = row.querySelector(".position-cell");
    setTextIfChanged(positionCell, managerPositionText(obj));
  }
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
    addLog(`group ${isMember ? "delete" : "add"} member -> ${targetObjectId} ${isMember ? "from" : "to"} ${targetGroupId}`);
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

function normalizeActionRuleType(value) {
  const raw = String(value || "").trim();
  if (ACTION_RULE_TYPES.has(raw)) {
    return raw;
  }
  const normalized = raw.toLowerCase();
  if (normalized === "modulationcontrol" || normalized === "modulation_control" || normalized === "modulation") {
    return "modulationControl";
  }
  if (normalized === "parameterramp" || normalized === "parameter_ramp" || normalized === "ramp") {
    return "parameterRamp";
  }
  return "parameterRamp";
}

function parseBooleanLike(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }
  return Boolean(fallback);
}

function parseActionRuleRampTarget(rawTarget) {
  const value = String(rawTarget || "").trim();
  if (!value) {
    return { objectId: "", parameter: "", target: "" };
  }
  const splitIndex = value.lastIndexOf(".");
  if (splitIndex <= 0) {
    return { objectId: "", parameter: "", target: "" };
  }
  const objectId = normalizeObjectId(value.slice(0, splitIndex));
  const parameter = String(value.slice(splitIndex + 1) || "").trim().toLowerCase();
  if (!objectId || !LFO_PARAM_OPTIONS.includes(parameter)) {
    return { objectId: "", parameter: "", target: "" };
  }
  return { objectId, parameter, target: `${objectId}.${parameter}` };
}

function listActionRuleRampTargets() {
  const objectIds = getObjects()
    .map((obj) => String(obj?.objectId || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const targets = [];
  for (const objectId of objectIds) {
    for (const parameter of LFO_PARAM_OPTIONS) {
      targets.push(`${objectId}.${parameter}`);
    }
  }
  return targets;
}

function listActionRuleModulatorTargets(selectedAction = null, globalLfoIds = []) {
  const values = new Set();
  for (const lfoId of Array.isArray(globalLfoIds) ? globalLfoIds : []) {
    const normalized = normalizeObjectId(lfoId);
    if (normalized) {
      values.add(normalized);
    }
  }
  const actionLfos = Array.isArray(selectedAction?.lfos) ? selectedAction.lfos : [];
  const actionLfoGroups = collectLfoGroups(actionLfos);
  for (const group of actionLfoGroups) {
    const lfoId = normalizeObjectId(group?.lfoId);
    if (lfoId) {
      values.add(lfoId);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function normalizeActionRuleModulationValue(parameter, rawValue, fallbackValue = 0) {
  const param = ACTION_RULE_MODULATION_PARAMS.has(parameter) ? parameter : "depth";
  if (param === "enabled") {
    return parseBooleanLike(rawValue, parseBooleanLike(fallbackValue, true));
  }
  if (param === "wave") {
    const normalizedWave = String(rawValue || "").trim().toLowerCase();
    if (["sine", "triangle", "square", "saw"].includes(normalizedWave)) {
      return normalizedWave;
    }
    const fallbackWave = String(fallbackValue || "").trim().toLowerCase();
    return ["sine", "triangle", "square", "saw"].includes(fallbackWave) ? fallbackWave : "sine";
  }
  if (param === "polarity") {
    return normalizeLfoPolarity(rawValue || fallbackValue);
  }
  const numericFallback = parseFiniteNumber(fallbackValue, 0);
  let numeric = parseFiniteNumber(rawValue, numericFallback);
  if (param === "rateHz") {
    numeric = Math.max(0, numeric);
  }
  return numeric;
}

function normalizeActionRuleModel(rawRule = null, options = {}) {
  const source = rawRule && typeof rawRule === "object" ? rawRule : {};
  const selectedAction = options.selectedAction || null;
  const globalLfoIds = Array.isArray(options.globalLfoIds) ? options.globalLfoIds : [];
  const rampTargets = Array.isArray(options.rampTargets) ? options.rampTargets : listActionRuleRampTargets();
  const modulationTargets = Array.isArray(options.modulationTargets)
    ? options.modulationTargets
    : listActionRuleModulatorTargets(selectedAction, globalLfoIds);
  const type = normalizeActionRuleType(source.type);

  if (type === "modulationControl") {
    const targetModulatorRaw = source.targetModulator ?? source.target_modulator ?? source.target ?? "";
    const targetModulator = normalizeObjectId(targetModulatorRaw);
    const parameterRaw = String(source.parameter || "").trim();
    const parameter = ACTION_RULE_MODULATION_PARAMS.has(parameterRaw) ? parameterRaw : "depth";
    const fallbackDiscreteValues = ACTION_RULE_MODULATION_DISCRETE_VALUES[parameter];
    const fallbackValue = fallbackDiscreteValues ? fallbackDiscreteValues[0] : 0;
    const value = normalizeActionRuleModulationValue(parameter, source.value, fallbackValue);
    const preferredModulator = targetModulator && modulationTargets.includes(targetModulator)
      ? targetModulator
      : (modulationTargets[0] || targetModulator || "");
    return {
      type: "modulationControl",
      targetModulator: preferredModulator,
      parameter,
      value
    };
  }

  const parsedTarget = parseActionRuleRampTarget(source.target);
  const preferredTarget = parsedTarget.target && rampTargets.includes(parsedTarget.target)
    ? parsedTarget.target
    : (rampTargets[0] || parsedTarget.target || "");
  const startValue = parseFiniteNumber(source.startValue ?? source.start_value, 0);
  const endValue = parseFiniteNumber(source.endValue ?? source.end_value, startValue);
  const speedMs = Math.max(0, parseFiniteNumber(source.speedMs ?? source.speed_ms ?? source.speed, 1000));
  return {
    type: "parameterRamp",
    target: preferredTarget,
    startValue,
    endValue,
    speedMs,
    relative: parseBooleanLike(source.relative, false)
  };
}

function actionRuleModulationValueFromInputs(parameter, fallback = 0) {
  const param = ACTION_RULE_MODULATION_PARAMS.has(parameter) ? parameter : "depth";
  if (Object.prototype.hasOwnProperty.call(ACTION_RULE_MODULATION_DISCRETE_VALUES, param)) {
    const selectValue = String(els.actionManagerRuleModValueSelect?.value || "").trim();
    return normalizeActionRuleModulationValue(param, selectValue, fallback);
  }
  const numberValue = parseFiniteNumber(els.actionManagerRuleModValueInput?.value, parseFiniteNumber(fallback, 0));
  return normalizeActionRuleModulationValue(param, numberValue, fallback);
}

function actionRulePayloadFromInputs(baseRule = null) {
  const fallbackRule = normalizeActionRuleModel(baseRule);
  const type = normalizeActionRuleType(els.actionManagerRuleTypeInput?.value || fallbackRule.type);
  if (type === "modulationControl") {
    const parameterRaw = String(els.actionManagerRuleModParamInput?.value || fallbackRule.parameter || "depth").trim();
    const parameter = ACTION_RULE_MODULATION_PARAMS.has(parameterRaw) ? parameterRaw : "depth";
    const targetModulator = normalizeObjectId(els.actionManagerRuleModTargetInput?.value || fallbackRule.targetModulator || "");
    const value = actionRuleModulationValueFromInputs(parameter, fallbackRule.value);
    return {
      type: "modulationControl",
      targetModulator,
      parameter,
      value
    };
  }

  const parsedTarget = parseActionRuleRampTarget(els.actionManagerRuleRampTargetInput?.value || fallbackRule.target);
  const startValue = parseFiniteNumber(els.actionManagerRuleRampStartInput?.value, fallbackRule.startValue);
  const endValue = parseFiniteNumber(els.actionManagerRuleRampEndInput?.value, fallbackRule.endValue);
  const speedMsValue = Math.max(0, parseFiniteNumber(els.actionManagerRuleRampSpeedInput?.value, fallbackRule.speedMs));
  const relative = Boolean(els.actionManagerRuleRampRelativeInput?.checked);
  return {
    type: "parameterRamp",
    target: parsedTarget.target,
    startValue,
    endValue,
    speedMs: speedMsValue,
    relative
  };
}

function normalizeLfoTargetScope(rawScope = LFO_TARGET_SCOPE_OBJECT) {
  const normalized = String(rawScope || "").trim().toLowerCase();
  if (normalized === LFO_TARGET_SCOPE_GROUP) {
    return LFO_TARGET_SCOPE_GROUP;
  }
  return LFO_TARGET_SCOPE_OBJECT;
}

function isLfoTargetParameter(parameter, scope = LFO_TARGET_SCOPE_OBJECT) {
  const normalized = String(parameter || "").trim().toLowerCase();
  const normalizedScope = normalizeLfoTargetScope(scope);
  if (normalizedScope === LFO_TARGET_SCOPE_GROUP) {
    return normalized === "all" || LFO_PARAM_OPTIONS.includes(normalized);
  }
  return LFO_PARAM_OPTIONS.includes(normalized);
}

function getLfoTargetGroups() {
  const groupSources = getObjectGroups();
  const groupOptions = [];
  const seen = new Set();
  for (const group of groupSources) {
    const groupId = String(group?.groupId || group?.group_id || "").trim();
    if (!groupId || seen.has(groupId)) continue;
    if (!Array.isArray(group?.objectIds) || group.objectIds.length === 0) continue;
    const groupName = String(group?.name || groupId).trim() || groupId;
    groupOptions.push({
      groupId,
      label: groupName
    });
    seen.add(groupId);
  }
  groupOptions.sort((a, b) => {
    const labelCompare = a.label.localeCompare(b.label);
    if (labelCompare !== 0) return labelCompare;
    return a.groupId.localeCompare(b.groupId);
  });
  return groupOptions;
}

function lfoTargetTypeLabel(lfo) {
  const scope = normalizeLfoTargetScope(lfo?.targetScope || lfo?.target_scope || "");
  return scope === LFO_TARGET_SCOPE_GROUP ? "Group" : "Object";
}

function lfoHasAssignedTarget(lfo) {
  const scope = normalizeLfoTargetScope(lfo?.targetScope || lfo?.target_scope || "");
  const objectId = String(lfo?.objectId || lfo?.object_id || "").trim();
  const groupId = String(lfo?.groupId || lfo?.group_id || "").trim();
  const parameter = String(lfo?.parameter || "").trim();
  if (scope === LFO_TARGET_SCOPE_GROUP) {
    return Boolean(groupId && isLfoTargetParameter(parameter, scope));
  }
  return Boolean(objectId && isLfoTargetParameter(parameter, scope));
}

function lfoTargetLabel(lfo) {
  if (!lfoHasAssignedTarget(lfo)) {
    return "";
  }
  const scope = normalizeLfoTargetScope(lfo?.targetScope || lfo?.target_scope || "");
  const parameter = String(lfo?.parameter || "").trim();
  if (scope === LFO_TARGET_SCOPE_GROUP) {
    const groupId = String(lfo?.groupId || lfo?.group_id || "").trim();
    return `${groupId}.${parameter}`;
  }
  const objectId = String(lfo?.objectId || lfo?.object_id || "").trim();
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

async function upsertActionLfoTargetMapping(actionId, selectorKey, targetId, parameter, options = {}) {
  const normalizedActionId = String(actionId || "").trim();
  const normalizedSelectorKey = String(selectorKey || "").trim();
  const targetScope = normalizeLfoTargetScope(options.targetScope || LFO_TARGET_SCOPE_OBJECT);
  const normalizedTargetId = String(targetId || "").trim();
  const normalizedParam = String(parameter || "").trim();
  const normalizedObjectId = targetScope === LFO_TARGET_SCOPE_OBJECT ? sanitizeObjectId(normalizedTargetId) : "";
  const normalizedGroupId = targetScope === LFO_TARGET_SCOPE_GROUP ? sanitizeObjectId(normalizedTargetId) : "";
  const normalizedPhaseInput = parseFiniteNumber(options.mappingPhaseDeg, Number.NaN);
  const hasPhaseInput = Number.isFinite(normalizedPhaseInput);
  const hasPhaseFlipInput = options.phaseFlip !== undefined;
  const normalizedPhaseFlipInput = Boolean(options.phaseFlip);
  const hasTargetEnabledInput = options.targetEnabled !== undefined;
  const normalizedTargetEnabledInput = Boolean(options.targetEnabled);
  const hasPhaseSpreadInput = options.distributePhaseOverMembers !== undefined;
  const normalizedPhaseSpreadInput = Boolean(options.distributePhaseOverMembers);
  const applyOnCreateOnly = Boolean(options.applyOnCreateOnly);

  if (!normalizedActionId || !normalizedSelectorKey || !isLfoTargetParameter(normalizedParam, targetScope)) {
    throw new Error("Invalid LFO mapping request");
  }
  if (targetScope === LFO_TARGET_SCOPE_OBJECT && !normalizedObjectId) {
    throw new Error("Object target requires object ID");
  }
  if (targetScope === LFO_TARGET_SCOPE_GROUP && !normalizedGroupId) {
    throw new Error("Group target requires group ID");
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
    const candidateParam = String(candidate?.parameter || "").trim();
    if (candidateParam !== normalizedParam) return false;
    const candidateScope = normalizeLfoTargetScope(candidate?.targetScope || candidate?.target_scope || "");
    if (candidateScope !== targetScope) return false;
    if (targetScope === LFO_TARGET_SCOPE_GROUP) {
      const candidateGroupId = String(candidate?.groupId || candidate?.group_id || "").trim();
      return candidateGroupId === normalizedGroupId;
    }
    const candidateObjectId = String(candidate?.objectId || "").trim();
    return candidateObjectId === normalizedObjectId;
  });

  let nextLfos = null;
  let mappingPhaseDeg = 0;
  let created = false;

  if (existingIndex >= 0) {
    const currentLfo = lfos[existingIndex] || {};
    const basePhase = (hasPhaseInput && !applyOnCreateOnly)
      ? normalizedPhaseInput
      : parseFiniteNumber(currentLfo.mappingPhaseDeg, 0);
    const phaseFlip = (hasPhaseFlipInput && !applyOnCreateOnly)
      ? normalizedPhaseFlipInput
      : Boolean(currentLfo.phaseFlip);
    const targetEnabled = (hasTargetEnabledInput && !applyOnCreateOnly)
      ? normalizedTargetEnabledInput
      : currentLfo.targetEnabled !== false;
    const distributePhaseOverMembers = targetScope === LFO_TARGET_SCOPE_GROUP
      ? ((hasPhaseSpreadInput && !applyOnCreateOnly)
        ? normalizedPhaseSpreadInput
        : Boolean(currentLfo.distributePhaseOverMembers))
      : false;
    mappingPhaseDeg = normalizePhaseDegrees(basePhase, parseFiniteNumber(currentLfo.mappingPhaseDeg, 0));
    nextLfos = [...lfos];
    nextLfos[existingIndex] = {
      ...currentLfo,
      objectId: normalizedObjectId,
      groupId: normalizedGroupId,
      targetScope,
      parameter: normalizedParam,
      mappingPhaseDeg,
      phaseFlip,
      targetEnabled,
      distributePhaseOverMembers
    };
  } else {
    const basePhase = hasPhaseInput
      ? normalizedPhaseInput
      : parseFiniteNumber(sourceLfo.mappingPhaseDeg, 0);
    const phaseFlip = hasPhaseFlipInput ? normalizedPhaseFlipInput : false;
    const targetEnabled = hasTargetEnabledInput ? normalizedTargetEnabledInput : true;
    const distributePhaseOverMembers = targetScope === LFO_TARGET_SCOPE_GROUP
      ? (hasPhaseSpreadInput ? normalizedPhaseSpreadInput : false)
      : false;
    mappingPhaseDeg = normalizePhaseDegrees(basePhase, parseFiniteNumber(sourceLfo.mappingPhaseDeg, 0));
    const linkedLfo = {
      ...(sourceLfo || {}),
      targetScope,
      groupId: normalizedGroupId,
      objectId: normalizedObjectId,
      parameter: normalizedParam,
      mappingPhaseDeg,
      phaseFlip,
      targetEnabled,
      distributePhaseOverMembers
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
    const candidateScope = normalizeLfoTargetScope(candidate?.targetScope || candidate?.target_scope || "");
    if (candidateScope !== targetScope) return false;
    if (candidateScope === LFO_TARGET_SCOPE_GROUP) {
      const candidateGroupId = String(candidate?.groupId || candidate?.group_id || "").trim();
      if (candidateGroupId !== normalizedGroupId) return false;
    } else {
      const candidateObjectId = String(candidate?.objectId || "").trim();
      if (candidateObjectId !== normalizedObjectId) return false;
    }
    const candidateParam = String(candidate?.parameter || "").trim();
    return candidateParam === normalizedParam;
  });
  state.selectedActionLfoTargetIndex = selectedTargetIndex >= 0 ? selectedTargetIndex : null;
  return {
    actionId: normalizedActionId,
    targetScope,
    groupId: normalizedGroupId,
    objectId: normalizedObjectId,
    parameter: normalizedParam,
    mappingPhaseDeg,
    distributePhaseOverMembers: (
      selectedTargetIndex >= 0
        ? Boolean(nextLfos[selectedTargetIndex]?.distributePhaseOverMembers)
        : false
    ),
    created
  };
}

async function linkActionLfoTargetFromPanner(actionId, selectorKey, objectId, parameter, options = {}) {
  try {
    const mappingOptions = {
      mappingPhaseDeg: 0,
      phaseFlip: false,
      targetEnabled: true,
      applyOnCreateOnly: true,
      ...options
    };
    const result = await upsertActionLfoTargetMapping(actionId, selectorKey, objectId, parameter, mappingOptions);
    const normalizedSelector = String(selectorKey || "").trim();
    const lfoId = normalizedSelector.startsWith("id:") ? String(normalizedSelector.slice(3) || "").trim() : "";
    if (result.created && lfoId) {
      await api("/api/action-lfo/enabled", "POST", {
        actionId: result.actionId,
        lfoId,
        enabled: true
      });
      await api("/api/action-lfo/update", "POST", {
        actionId: result.actionId,
        lfoId,
        depth: 100,
        offset: 0
      });
    }
    const targetLabel = lfoTargetLabel(result);
    if (result.created) {
      addLog(`action lfo link -> ${result.actionId} ${targetLabel} (phase ${result.mappingPhaseDeg}°)`);
    } else {
      addLog(`action lfo mapping phase -> ${result.actionId} ${targetLabel} = ${result.mappingPhaseDeg}°`);
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

function collectPannerLfoEntries() {
  const entriesByLfoId = new Map();
  const globalLfosById = getGlobalLfosById();
  const globalLfoIds = Object.keys(globalLfosById).sort((a, b) => a.localeCompare(b));
  for (const lfoId of globalLfoIds) {
    const normalizedLfoId = String(lfoId || "").trim();
    if (!normalizedLfoId) continue;
    const lfoModel = globalLfosById[normalizedLfoId];
    entriesByLfoId.set(normalizedLfoId, {
      lfoId: normalizedLfoId,
      lfo: lfoModel && typeof lfoModel === "object" ? lfoModel : { lfoId: normalizedLfoId },
      actionIds: [],
      targetCount: 0,
      targets: []
    });
  }

  const actionsById = getActionsById();
  const actionIds = Object.keys(actionsById).sort((a, b) => a.localeCompare(b));
  for (const actionId of actionIds) {
    const action = actionsById[actionId] || {};
    const lfos = Array.isArray(action.lfos) ? action.lfos : [];
    const groups = collectLfoGroups(lfos);
    for (const group of groups) {
      const lfoId = String(group.lfoId || "").trim();
      if (!lfoId) continue;
      let entry = entriesByLfoId.get(lfoId) || null;
      if (!entry) {
        entry = {
          lfoId,
          lfo: group.lfo && typeof group.lfo === "object" ? group.lfo : { lfoId },
          actionIds: [],
          targetCount: 0,
          targets: []
        };
        entriesByLfoId.set(lfoId, entry);
      }
      if (!entry.actionIds.includes(actionId)) {
        entry.actionIds.push(actionId);
      }
      entry.targetCount += Number(group.targetCount || 0);
      for (const targetLabel of (Array.isArray(group.targetLabels) ? group.targetLabels : [])) {
        const normalizedTargetLabel = String(targetLabel || "").trim();
        if (!normalizedTargetLabel || entry.targets.includes(normalizedTargetLabel)) continue;
        entry.targets.push(normalizedTargetLabel);
      }
      if ((!entry.lfo || typeof entry.lfo !== "object" || !String(entry.lfo.wave || "").trim()) && group.lfo && typeof group.lfo === "object") {
        entry.lfo = group.lfo;
      }
    }
  }

  return Array.from(entriesByLfoId.values())
    .sort((a, b) => String(a.lfoId || "").localeCompare(String(b.lfoId || "")));
}

function resolvePannerLfoActionId(entry) {
  const actionIds = (Array.isArray(entry?.actionIds) ? entry.actionIds : [])
    .map((actionId) => String(actionId || "").trim())
    .filter(Boolean);
  if (!actionIds.length) {
    return "";
  }
  const selectedActionId = String(state.selectedActionId || "").trim();
  if (selectedActionId && actionIds.includes(selectedActionId)) {
    return selectedActionId;
  }
  return actionIds[0];
}

function buildLfoParamSubmenu(objectId, entry) {
  const submenu = document.createElement("div");
  submenu.className = "panner-submenu";

  const actionId = resolvePannerLfoActionId(entry);
  if (!actionId) {
    submenu.appendChild(createPannerMenuItem("No action has this LFO", { disabled: true }));
    return submenu;
  }

  const action = getActionById(actionId);
  const lfos = Array.isArray(action?.lfos) ? action.lfos : [];
  const targetObjectId = String(objectId || "").trim();
  const lfoId = String(entry?.lfoId || "").trim();
  if (!lfoId) {
    submenu.appendChild(createPannerMenuItem("Invalid LFO", { disabled: true }));
    return submenu;
  }
  const selector = `id:${lfoId}`;
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
        void linkActionLfoTargetFromPanner(actionId, selector, targetObjectId, param);
      }
    }));
  }

  return submenu;
}

function buildLfoContextSubmenu(objectId) {
  const submenu = document.createElement("div");
  submenu.className = "panner-submenu";

  const entries = collectPannerLfoEntries();
  if (!entries.length) {
    submenu.appendChild(createPannerMenuItem("No LFOs", { disabled: true }));
    return submenu;
  }

  for (const entry of entries) {
    const lfoId = String(entry.lfoId || "").trim();
    if (!lfoId) continue;
    const actionIds = Array.isArray(entry.actionIds) ? entry.actionIds : [];
    const label = lfoId;
    if (!actionIds.length) {
      submenu.appendChild(createPannerMenuItem(`${lfoId} [no action]`, { disabled: true }));
      continue;
    }
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
  // Object Manager selection is explicit per-row; do not auto-expand to group members there.
  if (state.currentPage === "object-manager") return [];
  if (!state.groupSelectEnabled) return [];
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
  // Object Manager is single-select only so row interactions stay deterministic.
  if (state.currentPage === "object-manager") {
    return state.selectedObjectId ? [state.selectedObjectId] : [];
  }
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

// Resolve deterministic group-driven colors once (groupId order) for the current render pass.
function buildEffectiveGroupColorMap(groupsInput) {
  if (!areGroupsEnabled()) return new Map();
  const groups = [...(Array.isArray(groupsInput) ? groupsInput : getObjectGroups())]
    .filter((group) => isGroupEnabled(group))
    .sort((a, b) => String(a.groupId || "").localeCompare(String(b.groupId || "")));
  const colorByObjectId = new Map();
  for (const group of groups) {
    if (!isColorLinkedForGroup(group)) continue;
    const color = groupColorOrNull(group);
    if (!color) continue;
    const members = Array.isArray(group.objectIds) ? group.objectIds : [];
    for (const memberId of members) {
      const targetId = String(memberId || "").trim();
      if (!targetId || colorByObjectId.has(targetId)) continue;
      colorByObjectId.set(targetId, color);
    }
  }
  return colorByObjectId;
}

function effectiveGroupColorForObject(objectId, precomputedColorMap = null) {
  const targetId = String(objectId || "").trim();
  if (!targetId) return null;
  const colorMap = precomputedColorMap instanceof Map ? precomputedColorMap : buildEffectiveGroupColorMap();
  return colorMap.get(targetId) || null;
}

function effectiveObjectColor(obj, precomputedColorMap = null) {
  const baseColor = normalizeHexColor(obj?.color, DEFAULT_OBJECT_COLOR);
  return effectiveGroupColorForObject(obj?.objectId, precomputedColorMap) || baseColor;
}

// Reserved for future client-side preview mode where group links are applied before server round-trip.
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

// Shared helper for checkbox lists that store the logical param key in `data-param`.
function selectedDataParamsFromInputs(inputs) {
  return (Array.isArray(inputs) ? inputs : [])
    .filter((input) => input.checked)
    .map((input) => String(input.dataset.param || "").trim())
    .filter(Boolean);
}

// Shared inverse of `selectedDataParamsFromInputs` for restoring checkbox state.
function applyDataParamsToInputs(inputs, params) {
  const selected = new Set(Array.isArray(params) ? params : []);
  for (const input of (Array.isArray(inputs) ? inputs : [])) {
    const param = String(input.dataset.param || "").trim();
    input.checked = selected.has(param);
  }
}

function selectedLinkParamsFromInputs() {
  return selectedDataParamsFromInputs(els.managerGroupLinkInputs);
}

function applyLinkParamsToInputs(linkParams) {
  applyDataParamsToInputs(els.managerGroupLinkInputs, linkParams);
}

function setInputValueIfIdle(input, value) {
  if (document.activeElement === input) return;
  input.value = value;
}

function setCheckboxCheckedIfIdle(input, checked) {
  if (!(input instanceof HTMLInputElement)) return;
  if (document.activeElement === input) return;
  input.checked = Boolean(checked);
}

function normalizeTheme(value) {
  return String(value || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

function systemPreferredTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch {
    // Ignore storage failures and fall back to system preference.
  }
  return systemPreferredTheme();
}

function applyTheme(theme, options = {}) {
  const persist = options.persist !== false;
  const normalized = normalizeTheme(theme);
  state.uiTheme = normalized;
  document.documentElement.dataset.theme = normalized;
  if (els.themeToggleBtn instanceof HTMLButtonElement) {
    const darkEnabled = normalized === "dark";
    els.themeToggleBtn.textContent = `Dark Mode: ${darkEnabled ? "On" : "Off"}`;
    els.themeToggleBtn.setAttribute("aria-pressed", darkEnabled ? "true" : "false");
  }
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage failures so theme switch still applies for current session.
    }
  }
}

function toggleTheme() {
  applyTheme(state.uiTheme === "dark" ? "light" : "dark");
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
  els.viewControlBtn.classList.toggle("is-active", nextPage === "control");
  els.viewConfigurationBtn.classList.toggle("is-active", nextPage === "configuration");
  els.viewPannerBtn.setAttribute("aria-selected", nextPage === "panner" ? "true" : "false");
  els.viewActionManagerBtn.setAttribute("aria-selected", nextPage === "action-manager" ? "true" : "false");
  els.viewActionGroupManagerBtn.setAttribute("aria-selected", nextPage === "action-group-manager" ? "true" : "false");
  els.viewModulationManagerBtn.setAttribute("aria-selected", nextPage === "modulation-manager" ? "true" : "false");
  els.viewObjectManagerBtn.setAttribute("aria-selected", nextPage === "object-manager" ? "true" : "false");
  els.viewGroupManagerBtn.setAttribute("aria-selected", nextPage === "group-manager" ? "true" : "false");
  els.viewControlBtn.setAttribute("aria-selected", nextPage === "control" ? "true" : "false");
  els.viewConfigurationBtn.setAttribute("aria-selected", nextPage === "configuration" ? "true" : "false");
  renderAll();
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
    if (Boolean(obj.hidden)) continue;
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
  const selectedObjectIdSet = new Set(state.selectedObjectIds);
  const groupColorByObjectId = buildEffectiveGroupColorMap();

  const renderables = [];
  for (const obj of getObjects()) {
    if (Boolean(obj.hidden)) continue;
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
    const isSelected = selectedObjectIdSet.has(item.obj.objectId);
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
    const baseColor = effectiveObjectColor(item.obj, groupColorByObjectId);
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
    const rawNewSceneId = prompt("Add scene ID", suggestedSceneId);
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

function normalizePhaseDegrees(value, fallback = 0) {
  const numeric = parseFiniteNumber(value, fallback);
  const wrapped = ((numeric % 360) + 360) % 360;
  if (!Number.isFinite(wrapped)) {
    return parseFiniteNumber(fallback, 0);
  }
  return wrapped;
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

function normalizeOscPort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
    return parsed;
  }
  return Number(fallback);
}

function normalizeOscPathPrefix(value, fallback) {
  const raw = String(value || "").trim();
  const seeded = raw || String(fallback || "/");
  let normalized = `/${seeded.replace(/^\/+/, "")}`;
  normalized = normalized.replace(/\/+/g, "/");
  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/, "");
  }
  return normalized || String(fallback || "/");
}

function getStatusOscConfig() {
  const statusOsc = state.status?.osc && typeof state.status.osc === "object" ? state.status.osc : {};
  const fallbackOutHost = "127.0.0.1";
  const outHost = String(statusOsc.outHost || fallbackOutHost).trim() || fallbackOutHost;
  return {
    outHost,
    outPort: normalizeOscPort(statusOsc.outPort, 9000),
    inPort: normalizeOscPort(statusOsc.inPort, 9001),
    objectPathPrefix: normalizeOscPathPrefix(statusOsc.objectPathPrefix, OSC_PREFIX_DEFAULTS.objectPathPrefix),
    scenePathPrefix: normalizeOscPathPrefix(statusOsc.scenePathPrefix, OSC_PREFIX_DEFAULTS.scenePathPrefix),
    actionPathPrefix: normalizeOscPathPrefix(statusOsc.actionPathPrefix, OSC_PREFIX_DEFAULTS.actionPathPrefix),
    actionGroupPathPrefix: normalizeOscPathPrefix(statusOsc.actionGroupPathPrefix, OSC_PREFIX_DEFAULTS.actionGroupPathPrefix)
  };
}

function configurationInputElements() {
  return [
    els.configOscOutHostInput,
    els.configOscOutPortInput,
    els.configOscInPortInput,
    els.configOscObjectPrefixInput,
    els.configOscScenePrefixInput,
    els.configOscActionPrefixInput,
    els.configOscActionGroupPrefixInput
  ].filter((element) => element instanceof HTMLInputElement);
}

function configurationDraftFromInputs(fallbackConfig = getStatusOscConfig()) {
  const outHost = String(els.configOscOutHostInput?.value || "").trim() || fallbackConfig.outHost;
  return {
    outHost,
    outPort: normalizeOscPort(els.configOscOutPortInput?.value, fallbackConfig.outPort),
    inPort: normalizeOscPort(els.configOscInPortInput?.value, fallbackConfig.inPort),
    objectPathPrefix: normalizeOscPathPrefix(els.configOscObjectPrefixInput?.value, fallbackConfig.objectPathPrefix),
    scenePathPrefix: normalizeOscPathPrefix(els.configOscScenePrefixInput?.value, fallbackConfig.scenePathPrefix),
    actionPathPrefix: normalizeOscPathPrefix(els.configOscActionPrefixInput?.value, fallbackConfig.actionPathPrefix),
    actionGroupPathPrefix: normalizeOscPathPrefix(els.configOscActionGroupPrefixInput?.value, fallbackConfig.actionGroupPathPrefix)
  };
}

function oscConfigEquals(left, right) {
  if (!left || !right) return false;
  return String(left.outHost || "").trim() === String(right.outHost || "").trim()
    && normalizeOscPort(left.outPort, 0) === normalizeOscPort(right.outPort, 0)
    && normalizeOscPort(left.inPort, 0) === normalizeOscPort(right.inPort, 0)
    && normalizeOscPathPrefix(left.objectPathPrefix, "/") === normalizeOscPathPrefix(right.objectPathPrefix, "/")
    && normalizeOscPathPrefix(left.scenePathPrefix, "/") === normalizeOscPathPrefix(right.scenePathPrefix, "/")
    && normalizeOscPathPrefix(left.actionPathPrefix, "/") === normalizeOscPathPrefix(right.actionPathPrefix, "/")
    && normalizeOscPathPrefix(left.actionGroupPathPrefix, "/") === normalizeOscPathPrefix(right.actionGroupPathPrefix, "/");
}

function normalizeStreamdeckConfigurationPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.configuration && typeof payload.configuration === "object") {
    return payload.configuration;
  }
  return payload;
}

function streamdeckConfigNeedsRefresh(options = {}) {
  const force = options.force === true;
  if (force) return true;
  if (!state.streamdeckLayoutConfig && !state.streamdeckConfigError) return true;
  const ageMs = Date.now() - Number(state.streamdeckConfigLastFetchMs || 0);
  return ageMs >= STREAMDECK_CONFIG_REFRESH_INTERVAL_MS;
}

function renderStreamdeckConfiguration() {
  const summaryEl = els.streamdeckConfigSummary;
  const metaEl = els.streamdeckConfigMeta;
  const rowsEl = els.streamdeckConfigPagesRows;

  if (!(summaryEl instanceof HTMLElement) || !(metaEl instanceof HTMLElement) || !(rowsEl instanceof HTMLElement)) {
    return;
  }

  if (els.streamdeckConfigRefreshBtn instanceof HTMLButtonElement) {
    els.streamdeckConfigRefreshBtn.disabled = state.streamdeckConfigRefreshInFlight;
  }

  const configuration = state.streamdeckLayoutConfig && typeof state.streamdeckLayoutConfig === "object"
    ? state.streamdeckLayoutConfig
    : null;
  const errorMessage = String(state.streamdeckConfigError || "").trim();

  if (!configuration) {
    const loadingText = state.streamdeckConfigRefreshInFlight
      ? "Loading Stream Deck layout configuration..."
      : (errorMessage ? `Stream Deck layout unavailable: ${errorMessage}` : "No Stream Deck layout data loaded yet.");
    setTextIfChanged(summaryEl, loadingText);
    setTextIfChanged(metaEl, "Source: /api/hardware/streamdeck/configuration");
    rowsEl.innerHTML = '<tr><td colspan="4" class="muted">No pages available.</td></tr>';
    return;
  }

  const pages = Array.isArray(configuration.pages) ? configuration.pages : [];
  const columns = Number(configuration.columns || 0);
  const rows = Number(configuration.rows || 0);
  const pageCount = Number(configuration.pageCount || pages.length || 0);
  const buttonCount = Number(configuration.buttonCount || 0);
  const layoutMode = String(configuration.layoutMode || "page-grid");

  setTextIfChanged(
    summaryEl,
    `Layout mode ${layoutMode}. Grid ${columns}x${rows}. Pages ${pageCount}. Buttons ${buttonCount}.`
  );

  const refreshedAt = state.streamdeckConfigLastFetchMs
    ? new Date(state.streamdeckConfigLastFetchMs).toLocaleTimeString()
    : "-";
  const metaText = errorMessage
    ? `Source: /api/hardware/streamdeck/configuration • Last refresh ${refreshedAt} • Last error: ${errorMessage}`
    : `Source: /api/hardware/streamdeck/configuration • Last refresh ${refreshedAt}`;
  setTextIfChanged(metaEl, metaText);

  if (!pages.length) {
    rowsEl.innerHTML = '<tr><td colspan="4" class="muted">No Stream Deck pages were returned.</td></tr>';
    return;
  }

  rowsEl.innerHTML = pages.map((page) => {
    const index = Number(page?.index || 0);
    const title = String(page?.title || "");
    const layoutId = String(page?.layoutId || "");
    const perPageButtonCount = Number(page?.buttonCount || (Array.isArray(page?.buttons) ? page.buttons.length : 0));
    return `
      <tr>
        <td>${index || "-"}</td>
        <td>${escapeHtml(title || "-")}</td>
        <td>${escapeHtml(layoutId || "-")}</td>
        <td>${perPageButtonCount}</td>
      </tr>`;
  }).join("");
}

async function refreshStreamdeckConfiguration(options = {}) {
  const force = options.force === true;
  if (state.streamdeckConfigRefreshInFlight) return;
  if (!streamdeckConfigNeedsRefresh({ force })) return;

  state.streamdeckConfigRefreshInFlight = true;
  if (state.currentPage === "control") {
    renderStreamdeckConfiguration();
  }

  try {
    const data = await api("/api/hardware/streamdeck/configuration");
    const configuration = normalizeStreamdeckConfigurationPayload(data);
    if (!configuration || typeof configuration !== "object") {
      throw new Error("Invalid Stream Deck configuration response");
    }
    state.streamdeckLayoutConfig = configuration;
    state.streamdeckConfigError = "";
  } catch (error) {
    const nextError = String(error?.message || error || "Unknown error");
    const previousError = String(state.streamdeckConfigError || "");
    state.streamdeckConfigError = nextError;
    if (nextError && nextError !== previousError) {
      addLog(`streamdeck configuration failed: ${nextError}`);
    }
  } finally {
    state.streamdeckConfigLastFetchMs = Date.now();
    state.streamdeckConfigRefreshInFlight = false;
    if (state.currentPage === "control") {
      renderStreamdeckConfiguration();
    }
  }
}

function renderControl() {
  if (state.currentPage !== "control") return;
  renderStreamdeckConfiguration();
  if (streamdeckConfigNeedsRefresh()) {
    void refreshStreamdeckConfiguration();
  }
}

function captureConfigurationDraftFromInputs() {
  state.configDraft = configurationDraftFromInputs(getStatusOscConfig());
  state.configDraftDirty = true;
}

// Keep OSC routing edits staged locally until the user explicitly saves.
function renderConfiguration() {
  if (state.currentPage !== "configuration") return;
  const runtimeConfig = getStatusOscConfig();
  if (!state.configDraft || !state.configDraftDirty) {
    state.configDraft = { ...runtimeConfig };
  }
  const draft = state.configDraft || runtimeConfig;
  const activeElement = document.activeElement;
  const hasFocusedInput = configurationInputElements().includes(activeElement);

  if (!hasFocusedInput) {
    setInputValueIfIdle(els.configOscOutHostInput, String(draft.outHost || ""));
    setInputValueIfIdle(els.configOscOutPortInput, String(draft.outPort));
    setInputValueIfIdle(els.configOscInPortInput, String(draft.inPort));
    setInputValueIfIdle(els.configOscObjectPrefixInput, String(draft.objectPathPrefix || ""));
    setInputValueIfIdle(els.configOscScenePrefixInput, String(draft.scenePathPrefix || ""));
    setInputValueIfIdle(els.configOscActionPrefixInput, String(draft.actionPathPrefix || ""));
    setInputValueIfIdle(els.configOscActionGroupPrefixInput, String(draft.actionGroupPathPrefix || ""));
  }

  const hasChanges = !oscConfigEquals(draft, runtimeConfig);
  if (els.configSaveBtn instanceof HTMLButtonElement) {
    els.configSaveBtn.disabled = !hasChanges;
  }
  if (els.configResetBtn instanceof HTMLButtonElement) {
    els.configResetBtn.disabled = !state.configDraftDirty && !hasChanges;
  }
  const summary = hasChanges
    ? `Unsaved OSC changes. Runtime out ${runtimeConfig.outHost}:${runtimeConfig.outPort}, in ${runtimeConfig.inPort}.`
    : `Runtime OSC out ${runtimeConfig.outHost}:${runtimeConfig.outPort}, in ${runtimeConfig.inPort}.`;
  setTextIfChanged(els.configurationSummary, summary);
}

async function saveConfiguration() {
  try {
    const runtimeConfig = getStatusOscConfig();
    const draft = configurationDraftFromInputs(runtimeConfig);
    state.configDraft = { ...draft };
    state.configDraftDirty = true;
    if (oscConfigEquals(draft, runtimeConfig)) {
      addLog("configuration unchanged");
      renderConfiguration();
      return;
    }
    await api("/api/osc/config", "POST", draft);
    state.configDraftDirty = false;
    addLog(`configuration saved -> out ${draft.outHost}:${draft.outPort}, in ${draft.inPort}`);
    await refreshStatus();
  } catch (error) {
    addLog(`configuration save failed: ${error.message}`);
  }
}

function resetConfigurationDraft() {
  state.configDraft = { ...getStatusOscConfig() };
  state.configDraftDirty = false;
  addLog("configuration draft reset");
  renderConfiguration();
}

function defaultActionOscPath(actionId, verb) {
  const prefix = getStatusOscConfig().actionPathPrefix;
  return `${prefix}/${actionId}/${verb}`;
}

function defaultActionGroupOscPath(groupId) {
  const prefix = getStatusOscConfig().actionGroupPathPrefix;
  return `${prefix}/${groupId}/trigger`;
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
    return `action lfo ${source.enabled !== false ? "enabled" : "disabled"} -> ${actionId}.${lfoId}`;
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
    enabled: base.enabled !== false,
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

function setSelectOptionsFromValues(selectElement, values, selectedValue, emptyLabel = "No options") {
  if (!(selectElement instanceof HTMLSelectElement)) return;
  const normalizedValues = (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const normalizedSelected = String(selectedValue || "").trim();
  const previousValue = String(selectElement.value || "").trim();

  const optionValues = [...normalizedValues];
  if (normalizedSelected && !optionValues.includes(normalizedSelected)) {
    optionValues.push(normalizedSelected);
  }

  selectElement.innerHTML = "";
  if (!optionValues.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyLabel;
    option.disabled = true;
    option.selected = true;
    selectElement.appendChild(option);
    selectElement.disabled = true;
    return;
  }

  for (const value of optionValues) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  }
  selectElement.disabled = false;
  const nextSelected = normalizedSelected && optionValues.includes(normalizedSelected)
    ? normalizedSelected
    : (previousValue && optionValues.includes(previousValue) ? previousValue : optionValues[0]);
  if (nextSelected) {
    selectElement.value = nextSelected;
  }
}

function selectHasAvailableChoices(selectElement) {
  if (!(selectElement instanceof HTMLSelectElement)) return false;
  return Array.from(selectElement.options || []).some((option) => {
    if (!(option instanceof HTMLOptionElement)) return false;
    if (option.disabled) return false;
    return Boolean(String(option.value || "").trim());
  });
}

function setRuleCompactFieldVisibility(inputElement, visible) {
  const field = inputElement?.closest?.(".compact-field");
  if (field) {
    field.hidden = !visible;
  }
}

function updateActionRuleFieldAvailabilityVisibility(showModulation) {
  const hasModTargets = selectHasAvailableChoices(els.actionManagerRuleModTargetInput);
  const hasRampTargets = selectHasAvailableChoices(els.actionManagerRuleRampTargetInput);

  setRuleCompactFieldVisibility(els.actionManagerRuleModTargetInput, hasModTargets);
  setRuleCompactFieldVisibility(els.actionManagerRuleModParamInput, hasModTargets);
  setRuleCompactFieldVisibility(els.actionManagerRuleModValueInput || els.actionManagerRuleModValueSelect, hasModTargets);

  setRuleCompactFieldVisibility(els.actionManagerRuleRampTargetInput, hasRampTargets);
  setRuleCompactFieldVisibility(els.actionManagerRuleRampStartInput, hasRampTargets);
  setRuleCompactFieldVisibility(els.actionManagerRuleRampEndInput, hasRampTargets);
  setRuleCompactFieldVisibility(els.actionManagerRuleRampSpeedInput, hasRampTargets);

  if (els.actionManagerRuleModEmptyNote) {
    els.actionManagerRuleModEmptyNote.hidden = !showModulation || hasModTargets;
  }
  if (els.actionManagerRuleRampEmptyNote) {
    els.actionManagerRuleRampEmptyNote.hidden = showModulation || hasRampTargets;
  }
  if (els.actionManagerRuleRampRelativeInput?.parentElement) {
    els.actionManagerRuleRampRelativeInput.parentElement.hidden = showModulation || !hasRampTargets;
  }
  if (els.actionManagerRuleRampRelativeInput) {
    els.actionManagerRuleRampRelativeInput.disabled = showModulation || !hasRampTargets;
  }
}

function setActionRuleModValueEditor(parameter, value) {
  const param = ACTION_RULE_MODULATION_PARAMS.has(parameter) ? parameter : "depth";
  const discreteValues = ACTION_RULE_MODULATION_DISCRETE_VALUES[param] || null;
  const valueSelect = els.actionManagerRuleModValueSelect;
  const valueInput = els.actionManagerRuleModValueInput;
  if (!(valueSelect instanceof HTMLSelectElement) || !(valueInput instanceof HTMLInputElement)) {
    return;
  }

  if (discreteValues) {
    valueSelect.innerHTML = "";
    for (const optionValue of discreteValues) {
      const option = document.createElement("option");
      option.value = optionValue;
      if (param === "enabled") {
        option.textContent = optionValue === "true" ? "On" : "Off";
      } else if (param === "polarity") {
        option.textContent = optionValue === "unipolar" ? "Unipolar" : "Bipolar";
      } else {
        option.textContent = optionValue.charAt(0).toUpperCase() + optionValue.slice(1);
      }
      valueSelect.appendChild(option);
    }
    const normalizedValue = param === "enabled"
      ? (parseBooleanLike(value, true) ? "true" : "false")
      : String(value || discreteValues[0] || "").trim().toLowerCase();
    if (document.activeElement !== valueSelect) {
      valueSelect.value = discreteValues.includes(normalizedValue) ? normalizedValue : discreteValues[0];
    }
    valueSelect.hidden = false;
    valueInput.hidden = true;
    valueInput.disabled = true;
    valueSelect.disabled = false;
    return;
  }

  valueSelect.hidden = true;
  valueSelect.disabled = true;
  valueInput.hidden = false;
  valueInput.disabled = false;
  valueInput.type = "number";
  if (param === "rateHz") {
    valueInput.min = "0";
    valueInput.step = "0.01";
  } else if (param === "phaseDeg" || param === "mappingPhaseDeg") {
    valueInput.removeAttribute("min");
    valueInput.step = "1";
  } else {
    valueInput.removeAttribute("min");
    valueInput.step = "0.1";
  }
  setInputValueIfIdle(valueInput, String(parseFiniteNumber(value, 0)));
}

function updateActionRuleInputsState() {
  const ruleType = normalizeActionRuleType(els.actionManagerRuleTypeInput?.value || "parameterRamp");
  const showModulation = ruleType === "modulationControl";
  if (els.actionManagerRuleModFields) {
    els.actionManagerRuleModFields.hidden = !showModulation;
    for (const input of els.actionManagerRuleModFields.querySelectorAll("input, select, button, textarea")) {
      input.disabled = !showModulation;
    }
  }
  if (els.actionManagerRuleRampFields) {
    els.actionManagerRuleRampFields.hidden = showModulation;
    for (const input of els.actionManagerRuleRampFields.querySelectorAll("input, select, button, textarea")) {
      input.disabled = showModulation;
    }
  }
  updateActionRuleFieldAvailabilityVisibility(showModulation);

  const parameter = String(els.actionManagerRuleModParamInput?.value || "depth").trim();
  const currentValue = Object.prototype.hasOwnProperty.call(ACTION_RULE_MODULATION_DISCRETE_VALUES, parameter)
    ? String(els.actionManagerRuleModValueSelect?.value || "")
    : String(els.actionManagerRuleModValueInput?.value || "");
  setActionRuleModValueEditor(parameter, currentValue);
}

function syncActionRuleEditor(selectedAction = null, globalLfoIds = []) {
  const modulationTargets = listActionRuleModulatorTargets(selectedAction, globalLfoIds);
  const rampTargets = listActionRuleRampTargets();
  const rule = normalizeActionRuleModel(selectedAction?.actionRule, {
    selectedAction,
    globalLfoIds,
    modulationTargets,
    rampTargets
  });

  setSelectOptionsFromValues(
    els.actionManagerRuleModTargetInput,
    modulationTargets,
    rule.targetModulator,
    "No modulators"
  );
  setSelectOptionsFromValues(
    els.actionManagerRuleRampTargetInput,
    rampTargets,
    rule.target,
    "No targets"
  );

  if (els.actionManagerRuleTypeInput) {
    setInputValueIfIdle(els.actionManagerRuleTypeInput, rule.type);
  }
  if (els.actionManagerRuleModParamInput) {
    setInputValueIfIdle(els.actionManagerRuleModParamInput, rule.parameter || "depth");
  }
  if (els.actionManagerRuleRampStartInput) {
    setInputValueIfIdle(els.actionManagerRuleRampStartInput, String(parseFiniteNumber(rule.startValue, 0)));
  }
  if (els.actionManagerRuleRampEndInput) {
    setInputValueIfIdle(els.actionManagerRuleRampEndInput, String(parseFiniteNumber(rule.endValue, 0)));
  }
  if (els.actionManagerRuleRampSpeedInput) {
    setInputValueIfIdle(els.actionManagerRuleRampSpeedInput, String(Math.max(0, parseFiniteNumber(rule.speedMs, 0))));
  }
  setCheckboxCheckedIfIdle(els.actionManagerRuleRampRelativeInput, rule.relative);
  setActionRuleModValueEditor(rule.parameter, rule.value);
  updateActionRuleInputsState();
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
    enabled: base.enabled !== false,
    onEndActionId: onEndActionId || "",
    actionRule: actionRulePayloadFromInputs(base.actionRule),
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
  const enabledValue = base.enabled !== false;
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
    const rawNewActionId = prompt("Add action ID", suggestedActionId);
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
    cancelActionGroupAutoSaveTimer();
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

async function actionGroupManagerSave(options = {}) {
  const { auto = false, expectedGroupId = "" } = options;
  try {
    const groupId = selectedActionGroupIdOrThrow();
    if (expectedGroupId && String(expectedGroupId || "").trim() !== groupId) {
      return false;
    }
    const currentGroup = selectedActionGroupOrNull();
    if (!currentGroup) {
      throw new Error(`Action group not found: ${groupId}`);
    }
    const payload = actionGroupPayloadFromInputs(currentGroup, { fallbackGroupId: groupId, lockGroupId: true });
    const currentName = String(currentGroup.name || groupId).trim() || groupId;
    const currentEnabled = currentGroup.enabled !== false;
    const currentTrigger = String(currentGroup.oscTriggers?.trigger || defaultActionGroupOscPath(groupId)).trim();
    const nextTrigger = String(payload.oscTriggers?.trigger || defaultActionGroupOscPath(groupId)).trim();
    const unchanged = payload.name === currentName
      && payload.enabled === currentEnabled
      && nextTrigger === currentTrigger;
    if (auto && unchanged) {
      return false;
    }
    await api(`/api/action-group/${encodeURIComponent(groupId)}/update`, "POST", payload);
    if (!auto) {
      addLog(`action group save -> ${groupId}`);
    }
    await refreshStatus();
    return true;
  } catch (error) {
    if (!auto) {
      addLog(`action group save failed: ${error.message}`);
    }
    return false;
  }
}

async function actionGroupManagerDelete() {
  try {
    cancelActionGroupAutoSaveTimer();
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
    addLog(`action group entry delete -> ${groupId} #${index + 1}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group entry delete failed: ${error.message}`);
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
    if (!confirm(`Delete all entries from "${groupId}"?`)) {
      return;
    }
    await api(`/api/action-group/${encodeURIComponent(groupId)}/update`, "POST", { entries: [] });
    if (state.selectedActionGroupEntryGroupId === groupId) {
      state.selectedActionGroupEntryIndex = null;
    }
    addLog(`action group entries deleted -> ${groupId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action group entry delete failed: ${error.message}`);
  }
}

async function actionManagerAddLfo() {
  try {
    cancelActionLfoAutoApplyTimer();
    let actionId = String(state.selectedActionId || "").trim();
    let action = actionId ? getActionById(actionId) : null;
    if (!action) {
      const fallbackActionId = Object.keys(getActionsById())
        .sort((a, b) => a.localeCompare(b))
        .find((candidateId) => Boolean(getActionById(candidateId)));
      if (fallbackActionId) {
        actionId = fallbackActionId;
        state.selectedActionId = fallbackActionId;
        action = getActionById(fallbackActionId);
      }
    }
    if (!actionId) {
      const createPayload = actionPayloadFromInputs(null, {
        fallbackActionId: uniqueActionId("action"),
        preferNameDerivedId: true
      });
      const created = await api("/api/action/create", "POST", createPayload);
      actionId = String(created?.actionId || createPayload.actionId || "").trim();
      if (!actionId) {
        throw new Error("Failed to add action for LFO");
      }
      state.selectedActionId = actionId;
      action = created?.action && typeof created.action === "object" ? created.action : createPayload;
      addLog(`action create -> ${actionId}`);
    }
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

    const targetScope = normalizeLfoTargetScope(
      els.actionManagerLfoTargetScopeInput?.value
      || selectedGroup.lfo?.targetScope
      || selectedGroup.lfo?.target_scope
      || LFO_TARGET_SCOPE_OBJECT
    );
    const targetId = sanitizeObjectId(String(els.actionManagerLfoTargetObjectInput?.value || "").trim());
    if (!targetId) {
      throw new Error(`Target ${targetScope} ID is required`);
    }
    const parameter = String(els.actionManagerLfoTargetParamInput?.value || "").trim().toLowerCase();
    if (!isLfoTargetParameter(parameter, targetScope)) {
      throw new Error(`Invalid parameter: ${parameter}`);
    }
    if (targetScope === LFO_TARGET_SCOPE_GROUP) {
      const groupIds = getLfoTargetGroups().map((group) => group.groupId);
      if (!groupIds.includes(targetId)) {
        throw new Error(`Group not found: ${targetId}`);
      }
    } else {
      const targetObject = getObjects().find((obj) => String(obj.objectId || "").trim() === targetId);
      if (!targetObject) {
        throw new Error(`Object not found: ${targetId}`);
      }
    }
    const mappingPhaseDeg = normalizePhaseDegrees(
      parseFiniteNumber(
        els.actionManagerLfoTargetPhaseInput?.value,
        parseFiniteNumber(selectedGroup.lfo?.mappingPhaseDeg, 0)
      ),
      0
    );
    const distributePhaseOverMembers = targetScope === LFO_TARGET_SCOPE_GROUP
      ? Boolean(els.actionManagerLfoTargetSpreadInput?.checked)
      : false;

    const mappedTarget = {
      ...(selectedGroup.lfo && typeof selectedGroup.lfo === "object" ? selectedGroup.lfo : {}),
      targetScope,
      objectId: targetScope === LFO_TARGET_SCOPE_OBJECT ? targetId : "",
      groupId: targetScope === LFO_TARGET_SCOPE_GROUP ? targetId : "",
      parameter,
      mappingPhaseDeg,
      phaseFlip: false,
      targetEnabled: true,
      distributePhaseOverMembers
    };
    const nextLfos = [...currentLfos, mappedTarget];
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", { lfos: nextLfos });
    state.selectedActionLfoActionId = actionId;
    const nextGroups = collectLfoGroups(nextLfos);
    const nextSelectedGroup = nextGroups.find((group) => group.selector === selectedGroup.selector) || null;
    state.selectedActionLfoIndex = nextSelectedGroup ? nextSelectedGroup.representativeIndex : state.selectedActionLfoIndex;
    state.selectedActionLfoTargetIndex = nextLfos.length - 1;
    addLog(`action lfo target add -> ${actionId} ${targetId}.${parameter} (phase ${mappingPhaseDeg}°)`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo add target failed: ${error.message}`);
  }
}

async function actionManagerUpdateLfoTargetConfig(index, options = {}) {
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

    const nextPhaseDeg = normalizePhaseDegrees(
      options.mappingPhaseDeg,
      parseFiniteNumber(lfo.mappingPhaseDeg, 0)
    );
    const nextDepth = clampValue(parseFiniteNumber(
      options.depth,
      parseFiniteNumber(lfo.depth, 0)
    ), [0, 100]);
    const nextOffset = parseFiniteNumber(
      options.offset,
      parseFiniteNumber(lfo.offset, 0)
    );
    const nextPhaseFlip = options.phaseFlip === undefined
      ? Boolean(lfo.phaseFlip)
      : Boolean(options.phaseFlip);
    const nextTargetEnabled = options.targetEnabled === undefined
      ? lfo.targetEnabled !== false
      : Boolean(options.targetEnabled);
    const lfoScope = normalizeLfoTargetScope(lfo.targetScope || lfo.target_scope || "");
    const nextDistributePhaseOverMembers = lfoScope === LFO_TARGET_SCOPE_GROUP
      ? (options.distributePhaseOverMembers === undefined
        ? Boolean(lfo.distributePhaseOverMembers)
        : Boolean(options.distributePhaseOverMembers))
      : false;
    const selectedLfoId = String(selectedGroup.lfoId || "").trim();
    if (!selectedLfoId) {
      throw new Error("Selected LFO is missing an ID");
    }

    const nextLfos = [...currentLfos];
    nextLfos[index] = {
      ...lfo,
      mappingPhaseDeg: nextPhaseDeg,
      phaseFlip: nextPhaseFlip,
      targetEnabled: nextTargetEnabled,
      distributePhaseOverMembers: nextDistributePhaseOverMembers
    };
    await api("/api/action-lfo/update", "POST", {
      actionId,
      lfoId: selectedLfoId,
      depth: nextDepth,
      offset: nextOffset
    });
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", { lfos: nextLfos });
    state.selectedActionLfoActionId = actionId;
    const nextGroups = collectLfoGroups(nextLfos);
    const nextSelectedGroup = nextGroups.find((group) => group.selector === selectedGroup.selector) || null;
    state.selectedActionLfoIndex = nextSelectedGroup ? nextSelectedGroup.representativeIndex : null;
    state.selectedActionLfoTargetIndex = index;

    const targetLabel = lfoTargetLabel(nextLfos[index]) || `target #${index + 1}`;
    addLog(
      `action lfo target update -> ${actionId} ${targetLabel} (phase ${nextPhaseDeg}°, depth ${nextDepth.toFixed(3)}, offset ${nextOffset.toFixed(3)}, flip ${nextPhaseFlip ? "on" : "off"}, target ${nextTargetEnabled ? "on" : "off"}, spread ${nextDistributePhaseOverMembers ? "on" : "off"})`
    );
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo target update failed: ${error.message}`);
  }
}

async function actionManagerUpdateSelectedLfoTargetFromInputs() {
  try {
    cancelActionLfoAutoApplyTimer();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    const targetIndex = Number.isInteger(state.selectedActionLfoTargetIndex) ? state.selectedActionLfoTargetIndex : -1;
    if (targetIndex < 0 || targetIndex >= currentLfos.length) {
      return;
    }

    const selectedLfoIndex = Number.isInteger(state.selectedActionLfoIndex) ? state.selectedActionLfoIndex : -1;
    const groups = collectLfoGroups(currentLfos);
    const selectedGroup = groups.find((group) => group.representativeIndex === selectedLfoIndex) || null;
    if (!selectedGroup) {
      return;
    }
    if (!selectedGroup.entryIndices.includes(targetIndex)) {
      return;
    }

    const currentTarget = currentLfos[targetIndex] || {};

    const targetScope = normalizeLfoTargetScope(
      els.actionManagerLfoTargetScopeInput?.value || LFO_TARGET_SCOPE_OBJECT
    );
    const targetId = sanitizeObjectId(String(els.actionManagerLfoTargetObjectInput?.value || "").trim());
    if (!targetId) {
      throw new Error(`Target ${targetScope} ID is required`);
    }
    const parameter = String(els.actionManagerLfoTargetParamInput?.value || "").trim().toLowerCase();
    if (!isLfoTargetParameter(parameter, targetScope)) {
      throw new Error(`Invalid parameter: ${parameter}`);
    }
    if (targetScope === LFO_TARGET_SCOPE_GROUP) {
      const groupIds = getLfoTargetGroups().map((group) => group.groupId);
      if (!groupIds.includes(targetId)) {
        throw new Error(`Group not found: ${targetId}`);
      }
    } else {
      const targetObject = getObjects().find((obj) => String(obj.objectId || "").trim() === targetId);
      if (!targetObject) {
        throw new Error(`Object not found: ${targetId}`);
      }
    }
    const mappingPhaseDeg = normalizePhaseDegrees(
      parseFiniteNumber(els.actionManagerLfoTargetPhaseInput?.value, currentTarget.mappingPhaseDeg),
      parseFiniteNumber(currentTarget.mappingPhaseDeg, 0)
    );
    const distributePhaseOverMembers = targetScope === LFO_TARGET_SCOPE_GROUP
      ? Boolean(els.actionManagerLfoTargetSpreadInput?.checked)
      : false;

    // Intentionally allow duplicate mappings so one LFO can stack multiple times
    // on the same target/parameter with different phase/depth/offset settings.

    const nextLfos = [...currentLfos];
    const previousScope = normalizeLfoTargetScope(currentTarget?.targetScope || currentTarget?.target_scope || "");
    const previousObjectId = String(currentTarget.objectId || currentTarget.object_id || "").trim();
    const previousGroupId = String(currentTarget.groupId || currentTarget.group_id || "").trim();
    const previousParam = String(currentTarget.parameter || "").trim().toLowerCase();
    const changed =
      previousScope !== targetScope
      || (targetScope === LFO_TARGET_SCOPE_GROUP ? previousGroupId !== targetId : previousObjectId !== targetId)
      || previousParam !== parameter
      || normalizePhaseDegrees(currentTarget.mappingPhaseDeg, 0) !== mappingPhaseDeg
      || Boolean(currentTarget.distributePhaseOverMembers) !== distributePhaseOverMembers;
    if (!changed) {
      return;
    }

    nextLfos[targetIndex] = {
      ...currentTarget,
      targetScope,
      objectId: targetScope === LFO_TARGET_SCOPE_OBJECT ? targetId : "",
      groupId: targetScope === LFO_TARGET_SCOPE_GROUP ? targetId : "",
      parameter,
      mappingPhaseDeg,
      distributePhaseOverMembers
    };

    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", { lfos: nextLfos });
    state.selectedActionLfoActionId = actionId;
    const nextGroups = collectLfoGroups(nextLfos);
    const nextSelectedGroup = nextGroups.find((group) => group.selector === selectedGroup.selector) || null;
    state.selectedActionLfoIndex = nextSelectedGroup ? nextSelectedGroup.representativeIndex : state.selectedActionLfoIndex;
    state.selectedActionLfoTargetIndex = targetIndex;
    const targetLabel = lfoTargetLabel(nextLfos[targetIndex]) || `${targetId}.${parameter}`;
    addLog(`action lfo target set -> ${actionId} ${targetLabel} (phase ${mappingPhaseDeg}°)`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo target set failed: ${error.message}`);
    await refreshStatus();
  }
}

async function actionManagerUpdateLfoTargetPhase(index, mappingPhaseDeg) {
  await actionManagerUpdateLfoTargetConfig(index, { mappingPhaseDeg });
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
      throw new Error("Select an LFO row to delete targets");
    }
    if (!selectedGroup.entryIndices.includes(index)) {
      return;
    }

    const removedLfo = currentLfos[index] || {};
    const removedLabel = lfoTargetLabel(removedLfo) || `target #${index + 1}`;
    const isLastTargetForLfo = selectedGroup.entryIndices.length <= 1;
    let nextLfos = [];
    if (isLastTargetForLfo) {
      const preservedScope = normalizeLfoTargetScope(
        removedLfo.targetScope || removedLfo.target_scope || LFO_TARGET_SCOPE_OBJECT
      );
      nextLfos = [...currentLfos];
      nextLfos[index] = {
        ...removedLfo,
        targetScope: preservedScope,
        objectId: "",
        groupId: "",
        parameter: "",
        targetEnabled: true,
        distributePhaseOverMembers: false
      };
    } else {
      nextLfos = currentLfos.filter((_, entryIndex) => entryIndex !== index);
    }
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", { lfos: nextLfos });
    state.selectedActionLfoActionId = actionId;
    const nextGroups = collectLfoGroups(nextLfos);
    const nextSelectedGroup = nextGroups.find((group) => group.selector === selectedGroup.selector) || null;
    state.selectedActionLfoIndex = nextSelectedGroup
      ? nextSelectedGroup.representativeIndex
      : (nextGroups[0]?.representativeIndex ?? null);
    state.selectedActionLfoTargetIndex = isLastTargetForLfo ? index : null;
    addLog(
      isLastTargetForLfo
        ? `action lfo target clear -> ${actionId} ${removedLabel} (lfo preserved)`
        : `action lfo target delete -> ${actionId} ${removedLabel}`
    );
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo target delete failed: ${error.message}`);
  }
}

function cancelActionLfoAutoApplyTimer() {
  if (state.actionLfoAutoApplyTimerId !== null) {
    clearTimeout(state.actionLfoAutoApplyTimerId);
    state.actionLfoAutoApplyTimerId = null;
  }
  state.actionLfoAutoApplyQueued = false;
}

async function waitForActionLfoAutoApplyIdle(timeoutMs = 1200) {
  const startedAt = Date.now();
  while (state.actionLfoAutoApplyInFlight) {
    if ((Date.now() - startedAt) >= timeoutMs) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
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
    const previousLfoId = String(selectedGroup.lfoId || "").trim();
    const nextLfoId = String(updatedLfo.lfoId || "").trim();
    if (!previousLfoId) {
      throw new Error("Selected LFO is missing an ID");
    }

    if (nextLfoId && nextLfoId !== previousLfoId) {
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
    } else {
      await api("/api/action-lfo/update", "POST", {
        actionId,
        lfoId: previousLfoId,
        wave: updatedLfo.wave,
        rateHz: updatedLfo.rateHz,
        depth: updatedLfo.depth,
        offset: updatedLfo.offset,
        phaseDeg: updatedLfo.phaseDeg,
        polarity: updatedLfo.polarity,
        enabled: updatedLfo.enabled
      });
    }
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
    addLog(`action lfo delete -> ${actionId} ${selectedGroup.lfoId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo delete failed: ${error.message}`);
  }
}

async function actionManagerToggleLfoEnabled(indexOrLfoId, enabled) {
  try {
    cancelActionLfoAutoApplyTimer();
    await waitForActionLfoAutoApplyIdle();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    const groups = collectLfoGroups(currentLfos);
    const normalizedLfoId = sanitizeActionId(indexOrLfoId, { allowEmpty: true });
    const selectedGroup = typeof indexOrLfoId === "number"
      ? (groups.find((group) => group.representativeIndex === indexOrLfoId) || null)
      : (groups.find((group) => group.lfoId === normalizedLfoId) || null);
    if (!selectedGroup) {
      return;
    }
    if (enabled) {
      await api("/api/lfos/enabled", "POST", { enabled: true });
    }
    await api("/api/action-lfo/enabled", "POST", {
      actionId,
      lfoId: selectedGroup.lfoId,
      enabled: Boolean(enabled)
    });
    state.selectedActionLfoActionId = actionId;
    state.selectedActionLfoIndex = selectedGroup.representativeIndex;
    const suffixParts = [];
    if (enabled) {
      suffixParts.push("global lfos on");
    }
    const suffix = suffixParts.length ? ` (${suffixParts.join(", ")})` : "";
    addLog(`action lfo ${enabled ? "enabled" : "disabled"} -> ${actionId} ${selectedGroup.lfoId}${suffix}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo toggle failed: ${error.message}`);
    await refreshStatus();
  }
}

async function actionManagerToggleLfoTargetEnabled(index, enabled) {
  try {
    cancelActionLfoAutoApplyTimer();
    await waitForActionLfoAutoApplyIdle();
    const actionId = selectedActionIdOrThrow();
    const action = selectedActionOrNull();
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }
    const currentLfos = Array.isArray(action.lfos) ? action.lfos : [];
    if (!Number.isInteger(index) || index < 0 || index >= currentLfos.length) {
      throw new Error("Invalid LFO target index");
    }
    const lfo = currentLfos[index] || {};
    if (!lfoHasAssignedTarget(lfo)) {
      throw new Error("Target mapping is missing object/parameter");
    }
    const lfoId = String(lfo.lfoId || lfo.lfo_id || "").trim();
    const targetScope = normalizeLfoTargetScope(lfo?.targetScope || lfo?.target_scope || "");
    const targetId = targetScope === LFO_TARGET_SCOPE_GROUP
      ? String(lfo.groupId || lfo.group_id || "").trim()
      : String(lfo.objectId || lfo.object_id || "").trim();
    const parameter = String(lfo.parameter || "").trim().toLowerCase();
    if (!lfoId || !targetId || !isLfoTargetParameter(parameter, targetScope)) {
      throw new Error("Invalid LFO target mapping");
    }
    await api("/api/action-lfo/target-enabled", "POST", {
      actionId,
      lfoId,
      targetScope,
      groupId: targetScope === LFO_TARGET_SCOPE_GROUP ? targetId : "",
      objectId: targetScope === LFO_TARGET_SCOPE_OBJECT ? targetId : "",
      parameter,
      enabled: Boolean(enabled)
    });
    state.selectedActionLfoActionId = actionId;
    state.selectedActionLfoTargetIndex = index;
    const targetLabel = lfoTargetLabel(lfo);
    addLog(`action lfo target ${enabled ? "enabled" : "disabled"} -> ${actionId} ${targetLabel} (${lfoId})`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo target toggle failed: ${error.message}`);
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
    if (!confirm(`Delete all LFOs from "${actionId}"?`)) {
      return;
    }
    await api(`/api/action/${encodeURIComponent(actionId)}/update`, "POST", { lfos: [] });
    state.selectedActionLfoActionId = actionId;
    state.selectedActionLfoIndex = null;
    state.selectedActionLfoTargetIndex = null;
    addLog(`action lfo delete all -> ${actionId}`);
    await refreshStatus();
  } catch (error) {
    addLog(`action lfo delete failed: ${error.message}`);
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
    row.innerHTML = '<td class="muted" colspan="6">Select an LFO to monitor targets.</td>';
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
  if (state.currentPage !== "action-manager" && state.currentPage !== "action-group-manager" && state.currentPage !== "modulation-manager") {
    return;
  }
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

  let selectedActionId = String(state.selectedActionId || "").trim();
  let selectedAction = selectedActionId ? actionsById[selectedActionId] : null;
  if (!selectedAction && actionIds.length) {
    const fallbackActionId = actionIds.find((actionId) => Boolean(actionsById[actionId])) || actionIds[0];
    if (fallbackActionId) {
      state.selectedActionId = fallbackActionId;
      selectedActionId = fallbackActionId;
      selectedAction = actionsById[fallbackActionId] || null;
    }
  }
  const selectedActionRuntimeId = String(selectedAction?.actionId || selectedActionId).trim();
  const isRunning = selectedActionRuntimeId ? runningActions.has(selectedActionRuntimeId) : false;
  const runningList = [...runningActions].sort((a, b) => a.localeCompare(b));
  els.actionManagerSummary.textContent = `${actionIds.length} action${actionIds.length === 1 ? "" : "s"} | groups: ${actionGroupIds.length} | running: ${runningList.length ? runningList.join(", ") : "-"}`;
  const selectedLfoCount = Array.isArray(selectedAction?.lfos) ? collectLfoGroups(selectedAction.lfos).length : 0;
  const selectedActionLabel = selectedActionId || "-";
  els.modulationManagerSummary.textContent = `Action: ${selectedActionLabel} | LFOs: ${selectedLfoCount} | running: ${isRunning ? "yes" : "no"} | global: ${areLfosEnabled() ? "on" : "off"}`;
  syncActionRuleEditor(selectedAction, globalLfoIds);

  els.actionManagerRows.innerHTML = "";
  if (!actionIds.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td class="muted" colspan="8">No actions added yet.</td>';
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
            <button type="button" data-action-group-entry-command="trigger">Trigger</button>
            <button class="danger" type="button" data-action-group-entry-command="remove">Delete</button>
          </div>
        </td>
      `;

      const selectEntry = () => {
        state.selectedActionGroupEntryIndex = index;
        reflectActionGroupEntryToInputs(entry);
        renderActionManager();
      };

      const triggerBtn = row.querySelector('button[data-action-group-entry-command="trigger"]');
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
    row.innerHTML = '<td class="muted action-group-list-empty" colspan="5">Add an action group to see it here.</td>';
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
        <td class="action-group-list-name-cell">${escapeHtml(displayName)}</td>
        <td>${escapeHtml(groupId)}</td>
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
  els.actionManagerLfoAddBtn.disabled = false;
  const selectedLfos = Array.isArray(selectedAction?.lfos) ? selectedAction.lfos : [];
  const selectedLfoGroups = collectLfoGroups(selectedLfos);
  if (Number.isInteger(state.selectedActionLfoIndex)) {
    const hasMatchingGroup = selectedLfoGroups.some((group) => group.representativeIndex === state.selectedActionLfoIndex);
    if (!hasMatchingGroup) {
      state.selectedActionLfoIndex = null;
      state.selectedActionLfoTargetIndex = null;
    }
  }
  if (!Number.isInteger(state.selectedActionLfoIndex) && selectedLfoGroups.length) {
    state.selectedActionLfoIndex = selectedLfoGroups[0].representativeIndex;
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
  const lfoTargetGroups = getLfoTargetGroups();
  const groupIds = lfoTargetGroups.map((group) => group.groupId);
  const hasObjects = objects.length > 0;
  const hasGroups = lfoTargetGroups.length > 0;
  const canConfigureLfoTargets = Boolean(selectedAction && (hasObjects || hasGroups));
  const canEditLfoTargets = Boolean(canConfigureLfoTargets && hasSelectedLfo);
  els.actionManagerLfoAddTargetBtn.disabled = !canEditLfoTargets;
  els.actionManagerLfoClearBtn.disabled = !selectedAction || !selectedLfos.length;
  if (els.actionManagerLfoTargetScopeInput) {
    const previousScope = String(els.actionManagerLfoTargetScopeInput.value || LFO_TARGET_SCOPE_OBJECT).trim();
    const preferredScope = normalizeLfoTargetScope(previousScope);
    els.actionManagerLfoTargetScopeInput.innerHTML = "";
    const objectOption = document.createElement("option");
    objectOption.value = LFO_TARGET_SCOPE_OBJECT;
    objectOption.textContent = "Object";
    objectOption.selected = preferredScope === LFO_TARGET_SCOPE_OBJECT;
    els.actionManagerLfoTargetScopeInput.appendChild(objectOption);
    const groupOption = document.createElement("option");
    groupOption.value = LFO_TARGET_SCOPE_GROUP;
    groupOption.textContent = "Group";
    groupOption.selected = preferredScope === LFO_TARGET_SCOPE_GROUP;
    groupOption.disabled = !hasGroups;
    els.actionManagerLfoTargetScopeInput.appendChild(groupOption);
    els.actionManagerLfoTargetScopeInput.disabled = !canConfigureLfoTargets;
  }
  const selectedTargetScope = normalizeLfoTargetScope(els.actionManagerLfoTargetScopeInput?.value || LFO_TARGET_SCOPE_OBJECT);
  if (els.actionManagerLfoTargetObjectInput) {
    const previousTargetId = String(els.actionManagerLfoTargetObjectInput.value || "").trim();
    const preferredTargetId = selectedTargetScope === LFO_TARGET_SCOPE_GROUP
      ? (groupIds.includes(previousTargetId)
        ? previousTargetId
        : groupIds[0] || "")
      : (objects.some((obj) => String(obj.objectId || "").trim() === previousTargetId)
        ? previousTargetId
        : String(state.selectedObjectId || objects[0]?.objectId || "").trim());
    els.actionManagerLfoTargetObjectInput.innerHTML = "";
    const hasTargets = selectedTargetScope === LFO_TARGET_SCOPE_GROUP ? hasGroups : hasObjects;
    if (!hasTargets) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = selectedTargetScope === LFO_TARGET_SCOPE_GROUP ? "No groups" : "No objects";
      option.disabled = true;
      option.selected = true;
      els.actionManagerLfoTargetObjectInput.appendChild(option);
    } else {
      const targets = selectedTargetScope === LFO_TARGET_SCOPE_GROUP
        ? lfoTargetGroups
        : objects.map((obj) => String(obj.objectId || "").trim()).filter(Boolean);
      for (const targetId of targets) {
        const option = document.createElement("option");
        const optionValue = selectedTargetScope === LFO_TARGET_SCOPE_GROUP
          ? String(targetId.groupId || "").trim()
          : String(targetId || "").trim();
        const optionLabel = selectedTargetScope === LFO_TARGET_SCOPE_GROUP
          ? String(targetId.label || optionValue).trim() || optionValue
          : optionValue;
        option.value = optionValue;
        option.textContent = optionLabel;
        if (optionValue === preferredTargetId) {
          option.selected = true;
        }
        els.actionManagerLfoTargetObjectInput.appendChild(option);
      }
      if (!String(els.actionManagerLfoTargetObjectInput.value || "").trim() && preferredTargetId) {
        els.actionManagerLfoTargetObjectInput.value = preferredTargetId;
      }
    }
    els.actionManagerLfoTargetObjectInput.disabled = !canConfigureLfoTargets;
  }
  if (els.actionManagerLfoTargetParamInput) {
    const targetParamOptions = selectedTargetScope === LFO_TARGET_SCOPE_GROUP
      ? ["all", ...LFO_PARAM_OPTIONS]
      : [...LFO_PARAM_OPTIONS];
    const currentParam = String(els.actionManagerLfoTargetParamInput.value || "").trim().toLowerCase();
    els.actionManagerLfoTargetParamInput.innerHTML = "";
    for (const option of targetParamOptions) {
      const optionElement = document.createElement("option");
      optionElement.value = option;
      optionElement.textContent = option;
      if (option === currentParam) {
        optionElement.selected = true;
      }
      els.actionManagerLfoTargetParamInput.appendChild(optionElement);
    }
    if (!targetParamOptions.includes(currentParam)) {
      let fallbackParam = selectedTargetScope === LFO_TARGET_SCOPE_GROUP ? "all" : "x";
      const firstTargetLabel = selectedLfoGroup?.targetLabels?.find(Boolean) || "";
      if (firstTargetLabel.includes(".")) {
        const candidateParam = firstTargetLabel.split(".").pop() || "";
        if (targetParamOptions.includes(candidateParam)) {
          fallbackParam = candidateParam;
        }
      }
      els.actionManagerLfoTargetParamInput.value = fallbackParam;
    }
    els.actionManagerLfoTargetParamInput.disabled = !canConfigureLfoTargets;
  }
  if (els.actionManagerLfoTargetPhaseInput) {
    const currentPhase = parseFiniteNumber(els.actionManagerLfoTargetPhaseInput.value, Number.NaN);
    if (!Number.isFinite(currentPhase)) {
      els.actionManagerLfoTargetPhaseInput.value = "0";
    }
    els.actionManagerLfoTargetPhaseInput.disabled = !canConfigureLfoTargets;
  }
  if (els.actionManagerLfoTargetSpreadInput instanceof HTMLInputElement) {
    const canSpreadPhase = canConfigureLfoTargets && selectedTargetScope === LFO_TARGET_SCOPE_GROUP;
    if (!canSpreadPhase) {
      setCheckboxCheckedIfIdle(els.actionManagerLfoTargetSpreadInput, false);
    }
    els.actionManagerLfoTargetSpreadInput.disabled = !canSpreadPhase;
  }

  const selectedTargetEntries = [];
  const selectedTargetIndex = Number.isInteger(state.selectedActionLfoTargetIndex)
    ? state.selectedActionLfoTargetIndex
    : null;
  if (selectedLfoGroup) {
    for (const entryIndex of selectedLfoGroup.entryIndices) {
      if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= selectedLfos.length) continue;
      const entry = selectedLfos[entryIndex] || {};
      const hasAssignedTarget = lfoHasAssignedTarget(entry);
      const shouldShowPlaceholder = selectedTargetIndex !== null && entryIndex === selectedTargetIndex;
      if (!hasAssignedTarget && !shouldShowPlaceholder) {
        continue;
      }
      const targetScope = normalizeLfoTargetScope(entry?.targetScope || entry?.target_scope || "");
      const targetId = targetScope === LFO_TARGET_SCOPE_GROUP
        ? String(entry.groupId || entry.group_id || "").trim()
        : String(entry.objectId || entry.object_id || "").trim();
      const parameter = String(entry.parameter || "").trim();
      selectedTargetEntries.push({
        entryIndex,
        lfo: entry,
        targetScope,
        objectId: targetId,
        parameter,
        targetLabel: lfoTargetLabel(entry) || "(unassigned)",
        mappingPhaseDeg: normalizePhaseDegrees(entry.mappingPhaseDeg, 0),
        depth: parseFiniteNumber(entry.depth, 0),
        offset: parseFiniteNumber(entry.offset, 0),
        targetType: lfoTargetTypeLabel(entry),
        phaseFlip: Boolean(entry.phaseFlip),
        targetEnabled: entry.targetEnabled !== false,
        distributePhaseOverMembers: Boolean(entry.distributePhaseOverMembers)
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
      const scopeTargetInput = selectedTargetEntry.targetScope || LFO_TARGET_SCOPE_OBJECT;
      if (els.actionManagerLfoTargetScopeInput) {
        setInputValueIfIdle(els.actionManagerLfoTargetScopeInput, scopeTargetInput);
      }
      const selectedObjectId = selectedTargetEntry.objectId;
      const hasSelectedObjectOption = Array.from(els.actionManagerLfoTargetObjectInput.options)
        .some((option) => String(option.value || "").trim() === selectedObjectId);
      if (hasSelectedObjectOption) {
        setInputValueIfIdle(els.actionManagerLfoTargetObjectInput, selectedObjectId);
      }
    }
    if (els.actionManagerLfoTargetParamInput && isLfoTargetParameter(selectedTargetEntry.parameter, selectedTargetEntry.targetScope || LFO_TARGET_SCOPE_OBJECT)) {
      setInputValueIfIdle(els.actionManagerLfoTargetParamInput, selectedTargetEntry.parameter);
    }
    if (els.actionManagerLfoTargetSpreadInput instanceof HTMLInputElement) {
      setCheckboxCheckedIfIdle(
        els.actionManagerLfoTargetSpreadInput,
        selectedTargetEntry.targetScope === LFO_TARGET_SCOPE_GROUP
          ? Boolean(selectedTargetEntry.distributePhaseOverMembers)
          : false
      );
    }
    if (els.actionManagerLfoTargetPhaseInput) {
      setInputValueIfIdle(els.actionManagerLfoTargetPhaseInput, String(selectedTargetEntry.mappingPhaseDeg));
    }
  }

  if (els.actionManagerLfoTargetsSummary) {
    if (!selectedAction) {
      els.actionManagerLfoTargetsSummary.textContent = "Select an action to edit targets.";
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
      const lfoToggleId = String(group.lfoId || "").trim();
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
            <button class="danger action-lfo-remove-btn" data-index="${index}" type="button">Delete</button>
          </div>
        </td>
      `;
      const toggleBtn = row.querySelector(".action-lfo-enabled-toggle");
      if (toggleBtn instanceof HTMLButtonElement) {
        toggleBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const enabledNow = String(toggleBtn.dataset.actionLfoToggleEnabled || "").toLowerCase() !== "false";
          void actionManagerToggleLfoEnabled(lfoToggleId || index, !enabledNow);
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
      row.innerHTML = '<td class="muted" colspan="9">Select an action to edit targets.</td>';
      els.actionManagerLfoTargetRows.appendChild(row);
    } else if (!hasSelectedLfo) {
      const row = document.createElement("tr");
      row.innerHTML = '<td class="muted" colspan="9">Select an LFO to view targets.</td>';
      els.actionManagerLfoTargetRows.appendChild(row);
    } else if (!selectedTargetEntries.length) {
      const row = document.createElement("tr");
      row.innerHTML = '<td class="muted" colspan="9">No targets assigned.</td>';
      els.actionManagerLfoTargetRows.appendChild(row);
    } else {
      for (const targetEntry of selectedTargetEntries) {
        const row = document.createElement("tr");
        row.dataset.lfoTargetIndex = String(targetEntry.entryIndex);
        row.tabIndex = 0;
        if (targetEntry.entryIndex === state.selectedActionLfoTargetIndex) {
          row.classList.add("is-selected");
        }
        if (targetEntry.targetEnabled === false) {
          row.classList.add("is-disabled");
        }
        const depthPercent = clampValue(parseFiniteNumber(targetEntry.depth, 0), [0, 100]);
        const phaseDegrees = normalizePhaseDegrees(targetEntry.mappingPhaseDeg, 0);
        const isPhaseFlipped = Boolean(targetEntry.phaseFlip);
        row.innerHTML = `
          <td class="action-lfo-target-enabled-cell">
            <button
              type="button"
              class="action-enabled-toggle action-lfo-target-enabled-toggle ${targetEntry.targetEnabled ? "is-on" : ""}"
              data-action-lfo-target-toggle-enabled="${targetEntry.targetEnabled ? "true" : "false"}"
              aria-pressed="${targetEntry.targetEnabled ? "true" : "false"}"
            >${targetEntry.targetEnabled ? "On" : "Off"}</button>
          </td>
          <td>${escapeHtml(targetEntry.targetType || lfoTargetTypeLabel(targetEntry.lfo))}</td>
          <td>${escapeHtml(targetEntry.targetLabel)}</td>
          <td>
            <div class="action-lfo-target-rotary-cell">
              <input
                class="action-lfo-target-phase-input action-lfo-target-range-input"
                type="range"
                min="0"
                max="359"
                step="1"
                value="${escapeHtml(String(Math.round(phaseDegrees)))}"
                data-lfo-target-index="${targetEntry.entryIndex}"
                aria-label="Mapping phase for ${escapeHtml(targetEntry.targetLabel)}"
              />
              <span class="action-lfo-target-value action-lfo-target-phase-value">${escapeHtml(String(Math.round(phaseDegrees)))}&deg;</span>
            </div>
          </td>
          <td>
            <div class="action-lfo-target-rotary-cell">
              <input
                class="action-lfo-target-depth-input action-lfo-target-range-input"
                type="range"
                min="0"
                max="100"
                step="1"
                value="${escapeHtml(String(Math.round(depthPercent)))}"
                data-lfo-target-index="${targetEntry.entryIndex}"
                aria-label="Depth for ${escapeHtml(targetEntry.targetLabel)}"
              />
              <span class="action-lfo-target-value action-lfo-target-depth-value">${escapeHtml(String(Math.round(depthPercent)))}%</span>
            </div>
          </td>
          <td>
            <input
              class="action-lfo-target-offset-input"
              type="number"
              step="0.1"
              value="${escapeHtml(String(targetEntry.offset))}"
              data-lfo-target-index="${targetEntry.entryIndex}"
              aria-label="Offset for ${escapeHtml(targetEntry.targetLabel)}"
            />
          </td>
          <td class="action-lfo-target-polarity-cell">
            <button
              type="button"
              class="action-enabled-toggle action-lfo-target-polarity-toggle ${isPhaseFlipped ? "is-on" : ""}"
              data-action-lfo-target-phase-flip="${isPhaseFlipped ? "true" : "false"}"
              aria-pressed="${isPhaseFlipped ? "true" : "false"}"
            >${isPhaseFlipped ? "Flipped" : "Normal"}</button>
          </td>
          <td class="action-lfo-target-phase-spread-cell">
            <button
              type="button"
              class="action-enabled-toggle action-lfo-target-spread-toggle ${targetEntry.distributePhaseOverMembers ? "is-on" : ""}"
              data-action-lfo-target-spread="${targetEntry.distributePhaseOverMembers ? "true" : "false"}"
              aria-pressed="${targetEntry.distributePhaseOverMembers ? "true" : "false"}"
              ${targetEntry.targetScope === LFO_TARGET_SCOPE_GROUP ? "" : "disabled"}
            >${targetEntry.targetScope === LFO_TARGET_SCOPE_GROUP ? (targetEntry.distributePhaseOverMembers ? "On" : "Off") : "-"}</button>
          </td>
          <td class="action-manager-row-actions-cell">
            <div class="action-manager-row-actions">
              <button type="button" data-action-lfo-target-command="update" data-index="${targetEntry.entryIndex}">Save</button>
              <button class="danger" type="button" data-action-lfo-target-command="remove" data-index="${targetEntry.entryIndex}">Delete</button>
            </div>
          </td>
        `;

        const phaseInput = row.querySelector(".action-lfo-target-phase-input");
        const depthInput = row.querySelector(".action-lfo-target-depth-input");
        const offsetInput = row.querySelector(".action-lfo-target-offset-input");
        const phaseValueLabel = row.querySelector(".action-lfo-target-phase-value");
        const depthValueLabel = row.querySelector(".action-lfo-target-depth-value");
        const polarityToggle = row.querySelector(".action-lfo-target-polarity-toggle");
        const spreadToggle = row.querySelector(".action-lfo-target-spread-toggle");
        const enabledToggle = row.querySelector(".action-lfo-target-enabled-toggle");
        const saveBtn = row.querySelector('button[data-action-lfo-target-command="update"]');
        const removeBtn = row.querySelector('button[data-action-lfo-target-command="remove"]');
        const entryIndex = targetEntry.entryIndex;
        let autoSaveTimerId = null;

        const saveTargetConfig = () => {
          const phaseValue = phaseInput instanceof HTMLInputElement
            ? normalizePhaseDegrees(phaseInput.value, targetEntry.mappingPhaseDeg)
            : targetEntry.mappingPhaseDeg;
          const depthValue = depthInput instanceof HTMLInputElement
            ? clampValue(parseFiniteNumber(depthInput.value, targetEntry.depth), [0, 100])
            : targetEntry.depth;
          const offsetValue = offsetInput instanceof HTMLInputElement
            ? parseFiniteNumber(offsetInput.value, targetEntry.offset)
            : targetEntry.offset;
          const phaseFlipValue = polarityToggle instanceof HTMLButtonElement
            ? String(polarityToggle.dataset.actionLfoTargetPhaseFlip || "").toLowerCase() === "true"
            : Boolean(targetEntry.phaseFlip);
          const targetEnabledValue = enabledToggle instanceof HTMLButtonElement
            ? String(enabledToggle.dataset.actionLfoTargetToggleEnabled || "").toLowerCase() !== "false"
            : targetEntry.targetEnabled;
          const phaseSpreadValue = spreadToggle instanceof HTMLButtonElement
            ? String(spreadToggle.dataset.actionLfoTargetSpread || "").toLowerCase() === "true"
            : Boolean(targetEntry.distributePhaseOverMembers);
          void actionManagerUpdateLfoTargetConfig(entryIndex, {
            mappingPhaseDeg: phaseValue,
            depth: depthValue,
            offset: offsetValue,
            phaseFlip: phaseFlipValue,
            targetEnabled: targetEnabledValue,
            distributePhaseOverMembers: targetEntry.targetScope === LFO_TARGET_SCOPE_GROUP ? phaseSpreadValue : false
          });
        };
        const scheduleTargetSave = (delayMs = 180) => {
          if (autoSaveTimerId !== null) {
            clearTimeout(autoSaveTimerId);
          }
          autoSaveTimerId = setTimeout(() => {
            autoSaveTimerId = null;
            saveTargetConfig();
          }, Math.max(0, Math.round(parseFiniteNumber(delayMs, 0))));
        };

        const syncPhaseLabel = () => {
          if (!(phaseInput instanceof HTMLInputElement) || !(phaseValueLabel instanceof HTMLElement)) return;
          const normalizedPhase = Math.round(normalizePhaseDegrees(phaseInput.value, targetEntry.mappingPhaseDeg));
          phaseInput.value = String(normalizedPhase);
          phaseValueLabel.textContent = `${normalizedPhase}°`;
        };

        const syncDepthLabel = () => {
          if (!(depthInput instanceof HTMLInputElement) || !(depthValueLabel instanceof HTMLElement)) return;
          const normalizedDepth = clampValue(parseFiniteNumber(depthInput.value, targetEntry.depth), [0, 100]);
          const roundedDepth = Math.round(normalizedDepth);
          depthInput.value = String(roundedDepth);
          depthValueLabel.textContent = `${roundedDepth}%`;
        };

        const setTargetPolarityToggle = (phaseFlip) => {
          if (!(polarityToggle instanceof HTMLButtonElement)) return;
          const isOn = Boolean(phaseFlip);
          polarityToggle.dataset.actionLfoTargetPhaseFlip = isOn ? "true" : "false";
          polarityToggle.classList.toggle("is-on", isOn);
          polarityToggle.setAttribute("aria-pressed", isOn ? "true" : "false");
          polarityToggle.textContent = isOn ? "Flipped" : "Normal";
        };

        const setTargetEnabledToggle = (enabled) => {
          if (!(enabledToggle instanceof HTMLButtonElement)) return;
          const nextEnabled = Boolean(enabled);
          enabledToggle.dataset.actionLfoTargetToggleEnabled = nextEnabled ? "true" : "false";
          enabledToggle.classList.toggle("is-on", nextEnabled);
          enabledToggle.setAttribute("aria-pressed", nextEnabled ? "true" : "false");
          enabledToggle.textContent = nextEnabled ? "On" : "Off";
        };
        const setTargetSpreadToggle = (enabled) => {
          if (!(spreadToggle instanceof HTMLButtonElement)) return;
          const canSpread = targetEntry.targetScope === LFO_TARGET_SCOPE_GROUP;
          const nextEnabled = canSpread && Boolean(enabled);
          spreadToggle.dataset.actionLfoTargetSpread = nextEnabled ? "true" : "false";
          spreadToggle.classList.toggle("is-on", nextEnabled);
          spreadToggle.setAttribute("aria-pressed", nextEnabled ? "true" : "false");
          spreadToggle.textContent = canSpread ? (nextEnabled ? "On" : "Off") : "-";
          spreadToggle.disabled = !canSpread;
        };

        syncPhaseLabel();
        syncDepthLabel();
        setTargetPolarityToggle(targetEntry.phaseFlip);
        setTargetEnabledToggle(targetEntry.targetEnabled);
        setTargetSpreadToggle(targetEntry.distributePhaseOverMembers);

        if (phaseInput instanceof HTMLInputElement) {
          phaseInput.addEventListener("input", (event) => {
            event.stopPropagation();
            syncPhaseLabel();
            scheduleTargetSave();
          });
          phaseInput.addEventListener("change", (event) => {
            event.stopPropagation();
            saveTargetConfig();
          });
        }
        if (depthInput instanceof HTMLInputElement) {
          depthInput.addEventListener("input", (event) => {
            event.stopPropagation();
            syncDepthLabel();
            scheduleTargetSave();
          });
          depthInput.addEventListener("change", (event) => {
            event.stopPropagation();
            saveTargetConfig();
          });
        }
        if (offsetInput instanceof HTMLInputElement) {
          offsetInput.addEventListener("input", (event) => {
            event.stopPropagation();
            scheduleTargetSave();
          });
          offsetInput.addEventListener("change", (event) => {
            event.stopPropagation();
            saveTargetConfig();
          });
          offsetInput.addEventListener("blur", () => {
            saveTargetConfig();
          });
          offsetInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            saveTargetConfig();
          });
        }
        if (polarityToggle instanceof HTMLButtonElement) {
          polarityToggle.addEventListener("click", (event) => {
            event.stopPropagation();
            const isFlippedNow = String(polarityToggle.dataset.actionLfoTargetPhaseFlip || "").toLowerCase() === "true";
            setTargetPolarityToggle(!isFlippedNow);
            saveTargetConfig();
          });
        }
        if (enabledToggle instanceof HTMLButtonElement) {
          enabledToggle.addEventListener("click", (event) => {
            event.stopPropagation();
            const enabledNow = String(enabledToggle.dataset.actionLfoTargetToggleEnabled || "").toLowerCase() !== "false";
            setTargetEnabledToggle(!enabledNow);
            void actionManagerToggleLfoTargetEnabled(entryIndex, !enabledNow);
          });
        }
        if (spreadToggle instanceof HTMLButtonElement) {
          spreadToggle.addEventListener("click", (event) => {
            event.stopPropagation();
            if (targetEntry.targetScope !== LFO_TARGET_SCOPE_GROUP) return;
            const spreadNow = String(spreadToggle.dataset.actionLfoTargetSpread || "").toLowerCase() === "true";
            setTargetSpreadToggle(!spreadNow);
            saveTargetConfig();
          });
        }
        if (saveBtn instanceof HTMLButtonElement) {
          saveBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            saveTargetConfig();
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
  newOpt.textContent = "Add group...";
  if (!state.selectedGroupId) newOpt.selected = true;
  els.managerGroupSelect.appendChild(newOpt);

  for (const group of groups) {
    const option = document.createElement("option");
    const groupId = String(group.groupId || "").trim();
    const groupName = String(group.name || groupId).trim() || groupId;
    option.value = groupId;
    option.textContent = `${groupName} (${group.objectIds.length})${isGroupEnabled(group) ? "" : " [off]"}`;
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
    setTextIfChanged(els.managerGroupSummary, `Group members: ${selectedGroup.objectIds.length}. Current selection: ${selectedObjectIds.length}.`);
  } else {
    const suggestedId = uniqueGroupId(suggestGroupBaseFromSelection(selectedObjectIds));
    state.draftSuggestedIds.objectGroup = suggestedId;
    const suggestedColor = suggestGroupColorFromSelection(selectedObjectIds);
    if (!String(els.managerGroupId.value || "").trim()) {
      setInputValueIfIdle(els.managerGroupId, suggestedId);
    }
    if (!selectedLinkParamsFromInputs().length) {
      applyLinkParamsToInputs(["x", "y", "z", "color"]);
    }
    setInputValueIfIdle(els.managerGroupColor, suggestedColor);
    if (!String(els.managerGroupName.value || "").trim()) {
      const groupName = humanizeId(String(els.managerGroupId.value || suggestedId));
      setInputValueIfIdle(els.managerGroupName, groupName || String(els.managerGroupId.value || suggestedId));
    }
    setTextIfChanged(els.managerGroupSummary, `${groups.length} group${groups.length === 1 ? "" : "s"}. Choose a group to edit.`);
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

function normalizedStringSet(values) {
  const unique = new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  return [...unique].sort((a, b) => a.localeCompare(b));
}

function sameNormalizedStringSet(a, b) {
  const left = normalizedStringSet(a);
  const right = normalizedStringSet(b);
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function selectedGroupManagerLinkParams() {
  return selectedDataParamsFromInputs(els.groupManagerEditLinkInputs);
}

function applyGroupManagerLinkParams(linkParams) {
  applyDataParamsToInputs(els.groupManagerEditLinkInputs, linkParams);
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
  els.groupManagerEditDeleteBtn.disabled = !hasGroup;
  for (const input of els.groupManagerEditLinkInputs) {
    input.disabled = !hasGroup;
  }

  if (!hasGroup) {
    clearGroupManagerDraft();
    els.groupManagerEditSelect.innerHTML = '<option value="">No groups</option>';
    setInputValueIfIdle(els.groupManagerEditName, "");
    setInputValueIfIdle(els.groupManagerEditColor, suggestGroupColorFromSelection(selectedObjectTargets()));
    applyGroupManagerLinkParams(["x", "y", "z", "color"]);
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
      const groupId = String(group.groupId || "").trim();
      const groupName = String(group.name || groupId).trim() || groupId;
      option.value = groupId;
      option.textContent = `${groupName} (${Array.isArray(group.objectIds) ? group.objectIds.length : 0})`;
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
    row.innerHTML = '<td class="muted" colspan="7">No groups added yet.</td>';
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
      <td>${escapeHtml(groupName)}</td>
      <td>${escapeHtml(groupId)}</td>
      <td><span class="color-chip" style="background:${escapeHtml(groupColor)}"></span>${escapeHtml(groupColor)}</td>
      <td title="${escapeHtml(memberSummary.full)}">${escapeHtml(memberSummary.preview)}</td>
      <td title="${escapeHtml(linkSummary.full)}">${escapeHtml(linkSummary.preview)}</td>
      <td class="group-manager-actions action-manager-row-actions-cell">
        <div class="action-manager-row-actions">
          <button class="group-manager-delete-btn danger" type="button">Delete</button>
        </div>
      </td>
    `;
    els.groupManagerRows.appendChild(row);
  }

  renderGroupManagerEditor(getSelectedGroup(), objects);
}

function selectGroupManagerGroup(nextGroupId) {
  const normalizedNextGroupId = String(nextGroupId || "").trim() || null;
  const currentGroupId = String(state.selectedGroupId || "").trim() || null;
  if (normalizedNextGroupId === currentGroupId) {
    state.selectedGroupId = normalizedNextGroupId;
    renderGroupManager();
    return;
  }
  cancelGroupManagerAutoSaveTimer();
  if (currentGroupId) {
    void groupManagerSaveEditor({ auto: true, expectedGroupId: currentGroupId });
  }
  state.selectedGroupId = normalizedNextGroupId;
  renderGroupManager();
}

function renderManager() {
  if (state.currentPage !== "object-manager") return;
  syncSelectedIdsWithObjects();
  const objects = getObjects();
  const groups = getObjectGroups();
  const allGroup = getVirtualAllGroup();
  const allMembers = new Set(allGroup.objectIds);
  // Pre-index group metadata so each table row can render in O(1) lookups.
  const groupColorByObjectId = buildEffectiveGroupColorMap(groups);
  const groupLabelsByObjectId = new Map();
  for (const group of groups) {
    const groupLabel = `${group.groupId}${isGroupEnabled(group) ? "" : " (off)"}`;
    const memberIds = Array.isArray(group.objectIds) ? group.objectIds : [];
    for (const memberId of memberIds) {
      const targetId = String(memberId || "").trim();
      if (!targetId) continue;
      if (!groupLabelsByObjectId.has(targetId)) {
        groupLabelsByObjectId.set(targetId, []);
      }
      groupLabelsByObjectId.get(targetId).push(groupLabel);
    }
  }
  const selectedIds = selectedObjectTargets();
  const selectedObjectIdSet = new Set(selectedIds);
  const managerStructureKey = [
    `groups-enabled:${areGroupsEnabled() ? "1" : "0"}`,
    `group-select-enabled:${state.groupSelectEnabled ? "1" : "0"}`,
    `selected:${String(state.selectedObjectId || "")}`,
    `selected-list:${selectedIds.join(",")}`,
    `selected-group:${String(state.selectedGroupId || "")}`,
    `objects:${objects.map((obj) => (
      `${String(obj.objectId || "").trim()}|${String(obj.name || "")}|${String(obj.type || "")}|${String(obj.color || "")}|${Boolean(obj.excludeFromAll) ? 1 : 0}`
    )).join(";")}`,
    `groups:${groups.map((group) => (
      `${String(group.groupId || "").trim()}|${String(group.name || "")}|${String(group.color || "")}|${isGroupEnabled(group) ? 1 : 0}|${(Array.isArray(group.linkParams) ? group.linkParams : []).map((param) => String(param || "").trim()).join(",")}|${(Array.isArray(group.objectIds) ? group.objectIds : []).map((memberId) => String(memberId || "").trim()).join(",")}`
    )).join(";")}`
  ].join("\n");
  const managerPositionKey = objects
    .map((obj) => `${String(obj.objectId || "").trim()}|${Number(obj.x)}|${Number(obj.y)}|${Number(obj.z)}`)
    .join(";");
  if (state.managerStructureRenderKey === managerStructureKey) {
    if (state.managerPositionRenderKey !== managerPositionKey) {
      state.managerPositionRenderKey = managerPositionKey;
      updateManagerObjectPositionCells(objects);
    }
    return;
  }
  state.managerStructureRenderKey = managerStructureKey;
  state.managerPositionRenderKey = managerPositionKey;
  if (els.managerGroupSelectToggle instanceof HTMLInputElement) {
    els.managerGroupSelectToggle.checked = false;
    els.managerGroupSelectToggle.disabled = true;
    els.managerGroupSelectToggle.title = "Group Select is disabled in Object Manager. Each row selects one object.";
  }
  if (!String(els.managerAddName.value || "").trim()) {
    setInputValueIfIdle(
      els.managerAddName,
      suggestObjectNameFromType(els.managerAddType.value || DEFAULT_OBJECT_TYPE)
    );
  }
  setTextIfChanged(els.managerObjectCount, `${objects.length} object${objects.length === 1 ? "" : "s"}`);

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
    const rowIsSelected = selectedObjectIdSet.has(obj.objectId);
    if (rowIsSelected) row.classList.add("is-selected");
    if (obj.objectId === state.selectedObjectId) row.classList.add("is-primary");
    row.dataset.objectId = obj.objectId;
    row.tabIndex = 0;

    const positionText = managerPositionText(obj);
    const objectColor = normalizeHexColor(obj.color, DEFAULT_OBJECT_COLOR);
    const groupColor = groupColorByObjectId.get(obj.objectId) || null;
    const color = groupColor || objectColor;
    const colorSuffix = groupColor && groupColor !== objectColor ? " (group)" : "";
    const groupLabels = [...(groupLabelsByObjectId.get(obj.objectId) || [])];
    if (allMembers.has(obj.objectId)) {
      groupLabels.unshift(VIRTUAL_ALL_GROUP_NAME);
    }
    const groupText = groupLabels.length ? groupLabels.join(", ") : "-";
    const excludeFromAll = Boolean(obj.excludeFromAll);
    const objectName = String(obj.name || "").trim() || humanizeId(obj.objectId) || obj.objectId;

    row.innerHTML = `
      <td>${escapeHtml(objectName)}</td>
      <td>${escapeHtml(obj.objectId)}</td>
      <td>${escapeHtml(String(obj.type || DEFAULT_OBJECT_TYPE))}</td>
      <td><span class="color-chip" style="background:${escapeHtml(color)}"></span>${escapeHtml(color)}${escapeHtml(colorSuffix)}</td>
      <td class="position-cell">${escapeHtml(positionText)}</td>
      <td class="groups-cell">${escapeHtml(groupText)}</td>
      <td class="all-exclude-cell"><input class="row-exclude-all-toggle" type="checkbox" ${excludeFromAll ? "checked" : ""} aria-label="Exclude ${escapeHtml(obj.objectId)} from All" /></td>
      <td class="action-manager-row-actions-cell">
        <div class="action-manager-row-actions">
          <button class="danger manager-object-remove-btn" type="button" aria-label="Delete ${escapeHtml(obj.objectId)}">Delete</button>
        </div>
      </td>
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

    const removeBtn = row.querySelector(".manager-object-remove-btn");
    if (removeBtn instanceof HTMLButtonElement) {
      removeBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const objectId = String(obj.objectId || "").trim();
        if (!objectId) return;
        try {
          await api(`/api/object/${encodeURIComponent(objectId)}/remove`, "POST", {});
          const nextSelection = selectedObjectTargets().filter((selectedId) => selectedId !== objectId);
          setSelection(nextSelection);
          addLog(`object delete -> ${objectId}`);
          await refreshStatus();
        } catch (error) {
          addLog(`delete failed: ${error.message}`);
        }
      });
    }

    row.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("button, input, select, textarea, a")) {
        return;
      }
      const targetId = String(obj.objectId || "").trim();
      cancelManagerEditAutoApplyTimers();
      setSingleSelection(targetId);
      renderAll();
    });

    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("button, input, select, textarea, a")) return;
      event.preventDefault();
      const targetId = String(obj.objectId || "").trim();
      cancelManagerEditAutoApplyTimers();
      setSingleSelection(targetId);
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
  if (state.currentPage === "panner") {
    renderObjectSelect();
    renderInspector();
    renderGroupsPanel();
    syncCameraInputs();
    renderPanner();
    return;
  }
  if (state.currentPage === "object-manager") {
    renderManager();
    return;
  }
  if (state.currentPage === "group-manager") {
    renderGroupManager();
    return;
  }
  if (state.currentPage === "control") {
    renderControl();
    return;
  }
  if (state.currentPage === "configuration") {
    renderConfiguration();
    return;
  }
  if (state.currentPage === "action-manager" || state.currentPage === "action-group-manager" || state.currentPage === "modulation-manager") {
    renderActionManager();
  }
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
  const patchOptions = normalizeObjectPatchOptions(options);
  const normalizedObjectId = String(objectId || "").trim();
  if (!normalizedObjectId) return;
  const previousSeq = Number(state.objectUpdateSeqByObjectId[normalizedObjectId] || 0);
  const clientUpdateSeq = previousSeq + 1;
  state.objectUpdateSeqByObjectId[normalizedObjectId] = clientUpdateSeq;
  try {
    await api(`/api/object/${encodeURIComponent(normalizedObjectId)}`, "POST", {
      ...patch,
      propagateGroupLinks: patchOptions.propagateGroupLinks,
      clientUpdateSessionId: state.objectUpdateSessionId,
      clientUpdateSeq,
      lfoCenterMode: patchOptions.lfoCenterMode,
      lfoCenterGestureId: patchOptions.lfoCenterGestureId,
      includeStatus: false
    });
  } catch (error) {
    addLog(`object update failed (${normalizedObjectId}): ${error.message}`);
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
  state.dragGestureId = (Number(state.dragGestureId || 0) + 1) % 1000000000;
  if (state.dragGestureId <= 0) {
    state.dragGestureId = 1;
  }
  state.dragPatchInFlightByObjectId = {};
  state.dragQueuedPatchByObjectId = {};
  state.dragQueuedOptionsByObjectId = {};
  state.dragLastTargetPatchByObjectId = {};
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

function mergeDragPatchOptions(currentOptions, nextOptions) {
  const current = normalizeObjectPatchOptions(currentOptions);
  const next = normalizeObjectPatchOptions(nextOptions);
  return {
    // If any write disables group-link propagation, keep it disabled.
    propagateGroupLinks: current.propagateGroupLinks && next.propagateGroupLinks,
    // If any write is center-mode, keep it enabled.
    lfoCenterMode: current.lfoCenterMode || next.lfoCenterMode,
    lfoCenterGestureId: next.lfoCenterGestureId || current.lfoCenterGestureId
  };
}

function flushQueuedDragPatch(objectId) {
  const normalizedObjectId = String(objectId || "").trim();
  if (!normalizedObjectId) return;
  if (state.dragPatchInFlightByObjectId[normalizedObjectId]) return;
  const queuedPatch = state.dragQueuedPatchByObjectId[normalizedObjectId];
  if (!queuedPatch || typeof queuedPatch !== "object") return;
  const queuedOptions = state.dragQueuedOptionsByObjectId[normalizedObjectId];
  delete state.dragQueuedPatchByObjectId[normalizedObjectId];
  delete state.dragQueuedOptionsByObjectId[normalizedObjectId];
  state.dragPatchInFlightByObjectId[normalizedObjectId] = true;
  void pushObjectPatch(normalizedObjectId, queuedPatch, queuedOptions).finally(() => {
    state.dragPatchInFlightByObjectId[normalizedObjectId] = false;
    flushQueuedDragPatch(normalizedObjectId);
  });
}

function queueDragPatch(objectId, patch, options = {}) {
  const normalizedObjectId = String(objectId || "").trim();
  if (!normalizedObjectId || !patch || typeof patch !== "object") return;
  const existingPatch = state.dragQueuedPatchByObjectId[normalizedObjectId];
  state.dragQueuedPatchByObjectId[normalizedObjectId] = {
    ...(existingPatch && typeof existingPatch === "object" ? existingPatch : {}),
    ...patch
  };
  const existingOptions = state.dragQueuedOptionsByObjectId[normalizedObjectId];
  state.dragQueuedOptionsByObjectId[normalizedObjectId] = mergeDragPatchOptions(existingOptions, options);
  flushQueuedDragPatch(normalizedObjectId);
}

function waitForDragPatchIdle(objectId, timeoutMs = 1200) {
  const normalizedObjectId = String(objectId || "").trim();
  if (!normalizedObjectId) return Promise.resolve();
  const startMs = Date.now();
  return new Promise((resolve) => {
    const poll = () => {
      const hasQueued = Boolean(state.dragQueuedPatchByObjectId[normalizedObjectId]);
      const inFlight = Boolean(state.dragPatchInFlightByObjectId[normalizedObjectId]);
      if (!hasQueued && !inFlight) {
        resolve();
        return;
      }
      if ((Date.now() - startMs) >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(poll, 12);
    };
    poll();
  });
}

function maybeSendDragBatch(patchByObjectId, options = {}) {
  const patchOptions = normalizeObjectPatchOptions(options);
  const now = Date.now();
  if (now - state.lastDragSendMs >= DRAG_PATCH_SEND_INTERVAL_MS) {
    state.lastDragSendMs = now;
    for (const [objectId, patch] of Object.entries(patchByObjectId)) {
      queueDragPatch(objectId, patch, patchOptions);
    }
  }
}

// Normalize drag/object patch flags once so every call site sends the same payload shape.
function normalizeObjectPatchOptions(options) {
  const source = options && typeof options === "object" ? options : {};
  return {
    propagateGroupLinks: source.propagateGroupLinks !== false,
    lfoCenterMode: Boolean(source.lfoCenterMode),
    lfoCenterGestureId: String(source.lfoCenterGestureId || "").trim()
  };
}

function dragPatchValue(lastTargetPatch, object, key) {
  if (Object.prototype.hasOwnProperty.call(lastTargetPatch, key)) {
    return Number(lastTargetPatch[key]);
  }
  return Number(object[key]);
}

async function finalizeObjectDrag() {
  if (!state.draggingObjectIds.length) return;
  const targetIds = [...state.draggingObjectIds];
  for (const objectId of targetIds) {
    const obj = getObjectById(objectId);
    if (!obj) continue;
    const lastTargetPatch = state.dragLastTargetPatchByObjectId && typeof state.dragLastTargetPatchByObjectId === "object"
      ? (state.dragLastTargetPatchByObjectId[objectId] || {})
      : {};
    queueDragPatch(
      objectId,
      {
        x: dragPatchValue(lastTargetPatch, obj, "x"),
        y: dragPatchValue(lastTargetPatch, obj, "y"),
        z: dragPatchValue(lastTargetPatch, obj, "z")
      },
      {
        propagateGroupLinks: false,
        lfoCenterMode: true,
        lfoCenterGestureId: String(state.dragGestureId || "")
      }
    );
  }
  await Promise.all(targetIds.map((objectId) => waitForDragPatchIdle(objectId)));
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
  state.dragPatchInFlightByObjectId = {};
  state.dragQueuedPatchByObjectId = {};
  state.dragQueuedOptionsByObjectId = {};
  state.dragLastTargetPatchByObjectId = {};
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
    const objectNameInput = String(els.managerAddName.value || "").trim();
    const objectType = String(els.managerAddType.value || DEFAULT_OBJECT_TYPE).trim() || DEFAULT_OBJECT_TYPE;
    const objectId = autoObjectId("", objectType);
    const objectName = objectNameInput || humanizeId(objectId) || objectId;
    const objectColor = normalizeHexColor(els.managerAddColor.value, DEFAULT_OBJECT_COLOR);
    await api("/api/object/add", "POST", {
      objectId,
      name: objectName,
      type: objectType,
      color: objectColor
    });
    els.managerAddName.value = "";
    setSingleSelection(objectId);
    addLog(`object add -> ${objectName} (${objectId})`);
    await refreshStatus();
  } catch (error) {
    addLog(`object add failed: ${error.message}`);
  }
}

async function managerRenameObject(options = {}) {
  const { auto = false, expectedCurrentId = "" } = options;
  cancelManagerRenameAutoApplyTimer();
  try {
    const selectedIds = selectedObjectTargets();
    if (selectedIds.length !== 1) {
      if (!auto) {
        throw new Error("Rename requires exactly one selected object");
      }
      return false;
    }
    const currentId = selectedIds[0];
    if (!currentId) {
      if (!auto) {
        throw new Error("No object selected");
      }
      return false;
    }
    if (expectedCurrentId && String(expectedCurrentId || "").trim() !== String(currentId || "").trim()) {
      return false;
    }
    const rawNewObjectId = String(els.managerRenameInput.value || "").trim();
    if (!rawNewObjectId && auto) {
      return false;
    }
    const newObjectId = sanitizeObjectId(rawNewObjectId);
    if (newObjectId === currentId) {
      return false;
    }
    await api(`/api/object/${encodeURIComponent(currentId)}/rename`, "POST", { newObjectId });
    setSingleSelection(newObjectId);
    if (!auto) {
      addLog(`object rename -> ${currentId} to ${newObjectId}`);
    }
    await refreshStatus();
    return true;
  } catch (error) {
    if (!auto) {
      addLog(`object rename failed: ${error.message}`);
    }
    return false;
  }
}

async function managerSetType(options = {}) {
  const { auto = false, expectedObjectId = "" } = options;
  cancelManagerTypeAutoApplyTimer();
  try {
    const objectIds = selectedObjectTargets();
    if (!objectIds.length) {
      if (!auto) {
        throw new Error("No objects selected");
      }
      return false;
    }
    if (expectedObjectId) {
      if (objectIds.length !== 1 || String(objectIds[0] || "").trim() !== String(expectedObjectId || "").trim()) {
        return false;
      }
    }

    const rawType = String(els.managerTypeInput.value || "").trim();
    // During auto-save, skip blank intermediate text while the user is still typing.
    if (auto && !rawType) {
      return false;
    }
    const type = rawType || DEFAULT_OBJECT_TYPE;
    const objectsById = new Map(getObjects().map((obj) => [String(obj.objectId || "").trim(), obj]));
    const changedObjectIds = objectIds.filter((objectId) => {
      const currentObject = objectsById.get(objectId);
      const currentType = String(currentObject?.type || DEFAULT_OBJECT_TYPE).trim() || DEFAULT_OBJECT_TYPE;
      return currentType !== type;
    });
    if (!changedObjectIds.length) {
      return false;
    }

    await Promise.all(
      changedObjectIds.map((objectId) => api(`/api/object/${encodeURIComponent(objectId)}`, "POST", { type }))
    );
    if (!auto) {
      addLog(`object type set -> ${changedObjectIds.join(", ")} = ${type}`);
    }
    await refreshStatus();
    return true;
  } catch (error) {
    if (!auto) {
      addLog(`set type failed: ${error.message}`);
    }
    return false;
  }
}

async function managerSetColor(options = {}) {
  const { auto = false, expectedObjectId = "" } = options;
  cancelManagerColorAutoApplyTimer();
  try {
    const objectIds = selectedObjectTargets();
    if (!objectIds.length) {
      if (!auto) {
        throw new Error("No objects selected");
      }
      return false;
    }
    if (expectedObjectId) {
      if (objectIds.length !== 1 || String(objectIds[0] || "").trim() !== String(expectedObjectId || "").trim()) {
        return false;
      }
    }

    const color = normalizeHexColor(els.managerColorInput.value, DEFAULT_OBJECT_COLOR);
    const objectsById = new Map(getObjects().map((obj) => [String(obj.objectId || "").trim(), obj]));
    const changedObjectIds = objectIds.filter((objectId) => {
      const currentObject = objectsById.get(objectId);
      const currentColor = normalizeHexColor(currentObject?.color, DEFAULT_OBJECT_COLOR);
      return currentColor !== color;
    });
    if (!changedObjectIds.length) {
      return false;
    }

    await Promise.all(
      changedObjectIds.map((objectId) => api(`/api/object/${encodeURIComponent(objectId)}`, "POST", { color }))
    );
    if (!auto) {
      addLog(`object color set -> ${changedObjectIds.join(", ")} = ${color}`);
    }
    await refreshStatus();
    return true;
  } catch (error) {
    if (!auto) {
      addLog(`set color failed: ${error.message}`);
    }
    return false;
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
    addLog(`object delete -> ${objectIds.join(", ")}`);
    await refreshStatus();
  } catch (error) {
    addLog(`delete failed: ${error.message}`);
  }
}

async function managerClearAll() {
  if (!confirm("Delete all objects from current runtime state?")) {
    return;
  }
  try {
    await api("/api/object/clear", "POST", {});
    setSelection([]);
    addLog("object delete all -> all");
    await refreshStatus();
  } catch (error) {
    addLog(`delete failed: ${error.message}`);
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
    const suggestedGroupColor = suggestGroupColorFromSelection(selectedObjectIds);
    const selectedGroupColor = normalizeHexColor(selectedGroup?.color, DEFAULT_GROUP_COLOR);
    const inputGroupColor = normalizeHexColor(els.managerGroupColor.value, suggestedGroupColor);
    const groupColor = selectedGroup && inputGroupColor === selectedGroupColor
      ? suggestDistinctGroupColor([suggestedGroupColor, inputGroupColor])
      : inputGroupColor;
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
    cancelGroupManagerAutoSaveTimer();
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
    cancelGroupManagerAutoSaveTimer();
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
    const suggestedGroupColor = suggestGroupColorFromSelection(objectIds);
    const selectedGroupColor = normalizeHexColor(selectedGroup?.color, DEFAULT_GROUP_COLOR);
    const inputGroupColor = normalizeHexColor(els.groupManagerEditColor.value, suggestedGroupColor);
    const color = selectedGroup && inputGroupColor === selectedGroupColor
      ? suggestDistinctGroupColor([suggestedGroupColor, inputGroupColor])
      : inputGroupColor;
    const linkParams = selectedGroup ? selectedGroupManagerLinkParams() : ["x", "y", "z", "color"];

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

async function groupManagerSaveEditor(options = {}) {
  const { auto = false, expectedGroupId = "" } = options;
  const selectedGroup = getSelectedGroup();
  if (!selectedGroup) {
    if (!auto) {
      addLog("group update failed: No group selected");
    }
    return false;
  }
  const groupId = String(selectedGroup.groupId || "").trim();
  if (expectedGroupId && String(expectedGroupId || "").trim() !== groupId) {
    return false;
  }
  if (!groupId) {
    if (!auto) {
      addLog("group update failed: Invalid group ID");
    }
    return false;
  }

  try {
    const name = String(els.groupManagerEditName.value || groupId).trim() || groupId;
    const color = normalizeHexColor(els.groupManagerEditColor.value, DEFAULT_GROUP_COLOR);
    const linkParams = selectedGroupManagerLinkParams();
    const objectIds = selectedGroupManagerMemberIds();
    const currentName = String(selectedGroup.name || groupId).trim() || groupId;
    const currentColor = normalizeHexColor(selectedGroup.color, DEFAULT_GROUP_COLOR);
    const unchanged = name === currentName
      && color === currentColor
      && sameNormalizedStringSet(linkParams, selectedGroup.linkParams)
      && sameNormalizedStringSet(objectIds, selectedGroup.objectIds);
    if (auto && unchanged) {
      return false;
    }

    await api(`/api/groups/${encodeURIComponent(groupId)}/update`, "POST", {
      name,
      color,
      linkParams,
      objectIds
    });
    clearGroupManagerDraft();
    if (!auto) {
      addLog(`group updated -> ${groupId} (${objectIds.length} members)`);
    }
    await refreshStatus();
    return true;
  } catch (error) {
    if (!auto) {
      addLog(`group update failed (${groupId}): ${error.message}`);
    }
    return false;
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
    addLog(`show added -> ${showPath}`);
    await refreshStatus();
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("already exists")) {
      const confirmed = confirm(`Show file already exists at "${showPath}". Overwrite it?`);
      if (!confirmed) {
        addLog("add show cancelled");
        return;
      }
      try {
        await api("/api/show/new", "POST", { path: showPath, overwrite: true });
        state.selectedSceneId = null;
        addLog(`show overwritten -> ${showPath}`);
        await refreshStatus();
      } catch (overwriteError) {
        addLog(`add show failed: ${overwriteError.message}`);
      }
      return;
    }
    addLog(`add show failed: ${error.message}`);
  }
}

function setupHandlers() {
  if (els.themeToggleBtn instanceof HTMLButtonElement) {
    els.themeToggleBtn.addEventListener("click", () => {
      toggleTheme();
    });
  }

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

  els.viewControlBtn.addEventListener("click", () => {
    setPage("control");
  });

  els.viewConfigurationBtn.addEventListener("click", () => {
    setPage("configuration");
  });

  const configurationInputHandler = () => {
    captureConfigurationDraftFromInputs();
    renderConfiguration();
  };
  for (const input of configurationInputElements()) {
    input.addEventListener("input", configurationInputHandler);
    input.addEventListener("change", configurationInputHandler);
  }

  els.configSaveBtn.addEventListener("click", () => {
    void saveConfiguration();
  });

  els.configResetBtn.addEventListener("click", () => {
    resetConfigurationDraft();
  });

  if (els.streamdeckConfigRefreshBtn instanceof HTMLButtonElement) {
    els.streamdeckConfigRefreshBtn.addEventListener("click", () => {
      void refreshStreamdeckConfiguration({ force: true });
    });
  }

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
    cancelActionGroupAutoSaveTimer();
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

  if (els.actionManagerRuleTypeInput) {
    els.actionManagerRuleTypeInput.addEventListener("change", () => {
      updateActionRuleInputsState();
    });
  }

  if (els.actionManagerRuleModParamInput) {
    els.actionManagerRuleModParamInput.addEventListener("change", () => {
      const parameter = String(els.actionManagerRuleModParamInput.value || "depth").trim();
      const defaultValue = normalizeActionRuleModulationValue(parameter, 0, 0);
      setActionRuleModValueEditor(parameter, defaultValue);
    });
  }

  els.actionGroupManagerNameInput.addEventListener("input", () => {
    const nameValue = String(els.actionGroupManagerNameInput.value || "").trim();
    if (!nameValue) {
      scheduleActionGroupAutoSave();
      return;
    }

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
    scheduleActionGroupAutoSave();
  });

  els.actionGroupManagerOscTriggerInput.addEventListener("input", () => {
    scheduleActionGroupAutoSave();
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

  if (els.actionManagerLfoTargetScopeInput) {
    els.actionManagerLfoTargetScopeInput.addEventListener("change", () => {
      renderActionManager();
      void actionManagerUpdateSelectedLfoTargetFromInputs();
    });
  }

  if (els.actionManagerLfoTargetObjectInput) {
    els.actionManagerLfoTargetObjectInput.addEventListener("change", () => {
      void actionManagerUpdateSelectedLfoTargetFromInputs();
    });
  }

  if (els.actionManagerLfoTargetParamInput) {
    els.actionManagerLfoTargetParamInput.addEventListener("change", () => {
      void actionManagerUpdateSelectedLfoTargetFromInputs();
    });
  }

  if (els.actionManagerLfoTargetSpreadInput instanceof HTMLInputElement) {
    els.actionManagerLfoTargetSpreadInput.addEventListener("change", () => {
      void actionManagerUpdateSelectedLfoTargetFromInputs();
    });
  }

  if (els.actionManagerLfoTargetPhaseInput) {
    let targetPhaseAutoTimerId = null;
    const scheduleTargetPhaseAutoApply = (delayMs = 180) => {
      if (targetPhaseAutoTimerId !== null) {
        clearTimeout(targetPhaseAutoTimerId);
      }
      targetPhaseAutoTimerId = setTimeout(() => {
        targetPhaseAutoTimerId = null;
        void actionManagerUpdateSelectedLfoTargetFromInputs();
      }, Math.max(0, Math.round(parseFiniteNumber(delayMs, 0))));
    };
    els.actionManagerLfoTargetPhaseInput.addEventListener("input", () => {
      scheduleTargetPhaseAutoApply();
    });
    els.actionManagerLfoTargetPhaseInput.addEventListener("change", () => {
      void actionManagerUpdateSelectedLfoTargetFromInputs();
    });
    els.actionManagerLfoTargetPhaseInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void actionManagerUpdateSelectedLfoTargetFromInputs();
    });
  }

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

  if (els.managerGroupSelectToggle instanceof HTMLInputElement) {
    els.managerGroupSelectToggle.addEventListener("change", () => {
      state.groupSelectEnabled = Boolean(els.managerGroupSelectToggle.checked);
      if (state.groupSelectEnabled && state.selectedObjectIds.length) {
        setSelection(state.selectedObjectIds);
      }
      addLog(`object manager group select ${state.groupSelectEnabled ? "enabled" : "disabled"}`);
      renderAll();
    });
  }

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
    cancelManagerEditAutoApplyTimers();
    setSingleSelection(els.managerObjectSelect.value);
    renderAll();
  });

  els.managerAddBtn.addEventListener("click", () => {
    void managerAddObject();
  });

  els.managerAddType.addEventListener("input", () => {
    if (String(els.managerAddName.value || "").trim()) return;
    setInputValueIfIdle(
      els.managerAddName,
      suggestObjectNameFromType(els.managerAddType.value || DEFAULT_OBJECT_TYPE)
    );
  });

  els.managerRenameBtn.addEventListener("click", () => {
    void managerRenameObject();
  });

  els.managerRenameInput.addEventListener("input", () => {
    scheduleManagerRenameAutoApply();
  });

  els.managerRenameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void managerRenameObject();
  });

  els.managerTypeInput.addEventListener("input", () => {
    scheduleManagerTypeAutoApply();
  });

  els.managerTypeInput.addEventListener("change", () => {
    void managerSetType({ auto: true });
  });

  els.managerTypeInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void managerSetType();
  });

  els.managerTypeBtn.addEventListener("click", () => {
    void managerSetType();
  });

  els.managerColorInput.addEventListener("input", () => {
    scheduleManagerColorAutoApply();
  });

  els.managerColorInput.addEventListener("change", () => {
    void managerSetColor({ auto: true });
  });

  els.managerColorBtn.addEventListener("click", () => {
    void managerSetColor();
  });

  els.managerRemoveBtn.addEventListener("click", () => {
    cancelManagerEditAutoApplyTimers();
    void managerRemoveSelected();
  });

  els.managerClearBtn.addEventListener("click", () => {
    cancelManagerEditAutoApplyTimers();
    void managerClearAll();
  });

  els.managerGroupSelect.addEventListener("change", () => {
    selectGroupManagerGroup(els.managerGroupSelect.value || null);
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
    selectGroupManagerGroup(String(els.groupManagerEditSelect.value || "").trim() || null);
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
    scheduleGroupManagerAutoSave(100);
  });

  els.groupManagerEditName.addEventListener("input", () => {
    scheduleGroupManagerAutoSave();
  });

  els.groupManagerEditColor.addEventListener("input", () => {
    scheduleGroupManagerAutoSave();
  });

  els.groupManagerEditColor.addEventListener("change", () => {
    scheduleGroupManagerAutoSave(0);
  });

  for (const input of els.groupManagerEditLinkInputs) {
    input.addEventListener("change", () => {
      captureGroupManagerDraftFromEditor();
      renderGroupManagerDraftSummary();
      scheduleGroupManagerAutoSave(120);
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
      selectGroupManagerGroup(groupId);
      void setGroupEnabled(groupId, !enabledNow);
      return;
    }
    if (target.closest(".group-manager-delete-btn")) {
      void groupManagerDeleteById(groupId);
      return;
    }
    selectGroupManagerGroup(groupId);
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
    selectGroupManagerGroup(groupId);
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
    state.activePointerId = event.pointerId;
    state.lastPointer = pt;
    const hit = pickObject(pt);
    state.pointerDownHitObjectId = hit?.obj.objectId || null;

    if (event.altKey) {
      state.orbiting = true;
      state.selectionBox.active = false;
    } else if (hit && !event.metaKey) {
      if (!isObjectSelected(hit.obj.objectId)) {
        setSingleSelection(hit.obj.objectId);
      } else if (state.selectedObjectId !== hit.obj.objectId) {
        state.selectedObjectId = hit.obj.objectId;
      }
      state.selectionBox.active = false;
      state.orbiting = false;
      beginObjectDrag(hit.obj.objectId, pt, event.shiftKey, { singleObjectOnly: false });
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
        for (const objectId of state.draggingObjectIds) {
          const obj = getObjectById(objectId);
          if (!obj) continue;
          const relY = Number(state.draggingRelativeY[objectId] || 0);
          const nextY = clampValue(nextAnchorY + relY, LIMITS.y);
          patchByObjectId[objectId] = { y: nextY };
        }
        for (const [objectId, patch] of Object.entries(patchByObjectId)) {
          const existing = state.dragLastTargetPatchByObjectId[objectId];
          state.dragLastTargetPatchByObjectId[objectId] = {
            ...(existing && typeof existing === "object" ? existing : {}),
            ...patch
          };
        }
        maybeSendDragBatch(patchByObjectId, {
          propagateGroupLinks: false,
          lfoCenterMode: true,
          lfoCenterGestureId: String(state.dragGestureId || "")
        });
      } else {
        const camera = getCameraBasis();
        const ray = screenRay(camera, pt.x, pt.y);
        const hitPoint = intersectRayPlaneY(ray, state.draggingPlaneY);
        if (hitPoint) {
          const nextAnchorX = clampValue(hitPoint.x + state.draggingOffsetXZ.x, LIMITS.x);
          const nextAnchorZ = clampValue(hitPoint.z + state.draggingOffsetXZ.z, LIMITS.z);
          const patchByObjectId = {};
          for (const objectId of state.draggingObjectIds) {
            const obj = getObjectById(objectId);
            if (!obj) continue;
            const relXZ = state.draggingRelativeXZ[objectId] || { x: 0, z: 0 };
            const nextX = clampValue(nextAnchorX + Number(relXZ.x || 0), LIMITS.x);
            const nextZ = clampValue(nextAnchorZ + Number(relXZ.z || 0), LIMITS.z);
            patchByObjectId[objectId] = { x: nextX, z: nextZ };
          }
          for (const [objectId, patch] of Object.entries(patchByObjectId)) {
            const existing = state.dragLastTargetPatchByObjectId[objectId];
            state.dragLastTargetPatchByObjectId[objectId] = {
              ...(existing && typeof existing === "object" ? existing : {}),
              ...patch
            };
          }
          maybeSendDragBatch(patchByObjectId, {
            propagateGroupLinks: false,
            lfoCenterMode: true,
            lfoCenterGestureId: String(state.dragGestureId || "")
          });
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
      const selectionDragDistance = Math.hypot(
        state.selectionBox.currentX - state.selectionBox.startX,
        state.selectionBox.currentY - state.selectionBox.startY
      );

      if (event.metaKey && state.pointerDownHitObjectId && selectionDragDistance > 3) {
        state.selectionBox.active = false;
        beginObjectDrag(state.pointerDownHitObjectId, pt, event.shiftKey, { singleObjectOnly: true });
        renderAll();
        state.lastPointer = pt;
        return;
      }

      if (selectionDragDistance > 3) {
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
  applyTheme(resolveInitialTheme(), { persist: false });
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
