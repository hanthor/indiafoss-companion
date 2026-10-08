# IndiaFOSS Companion — Event-Day Runbook

**Purpose**: Triage and resolve schedule import and PWA deployment failures in real time while attendees are on the conference floor.

**Scope**: This runbook covers failures affecting the published programme and its delivery, not infrastructure or chat/mesh systems (which have separate playbooks).

---

## Quick Reference: Triage Order

If something is broken, check in this order:

1. **Is the published programme current?** — Check `events/indiafoss-2026/published/manifest.json` revision date matches what should be live.
2. **Is the PWA serving that revision?** — Check the PWA's `/index.html` Cache-Busting header or open DevTools → Network → index.html → Headers.
3. **Everything else** — nightly APK, chat mesh, gateway, etc. None of these prevent attendees from reading today's room.

Only (1) can show an attendee the wrong room. (2) can show them yesterday's. (3) is inconvenient but not mission-critical.

---

## The Schedule Import Is Stuck

### Problem Recognition

- `schedule-sync` workflow did not run, or ran but didn't merge the change
- Attendee reports: "The app says [Session X] is in Hall B, but I'm here in Hall C"
- OR: New session added, doesn't appear in app, event starts in 90 minutes

### Triage

1. Check the open PR in `hanthor/indiafoss-companion`:
   - Search for PR with title containing "schedule" or `schedule-sync`
   - Most recent candidate PR is likely the stuck change

2. Read the PR's `changes.<n>.json` summary:
   - If it's a bio/speaker/abstract edit → can wait until after the session
   - If it's a **new session in the next 2 hours** → urgent
   - If it's a **room/time change for a running session** → drop everything

3. Verify the candidate PR has passed CI:
   - Check all green checkmarks on the PR
   - The candidate has already run the full test suite

### Getting the Revision Out

**Prerequisites**: You have write access to `hanthor/indiafoss-companion` and can trigger GitHub Actions.

```bash
# 1. Merge the candidate PR (if not already merged)
# Go to the PR, click "Merge pull request" — CI is already passing

# 2. Trigger pages rebuild (publishes the PWA)
# Navigate to: Actions → Pages publish → Run workflow → main branch
# This re-runs site generation and updates GitHub Pages cache

# 3. Trigger nightly APK build
# Navigate to: Actions → Nightly Build → Run workflow → main branch
# The APK will be published to the Releases page as "nightly"

# 4. Verify rollout
# Wait ~2 minutes, then:
# - Check PWA: refresh https://hanthor.github.io/indiafoss-companion/
# - Check cache: Open DevTools → Inspect the index.html Cache-Control header
# - Verify app loaded the new schedule: Check the app's "About" screen for build date
```

### When the Import Itself Fails

The `schedule-sync` workflow ran but hit an error. The PR either doesn't exist or failed checks.

#### Step 1: Reproduce Locally

```bash
# In the indiafoss-companion repo:

# Try importing from the live source
npm run event-sync -- sync --source live --event indiafoss-2026 --publish

# If that fails, collect the error output and check:
# - Is Pretalx API responding? (test: curl https://indiafoss.fossunited.org/api/events/indiafoss-2026/schedule/export/json/v1/)
# - Is the Pretalx token valid? (check PRETALX_TOKEN env var)
# - Is the local clone stale? (git pull origin main && npm install)
```

#### Step 2: Distinguish Upstream from Pipeline

```bash
# Try the fixture (pre-recorded sample data)
npm run event-sync -- sync --source fixture --event indiafoss-2026 --publish

# If fixture works: Problem is upstream (Pretalx API, network, token)
# If fixture also fails: Problem is in the pipeline (code, schema, validation)
```

#### Step 3: Decision Tree

| Scenario | Action | Escalate To |
|----------|--------|-------------|
| Pretalx API is down | Wait for Pretalx recovery; check status page | FOSS United ops |
| Token is expired | Rotate in CI secrets; restart sync | Maintainer (needs `admin` role) |
| Pipeline fails on fixture | Code bug; check error logs against recent changes | Developer on-call |
| Network intermittent | Retry; if persists 5+ min, declare Pretalx unreachable | Ops/venue network team |

