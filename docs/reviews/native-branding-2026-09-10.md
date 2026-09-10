# Native client alignment with the IndiaFOSS 2026 branding — 10 September 2026

Issue #33, following the PWA alignment of 8 September
([review](branding-2026-09-08.md)). Tracks #110. PR #313.

The Compose app now makes the same design decisions as the PWA: one role per
token mirroring `apps/web/src/app.css`, Inter headings and body with Space
Mono for compact metadata, the eight official devroom patterns, and a launcher
plate in the event mint. The owner's earlier direction that the native app
looks like an Android app (#10) is kept where it matters: platform layout,
back behaviour, insets and Material You for the everyday screens. What
changes is that the event surfaces no longer lose their identity to a
wallpaper.

## Token mapping

| app.css                                    | Light                       | Dark                        | Material 3 role                                                                               |
| ------------------------------------------ | --------------------------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| `--mint` hsl(144 92% 37%)                  | #08B54D                     | #08B54D                     | launcher plate, masthead rule (accent only, never text)                                       |
| `--mint-ink` (dark green / bright green)   | #114B29                     | #47EB89                     | `primary`, `surfaceTint`                                                                      |
| `--mint-soft` (pale green)                 | #BAFCD6                     | #114B29                     | `primaryContainer`                                                                            |
| `--mint-dark`                              | #114B29                     | #ACF6CB                     | `onPrimaryContainer` (dark)                                                                   |
| `--paper`                                  | #F0F0F0                     | #141414                     | `surface`, `background`, window and splash plate                                              |
| `--surface`                                | #FAFAFA                     | #1F1F1F                     | `surfaceContainerLow` / `surfaceContainer` (cards, nav bar)                                   |
| `--surface-raised`                         | #FFFFFF                     | #262626                     | `surfaceContainerHigh`, the plate behind devroom art                                          |
| `--ink-2` (hero)                           | #1A1A1A                     | #1A1A1A                     | `BrandColors.inkSurface`: masthead and welcome hero                                           |
| `--text` / `--text-muted` / `--text-faint` | #141414 / #4A4A4A / #666666 | #F5F5F5 / #CCCCCC / #A6A6A6 | `onSurface` / `onSurfaceVariant` / `outline`                                                  |
| `--line`                                   | #E6E6E6                     | #4A4A4A                     | `outlineVariant`, `secondaryContainer`, `surfaceVariant`                                      |
| `--warning` / `--amber-soft`               | #8A5410 / #FFE9BF           | #F3C46F / #4A3600           | `tertiary` / `tertiaryContainer` (banner within five minutes, plan warnings, schedule update) |
| `--danger`                                 | #D32F2F                     | #FF6B6B                     | `error`                                                                                       |
| `--on-strong` / `--on-ink`                 | #FFFFFF / #FAFAFA           | #141414 / #FAFAFA           | `onPrimary` / text on the ink surface                                                         |

Warning and error stay amber and red under every scheme; nothing semantic is
brand green. `--mint` itself is not used for text: the PWA's white-on-mint
button measures 2.7:1, so native fills buttons with `--mint-ink` (11:1 on
white) and keeps the brighter green for the rule and the launcher.

### Where the palette is fixed

The masthead on Now (event name, dates, "Day 1 of 2" / "Before the
conference" / "That's a wrap"), the welcome flow, the Explore devroom
gallery and the Rank devroom cards read `LocalBrand`, so Material You never
recolours them. Everything else — Schedule, My plan, Map, Explore lists,
Settings, detail pages — takes the wallpaper palette on Android 12+ unless
Settings → Appearance → "Use wallpaper colours" is off, and the event scheme
below 12. Light or dark follows the system.

## Typography

Inter 600 for headings with tight tracking, Inter 400 body, Space Mono only
for `Typography.meta` (time · room) and `Typography.eyebrow` (capitalised
labels on the masthead and welcome). Navigation, buttons, tabs and titles are
never mono, as the PWA review settled. Both fonts ship in `res/font` under
SIL OFL 1.1; Inter is subset to Latin. FFF Forward is not bundled (not
redistributable) and no pixel face is bundled: the wordmark is not
reproduced. Provenance, checksums and the subset command are in
[`apps/android/native/branding/README.md`](../../apps/android/native/branding/README.md).

## Devroom art

The eight patterns are the PWA's SVGs rasterised to WebP (712 KB total,
`branding/render-devrooms.sh`), keyed by the same eight 2026 track ids as
`devroom-art.ts`, shown only for the `indiafoss-2026` bundle (a bundle with
another id renders no gallery — `exploreOtherEventHasNoGallery`). They are
decorative with no content description; the adjacent text names the devroom.
Surfaces: the Explore gallery (opens Rank on its devrooms step), the Rank
devroom cards, and a 56 dp sliver beside the track chip on session cards.

## Launcher, splash, name

The calendar-and-pin glyph stays; its plate is now the event mint and the
Android 12+ splash uses the paper token in both themes. IndiaFOSS Chat keeps
its speech-bubble icon, so the two apps share a colour family and differ in
silhouette. The name stays "IndiaFOSS Companion"; the Settings "About" card
keeps the unofficial community project disclosure unchanged.

## Screenshots

Robolectric renders from CI run
[34442038752](https://github.com/hanthor/indiafoss-companion/actions/runs/34442038752)
(`native-screenshots`, 411 × 891 dp, halved here), plus the Maestro emulator
frames from the same run (`android-emulator`, API 31 `default` image).

| Surface                              | Light                                                                                                             | Dark / other                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now with the masthead                | [now](native-branding-2026-09-10/now.png)                                                                         | [dark](native-branding-2026-09-10/now-dark.png) · [Material You on](native-branding-2026-09-10/now-dynamic.png) · [recap](native-branding-2026-09-10/now-recap.png) |
| Welcome (launch)                     | [welcome](native-branding-2026-09-10/welcome.png)                                                                 | [Material You on](native-branding-2026-09-10/welcome-dynamic.png) · [1.5× text](native-branding-2026-09-10/welcome-large-text.png)                                  |
| Explore devroom gallery              | [explore](native-branding-2026-09-10/explore.png)                                                                 | [1.5× text](native-branding-2026-09-10/explore-large-text.png)                                                                                                      |
| Rank devroom cards                   | [rank-devrooms](native-branding-2026-09-10/rank-devrooms.png)                                                     |                                                                                                                                                                     |
| Schedule (mono metadata, art sliver) | [schedule](native-branding-2026-09-10/schedule.png)                                                               |                                                                                                                                                                     |
| Settings (Appearance)                | [settings](native-branding-2026-09-10/settings.png)                                                               |                                                                                                                                                                     |
| Emulator, system palette             | [now](native-branding-2026-09-10/emulator-now.png) · [schedule](native-branding-2026-09-10/emulator-schedule.png) | [welcome](native-branding-2026-09-10/emulator-welcome.png)                                                                                                          |

In the Material You renders (Robolectric's and the emulator's system palette
are blue) the chrome, chips and progress bars follow the device while the
masthead and welcome hero stay ink and mint, which is the intended split.

## Accessibility

- 1.5× font scale: `LargeTextScreenshotTest` renders Now, Schedule, Welcome,
  Explore, Rank and Settings. The first pass found the welcome step's two
  buttons squeezing "Not now" to one letter per line; they flow onto a
  second row now. The masthead eyebrow wraps onto two lines and remains
  readable; nothing clips.
- Contrast, computed from the tokens: body text 15.7:1 (light) and 15.1:1
  (dark) on paper; muted text 8.6:1 / 9.9:1; `primary` on paper 9.5:1 /
  10.6:1; eyebrow green on the ink surface 10.3:1; mono metadata is set in
  `onSurfaceVariant`, never faint. These are computed values, not
  measurements of the rendered frames.
- Devroom art carries no meaning and no content description; the track chip
  and card title remain the accessible name.
- `Typography.meta` is `sp`, so it scales with the system setting like the
  rest of the scale.

## Validation

The four CI gates passed on `1d99c80`: format/lint/typecheck/test/build,
Playwright, the native Compose job (`:core:test`, `:app:testDebugUnitTest`
with the 43 Robolectric renders, `assembleDebug`) and the Maestro emulator
flows. Earlier runs on this branch caught three things the JVM alone would
not: the resource merger rejects `--` inside XML comments, and twice a new
optional parameter displaced a trailing-lambda callback.

Not done here, still open on #33: physical-device acceptance (real font
rendering, splash timing, contrast under venue lighting, TalkBack
walkthrough), a measured contrast pass on rendered frames, Chat's own
branding (hanthor/indiafoss-chat-android), and a rendered rank-devrooms
frame that shows the art — the seed programme lists the main halls first,
so the devroom cards sit below the fold in that screenshot. Nothing here ran
on a phone; Gradle was not run locally.
