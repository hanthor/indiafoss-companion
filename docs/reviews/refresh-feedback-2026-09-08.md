# Schedule refresh feedback — 8 September 2026

Settings reads the active event's stored revision and displays its last successful
check. Check timestamps persist per event; a failed check leaves the previous
success visible alongside a non-blocking error and retry button. A cached bundle
without an atomic revision record is described as such, without claiming nothing
has ever been downloaded.

A failed forced check now clears the freshness gate's earlier success, allowing
reconnect to retry immediately. Persisted display timestamps do not suppress
network checks after a reload. Status persistence is best effort and independent
of atomic schedule adoption.

Validation: 82 web unit tests and 12 update browser scenarios pass. Browser
coverage includes the archived event's revision in Settings, persisted success
after a failed reload check, and offline-to-online adoption without a reload
preserving preference, note and custom-block records. Notes currently have a
storage API but no editor, so that scenario seeds records directly. Existing
browser tests cover preference controls and plan rendering separately. Web lint,
typecheck and production build pass with three existing CSS warnings. The
390-pixel Settings view was inspected locally.

The cold-start recovery scenario enables the service worker, reloads the cached
app with networking disabled, then restores connectivity and adopts a changed
session without another reload. Published responses are injected at the page
fetch boundary because service-worker requests bypass page routing. Personal
records are compared before and after. The separate full offline attendee gate
also passes.

Manifests are excluded from service-worker precaching: an online freshness check
must reach the network. Cached event bundles remain available offline. Offline
checks report failure without advancing the successful-check timestamp.

Periodic failures back off from the normal interval, doubling up to 15 minutes.
Successful checks reset the delay. Hidden/offline tabs do not poll; reconnect,
foreground return and manual refresh can retry immediately. Normal freshness is
60 seconds; each attempt has a 12-second manifest-plus-asset timeout. Concurrent
checks coalesce per event and serialize between events.
