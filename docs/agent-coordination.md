# Cross-Repository Agent Coordination: Decision Framework

## Executive Summary

The Hive generates agent PRs at a uniform rate across 8 repositories, but review capacity is concentrated in 3. This creates a bottleneck where unmerged PRs keep tracking issues open, spawning duplicate work. This document establishes explicit per-repository decisions to replace implicit intent (silence) with clear commitments.

## The Problem

| Repository | Open PRs | Oldest PR (days) | Reviews on Oldest | Merges Ever |
|---|---|---|---|---|
| **hummingbird-github** | 29 | 17+ | 0 | **0** |
| **homebrew-tap** | 22 | 17+ | 0 | **0** |
| **shrimply** | 16 | 11+ | 0 | **0** |
| **rust-wayland-desktop** | 30 | new | 0 | **0** |
| **reilly.asia** | 26 | 17+ | 0 | **0** |
| indiafoss-companion | 12 | 2 | yes | yes |
| dotfiles | 9 | varies | yes | yes |
| indiafoss-chat-android | 8 | varies | yes | yes |

**Five repositories have never merged an agent PR.** Arrival is 5-12 PRs/week; drain is 0-2. The oldest 17-day-old PRs have zero reviews.

### Consequence: Duplicate Work

Unmerged PRs keep tracking issues open. When agents run again, they re-open the same work. Example: issue #816 tracked 18 of 72 held PRs as redundant reimplementations in 9 add/add-conflicting pairs, with median 33 hours between a PR and its duplicate.

### Cost: Review Attention as the Binding Constraint

This is not a CI problem (PR checks are green) or a code quality problem. It is review attention. The asymmetry between where work is generated (all 8 repos) and where it can land (3 repos) is currently zero.

## Three Options Per Repository

### Option A: Commit to Active Review

**Commitment**: Review or close agent PRs within 7 days.

**How**:
- Establish a review SLA in CONTRIBUTING.md
- If oldest PR exceeds 7 days without action, merge it, close it with feedback, or pause agents
- Document any exceptions

**Outcome**: Agent work flows through; tracking issues close; no duplicate accumulation.

### Option B: Pause Agents

**Commitment**: Stop opening agent PRs in this repository.

**How**:
- Agents file issues instead; no auto-PRs
- Mark pause explicitly (e.g., label on a pin issue or in README)
- Can be resumed when capacity returns

**Outcome**: Backlog stops growing; no stale PRs as noise.

### Option C: Triage and Reset

**Commitment**: Close stale held PRs; resume under A or B with a clean slate.

**How**:
- Review all held PRs older than 7 days
- Merge, close, or comment with timeline for each
- Clear expectations going forward

**Outcome**: Queue depth reflects real intent; no standing noise.

## Per-Repository Decision Checklist

**Maintainers: Please choose one option per repository and update this list.**

- [ ] **hummingbird-github**: Option ___
- [ ] **homebrew-tap**: Option ___
- [ ] **shrimply**: Option ___
- [ ] **rust-wayland-desktop**: Option ___
- [ ] **reilly.asia**: Option ___

## Structural Changes to Support These Choices

### 1. Agent PR Cap (for Option A repositories)

Set a maximum of 10 open agent PRs per repository. When the cap is reached:
- Agents file a meta-issue and pause
- Review or close enough PRs to drop below the cap
- Agents resume

This prevents accumulation of 25+ PRs against a maintainer with no bandwidth.

### 2. Review SLA (for Option A repositories)

Add to CONTRIBUTING.md:
> "Agent PRs (labeled `hold`) will receive initial review within 7 days. If we lack bandwidth, we will pause the agent for this repository rather than accumulate backlog."

### 3. Stale PR Triage (for Option C repositories)

Review all held PRs older than 7 days:
- Merge, close with reason, or comment with expected timeline
- Prevents backlog from persisting as invisible noise

## Escalation Path

If an Option A repository's PR age grows beyond 7 days:

1. **Week 1**: Comment asking for status
2. **Week 2**: Label with `needs-direction` and ask: "Review this PR, close it, or pause agents?"
3. **Beyond**: Pause agents until decision is made

## Related Issues and Context

- **Issue #821**: Original cross-repo bottleneck analysis with full metrics
- **Issue #816**: Duplicate held PRs from stalling (18 of 72 redundant pairs)
- **Issue #914**: Hive dedup race condition creating duplicate issues
- **Issue #67 (homebrew-tap)**: Separate CI blocker (brew doctor failing, workflow file, needs human fix)

## Next Steps

1. **Maintainer decision** (human): Choose Option A, B, or C for each of the 5 repositories; update this document
2. **Update repository docs** (if Option A): Add SLA to CONTRIBUTING.md
3. **Triage stale PRs** (if Option C): Close or update held PRs older than 7 days
4. **Implement cap** (if Option A): Hive will stop opening PRs when cap is reached

---

*Document: `docs/agent-coordination.md`*  
*Last updated: 2026-10-01*  
*Related: Issue #821*
