# Version Control Plan

This workspace currently has no git metadata at repo root.

## Suggested Local Setup
```bash
cd Amadeus_Panner
git init
git add .
git commit -m "chore: initialize ART control scaffold"
```

## Branching
- `main`: stable rehearsal/show baseline.
- `feature/<topic>`: new functionality.
- `hotfix/<issue>`: urgent rehearsal/show fixes.

## Commit Rules
- Small, focused commits.
- Message format: `<type>: <scope> - <summary>`
- Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`

## Revert Strategy
- Prefer `git revert <sha>` for safe rollback.
- Tag known-good rehearsal builds:
```bash
git tag rehearsal-YYYYMMDD-HHMM
```
