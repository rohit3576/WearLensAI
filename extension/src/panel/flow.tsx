import { useCallback, useEffect, useState } from "react";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";
import { HTTPError } from "ky";
import {
  fetchAsBlob,
  runTryOn,
  submitTryOn,
  uploadErrorMessage,
  uploadImage,
} from "./api";
import { CropStep } from "./crop-step";
import { dataUrlToFile, fileToDataUrl, loadPersonPhoto, savePersonPhoto } from "./person-store";
import { activeTabCandidates } from "./tab-candidates";
import type { GarmentCandidate } from "../lib/detect";
import type { GarmentProfile } from "../lib/profile/schema";
import type { StatusEvent } from "./status-events";

type Stage =
  | { readonly kind: "scanning" }
  | { readonly kind: "pick"; readonly candidates: readonly GarmentCandidate[] }
  | { readonly kind: "person-setup"; readonly garment: GarmentCandidate; readonly reuseFile: File | null }
  | { readonly kind: "running"; readonly garment: GarmentCandidate }
  | { readonly kind: "done"; readonly personUrl: string; readonly resultUrl: string }
  | { readonly kind: "failed"; readonly reason: string };

export interface TryOnFlowProps {
  readonly apiBase: string;
  /** Pre-selected garment (badge click) — skips scanning straight to setup. */
  readonly initialGarment?: string;
  /** What the badge click read from the page (brand · category · chart state). */
  readonly initialProfile?: GarmentProfile;
}

export function TryOnFlow({ apiBase, initialGarment, initialProfile }: TryOnFlowProps) {
  const [stage, setStage] = useState<Stage>({ kind: "scanning" });

  const scan = useCallback(async () => {
    setStage({ kind: "scanning" });
    const candidates = await activeTabCandidates();
    if (candidates.length === 0) {
      setStage({ kind: "pick", candidates: [] });
      return;
    }
    setStage({ kind: "pick", candidates });
  }, []);

  useEffect(() => {
    if (initialGarment === undefined) {
      void scan();
      return;
    }
    void pickGarment({
      src: initialGarment,
      width: 0,
      height: 0,
      score: 0,
      source: "gallery",
    });
  }, [scan, initialGarment]);

  async function startWithPerson(
    garment: GarmentCandidate,
    personFile: File | null,
  ): Promise<void> {
    setStage({ kind: "running", garment });
    try {
      const [person, garmentUpload] = await Promise.all([
        personFile === null
          ? Promise.reject(new Error("no person photo"))
          : uploadImage(apiBase, personFile, "person"),
        uploadImage(apiBase, await fetchAsBlob(garment.src), "garment"),
      ]);
      const jobId = await submitTryOn(apiBase, person.url, garmentUpload.url);
      const terminal = await runTryOn(apiBase, jobId);
      if (terminal.phase === "failed") {
        setStage({ kind: "failed", reason: terminal.reason });
        return;
      }
      setStage({ kind: "done", personUrl: person.url, resultUrl: terminal.resultUrl });
    } catch (error) {
      if (error instanceof HTTPError) {
        setStage({ kind: "failed", reason: await uploadErrorMessage(error) });
        return;
      }
      if (error instanceof Error) {
        setStage({ kind: "failed", reason: error.message });
        return;
      }
      throw error;
    }
  }

  async function pickGarment(garment: GarmentCandidate): Promise<void> {
    const savedDataUrl = await loadPersonPhoto();
    const reuseFile = savedDataUrl === undefined ? null : await dataUrlToFile(savedDataUrl);
    setStage({ kind: "person-setup", garment, reuseFile });
  }

  return (
    <section className="flow" aria-label="Try-on flow">
      {initialProfile !== undefined ? <ProfileLine profile={initialProfile} /> : null}

      {stage.kind === "scanning" ? <p className="hint">Looking for garments on this page…</p> : null}

      {stage.kind === "pick" ? (
        stage.candidates.length === 0 ? (
          <p className="hint">No garment images detected on this page yet.</p>
        ) : (
          <div className="candidates">
            {stage.candidates.map((candidate) => (
              <button
                key={candidate.src}
                type="button"
                className="candidate"
                onClick={() => {
                  void pickGarment(candidate);
                }}
              >
                <img src={candidate.src} alt="Detected garment" />
              </button>
            ))}
          </div>
        )
      ) : null}

      {stage.kind === "person-setup" ? (
        stage.reuseFile !== null ? (
          <div className="person-reuse">
            <p className="hint">Using the photo you saved earlier.</p>
            <button
              type="button"
              className="button"
              onClick={() => {
                void startWithPerson(stage.garment, stage.reuseFile);
              }}
            >
              Try it on
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                setStage({ kind: "person-setup", garment: stage.garment, reuseFile: null });
              }}
            >
              Use a different photo
            </button>
          </div>
        ) : (
          <PersonPicker
            onReady={(file) => {
              void startWithPerson(stage.garment, file);
            }}
          />
        )
      ) : null}

      {stage.kind === "running" ? (
        <p className="hint" aria-live="polite">
          Trying it on — a few seconds…
        </p>
      ) : null}

      {stage.kind === "done" ? (
        <div className="result">
          <ReactCompareSlider
            className="result-slider"
            itemOne={
              <ReactCompareSliderImage
                src={stage.personUrl}
                alt="Before: your photo"
                style={{ height: "100%", objectFit: "contain" }}
              />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={`${apiBase}${stage.resultUrl}`}
                alt="After: wearing the garment"
                style={{ height: "100%", objectFit: "contain" }}
              />
            }
          />
          <button type="button" className="button button-outline" onClick={() => void scan()}>
            Scan again
          </button>
        </div>
      ) : null}

      {stage.kind === "failed" ? (
        <div className="result">
          <p className="hint">{stage.reason}</p>
          <button type="button" className="button button-outline" onClick={() => void scan()}>
            Scan again
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ProfileLine({ profile }: { profile: GarmentProfile }) {
  const identity = [profile.brand, profile.category]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
  const chart =
    profile.sizeChart !== undefined
      ? `size chart ✓ (${profile.sizeChart.rows.length} sizes)`
      : "no size chart on this page";
  return (
    <p className="hint profile-line">
      {identity !== "" ? `${identity} — ` : ""}
      {chart}
    </p>
  );
}

function PersonPicker({ onReady }: { onReady: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null);

  async function handleConfirm(cropped: File): Promise<void> {
    try {
      await savePersonPhoto(await fileToDataUrl(cropped));
    } catch {
      // Saving is best-effort; the try-on proceeds with the in-memory file.
    }
    onReady(cropped);
  }

  if (file === null) {
    return (
      <div className="person-reuse">
        <p className="hint">Pick your photo once — it is saved locally and reused on every store.</p>
        <label className="button file-button">
          Choose photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked !== undefined) setFile(picked);
            }}
          />
        </label>
      </div>
    );
  }
  return (
    <CropStep
      file={file}
      onConfirm={(cropped) => {
        void handleConfirm(cropped);
      }}
      onSkip={(original) => {
        void handleConfirm(original);
      }}
    />
  );
}
