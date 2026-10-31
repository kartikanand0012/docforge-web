"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { MappingTasks } from "@/components/exports/MappingTasks";
import { SampleWarning } from "@/components/profiles/SampleWarning";
import { Alert, Seg, StatusBadge, Time } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { dayWords } from "@/lib/flags";
import {
  fetchRunFile, listRuns, monthSoFar, overlapSentence, profileWords, runExport, runSummary, saveFile, type ExportFormat, type ExportRun,
} from "@/lib/exports";  // prettier-ignore
import { BOOKS_NAME, blockedSentence, type Books } from "@/lib/mappings";
import { NO_PROFILE_MESSAGE, PROFILE_PATH, activeProfile, listProfiles, type MargProfile } from "@/lib/profiles";

type Choice = Books | "marg_import";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "tally", label: "Tally" },
  { value: "marg", label: "Marg" },
  { value: "marg_import", label: "Marg purchase import" },
];

const RUN_OF: Record<Choice, { target: Books; format: ExportFormat }> = {
  tally: { target: "tally", format: "mapped_csv" },
  marg: { target: "marg", format: "mapped_csv" },
  marg_import: { target: "marg", format: "marg_import" },
};

const formatOf = (run: ExportRun): ExportFormat => run.format ?? "mapped_csv";
const runName = (run: ExportRun) => (formatOf(run) === "marg_import" ? "Marg purchase import" : (BOOKS_NAME[run.target] ?? run.target));

/** Approved bills, out to Tally or Marg under the workspace's own names. The first export
 * teaches the names: it stops with what needs mapping, and runs again once that is done. A
 * Marg purchase import is written in the layout of the workspace's active Marg profile. */
