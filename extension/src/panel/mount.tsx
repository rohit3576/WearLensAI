import { createRoot } from "react-dom/client";
import { Panel } from "./panel";

const root = document.getElementById("root");
if (root === null) throw new Error("panel root missing");
createRoot(root).render(<Panel />);
