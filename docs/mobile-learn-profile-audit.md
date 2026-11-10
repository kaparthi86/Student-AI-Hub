# Mobile Learn / Profile Audit — Android & iOS

**Date:** 2026-11-10 (America/Los_Angeles)  
**Scope:** Bottom nav + My Learning / Profile hubs on phone viewports (PWA / mobile browsers)

## Findings

| Severity | Issue | Platforms | Fix |
|----------|-------|-----------|-----|
| P0 | `setMainTab("learning"\|"profile")` fell back to `home` because those ids were missing from `COACH_TABS` | Android + iOS | Added both to `COACH_TABS` |
| P0 | `#mscBottomNav` buttons had **no click handlers** | Android + iOS | Wired in `wireCoachHome()` |
| P0 | Learning / Profile hub tiles (`data-coach-tab`) were not delegated | Android + iOS | Click listeners on `#panelLearning` / `#panelProfile` |
| P1 | “Bottom nav” used `position: sticky` while sitting **above** panels in the DOM — appeared under the header, not as a true bottom bar | Android Chrome, iOS Safari | `position: fixed; bottom: 0` + safe-area padding |
| P1 | Workspace lacked bottom inset → last hub tiles / Profile Save sat under the bar | Both | `padding-bottom: calc(72px + safe-area)` |
| P2 | `#panelLearning` / `#panelProfile` missing from mobile overflow scroll rules | iOS especially | Added to touch-scroll panel list |
| P2 | Profile Save / Install buttons unwired on hub | Both | Wired `saveLearnerPrefsBtn`, `profileHubInstallBtn` |

## Desktop Learn / Profile menus

At `min-width: 821px`, bottom nav is hidden and the top `Learn` / `Profile` `<details>` menus remain. Those were previously fixed for WebKit summary clicks; unchanged except shared `setMainTab` now accepts `learning` / `profile` if ever routed.

## How to verify on device

1. Hard-refresh (cache `?v=mobile-nav-1`).  
2. Width ≤ 820px or real phone.  
3. Tap **My Learning** → hub grid (Notebook, Code, …).  
4. Tap a tile → correct tool panel; Learning stays selected in the bar.  
5. Tap **Profile** → learner prefs form; Save shows toast.  
6. Confirm bar sits above the home indicator / Android gesture area.  
7. iOS Safari: add to Home Screen optional; Voice still best in Chrome/Edge.

## Residual risks

- iOS Web Speech for Voice Tutor remains limited vs Chromium.  
- Fixed bottom nav can cover toasts near the bottom — toast stack should stay above `z-index: 60` (verify if clipped).  
- Landscape phones with short height: hub scroll relies on panel `overflow: auto`.
