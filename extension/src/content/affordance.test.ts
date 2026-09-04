// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAffordance } from "./affordance";

const STORE_URL = "https://store.test/products/dress";

function storePage(extraBody = ""): Document {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>
      <img src="https://cdn.store.test/model-worn.jpg" width="640" height="853" alt="Wrap dress worn by model">
      ${extraBody}
    </body></html>`,
    { url: STORE_URL },
  );
  return dom.window.document;
}

let sendMessageMock: ReturnType<typeof vi.fn<() => void>>;
let doc: Document;
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  sendMessageMock = vi.fn();
  doc = storePage();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("startAffordance", () => {
  it("shows the badge over a detected garment on hover and sends the src on click", () => {
    stop = startAffordance(doc, { sendMessage: sendMessageMock }, false);

    const img = doc.querySelector("img");
    if (img === null) throw new Error("fixture image missing");
    img.dispatchEvent(new doc.defaultView!.Event("mouseenter", { bubbles: false }));

    const badge = doc.querySelector("button.wearlens-try-badge") as HTMLButtonElement | null;
    if (badge === null) throw new Error("badge missing");
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("Try this on");

    badge.click();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "wearlens:try-this",
      src: "https://cdn.store.test/model-worn.jpg",
    });
    expect(badge.hidden).toBe(true);
  });

  it("does not bind images that fail detection", () => {
    const logo = doc.createElement("img");
    logo.src = "https://cdn.store.test/logo.png";
    logo.setAttribute("width", "120");
    logo.setAttribute("height", "40");
    doc.body.appendChild(logo);

    stop = startAffordance(doc, { sendMessage: sendMessageMock }, false);

    logo.dispatchEvent(new doc.defaultView!.Event("mouseenter", { bubbles: false }));
    const badge = doc.querySelector("button.wearlens-try-badge") as HTMLButtonElement | null;
    if (badge === null) throw new Error("badge missing");
    expect(badge.hidden).toBe(true);
  });

  it("re-binds for images added after load (SPA), debounced", async () => {
    stop = startAffordance(doc, { sendMessage: sendMessageMock });

    const added = doc.createElement("img");
    added.src = "https://cdn.store.test/second-dress.jpg";
    added.setAttribute("width", "600");
    added.setAttribute("height", "800");
    added.setAttribute("alt", "Second dress");
    doc.body.appendChild(added);

    await vi.advanceTimersByTimeAsync(500);

    added.dispatchEvent(new doc.defaultView!.Event("mouseenter", { bubbles: false }));
    const badge = doc.querySelector("button.wearlens-try-badge") as HTMLButtonElement | null;
    if (badge === null) throw new Error("badge missing");
    expect(badge.hidden).toBe(false);

    badge.click();
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "wearlens:try-this",
      src: "https://cdn.store.test/second-dress.jpg",
    });
  });

  it("hides the badge on page scroll", () => {
    stop = startAffordance(doc, { sendMessage: sendMessageMock }, false);

    const img = doc.querySelector("img");
    if (img === null) throw new Error("fixture image missing");
    img.dispatchEvent(new doc.defaultView!.Event("mouseenter", { bubbles: false }));

    doc.defaultView!.dispatchEvent(new doc.defaultView!.Event("scroll"));

    const badge = doc.querySelector("button.wearlens-try-badge") as HTMLButtonElement | null;
    if (badge === null) throw new Error("badge missing");
    expect(badge.hidden).toBe(true);
  });
});
