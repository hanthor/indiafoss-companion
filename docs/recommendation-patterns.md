# Interactive recommendations: examples and IndiaFOSS design

The useful pattern is **preference elicitation**: ask for lightweight feedback, update a person's interest model, then choose the next useful item. Swipe is one input method; it must feed the same stored choice as a button.

## Systems worth learning from

| System                                                                                                                                                    | Documented behavior                                                                                                            | Apply to IndiaFOSS                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [Pandora](https://help.pandora.com/s/article/Create-a-Station-1519949296261?language=en_US)                                                               | Thumbs feedback helps select what plays next on a station.                                                                     | A right swipe should immediately influence the next talk; let people undo feedback.                                                      |
| [YouTube Music](https://support.google.com/youtubemusic/answer/6313542?hl=en)                                                                             | Likes, dislikes and artist choices contribute to personalised recommendations.                                                 | Optional interest/devroom seeds provide a starting point; subsequent talk choices refine it.                                             |
| [Tinder](https://www.help.tinder.com/hc/en-us/articles/7606685697037-Powering-Tinder-The-Method-Behind-Our-Matching/)                                     | Likes, Nopes and profile information influence recommendations; Tinder says its current system does not use the old Elo score. | Use direct positive/negative preference signals and responsive cards. Do not mistake a swipe UI for a requirement to compare every pair. |
| [Spotify: explicit feedback research](https://research.atspotify.com/2021/10/let-me-ask-you-this-how-can-a-voice-assistant-elicit-explicit-user-feedback) | A skipped recommendation can reflect its context rather than dislike of the content.                                           | “Can't attend at that time” must not train the same negative signal as “Not interested.”                                                 |
| [Google Research: diverse preference elicitation](https://research.google/pubs/diverse-user-preference-elicitation-with-multi-armed-bandits/)             | Research examines diversity during preference elicitation and its effect on recommendation bias.                               | Show some less-sampled topics; do not keep asking about only the first topic someone liked.                                              |

These are public product descriptions and research, not access to the products' private ranking systems. The design below is our adaptation.

## The feedback loop

1. Optionally choose a few topics/devrooms, or start with a varied set of talks.
2. Right swipe / Want to go is a positive interest signal. Left swipe / Not interested excludes that talk and modestly lowers related-topic preference. Must go is a stronger positive plus an explicit scheduling constraint. Interrupted or vertical gestures are no answer.
3. Save the choice on-device, recompute the model from saved answers, and choose the next card. Undo recomputes without the removed signal.
4. Usually offer a related talk with a short explanation. Periodically offer a less-sampled topic so a first answer does not define the whole conference.
5. Let the attendee stop at any time and see a feasible plan. Explain time conflicts and devroom commitments; never infer dislike from schedule infeasibility.

## What the current local engine does

It learns track/tag affinity from explicit choices without a server, an account, telemetry, or an LLM download. This pass excludes generic format/audience labels from topical card scoring, preserves negative influence, and uses the saved-answer count to place exploration. Previously every rebuilt deck restarted its every-fourth-card policy, so consuming only the first card could prevent exploration entirely.

The current every-fourth-presentation policy is a deterministic baseline, **not a learned bandit** and not a research-proven optimum. Count history within the current eligible day/track pool; undo or changing that pool can change the sequence. Test actual repeated answer → recompute → first-card behavior, not just a static deck ordering.

## What to build next

Use optional topic/devroom seeds rather than a mandatory onboarding questionnaire. Add a user-facing “Why this talk?” and editable interests, with a neutral “Skip for now” separate from explicit dislike. Keep the whole-devroom reservation as a scheduling choice that saves answering every member.

If tag/track matching misses obvious similarities across devrooms, evaluate title/abstract similarity against a small curated set of talk pairs. A publisher-generated, versioned embedding sidecar can keep attendee preferences local; an on-device LLM is not required for the first useful system. Adopt this only if it improves held-out examples over the simple baseline. Do not call the current tag model semantic understanding.

Use completion of a useful, conflict-aware plan and observed user comprehension as the outcome. Do not optimise an endless swipe session, use ratings as a public popularity contest, or introduce analytics to measure this without a separate product decision.
