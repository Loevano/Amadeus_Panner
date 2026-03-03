import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dgram from "node:dgram";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const UI_ROOT = path.join(PROJECT_ROOT, "apps/ui/public");

const CONFIG = {
  mode: process.env.MODE || "program",
  host: process.env.HOST || "0.0.0.0",
  httpPort: Number.parseInt(process.env.HTTP_PORT || "8787", 10),
  oscOutHost: process.env.OSC_OUT_HOST || "127.0.0.1",
  oscOutPort: Number.parseInt(process.env.OSC_OUT_PORT || "9000", 10),
  oscInPort: Number.parseInt(process.env.OSC_IN_PORT || "9001", 10)
};

const OBJECT_LIMITS = {
  x: [-100, 100],
  y: [-100, 100],
  z: [-100, 100],
  size: [0, 100],
  gain: [-120, 12]
};

const OSC_PARAM_TO_ADDRESS = {
  x: (id) => `/art/object/${id}/x`,
  y: (id) => `/art/object/${id}/y`,
  z: (id) => `/art/object/${id}/z`,
  size: (id) => `/art/object/${id}/size`,
  gain: (id) => `/art/object/${id}/gain`,
  mute: (id) => `/art/object/${id}/mute`,
  algorithm: (id) => `/art/object/${id}/algorithm`
};

const state = {
  show: null,
  objects: {},
  activeSceneId: null,
  runningActions: {},
  sequence: 1,
  osc: {
    inboundCount: 0,
    outboundCount: 0,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastInboundAddress: null,
    lastOutboundAddress: null
  }
};

const eventClients = new Set();
const recentEvents = [];
const MAX_RECENT_EVENTS = 250;

const oscOutSocket = dgram.createSocket("udp4");
const oscInSocket = dgram.createSocket("udp4");

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, [min, max]) {
  return Math.max(min, Math.min(max, value));
}

function coerceNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeObject(input, fallbackId) {
  const id = String(input.object_id || input.objectId || fallbackId || "obj-1");
  return {
    objectId: id,
    x: clamp(coerceNumber(input.x, 0), OBJECT_LIMITS.x),
    y: clamp(coerceNumber(input.y, 0), OBJECT_LIMITS.y),
    z: clamp(coerceNumber(input.z, 0), OBJECT_LIMITS.z),
    size: clamp(coerceNumber(input.size, 25), OBJECT_LIMITS.size),
    gain: clamp(coerceNumber(input.gain, 0), OBJECT_LIMITS.gain),
    mute: Boolean(input.mute),
    algorithm: String(input.algorithm || "default")
  };
}

function defaultObject(objectId) {
  return normalizeObject({ object_id: objectId }, objectId);
}

function addRecentEvent(event) {
  recentEvents.push(event);
  while (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.shift();
  }
}

function emitEvent(type, payload) {
  const event = {
    id: state.sequence++,
    type,
    at: nowIso(),
    payload
  };
  addRecentEvent(event);
  const line = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of eventClients) {
    client.write(line);
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "text/plain; charset=utf-8";
}

async function serveFile(res, filePath) {
  const data = await fs.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": "no-store"
  });
  res.end(data);
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function discoverShowPaths() {
  const showfilesRoot = path.join(PROJECT_ROOT, "showfiles");

  const paths = [];
  const walk = async (dirPath) => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_schema") continue;
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || entry.name !== "show.json") continue;
      paths.push(path.relative(PROJECT_ROOT, absolutePath).split(path.sep).join("/"));
    }
  };

  try {
    await walk(showfilesRoot);
  } catch {
    return [];
  }

  const uniqueSorted = [...new Set(paths)].sort();
  const templatePath = "showfiles/_template/show.json";
  const templateIndex = uniqueSorted.indexOf(templatePath);
  if (templateIndex >= 0) {
    uniqueSorted.splice(templateIndex, 1);
    uniqueSorted.unshift(templatePath);
  }
  return uniqueSorted;
}

