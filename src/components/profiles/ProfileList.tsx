"use client";

import { useState } from "react";
import { SampleWarning } from "@/components/profiles/SampleWarning";
import { Alert, StatusBadge, Time } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { BASIS_WORDS, activateProfile, listVersions, type MargProfile, type ProfileVersion } from "@/lib/profiles";

/** The workspace's Marg profiles, the active one first, each with its versions. */
export function ProfileList({
  profiles, mayChange, onActivated, onEdit, onCheck,
}: { profiles: MargProfile[]; mayChange: boolean; onActivated: (profile: MargProfile) => void; onEdit: (profile: MargProfile) => void; onCheck: (profile: MargProfile) => void }) {  // prettier-ignore
  return (
    <ul className="mapping-list" aria-label="Marg profiles">
      {profiles.map((profile) => (
        <li key={profile.id}>
          <ProfileRow profile={profile} mayChange={mayChange} onActivated={onActivated} onEdit={onEdit} onCheck={onCheck} />
        </li>
      ))}
    </ul>
  );
}

function ProfileRow({
  profile, mayChange, onActivated, onEdit, onCheck,
}: { profile: MargProfile; mayChange: boolean; onActivated: (profile: MargProfile) => void; onEdit: (profile: MargProfile) => void; onCheck: (profile: MargProfile) => void }) {  // prettier-ignore
  const [versions, setVersions] = useState<ProfileVersion[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { latest } = profile;

  const toggle = async () => {
    setOpen((current) => !current);
    if (versions || open) return;
    try {
      setVersions(await listVersions(profile.id));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The versions could not be loaded.");
    }
  };

  const activate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onActivated(await activateProfile(profile.id));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The profile was not made active. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`mapping-row${profile.active ? " mapping-row-found" : ""}`} aria-label={profile.name} style={{ flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ overflowWrap: "anywhere" }}>{profile.name}</b>
        {profile.active && <StatusBadge kind="ok">Active</StatusBadge>}
        <span className="muted num">Version {latest.version_no}</span>
        {latest.sample && <SampleWarning />}
      </div>
      <p className="muted">
        Version {latest.version_no} from {BASIS_WORDS[latest.basis]}, by {latest.created_by} on <Time iso={latest.created_at} /> ·{" "}
        {latest.spec.file_type === "xlsx" ? "Excel" : "CSV"}, {latest.spec.layout === "per_line" ? "one row per bill line" : "one row per bill"},{" "}
        {latest.spec.columns.length} columns
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {mayChange && !profile.active && (
          <button className="btn btn-primary" onClick={() => void activate()} disabled={busy}>
            {busy ? "Making active…" : "Make active"}
          </button>
        )}
        {mayChange && (
          <button className="btn btn-secondary" onClick={() => onEdit(profile)}>
            Edit as a new version
          </button>
        )}
        {mayChange && (
          <button className="btn btn-secondary" onClick={() => onCheck(profile)}>
            Check against a file Marg accepted
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => void toggle()} aria-expanded={open}>
          {open ? "Hide versions" : "Versions"}
        </button>
      </div>
      {error && (
        <Alert kind="fail" title="Not done.">
          {error}
        </Alert>
      )}
      {open && versions === null && !error && <p className="muted">Loading…</p>}
      {open && versions && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Versions of {profile.name}</caption>
            <thead>
              <tr>
                <th scope="col" className="right">
                  Version
                </th>
                <th scope="col">Made from</th>
                <th scope="col">By</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td className="right num">{version.version_no}</td>
                  <td>
                    {BASIS_WORDS[version.basis].replace(/^./, (first) => first.toUpperCase())} {version.sample && <SampleWarning />}
                  </td>
                  <td>{version.created_by}</td>
                  <td className="num">
                    <Time iso={version.created_at} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
