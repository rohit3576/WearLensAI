// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TryOnFlow } from "./flow";
import type { GarmentCandidate } from "../lib/detect";

const { apiMocks, candidatesMock, personStoreMocks } = vi.hoisted(() => ({
  apiMocks: {
    uploadImage: vi.fn(),
    submitTryOn: vi.fn(),
    runTryOn: vi.fn(),
    fetchAsBlob: vi.fn(),
  },
  candidatesMock: vi.fn(),
  personStoreMocks: {
    loadPersonPhoto: vi.fn(),
    savePersonPhoto: vi.fn(),
    fileToDataUrl: vi.fn(),
    dataUrlToFile: vi.fn(),
    clearPersonPhoto: vi.fn(),
  },
}));

vi.mock("./api", () => apiMocks);
vi.mock("./tab-candidates", () => ({ activeTabCandidates: candidatesMock }));
vi.mock("./person-store", () => personStoreMocks);

const garment: GarmentCandidate = {
  src: "https://cdn.store.test/dress.jpg",
  width: 640,
  height: 853,
  score: 100,
  source: "jsonld",
};

beforeEach(() => {
  for (const mock of [
    ...Object.values(apiMocks),
    candidatesMock,
    ...Object.values(personStoreMocks),
  ]) {
    mock.mockReset();
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TryOnFlow", () => {
  it("renders detected candidates after scanning and enters person setup on pick", async () => {
    candidatesMock.mockResolvedValue([garment]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);

    render(<TryOnFlow apiBase="http://localhost:3000" />);

    const tile = await screen.findByRole("button", { name: "Detected garment" });
    fireEvent.click(tile);

    await waitFor(() => {
      expect(screen.getByText(/Pick your photo once/)).toBeInTheDocument();
    });
    expect(screen.getByText("Choose photo")).toBeInTheDocument();
  });

  it("reuses the saved person photo through the full pipeline to the slider", async () => {
    candidatesMock.mockResolvedValue([garment]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue("data:image/jpeg;base64,abc");
    personStoreMocks.dataUrlToFile.mockResolvedValue(new File(["p"], "person.jpg", { type: "image/jpeg" }));
    apiMocks.uploadImage.mockImplementation(async (_base: string, file: File, role: string) =>
      role === "person"
        ? { url: "/api/files/person.jpg", width: 1200, height: 1500 }
        : { url: "/api/files/garment.jpg", width: 640, height: 853 },
    );
    apiMocks.fetchAsBlob.mockResolvedValue(new File(["g"], "garment.jpg", { type: "image/jpeg" }));
    apiMocks.submitTryOn.mockResolvedValue("job-1");
    apiMocks.runTryOn.mockResolvedValue({ phase: "done", resultUrl: "/api/results/job-1.png" });

    render(<TryOnFlow apiBase="http://localhost:3000" />);
    fireEvent.click(await screen.findByRole("button", { name: "Detected garment" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try it on" }));

    await waitFor(() => {
      expect(screen.getByAltText("After: wearing the garment")).toBeInTheDocument();
    });
    expect(apiMocks.submitTryOn).toHaveBeenCalledWith(
      "http://localhost:3000",
      "/api/files/person.jpg",
      "/api/files/garment.jpg",
    );
  });

  it("surfaces the failure reason with a scan-again button", async () => {
    candidatesMock.mockResolvedValue([garment]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue("data:image/jpeg;base64,abc");
    personStoreMocks.dataUrlToFile.mockResolvedValue(new File(["p"], "person.jpg", { type: "image/jpeg" }));
    apiMocks.uploadImage.mockImplementation(async (_base: string, _file: File, role: string) =>
      role === "person"
        ? { url: "/api/files/person.jpg", width: 1200, height: 1500 }
        : { url: "/api/files/garment.jpg", width: 640, height: 853 },
    );
    apiMocks.fetchAsBlob.mockResolvedValue(new File(["g"], "garment.jpg", { type: "image/jpeg" }));
    apiMocks.submitTryOn.mockResolvedValue("job-2");
    apiMocks.runTryOn.mockResolvedValue({ phase: "failed", reason: "stub failure injection" });

    render(<TryOnFlow apiBase="http://localhost:3000" />);
    fireEvent.click(await screen.findByRole("button", { name: "Detected garment" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try it on" }));

    await waitFor(() => {
      expect(screen.getByText("stub failure injection")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Scan again" })).toBeInTheDocument();
  });

  it("shows the empty hint when no garments are detected", async () => {
    candidatesMock.mockResolvedValue([]);

    render(<TryOnFlow apiBase="http://localhost:3000" />);

    await waitFor(() => {
      expect(screen.getByText(/No garment images detected/)).toBeInTheDocument();
    });
  });

  it("skips scanning when a garment was staged by the badge click", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Pick your photo once/)).toBeInTheDocument();
    });
    expect(candidatesMock).not.toHaveBeenCalled();
  });
});
