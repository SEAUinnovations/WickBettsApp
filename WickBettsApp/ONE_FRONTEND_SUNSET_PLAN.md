One Frontend Sunset Plan

Goal
- Move to a single frontend codebase (wick-betts-mobile) for web + mobile and sunset wick-betts (Vite) safely.

Current state
- Cloudflare Pages deploy workflow already targets wick-betts-mobile web export.
- wick-betts still exists and duplicates auth, routes, and UI maintenance cost.

Phase 1: Contract freeze (1 week)
- Freeze new feature work in wick-betts unless it is a production fix.
- Keep all new product work in wick-betts-mobile.
- Confirm canonical auth entry URL is /sign-in.

Exit criteria
- No net-new feature PRs merged to artifacts/wick-betts.

Phase 2: Route parity and auth parity (1-2 weeks)
- Ensure all user-entry paths resolve in mobile-web:
  - /, /sign-in, /sign-up, /app/* compatibility paths.
- Keep Clerk flows visible and functional from /sign-in.
- Keep /login as temporary compatibility alias only.

Exit criteria
- Route checks pass in preview and production for all canonical URLs.

Phase 3: Shared logic extraction (1-2 weeks)
- Move shared auth/session/subscription logic into workspace libs.
- Eliminate duplicated API helper and auth state code between frontends.

Exit criteria
- wick-betts-mobile is source of truth for auth/business logic.

Phase 4: Decommission wick-betts deploy path (1 week)
- Remove any remaining CI/build targets that point to artifacts/wick-betts.
- Mark artifacts/wick-betts as legacy-readonly.
- Keep one rollback tag/branch before removal.

Exit criteria
- Production deploy uses only wick-betts-mobile build path.

Phase 5: Archive and remove (after 2 stable production cycles)
- Archive artifacts/wick-betts into a legacy tag or branch.
- Remove folder from active workspace when approved.
- Update docs to reflect one-frontend architecture.

Exit criteria
- No active runtime dependency on wick-betts.

Risk controls
- Keep /login alias during transition to avoid link breakage.
- Keep rollback reference branch before deleting legacy frontend.
- Validate Cloudflare worker/proxy behavior after each deployment.

Verification checklist
- pnpm --filter @workspace/wick-betts-mobile typecheck
- pnpm --filter @workspace/wick-betts-mobile build:web
- Confirm dist contains: _worker.js, _redirects, index.html
- Verify /sign-in renders Clerk and successful login reaches app routes
- Verify unauthenticated protected actions redirect to /sign-in
