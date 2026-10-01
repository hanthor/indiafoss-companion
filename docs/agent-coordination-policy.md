# Cross-Repository Agent Coordination Policy

## Context

The Hive instance spans 8 repositories with agents generating PRs at a uniform rate across all of them. However, PR review and merge capacity is concentrated in 1-2 repositories, creating:

- **5 repositories with zero agent PR merges ever** (hummingbird-github, homebrew-tap, shrimply, rust-wayland-desktop, reilly.asia)
- **23-30 open PRs per repository** in these five repos, many older than 10 days
- **Zero reviews** on the oldest PRs in four of these repositories
- **Duplicate work**: unmerged PRs keep tracking issues open, so new runs create duplicate findings and PRs

### Current Metrics (as of 2026-10-01)

| Repository | Open PRs | Oldest PR Age | Reviews on Oldest | Last Merge |
|---|---|---|---|---|
| hummingbird-github | 29 | 17+ days | 0 | never |
| homebrew-tap | 22 | 17+ days | 0 | 132 days ago |
| shrimply | 16 | 11+ days | 0 | 20+ days ago |
| rust-wayland-desktop | 30 | new | 0 | never |
| reilly.asia | 26 | 17+ days | 0 | 4 days ago |
| **indiafoss-companion** | **12** | **2 days** | **yes** | **2 days ago** |
| **dotfiles** | **9** | **varies** | **yes** | **1 day ago** |
| **indiafoss-chat-android** | **8** | **varies** | **yes** | **10 days ago** |

Three repositories (indiafoss-companion, dotfiles, indiafoss-chat-android) demonstrate that agent PRs *can* be reviewed and merged regularly. The five others have chosen—implicitly through non-response—not to prioritize agent work.

## Three Options Per Repository

This policy formalizes three explicit choices, replacing silent accumulation with clear intent:

### Option A: Active Review

**Commitment**: Review agent PRs within 7 days. Merge, close with feedback, or escalate to pause if capacity is insufficient.

**Responsibility**: 
- Maintainer monitors oldest open agent PR weekly
- If oldest PR exceeds 7 days without action, either merge/close it or trigger pause
- Document any SLA exceptions in the repository README or CONTRIBUTING

**Outcome**: Agent PRs flow through and close tracking issues, preventing duplicate work.

### Option B: Pause Agents

**Commitment**: Stop opening PRs in this repository. Agents file issues instead, but do not auto-open PRs.

**Responsibility**:
- Explicitly label pause via a `hold/agents-paused` label on a pin issue or in README
- Can be resumed when capacity returns

**Outcome**: Backlog stops growing; review attention is not fragmented between reviewing and dealing with stale PRs.

### Option C: Triage and Reset

**Commitment**: Review current held PRs; close those no longer wanted. Resume under Option A or B with a clean slate.

**Responsibility**:
- Close held PRs that are no longer relevant or have aged beyond useful feedback
- For PRs worth keeping: either merge or comment with expected timeline
- Resume agents under A or B

**Outcome**: Queue depth reflects real intent; no stale PRs as standing noise.

## Per-Repository Decision Template

Maintainers: **Choose one option per repository and state it here**. This becomes the operational contract:

- [ ] **hummingbird-github**: Option ___ 
- [ ] **homebrew-tap**: Option ___
- [ ] **shrimply**: Option ___
- [ ] **rust-wayland-desktop**: Option ___
- [ ] **reilly.asia**: Option ___

## Structural Changes to Support These Choices

### 1. Agent PR Cap (for Option A repositories)

Set a maximum of 10 open agent PRs per repository. When the cap is reached:
- Agents file a meta-issue and pause opening new PRs
- Review or close enough PRs to drop below the cap
- Agents resume

This prevents repositories from accumulating 25+ PRs against a maintainer who has no capacity to review them.

### 2. Review SLA (for Option A repositories)

Post in CONTRIBUTING.md or README:
> "Agent PRs (labeled `hold`) will receive initial review within 7 days. If urgent changes are needed, we will comment; if we have no bandwidth, we will pause the agent for this repository."

This sets expectations and gives agents a signal for escalation.

### 3. Stale PR Triage (for Option C repositories)

Review all held PRs older than 7 days:
- For each: merge it, close with "no longer wanted", or comment with expected review date
- If pausing agents (Option B), close all held PRs and explain in a comment

This prevents backlog from persisting as invisible noise.

## Escalation Path

If a repository chooses Option A but PR age grows beyond the stated SLA:

1. **Week 1**: Post a comment asking for status
2. **Week 2**: Label with `needs-direction` and escalate: "Review this PR, close it, or pause agents"
3. **Beyond**: Pause agents until decision is made

## Related Issues

- #821 (original cross-repo bottleneck analysis)
- #816 (duplicate held PRs from stalling)
- #67 (homebrew-tap CI dead — separate blocker, needs human/ISSUES_PRS_MERGE fix)

## Next Steps

1. **Maintainer decision**: Choose Option A, B, or C for each of the 5 repositories; edit this document
2. **Update repository docs**: Add SLA to CONTRIBUTING.md if choosing Option A
3. **Triage (if choosing C)**: Close or update stale held PRs
4. **Cap implementation (if choosing A)**: Agents will stop opening PRs when cap is reached

---

*Last updated: 2026-10-01*
*Document location: docs/agent-coordination-policy.md*
