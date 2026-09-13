// ！图片压缩
// 将图片等比缩放并转码为 WebP，返回 blob、dataUrl 与尺寸。

// 压缩图片为 WebP
// 选择 WebP 而非 JPEG：同等质量下体积更小，且支持透明通道
export function compressImage(file, maxWidth = 200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width,
          height = img.height;
        // 仅缩不放：原图小于 maxWidth 时保持原尺寸，避免模糊
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            resolve({
              blob: blob,
              dataUrl: URL.createObjectURL(blob),
              width,
              height,
            });
          },
          'image/webp',
          quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
