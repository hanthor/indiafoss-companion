# IndiaFOSS 2026 event data

The current bundle covers 26–27 September 2026. At the 9 September capture it contains **162 programme entries, 148 people and 71 booths**. Programme entries include breaks and ceremonies; they are not all talks. Counts change with future source updates. The normalized bundle and published manifest are authoritative for the current capture.

## Schedule

The public FOSS United schedule is refreshed hourly by `.github/workflows/schedule-sync.yml`, or on workflow dispatch. The pipeline captures, normalizes and validates a candidate, runs web/native/emulator checks, and only publishes if the reviewed base has not changed. A successful import triggers Pages and nightly builds. A failed fetch or validation must retain the previous publication.

`raw/` contains the captured schedule and proposal inputs. `provenance.json` describes the initial capture; its original counts and hashes are historical, not proof of later captures. `publication.json` retains the source's editorial status. The app no longer shows a persistent draft banner.

Organiser-authored rows (welcome/opening/closing notes, FOSS Awards, group photo, election results, devroom introductions and wrap-ups) arrive with the platform placeholder category `Other`, no speaker and no `schedule_description`. The adapter classifies them as `ceremony` or `intro` by narrow title rules, drops the `Other` placeholder from subtitles and tags, and links them to the public schedule page. It never writes descriptions for them; the app shows a source link until the organiser publishes text.

CFP proposal IDs preserve choices through time and room changes. `activity-ids.json` retains existing IDs; repeated occurrences need their own row identity. Never match a user's choice by title or datetime alone. Physical rooms remain independent of devroom tracks. Repeated room lunch rows are retained as source data and interpreted as lunch windows by the planner.

## Booths

The organiser supplied this [spreadsheet](https://docs.google.com/spreadsheets/d/12_CJE84LOk19pzjfHyNWXKWUHML1Fjpi3G2Be9Nvt4U/edit) and an identical [pinned CSV snapshot](https://gist.githubusercontent.com/hanthor/561e363e56f425625fe6140728b99015/raw/0f0284ecdf8481fef862628bb89503d9bb3ca036/gistfile1.txt). Both contained 71 identical records on 9 September. `booths.json` records source provenance and the imported public directory. The source spreadsheet is read-only for this workflow.

- 52 booths showcase on both days, nine on Day 1, nine on Day 2; openSUSE is unassigned.
- Day 1 maps to `2026-09-26`, Day 2 to `2026-09-27`. `availableDates: []` means unassigned; an absent field preserves legacy directory behaviour.
- Original domains and day labels are retained in tags. Descriptions show showcasing days in PWA and Android. Categories map to the app's existing category vocabulary.
- Organiser suggestions in the Notes column are not published as attendee descriptions. Website links and map positions are not inferred from prose.
- Preserve booth IDs when correcting names. Do not regenerate an existing ID from a renamed project.

The schedule importer merges `booths.json` on every refresh. **It does not fetch spreadsheet changes automatically.** Update this reviewed fixture when organisers change the sheet, compare against the previous records, then regenerate and validate the bundle. Missing rows or renamed projects require review before deletion or ID changes.

The PWA planner honours availability dates and does not schedule unassigned booths. Day selection/filtering in the booth directory, explicit booth map positions, automatic sheet ingestion and native booth-visit planning remain follow-up work. Matrix room assignments also require a real directory; no booth rooms are fabricated.

## Venue (getting there)

`venue-arrival.json` is the reviewed outdoor arrival block (issue #278), merged into the bundle as `venue` by the schedule importer on every refresh. It repeats the organiser's own wording and links; nothing in it was physically verified.

| Field                    | Value                                                     | Source (checked 10 September 2026)                                                            |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Name, city, region       | NIMHANS Convention Centre, Bengaluru, Karnataka           | [Event page](https://fossunited.org/indiafoss/2026) FAQ                                       |
| Map link and coordinates | `https://osmapp.org/way/1219285692#18.89/12.9431/77.5961` | Event page hero ("Open in OSM Maps"); same `map_link`/`map_coordinate` in `raw/event.json`    |
| Address                  | NIMHANS Convention Centre, Hosur Road, Bengaluru          | [Participant Guidelines](https://fossunited.org/indiafoss/guide), "Venue and Facilities"      |
| Travel guide             | linked as-is                                              | [Travel and Accommodation Guide](https://fossunited.org/indiafoss/guide/travel); not imported |

The OpenStreetMap feature is the building destination the organiser selected. It is not evidence of an accessible entrance, a walking route, parking or transport, and the app does not present it as one; indoor routing is tracked separately (#223). Update the file and `checkedAt` when the organiser pages change, then regenerate the bundle.

## Reproduce and publish

```sh
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts sync indiafoss-2026 --source fixture
pnpm --filter @indiafoss/event-sync test
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts publish indiafoss-2026
```

Use `--source live` to refresh the official schedule. Review generated changes and pass CI before merging. The web build copies published assets; Android packages the canonical normalized bundle directly. Keep `publication.json` unchanged until the organiser confirms a status change. The 2025 fixture remains an explicit archive.
