// =====================================================
// VOICE CAPTURE SERVICE — Zero-Loss Architecture
// =====================================================
// Design: Audio blob is ALWAYS stored locally FIRST.
// Web Speech API provides instant on-device transcription.
// Server ASR runs in background for accuracy.
// Nothing is ever lost — even fully offline.
// =====================================================

const MIN_RECORDING_DURATION_MS = 800;
const MAX_RECORDING_DURATION_MS = 30000;
const BEEP_FREQUENCY = 880;
const BEEP_DURATION_MS = 150;
const DEFAULT_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || document.referrer.startsWith('android-app://');
}

function buildPermissionDeniedMessage() {
  return isStandaloneMode()
    ? 'Microphone access is blocked for DX Fitter. Open the app permission prompt again, or if you already blocked it, allow Microphone for DX Fitter from your phone app permissions.'
    : 'Microphone access is blocked. Allow microphone for this site in Chrome, then try again.';
}

function createMicError(message) {
  return new Error(message);
}

export async function getMicrophonePermissionState() {
  if (!window.isSecureContext) {
    return {
      state: 'insecure',
      message: 'DX Fitter needs HTTPS before microphone access can work.'
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      state: 'unsupported',
      message: 'This device/browser does not support microphone recording.'
    };
  }

  if (!navigator.permissions?.query) {
    return {
      state: 'prompt',
      message: 'Tap Enable Microphone to allow voice capture.'
    };
  }

  const status = await navigator.permissions.query({ name: 'microphone' }).catch(() => null);
  if (!status?.state) {
    return {
      state: 'prompt',
      message: 'Tap Enable Microphone to allow voice capture.'
    };
  }

  if (status.state === 'granted') {
    return {
      state: 'granted',
      message: 'Microphone is ready for voice capture.'
    };
  }

  if (status.state === 'denied') {
    return {
      state: 'denied',
      message: buildPermissionDeniedMessage()
    };
  }

  return {
    state: 'prompt',
    message: 'Tap Enable Microphone to allow voice capture.'
  };
}