#### Step 4: Never Hand-Edit Published Content

Files under `events/indiafoss-2026/published/` are content-addressed (part of the cache key). Manual edits break reproducibility and can't be reverted by re-running the import.

If a manual fix is required (e.g., a speaker name typo that Pretalx won't update), **file it as an incident** after the event, don't fix it by hand.

---

## When Should I Intervene? (Decision Tree)

### YES — Intervene immediately:

- [ ] New session added in next 2 hours (affects attendee routing)
- [ ] Session moved to a different room (time-sensitive)
- [ ] Critical speaker info changed (bio, abstract)
- [ ] Published programme is >15 minutes out of sync

### NO — Leave alone (attendees can work around):

- [ ] Nightly APK build failed (they have yesterdays's release)
- [ ] Chat mesh peer discovery slow (federation fallback available)
- [ ] Gateway experiencing high latency (not a binary failure)
- [ ] Venue map `_draft` shows estimated routes (clearly labeled)
- [ ] Minor speaker bio typos (visible next event sync)

---

## After an Incident

Do not assume the problem is fixed just because you restarted the workflow or ran a one-off sync.

### Before closing

1. **Document what happened**:
   - Time, what was broken, what you did to fix it
   - Open an issue with label `incident-response` and link this runbook

2. **File the root cause**:
   - If it's a code bug (e.g., schedule-sync wait-loop failing to detect success), file a PR with a fix
   - If it's infrastructure (token rotation, API limits), document the playbook in this runbook

3. **Verify the fix survives**:
   - Let the next scheduled sync run (~15 min later) complete without manual intervention
   - If it fails again, escalate — there's a deeper problem

### Post-event review

After IndiaFOSS 2026 closes:
- Audit all incidents from this runbook
- Move one-off interventions into automated checks (CI gates, alerting)
- Update this runbook with new patterns discovered

---

## Contact & Escalation

| Issue | Contact | How |
|-------|---------|-----|
| Pretalx API is down | FOSS United ops | #indiaconf-ops Slack |
| Schedule changes won't merge | Schedule team | @schedule-maintainer on PR |
| PWA cache not updating | GitHub Pages docs | Check GH Actions logs; may be CDN lag |
| Attendee reports wrong room | Venue team | Gather session ID + room name; file incident |
| Code bug in schedule-sync | Development team | Link to error logs + incident issue |

---

## Appendix: Key Files & Commands

### Configuration

- Schedule source: `https://indiafoss.fossunited.org/api/events/indiafoss-2026/schedule/export/json/v1/`
- Published output: `events/indiafoss-2026/published/`
- Manifest (current revision): `events/indiafoss-2026/published/manifest.json`

### Commands

```bash
# Full sync (what the workflow runs)
npm run event-sync -- sync --source live --event indiafoss-2026 --publish

# Dry-run (check without publishing)
npm run event-sync -- sync --source live --event indiafoss-2026

# Test with fixture
npm run event-sync -- sync --source fixture --event indiafoss-2026 --publish

# View current published revision
cat events/indiafoss-2026/published/manifest.json | jq .revision

# Check when manifest was last updated
ls -la events/indiafoss-2026/published/manifest.json
```

### Workflow Status

- Schedule sync trigger: `.github/workflows/schedule-sync.yml` (runs every 15 min during event)
- Pages publish: `.github/workflows/pages.yml` (triggered by schedule-sync merge)
- Nightly APK: `.github/workflows/nightly.yml` (triggered by schedule-sync merge)

**Note**: Bot-authored pushes do not trigger workflows by default. Manual dispatch is required if `schedule-sync.yml` merges but `pages.yml` doesn't fire.

---

**Effective**: 2026-10-08  
**Last Updated**: From repository state at 659e837  
**Review Cycle**: After each event (quarterly for off-season)
