# Bugfix Prompt System

Use this when an issue is discovered in dev or during rehearsals.

## Intake Template
- Time detected:
- Build/version:
- Mode (`live`/`program`/`dev`):
- What happened:
- Expected behavior:
- Reproduction steps:
- OSC evidence (in/out lines):
- Showfile/scene/action involved:
- Severity (`blocker`/`high`/`medium`/`low`):

## Prompt Template for AI-Assisted Fixes
```text
You are debugging the ART control system.

Context:
- Build/version: <version>
- Mode: <mode>
- Severity: <severity>
- Symptom: <what happened>
- Expected: <expected behavior>
- Repro steps:
  1) ...
  2) ...
- OSC logs (in/out):
  <log lines>
- Relevant files:
  <paths>

Tasks:
1. Identify likely root cause.
2. Propose smallest safe fix.
3. Add/adjust tests to prevent regression.
4. List runtime risks after fix.
5. Provide verification checklist for rehearsal.
```

## Fix Gate Checklist
- [ ] Reproduced issue before patch.
- [ ] Added test that fails before patch.
- [ ] Implemented minimal patch.
- [ ] Test passes after patch.
- [ ] Verified no invalid OSC payloads are emitted.
- [ ] Logged fix in `CHANGELOG.md` with timestamp.
