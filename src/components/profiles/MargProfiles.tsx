"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { CheckProfile } from "@/components/profiles/CheckProfile";
import { ProfileEditor } from "@/components/profiles/ProfileEditor";
import { ProfileList } from "@/components/profiles/ProfileList";
import { Alert } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  draftFromSample, draftFromSpec, getTemplate, listFields, listProfiles, readSample, type Draft, type FieldDef, type MargProfile,
} from "@/lib/profiles";  // prettier-ignore

const failed = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.detail : fallback);

/** The profiles, a layout being edited, and a check against an accepted file. */
export function MargProfiles({ mayChange }: { mayChange: boolean }) {
  const [profiles, setProfiles] = useState<MargProfile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldDef[] | null>(null);
  const [draft, setDraft] = useState<{ draft: Draft; editing: string | null; key: number } | null>(null);
  const [checking, setChecking] = useState<MargProfile | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const reload = () =>
    listProfiles().then(
      (found) => {
        setProfiles(found);
        setLoadError(null);
      },
      (caught: unknown) => setLoadError(failed(caught, "The profiles could not be loaded.")),
    );

  useEffect(() => {
    let live = true;
    listProfiles().then(
      (found) => live && setProfiles(found),
      (caught: unknown) => live && setLoadError(failed(caught, "The profiles could not be loaded.")),
    );
    return () => {
      live = false;
    };
  }, []);

  /** What a column can take, asked for once, when a layout is first opened. */
  const ensureFields = async (): Promise<boolean> => {
    if (fields) return true;
    try {
      setFields(await listFields());
      return true;
    } catch (caught) {
      setStartError(failed(caught, "The list of what a column can take could not be loaded. Try again."));
      return false;
    }
  };

  const open = (next: Draft, editing: string | null = null) => {
    setDraft((current) => ({ draft: next, editing, key: (current?.key ?? 0) + 1 }));
    setChecking(null);
    setSaved(null);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || reading) return;
    setReading(true);
    setStartError(null);
    try {
      const [sample, ready] = await Promise.all([readSample(file), ensureFields()]);
      if (ready) open(draftFromSample(sample, file.name));
    } catch (caught) {
      setStartError(failed(caught, "The file could not be read. Try again."));
    } finally {
      setReading(false);
      if (input.current) input.current.value = ""; // the same file can be chosen again
    }
  };

  const fromSample = async () => {
    setStartError(null);
    try {
      const [template, ready] = await Promise.all([getTemplate(), ensureFields()]);
      if (ready) open(draftFromSpec(template.spec, "sample", template.name));
    } catch (caught) {
      setStartError(failed(caught, "The SAMPLE layout could not be loaded. Try again."));
    }
  };

  const edit = async (profile: MargProfile) => {
    setStartError(null);
    if (await ensureFields()) open(draftFromSpec(profile.latest.spec, "version", `‘${profile.name}’, version ${profile.latest.version_no}`), profile.id);
  };

  const done = (profile: MargProfile) => {
    setDraft(null);
    setSaved(
      `Saved ‘${profile.name}’, version ${profile.latest.version_no}.${profile.active ? " It is the active profile: Marg purchase imports use it." : " Make it active to use it for Marg purchase imports."}`,
    );
    void reload();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section aria-labelledby={`${id}-list`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 id={`${id}-list`} style={{ fontSize: 18 }}>
          Profiles
        </h2>
        {loadError && (
          <Alert kind="warn" title="Not loaded.">
            {loadError}
          </Alert>
        )}
        {profiles === null && !loadError && <p className="muted">Loading…</p>}
        {profiles?.length === 0 && (
          <p className="muted">
            No Marg profile yet. {mayChange ? "Upload a purchase import file your Marg accepted below, and check each column." : "Someone who reviews bills can make one."}
          </p>
        )}
        {saved && (
          <Alert kind="ok" title="Saved.">
            {saved}
          </Alert>
        )}
        {profiles && profiles.length > 0 && (
          <ProfileList
            profiles={profiles}
            mayChange={mayChange}
            onActivated={() => void reload()}
            onEdit={(profile) => void edit(profile)}
            onCheck={(profile) => {
              setChecking(profile);
              setDraft(null);
            }}
          />
        )}
      </section>

      {mayChange && !draft && (
        <section className="section-card" aria-labelledby={`${id}-start`}>
          <h2 id={`${id}-start`} style={{ fontSize: 18 }}>
            Make a profile
          </h2>
          <p>
            Use one purchase import file your Marg accepted (CSV or Excel, at most 2 MB): your dealer or your last supplier import will have one.
            DocForge reads its columns and suggests where each comes from; you check every one before saving.
          </p>
          <div className="field">
            <label htmlFor={`${id}-file`}>Upload a file your Marg accepted</label>
            <input
              ref={input}
              id={`${id}-file`}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void upload(event)}
              disabled={reading}
            />
          </div>
          <div aria-live="polite">{reading && <p className="muted">Reading the file…</p>}</div>
          <div>
            <button className="btn btn-ghost" onClick={() => void fromSample()}>
              Start from the SAMPLE layout
            </button>{" "}
            <span className="muted">A made-up layout to try DocForge with, not a Marg format.</span>
          </div>
          {startError && (
            <Alert kind="fail" title="Not read.">
              {startError}
            </Alert>
          )}
        </section>
      )}

      {mayChange && draft && fields && (
        <ProfileEditor
          key={draft.key}
          draft={draft.draft}
          editing={draft.editing}
          fields={fields}
          profiles={profiles ?? []}
          onSaved={done}
          onCancel={() => setDraft(null)}
        />
      )}

      {mayChange && checking && <CheckProfile key={checking.id} profile={checking} mayMap={mayChange} onClose={() => setChecking(null)} />}
    </div>
  );
}
