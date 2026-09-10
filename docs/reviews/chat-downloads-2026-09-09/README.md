# Chat download entry points

The Companion now offers a direct Android Chat APK download and release notes in Connect and Settings. Native Android has the download action beneath the contact card, with feedback if no browser can open it. The repository README links to the same public APK. Chat is labelled as a separate preview app, with Android installation guidance.

The target is Chat's stable `nightly` release asset. Ship this Companion change only after Chat PR #57 has produced a downloadable, verified public APK.

Local validation: both mobile browser entry points have the exact release URLs and no horizontal overflow. Web typecheck and lint pass. Screenshots show the Connect and Settings download cards; native build/emulator validation runs in CI. Public artifact availability and checksums must also be checked before merge.
