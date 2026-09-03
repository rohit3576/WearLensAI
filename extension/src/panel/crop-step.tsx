import { useEffect, useRef, useState } from "react";
import { clampOffset, computeCropRect } from "./crop-math";
import type { Point, Size } from "./crop-math";

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 1500;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

export interface CropStepProps {
  readonly file: File;
  readonly onConfirm: (cropped: File) => void;
  readonly onSkip: (original: File) => void;
}

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly origin: Point;
  readonly container: Size;
}

export function CropStep({ file, onConfirm, onSkip }: CropStepProps) {
  const [objectUrl] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState<Size | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  function frameSize(): Size {
    const rect = frameRef.current?.getBoundingClientRect();
    if (rect === undefined) return { width: 0, height: 0 };
    return { width: rect.width, height: rect.height };
  }

  function recenteredOffset(nextZoom: number): Point {
    if (natural === null) return offset;
    return clampOffset({ natural, container: frameSize(), zoom: nextZoom }, offset);
  }

  function zoomBy(delta: number): void {
    const next = Math.min(Math.max(zoom + delta, ZOOM_MIN), ZOOM_MAX);
    if (next === zoom) return;
    setOffset(recenteredOffset(next));
    setZoom(next);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (natural === null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: offset,
      container: frameSize(),
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId || natural === null) return;
    setOffset(
      clampOffset(
        { natural, container: drag.container, zoom },
        {
          x: drag.origin.x + (event.clientX - drag.startX),
          y: drag.origin.y + (event.clientY - drag.startY),
        },
      ),
    );
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  async function confirmCrop(): Promise<void> {
    const image = imageRef.current;
    const container = frameSize();
    if (image === null || natural === null || container.width === 0) return;
    const rect = computeCropRect({ natural, container, zoom, offset });
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("canvas context unavailable");
    context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });
    if (blob === null) throw new Error("crop export produced no blob");
    onConfirm(new File([blob], "person-crop.jpg", { type: "image/jpeg" }));
  }

  return (
    <div className="crop">
      <span className="settings-label">Frame your photo — uploads as 4:5</span>
      <div
        ref={frameRef}
        className="crop-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          ref={imageRef}
          src={objectUrl}
          alt="Your photo, drag to frame"
          draggable={false}
          onLoad={(event) => {
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
          }}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        />
      </div>
      <div className="crop-controls">
        <div className="crop-zoom">
          <button type="button" className="button" aria-label="Zoom out" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
            −
          </button>
          <button type="button" className="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
            +
          </button>
        </div>
        <div className="crop-zoom">
          <button type="button" className="button button-outline" onClick={() => onSkip(file)}>
            Skip crop
          </button>
          <button
            type="button"
            className="button"
            disabled={natural === null}
            onClick={() => {
              void confirmCrop();
            }}
          >
            Use photo
          </button>
        </div>
      </div>
    </div>
  );
}