function sanitizePath(inputPath) {
  const requested = String(inputPath || "").trim();
  if (!requested) {
    return path.join(PROJECT_ROOT, "showfiles/_template/show.json");
  }
  const absolute = path.resolve(PROJECT_ROOT, requested);
  const normalizedRoot = `${PROJECT_ROOT}${path.sep}`;
  if (!(absolute + path.sep).startsWith(normalizedRoot) && absolute !== PROJECT_ROOT) {
    throw new Error("Path must be inside project root");
  }
  return absolute;
}

async function loadShow(showPath) {
  const absoluteShowPath = sanitizePath(showPath);
  const showDir = path.dirname(absoluteShowPath);
  const rawShow = JSON.parse(await fs.readFile(absoluteShowPath, "utf8"));

  const scenesById = {};
  for (const ref of rawShow.scenes || []) {
    const scenePath = path.resolve(showDir, String(ref.file));
    const rawScene = JSON.parse(await fs.readFile(scenePath, "utf8"));
    const objects = (rawScene.objects || []).map((obj) => normalizeObject(obj));
    scenesById[String(rawScene.scene_id)] = {
      sceneId: String(rawScene.scene_id),
      name: String(rawScene.name || rawScene.scene_id),
      transitionMs: coerceNumber(rawScene.transition_ms, 0),
      objects
    };
  }

  const actionsById = {};
  for (const ref of rawShow.actions || []) {
    const actionPath = path.resolve(showDir, String(ref.file));
    const rawAction = JSON.parse(await fs.readFile(actionPath, "utf8"));
    actionsById[String(rawAction.action_id)] = {
      actionId: String(rawAction.action_id),
      name: String(rawAction.name || rawAction.action_id),
      durationMs: coerceNumber(rawAction.duration_ms, 0),
      tracks: Array.isArray(rawAction.tracks) ? rawAction.tracks : [],
      oscTriggers: {
        start: String(rawAction.osc_triggers?.start || ""),
        stop: String(rawAction.osc_triggers?.stop || ""),
        abort: String(rawAction.osc_triggers?.abort || "")
      }
    };
  }

  state.show = {
    path: path.relative(PROJECT_ROOT, absoluteShowPath),
    showId: String(rawShow.show_id || "show"),
    name: String(rawShow.name || "Show"),
    version: String(rawShow.version || "0.0.0"),
    defaultSceneId: String(rawShow.default_scene_id || ""),
    scenesById,
    actionsById,
    loadedAt: nowIso()
  };

  if (state.show.defaultSceneId && state.show.scenesById[state.show.defaultSceneId]) {
    recallScene(state.show.defaultSceneId, { source: "show-load", emitOsc: false });
  }

  emitEvent("show", {
    status: "loaded",
    showId: state.show.showId,
    path: state.show.path,
    scenes: Object.keys(scenesById).length,
    actions: Object.keys(actionsById).length
  });
}

function sendOsc(address, args) {
  const payload = encodeOscMessage(address, args);
  oscOutSocket.send(payload, CONFIG.oscOutPort, CONFIG.oscOutHost);
  state.osc.outboundCount += 1;
  state.osc.lastOutboundAt = nowIso();
  state.osc.lastOutboundAddress = address;
  emitEvent("osc_out", {
    address,
    args,
    target: `${CONFIG.oscOutHost}:${CONFIG.oscOutPort}`
  });
}

function getObjectParamValue(object, param) {
  if (param === "mute") return object.mute ? 1 : 0;
  return object[param];
}

function sendObjectParam(objectId, param, value) {
  const toAddress = OSC_PARAM_TO_ADDRESS[param];
  if (!toAddress) return;
  sendOsc(toAddress(objectId), [value]);
}

