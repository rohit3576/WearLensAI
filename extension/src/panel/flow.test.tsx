// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TryOnFlow } from "./flow";
import type { GarmentCandidate } from "../lib/detect";

const { apiMocks, candidatesMock, personStoreMocks, bodyProfileMocks, normalizeCacheMocks } =
  vi.hoisted(() => ({
    apiMocks: {
      uploadImage: vi.fn(),
      submitTryOn: vi.fn(),
      runTryOn: vi.fn(),
      fetchAsBlob: vi.fn(),
      fitAdvice: vi.fn(),
      normalizeProfile: vi.fn(),
    },
    candidatesMock: vi.fn(),
    personStoreMocks: {
      loadPersonPhoto: vi.fn(),
      savePersonPhoto: vi.fn(),
      fileToDataUrl: vi.fn(),
      dataUrlToFile: vi.fn(),
      clearPersonPhoto: vi.fn(),
    },
    bodyProfileMocks: {
      loadBodyProfile: vi.fn(),
    },
    normalizeCacheMocks: {
      cachedProfile: vi.fn(),
      cacheProfile: vi.fn(),
    },
  }));

vi.mock("./api", () => apiMocks);
vi.mock("./tab-candidates", () => ({ activeTabCandidates: candidatesMock }));
vi.mock("./person-store", () => personStoreMocks);
vi.mock("./body-profile-store", () => bodyProfileMocks);
vi.mock("./normalize-cache", () => normalizeCacheMocks);

const garment: GarmentCandidate = {
  src: "https://cdn.store.test/dress.jpg",
  width: 640,
  height: 853,
  score: 100,
  source: "jsonld",
};

const chartedProfile = {
  sourceUrl: "https://store.test/products/dress",
  brand: "Acme",
  sizeChart: {
    unit: "cm" as const,
    from: "dom-table" as const,
    rows: [
      { size: "S", heightRangeCm: [160, 168] as [number, number] },
      { size: "M", heightRangeCm: [169, 176] as [number, number] },
    ],
  },
};

