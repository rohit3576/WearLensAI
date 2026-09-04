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

let sendMessageMock: ReturnType<typeof vi.fn<(message: unknown) => void>>;
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
      type: "wearlens:garment-picked",
      src: "https://cdn.store.test/model-worn.jpg",
      profile: undefined,
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
      type: "wearlens:garment-picked",
      src: "https://cdn.store.test/second-dress.jpg",
      profile: undefined,
    });
  });

  it("carries the garment profile (ld+json fields + size chart) on click", () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head>
        <script type="application/ld+json">
          {"@type": "Product", "name": "Wrap Dress", "brand": "Acme"}
        </script>
      </head><body>
        <img src="https://cdn.store.test/model-worn.jpg" width="640" height="853" alt="Wrap dress worn by model">
        <table><tbody>
          <tr><th>Size</th><th>Chest (cm)</th></tr>
          <tr><td>S</td><td>88</td></tr>
          <tr><td>M</td><td>94</td></tr>
        </tbody></table>
      </body></html>`,
      { url: STORE_URL },
    );
    doc = dom.window.document;

    stop = startAffordance(doc, { sendMessage: sendMessageMock }, false);

    const img = doc.querySelector("img");
    if (img === null) throw new Error("fixture image missing");
    img.dispatchEvent(new doc.defaultView!.Event("mouseenter", { bubbles: false }));
    const badge = doc.querySelector("button.wearlens-try-badge") as HTMLButtonElement | null;
    if (badge === null) throw new Error("badge missing");
    badge.click();

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const message = sendMessageMock.mock.calls[0]?.[0] as {
      type: string;
      src: string;
      profile: { title?: string; brand?: string; sizeChart?: { rows: unknown[] } };
    };
    expect(message.type).toBe("wearlens:garment-picked");
    expect(message.profile.title).toBe("Wrap Dress");
    expect(message.profile.brand).toBe("Acme");
    expect(message.profile.sizeChart?.rows).toHaveLength(2);
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
