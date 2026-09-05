import { QUALITY } from './constants.js';

export async function hashBlob(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function analyzeCaptureQuality(blob, mediaKind) {
  if (mediaKind !== 'image') {
    return {
      accepted: true,
      issues: [],
      blur_score: 0,
      brightness: 0.5,
      width: null,
      height: null
    };
  }

  const dataUrl = await blobToDataUrl(blob);
  const image = await loadImage(dataUrl);

  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  const pixelCount = width * height;
  const metrics = sampleImageMetrics(image);

  const issues = [];
  const criticalIssues = [];

  if (pixelCount < QUALITY.hardMinImagePixels) {
    criticalIssues.push('very_low_resolution');
  } else if (
    pixelCount < QUALITY.minImagePixels
    || (width < QUALITY.minImageWidth && height < QUALITY.minImageHeight)
  ) {
    issues.push('low_resolution');
  }

  if (metrics.brightness < QUALITY.hardMinBrightness) {
    criticalIssues.push('too_dark');
  } else if (metrics.brightness < QUALITY.minBrightness) {
    issues.push('low_light');
  }

  if (metrics.brightness > QUALITY.hardMaxBrightness) {
    criticalIssues.push('too_bright');
  } else if (metrics.brightness > QUALITY.maxBrightness) {
    issues.push('over_exposed');
  }

  if (metrics.blurScore > QUALITY.hardBlurScore) {
    criticalIssues.push('very_blurry');
  } else if (metrics.blurScore > QUALITY.warningBlurScore) {
    issues.push('blurry');
  }

  return {
    accepted: criticalIssues.length === 0,
    issues: [...criticalIssues, ...issues],
    critical_issues: criticalIssues,
    blur_score: Number(metrics.blurScore.toFixed(4)),
    brightness: Number(metrics.brightness.toFixed(4)),
    edge_density: Number(metrics.edgeDensity.toFixed(4)),
    width,
    height,
    pixels: pixelCount,
    size_bytes: blob.size
  };
}

export function createPreviewUrl(blob) {
  return URL.createObjectURL(blob);
}

export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const [header, base64] = String(dataUrl || '').split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode image'));
    image.src = dataUrl;
  });
}

function sampleImageMetrics(image) {
  const canvas = document.createElement('canvas');
  const maxWidth = 320;
  const scale = Math.min(1, maxWidth / Math.max(image.width || 1, 1));
  const width = Math.max(1, Math.round((image.width || 1) * scale));
  const height = Math.max(1, Math.round((image.height || 1) * scale));
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const gray = [];
  let brightnessTotal = 0;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    gray.push(luminance);
    brightnessTotal += luminance;
  }

  const pixels = Math.max(gray.length, 1);
  const brightness = brightnessTotal / pixels;

  let edgeTotal = 0;
  let edgeCount = 0;
  let strongEdgeCount = 0;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = Math.abs(gray[i] - gray[i + 1]);
      const gy = Math.abs(gray[i] - gray[i + width]);
      const edgeStrength = gx + gy;
      edgeTotal += edgeStrength;
      edgeCount += 1;

      if (edgeStrength >= 0.16) {
        strongEdgeCount += 1;
      }
    }
  }

  const edgeMean = edgeCount > 0 ? edgeTotal / edgeCount : 0;
  const edgeDensity = edgeCount > 0 ? strongEdgeCount / edgeCount : 0;

  const sharpness = clamp((edgeMean * 8) + (edgeDensity * 2.6), 0, 1);
  const blurScore = clamp(1 - sharpness, 0, 1);

  return {
    brightness,
    blurScore,
    edgeDensity
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
