# Web development — PWA and SvelteKit

The companion PWA is a SvelteKit app with offline-first support, service worker caching, and a built-in simulator. This guide covers local development, debugging, testing, and customization of the web client.

## Before you start

**Prerequisites:**
- Node.js ≥ 20.19
- pnpm 11 (`corepack enable`)
- No API keys, accounts or services required — the app runs entirely off local fixtures

**Verify your setup:**

```bash
node --version   # v20.19.0 or later
pnpm --version   # 11.x.x or later
```

## Local development

### Running the dev server

```bash
cd /path/to/indiafoss-companion
pnpm install
pnpm --filter @indiafoss/web dev
```

The PWA opens at `http://localhost:5173` with hot module reloading. Changes to `.svelte`, `.ts`, and `.tsx` files apply instantly without restarting.

**Default fixture:** The app loads `indiafoss-2025` (a historical snapshot) by default. The dev server serves it from `events/indiafoss-2025/` with no network calls. To change the default event, edit `apps/web/src/lib/event.svelte.ts` and change `DEFAULT_EVENT_ID`.

### Browser DevTools

- **Storage tab** → IndexedDB → `app` → inspect bookmarks, ratings, itinerary, contact cards
- **Application tab** → Service Workers → see the offline cache status and unregister if needed during development
- **Network tab** → set throttling to `Offline` and reload to test offline behavior
- **Console** → watch for errors in parsing fixtures or rendering

### Keyboard shortcuts in dev mode

- `?` — help overlay (when available in the UI)
- `Ctrl+K` / `Cmd+K` — quick search
- Dev server hot reload on file save (no manual refresh needed)

## Service worker and offline behavior

### How offline works

1. On first load, the service worker caches the PWA shell (HTML, CSS, JS, fonts)
2. The `EventBundle` (schedule, venue, etc.) is fetched once and stored in IndexedDB
3. With network disabled, the shell loads from cache and IndexedDB serves all data
4. Service worker intercepts network requests and serves cached responses

### Testing offline

**In DevTools:**

1. Open the **Network** tab
2. Check **Offline** (or throttle to "No throttling" → right-click → "Add custom..." → latency 100000ms)
3. Reload the page
4. The app should render fully with the cached bundle

**With `disable-internet` simulation:**

```bash
# In Firefox DevTools → Network → Offline (checkbox)
# In Chrome DevTools → Network → Offline (dropdown)
```

**Programmatic test:** See `apps/web/tests/offline.spec.ts` for the Playwright gate that blocks releases until the app works offline with the network disabled.

### Service worker cache

The service worker caches:
- **App shell** — `index.html`, CSS, JavaScript bundles
- **Assets** — fonts (Inter, Space Mono, Press Start 2P), SVG icons
- **Event bundle** — the canonical `EventBundle.json` for the event

The `EventBundle` is **not** cached by the service worker; it lives in IndexedDB. If you change the event fixture, clear IndexedDB in DevTools and reload.

**To clear the service worker cache during development:**

```javascript
// In browser console
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}
// Then close the tab and reopen it
```

## Building for production

```bash
pnpm --filter @indiafoss/web build
```

Output: `apps/web/build/` (the complete PWA)

**What's included:**
- Optimized SvelteKit output with code splitting
- Service worker with cache busting (hash-based)
- Manifest files (`manifest.json`, Apple touch icons, `robots.txt`)
- Pre-compressed `.gz` and `.br` assets for web servers

**Metadata in the build:**
- **PWA metadata** — app name, icons, start URL, display mode (`standalone` for mobile, `fullscreen` for iOS)
- **Base path** — defaults to `/indiafoss-companion/` for GitHub Pages; override with `SVELTE_BASE` environment variable
- **Event ID** — baked into the build from `DEFAULT_EVENT_ID`

### Environment variables