function sendFullObjectState(object) {
  sendObjectParam(object.objectId, "x", object.x);
  sendObjectParam(object.objectId, "y", object.y);
  sendObjectParam(object.objectId, "z", object.z);
  sendObjectParam(object.objectId, "size", object.size);
  sendObjectParam(object.objectId, "gain", object.gain);
  sendObjectParam(object.objectId, "mute", object.mute ? 1 : 0);
  sendObjectParam(object.objectId, "algorithm", object.algorithm);
}

function getStatus() {
  return {
    mode: CONFIG.mode,
    server: {
      host: CONFIG.host,
      httpPort: CONFIG.httpPort
    },
    osc: {
      outHost: CONFIG.oscOutHost,
      outPort: CONFIG.oscOutPort,
      inPort: CONFIG.oscInPort,
      inboundCount: state.osc.inboundCount,
      outboundCount: state.osc.outboundCount,
      lastInboundAt: state.osc.lastInboundAt,
      lastOutboundAt: state.osc.lastOutboundAt,
      lastInboundAddress: state.osc.lastInboundAddress,
      lastOutboundAddress: state.osc.lastOutboundAddress
    },
    show: state.show
      ? {
          path: state.show.path,
          showId: state.show.showId,
          name: state.show.name,
          version: state.show.version,
          defaultSceneId: state.show.defaultSceneId,
          loadedAt: state.show.loadedAt,
          sceneIds: Object.keys(state.show.scenesById),
          actionIds: Object.keys(state.show.actionsById)
        }
      : null,
    activeSceneId: state.activeSceneId,
    runningActions: Object.keys(state.runningActions),
    objects: Object.values(state.objects)
  };
}

function updateObject(objectId, patch, options = {}) {
  const current = state.objects[objectId] || defaultObject(objectId);
  const merged = {
    ...current,
    ...patch,
    objectId
  };

  const next = normalizeObject(
    {
      object_id: objectId,
      x: merged.x,
      y: merged.y,
      z: merged.z,
      size: merged.size,
      gain: merged.gain,
      mute: merged.mute,
      algorithm: merged.algorithm
    },
    objectId
  );

  const changed = [];
  for (const key of ["x", "y", "z", "size", "gain", "mute", "algorithm"]) {
    if (current[key] !== next[key]) {
      changed.push(key);
    }
  }

  state.objects[objectId] = next;

  if (options.emitOsc !== false) {
    for (const param of changed) {
      sendObjectParam(objectId, param, getObjectParamValue(next, param));
    }
  }

  emitEvent("object", {
    source: options.source || "api",
    objectId,
    changed,
    object: next
  });

  return next;
}

function recallScene(sceneId, options = {}) {
  if (!state.show) {
    throw new Error("No show loaded");
  }
  const scene = state.show.scenesById[sceneId];
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  const nextObjects = {};
  for (const obj of scene.objects) {
    nextObjects[obj.objectId] = normalizeObject(
      {
        object_id: obj.objectId,
        x: obj.x,
        y: obj.y,
        z: obj.z,
        size: obj.size,
        gain: obj.gain,
        mute: obj.mute,
        algorithm: obj.algorithm
      },
      obj.objectId
    );
  }

  state.objects = nextObjects;
  state.activeSceneId = sceneId;

  if (options.emitOsc !== false) {
    for (const object of Object.values(state.objects)) {
      sendFullObjectState(object);
    }
    sendOsc(`/art/scene/${sceneId}/recall`, [1]);
  }

  emitEvent("scene", {
    source: options.source || "api",
    sceneId,
    objectCount: Object.keys(state.objects).length
  });
}