export function toUserFacingMicrophoneError(err) {
  if (!window.isSecureContext) {
    return createMicError('DX Fitter needs HTTPS before microphone access can work.');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return createMicError('This device/browser does not support microphone recording.');
  }

  const name = String(err?.name || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();

  if (name === 'notallowederror' || name === 'securityerror' || msg.includes('permission') || msg.includes('denied') || msg.includes('not allowed')) {
    return createMicError(buildPermissionDeniedMessage());
  }

  if (name === 'notfounderror' || name === 'devicesnotfounderror' || msg.includes('not found') || msg.includes('no device')) {
    return createMicError('No microphone was found on this device. Connect a working mic and try again.');
  }

  if (name === 'notreadableerror' || name === 'trackstarterror' || msg.includes('could not start') || msg.includes('hardware')) {
    return createMicError('The microphone is busy or unavailable right now. Close other voice apps and try again.');
  }

  if (name === 'overconstrainederror') {
    return createMicError('This device could not start microphone capture with the required settings.');
  }

  return createMicError('DX Fitter could not access the microphone right now. Please try again.');
}

export async function openMicrophoneStream(audioConstraints = DEFAULT_AUDIO_CONSTRAINTS) {
  if (!window.isSecureContext) {
    throw createMicError('DX Fitter needs HTTPS before microphone access can work.');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw createMicError('This device/browser does not support microphone recording.');
  }

  try {
    return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
  } catch (error) {
    throw toUserFacingMicrophoneError(error);
  }
}

export async function requestMicrophonePermissionPrompt() {
  const stream = await openMicrophoneStream(DEFAULT_AUDIO_CONSTRAINTS);
  stream.getTracks().forEach((track) => track.stop());
  return {
    granted: true,
    message: 'Microphone access is enabled.'
  };
}

export class VoiceCaptureService {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.onStop = null;
    this.onError = null;
    this.onInterimTranscript = null;
    this.startedAt = null;
    this._maxTimer = null;
    this._speechRecognition = null;
    this._interimTranscript = '';
    this._finalTranscript = '';
    this._audioContext = null;
  }

  get isRecording() {
    return Boolean(this.mediaRecorder && this.mediaRecorder.state !== 'inactive');
  }

  get active() {
    return this.isRecording;
  }

  get durationMs() {
    if (!this.startedAt) return 0;
    return Date.now() - this.startedAt;
  }

  async start({ onStart, onStop, onError, onInterimTranscript } = {}) {
    if (this.isRecording) {
      return false;
    }

    let stream;
    try {
      stream = await openMicrophoneStream(DEFAULT_AUDIO_CONSTRAINTS);
    } catch (err) {
      console.warn('[VoiceCapture] getUserMedia failed:', err);
      throw (err instanceof Error ? err : toUserFacingMicrophoneError(err));
    }

    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    let recorder = null;
    for (const mimeType of mimeCandidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) {
        recorder = new MediaRecorder(stream, { mimeType });
        break;
      }
    }
    if (!recorder) {
      recorder = new MediaRecorder(stream);
    }

    this.stream = stream;
    this.mediaRecorder = recorder;
    this.chunks = [];
    this.onStart = typeof onStart === 'function' ? onStart : null;
    this.onStop = typeof onStop === 'function' ? onStop : null;
    this.onError = typeof onError === 'function' ? onError : null;
    this.onInterimTranscript = typeof onInterimTranscript === 'function' ? onInterimTranscript : null;
    this._interimTranscript = '';
    this._finalTranscript = '';

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      if (this.onError) {
        this.onError(event?.error || new Error('Voice recorder error'));
      }
      this.cleanup();
    };

    recorder.onstop = async () => {
      const duration = this.durationMs;
      const blob = new Blob(this.chunks, {
        type: recorder.mimeType || 'audio/webm'
      });

      // Stop Web Speech recognition
      this._stopSpeechRecognition();

      const onStopHandler = this.onStop;
      const clientTranscript = (this._finalTranscript || this._interimTranscript || '').trim();
      const recordingDuration = duration;

      this._cleanupInternals();

      // Reject too-short recordings (accidental taps)
      if (recordingDuration < MIN_RECORDING_DURATION_MS) {
        if (onStopHandler) {
          // Pass null blob to signal too-short
          await onStopHandler(null, {
            tooShort: true,
            durationMs: recordingDuration,
            clientTranscript: ''
          });
        }
        return;
      }

      // Haptic feedback on stop
      vibrateDevice(100);

      if (onStopHandler) {
        await onStopHandler(blob, {
          tooShort: false,
          durationMs: recordingDuration,
          clientTranscript
        });
      }
    };

    recorder.onstart = () => {
      this.startedAt = Date.now();
      
      // Haptic feedback on start
      vibrateDevice(200);

      // Play start beep (helps in noisy environments)
      playStartBeep();

      // Start Web Speech API in parallel for instant on-device transcription
      this._startSpeechRecognition();

      // Auto-stop after max duration to prevent forgotten recordings
      this._maxTimer = window.setTimeout(() => {
        if (this.isRecording) {
          this.stop();
        }
      }, MAX_RECORDING_DURATION_MS);

      if (this.onStart) {
        this.onStart();
      }
    };

    // Start recording audio
    recorder.start();

    return true;
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      // Clear max-duration timer
      if (this._maxTimer) {
        window.clearTimeout(this._maxTimer);
        this._maxTimer = null;
      }
      this.mediaRecorder.stop();
      return true;
    }
    return false;
  }

  cleanup() {
    this._stopSpeechRecognition();
    this._cleanupInternals();
  }

  _cleanupInternals() {
    if (this._maxTimer) {
      window.clearTimeout(this._maxTimer);
      this._maxTimer = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }

    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.onStop = null;
    this.onError = null;
    this.onInterimTranscript = null;
    this.startedAt = null;
  }

  // =====================================================
  // Web Speech API — On-Device Instant Transcription
  // =====================================================
  // Runs in parallel with MediaRecorder.
  // Provides interim results as user speaks (live text).
  // Final result used as immediate field value when offline.
  // =====================================================

  _startSpeechRecognition() {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      // Browser doesn't support Speech Recognition — this is fine
      // Audio is still captured by MediaRecorder
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // English-India for mixed Hindi/English fitter speech
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (final) {
          this._finalTranscript += final;
        }
        this._interimTranscript = interim;

        // Callback with live transcript for UI display
        if (this.onInterimTranscript) {
          const liveText = (this._finalTranscript + ' ' + this._interimTranscript).trim();
          this.onInterimTranscript(liveText);
        }
      };

      recognition.onerror = () => {
        // Speech recognition failed — this is OK.
        // MediaRecorder still has the audio.
        // Server ASR will process it later.
      };

      recognition.onend = () => {
        // Speech recognition ended naturally — do nothing
      };

      recognition.start();
      this._speechRecognition = recognition;
    } catch {
      // Failed to start Speech Recognition — not critical
      // Audio is still captured by MediaRecorder
    }
  }

  _stopSpeechRecognition() {
    if (this._speechRecognition) {
      try {
        this._speechRecognition.stop();
      } catch {
        // Already stopped
      }
      this._speechRecognition = null;
    }
  }
}

