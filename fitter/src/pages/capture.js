import { getFormDefinition, resolveFormSteps } from '../config/forms.js';
import { SETTINGS_KEYS } from '../lib/constants.js';
import { getSetting } from '../lib/idb.js';
import { analyzeCaptureQuality, blobToDataUrl, createPreviewUrl, hashBlob } from '../lib/media.js';
import {
  getLastExtraction,
  initializeDeviceContext,
  runSyncCycle,
  saveCaptureSubmission
} from '../lib/queue-engine.js';
import { requireFitterSession } from '../lib/session.js';
import { createId, showToast, updateNetworkBadge } from '../lib/ui.js';
import { openMicrophoneStream } from '../services/voice-capture.js';

const session = requireFitterSession();
if (!session) {
  throw new Error('No valid fitter session');
}

const params = new URLSearchParams(window.location.search);
const formType = String(params.get('form') || '').trim().toLowerCase();
const form = getFormDefinition(formType);

if (!form) {
  window.location.replace('./index.html');
  throw new Error('Invalid form type');
}

const state = {
  formType,
  steps: [],
  context: null,
  captures: new Map(),
  detectedFields: {},
  pendingStepId: null,
  recorder: {
    active: false,
    stepId: null,
    mediaRecorder: null,
    stream: null,
    chunks: []
  }
};

const elements = {
  captureTitle: document.getElementById('captureTitle'),
  captureSubtitle: document.getElementById('captureSubtitle'),
  networkBadge: document.getElementById('networkBadge'),
  contextBadge: document.getElementById('contextBadge'),
  ctxVehicle: document.getElementById('ctxVehicle'),
  ctxPosition: document.getElementById('ctxPosition'),
  ctxShift: document.getElementById('ctxShift'),
  stepHint: document.getElementById('stepHint'),
  stepList: document.getElementById('stepList'),
  fieldList: document.getElementById('fieldList'),
  captureInput: document.getElementById('captureInput'),
  saveOfflineBtn: document.getElementById('saveOfflineBtn'),
  saveAndSyncBtn: document.getElementById('saveAndSyncBtn')
};

init().catch((error) => {
  console.error(error);
  showToast(error.message || 'Failed to initialize voice capture page', 'error');
});

async function init() {
  await initializeDeviceContext(session);

  const parsedPositions = parsePositionsParam(params.get('positions'));
  const contextFromQuery = {
    vehicle_no: params.get('vehicle') || '',
    position_code: params.get('position') || '',
    shift: params.get('shift') || '',
    positions: parsedPositions
  };

  const lastContext = (await getSetting(SETTINGS_KEYS.lastContext, {})) || {};
  state.context = {
    vehicle_no: String(contextFromQuery.vehicle_no || lastContext.vehicle_no || '').trim().toUpperCase(),
    position_code: String(contextFromQuery.position_code || lastContext.position_code || '').trim().toUpperCase(),
    shift: String(contextFromQuery.shift || lastContext.shift || '').trim(),
    positions: contextFromQuery.positions.length > 0
      ? contextFromQuery.positions
      : (Array.isArray(lastContext.positions)
        ? lastContext.positions.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
        : [])
  };

  state.steps = resolveFormSteps(formType);
  if (state.steps.length === 0) {
    showToast('No voice steps configured for this activity.', 'error');
    window.location.replace('./index.html');
    return;
  }

  bindEvents();
  renderHead();
  renderContext();
  await renderFieldPreview();
  renderSteps();

  updateNetworkBadge(elements.networkBadge);
  window.addEventListener('online', () => updateNetworkBadge(elements.networkBadge));
  window.addEventListener('offline', () => updateNetworkBadge(elements.networkBadge));
  window.addEventListener('beforeunload', cleanupRecording);
}

function bindEvents() {
  elements.captureInput.addEventListener('change', handleCaptureFile);
  elements.saveOfflineBtn.addEventListener('click', saveOffline);
  elements.saveAndSyncBtn.addEventListener('click', saveAndSync);
}

function renderHead() {
  elements.captureTitle.textContent = `${form.icon} ${form.label}`;
  elements.captureSubtitle.textContent = form.subtitle;
  updateStepHint();
}

