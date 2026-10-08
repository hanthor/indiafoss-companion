# IndiaFOSS Companion — Review Capacity and Merge Cadence Model

**Effective**: 2026-10-08  
**Purpose**: Establish weekly review throughput and decision authority to unblock held-PR queue  
**Target**: Zero PRs older than 7 days without merge/decline/escalate decision

---

## Current State

- **125 held PRs** across 8 repositories (average 7-20 per repo)
- **Zero merges** despite CI passing and code quality sufficient
- **Blocker**: Review capacity and decision-making, not code quality
- **Consequence**: Contributors see PRs age and stop submitting new work

A prioritization framework exists (Tier 1-4 by risk), but without assigned capacity and a guaranteed review window, prioritization is advisory only.

---

## Capacity Model

### Tier Classification

| Tier | Type | Review Window | Decision Authority | Merge Criteria |
|------|------|---------------|-------------------|-----------------|
| **1** | Security, ops, planning docs | 30-60 min | Async (single reviewer) | CI green + no objections after 24h |
| **2** | Test coverage, refactoring | 2-4 hour block | Batch review (domain lead) | CI green + 1 review + no conflicts |
| **3** | Architecture, complex logic | 4 hour session | Dedicated reviewer | CI green + 2 reviews + design alignment |
| **4** | Blocked on decisions | Escalate | Design team | File design issue; do NOT hold PR |

### Weekly Review Cadence (Example: indiafoss-companion)

**Monday 9:00–10:00 AM** — Tier 1 Fast-Track Batch
- Security fixes, deployment docs, planning artifacts (ROADMAP, runbooks)
- Owner: Release lead (async review OK)
- Decision: Merge if CI green, comment with concerns if blocking
- Target: All Tier 1 → decision within 1 day

**Wednesday 10:00 AM–12:00 PM** — Tier 2 Domain Batch Review
- Test coverage PRs (grouped by module: messaging, contacts, contracts)
- Refactoring PRs (consolidation, extraction, dead-code removal)
- Owner: Tech lead for domain
- Decision: Batch approve if CI green + design aligns
- Target: All Tier 2 candidates reviewed within 3 days

**Friday 2:00–4:00 PM** — Tier 3 Architecture Session OR Escalation Triage
- Complex logic changes, protocol implementation, new dependencies
- OR: Escalation triage for Tier 4 items (file design issues)
- Owner: Architect or senior reviewer
- Decision: Either approve + merge, or escalate to design
- Target: 1 Tier 3 PR merged OR 1 design issue filed per week

### Implementation Checklist

- [ ] **Week 1**: Designate review owners for Tier 1, 2, 3
- [ ] **Week 1**: Publish calendar with recurring review blocks
- [ ] **Week 1**: Document decision authority (who can approve each tier)
- [ ] **Week 2**: Run first cadence; log metrics (PRs reviewed, merged, escalated)
- [ ] **Week 3**: Adjust cadence based on velocity (add/reduce slots if needed)
- [ ] **Week 4**: Publish retrospective; confirm zero PRs older than 7 days

---

## Success Metrics

### Primary

- **Zero PRs older than 7 days without a decision** (merge/decline/escalate)
- **Weekly merge target**: 3-5 PRs (current: 0; goal: restore at-event cadence)

### Secondary

- **Review latency**: Tier 1 <24h, Tier 2 <72h, Tier 3 <168h from submission
- **Escape rate**: <10% of PRs escalated to design without resolution
- **Contributor confidence**: Survey after 4 weeks to measure motivation

### Dashboard (Track Weekly)

| Week | T1 Merged | T2 Merged | T3 Merged | Escalated | Stale >7d | Notes |
|------|-----------|-----------|-----------|-----------|-----------|-------|
| Oct 8-14 | — | — | — | — | 0 | Baseline |
| Oct 15-21 | 2 | 1 | 1 | 1 | 0 | First full cadence |
| Oct 22-28 | 3 | 2 | 1 | 0 | 0 | Target steady-state |

---

## Why Cadence Works

1. **Predictable windows** — contributors know when reviews happen; not asking repeatedly
2. **Batch efficiency** — reviewing Tier 2 test PRs in one block finds patterns; faster than 1-by-1
3. **Escalation boundary** — Tier 4 issues don't block PRs; they become explicit decisions
4. **Capacity visibility** — "4 hours Friday" is defendable; "I'll review when I get to it" is not

