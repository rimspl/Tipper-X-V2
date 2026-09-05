const CATEGORY_NAMES = {
  pressure: 'Pressure_Gauge',
  dashboard: 'Dashboard_Cluster',
  tread: 'Tread_Depth_Gauge',
  cabin: 'Cabin_Number',
  sidewall: 'Tyre_Sidewall',
  misc: 'Miscellaneous'
};

const PREPROCESS_VERSION = 'clahe_lab_l_v1';

export async function extractExifDateTimeOriginal(blob) {
  if (!blob || blob.type && !String(blob.type).toLowerCase().includes('jpeg')) {
    return null;
  }

  try {
    const head = await blob.slice(0, Math.min(blob.size, 512 * 1024)).arrayBuffer();
    const view = new DataView(head);
    const parsed = parseExifDateFromJpeg(view);
    if (parsed) {
      return parsed;
    }

    const decoder = new TextDecoder('latin1');
    const fallback = decoder.decode(head).match(/\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/);
    return fallback ? fallback[0] : null;
  } catch {
    return null;
  }
}

export async function preprocessImageWithClahe(blob, options = {}) {
  const maxDimension = Number.isFinite(Number(options.maxDimension)) ? Number(options.maxDimension) : 1600;
  const clipLimit = Number.isFinite(Number(options.clipLimit)) ? Number(options.clipLimit) : 3.0;
  const tileGridSize = Number.isFinite(Number(options.tileGridSize)) ? Number(options.tileGridSize) : 8;
  const quality = Number.isFinite(Number(options.quality)) ? Number(options.quality) : 0.92;

  const image = await decodeImage(blob);
  const naturalWidth = image.width || image.naturalWidth || 0;
  const naturalHeight = image.height || image.naturalHeight || 0;
  if (!naturalWidth || !naturalHeight) {
    return {
      blob,
      width: 0,
      height: 0,
      preprocess_version: PREPROCESS_VERSION,
      applied: false
    };
  }

  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const luminance = extractLuminance(imageData.data);
  const enhanced = applyClaheLuminance(luminance, width, height, {
    clipLimit,
    tileGridSize
  });

  applyEnhancedLuminance(imageData.data, luminance, enhanced);
  ctx.putImageData(imageData, 0, 0);

  const sourceMime = String(blob?.type || '').toLowerCase();
  const outputMime = sourceMime.includes('png') ? 'image/png' : 'image/jpeg';
  const processedBlob = await canvasToBlob(canvas, outputMime, quality);

  if (typeof image.close === 'function') {
    image.close();
  }

  return {
    blob: processedBlob,
    width,
    height,
    preprocess_version: PREPROCESS_VERSION,
    applied: true
  };
}

export function classifyPhotoCategory({ formType, stepId }) {
  const normalizedForm = String(formType || '').trim().toLowerCase();
  const normalizedStep = String(stepId || '').trim().toLowerCase();

  if (normalizedForm === 'pressure_check') {
    return {
      photo_category: CATEGORY_NAMES.pressure,
      classifier: 'guided_step_router_v1',
      category_confidence: 0.93,
      classifier_labels: ['clock', 'stop sign']
    };
  }

  if (normalizedStep.includes('tread')) {
    return {
      photo_category: CATEGORY_NAMES.tread,
      classifier: 'guided_step_router_v1',
      category_confidence: 0.92,
      classifier_labels: ['ruler']
    };
  }

  if (
    normalizedStep.includes('serial')
    || normalizedStep.includes('sidewall')
    || normalizedStep.includes('before_removal')
    || normalizedStep.includes('after_removal')
  ) {
    return {
      photo_category: CATEGORY_NAMES.sidewall,
      classifier: 'guided_step_router_v1',
      category_confidence: 0.91,
      classifier_labels: ['tire', 'wheel']
    };
  }

  if (normalizedStep.includes('odometer') || normalizedStep.includes('dashboard')) {
    return {
      photo_category: CATEGORY_NAMES.dashboard,
      classifier: 'guided_step_router_v1',
      category_confidence: 0.9,
      classifier_labels: ['tv', 'laptop', 'cell phone']
    };
  }

  if (normalizedStep.includes('truck') || normalizedStep.includes('cabin')) {
    return {
      photo_category: CATEGORY_NAMES.cabin,
      classifier: 'guided_step_router_v1',
      category_confidence: 0.9,
      classifier_labels: ['truck']
    };
  }

  if (normalizedStep.includes('gauge')) {
    return {
      photo_category: CATEGORY_NAMES.pressure,
      classifier: 'guided_step_router_v1',
      category_confidence: 0.86,
      classifier_labels: ['clock']
    };
  }

  if (normalizedForm === 'tyre_card') {
    return {
      photo_category: CATEGORY_NAMES.sidewall,
      classifier: 'guided_step_router_v1',
      category_confidence: 0.78,
      classifier_labels: ['tire']
    };
  }

  return {
    photo_category: CATEGORY_NAMES.misc,
    classifier: 'guided_step_router_v1',
    category_confidence: 0.55,
    classifier_labels: []
  };
}

