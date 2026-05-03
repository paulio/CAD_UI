import { useEffect, useState } from 'react';
import type { BootstrapData } from '../../shared/contracts';

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.cadUiApi?.loadBootstrap !== 'function') {
      return;
    }

    void window.cadUiApi.loadBootstrap().then((nextBootstrap) => {
      setBootstrap(nextBootstrap);
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
        <p>AI status: {bootstrap?.authState ?? 'unavailable'}</p>
        <p>Selected model: {bootstrap?.settings.selectedModel ?? 'Not selected'}</p>
      </section>
    </main>
  );
}