// =====================================================
// Audio Processing Utilities
// =====================================================

export async function convertAudioToWavBlob(rawBlob) {
  const sourceBuffer = await rawBlob.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Browser does not support audio decoding for voice capture');
  }

  const audioContext = new AudioContextClass();
  try {
    const decoded = await audioContext.decodeAudioData(sourceBuffer.slice(0));
    const wavBlob = encodeWavFromAudioBuffer(decoded);
    return {
      blob: wavBlob,
      durationSeconds: Number.isFinite(decoded.duration)
        ? Number(decoded.duration.toFixed(2))
        : null
    };
  } finally {
    await audioContext.close();
  }
}

function encodeWavFromAudioBuffer(audioBuffer) {
  const targetSampleRate = 16000;
  const mono = downmixToMono(audioBuffer);
  const samples = resampleLinear(mono, audioBuffer.sampleRate, targetSampleRate);
  const wav = buildWavPcm16(samples, targetSampleRate);
  return new Blob([wav], { type: 'audio/wav' });
}

function downmixToMono(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const output = new Float32Array(length);

  for (let channel = 0; channel < channels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      output[index] += data[index] / channels;
    }
  }

  return output;
}

function resampleLinear(source, sourceRate, targetRate) {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || sourceRate === targetRate) {
    return source;
  }

  const ratio = targetRate / sourceRate;
  const newLength = Math.max(1, Math.round(source.length * ratio));
  const result = new Float32Array(newLength);

  for (let index = 0; index < newLength; index += 1) {
    const srcPosition = index / ratio;
    const left = Math.floor(srcPosition);
    const right = Math.min(source.length - 1, left + 1);
    const interpolation = srcPosition - left;
    result[index] = source[left] * (1 - interpolation) + source[right] * interpolation;
  }

  return result;
}

function buildWavPcm16(floatSamples, sampleRate) {
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const dataSize = floatSamples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let index = 0; index < floatSamples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, floatSamples[index]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return buffer;
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

// =====================================================
// Feedback Utilities
// =====================================================

function vibrateDevice(ms) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch {
    // Vibration not supported — ignore
  }
}

function playStartBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(BEEP_FREQUENCY, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + BEEP_DURATION_MS / 1000);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + BEEP_DURATION_MS / 1000);

    // Cleanup after beep
    oscillator.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Beep failed — not critical
  }
}