function parseExifDateFromJpeg(view) {
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      break;
    }

    const marker = view.getUint8(offset + 1);
    offset += 2;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 2 > view.byteLength) {
      break;
    }

    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) {
      break;
    }

    if (marker === 0xe1) {
      const dataStart = offset + 2;
      const exifHeader = readAscii(view, dataStart, 6);
      if (exifHeader === 'Exif\x00\x00') {
        const tiffStart = dataStart + 6;
        const exifDate = parseExifDateFromTiff(view, tiffStart);
        if (exifDate) {
          return exifDate;
        }
      }
    }

    offset += segmentLength;
  }

  return null;
}

function parseExifDateFromTiff(view, tiffStart) {
  if (tiffStart + 8 > view.byteLength) {
    return null;
  }

  const order = readAscii(view, tiffStart, 2);
  const littleEndian = order === 'II';
  if (!littleEndian && order !== 'MM') {
    return null;
  }

  const magic = view.getUint16(tiffStart + 2, littleEndian);
  if (magic !== 42) {
    return null;
  }

  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
  const ifd0 = tiffStart + ifd0Offset;
  if (ifd0 + 2 > view.byteLength) {
    return null;
  }

  const exifPointer = findIfdValue(view, ifd0, littleEndian, 0x8769, tiffStart);
  if (!Number.isFinite(exifPointer)) {
    return null;
  }

  const exifIfd = tiffStart + exifPointer;
  if (exifIfd + 2 > view.byteLength) {
    return null;
  }

  return findAsciiTagValue(view, exifIfd, littleEndian, 0x9003, tiffStart);
}

function findIfdValue(view, ifdOffset, littleEndian, targetTag, tiffStart) {
  const count = view.getUint16(ifdOffset, littleEndian);

  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) {
      return null;
    }

    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag !== targetTag) {
      continue;
    }

    const type = view.getUint16(entryOffset + 2, littleEndian);
    const valueCount = view.getUint32(entryOffset + 4, littleEndian);
    if (type !== 4 || valueCount < 1) {
      return null;
    }

    return view.getUint32(entryOffset + 8, littleEndian);
  }

  return null;
}

function findAsciiTagValue(view, ifdOffset, littleEndian, targetTag, tiffStart) {
  const count = view.getUint16(ifdOffset, littleEndian);

  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) {
      return null;
    }

    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag !== targetTag) {
      continue;
    }

    const type = view.getUint16(entryOffset + 2, littleEndian);
    const valueCount = view.getUint32(entryOffset + 4, littleEndian);
    if (type !== 2 || valueCount < 1) {
      return null;
    }

    const valueSize = valueCount;
    let valueOffset;

    if (valueSize <= 4) {
      valueOffset = entryOffset + 8;
    } else {
      const pointer = view.getUint32(entryOffset + 8, littleEndian);
      valueOffset = tiffStart + pointer;
    }

    if (valueOffset + valueSize > view.byteLength) {
      return null;
    }

    return readAscii(view, valueOffset, valueCount).replace(/\x00+$/, '').trim() || null;
  }

  return null;
}

function readAscii(view, offset, length) {
  let out = '';
  for (let index = 0; index < length && offset + index < view.byteLength; index += 1) {
    out += String.fromCharCode(view.getUint8(offset + index));
  }
  return out;
}

