"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
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
  const [exporting, setExporting] = useState(false);
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
    setExporting(true);
    try {
      const rect = computeCropRect({ natural, container, zoom, offset });
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("canvas context unavailable");
      context.drawImage(
        image,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        0,
        0,
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT,
      );
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (blob === null) throw new Error("crop export produced no blob");
      onConfirm(new File([blob], "person-crop.png", { type: "image/png" }));
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`could not frame the photo: ${error.message}`);
      } else {
        throw error;
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Frame your photo</span>
        <span className="text-xs text-muted-foreground">uploads as 4:5</span>
      </div>
      <div
        ref={frameRef}
        className="relative mx-auto aspect-[4/5] w-full max-w-64 cursor-grab touch-none overflow-hidden rounded-lg border bg-muted"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- in-memory blob being framed by pointer gestures */}
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
          className="h-full w-full select-none object-cover transition-transform duration-100"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(-ZOOM_STEP)}
            disabled={exporting || zoom <= ZOOM_MIN}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={exporting || zoom >= ZOOM_MAX}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSkip(file)}
            disabled={exporting}
            className="h-11 rounded-md border px-4 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            Skip crop
          </button>
          <button
            type="button"
            onClick={() => {
              void confirmCrop();
            }}
            disabled={exporting || natural === null}
            className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {exporting ? "Framing" : "Use photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
