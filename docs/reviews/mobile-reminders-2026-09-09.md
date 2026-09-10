# Mobile browser reminders

Issue #268 showed notification permission granted but the test alert failing on Android. Both test and scheduled alerts used the `Notification` constructor, which is unsupported on most mobile browsers. They now share a delivery helper that uses the active service worker's `showNotification`, with desktop constructor fallback only when no active worker exists.

The worker handles notification taps within the deployed app scope. It focuses/navigates an existing Companion window or opens the target in a new one. Invalid or external destinations go to the app's Plan page. Cancelling a reminder during registration lookup prevents its delivery; rejected system calls do not create unhandled timer rejections.

Validation: 109 web unit tests passed, including delivery, rejection, cancellation and scoped click routing. A headed Chromium browser test delivered a real service-worker notification while the page constructor deliberately threw the mobile error. Headless Chromium denies OS notification permission despite its Permissions API override, so CI runs that specific check headed under Xvfb. Six reminder setup tests, four simulator/reminder quality tests and the offline attendee flow passed. Typecheck has zero errors and four existing warnings; lint passed.

This repairs the mobile delivery API. It does not turn page timers into offline/background alarms. Browser reminders still require an active app; physical Android/iPhone OS notification and lifecycle acceptance remains separate.