---

## Transition Plan (First 4 Weeks)

### Week 1 (Oct 8–14): Foundation

1. Designate review owners:
   - Tier 1 lead: Release / Ops (30 min/week async)
   - Tier 2 lead: Tech lead (4 hours/week batched)
   - Tier 3 lead: Architect (4 hours/week)

2. Publish calendar (Google Calendar / GitHub Discussions):
   - Recurring time blocks with Zoom/Slack link
   - Auto-invite all contributors

3. Document decision authority:
   - Who can approve merges for each tier?
   - Is async approval via PR comment sufficient for Tier 1?
   - Who escalates to Tier 4?

4. Triage the 125 held PRs into buckets (1 hour):
   - Assign each to Tier 1–4
   - Flag Tier 4 blocking-decision PRs

### Week 2 (Oct 15–21): First Full Cadence

1. Hold all three review blocks on schedule
2. Log metrics for each block:
   - PRs reviewed, merged, declined, escalated
   - Time spent vs. estimated
3. Debrief: Did the cadence work? Adjust as needed

### Week 3 (Oct 22–28): Confirm Velocity

1. Run cadence again
2. Measure: All new PRs got a decision within SLA?
3. If yes: Publish as stable cadence
4. If no: Identify bottleneck (owner capacity, tier misclassification, etc.) and adjust

### Week 4 (Oct 29–Nov 4): Stabilize and Measure

1. Verify zero PRs older than 7 days
2. Survey contributors:
   - Do you know when your PR will be reviewed?
   - Is the review timely?
   - Would you submit more PRs if this pace continues?
3. Publish retrospective: What worked, what to adjust long-term

---

## Handling Escalations (Tier 4)

When a PR blocks on an **unresolved design decision** (e.g., architecture choice, security trade-off):

1. **Do NOT hold the PR waiting for a decision** — that defeats the purpose
2. **File a design issue** with the exact question, link the PR
3. **Label it** `needs-direction` or `needs-spec` (see ADR-0019)
4. **Close the PR** with a comment: "Moving this decision to issue #XXX; we'll re-cut the PR once we decide"
5. **Track the issue** as a meta-blocker in the capacity dashboard

Example:
> PR #1234 blocks on architecture decision about event scheduling (see issue #1250). Closing this PR; maintainers will re-cut from the same branch once the decision is made and issue #1250 is resolved.

---

## Long-term (Months 2+)

Once the capacity model is running smoothly (zero stale PRs, consistent merge rate):

1. **Automate metrics**: GitHub Actions workflow to flag PRs older than 7 days
2. **Rotate reviewers**: Tier 1/2/3 ownership rotates monthly to distribute load
3. **Publish SLAs**: Document review timelines in CONTRIBUTING.md
4. **Scale PR throughput**: If consistently exceeding targets, add a second Tier 2 batch or split domains

---

## Risk Mitigation

### Risk: "Review slots stay empty"

**Mitigation**: If a slot owner can't make a review block, they must delegate or move to next slot. No skipping — that breaks the cadence.

### Risk: "Too many PRs for one slot"

**Mitigation**: Tier them further. If 10 Tier 2 PRs are waiting, pick 3 this week and schedule 3 for next. Publish the order.

### Risk: "Contributors game the tiers"

**Mitigation**: Tier assignment is automatic based on change type (security → Tier 1, test → Tier 2, etc.). No self-promotion.

---

## Appendix: Tier Assignment Rules

| Change | Tier | Rationale |
|--------|------|-----------|
| Security fix (CVE, auth, encryption) | 1 | Blocks release; needs fast decision |
| Deployment ops (CI, infra, runbooks) | 1 | Enables other work; low risk |
| Planning artifact (ROADMAP, docs) | 1 | No code risk; enables strategy |
| Test coverage (new unit/integration tests) | 2 | Improves quality; reviewable in batch |
| Refactoring (extract, consolidate, rename) | 2 | Lower risk if tests pass; done together |
| Architecture (protocol, data structure) | 3 | Complex; needs deep review |
| Protocol change (Matrix, mesh, contracts) | 3 | High stakes; needs security + design review |
| Blocked on decision (#XXX) | 4 | Escalate; don't wait |

---

*Authored by: strategist agent (ACMM L5)*  
*Review cycle: Monthly (adjust cadence if metrics change)*  
*Next review: 2026-11-08*