function renderContext() {
  elements.ctxVehicle.textContent = state.context.vehicle_no || 'Not set';
  elements.ctxPosition.textContent = state.context.position_code || (state.context.positions[0] || 'Not set');
  elements.ctxShift.textContent = state.context.shift || 'Not set';

  const contextParts = [
    state.context.vehicle_no,
    state.context.position_code || state.context.positions[0],
    state.context.shift
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  elements.contextBadge.textContent = contextParts.length > 0
    ? contextParts.join(' • ')
    : 'Context pending';
}

async function renderFieldPreview() {
  const synced = (await getLastExtraction(formType)) || {};
  elements.fieldList.innerHTML = '';

  for (const field of form.backgroundFields) {
    const localValue = state.detectedFields[field.key];
    const value = hasValue(localValue) ? localValue : synced[field.key];
    const sourceLabel = hasValue(localValue)
      ? 'Detected'
      : (hasValue(synced[field.key]) ? 'Synced' : 'Pending');

    const li = document.createElement('li');
    li.innerHTML = `<span>${field.label}</span><strong>${formatValue(value)} <small>${sourceLabel}</small></strong>`;
    elements.fieldList.appendChild(li);
  }
}

function renderSteps() {
  elements.stepList.innerHTML = '';

  for (const [index, step] of state.steps.entries()) {
    const capture = state.captures.get(step.id);
    const statusClass = capture ? 'state-captured' : 'state-pending';
    const statusLabel = capture ? 'Captured' : 'Pending';
    const required = step.required !== false ? 'Required' : 'Optional';
    const extractedHint = formatStepExtractedHint(capture?.step_extracted);
    const stepFields = Array.isArray(step.expectedFields) && step.expectedFields.length > 0
      ? `<span class="chip chip-muted">Data: ${step.expectedFields.join(', ')}</span>`
      : '';

    const preview = capture?.previewUrl
      ? '<div class="preview-empty">Voice captured and stored.</div>'
      : '<div class="preview-empty">No recording yet</div>';

    const isRecordingThisStep = state.recorder.active && state.recorder.stepId === step.id;
    const recordLabel = isRecordingThisStep ? 'Stop Recording' : 'Record Voice';

    const card = document.createElement('article');
    card.className = 'step-card';
    card.innerHTML = `
      <div class="step-top">
        <div>
          <h3>${index + 1}. ${step.title}</h3>
          <p>${step.hint}</p>
          <small class="overlay">Guide: ${step.overlay}</small>
        </div>
        <div class="state-pill ${statusClass}">${statusLabel}</div>
      </div>
      <div class="step-meta">
        <span class="chip chip-muted">${required}</span>
        ${stepFields}
        ${capture ? `<span class="chip chip-muted">SHA ${capture.sha256.slice(0, 8)}</span>` : ''}
        ${capture?.pipeline?.asr_error ? '<span class="chip chip-offline">ASR issue</span>' : ''}
      </div>
      <div class="preview-box">${preview}</div>
      ${extractedHint ? `<p class="hint">Detected: ${extractedHint}</p>` : ''}
      <div class="step-actions">
        <button class="secondary-btn" data-step-id="${step.id}">${capture ? 'Replace Audio' : 'Upload Audio'}</button>
        <button class="primary-btn voice-record-btn${isRecordingThisStep ? ' is-recording' : ''}" data-record-step-id="${step.id}" ${state.recorder.active && !isRecordingThisStep ? 'disabled' : ''}>${recordLabel}</button>
      </div>
    `;

    const uploadButton = card.querySelector('button[data-step-id]');
    uploadButton.addEventListener('click', () => beginCapture(step));

    const recordButton = card.querySelector('button[data-record-step-id]');
    recordButton.addEventListener('click', () => toggleAudioRecording(step));

    elements.stepList.appendChild(card);
  }

  updateStepHint();
}

function beginCapture(step) {
  state.pendingStepId = step.id;
  elements.captureInput.accept = 'audio/*';
  elements.captureInput.removeAttribute('capture');
  showToast(step.overlay, 'info');
  elements.captureInput.click();
}

async function handleCaptureFile(event) {
  const file = event.target.files?.[0];
  if (!file || !state.pendingStepId) {
    return;
  }

  const step = state.steps.find((item) => item.id === state.pendingStepId);
  if (!step) {
    return;
  }

  await processCapturedAudio({ audioBlob: file, step });
  state.pendingStepId = null;
  event.target.value = '';
}

async function processCapturedAudio({ audioBlob, step }) {
  if (!audioBlob || !step) {
    return;
  }

  try {
    const rawSha256 = await hashBlob(audioBlob);
    const wavCapture = await convertAudioToWavBlob(audioBlob);
    const processedBlob = wavCapture.blob;
    const previewUrl = createPreviewUrl(processedBlob);
    const sha256 = await hashBlob(processedBlob);
    const quality = await analyzeCaptureQuality(processedBlob, 'audio');

    const preview = await runServerVoicePreview({ blob: processedBlob, step });
    const stepExtracted = preview?.extracted_data || { preferred_fields: {} };

    const pipeline = {
      asr_enabled: true,
      asr_model: preview?.asr_model || null,
      asr_error: preview?.asr_error || null,
      asr_transcript: preview?.asr_transcript || '',
      asr_tokens: Array.isArray(preview?.asr_tokens) ? preview.asr_tokens : [],
      asr_confidence: Number.isFinite(Number(preview?.asr_confidence))
        ? Number(preview.asr_confidence)
        : null,
      asr_duration_seconds: Number.isFinite(Number(preview?.duration_seconds))
        ? Number(preview.duration_seconds)
        : (Number.isFinite(Number(wavCapture.durationSeconds)) ? Number(wavCapture.durationSeconds) : null),
      processed_at: new Date().toISOString(),
      extracted_data: stepExtracted
    };

    const previous = state.captures.get(step.id);
    if (previous?.previewUrl) {
      URL.revokeObjectURL(previous.previewUrl);
    }

    const capture = {
      capture_id: createId(),
      step_id: step.id,
      media_kind: 'audio',
      mime_type: 'audio/wav',
      blob: processedBlob,
      sha256,
      captured_at: new Date().toISOString(),
      accepted: true,
      issues: [],
      quality,
      previewUrl,
      pipeline,
      step_extracted: stepExtracted,
      exif_datetime_original: null,
      raw_sha256: rawSha256,
      raw_size_bytes: audioBlob.size,
      processed_size_bytes: processedBlob.size
    };

    state.captures.set(step.id, capture);
    mergeDetectedFields(stepExtracted?.preferred_fields);

    renderSteps();
    await renderFieldPreview();

    if (pipeline.asr_error) {
      showToast(`Recording saved, but ASR preview failed: ${pipeline.asr_error}`, 'info');
    } else {
      showToast('Voice recording saved and fields detected.', 'success');
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Failed to process voice capture', 'error');
  }
}

function mergeDetectedFields(preferredFields) {
  if (!preferredFields || typeof preferredFields !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(preferredFields)) {
    if (!hasValue(value)) continue;
    state.detectedFields[key] = value;
  }
}

async function runServerVoicePreview({ blob, step }) {
  if (!navigator.onLine) {
    return {
      asr_error: 'offline',
      extracted_data: { preferred_fields: {} },
      asr_tokens: [],
      asr_transcript: '',
      asr_confidence: null,
      duration_seconds: null,
      asr_model: null
    };
  }

  try {
    const dataUrl = await blobToDataUrl(blob);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch('/api/v1/sync/voice-pipeline-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': session.userId
      },
      body: JSON.stringify({
        form_type: formType,
        step_id: step.id,
        audio: dataUrl
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      return {
        asr_error: json?.error || `Voice preview failed (${response.status})`,
        extracted_data: { preferred_fields: {} },
        asr_tokens: [],
        asr_transcript: '',
        asr_confidence: null,
        duration_seconds: null,
        asr_model: null
      };
    }

    return json.result || null;
  } catch (error) {
    return {
      asr_error: error.message || 'Voice preview request failed',
      extracted_data: { preferred_fields: {} },
      asr_tokens: [],
      asr_transcript: '',
      asr_confidence: null,
      duration_seconds: null,
      asr_model: null
    };
  }
}

async function toggleAudioRecording(step) {
  if (!state.recorder.active) {
    await startAudioRecording(step);
    return;
  }

  if (state.recorder.stepId === step.id) {
    stopAudioRecording();
  }
}

async function startAudioRecording(step) {
  if (state.recorder.active) {
    return;
  }

  try {
    const stream = await openMicrophoneStream();
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

    state.recorder.active = true;
    state.recorder.stepId = step.id;
    state.recorder.mediaRecorder = recorder;
    state.recorder.stream = stream;
    state.recorder.chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.recorder.chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      try {
        const recordedBlob = new Blob(state.recorder.chunks, {
          type: recorder.mimeType || 'audio/webm'
        });

        if (recordedBlob.size <= 0) {
          showToast('Voice recording is empty. Please retry.', 'error');
          return;
        }

        await processCapturedAudio({ audioBlob: recordedBlob, step });
      } catch (error) {
        console.error(error);
        showToast(error.message || 'Voice capture failed', 'error');
      } finally {
        cleanupRecording();
        renderSteps();
      }
    };

    recorder.start();
    renderSteps();
    showToast('Recording started. Tap Stop Recording when done.', 'info');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'DX Fitter could not access the microphone right now.', 'error');
  }
}

function stopAudioRecording() {
  const recorder = state.recorder.mediaRecorder;
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
    showToast('Recording stopped. Detecting fields...', 'info');
  }
}

