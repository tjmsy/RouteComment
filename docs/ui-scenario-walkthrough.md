# Review-hub scenario walkthrough (IA v6)

Walk these flows before / while wiring UI. Fix labels and chrome first; avoid adding UiState kinds.

## 1. First create

1. `empty` — see **Load ZIP** and **Create Project** only  
2. Create → `createWizard` / gpx — load or Skip  
3. map — load or Skip  
4. georef (if map) — align or Skip / Done  
5. `WIZARD_DONE` → `review`  
6. Edit (pencil) → `chooseEdit` → Plan → `editPlan` — Add plan, draw, **Done** → `review`

**Check:** Next action is always obvious; Done means finished editing.

## 2. Timed comment while playing

1. `review` — scrub / play  
2. **＋** → `chooseComment` — pick kind  
3. `editComment` — place / edit text  
4. **Done** → `review` — danmaku/pin visible on play

**Check:** No “at current time” inside edit tools; playhead lives on Review.

## 3. Georef redo

1. `review` → Project → `project`  
2. Georeference → `georef` — align  
3. **Done** → `review` (not stuck in Project)

**Check:** Done ≠ 閉じる; Project uses 閉じる / ←.

## 4. Resume ZIP

1. `empty` → Load ZIP → `LOAD_ZIP_SUCCESS` → `review`

## Label rules

| Action | Label |
|--------|--------|
| Leave editPlan / editComment / georef / wizard finish | **Done** |
| Leave project / layers / playback / choose* | **閉じる** or ← |

## Tweaks from walk (implementation notes)

- Empty CTAs must be large and primary; no brand/tagline chrome.  
- Pencil and ＋ must stay reachable on Review without opening a stacked menu.  
- Profile charts stay available on Review and editComment via display flags, not UiState.
