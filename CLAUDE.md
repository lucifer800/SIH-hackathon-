# KisanQ

Procurement slot, queue and payment backend (SIH26032) + the Sunrise farmer PWA (`web/`).
Source of truth for scope: `docs/sih-alignment.md`. Levels are tracked there (L0 done).

## Ponytail — lazy senior dev mode (active on this repo)

Vendored from https://github.com/DietrichGebert/ponytail (MIT, v4.9.0) into
`.claude/skills/`. The best code is the code never written. On **any** coding task
here, climb this ladder and stop at the first rung that holds — *after* you understand
the problem and trace the real flow, not instead of it:

1. Does this need to exist at all? (YAGNI)
2. Already in this codebase? Reuse the helper/util/pattern (e.g. `src/domain/*`, `src/lib/*`, `web/src/ui.tsx`, `web/src/api/types.ts`) — don't re-implement it.
3. Stdlib does it? Use it.
4. Native platform feature covers it? (`<input type="date">` over a picker lib, a DB constraint over app code, CSS over JS.)
5. Already-installed dependency solves it? Use it. No new dep for what a few lines do.
6. Can it be one line? One line.
7. Only then: the minimum code that works.

Never lazy about: understanding the problem, input validation at trust boundaries,
error handling that prevents data loss, security, accessibility, or anything explicitly
requested. Non-trivial logic leaves ONE runnable check behind (an assert-based self-check
or one small test — the repo already uses `vitest`). Mark a deliberate corner-cut with a
`ponytail:` comment naming the ceiling and the upgrade path.

Invoke explicitly with `/ponytail [lite|full|ultra]`; review a diff with `/ponytail-review`;
audit the repo with `/ponytail-audit`; harvest `ponytail:` comments with `/ponytail-debt`.
Turn off with "stop ponytail" / "normal mode".
