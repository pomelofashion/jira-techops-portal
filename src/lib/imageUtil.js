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