export function Exports({ mayMap, now }: { mayMap: boolean; now?: Date }) {
  const [initial] = useState(() => monthSoFar(now));
  const [choice, setChoice] = useState<Choice>("tally");
  const [profiles, setProfiles] = useState<MargProfile[] | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [noProfile, setNoProfile] = useState(false); // the API said so when a run was asked for
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ExportRun | null>(null);
  const [runs, setRuns] = useState<ExportRun[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const id = useId();

  const reload = () =>
    listRuns().then(
      (found) => {
        setRuns(found);
        setRunsError(null);
      },
      (caught: unknown) => setRunsError(caught instanceof ApiError ? caught.detail : "Past exports could not be loaded."),
    );

  useEffect(() => {
    let live = true;
    listRuns().then(
      (found) => live && setRuns(found),
      (caught: unknown) => live && setRunsError(caught instanceof ApiError ? caught.detail : "Past exports could not be loaded."),
    );
    listProfiles().then(
      (found) => live && setProfiles(Array.isArray(found) ? found : []),
      (caught: unknown) => live && setProfilesError(caught instanceof ApiError ? caught.detail : "Your Marg profile could not be loaded."),
    );
    return () => {
      live = false;
    };
  }, []);

  const active = activeProfile(profiles);
  const importing = choice === "marg_import";
  // No dead end and no button that cannot work: without an active profile, the way to one.
  const needsProfile = importing && (noProfile || (profiles !== null && !active));
  const lookingForProfile = importing && profiles === null && !profilesError && !noProfile;

  const run = async (books: Books, start: string, end: string, format: ExportFormat = "mapped_csv") => {
    if (busy) return;
    if (!start || !end) return setError("Choose both dates.");
    setBusy(true);
    setError(null);
    setDownloadError(null);
    try {
      const result = await runExport(books, start, end, format);
      if (result.kind === "no_active_profile") {
        setNoProfile(true);
        return;
      }
      setNoProfile(false);
      setCurrent(result.run);
      void reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The export did not run. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { target, format } = RUN_OF[choice];
    void run(target, from, to, format);
  };

  const download = async (which: ExportRun) => {
    setDownloadError(null);
    try {
      const file = await fetchRunFile(which);
      saveFile(file.blob, file.filename);
    } catch (caught) {
      setDownloadError(caught instanceof ApiError ? caught.detail : "The file could not be downloaded. Try again.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form className="inline-form" onSubmit={submit} noValidate style={{ maxWidth: 720 }} aria-labelledby={`${id}-new`}>
        <h2 id={`${id}-new`} style={{ fontSize: 18 }}>
          New export
        </h2>
        <p className="muted">Bills approved between these dates (India time), under the names your books use. At most 366 days.</p>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field">
            <span className="label">Books</span>
            <Seg name="export-books" label="Books" value={choice} onChange={setChoice} options={CHOICES} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-from`}>From</label>
            <input id={`${id}-from`} className="input num" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-to`}>To</label>
            <input id={`${id}-to`} className="input num" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
          {!needsProfile && !lookingForProfile && (
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy && !current ? "Running…" : "Run export"}
            </button>
          )}
        </div>
        {importing && lookingForProfile && <p className="muted">Looking for your Marg profile…</p>}
        {needsProfile && (
          <div className="alert alert-info" role="status">
            <Info strokeWidth={1.5} aria-hidden="true" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p>{NO_PROFILE_MESSAGE}</p>
              <div>
                <Link className="btn btn-secondary" href={PROFILE_PATH}>
                  Open Settings › Marg profile
                </Link>
              </div>
            </div>
          </div>
        )}
        {importing && !needsProfile && active && (
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span>
              Written in the layout of your {profileWords({ name: active.name, version_no: active.latest.version_no })}.
            </span>
            {active.latest.sample && <SampleWarning />}
          </p>
        )}
        {importing && profilesError && !noProfile && <p className="muted">{profilesError} The export says if one is missing.</p>}
        {error && (
          <Alert kind="fail" title="Not run.">
            {error}
          </Alert>
        )}
      </form>

      {current && (
        <section className="section-card" aria-labelledby={`${id}-result`}>
          <h2 id={`${id}-result`} style={{ fontSize: 18 }}>
            This export
          </h2>
          <p className="muted">
            {runName(current)} · bills approved {dayWords(current.from)} to {dayWords(current.to)}
          </p>
          {current.profile && (
            <p style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span>Made with the {profileWords(current.profile)}.</span>
              {current.profile.sample && <SampleWarning />}
            </p>
          )}
          {(current.overlaps ?? []).length > 0 && (
            <Alert kind="warn" title="Exported before.">
              {(current.overlaps ?? []).map((overlap) => (
                <span key={overlap.run_id} style={{ display: "block" }}>
                  {overlapSentence(overlap)}
                </span>
              ))}
              <span style={{ display: "block" }}>Check your books for them before importing this file again.</span>
            </Alert>
          )}
          {current.status === "ready" ? (
            <>
              <Alert kind="ok" title="Ready.">
                {current.invoices ? runSummary(current) : "No bills were approved in these dates."}
              </Alert>
              {current.file && (
                <div>
                  <button className="btn btn-primary" onClick={() => void download(current)}>
                    Download the file
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <Alert kind="warn" title="Not exported yet.">
                {blockedSentence(current.tasks ?? { suppliers: [], items: [], problems: [] })}
              </Alert>
              <MappingTasks
                key={current.id}
                tasks={current.tasks ?? { suppliers: [], items: [], problems: [] }}
                books={current.target}
                runId={current.id}
                mayMap={mayMap}
                again={busy}
                onRunAgain={() => void run(current.target, current.from, current.to, formatOf(current))}
              />
            </>
          )}
          {downloadError && (
            <Alert kind="fail" title="Not downloaded.">
              {downloadError}
            </Alert>
          )}
        </section>
      )}

      <section aria-labelledby={`${id}-past`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 id={`${id}-past`} style={{ fontSize: 18 }}>
          Past exports
        </h2>
        {runsError && <Alert kind="warn" title="Not loaded.">{runsError}</Alert>}
        {runs === null && !runsError && <p className="muted">Loading…</p>}
        {runs?.length === 0 && <p className="muted">No exports yet. Run one above; the first one asks for any names it needs.</p>}
        {runs && runs.length > 0 && (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 720 }}>
              <caption className="sr-only">Past exports</caption>
              <thead>
                <tr>
                  <th scope="col">Made</th>
                  <th scope="col">Books</th>
                  <th scope="col">Bills approved</th>
                  <th scope="col">Status</th>
                  <th scope="col">In it</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((past) => (
                  <tr key={past.id}>
                    <td className="num">
                      <Time iso={past.created_at} />
                      <span className="muted" style={{ display: "block", fontSize: 12 }}>
                        by {past.created_by}
                      </span>
                    </td>
                    <td>
                      {runName(past)}
                      {past.profile && (
                        <span className="muted" style={{ display: "block", fontSize: 12 }}>
                          ‘{past.profile.name}’, version {past.profile.version_no}
                        </span>
                      )}
                      {past.profile?.sample && <SampleWarning />}
                    </td>
                    <td className="num">
                      {dayWords(past.from)} to {dayWords(past.to)}
                    </td>
                    <td>
                      {past.status === "ready" ? <StatusBadge kind="ok">Ready</StatusBadge> : <StatusBadge kind="warn">Needs mapping</StatusBadge>}
                    </td>
                    <td>
                      {past.status === "ready" ? runSummary(past) : "No file was made."}
                      {(past.overlaps ?? []).length > 0 && (
                        <span className="muted" style={{ display: "block", fontSize: 12 }}>
                          Some bills exported before
                        </span>
                      )}
                    </td>
                    <td className="right">
                      {past.status === "ready" && past.file ? (
                        <button className="btn btn-secondary" onClick={() => void download(past)} aria-label={`Download the ${runName(past)} export of ${dayWords(past.from)} to ${dayWords(past.to)}`}>
                          Download
                        </button>
                      ) : (
                        <button className="btn btn-ghost" onClick={() => setCurrent(past)}>
                          See what needs mapping
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
