# Cross-Repository Agent Coordination

This document outlines how Hive agents and human maintainers coordinate across the 8 repositories in this instance.

## Context

As of 2026-10-01, the Hive instance spans:
- `hanthor/indiafoss-companion` (primary)
- `hanthor/indiafoss-chat-android`
- `hanthor/dotfiles`
- `hanthor/hummingbird-github`
- `hanthor/reilly.asia`
- `hanthor/homebrew-tap`
- `hanthor/shrimply`
- `hanthor/rust-wayland-desktop`

Agent PR arrival outpaces review and merge in 7 of 8 repositories, creating:
- **Duplicate work**: unmerged PRs keep tracking issues open, so new runs re-open the same work.
- **Bit-rot**: mergeable PRs age into conflicts, raising the cost of review later.
- **Signal loss**: bot-authored issues grow as a percentage of the tracker when PRs accumulate.

Five repositories (`hummingbird-github`, `homebrew-tap`, `shrimply`, `rust-wayland-desktop`, `reilly.asia`) have never merged an agent PR, despite receiving new ones every run.

See issue #821 for the full analysis and metrics.

## Decision: Per-Repository Agent Policy

Each repository must decide whether it wants agent PRs. This is a governance choice, not a technical one. The options are:

### Option A: Commit to review capacity

- Agents continue to open PRs in this repository.
- The repository commits to reviewing the current queue and maintaining a review SLA on new arrivals.
- A recommended SLA: review or merge within 7 days, or close with feedback.
- If backlog grows beyond capacity, escalate to pause agents in this repo rather than silent accumulation.

### Option B: Pause agents

- Agents are paused in this repository. They file issues instead but do not open PRs.
- Recommended when: review capacity is concentrated elsewhere, or the repository's own velocity does not support parallel agent work.
- Can be resumed when capacity is available.
- Clarifies intent rather than implying it through non-response.

### Option C: Close and reset

- Existing held PRs are reviewed and triaged: close without merge those that are no longer wanted.
- New agent PRs resume under Option A or Option B.
- Prevents backlog from persisting as noise in the tracker.

## Per-Repository Status (as of 2026-10-01)

| Repository | Status | Recommendation | Rationale |
|---|---|---|---|
| `indiafoss-companion` | Option A | Continue | 2 merges, active review, 12 open PRs, healthy drain |
| `indiafoss-chat-android` | Option A | Continue | 17 merges, 8 open PRs, healthy drain |
| `dotfiles` | Option A | Continue | 3 merges, 9 open PRs, only repo with arrivals < drain |
| `hummingbird-github` | Decision needed | A/B/C | 0 merges ever, 15 open, median age 30+ days, zero reviews on oldest PRs |
| `homebrew-tap` | Decision needed | A/B/C | 0 merges ever, 10 open, last merge 71 days ago, zero reviews on oldest PRs |
| `shrimply` | Decision needed | A/B/C | 0 merges ever, 8 open, zero reviews on oldest PRs |
| `rust-wayland-desktop` | Decision needed | A/B/C | 0 merges ever, 1 open, never received an agent PR until now |
| `reilly.asia` | Decision needed | A/B/C | 0 merges ever, 9 open, oldest PR is conflicting after 17 days, zero reviews |

## Structural Changes to Support Decisions

If the repository chooses Option A or B, consider:

1. **PR cap per repository**: Set a maximum number of open agent PRs. When the cap is reached, agents file issues and stop opening PRs. This prevents accumulation and forces a decision about review capacity before backlog grows.
   - Example: cap at 10 open agent PRs per repository.
   - When cap is reached: agents file a meta-issue and pause until review capacity frees slots.

2. **Stale PR triage**: Review held PRs older than 7 days (option C). Close those no longer wanted, so queue depth reflects real intent rather than accumulated silence.
   - Current affected PRs: 35 of 74 held PRs are older than 3 days; 17 are older than 7 days.

3. **Review SLA communication**: If Option A is chosen, post an explicit SLA in the repository's CONTRIBUTING guide or README (e.g., "Agent PRs will receive review within 7 days"). This aligns expectations and gives agents a signal for escalation.

## Escalation Path

If a repository chooses Option A but PR age grows beyond the stated SLA, the escalation path is:
1. **Week 1**: Post a comment on the PR asking for review status.
2. **Week 2**: Label the PR `needs-direction` and escalate to the maintainer with a decision request: "Review this PR, close it, or pause agents in this repo."
3. **Beyond**: Pause agents in that repository until decision is made.

## Next Steps

1. Maintainer review: Decide for each of the 5 repositories: Option A, B, or C?
2. Close stale PRs (option C): For any repository choosing C, triage the oldest held PRs and close those no longer wanted.
3. Update this doc with the decisions and any SLA commitments.
4. Implement PR caps and escalation if Option A is chosen.

---

*Last updated: 2026-10-01*  
*Related issues: #821 (cross-repo bottleneck), #816 (duplicate PRs from stalling), #806 (schedule-sync PR flood)*
