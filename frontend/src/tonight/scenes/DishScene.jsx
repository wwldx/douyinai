import { useMemo, useRef, useState } from "react";
import ImageFocusSelector from "../../components/ImageFocusSelector";
import { SourceBadge } from "../bits";
import { dishOptionsFromAnalysis } from "../model";

export function feedImageSourceLabel(source) {
  if (source === "sample") return "示例";
  if (source === "album") return "相册";
  return "实拍";
}

function ProgressDots({ current }) {
  const steps = ["这道菜", "判断", "决定"];
  return (
    <ol className="tn-dots" aria-label="进度">
      {steps.map((label, index) => (
        <li
          key={label}
          className={index === current ? "is-now" : index < current ? "is-done" : ""}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="tn-dots-dot" aria-hidden="true" />
          <span className="tn-dots-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export default function DishScene({
  dish,
  selectedDishOption,
  fixedDemo,
  onSelectDishOption,
  onRecrop,
  onRetry,
  onRestoreOriginal,
  onReplaceImage,
  onUseSample,
  onBack,
  onContinue,
  onStartFromFridge,
  fromFridge = false,
}) {
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const [selecting, setSelecting] = useState(false);
  const options = useMemo(() => dishOptionsFromAnalysis(dish?.analysis), [dish?.analysis]);
  const selectedOption = options.find((option) => option.id === selectedDishOption?.id) || null;
  const analysisFinished = Boolean(dish?.analysisSource) && dish.analysisSource !== "pending";
  const hasNoCredibleOption = analysisFinished && options.length === 0;
  const errorKind = dish?.analysisError?.kind || null;
  const issueCopy = errorKind === "timeout"
    ? {
      title: "模型响应超时",
      note: "40 秒内没有取得完整识别结果。可以按原图重试，也可以重新圈选或换一张图。",
    }
    : errorKind === "network"
      ? {
        title: "网络连接失败",
        note: "网络或识别服务暂时连不上。当前图片还在，可以按原图重试。",
      }
      : errorKind === "invalid_response"
        ? {
          title: "识别结果格式异常",
          note: "服务返回的候选不完整，因此没有拿它继续判断。可以按原图重新识别。",
        }
        : dish?.analysisSource === "cancelled"
          ? {
            title: "这次识别已取消",
            note: "当前图片还在，可以重新识别、重新圈选或换一张图。",
          }
          : {
            title: "没有找到可信的菜名候选",
            note: `不会为你编一个菜名。可以重新圈选、换图或${fromFridge ? "返回冰箱规划台" : "改从冰箱开始"}。`,
          };

  function handleFile(event) {
    const file = event.target.files?.[0];
    const source = event.target.dataset.source || "album";
    event.target.value = "";
    if (file) onReplaceImage?.(file, source);
  }

  function handleSelect(option) {
    onSelectDishOption?.(option);
  }

  function handleContinue() {
    if (!selectedOption) return;
    onContinue?.(selectedOption);
  }

  function openCrop() {
    if (dish?.image) setSelecting(true);
  }

  return (
    <section className="tn-scene tn-dish" aria-label="确认这道菜">
      <header className="tn-scene-head">
        <button
          type="button"
          className="tn-back"
          onClick={onBack}
          aria-label={fromFridge ? "返回冰箱规划台" : "返回首屏"}
        >
          ‹
        </button>
        <ProgressDots current={0} />
      </header>

      <div className="tn-dish-media">
        {dish?.image ? (
          <img src={dish.image} alt="待确认的菜" />
        ) : (
          <div className="tn-media-lost">照片未保存，结构化识别结果仍在；需要重新识别时请重拍或重选。</div>
        )}
        <SourceBadge
          label={feedImageSourceLabel(dish?.imageSource)}
          tone={dish?.imageSource === "sample" ? "sample" : "real"}
        />
        {fixedDemo && <span className="tn-badge tn-badge-fixed">固定示例结果</span>}
        {dish?.image && !selecting && (
          <div className="tn-dish-media-actions">
            <button type="button" className="tn-btn tn-btn-glass tn-dish-cropbtn" onClick={openCrop}>
              画面太杂？圈出这道菜
            </button>
            {dish.originalImage && dish.image !== dish.originalImage && (
              <button type="button" className="tn-btn tn-btn-glass" onClick={onRestoreOriginal}>
                恢复整张
              </button>
            )}
          </div>
        )}
      </div>

      {selecting && dish?.image && (
        <ImageFocusSelector
          imageDataUrl={dish.image}
          onApply={async (cropped) => {
            await onRecrop?.(cropped);
            setSelecting(false);
          }}
          onCancel={() => setSelecting(false)}
        />
      )}

      {options.length > 0 && (
        <div className="tn-dish-namechoices" role="group" aria-label="选择菜名">
          <p className="tn-field-label">这道菜更像哪一个？</p>
          <p className="tn-compare-note">请选择一个识别候选，确认后再继续。</p>
          <div className="tn-dish-choicegrid">
            {options.map((option, index) => {
              const isSelected = selectedOption?.id === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`tn-dish-choice ${isSelected ? "is-on" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => handleSelect(option)}
                >
                  <small>{index === 0 ? "AI 最可能" : "也可能是"}</small>
                  <strong>{option.name}</strong>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasNoCredibleOption && (
        <div className="tn-compare" role="alert">
          <p className="tn-compare-title">{issueCopy.title}</p>
          <p className="tn-compare-note">{issueCopy.note}</p>
          {dish?.analysisError?.requestId && (
            <p className="tn-request-id">请求编号：{dish.analysisError.requestId}</p>
          )}
          {dish?.analysisSource === "failed" && dish?.image && (
            <button type="button" className="tn-btn tn-btn-quiet" onClick={onRetry}>按原图重新识别</button>
          )}
          {dish?.image && (
            <button type="button" className="tn-btn tn-btn-quiet" onClick={openCrop}>重新圈选</button>
          )}
        </div>
      )}

      {!analysisFinished && options.length === 0 && (
        <p className="tn-foot-hint" role="status">正在等待菜品识别结果，也可以换一张图。</p>
      )}

      <div className="tn-feed-alt tn-dish-replace" aria-label="重新提供菜图">
        <button type="button" className="tn-btn tn-btn-quiet" onClick={() => cameraRef.current?.click()}>
          {hasNoCredibleOption ? "重新拍摄" : "拍我刷到的菜"}
        </button>
        <button type="button" className="tn-btn tn-btn-quiet" onClick={() => albumRef.current?.click()}>
          {hasNoCredibleOption ? "从相册重选" : "从相册选"}
        </button>
        <button type="button" className="tn-btn tn-btn-quiet" onClick={onUseSample}>
          {hasNoCredibleOption ? "换示例" : "换一张示例"}
        </button>
      </div>

      <footer className="tn-scene-foot">
        <button
          type="button"
          className="tn-btn tn-btn-primary tn-btn-xl"
          disabled={!selectedOption}
          onClick={handleContinue}
        >
          确认这道菜
        </button>
        {options.length > 0 && !selectedOption && <p className="tn-foot-hint">请亲自选择一个菜名候选</p>}
        {hasNoCredibleOption && (
          <button type="button" className="tn-link" onClick={onStartFromFridge}>
            {fromFridge ? "返回冰箱规划台" : "改从冰箱开始"}
          </button>
        )}
      </footer>

      <input
        ref={cameraRef}
        data-source="camera"
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFile}
      />
      <input
        ref={albumRef}
        data-source="album"
        type="file"
        accept="image/*"
        hidden
        onChange={handleFile}
      />
    </section>
  );
}
