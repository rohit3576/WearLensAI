// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CropStep } from "./crop-step";

const file = new File([new Uint8Array([1, 2, 3])], "person.png", { type: "image/png" });

function fakeCanvasContext(): {
  context: CanvasRenderingContext2D;
  drawImage: ReturnType<typeof vi.fn>;
} {
  const drawImage = vi.fn();
  const context = { drawImage } as unknown as CanvasRenderingContext2D;
  return { context, drawImage };
}

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:crop"),
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderLoaded(width = 800, height = 1000) {
  render(<CropStep file={file} onConfirm={vi.fn()} onSkip={vi.fn()} />);
  const image = screen.getByAltText("Your photo, drag to frame");
  Object.defineProperty(image, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(image, "naturalHeight", { value: height, configurable: true });
  fireEvent.load(image);
  return image;
}

describe("CropStep", () => {
  it("renders the frame with the image loaded and buttons disabled until known", () => {
    render(<CropStep file={file} onConfirm={vi.fn()} onSkip={vi.fn()} />);

    expect(screen.getByText("Frame your photo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip crop" })).toBeEnabled();
  });

  it("enables Use photo once the image reports its natural size", () => {
    renderLoaded();

    expect(screen.getByRole("button", { name: "Use photo" })).toBeEnabled();
  });

  it("moves the image with pointer drag", () => {
    renderLoaded();
    const frame = screen.getByAltText("Your photo, drag to frame").parentElement;
    if (frame === null) throw new Error("frame missing");

    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 60, clientY: 130 });
    fireEvent.pointerUp(frame, { pointerId: 1 });

    const image = screen.getByAltText("Your photo, drag to frame");
    expect(image.style.transform).toContain("translate(-40px, 30px)");
  });

  it("zooms with the buttons and clamps at the limits", () => {
    renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByAltText("Your photo, drag to frame").style.transform).toContain(
      "scale(1.25)",
    );

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByAltText("Your photo, drag to frame").style.transform).toContain(
      "scale(1)",
    );
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });

  it("exports a cropped File via canvas on confirm", async () => {
    const onConfirm = vi.fn();
    const { context, drawImage } = fakeCanvasContext();
    const toBlob = vi.fn((callback: (blob: Blob | null) => void) => {
      callback(new Blob(["cropped"], { type: "image/png" }));
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(toBlob);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(<CropStep file={file} onConfirm={onConfirm} onSkip={vi.fn()} />);
    const image = screen.getByAltText("Your photo, drag to frame");
    Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: 1000, configurable: true });
    fireEvent.load(image);

    await fireEvent.click(screen.getByRole("button", { name: "Use photo" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    const exported = onConfirm.mock.calls[0]?.[0] as File;
    expect(exported.name).toBe("person-crop.png");
    expect(exported.type).toBe("image/png");
    expect(drawImage).toHaveBeenCalledTimes(1);
    const args = drawImage.mock.calls[0] as number[];
    expect(args[5]).toBe(0);
    expect(args[6]).toBe(0);
    expect(args[7]).toBe(1200);
    expect(args[8]).toBe(1500);
  });

  it("passes the original file through on skip", () => {
    const onSkip = vi.fn();
    render(<CropStep file={file} onConfirm={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip crop" }));

    expect(onSkip).toHaveBeenCalledWith(file);
  });
});