function interpolateNumeric(keyframes, elapsedMs) {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return null;
  const frames = [...keyframes].sort((a, b) => coerceNumber(a.time_ms, 0) - coerceNumber(b.time_ms, 0));
  if (elapsedMs <= coerceNumber(frames[0].time_ms, 0)) {
    return Number(frames[0].value);
  }

  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = frames[i];
    const b = frames[i + 1];
    const t0 = coerceNumber(a.time_ms, 0);
    const t1 = coerceNumber(b.time_ms, 0);
    if (elapsedMs >= t0 && elapsedMs <= t1) {
      const v0 = Number(a.value);
      const v1 = Number(b.value);
      if (!Number.isFinite(v0) || !Number.isFinite(v1) || t1 <= t0) return v0;
      const ratio = (elapsedMs - t0) / (t1 - t0);
      const curve = String(b.curve || "linear");
      if (curve === "step") return v0;
      if (curve === "ease-in") return v0 + (v1 - v0) * ratio * ratio;
      if (curve === "ease-out") {
        const eased = 1 - (1 - ratio) * (1 - ratio);
        return v0 + (v1 - v0) * eased;
      }
      return v0 + (v1 - v0) * ratio;
    }
  }

  const last = frames[frames.length - 1];
  return Number(last.value);
}

function applyActionFrame(action, elapsedMs) {
  for (const track of action.tracks || []) {
    const objectId = String(track.object_id || track.objectId || "");
    const parameter = String(track.parameter || "");
    if (!objectId || !parameter) continue;

    const current = state.objects[objectId] || defaultObject(objectId);
    let value;

    if (parameter === "mute") {
      const v = interpolateNumeric(track.keyframes || [], elapsedMs);
      value = Boolean(v >= 0.5);
    } else if (parameter === "algorithm") {
      const frames = Array.isArray(track.keyframes) ? track.keyframes : [];
      const sorted = [...frames].sort((a, b) => coerceNumber(a.time_ms, 0) - coerceNumber(b.time_ms, 0));
      let selected = current.algorithm;
      for (const frame of sorted) {
        if (elapsedMs >= coerceNumber(frame.time_ms, 0)) {
          selected = String(frame.value);
        }
      }
      value = selected;
    } else {
      const numeric = interpolateNumeric(track.keyframes || [], elapsedMs);
      if (!Number.isFinite(numeric)) continue;
      value = numeric;
    }

    updateObject(objectId, { [parameter]: value }, { source: "action", emitOsc: true });
  }
}

function startAction(actionId, source = "api") {
  if (!state.show) throw new Error("No show loaded");
  if (state.runningActions[actionId]) return;

  const action = state.show.actionsById[actionId];
  if (!action) throw new Error(`Action not found: ${actionId}`);

  const startedAtMs = Date.now();
  const tickMs = 50;

  const tick = () => {
    const elapsedMs = Date.now() - startedAtMs;
    applyActionFrame(action, elapsedMs);
    if (elapsedMs >= action.durationMs) {
      stopAction(actionId, "complete");
    }
  };

  const timer = setInterval(tick, tickMs);
  tick();

  state.runningActions[actionId] = {
    startedAtMs,
    source,
    timer
  };

  emitEvent("action", {
    actionId,
    state: "started",
    source
  });
}

function stopAction(actionId, reason = "stop") {
  const running = state.runningActions[actionId];
  if (!running) return;
  clearInterval(running.timer);
  delete state.runningActions[actionId];

  emitEvent("action", {
    actionId,
    state: "stopped",
    reason
  });
}

function abortAction(actionId, source = "api") {
  stopAction(actionId, "abort");
  emitEvent("action", {
    actionId,
    state: "aborted",
    source
  });
}

