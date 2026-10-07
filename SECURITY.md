# Security Vulnerability Disclosure and Incident Response

This document defines how to report security vulnerabilities in IndiaFOSS projects, our incident response procedures, and timelines for security fixes.

## Overview

IndiaFOSS Companion, Chat, and Chat-Android are used at live conferences with thousands of attendees. Security issues affecting confidentiality, integrity, or availability of attendee data require rapid response and careful coordination to avoid public disclosure before patches are available.

This policy follows responsible disclosure principles: reporters get time to patch before public disclosure, and maintainers commit to timely fixes.

## Reporting a Vulnerability

### Where to Report

**Primary channel (confidential):**
```
security@indiafoss.fossunited.org
```

**GitHub Security Advisory (if available):**
Use GitHub's [security advisory feature](https://docs.github.com/en/code-security/security-advisories/privately-reporting-a-security-vulnerability) to report directly on the repository (preferred for authenticated researchers).

**If no response within 48 hours:**
- Email again with "SECURITY: " prefix in subject
- Contact project maintainer directly (see CONTRIBUTORS.md or GitHub profile)

### What to Include

Please provide:

1. **Description** — What is the vulnerability? (e.g., SQL injection, XSS, privilege escalation)
2. **Impact** — Who is affected? (users, developers, infrastructure)
3. **Severity** — Your assessment (critical/high/medium/low, see below)
4. **Proof of concept** — Steps to reproduce (code sample or test case)
5. **Affected versions** — Which releases/branches have the issue?
6. **Fix suggestion** (optional) — Do you have a proposed fix?
7. **Timeline preference** — When should we coordinate public disclosure? (default: 90 days)

### Format Example

```
Subject: SECURITY: SQL injection in user profile import

Body:
Vulnerability: SQL injection in UserProfileImporter.kt
Severity: High
Affected: v0.1.0-nightly, chat-android main branch

The profile import endpoint does not parameterize database queries, allowing 
attackers to inject SQL via malicious profile data.

Proof of concept:
[Code or steps]

Suggested fix:
Use parameterized queries in PreparedStatement

Timeline: 90 days standard embargo
```

## Severity Classification

### Critical (24-hour SLA)

- Remote code execution without user interaction
- Complete data breach (all attendee data accessible)
- Attendee private keys compromised
- Infrastructure compromise (database, servers)

**Action:** Emergency patch released same day; public disclosure within 24 hours.

**Example:** Buffer overflow allowing arbitrary code execution in native rendering.

### High (72-hour SLA)

- Privilege escalation (user → admin)
- Data breach of sensitive attendee subset (emails, phone numbers)
- Cryptographic weakness allowing message decryption
- Denial of service (app crash, unavailability)

**Action:** Patch released within 3 days; coordinated public disclosure.

**Example:** Missing authorization check allows reading other users' personal data.

### Medium (1-week SLA)

- Information disclosure (non-sensitive metadata)
- Logic bugs affecting conference features
- Performance issues impacting usability
- Unintended state exposure (ratings, preferences leaking between users)

**Action:** Patch released within 1 week; disclosed in next release notes.

**Example:** Cache poisoning allows seeing another user's session rankings.

### Low (best-effort, 2-week SLA)

- Documentation inaccuracies
- UI/UX issues with security implications
- Deprecated feature misuse
- Non-exploitable edge cases

**Action:** Patched in normal development cycle (next release).

**Example:** Misleading security warning that doesn't affect actual security.

## Incident Response Process

### Step 1: Report Received (Immediate)

- Acknowledgment email sent within 24 hours
- Reporter assigned a reference number (e.g., IFC-2027-001)
- Confidentiality confirmed; reporter's identity protected

### Step 2: Triage (24-48 hours)

- Issue reproduced and severity confirmed
- Affected components and versions identified
- Fix difficulty and timeline estimated
- Reporter notified of triage results

### Step 3: Fix Development (Severity-dependent)

