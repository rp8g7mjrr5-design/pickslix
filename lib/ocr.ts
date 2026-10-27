"use client";
// Screenshot helpers that run in the browser.

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrink to at most `max` px on the long side and re-encode as JPEG, to keep uploads small. */
export async function toDataUrl(file: Blob, max = 1600): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Pick 6 is dark with bright colored buttons (dark text on green), which trips up OCR. Upscale, find the
 * colored buttons and flip what's inside them so their text matches the rest (light on dark), then turn the
 * whole thing into dark text on white with stretched contrast.
 */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const img = await loadImage(file);
  const scale = Math.max(1, Math.min(3, 1800 / img.naturalWidth));
  const canvas = document.createElement("canvas");
  const w = (canvas.width = Math.round(img.naturalWidth * scale));
  const h = (canvas.height = Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const n = w * h;
  const luma = new Float32Array(n);
  const colored = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    total += luma[i];
    colored[i] = max > 90 && (max - min) / max > 0.35 ? 1 : 0;
  }
  const darkPage = total / n < 128;

  // Buttons: connected patches of color on a coarse grid, taken as their bounding boxes.
  const cell = 4;
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (colored[y * w + x]) grid[((y / cell) | 0) * gw + ((x / cell) | 0)]++;
  const on = (k: number) => grid[k] > (cell * cell) / 2;
  const seen = new Uint8Array(gw * gh);
  const inButton = new Uint8Array(n);
  for (let k = 0; k < gw * gh; k++) {
    if (seen[k] || !on(k)) continue;
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0, size = 0;
    const stack = [k];
    seen[k] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % gw, cy = (c / gw) | 0;
      size++;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (const nb of [c - 1, c + 1, c - gw, c + gw]) {
        if (nb < 0 || nb >= gw * gh || seen[nb] || Math.abs((nb % gw) - cx) > 1 || !on(nb)) continue;
        seen[nb] = 1;
        stack.push(nb);
      }
    }
    // Ignore specks (logos, icons) and anything that isn't button-shaped.
    if (size < 30 || (x1 - x0) * (y1 - y0) > (gw * gh) / 4) continue;
    for (let y = (y0 + 1) * cell; y < y1 * cell && y < h; y++) for (let x = (x0 + 1) * cell; x < x1 * cell && x < w; x++) inButton[y * w + x] = 1;
  }

  for (let i = 0; i < n; i++) {
    // Button fill becomes page background; text on a button flips to match the page.
    let v = colored[i] ? (darkPage ? 0 : 255) : inButton[i] ? 255 - luma[i] : luma[i];
    if (darkPage) v = 255 - v;
    v = Math.max(0, Math.min(255, (v - 128) * 1.8 + 150));
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** Read the text in a screenshot on this device. Downloads the OCR engine (~4 MB) the first time. */
export async function readTextOnDevice(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(await prepare(file));
    return data.text;
  } finally {
    await worker.terminate();
  }
}
