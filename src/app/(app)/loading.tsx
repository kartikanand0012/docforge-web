/** Shown the moment a link is followed, while the next screen is fetched: a click always
 * answers at once, instead of seeming to do nothing until the server replies. */
export default function Loading() {
  return (
    <div className="screen" aria-busy="true" aria-live="polite">
      <div className="screen-header">
        <div className="skeleton skeleton-title" />
      </div>
      <div className="screen-body">
        <span className="sr-only">Loading…</span>
        <div className="skeleton skeleton-block" />
        <div className="skeleton skeleton-block" />
      </div>
    </div>
  );
}
