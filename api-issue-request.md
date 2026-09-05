# NVIDIA Speech Recognition API Access Issue – Tipper Demo Project

Hi,

I'm working on the Tipper demo project and facing an issue with the NVIDIA Speech-to-Text (ASR) API integration.

## Problem

The NVIDIA Whisper ASR endpoint is returning a `PermissionDenied` error when called via gRPC. The error occurs when the fitter tries to record voice input for tyre data entry (pressure check, fitment, inspection, etc.). The voice input feature is critical for the demo as it's the primary data entry method for fitters in the field.

## What I Need

1. Verify that the NVIDIA Build API key (`nvapi-...`) has **"Public API Endpoints"** permission enabled for our account.
2. Or provide a valid/updated **function-id** for the Whisper Large v3 model from `https://build.nvidia.com/openai/whisper-large-v3/api` — the current one (`b702f636-f60c-4a3d-a6f4-f3568c13bd7d`) may have changed.

## Alternative Approach

If the NVIDIA API issue cannot be resolved quickly, we are open to exploring other ASR providers. Some options we can consider:

- **OpenAI Whisper API** (`api.openai.com`) — REST-based, $0.006/min, widely used
- **Google Cloud Speech-to-Text** — REST/gRPC, pay-per-use
- **Browser Web Speech API** — free, built into Chrome/Edge, no API key needed

We can switch to any of these with minimal code changes if NVIDIA access cannot be enabled in time.

## Impact

Without this, voice recording in the fitter app won't work, which blocks the live demo.

Please let me know how to proceed.

Thanks
