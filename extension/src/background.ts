chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

interface GarmentPickedMessage {
  type: "wearlens:garment-picked";
  src: string;
  profile?: unknown;
  raw?: unknown;
}

function isGarmentPicked(message: unknown): message is GarmentPickedMessage {
  if (message === null || typeof message !== "object") return false;
  const candidate = message as { type?: unknown; src?: unknown; profile?: unknown; raw?: unknown };
  return (
    candidate.type === "wearlens:garment-picked" &&
    typeof candidate.src === "string" &&
    (candidate.profile === undefined || typeof candidate.profile === "object") &&
    (candidate.raw === undefined || typeof candidate.raw === "object")
  );
}

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (isGarmentPicked(message) && sender.tab?.id !== undefined) {
    const tabId = sender.tab.id;
    void chrome.storage.session
      .set({
        pendingGarment: message.src,
        pendingProfile: message.profile,
        pendingRaw: message.raw,
      })
      .then(() => chrome.sidePanel.open({ tabId }))
      .catch(() => {
        // Panel open must ride a user gesture; badge clicks satisfy it, but
        // failures here are non-fatal — the toolbar button still opens it.
      });
  }
});

export {};