function cleanupRecording() {
  if (state.recorder.stream) {
    for (const track of state.recorder.stream.getTracks()) {
      track.stop();
    }
  }

  state.recorder.active = false;
  state.recorder.stepId = null;
  state.recorder.mediaRecorder = null;
  state.recorder.stream = null;
  state.recorder.chunks = [];
}

async function convertAudioToWavBlob(rawBlob) {
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

async function saveOffline() {
  const captures = collectValidatedCaptures();
  if (!captures) {
    return;
  }

  try {
    const result = await saveCaptureSubmission({
      session,
      formType,
      context: state.context,
      captures
    });

    clearCapturedState();
    await renderFieldPreview();
    showToast(`Saved offline (${result.submission.local_submission_id.slice(0, 8)}).`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Save offline failed', 'error');
  }
}

async function saveAndSync() {
  const captures = collectValidatedCaptures();
  if (!captures) {
    return;
  }

  try {
    await saveCaptureSubmission({
      session,
      formType,
      context: state.context,
      captures
    });

    clearCapturedState();
    showToast('Saved offline. Starting sync...', 'info');

    if (!navigator.onLine) {
      showToast('No network: item remains queued.', 'info');
      return;
    }

    elements.saveAndSyncBtn.disabled = true;
    const result = await runSyncCycle({
      onProgress: ({ type, message }) => {
        if (type === 'failed') {
          showToast(message, 'error');
          return;
        }
        if (type === 'synced') {
          showToast(message, 'info');
        }
      }
    });

    await renderFieldPreview();
    showToast(
      `Sync complete: ${result.synced} synced, ${result.failed} failed.`,
      result.failed > 0 ? 'info' : 'success'
    );
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Save + sync failed', 'error');
  } finally {
    elements.saveAndSyncBtn.disabled = false;
  }
}

function collectValidatedCaptures() {
  const captures = Array.from(state.captures.values());
  const requiredSteps = state.steps.filter((step) => step.required !== false);

  const missing = requiredSteps.filter((step) => !state.captures.has(step.id));
  if (missing.length > 0) {
    showToast(`Missing required steps: ${missing.map((step) => step.title).join(', ')}`, 'error');
    return null;
  }

  return captures.map((capture) => ({
    ...capture,
    meta_json: {
      ...capture.quality,
      quality_issues: capture.issues,
      exif_datetime_original: null,
      raw_sha256: capture.raw_sha256 || null,
      raw_size_bytes: capture.raw_size_bytes || capture.blob?.size || 0,
      processed_size_bytes: capture.processed_size_bytes || capture.blob?.size || 0,
      mime_type: capture.mime_type || null,
      pipeline: capture.pipeline || null,
      extracted_data: capture.step_extracted || null
    }
  }));
}

function clearCapturedState() {
  for (const capture of state.captures.values()) {
    if (capture.previewUrl) {
      URL.revokeObjectURL(capture.previewUrl);
    }
  }

  state.captures.clear();
  renderSteps();
}

function updateStepHint() {
  const mandatory = state.steps.filter((step) => step.required !== false);
  const capturedMandatory = mandatory.filter((step) => state.captures.has(step.id)).length;
  elements.stepHint.textContent = `${capturedMandatory}/${mandatory.length} mandatory steps captured.`;
}

function formatStepExtractedHint(extracted) {
  if (!extracted || typeof extracted !== 'object') {
    return '';
  }

  const preferred = extracted.preferred_fields && typeof extracted.preferred_fields === 'object'
    ? extracted.preferred_fields
    : {};

  const entries = Object.entries(preferred)
    .filter(([, value]) => hasValue(value))
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.join(' | ');
}

function formatValue(value) {
  if (!hasValue(value)) {
    return 'Pending sync';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function parsePositionsParam(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return [];
  }

  return Array.from(new Set(
    text
      .split(',')
      .map((item) => String(item || '').trim().toUpperCase())
      .filter(Boolean)
  ));
}
