# Evidence

The venue playbook's go/no-go requires each ladder rung's numbers "recorded in
the repository under `docs/evidence`". This directory is that record.

One file per rung per run day, named `rung<k>-<what>-<yyyy-mm-dd>.md`. A file
records the exact revisions, the exact command, the raw output, and what the
runner concluded — including a run that failed, which is evidence too. Numbers
in a table with no command above them are what this directory exists to
prevent: a claim nobody can re-run.

## Capability records

`records/<id>.json` is the machine-readable summary of a release or an
evidence run: exact component pins and one claim per capability, each with its
evidence level, topology, the evidence file above it points at, and what was
not covered. Records are produced by `just release-record`, validated by the
`CapabilityRecord` contract, and never overwritten. The app reads the current
one on its Settings page. A capability a record does not list is unavailable;
a claim recorded `supported: false` is a finding, not a gap.
