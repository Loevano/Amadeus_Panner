# Save + Log + Git Reference

Use this file as a source of truth when writing future prompts about persistence flows, runtime logging, and safe git workflow.

## 1. Save Logic

### 1.1 UI Save Entrypoints (apps/ui/public/app.js)

- Show
  - `loadShowFromInput()` -> `POST /api/show/load` with `{ path }`
  - `saveShow()` -> `POST /api/show/save` with `{}`
  - `saveShowAs()` -> `POST /api/show/save` with `{ path, setAsCurrent: true }`
  - `createNewShow()` -> `POST /api/show/new` with `{ path, overwrite }`
- Scene
  - `runSceneLoad()` -> `POST /api/scene/{sceneId}/recall`
  - `runSceneSave()` -> `POST /api/scene/{sceneId}/save`
  - `runSceneSaveAs()` -> `POST /api/scene/{sceneId}/save-as` with `{ newSceneId }`
- Actions
  - `actionManagerCreate()` -> `POST /api/action/create`
  - `actionManagerSave()` -> `POST /api/action/{actionId}/update`
  - `actionManagerSaveAs()` -> `POST /api/action/{actionId}/save-as` with `{ newActionId, ...patch }`
- Action Groups
  - `actionGroupManagerCreate()` -> `POST /api/action-group/create`
  - `actionGroupManagerSave()` -> `POST /api/action-group/{groupId}/update`
- Object Groups
  - `groupManagerCreate()` -> `POST /api/groups/create`
  - `groupManagerSaveEditor()` -> `POST /api/groups/{groupId}/update`

### 1.2 Server Save Pipeline (apps/control-server/server.py)

Core persistence is `Runtime.save_show(...)`.

High-level flow:

1. Snapshot in-memory runtime state (`show`, objects, groups, flags).
2. Normalize scenes, actions, global LFOs, action groups, object groups.
3. Optionally capture current runtime object state into active/default scene (`capture_runtime_scene=True`).
4. Write scene files and action files atomically.
5. Write show file atomically.
6. Validate bundle (`validate_show_bundle`).
7. Update in-memory show/runtime state and optionally set current show path.
8. Emit `show` event (`status: saved`).

Important scene detail:

- `save_scene()` and `save_scene_as()` call `save_show(capture_runtime_scene=False)` to avoid re-capturing scene state again after they already set scene objects explicitly.

### 1.3 API Endpoints Used for Save/Persist

- `/api/show/load`
- `/api/show/save`
- `/api/show/new`
- `/api/scene/{id}/recall`
- `/api/scene/{id}/save`
- `/api/scene/{id}/save-as`
- `/api/action/create`
- `/api/action/{id}/update`
- `/api/action/{id}/save-as`
- `/api/action-group/create`
- `/api/action-group/{id}/update`
- `/api/groups/create`
- `/api/groups/{id}/update`

### 1.4 Save Rules to Preserve in Future Changes

- Keep save operations followed by `refreshStatus()` on success.
- Keep failure paths logging `"... failed: ${error.message}"`.
- Preserve ID normalization logs (for user feedback) when sanitized ID differs from input.
- Do not bypass `save_show()` for persistent writes; it is the canonical normalization + validation path.

## 2. Log Logic

### 2.1 UI Logging (`addLog`)

`addLog(line)` does all of the following:

1. Appends to in-memory log buffer (`state.logs`) capped at 160 lines.
2. Appends DOM log lines in `#eventLog`, also capped at 160 lines.
3. Auto-scrolls to latest log.
4. Updates status bar severity:
   - Timestamped stream lines (`YYYY-MM-DDT...`) are ignored for status color to reduce noise.
   - `failed|error` -> error status.
   - Success keywords (`loaded|saved|created|updated|enabled|disabled|...`) -> success status.
   - Everything else -> info status.

### 2.2 Event Stream Logging

- EventSource listens to `/events`.
- `shouldLogEventType(...)` gates log noise:
  - `osc_error` always allowed.
  - Debug log toggle controls most event logging.
  - Noisy event types are throttled (`osc_out`, `osc_in`, `object`) with a short time window.
- On parse success: logs `${at} [${type}] ${JSON.stringify(payload)}` when allowed.
- On parse fallback: logs raw event data when allowed.
- On stream error: logs `event stream disconnected, retrying...`.

### 2.3 Logging Rules to Preserve

- Keep log format stable (`<domain> <action> -> <id>` and `<domain> ... failed: <error>`).
- Keep caps (160 lines) to avoid unbounded DOM growth.
- Keep noisy stream throttling to avoid UI performance regressions.

## 3. Git Handling (for Future Prompt-Driven Work)

### 3.1 Safe Defaults

- Never discard unrelated work without explicit approval.
- Avoid destructive commands (`git reset --hard`, `git checkout --`) unless explicitly requested.
- Stage only files relevant to the requested change.
- Prefer small, focused commits.

### 3.2 Practical Workflow

1. Inspect workspace:
   - `git status --short`
   - `git diff -- <target-files>`
2. Implement patch.
3. Re-check:
   - `git diff -- <target-files>`
4. Stage only intended files:
   - `git add <file1> <file2> ...`
5. Commit with clear message:
   - `git commit -m "feat: ..."` or `fix: ...`
6. Verify commit contents:
   - `git show --stat --name-only HEAD`

### 3.3 Prompt Snippet You Can Reuse

```text
Use docs/SAVE_LOGIC_GIT_REFERENCE.md as the implementation reference.

Task:
- <describe requested change>

Constraints:
- Preserve existing save flow semantics and event emission.
- Preserve addLog format and error/success logging behavior.
- Use safe git handling: do not revert unrelated changes, stage only touched files.
```