function handleInboundOsc(message, remote) {
  state.osc.inboundCount += 1;
  state.osc.lastInboundAt = nowIso();
  state.osc.lastInboundAddress = message.address;

  emitEvent("osc_in", {
    sourceIp: remote.address,
    sourcePort: remote.port,
    address: message.address,
    args: message.args
  });

  if (state.show) {
    for (const action of Object.values(state.show.actionsById)) {
      if (message.address === action.oscTriggers.start) {
        startAction(action.actionId, "osc");
        return;
      }
      if (message.address === action.oscTriggers.stop) {
        stopAction(action.actionId, "osc-stop");
        return;
      }
      if (message.address === action.oscTriggers.abort) {
        abortAction(action.actionId, "osc");
        return;
      }
    }

    const sceneMatch = message.address.match(/^\/art\/scene\/([^/]+)\/recall$/);
    if (sceneMatch) {
      const sceneId = decodeURIComponent(sceneMatch[1]);
      recallScene(sceneId, { source: "osc", emitOsc: false });
      return;
    }
  }

  const objectMatch = message.address.match(/^\/art\/object\/([^/]+)\/(x|y|z|size|gain|mute|algorithm)$/);
  if (objectMatch) {
    const objectId = decodeURIComponent(objectMatch[1]);
    const param = objectMatch[2];
    const arg = message.args[0];
    const value = param === "mute" ? Boolean(Number(arg)) : arg;
    updateObject(objectId, { [param]: value }, { source: "osc", emitOsc: false });
  }
}

function encodeOscMessage(address, args) {
  const parts = [encodeOscString(address)];
  let typeTags = ",";
  const argBuffers = [];

  for (const arg of args) {
    if (typeof arg === "string") {
      typeTags += "s";
      argBuffers.push(encodeOscString(arg));
      continue;
    }

    if (typeof arg === "number" && Number.isInteger(arg)) {
      typeTags += "i";
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(arg, 0);
      argBuffers.push(buf);
      continue;
    }

    if (typeof arg === "number") {
      typeTags += "f";
      const buf = Buffer.alloc(4);
      buf.writeFloatBE(arg, 0);
      argBuffers.push(buf);
      continue;
    }

    if (typeof arg === "boolean") {
      typeTags += "i";
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(arg ? 1 : 0, 0);
      argBuffers.push(buf);
      continue;
    }

    typeTags += "s";
    argBuffers.push(encodeOscString(String(arg)));
  }

  parts.push(encodeOscString(typeTags));
  parts.push(...argBuffers);
  return Buffer.concat(parts);
}

function encodeOscString(value) {
  const raw = Buffer.from(`${value}\0`, "utf8");
  const pad = (4 - (raw.length % 4)) % 4;
  if (pad === 0) return raw;
  return Buffer.concat([raw, Buffer.alloc(pad)]);
}

function readOscString(buffer, offset) {
  let cursor = offset;
  while (cursor < buffer.length && buffer[cursor] !== 0) {
    cursor += 1;
  }
  const value = buffer.slice(offset, cursor).toString("utf8");
  cursor += 1;
  while (cursor % 4 !== 0) cursor += 1;
  return { value, nextOffset: cursor };
}

