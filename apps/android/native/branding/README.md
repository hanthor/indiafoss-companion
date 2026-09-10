# Native client branding assets

Provenance for everything under `app/src/main/res` that carries the
IndiaFOSS 2026 identity. The design decisions themselves are in
`docs/reviews/native-branding-2026-09-10.md`; the PWA's matching record is
`apps/web/static/branding/2026/README.md`.

## Fonts (`res/font`)

Retrieved 10 September 2026 from the google/fonts repository at commit
`142c8963e7606b510c93a644c82a4c4cdeae6ef9`. Both families are licensed under
the SIL Open Font License 1.1; the licence texts are in that repository at
`ofl/inter/OFL.txt` and `ofl/spacemono/OFL.txt`, and neither declares a
Reserved Font Name.

| File                     | Source                                             | SHA-256 of the shipped file                                        | Modification                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inter_variable.ttf`     | `ofl/inter/Inter[opsz,wght].ttf` (Inter 4.x, rsms) | `e7df7373ab96b67d892489146f17f70e2c81231ee31932fb43179bea991562d3` | Subset with fontTools 4.63 to Latin, Latin-1 Supplement, general punctuation, currency, arrows and the combining marks the programme uses (`U+0000-00FF` and the ranges below); both axes and all layout features kept. |
| `space_mono_regular.ttf` | `ofl/spacemono/SpaceMono-Regular.ttf`              | `95837e182baeeada83368f7748db28357f0a1b75c6b84ff7065b5edf933c8e18` | None (byte-for-byte).                                                                                                                                                                                                   |
| `space_mono_bold.ttf`    | `ofl/spacemono/SpaceMono-Bold.ttf`                 | `405e73d41afb7e5906efce206a326af5c956f38e255f35421c260e861e599c59` | None (byte-for-byte).                                                                                                                                                                                                   |

Inter subset command (the unmodified download was 877 KB, the subset is 316 KB):

```sh
python3 -m fontTools.subset 'Inter[opsz,wght].ttf' \
  --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+2000-206F,U+20A0-20CF,U+2122,U+2190-21FF,U+2212,U+2215,U+FEFF,U+FFFD' \
  --layout-features='*' --output-file=inter_variable.ttf
```

Usage: Inter for every readable role (600 headings, 400 body), Space Mono for
compact metadata only (`Typography.meta`, `Typography.eyebrow` in
`ui/theme/Type.kt`). FFF Forward, which the official site serves, is not
redistributable and is not bundled; the pixel wordmark is not reproduced in
the native app. Press Start 2P is not bundled either: no native surface sets
text in it.

## Devroom patterns (`res/drawable-nodpi/devroom_*.webp`)

The eight official IndiaFOSS 2026 devroom patterns, rendered from the SVGs the
PWA ships (`apps/web/static/branding/2026/devroom-*.svg`, themselves extracted
from https://github.com/fossunited/fossunited/tree/develop/fossunited/public/images/indiafoss
`if26-*.svg`, AGPL-3.0, retrieved 8 September 2026 — see the web README for
the full record). Rendered on 10 September 2026 with `render-devrooms.sh`
(librsvg `rsvg-convert` at 960 × 480, then `cwebp -q 82`); colours and paths
are the originals, only the format changes. Total 712 KB.

They are decorative: `DevroomBanner` sets no content description and the
adjacent text names the devroom. They are keyed to the eight 2026 track ids in
`ui/DevroomArt.kt` (the same map as `apps/web/src/lib/devroom-art.ts`) and are
shown only for the `indiafoss-2026` bundle.

## Launcher icon and splash

`ic_launcher_foreground.xml` is this project's own calendar-and-pin glyph
(no FOSS United mark), on the event mint `#08B54D` (`--mint`,
`hsl(144 92% 37%)`). The Android 12+ splash uses the brand paper token
(`#F0F0F0` light, `#141414` dark). IndiaFOSS Chat keeps its speech-bubble
icon, so the two apps share a colour family and differ in silhouette.

The IndiaFOSS and FOSS United names and artwork remain their owners'. This
directory does not assert ownership of them and the app's Settings screen
keeps its unofficial-community-project disclosure.