| Variable           | Purpose                                                                                                                   | Default              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `SVELTE_BASE`      | PWA base path (for GitHub Pages or non-root deploys)                                                                      | `/indiafoss-companion` |
| `VITE_ANALYTICS`   | Analytics endpoint (if any; usually empty for privacy)                                                                    | (empty)              |
| `NODE_ENV`         | Build environment (`development` or `production`)                                                                         | `production`         |

## Components and customization

### Repository structure

```
apps/web/
  src/
    app.svelte           # root layout, global styles, theme provider
    routes/              # file-based routing (SvelteKit)
      +page.svelte       # home / Now screen
      plan/+page.svelte  # Personal itinerary
      rank/+page.svelte  # Ranking interface
      map/+page.svelte   # Venue map
      connect/+page.svelte  # Contact sharing & QR
      +layout.svelte     # page layout wrapper
    lib/
      event.svelte.ts    # EventBundle loading and caching
      schedule.svelte.ts # schedule formatting (time, conflicts, grouping)
      stores/            # Svelte stores (IndexedDB bindings, app state)
      components/        # reusable UI components
  static/
    branding/            # IndiaFOSS logos and colours
    venues/              # floor plans (SVG) and routing graphs (JSON)
    fonts/               # bundled fonts
```

### Adding a page

1. Create `apps/web/src/routes/mypage/+page.svelte`
2. Import components and stores:
   ```svelte
   <script>
     import { eventBundle } from '$lib/stores/event.js';
   </script>
   ```
3. The page appears at `/mypage` automatically (SvelteKit routing)

### Styling

- **Design tokens** — defined in `apps/web/src/app.css` (colours, fonts, spacing)
- **No CSS framework** — custom CSS and minimal utility classes for fine control
- **Dark mode** — CSS variables switch on `prefers-color-scheme: dark` and a `data-theme` attribute
- **Accessibility** — all interactive elements have ARIA labels; contrast is tested by axe-core on every PR

To customize colours, edit `apps/web/src/app.css`:

```css
:root {
  --color-mint: hsl(144 92% 37%);  /* primary accent */
  --color-near-black: #141414;     /* text on light */
  --color-light: hsl(0 0% 94%);    /* light background */
  --color-dark: hsl(0 0% 8%);      /* dark background */
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text: var(--color-light);
    --color-bg: var(--color-dark);
  }
}
```

### Using stores

**IndexedDB persistence** — bookmarks, ratings, itinerary are stored in IndexedDB:

```svelte
<script>
  import { bookmarked, elo, itinerary } from '$lib/stores/personal.js';
</script>

{#if $bookmarked.has(activityId)}
  <button on:click={() => bookmarked.remove(activityId)}>Remove bookmark</button>
{/if}
```

**Event data** — the parsed `EventBundle` is a Svelte store:

```svelte
<script>
  import { eventBundle } from '$lib/stores/event.js';
</script>

<h1>{$eventBundle.name}</h1>
<p>Venue: {$eventBundle.venue.name}</p>
```

## Playwright E2E tests

