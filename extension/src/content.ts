import { startAffordance } from "./content/affordance";

startAffordance(document, {
  sendMessage: (message) => {
    void chrome.runtime.sendMessage(message);
  },
});
