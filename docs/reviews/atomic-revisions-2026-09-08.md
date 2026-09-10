# Atomic schedule revision adoption

This advances the web portion of #190. The original reinstatement diff fix was already present; the remaining web failure was non-atomic persistence and loss of the pending download when saving failed.

`CompanionStorage.saveEventRevision` commits the event record and compatibility revision setting in one IndexedDB transaction. The event record carries its own revision, so standalone legacy revision stamps cannot incorrectly suppress a needed refresh. Older/equal writers cannot replace a coherently stored newer revision. Existing preferences, notes and personal plans are outside that transaction.

The update flow validates the shared manifest contract and event identity before staging the bundle. It applies only the downloaded, validated proposal, retains that proposal after a failed save, and shows an actionable retry message. An unrelated event's pending update is not displayed or applied. Metadata-only revisions use the same atomic commit without an announcement; reinstated talks remain explicit changes.

Validation: storage transaction rollback/retry, concurrent writers, legacy stamp repair and invalid revisions; browser save failure/retry, metadata persistence across reload, wrong-event manifest rejection, reinstatement/bookmark preservation and existing update/personal-state flows. Existing fixture manifests now include the required generation timestamp.

Remaining #190 work includes native crash-recovery evidence and verification of downloaded content digests against manifests. #189 still owns per-event check freshness, last-success reporting and the full reconnect/state-preservation scenario. No automatic background execution or untrusted peer bundle distribution is added here.
