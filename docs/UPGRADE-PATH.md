# EASYCOINS: Angular upgrade path

The project is on **Angular 16.2.12** with TypeScript 5.1. This document
proposes an upgrade; **nothing has been upgraded**, per the Phase 3 instruction
not to change the framework silently.

---

## 1. Why upgrade at all

| Reason | Detail |
|---|---|
| Support | Angular 16 is out of long-term support. Security patches land only in current versions |
| Build toolchain advisories | The `npm audit` findings noted in `docs/SECURITY-REVIEW.md` are in Angular 16's build dependencies. They affect the build, not the shipped bundle, and are resolved by upgrading rather than by patching |
| Node compatibility | Angular 16 does not officially support Node 22, which is what this machine runs. The CLI prints an unsupported-version warning on every command |
| `@defer` | Would let heavy below-the-fold sections load on viewport, useful for the home page |
| Built-in control flow | `@if`/`@for` compile smaller than `*ngIf`/`*ngFor` and remove the `CommonModule` import from most components |
| `provideHttpClient` interceptor functions | Simpler than the class-based `HTTP_INTERCEPTORS` this project currently uses |

None of these are urgent. The app builds clean, has no runtime vulnerabilities in
the shipped bundle, and passes every test.

## 2. Why the risk is low here

The Phase 1 rebuild removed most of what usually makes an Angular upgrade
painful:

- **Standalone components throughout.** No NgModules to migrate.
- **No Angular Material.** Material is the single biggest source of breaking
  changes between majors; it was removed in Phase 2.
- **Signals already used** for component and facade state.
- **`inject()` everywhere**, no constructor-parameter DI to rewrite.
- **Domain layer has zero Angular imports** — a third of the codebase is
  version-independent by construction.
- **157 unit tests and 124 browser checks** to verify the result.

Remaining Angular-coupled surface: `provideRouter`, `provideHttpClient`, the one
`HttpInterceptor` class, `HttpClient`/`HttpErrorResponse` types, the two pipes,
and `bootstrapApplication`.

## 3. Proposed path

One major at a time, using the official update tool. Never skip a major.

```
16 → 17 → 18 → 19 → 20
```

For each step:

```bash
npx @angular/cli@<next> update @angular/core@<next> @angular/cli@<next>
npm run test:ci          # 157 unit tests must stay green
npm run qa:all           # routes, flows, a11y, security, perf
```

### 16 → 17
- Node 18.13+ required; Node 22 becomes supported territory
- New application builder (esbuild) — opt in via `angular.json`, measure the
  build, keep it only if the output is equivalent
- `@defer` and built-in control flow become available (opt-in)
- **Watch:** the `browser` builder is renamed; `angular.json` needs updating,
  including the `staging` configuration added in this phase

### 17 → 18
- Mostly additive
- `provideHttpClient(withInterceptors([...]))` — migrate `CorrelationInterceptor`
  from a class to a function, removing `HTTP_INTERCEPTORS` from `providers.ts`

### 18 → 19
- Standalone becomes the default; already the case here
- `effect()` and signal API refinements
- **Watch:** stricter template type-checking may surface latent errors — a good
  thing, but budget time for it

### 19 → 20
- Zoneless change detection is stable enough to evaluate. `zone.js` could be
  dropped, which removes ~33 kB of polyfills
- **Watch:** anything relying on Zone-driven change detection. This project uses
  signals and `async` pipes, so the exposure is small, but the browser suite is
  the arbiter

## 4. Optional follow-ups, only after the upgrade lands

| Change | Benefit | Cost |
|---|---|---|
| Migrate to `@if`/`@for` | Smaller bundle, no `CommonModule` imports | Mechanical; there is a migration schematic |
| `@defer` on home-page sections | Less JS on first paint | Small; measure before and after |
| Zoneless | ~33 kB less polyfill, fewer change-detection surprises | Needs a full browser-suite pass |
| esbuild builder | Faster builds | Config change; verify output parity |

## 5. Recommendation

**Do the upgrade as its own change, before the backend integration phase, not
during it.** Two reasons: the test suite can then attribute any regression to
exactly one cause, and the HTTP data layer written in this phase is easier to
debug against a real backend on a supported framework version.

Suggested sequencing:

1. Phase 4a — Angular 16 → 20, one major per commit, full gate after each
2. Phase 4b — backend implementation against `docs/API-CONTRACT.md`
3. Phase 4c — flip `apiMode` to `http` in staging and run the browser suite
   against the real API

If the backend is more urgent than the upgrade, the reverse order is safe — the
data layer does not depend on any version-specific behaviour. What should be
avoided is doing both at once.
