# Fast local dictation on the RTX 5090 laptop

On September 9, 2026, this workstation was configured for **Whisper Tiny, English, CUDA**, with **Qwen3.5 2B Q4 cleanup on the NVIDIA Vulkan device**. The machine has an NVIDIA GeForce RTX 5090 Laptop GPU with approximately 24 GB VRAM and also exposes Intel integrated graphics. This is a workstation setting, not a forced default for other installations. Meeting and upload model choices remain independent.

## Observed timing

Three synthesized English clips, 6.3–9.0 seconds long, were sent to local inference servers. HTTP/WebSocket request times exclude audio capture, model startup, AI cleanup, and paste:

| Model and runtime                         | Observed request times |
| ----------------------------------------- | ---------------------- |
| Whisper Tiny, CUDA                        | 26–111 ms              |
| Whisper Base, CUDA                        | 30–101 ms              |
| Parakeet TDT 0.6B v3, bundled CPU runtime | 179–247 ms             |

Tiny had the lowest median in this small comparison (30 ms; Base 37 ms; Parakeet 184 ms). These are limited synthetic smoke measurements, not a comprehensive benchmark or a claim that Tiny is fastest for every recording. Whisper models omitted or substituted some words in the synthetic samples; Parakeet preserved the words better in these three clips. Tiny was selected for the requested speed priority.

The complete app was then checked with an approximately 11-second test recording and automatic paste into a native Wayland GTK4 field:

- Double-tap hands-free, then tap to finish: about **1.9 seconds** from finishing to pasted text. The app recorded 198 ms for speech transcription, 781 ms for cleanup, and 730 ms for paste.
- Hold Right Ctrl, then release: about **1.5 seconds** from release to pasted text.

Models were already loaded for these tests. Cold starts, longer recordings, GPU contention, microphone quality, and destination applications can change latency and accuracy. Speech recognition and AI cleanup remain local. Test history entries were removed, and the app was restarted with the real microphone and no debugging port.

## Linux GPU runtime settings

The downloaded Whisper CUDA executable initially failed because `libcudart.so.12` and `libcublas.so.12` were outside the dynamic loader's search path. Compatible CUDA 12.8 libraries were already installed with local Ollama. Cosmic Wispr now supports a persisted `WHISPER_CUDA_LIBRARY_PATH` in its user-data `.env`, containing the absolute directory or colon-separated directories for an existing trusted CUDA runtime. It is added only to the Whisper CUDA child's library search path, together with the executable's own directory. The desktop's global environment is unchanged. After correcting libraries, retry GPU acceleration to clear an earlier saved failure.

For local cleanup on hybrid graphics systems, `LLAMA_VULKAN_DEVICE` can name a device returned by the installed llama server's `--list-devices` command. On this laptop, `Vulkan1` is the RTX 5090 and `Vulkan0` is Intel graphics. Only Vulkan launches receive this selection; CPU fallback omits it. Device indices should be checked again after hardware or driver changes. Restart the app after changing either setting.

The running app reported `gpuBackend: cuda`, `gpuAccelerated: true`, and `modelName: tiny`. Its cleanup server was launched with `--device Vulkan1`. Existing model downloads were retained so a more accurate speech model can be selected later in Settings.
