---
name: Design system parity
description: Mobile app is the visual source of truth; web app must match its tokens.
---

The user wants the web app to look like the desktop sibling of the mobile app.

**Rule:** Mobile design tokens (in `artifacts/wick-betts-mobile/constants/colors.ts` and `components/WickUI.tsx`) are the source of truth: bg #08070D, cards #12101B with 1px #2A223A borders / radius 18 / no shadows, primary #A855F7 (dark text #09070D on it), muted text #A59DB3, Inter only, uppercase tracked micro-labels, fully-rounded pills.

**Why:** August 2026 restyle replaced the web app's old green editorial theme at the user's request; any new web UI in the old green language will read as a regression.

**How to apply:** New web surfaces should use the CSS variables in `artifacts/wick-betts/src/index.css` (mapped 1:1 to mobile tokens). Watch a known failure mode: using `--muted-foreground` (a text color) as a background creates invisible text — surfaces belong on `--card`/`--secondary`/`--muted`/`--input`.