beforeEach(() => {
  for (const mock of [
    ...Object.values(apiMocks),
    candidatesMock,
    ...Object.values(personStoreMocks),
    ...Object.values(bodyProfileMocks),
    ...Object.values(normalizeCacheMocks),
  ]) {
    mock.mockReset();
  }
  normalizeCacheMocks.cachedProfile.mockResolvedValue(undefined);
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

  it("shows the profile line with chart status when the badge click carried a profile", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={{
          sourceUrl: "https://store.test/products/dress",
          brand: "Acme",
          category: "Dresses",
          sizeChart: {
            unit: "cm",
            from: "dom-table",
            rows: [
              { size: "S", chestCm: 88 },
              { size: "M", chestCm: 94 },
            ],
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Acme · Dresses — size chart ✓ (2 sizes)")).toBeInTheDocument();
    });
  });

  it("shows the honest no-chart line when the profile carries no chart", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={{ sourceUrl: "https://store.test/products/dress", brand: "Acme" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Acme — no size chart on this page")).toBeInTheDocument();
    });
  });

  it("renders no profile line when no profile was staged", async () => {
    candidatesMock.mockResolvedValue([garment]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);

    render(<TryOnFlow apiBase="http://localhost:3000" />);

    await screen.findByRole("button", { name: "Detected garment" });
    expect(screen.queryByText(/no size chart on this page/)).not.toBeInTheDocument();
    expect(screen.queryByText(/size chart ✓/)).not.toBeInTheDocument();
  });

  it("renders the size-advice card when a chart and a saved body profile exist", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);
    bodyProfileMocks.loadBodyProfile.mockResolvedValue({
      heightCm: 172,
      fitPreference: "regular",
    });
    apiMocks.fitAdvice.mockResolvedValue({
      size: "M",
      confidence: "high",
      reasons: ["Your height 172 cm is inside the M range (169–176 cm)"],
    });

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={chartedProfile}
      />,
    );

    expect(
      await screen.findByText("Size M — high confidence"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your height 172 cm is inside the M range (169–176 cm)"),
    ).toBeInTheDocument();
    expect(apiMocks.fitAdvice).toHaveBeenCalledTimes(1);
    expect(apiMocks.fitAdvice).toHaveBeenCalledWith(
      "http://localhost:3000",
      chartedProfile,
      { heightCm: 172, fitPreference: "regular" },
    );
  });

  it("shows the set-height prompt when no body profile is saved", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);
    bodyProfileMocks.loadBodyProfile.mockResolvedValue(undefined);

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={chartedProfile}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Set your height in Your fit above for size advice."),
      ).toBeInTheDocument();
    });
    expect(apiMocks.fitAdvice).not.toHaveBeenCalled();
  });

  it("never requests advice when the profile has no chart", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);
    bodyProfileMocks.loadBodyProfile.mockResolvedValue({ heightCm: 172, fitPreference: "regular" });

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={{ sourceUrl: "https://store.test/products/dress", brand: "Acme" }}
      />,
    );

    await screen.findByText(/Pick your photo once/);
    expect(apiMocks.fitAdvice).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Size advice")).not.toBeInTheDocument();
    expect(screen.queryByText(/Set your height/)).not.toBeInTheDocument();
  });

  it("stays silent when the advice fetch fails — try-on is unaffected", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);
    bodyProfileMocks.loadBodyProfile.mockResolvedValue({ heightCm: 172, fitPreference: "regular" });
    apiMocks.fitAdvice.mockRejectedValue(new Error("backend down"));

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={chartedProfile}
      />,
    );

    await screen.findByText(/Pick your photo once/);
    expect(screen.queryByLabelText("Size advice")).not.toBeInTheDocument();
  });

  it("normalizes a chartless staged profile and cascades to the advice card", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);
    bodyProfileMocks.loadBodyProfile.mockResolvedValue({ heightCm: 172, fitPreference: "regular" });
    const enriched = {
      sourceUrl: "https://store.test/products/dress",
      brand: "Acme",
      sizeChart: {
        unit: "cm" as const,
        from: "llm" as const,
        rows: [{ size: "M", heightRangeCm: [169, 176] as [number, number] }],
      },
    };
    apiMocks.normalizeProfile.mockResolvedValue(enriched);
    apiMocks.fitAdvice.mockResolvedValue({
      size: "M",
      confidence: "high",
      reasons: ["Your height 172 cm is inside the M range (169–176 cm)"],
    });

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={{ sourceUrl: "https://store.test/products/dress", brand: "Acme" }}
        initialRaw={{ tables: ["<table>Size chest S 88</table>"] }}
      />,
    );

    expect(await screen.findByText("Size M — high confidence")).toBeInTheDocument();
    expect(screen.getByText("Acme — size chart ✓ (1 sizes)")).toBeInTheDocument();
    expect(apiMocks.normalizeProfile).toHaveBeenCalledTimes(1);
    expect(apiMocks.normalizeProfile).toHaveBeenCalledWith("http://localhost:3000", {
      sourceUrl: "https://store.test/products/dress",
      deterministic: { sourceUrl: "https://store.test/products/dress", brand: "Acme" },
      raw: { tables: ["<table>Size chest S 88</table>"] },
    });
    expect(normalizeCacheMocks.cacheProfile).toHaveBeenCalledWith(enriched);
  });

  it("skips the normalize call when the cache already holds a profile for the URL", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);
    bodyProfileMocks.loadBodyProfile.mockResolvedValue(undefined);
    normalizeCacheMocks.cachedProfile.mockResolvedValue({
      sourceUrl: "https://store.test/products/dress",
      brand: "Acme",
      sizeChart: {
        unit: "cm",
        from: "llm",
        rows: [{ size: "M", heightRangeCm: [169, 176] }],
      },
    });

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={{ sourceUrl: "https://store.test/products/dress", brand: "Acme" }}
        initialRaw={{ tables: ["<table>Size chest</table>"] }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Acme — size chart ✓ (1 sizes)")).toBeInTheDocument();
    });
    expect(apiMocks.normalizeProfile).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Set your height in Your fit above for size advice."),
    ).toBeInTheDocument();
  });

  it("leaves the honest no-chart line when normalization finds nothing (rules mode)", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);
    apiMocks.normalizeProfile.mockResolvedValue(undefined);

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={{ sourceUrl: "https://store.test/products/dress", brand: "Acme" }}
        initialRaw={{ tables: ["<table>no sizes here</table>"] }}
      />,
    );

    await screen.findByText("Acme — no size chart on this page");
    expect(screen.queryByLabelText("Size advice")).not.toBeInTheDocument();
  });

  it("stays silent when normalization itself fails — the deterministic view remains", async () => {
    candidatesMock.mockResolvedValue([]);
    personStoreMocks.loadPersonPhoto.mockResolvedValue(undefined);
    apiMocks.normalizeProfile.mockRejectedValue(new Error("backend down"));

    render(
      <TryOnFlow
        apiBase="http://localhost:3000"
        initialGarment="https://cdn.store.test/picked.jpg"
        initialProfile={{ sourceUrl: "https://store.test/products/dress", brand: "Acme" }}
        initialRaw={{ tables: ["<table>Size chest</table>"] }}
      />,
    );

    await screen.findByText("Acme — no size chart on this page");
    expect(screen.queryByLabelText("Size advice")).not.toBeInTheDocument();
  });
});