function decodeOscMessage(buffer) {
  const addressInfo = readOscString(buffer, 0);
  if (addressInfo.value === "#bundle") {
    throw new Error("OSC bundle is not supported in this scaffold");
  }

  const tagsInfo = readOscString(buffer, addressInfo.nextOffset);
  const tags = tagsInfo.value.startsWith(",") ? tagsInfo.value.slice(1) : "";

  const args = [];
  let offset = tagsInfo.nextOffset;

  for (const tag of tags) {
    if (tag === "i") {
      args.push(buffer.readInt32BE(offset));
      offset += 4;
      continue;
    }
    if (tag === "f") {
      args.push(buffer.readFloatBE(offset));
      offset += 4;
      continue;
    }
    if (tag === "s") {
      const str = readOscString(buffer, offset);
      args.push(str.value);
      offset = str.nextOffset;
      continue;
    }
    if (tag === "T") {
      args.push(true);
      continue;
    }
    if (tag === "F") {
      args.push(false);
      continue;
    }
    throw new Error(`Unsupported OSC type tag: ${tag}`);
  }

  return {
    address: addressInfo.value,
    args
  };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      await serveFile(res, path.join(UI_ROOT, "index.html"));
      return;
    }

    if (req.method === "GET" && url.pathname === "/app.js") {
      await serveFile(res, path.join(UI_ROOT, "app.js"));
      return;
    }

    if (req.method === "GET" && url.pathname === "/styles.css") {
      await serveFile(res, path.join(UI_ROOT, "styles.css"));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, getStatus());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/show/list") {
      sendJson(res, 200, {
        ok: true,
        paths: await discoverShowPaths(),
        current: state.show ? state.show.path : null
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      res.write(`event: status\ndata: ${JSON.stringify({ id: 0, type: "status", at: nowIso(), payload: getStatus() })}\n\n`);
      for (const event of recentEvents) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
      eventClients.add(res);
      req.on("close", () => {
        eventClients.delete(res);
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/show/load") {
      const body = await readJsonBody(req);
      await loadShow(body.path || "showfiles/_template/show.json");
      sendJson(res, 200, { ok: true, status: getStatus() });
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/scene/") && url.pathname.endsWith("/recall")) {
      const sceneId = decodeURIComponent(url.pathname.split("/")[3] || "");
      recallScene(sceneId, { source: "api", emitOsc: true });
      sendJson(res, 200, { ok: true, sceneId, status: getStatus() });
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/object/")) {
      const objectId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const body = await readJsonBody(req);
      const object = updateObject(objectId, body, { source: "api", emitOsc: true });
      sendJson(res, 200, { ok: true, object, status: getStatus() });
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/action/")) {
      const [, , actionWord, actionId, command] = url.pathname.split("/");
      if (actionWord !== "action" || !actionId || !command) {
        sendJson(res, 404, { ok: false, error: "Unknown action endpoint" });
        return;
      }
      const decodedActionId = decodeURIComponent(actionId);
      if (command === "start") {
        startAction(decodedActionId, "api");
      } else if (command === "stop") {
        stopAction(decodedActionId, "api-stop");
      } else if (command === "abort") {
        abortAction(decodedActionId, "api");
      } else {
        sendJson(res, 404, { ok: false, error: `Unknown action command: ${command}` });
        return;
      }
      sendJson(res, 200, { ok: true, actionId: decodedActionId, command, status: getStatus() });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

oscInSocket.on("message", (buffer, remote) => {
  try {
    const decoded = decodeOscMessage(buffer);
    handleInboundOsc(decoded, remote);
  } catch (error) {
    emitEvent("osc_error", {
      source: "inbound",
      message: error instanceof Error ? error.message : "Decode failed"
    });
  }
});

oscInSocket.on("error", (error) => {
  emitEvent("osc_error", {
    source: "socket",
    message: error.message
  });
});

async function bootstrap() {
  await loadShow("showfiles/_template/show.json");

  await new Promise((resolve) => {
    oscInSocket.bind(CONFIG.oscInPort, "0.0.0.0", resolve);
  });

  server.listen(CONFIG.httpPort, CONFIG.host, () => {
    console.log("Amadeus Panner dev server started");
    console.log(`HTTP: http://${CONFIG.host}:${CONFIG.httpPort}`);
    console.log(`OSC out: ${CONFIG.oscOutHost}:${CONFIG.oscOutPort}`);
    console.log(`OSC in: 0.0.0.0:${CONFIG.oscInPort}`);
    emitEvent("system", {
      message: "server_started",
      http: `http://${CONFIG.host}:${CONFIG.httpPort}`,
      oscOut: `${CONFIG.oscOutHost}:${CONFIG.oscOutPort}`,
      oscIn: `0.0.0.0:${CONFIG.oscInPort}`
    });
  });
}

function shutdown(signal) {
  for (const actionId of Object.keys(state.runningActions)) {
    stopAction(actionId, "shutdown");
  }
  oscInSocket.close();
  oscOutSocket.close();
  server.close(() => {
    console.log(`Shut down from ${signal}`);
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
