import { useEffect, useState } from "react";
import { BodyProfileSchema } from "../lib/profile/schema";
import type { BodyProfile } from "../lib/profile/schema";
import { clearBodyProfile, loadBodyProfile, saveBodyProfile } from "./body-profile-store";

type Unit = "cm" | "in";
type Preference = BodyProfile["fitPreference"];

const PREFERENCE_LABELS: Record<Preference, string> = {
  tight: "tighter",
  regular: "regular",
  loose: "looser",
};

const HEIGHT_NEEDED = "Height is needed for size advice";
const IMPERIAL_HINT = '1 in = 2.54 cm — 5\'9" is 69 in';

function summaryOf(profile: BodyProfile): string {
  const parts = [`${profile.heightCm} cm`];
  if (profile.chestCm !== undefined) parts.push(`chest ${profile.chestCm}`);
  if (profile.waistCm !== undefined) parts.push(`waist ${profile.waistCm}`);
  parts.push(PREFERENCE_LABELS[profile.fitPreference]);
  return parts.join(" · ");
}

/** Field text → cm integer; undefined for empty or non-numeric input. */
function fieldToCm(raw: string, unit: Unit): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.round(unit === "in" ? value * 2.54 : value);
}

export function BodyProfileSection() {
  const [profile, setProfile] = useState<BodyProfile | undefined>(undefined);
  const [unit, setUnit] = useState<Unit>("cm");
  const [height, setHeight] = useState("");
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");
  const [preference, setPreference] = useState<Preference>("regular");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadBodyProfile().then((saved) => {
      setProfile(saved);
      if (saved !== undefined) {
        setHeight(String(saved.heightCm));
        setChest(saved.chestCm === undefined ? "" : String(saved.chestCm));
        setWaist(saved.waistCm === undefined ? "" : String(saved.waistCm));
        setPreference(saved.fitPreference);
      }
    });
  }, []);

  function switchUnit(next: Unit): void {
    if (next === unit) return;
    const convert = (raw: string): string => {
      const value = Number.parseFloat(raw);
      if (raw.trim() === "" || !Number.isFinite(value)) return raw;
      return String(unit === "cm" ? Math.round((value / 2.54) * 10) / 10 : Math.round(value * 2.54));
    };
    setHeight(convert(height));
    setChest(convert(chest));
    setWaist(convert(waist));
    setUnit(next);
  }

  async function handleSave(): Promise<void> {
    const heightCm = fieldToCm(height, unit);
    const chestCm = fieldToCm(chest, unit);
    const waistCm = fieldToCm(waist, unit);
    const candidate = {
      ...(heightCm === undefined ? {} : { heightCm }),
      ...(chestCm === undefined ? {} : { chestCm }),
      ...(waistCm === undefined ? {} : { waistCm }),
      fitPreference: preference,
    };

    const nextErrors: Record<string, string> = {};
    if (heightCm === undefined) nextErrors["height"] = HEIGHT_NEEDED;
    if (chest !== "" && chestCm === undefined) {
      nextErrors["chest"] = "Chest must be between 60 and 160 cm";
    }
    if (waist !== "" && waistCm === undefined) {
      nextErrors["waist"] = "Waist must be between 60 and 160 cm";
    }

    const parsed = BodyProfileSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "heightCm" && heightCm !== undefined) {
          nextErrors["height"] = issue.message;
        }
        if (field === "chestCm" && chestCm !== undefined) nextErrors["chest"] = issue.message;
        if (field === "waistCm" && waistCm !== undefined) nextErrors["waist"] = issue.message;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    const saved = await saveBodyProfile(candidate);
    setProfile(saved);
  }

  async function handleClear(): Promise<void> {
    await clearBodyProfile();
    setProfile(undefined);
    setHeight("");
    setChest("");
    setWaist("");
    setPreference("regular");
    setErrors({});
  }

  if (profile !== undefined) {
    return (
      <section className="settings" aria-label="Your fit">
        <span className="settings-label">{summaryOf(profile)}</span>
        <div className="settings-row">
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setProfile(undefined);
            }}
          >
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="settings" aria-label="Your fit">
      <span className="settings-label">Your fit — set once, reused on every store</span>
      <div className="fit-unit" role="group" aria-label="Units">
        <button
          type="button"
          className="button button-outline"
          aria-pressed={unit === "cm"}
          onClick={() => switchUnit("cm")}
        >
          cm
        </button>
        <button
          type="button"
          className="button button-outline"
          aria-pressed={unit === "in"}
          onClick={() => switchUnit("in")}
        >
          in
        </button>
      </div>
      <div className="fit-fields">
        <label className="settings-label" htmlFor="fit-height">
          Height ({unit})
        </label>
        <input
          id="fit-height"
          className="settings-input"
          inputMode="decimal"
          value={height}
          onChange={(event) => {
            setHeight(event.target.value);
          }}
        />
        {errors["height"] !== undefined ? (
          <p className="hint fit-error" role="alert">
            {errors["height"]}
          </p>
        ) : null}

        <label className="settings-label" htmlFor="fit-chest">
          Chest ({unit}) — optional
        </label>
        <input
          id="fit-chest"
          className="settings-input"
          inputMode="decimal"
          value={chest}
          onChange={(event) => {
            setChest(event.target.value);
          }}
        />
        {errors["chest"] !== undefined ? (
          <p className="hint fit-error" role="alert">
            {errors["chest"]}
          </p>
        ) : null}

        <label className="settings-label" htmlFor="fit-waist">
          Waist ({unit}) — optional
        </label>
        <input
          id="fit-waist"
          className="settings-input"
          inputMode="decimal"
          value={waist}
          onChange={(event) => {
            setWaist(event.target.value);
          }}
        />
        {errors["waist"] !== undefined ? (
          <p className="hint fit-error" role="alert">
            {errors["waist"]}
          </p>
        ) : null}
      </div>
      {unit === "in" ? <p className="hint">{IMPERIAL_HINT}</p> : null}
      <fieldset className="fit-preference">
        <legend className="settings-label">Fit preference</legend>
        {(["tight", "regular", "loose"] as const).map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="fitPreference"
              checked={preference === option}
              onChange={() => {
                setPreference(option);
              }}
            />
            {PREFERENCE_LABELS[option].charAt(0).toUpperCase() + PREFERENCE_LABELS[option].slice(1)}
          </label>
        ))}
      </fieldset>
      <div className="settings-row">
        <button type="button" className="button" onClick={() => void handleSave()}>
          Save fit
        </button>
        <button type="button" className="button button-outline" onClick={() => void handleClear()}>
          Clear
        </button>
      </div>
    </section>
  );
}