- Development team creates fix
- Code review by maintainer (may be security-focused)
- Unit tests added for regression prevention
- Fix staged on private branch (not public until disclosure)

### Step 4: Patch Release

**For critical/high severity:**
- Security-only release published (may skip normal release cycle)
- Release notes mention "security fix" without details
- Patch backported to maintained versions

**For medium/low severity:**
- Included in next regular release
- Release notes describe fix once public

### Step 5: Public Disclosure

**Coordinated disclosure timeline:**

| Severity | Reporter notified | Public disclosure | Grace period |
|----------|-------------------|-------------------|--------------|
| Critical | Day 1 | Day 1 (after patch) | 0 days |
| High | Day 3 | Day 5 (after patch) | 1-2 days |
| Medium | Day 7 | Day 14 (after patch) | Up to 7 days |
| Low | Day 14+ | Next release notes | Variable |

**Disclosure format:**

1. GitHub security advisory published
2. Tweet/announcement posted
3. Release notes updated with vulnerability details
4. Blog post (for critical/high) explaining context and mitigation

### Step 6: Follow-up (30+ days)

- Reporter given 30 days post-disclosure to ask questions
- Maintainers gather lessons learned
- Process improvements documented (if needed)

## Communication

### During Embargo (Confidential)

- Only reporter, maintainers, and necessary developers know
- No public GitHub issues or pull requests
- No social media mentions
- No forwarding to third parties without consent

### At Disclosure (Public)

**GitHub Security Advisory includes:**
- Vulnerability description
- Affected versions
- Fix version/date
- CWE classification (if applicable)
- CVSS score (if applicable)

**Release notes include:**
```
## Security

### Fixed

- Fixed [CRITICAL/HIGH/MEDIUM]: [Brief description]
  Coordinated with [Reporter Name/Handle] via responsible disclosure.
  See GitHub security advisory GH-2027-001 for details.
```

**Blog/announcement includes:**
```
We have released security updates for IndiaFOSS Companion addressing [X] vulnerabilities.

Severity: [critical/high/medium/low]
Affected versions: [list]
Fixed in: [version/date]

[Description of issue, impact, and mitigation]

Please update to the latest version.
```

## Maintainer Responsibilities

1. **Respond** — Acknowledge reports within 24 hours
2. **Triage** — Confirm/assess within 48 hours
3. **Fix** — Patch per SLA (critical: 24h, high: 72h, medium: 1w, low: 2w)
4. **Coordinate** — Notify reporter of disclosure timeline before going public
5. **Document** — Update SECURITY.md if processes change
6. **Close loop** — Reply to reporter after public disclosure

## Researcher Responsibilities

1. **Report privately** — Use security@indiafoss.fossunited.org or GitHub advisory
2. **Verify impact** — Test on actual version before reporting
3. **Respect embargo** — Don't disclose publicly or to third parties without permission
4. **Follow timeline** — Give maintainers agreed-upon grace period
5. **Communicate clearly** — Provide detailed reproduction steps

## Out of Scope

These are **not** security vulnerabilities:

- User misconfiguration (e.g., sharing QR code publicly)
- Hypothetical future features that don't exist yet
- Performance issues that don't cause availability loss
- Feature requests disguised as "security enhancement"
- Social engineering or phishing attacks
- Third-party service compromises (e.g., stolen GitHub credentials)

## Known Security Limitations

See [docs/privacy.md](docs/privacy.md) for privacy model.

**Encrypted messaging limitations:**
- DMs work only within mesh or with remote access (see docs/messaging.md)
- Device verification is out-of-band (manual QR comparison)
- No forward secrecy (past messages decrypt if device compromised)

**Plugin security:**
- Plugins run with full app privileges (no sandboxing in preview)
- Malicious plugins can read all personal data and modify messages

## Questions?

- **Vulnerability to report?** Email security@indiafoss.fossunited.org
- **Process questions?** Open an issue on GitHub (non-security discussion)
- **Policy feedback?** Email maintainers; responsible disclosure policies should improve over time

## History

- **2026-10-06** — Initial policy published
