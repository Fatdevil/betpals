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
  return new Promise((resolve, reject) => {
    const isImage = file && (
      (file.type && file.type.startsWith('image/')) ||
      /\.(jpe?g|png|webp|gif|bmp|heic|heif|svg)$/i.test(file.name || '')
    );
    if (!file || !isImage) {
      return reject(new Error('Välj en giltig bildfil'));
    }

    const processImageSource = (src, cleanup) => {
      const img = new Image();
      img.onload = () => {
        if (cleanup) cleanup();
        let width = img.width;
        let height = img.height;

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
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        if (cleanup) cleanup();
        reject(new Error('Kunde inte läsa in bilden'));
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
