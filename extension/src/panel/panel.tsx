import { useCallback, useEffect, useState } from "react";
import ky from "ky";
import { z } from "zod";
import { TryOnFlow } from "./flow";
import "./panel.css";

export const DEFAULT_API_BASE = "http://localhost:3000" as const;

const HealthSchema = z.object({
  ok: z.literal(true),
  engine: z.string(),
  storage: z.string(),
});

type Health = z.infer<typeof HealthSchema>;

type HealthState =
  | { readonly state: "checking" }
  | { readonly state: "ok"; readonly health: Health }
  | { readonly state: "down" };

interface StorageApi {
  local: {
    get(keys: string[]): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  };
}

function storageOf(): StorageApi | undefined {
  const chromeApi = (globalThis as { chrome?: { storage?: StorageApi } }).chrome;
  return chromeApi?.storage;
}

async function readSavedApiBase(): Promise<string> {
  const storage = storageOf();
  if (storage === undefined) return DEFAULT_API_BASE;
  const stored = await storage.local.get(["apiBase"]);
  const value = stored["apiBase"];
  return typeof value === "string" && value !== "" ? value : DEFAULT_API_BASE;
}

export async function checkHealth(apiBase: string): Promise<HealthState> {
  try {
    const health = HealthSchema.parse(await ky.get(`${apiBase}/api/health`).json());
    return { state: "ok", health };
  } catch {
    return { state: "down" };
  }
}

function statusLine(health: HealthState): string {
  switch (health.state) {
    case "checking":
      return "Checking backend";
    case "ok":
      return `Connected — engine: ${health.health.engine}, storage: ${health.health.storage}`;
    case "down":
      return "Backend unreachable — is the web app running?";
  }
}

export function Panel() {
  const [apiBase, setApiBase] = useState<string>(DEFAULT_API_BASE);
  const [health, setHealth] = useState<HealthState>({ state: "checking" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await readSavedApiBase();
      setApiBase(saved);
      setHealth(await checkHealth(saved));
    })();
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await storageOf()?.local.set({ apiBase });
      setHealth(await checkHealth(apiBase));
    } finally {
      setSaving(false);
    }
  }, [apiBase]);

  return (
    <main className="panel">
      <div className="panel-header">
        <span className="panel-title">WearLensAI</span>
        <span className="status-row">
          <span className="status-dot" data-state={health.state} aria-hidden />
          {statusLine(health)}
        </span>
      </div>
      <section className="settings" aria-label="Backend settings">
        <span className="settings-label">
          WearLensAI backend URL — point this at your own deployment
        </span>
        <div className="settings-row">
          <input
            className="settings-input"
            type="url"
            value={apiBase}
            aria-label="Backend URL"
            onChange={(event) => {
              setApiBase(event.target.value);
            }}
          />
          <button type="button" className="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </section>
      {health.state === "ok" ? (
        <TryOnFlow apiBase={apiBase} />
      ) : (
        <p className="hint">
          Set the backend URL above and save — the try-on flow starts once the
          backend answers.
        </p>
      )}
    </main>
  );
}
