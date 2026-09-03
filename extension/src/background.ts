chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (
    message !== null &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === "wearlens:try-this" &&
    typeof (message as { src?: unknown }).src === "string" &&
    sender.tab?.id !== undefined
  ) {
    const src = (message as { src: string }).src;
    const tabId = sender.tab.id;
    void chrome.storage.session
      .set({ pendingGarment: src })
      .then(() => chrome.sidePanel.open({ tabId }))
      .catch(() => {
        // Panel open must ride a user gesture; badge clicks satisfy it, but
        // failures here are non-fatal — the toolbar button still opens it.
      });
  }
});

export {};
