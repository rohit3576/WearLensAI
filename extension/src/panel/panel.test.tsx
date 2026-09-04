// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ky from "ky";
import { Panel } from "./panel";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("ky", () => ({ default: { get: getMock } }));

function kyResponse(data: unknown): Promise<unknown> & { json: () => Promise<unknown> } {
  return Object.assign(Promise.resolve(undefined), { json: async () => data });
}

const stored: Record<string, unknown> = {};
const setMock = vi.fn(async (items: Record<string, unknown>) => {
  Object.assign(stored, items);
});

beforeEach(() => {
  getMock.mockReset();
  setMock.mockClear();
  for (const key of Object.keys(stored)) delete stored[key];
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string[]) =>
          Object.fromEntries(keys.filter((k) => k in stored).map((k) => [k, stored[k]])),
        set: setMock,
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Panel shell", () => {
  it("shows checking state before the health probe settles", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    render(<Panel />);

    expect(screen.getByText("Checking backend")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("loads the saved API base and reports engine + storage when healthy", async () => {
    stored["apiBase"] = "https://wearlens.example";
    getMock.mockReturnValue(kyResponse({ ok: true, engine: "stub", storage: "local" }));

    render(<Panel />);

    await waitFor(() => {
      expect(screen.getByText(/Connected — engine: stub, storage: local/)).toBeInTheDocument();
    });
    expect(getMock).toHaveBeenCalledWith("https://wearlens.example/api/health");
    expect(screen.getByRole("textbox", { name: "Backend URL" })).toHaveValue(
      "https://wearlens.example",
    );
  });

  it("reports unreachable when the backend is down", async () => {
    getMock.mockImplementation(() => {
      throw new Error("connection refused");
    });

    render(<Panel />);

    await waitFor(() => {
      expect(screen.getByText(/Backend unreachable/)).toBeInTheDocument();
    });
  });

  it("saves a new API base to chrome.storage and re-checks health", async () => {
    getMock.mockReturnValue(kyResponse({ ok: true, engine: "stub", storage: "local" }));

    render(<Panel />);
    await waitFor(() => {
      expect(screen.getByText(/Connected/)).toBeInTheDocument();
    });

    const input = screen.getByRole("textbox", { name: "Backend URL" });
    fireEvent.change(input, { target: { value: "http://localhost:9999" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(setMock).toHaveBeenCalledWith({ apiBase: "http://localhost:9999" });
    await waitFor(() => {
      expect(getMock).toHaveBeenLastCalledWith("http://localhost:9999/api/health");
    });
  });

  it("shows the Your-fit section between backend settings and the flow", async () => {
    getMock.mockReturnValue(kyResponse({ ok: true, engine: "stub", storage: "local" }));

    render(<Panel />);

    const fit = await screen.findByRole("region", { name: "Your fit" });
    const settings = screen.getByRole("region", { name: "Backend settings" });
    expect(fit.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("passes a staged badge-click profile to the flow; corrupt staging stays hidden", async () => {    getMock.mockReturnValue(kyResponse({ ok: true, engine: "stub", storage: "local" }));
    const sessionStored: Record<string, unknown> = {
      pendingGarment: "https://cdn.store.test/picked.jpg",
      pendingProfile: { nonsense: true },
    };
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: async () => ({}),
          set: setMock,
        },
        session: {
          get: async (keys: string[]) =>
            Object.fromEntries(keys.filter((k) => k in sessionStored).map((k) => [k, sessionStored[k]])),
          set: async (items: Record<string, unknown>) => {
            Object.assign(sessionStored, items);
          },
        },
      },
    });

    render(<Panel />);

    await waitFor(() => {
      expect(screen.getByText(/Pick your photo once/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/no size chart on this page/)).not.toBeInTheDocument();
    expect(screen.queryByText(/size chart ✓/)).not.toBeInTheDocument();
  });
});
