export function DesktopBootstrapError() {
  return (
    <main className="desktop-bootstrap-error" role="alert">
      <section className="desktop-bootstrap-error__card">
        <p className="desktop-bootstrap-error__eyebrow">Desktop bootstrap error</p>
        <h1>Desktop Bridge failed to load</h1>
        <code>window.omue unavailable</code>
        <p>
          Check Electron DevTools and the terminal for a preload error, then
          rerun the Desktop build/dev command.
        </p>
        <p>
          This is a Desktop preload failure, not a UE bridge disconnected state.
        </p>
      </section>
    </main>
  );
}