The test suite in `apps/web/tests/` uses [Playwright](https://playwright.dev/) to walk attendee flows end to end. Tests run on every PR; the **offline gate** (`apps/web/tests/offline.spec.ts`) blocks release if the app does not work without network.

### Running tests locally

**Run all tests:**

```bash
pnpm --filter @indiafoss/web test
```

**Run a single test file:**

```bash
pnpm --filter @indiafoss/web test -- apps/web/tests/now-grid.spec.ts
```

**Run in headed mode (see the browser):**

```bash
pnpm --filter @indiafoss/web test -- --headed
```

**Run in debug mode (step through with Inspector):**

```bash
pnpm --filter @indiafoss/web test -- --debug
```

### Test structure

Each test file covers a user flow:

| File                       | What it tests                                                    |
| -------------------------- | ---------------------------------------------------------------- |
| `app.spec.ts`              | full attendee flow: schedule → rank → plan → connect             |
| `now-grid.spec.ts`         | Now screen, live sessions, progress bars, and leave-by banner    |
| `discovery.spec.ts`        | search, filtering, and devroom browsing                          |
| `contact-trust.spec.ts`    | contact cards, QR scanning, key continuity, and trust states     |
| `personal-data-import.spec.ts` | importing and merging personal data from another device   |
| `desktop.spec.ts`          | desktop PWA layout (≥1024px)                                     |
| `offline.spec.ts`          | **Release gate** — app works with network disabled               |
| `a11y.spec.ts`             | accessibility (axe-core WCAG A/AA on all core screens)           |

### Writing a test

```typescript
import { test, expect } from '@playwright/test';
import { appUrl } from './app-url';

test('my new feature', async ({ page }) => {
  await page.goto(appUrl('/'));
  await expect(page.locator('h1')).toContainText('IndiaFOSS');
  
  await page.click('button:has-text("Schedule")');
  await expect(page).toHaveURL(/.*schedule/);
  
  const sessions = page.locator('[data-testid="session"]');
  await expect(sessions).toHaveCount(130);
});
```

**Best practices:**

- Use `data-testid` attributes for reliable element selection (not class names or text content, which change)
- Test user-facing flows, not implementation details
- Use `appUrl()` helper for consistent test URLs
- Wait for elements with `.toBeVisible()`, not arbitrary delays
- Clean up test state (bookmarks, ratings) if needed — each test starts fresh with the same fixture

## Development checklist

- [ ] Changes tested locally with `pnpm --filter @indiafoss/web dev`
- [ ] Offline behavior verified (Network tab → Offline, reload works)
- [ ] New UI components pass `pnpm --filter @indiafoss/web test -- a11y.spec.ts` (or axe-core in DevTools)
- [ ] E2E test added for new user flows (run `pnpm --filter @indiafoss/web test`)
- [ ] TypeScript compiles with no errors (`pnpm --filter @indiafoss/web check`)
- [ ] Build succeeds (`pnpm --filter @indiafoss/web build`)

## Common workflows

### Debugging a specific screen

```bash
# Start dev server
pnpm --filter @indiafoss/web dev

# In DevTools:
# 1. Open DevTools (F12)
# 2. Storage tab → IndexedDB → inspect state
# 3. Network tab → see fetch calls and service worker responses
# 4. Console → watch logs
```

### Changing the event fixture

Edit `apps/web/src/lib/event.svelte.ts`:

```typescript
export const DEFAULT_EVENT_ID = 'indiafoss-2025';  // change to 'synthetic' or another event
```

Then reload. To add a new event, see [`docs/event-onboarding.md`](./event-onboarding.md).

### Customizing the venue floor plan

See [`docs/venue-map.md`](./venue-map.md) — floor plans are SVG files under `apps/web/static/venues/<key>/`.

### Testing on mobile

The dev server is accessible on your local network. Find your machine's IP:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Then on your phone, open `http://<your-ip>:5173`. The app works full-screen on mobile and respects your phone's theme (dark mode).

## Troubleshooting

| Issue                                      | Solution                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Service worker won't update                | Clear IndexedDB and unregister: DevTools → Application → Service Workers → Unregister; then reload         |
| Offline tests fail                         | Ensure network is truly disabled (DevTools → Network → Offline checkbox); rebuild with `pnpm build`       |
| Playwright tests hang                      | Run with `--debug` to see what's stuck; check timeouts in `playwright.config.ts`                           |
| Build output huge                          | Run `pnpm build` with `--analyze` to inspect bundle size; look for large dependencies                      |
| TypeScript errors in editor                | Restart your editor; run `pnpm check` to validate                                                          |

## Next steps

- **For forking** — see [`docs/forking.md`](./forking.md) and [`docs/event-onboarding.md`](./event-onboarding.md)
- **For deployment** — see [`docs/release.md`](./release.md)
- **For messaging integration** — see [`docs/messaging.md`](./messaging.md)
- **For architecture decisions** — see [`docs/adr/`](./adr/)
