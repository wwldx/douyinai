export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(new Error("图片读取失败")), { once: true });
    reader.readAsDataURL(blob);
  });
}

export async function fileToDataUrl(file, maxEdge = 1400) {
  const raw = await blobToDataUrl(file);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      if (scale >= 1) {
        resolve(raw);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    image.onerror = () => resolve(raw);
    image.src = raw;
  });
}

export async function urlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("示例图片加载失败");
  return fileToDataUrl(await response.blob());
}
