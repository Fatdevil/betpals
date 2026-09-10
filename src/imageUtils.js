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
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Välj en giltig bildfil'));
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
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
      img.onerror = () => reject(new Error('Kunde inte läsa in bilden'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Kunde inte läsa filen'));
    reader.readAsDataURL(file);
  });
}
