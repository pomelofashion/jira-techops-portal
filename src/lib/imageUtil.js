// src/lib/imageUtil.js
// Canvas-based image compression for inline editor images. Pasted/dropped
// images are resized + JPEG-compressed so the resulting data URL stays small
// enough to embed in a doc's Markdown content (server caps content at 200K
// chars). Pure browser APIs — no dependencies.

const readAsDataUrl = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

const loadImage = src =>
  new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image.'));
    img.src = src;
  });

const drawToDataUrl = (img, maxWidth, quality) => {
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // JPEG has no alpha — paint a white ground so transparent PNGs don't go black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
};

/**
 * Re-encode an image through a canvas at full resolution — drops every byte
 * of embedded metadata (EXIF/GPS, camera model, XMP) because the canvas only
 * carries pixels. PNG stays lossless; JPEG/WebP re-encode at q=0.92. GIFs
 * pass through (re-encoding would destroy animation), as do non-images.
 * Never throws — any failure returns the original file.
 */
export const scrubImageFile = async file => {
  const type = (file.type || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return file;
  try {
    const dataUrl = await readAsDataUrl(file);
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, type, type === 'image/png' ? undefined : 0.92)
    );
    if (!blob) return file;
    return new File([blob], file.name, { type, lastModified: Date.now() });
  } catch {
    return file;
  }
};

/**
 * Compress an image File into a JPEG data URL suitable for inlining into
 * Markdown. Tries {maxWidth, quality}, then a smaller retry when the result
 * is still heavy; returns the smallest candidate.
 * @returns {Promise<string>} data:image/jpeg;base64,… URL
 */
export const compressImageToDataUrl = async (file, { maxWidth = 1280, quality = 0.8 } = {}) => {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const first = drawToDataUrl(img, maxWidth, quality);
  if (first.length <= 120000) return first;
  const retry = drawToDataUrl(img, Math.min(maxWidth, 960), 0.6);
  return retry.length < first.length ? retry : first;
};
