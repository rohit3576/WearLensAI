// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BodyProfileSection } from "./body-profile";

const storeMocks = vi.hoisted(() => ({
  loadBodyProfile: vi.fn(),
  saveBodyProfile: vi.fn(),
  clearBodyProfile: vi.fn(),
}));

vi.mock("./body-profile-store", () => storeMocks);

beforeEach(() => {
  for (const mock of Object.values(storeMocks)) mock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("BodyProfileSection", () => {
  it("renders the saved summary once a profile exists", async () => {
    storeMocks.loadBodyProfile.mockResolvedValue({
      heightCm: 175,
      chestCm: 96,
      waistCm: 78,
      fitPreference: "regular",
    });

    render(<BodyProfileSection />);

    await waitFor(() => {
      expect(screen.getByText("175 cm · chest 96 · waist 78 · regular")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("shows the empty form when nothing is saved", async () => {
    storeMocks.loadBodyProfile.mockResolvedValue(undefined);

    render(<BodyProfileSection />);

    await screen.findByLabelText("Height (cm)");
    expect(screen.getByRole("button", { name: "Save fit" })).toBeInTheDocument();
  });

  it("expands the form with saved values on Edit", async () => {
    storeMocks.loadBodyProfile.mockResolvedValue({
      heightCm: 168,
      chestCm: 92,
      fitPreference: "loose",
    });

    render(<BodyProfileSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Height (cm)")).toHaveValue("168");
    expect(screen.getByLabelText(/Chest \(cm\)/)).toHaveValue("92");
    expect(screen.getByLabelText("Looser", { exact: false })).toBeChecked();
  });

  it("rejects an empty height with the needed copy and never saves", async () => {
    storeMocks.loadBodyProfile.mockResolvedValue(undefined);

    render(<BodyProfileSection />);
    await screen.findByLabelText("Height (cm)");
    fireEvent.click(screen.getByRole("button", { name: "Save fit" }));

    expect(await screen.findByText("Height is needed for size advice")).toBeInTheDocument();
    expect(storeMocks.saveBodyProfile).not.toHaveBeenCalled();
  });

  it("rejects out-of-range height and chest with the exact bounds copy", async () => {
    storeMocks.loadBodyProfile.mockResolvedValue(undefined);

    render(<BodyProfileSection />);
    await screen.findByLabelText("Height (cm)");
    fireEvent.change(screen.getByLabelText("Height (cm)"), { target: { value: "119" } });
    fireEvent.change(screen.getByLabelText(/Chest \(cm\)/), { target: { value: "161" } });
    fireEvent.click(screen.getByRole("button", { name: "Save fit" }));

    expect(
      await screen.findByText("Height must be between 120 and 220 cm"),
    ).toBeInTheDocument();
    expect(screen.getByText("Chest must be between 60 and 160 cm")).toBeInTheDocument();
    expect(storeMocks.saveBodyProfile).not.toHaveBeenCalled();
  });

  it("converts imperial input to canonical cm on save", async () => {
    storeMocks.loadBodyProfile.mockResolvedValue(undefined);
    storeMocks.saveBodyProfile.mockResolvedValue({
      heightCm: 175,
      fitPreference: "regular",
    });

    render(<BodyProfileSection />);
    await screen.findByLabelText("Height (cm)");
    fireEvent.click(screen.getByRole("button", { name: "in" }));
    fireEvent.change(await screen.findByLabelText("Height (in)"), { target: { value: "69" } });
    fireEvent.click(screen.getByRole("button", { name: "Save fit" }));

    await waitFor(() => {
      expect(storeMocks.saveBodyProfile).toHaveBeenCalledWith(
        expect.objectContaining({ heightCm: 175 }),
      );
    });
  });

  it("saves a valid profile and collapses to the summary line", async () => {
    storeMocks.loadBodyProfile.mockResolvedValue(undefined);
    storeMocks.saveBodyProfile.mockResolvedValue({
      heightCm: 182,
      fitPreference: "tight",
    });

    render(<BodyProfileSection />);
    await screen.findByLabelText("Height (cm)");
    fireEvent.change(screen.getByLabelText("Height (cm)"), { target: { value: "182" } });
    fireEvent.click(screen.getByRole("radio", { name: "Tighter" }));
    fireEvent.click(screen.getByRole("button", { name: "Save fit" }));

    await waitFor(() => {
      expect(screen.getByText("182 cm · tighter")).toBeInTheDocument();
    });
    expect(storeMocks.saveBodyProfile).toHaveBeenCalledWith({
      heightCm: 182,
      fitPreference: "tight",
    });
  });

  it("clears a saved profile back to the empty form", async () => {
    storeMocks.loadBodyProfile.mockResolvedValue({
      heightCm: 175,
      fitPreference: "regular",
    });

    render(<BodyProfileSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(storeMocks.clearBodyProfile).toHaveBeenCalled();
    });
    expect(await screen.findByLabelText("Height (cm)")).toHaveValue("");
  });
});
