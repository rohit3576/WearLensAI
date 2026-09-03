// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ky from "ky";
import { toast } from "sonner";
import { ImageDropzone } from "./image-dropzone";

const { postMock, httpErrorClass } = vi.hoisted(() => {
  class HTTPError extends Error {
    constructor(public response: Response) {
      super("http error");
    }
  }
  return { postMock: vi.fn(), httpErrorClass: HTTPError };
});

vi.mock("ky", () => ({ default: { post: postMock }, HTTPError: httpErrorClass }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const validFile = new File([new Uint8Array([1, 2, 3])], "person.png", { type: "image/png" });

function drop(file: File): void {
  fireEvent.drop(screen.getByRole("button", { name: /dropzone/i }), {
    dataTransfer: {
      files: [file],
      types: ["Files"],
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
    },
  });
}

/** Mirrors ky's thenable response: a promise with .json() attached synchronously. */
function kyResponse(data: unknown): Promise<unknown> & { json: () => Promise<unknown> } {
  return Object.assign(Promise.resolve(undefined), { json: async () => data });
}

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:preview"),
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
});

afterEach(() => {
  cleanup();
  postMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ImageDropzone", () => {
  it("renders its label and browse hint", () => {
    render(<ImageDropzone role="person" label="Your photo" onUploaded={vi.fn()} />);

    expect(screen.getByText("Your photo")).toBeInTheDocument();
    expect(screen.getByText(/click to browse/i)).toBeInTheDocument();
  });

  it("uploads a valid file and reports the stored image", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 800, height: 1000 }));
    postMock.mockReturnValue(
      kyResponse({ url: "/api/files/a.png", width: 800, height: 1000 }),
    );
    const onUploaded = vi.fn();
    render(<ImageDropzone role="person" label="Your photo" onUploaded={onUploaded} />);

    drop(validFile);

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith({
        url: "/api/files/a.png",
        width: 800,
        height: 1000,
      });
    });
    expect(screen.getByAltText("Your photo preview")).toBeInTheDocument();
    expect(screen.getByText("800x1000")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts and skips upload when the type is rejected", async () => {
    const onUploaded = vi.fn();
    render(<ImageDropzone role="garment" label="Garment" onUploaded={onUploaded} />);

    drop(new File([new Uint8Array([1])], "virus.exe", { type: "application/octet-stream" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("unsupported format"));
    });
    expect(ky.post).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("toasts and skips upload when the image is below the size window", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 100, height: 100 }));
    const onUploaded = vi.fn();
    render(<ImageDropzone role="garment" label="Garment" onUploaded={onUploaded} />);

    drop(validFile);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("shortest side must be >= 256px"));
    });
    expect(ky.post).not.toHaveBeenCalled();
  });

  it("toasts the server reason on a 422 response", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 800, height: 1000 }));
    postMock.mockImplementation(() => {
      throw new httpErrorClass(
        new Response(JSON.stringify({ error: "person.png: not a decodable image" }), { status: 422 }),
      );
    });
    const onUploaded = vi.fn();
    render(<ImageDropzone role="person" label="Your photo" onUploaded={onUploaded} />);

    drop(validFile);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("person.png: not a decodable image");
    });
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
