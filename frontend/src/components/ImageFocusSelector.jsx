import { useState } from "react";

const defaultSelection = { x: 15, y: 15, width: 70, height: 70 };

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function pointInPercent(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100),
  };
}

function cropImage(imageDataUrl, selection) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const sourceX = Math.round((selection.x / 100) * image.naturalWidth);
      const sourceY = Math.round((selection.y / 100) * image.naturalHeight);
      const sourceWidth = Math.max(1, Math.round((selection.width / 100) * image.naturalWidth));
      const sourceHeight = Math.max(1, Math.round((selection.height / 100) * image.naturalHeight));
      const scale = Math.min(1, 1280 / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("当前浏览器无法裁剪图片"));
        return;
      }
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    image.onerror = () => reject(new Error("图片载入失败"));
    image.src = imageDataUrl;
  });
}

export default function ImageFocusSelector({ imageDataUrl, onApply, onCancel }) {
  const [selection, setSelection] = useState(defaultSelection);
  const [dragOrigin, setDragOrigin] = useState(null);
  const [cropping, setCropping] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function handlePointerDown(event) {
    const point = pointInPercent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragOrigin(point);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function handlePointerMove(event) {
    if (!dragOrigin) return;
    const point = pointInPercent(event);
    setSelection({
      x: Math.min(dragOrigin.x, point.x),
      y: Math.min(dragOrigin.y, point.y),
      width: Math.abs(point.x - dragOrigin.x),
      height: Math.abs(point.y - dragOrigin.y),
    });
  }

  function handlePointerEnd(event) {
    if (!dragOrigin) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setSelection((current) => (
      current.width < 8 || current.height < 8 ? defaultSelection : current
    ));
    setDragOrigin(null);
  }

  async function applySelection() {
    setCropping(true);
    setErrorMessage("");
    try {
      const croppedImage = await cropImage(imageDataUrl, selection);
      await onApply(croppedImage, selection);
    } catch (error) {
      setErrorMessage(error.message || "裁剪失败，请重新框选");
    } finally {
      setCropping(false);
    }
  }

  return (
    <section className="image-focus-selector" aria-label="框选画面重点">
      <div className="image-focus-heading">
        <div>
          <strong>框选画面重点</strong>
          <span>在图上拖出矩形，只识别你关心的菜品区域</span>
        </div>
        <button type="button" onClick={() => setSelection({ x: 0, y: 0, width: 100, height: 100 })}>
          选整张
        </button>
      </div>

      <div
        className="image-focus-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <img src={imageDataUrl} alt="待框选的暂停帧" draggable="false" />
        <span
          className="image-focus-selection"
          style={{
            left: `${selection.x}%`,
            top: `${selection.y}%`,
            width: `${selection.width}%`,
            height: `${selection.height}%`,
          }}
          aria-hidden="true"
        />
      </div>

      {errorMessage && <p className="image-focus-error" role="alert">{errorMessage}</p>}

      <div className="image-focus-actions">
        <button className="ghost-action" type="button" onClick={onCancel} disabled={cropping}>取消</button>
        <button className="primary-action" type="button" onClick={applySelection} disabled={cropping || selection.width < 8 || selection.height < 8}>
          {cropping ? "正在裁剪" : "用选区重新识别"}
        </button>
      </div>
    </section>
  );
}
