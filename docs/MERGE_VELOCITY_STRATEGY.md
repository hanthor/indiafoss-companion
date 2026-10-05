# Merge Velocity Strategy and Review Criteria

**Status**: Strategic planning document (hold-gated)  
**Date filed**: 2026-10-05  
**Portfolio scope**: 8 authorized repositories  
**Current state**: 124 held PRs across all repos; age 17-23 days; zero sustainable merge rate

## Problem Statement

The portfolio has accumulated 124 hold-gated PRs awaiting human review with no sustainable drain rate. PR age ranges from 17-23 days (created 2026-09-11 to 2026-10-01). Two repos (shrimply, indiafoss-chat-android) have zero actionable issues, meaning all work is in PR form waiting on merge decisions.

This is not a CI or code quality problem — it is a **review capacity ceiling**. PRs are authored by hive agents with CI typically green; the bottleneck is human decision-making and review throughput.

## Strategic Goals

1. **Establish sustainable merge rate**: Drain 5-7 PRs per week per repo (vs. current 0)
2. **Prioritize by risk and value**: Security/operational fixes merge before refactoring; planning docs before tests
3. **Unblock dependent work**: Foundational architecture PRs gate downstream refactors; identify and merge blockers first
4. **Clarify merge criteria**: Remove ambiguity about what qualifies a PR to merge without full review
5. **Reduce PR age variance**: Prevent PRs from aging >7 days without a merge/decline decision

## Merge Prioritization Framework

**Tier 1 (merge immediately if CI green, minimal review):**
- Security fixes (timeouts, checksums, header validation)
- Operational fixes (error logging, state cleanup, resource cleanup)
- Planning documents (roadmaps, runbooks, strategy docs)
- Documentation updates (no code changes)

**Tier 2 (merge after targeted review, low-risk refactoring):**
- Test coverage additions (if CI green and coverage >85%)
- Dead code removal (if no runtime imports remain)
- Dependency version bumps (if no API changes)
- Configuration consolidation (if backward compatible)

**Tier 3 (requires full architectural review):**
- New architecture extraction (spec parser, shared utilities)
- Feature-gating decisions (CUDA, platform support)
- API or contract changes (breaking changes, new integration points)

**Tier 4 (escalate for decision if age >5 days):**
- Blocked on maintainer decision (open question, design choice)
- Conflicting approaches (two different solutions to same problem)
- Risk/scope misalignment (PR scope evolved beyond original intent)

## Per-Repo Prioritization

### shrimply (22 held PRs, 0 actionable issues)

**Critical blockers:**
- PR #21 (CUDA gating): Architecture decision; needs maintainer clarity or separate design issue
- PR #19 (CUDA removal): May conflict with #21; needs decision on strategy

**Fast-track (Tier 1):**
- #24, #56, #59, #64: Security fixes (checksums, timeouts) — merge immediately
- #37: Bind server to loopback (security) — merge immediately

**Group and merge:**
- Test coverage PRs (#26, #45, #50, #60, #78, #84): 6 test PRs; batch merge to reduce rebasing

**Action needed:** Clarify CUDA strategy; then unblock security fixes.

### hummingbird-github (22 held PRs, 7 actionable issues)

**Critical blocker:**
- PR #20 (spec parser extraction): Foundational; gates PRs #35, #40, #76

**Fast-track (Tier 1):**
- #30, #79: Python utility improvements (safe subprocess) — low risk
- #25, #42, #43, #54, #69: Documentation — no code risk

**Group and merge:**
- Test coverage (#33, #48, #57, #63, #64, #80, #82, #83, #89): 9 test PRs; batch merge

**Action needed:** Unblock #20 (arch decision or accept as-is); then documentation tier 1s.

### reilly.asia (21 held PRs, 6 actionable issues)

**Critical blockers:**
- PR #35 (contact links): Architecture; gates #39 and refactoring tier

**Fast-track (Tier 1):**
- #77, #90: Security headers (helmet) — merge immediately
- #82, #94: Request timeouts — merge immediately
- #51, #60, #86: Documentation — merge immediately

**Group and merge:**
- Test coverage (#55, #64, #66, #83, #99): 5 test PRs; batch merge

**Action needed:** Fast-track security fixes (already available); escalate #35 for decision.

### indiafoss-companion (25 held PRs, 12 actionable issues)

**Critical blockers:**
- #730, #672, #976: Planning documents (runbook, slides, Q4 roadmap) — MUST merge; operational readiness depends on this

**Fast-track (Tier 1):**
- #789: Reject cleartext homeservers (security) — merge immediately
- #991: Profile fetch timeout (operational) — merge immediately
- #714: Android backup disable (privacy) — merge immediately
- #752, #808, #838, #872: Documentation fixes — merge immediately

**Group and merge:**
- Test coverage (#719, #810, #814, #887, #908, #909, #946): 7 test PRs; batch merge

**Action needed:** Fast-track planning PRs and security fixes; group test coverage.

### indiafoss-chat-android (13 held PRs, 0 actionable issues)

**Critical blocker:**
- No design issues open; all work in PR form suggests dependency on other repos' decisions (spec parser, etc.)

**Fast-track (Tier 1):**
- #89: Resource cleanup (logcat) — merge immediately
- #98: CA trust restriction (security) — merge immediately
- #107: Coverage class exclusion (test infrastructure) — merge immediately

**Group and merge:**
- Test coverage (#93, #99, #104): 3 test PRs; batch merge

**Action needed:** Clarify what's blocking review; may be waiting on messaging repo decisions.

## Implementation Steps

### Week 1: Fast-track Tier 1 (security, operational, planning)

1. Identify all Tier 1 PRs across repos (security, operations, planning, docs)
2. Batch-review each Tier 1 cluster (5-10 PRs per cluster)
3. Merge Tier 1s; expected drain: 30-40 PRs

### Week 2: Unblock architecture decisions

1. Escalate PRs blocked on maintainer decisions (#20 hummingbird, #21 shrimply, #35 reilly.asia)
2. File design decision issues if needed (separate from PRs)
3. Merge architecture PRs once decision is made

### Week 3: Tier 2 refactoring and test coverage

1. Batch test coverage PRs by module and merge in tranches
2. Merge low-risk refactoring (dependency bumps, dead code removal)
3. Expected drain: 30-40 PRs

### Week 4: Tier 3 architectural work and remaining items

1. Full review of architectural extractions
2. Resolve any remaining conflicts
3. Expected drain: remaining PRs

## Success Criteria

- **Week 1**: Tier 1 PRs merged; 124 → 80-90 held PRs remaining
- **Week 2**: Architecture decisions made; dependent refactors unblocked; 80-90 → 50-60 remaining
- **Week 3**: Test coverage batches merged; 50-60 → 20-30 remaining
- **Week 4**: Portfolio at sustainable steady state (0-5 held PRs awaiting next review cycle)

## Ongoing Governance

1. **7-day SLA**: No hold-gated PR should age beyond 7 days without a merge/decline/escalate decision
2. **Weekly triage**: Review held PRs by age; escalate any >5 days old
3. **Tier prioritization**: New PRs target Tier 1-2; Tier 3-4 require explicit approval before creation
4. **Review capacity**: Track review hours per week; scale prioritization if capacity changes

---

*Strategic planning document filed by strategist agent (ACMM L5 — hold-gated mode)*
