# IndiaFOSS 2026 draft programme

Captured from the [published draft](https://fossunited.org/dashboard/schedule/indiafoss/2026) on 8 September 2026. This is current **draft** data, not the final timetable. Web and Android display its draft status from `publication.json` through `sourceMetadata.scheduleStatus`.

The capture contains 111 programme entries, 90 speakers, six physical rooms and eight named devrooms on 26–27 September. It includes breaks and ceremonies; those counts are not 111 accepted talks. Separate 25 September workshops are not in this capture. Booths and Matrix rooms have not been fabricated.

`provenance.json` records endpoints, sanitisation, input hashes and actual same-room overlaps. Repeated lunch/opening entries in different rooms are retained. The RTOS overlap is preserved so full-devroom planning can flag it.

Reproduce locally without network:

```sh
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts sync indiafoss-2026 --source fixture
pnpm --filter @indiafoss/sources test
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts publish indiafoss-2026
```

Refresh from the public source with `sync indiafoss-2026 --source live`; update captured inputs/provenance together before accepting a new revision. Keep `publication.json` as draft until the organiser actually confirms otherwise. The 2025 fixture remains available explicitly as an archived programme.

`custom_question_1` on the 2026 linked proposals supplies programme identity. Intro rows supply the start of each devroom; following unlinked programme rows inherit it until the meal break. Physical `locationId` remains independent. Preserve stable upstream row IDs across edits. Review new or renamed intro labels on every capture.
