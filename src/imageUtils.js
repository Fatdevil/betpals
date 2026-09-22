/**
 * Client-side image compression utility using HTML5 Canvas.
 * Automatically scales down large mobile photos (5-15MB) to ~100-250KB in milliseconds.
 * 
 * @param {File|Blob} file 
 * @param {number} maxWidth Maximum width or height in pixels (default 1000)
 * @param {number} quality JPEG quality between 0.1 and 1.0 (default 0.8)
 * @returns {Promise<string>} Base64 data URL (image/jpeg)
 */
export async function compressImage(file, maxWidth = 1000, quality = 0.8) {
  if (!file) {
    throw new Error('Välj en giltig bildfil');
  }

  // Handle files with missing MIME types (common on iOS when picking from external storage or camera roll)
  const isImageMime = file.type && (file.type.startsWith('image/') || file.type === 'application/octet-stream');
  const hasImageExt = /\.(jpe?g|png|webp|gif|bmp|heic|heif|svg|avif)$/i.test(file.name || '');
  if (!isImageMime && !hasImageExt && file.type !== '') {
    throw new Error('Välj en giltig bildfil');
  }

  // 1. Fast-path: try createImageBitmap if available (Safari 17+, Chrome, modern Android/iOS)
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      let width = bmp.width;
      let height = bmp.height;

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      if (typeof bmp.close === 'function') bmp.close();

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      return dataUrl.replace(/[\r\n\s]+/g, '');
    } catch (_) {
      // Fall through to HTML Image element fallback
    }
  }

  // 2. Fallback: HTMLImageElement via ObjectURL / FileReader
  return new Promise((resolve, reject) => {
    const processImageSource = (src, cleanup) => {
      const img = new Image();
      img.onload = () => {
        if (cleanup) cleanup();
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl.replace(/[\r\n\s]+/g, ''));
      };

      img.onerror = () => {
        if (cleanup) cleanup();
        reject(new Error('Kunde inte läsa in bilden. Prova att välja bilden direkt från bildbiblioteket eller ta ett nytt foto.'));
      };

      img.src = src;
    };

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        const objectUrl = URL.createObjectURL(file);
        processImageSource(objectUrl, () => {
          try { URL.revokeObjectURL(objectUrl); } catch (_) {}
        });
        return;
      } catch (_) {
        // Fallback to FileReader below
      }
    }

    const reader = new FileReader();
    reader.onload = (e) => processImageSource(e.target.result);
    reader.onerror = () => reject(new Error('Kunde inte läsa filen'));
    reader.readAsDataURL(file);
  });
}