function extractLuminance(data) {
  const pixels = data.length / 4;
  const luminance = new Uint8Array(pixels);

  for (let index = 0, p = 0; index < data.length; index += 4, p += 1) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    luminance[p] = clampByte(Math.round((0.2126 * r) + (0.7152 * g) + (0.0722 * b)));
  }

  return luminance;
}

function applyEnhancedLuminance(data, originalLuminance, enhancedLuminance) {
  const softMinRatio = 0.4;
  const softMaxRatio = 2.6;

  for (let index = 0, p = 0; index < data.length; index += 4, p += 1) {
    const original = originalLuminance[p] || 1;
    const enhanced = enhancedLuminance[p] || original;
    const ratio = clampNumber(enhanced / original, softMinRatio, softMaxRatio);

    data[index] = clampByte(Math.round(data[index] * ratio));
    data[index + 1] = clampByte(Math.round(data[index + 1] * ratio));
    data[index + 2] = clampByte(Math.round(data[index + 2] * ratio));
  }
}

function applyClaheLuminance(luminance, width, height, options = {}) {
  const tileGridSize = Math.max(2, Math.min(16, Number(options.tileGridSize || 8)));
  const clipLimit = Math.max(1, Number(options.clipLimit || 3.0));

  const tilesX = tileGridSize;
  const tilesY = tileGridSize;
  const tileWidth = Math.ceil(width / tilesX);
  const tileHeight = Math.ceil(height / tilesY);

  const luts = new Array(tilesX * tilesY);

  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const x0 = tx * tileWidth;
      const y0 = ty * tileHeight;
      const x1 = Math.min(width, x0 + tileWidth);
      const y1 = Math.min(height, y0 + tileHeight);

      const pixelCount = Math.max(1, (x1 - x0) * (y1 - y0));
      const histogram = new Uint32Array(256);

      for (let y = y0; y < y1; y += 1) {
        const rowStart = y * width;
        for (let x = x0; x < x1; x += 1) {
          histogram[luminance[rowStart + x]] += 1;
        }
      }

      const clipThreshold = Math.max(1, Math.floor((clipLimit * pixelCount) / 256));
      let excess = 0;

      for (let i = 0; i < histogram.length; i += 1) {
        if (histogram[i] > clipThreshold) {
          excess += histogram[i] - clipThreshold;
          histogram[i] = clipThreshold;
        }
      }

      if (excess > 0) {
        const spread = Math.floor(excess / 256);
        const remainder = excess % 256;
        for (let i = 0; i < histogram.length; i += 1) {
          histogram[i] += spread;
        }
        for (let i = 0; i < remainder; i += 1) {
          histogram[i] += 1;
        }
      }

      const lut = new Uint8Array(256);
      let cdf = 0;
      for (let i = 0; i < histogram.length; i += 1) {
        cdf += histogram[i];
        lut[i] = clampByte(Math.round((cdf * 255) / pixelCount));
      }

      luts[ty * tilesX + tx] = lut;
    }
  }

  const output = new Uint8Array(luminance.length);

  for (let y = 0; y < height; y += 1) {
    const ty = Math.floor(y / tileHeight);
    const ty1 = Math.min(tilesY - 1, ty + 1);
    const fy = tileHeight > 0 ? (y - ty * tileHeight) / tileHeight : 0;

    for (let x = 0; x < width; x += 1) {
      const tx = Math.floor(x / tileWidth);
      const tx1 = Math.min(tilesX - 1, tx + 1);
      const fx = tileWidth > 0 ? (x - tx * tileWidth) / tileWidth : 0;

      const pixel = luminance[y * width + x];

      const lut00 = luts[ty * tilesX + tx];
      const lut10 = luts[ty * tilesX + tx1];
      const lut01 = luts[ty1 * tilesX + tx];
      const lut11 = luts[ty1 * tilesX + tx1];

      const v00 = lut00[pixel];
      const v10 = lut10[pixel];
      const v01 = lut01[pixel];
      const v11 = lut11[pixel];

      const top = v00 + ((v10 - v00) * fx);
      const bottom = v01 + ((v11 - v01) * fx);
      output[y * width + x] = clampByte(Math.round(top + ((bottom - top) * fy)));
    }
  }

  return output;
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    image.src = url;
  });
}

async function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode processed image'));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampByte(value) {
  return clampNumber(value, 0, 255);
}
