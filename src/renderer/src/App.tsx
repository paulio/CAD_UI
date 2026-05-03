import { useEffect, useState } from 'react';
import type { BootstrapData } from '../../shared/contracts';

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.cadUiApi?.loadBootstrap !== 'function') {
      return;
    }

    void window.cadUiApi
      .loadBootstrap()
      .then((nextBootstrap) => {
        setBootstrap(nextBootstrap);
        setBootstrapFailed(false);
      })
      .catch(() => {
        setBootstrap(null);
        setBootstrapFailed(true);
      });
  }, []);

  return (
    <main>
      <header>
        <h1>CAD UI</h1>
        <button disabled>Open DWG</button>
      </header>
      <section>No drawing loaded</section>
      <section aria-label="application status">
        <p>AI status: {bootstrapFailed ? 'bootstrap error' : bootstrap?.authState ?? 'unavailable'}</p>
        <p>Selected model: {bootstrapFailed ? 'Unavailable' : bootstrap?.settings.selectedModel ?? 'Not selected'}</p>
        {bootstrapFailed ? <p role="alert">Failed to load application settings. Running in a safe fallback state.</p> : null}
      </section>
    </main>
  );
}