import type { DiagnosticEntry } from '../../../shared/contracts';

type DiagnosticsPanelProps = {
  diagnostics: DiagnosticEntry[];
};

export function DiagnosticsPanel(props: DiagnosticsPanelProps) {
  return (
    <section className="panel diagnostics-panel">
      <div className="panel__header">
        <h2>Diagnostics</h2>
        <p>Recent CAD_AI and viewer pipeline events for the active desktop session.</p>
      </div>
      {props.diagnostics.length === 0 ? (
        <p className="empty-state">No diagnostics recorded.</p>
      ) : (
        <ul className="diagnostics-panel__list">
          {props.diagnostics.map((entry) => (
            <li key={`${entry.timestamp}-${entry.source}-${entry.message}`}>
              <strong>{entry.message}</strong>
              <span>{`${entry.level.toUpperCase()} | ${entry.source} | ${entry.timestamp}`}</span>
              {entry.detail === null ? null : <p>{entry.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}