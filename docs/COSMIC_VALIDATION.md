# COSMIC workstation validation

Validated September 9, 2026, on a COSMIC Wayland session with XWayland available. This records the first functional fork; it is not a certification of every application or distribution.

Later the same day, [Right Ctrl hold and hands-free dictation](RIGHT_CTRL.md) and [GPU transcription](FAST_TRANSCRIPTION.md) were implemented and checked. Those follow-up reports supersede the initial hold/GPU limitations and model selection below.

## Checks

- Electron-runtime test suite: **3,767 passed, 0 failed**, 23 skipped and 1 todo (3,791 total).
- ESLint, TypeScript, renderer production build, and native Linux paste helper compilation passed.
- Completed the visible local onboarding flow, selected Whisper Base and Qwen3.5 2B Q4, and verified the saved shortcut.
- Pressed a synthesized Ctrl+Alt+Space through the real COSMIC custom shortcut dispatcher. Recorded a known spoken sample through Chromium's test microphone, pressed the shortcut again, and verified the final text in a separate GTK4 **native Wayland** text field.
- COSMIC's own toplevel protocol confirmed the GTK destination stayed active while recording. The result was: “The meeting is scheduled for tomorrow morning. Please bring the latest project notes.”
- The measured sample took about 1 second to transcribe, 6.2 seconds for local cleanup including model startup, and 1.1 seconds to paste. These are observations from one CPU inference run, not performance guarantees. Warm model runs were faster.
- Removed the generated test transcriptions afterward. Final workstation launch uses the real microphone, without fake capture or a debugging port. Actual user speech and application-specific behavior still need everyday use feedback.

## COSMIC fixes established by the smoke check

1. Desktop shortcuts dispatch via a session D-Bus service instead of relying on X11 global shortcuts to reach native Wayland apps.
2. The dictation overlay uses a non-focusing notification window type.
3. Clipboard writes retain the native `wl-copy` owner. Rewriting the clipboard through Electron/XWayland immediately afterward lost the native selection on this desktop. Both clipboard and primary selection are populated.
4. The temporary input device advertises standard keyboard keys and waits for desktop discovery before sending the paste shortcut. The original short-lived helper silently missed the paste in the same native test destination.

## Remaining boundaries

At this initial checkpoint, hold-to-talk and GPU inference had not been validated. Optional cloud account integration, packaged releases, automatic updates, and every target application remain outside this check. The installed launcher runs from the source checkout. Existing upstream model download sources and original icon artwork remain in use.
