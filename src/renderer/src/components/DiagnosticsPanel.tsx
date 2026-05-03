import type { DiagnosticEntry } from '../../../shared/contracts';

type DiagnosticsPanelProps = {
  diagnostics: DiagnosticEntry[];
};

export function DiagnosticsPanel(props: DiagnosticsPanelProps) {
  const errorCount = props.diagnostics.filter((entry) => entry.level === 'error').length;
  const summary =
    props.diagnostics.length === 0
      ? 'Bootstrap, CAD_AI, and viewer failures will appear here.'
      : errorCount === 0
        ? `${props.diagnostics.length} recent events recorded.`
        : `${errorCount} error${errorCount === 1 ? '' : 's'} across ${props.diagnostics.length} recent events.`;

  return (
    <section className="panel diagnostics-panel" aria-live="polite">
      <div className="panel__header">
        <h2>Diagnostics</h2>
        <p>Recent bootstrap, CAD_AI, Copilot, and viewer events for the active desktop session.</p>
      </div>
      <p>{summary}</p>
      {props.diagnostics.length === 0 ? (
        <p className="empty-state">No diagnostics recorded.</p>
      ) : (
        <ul className="diagnostics-panel__list">
          {props.diagnostics.map((entry) => (
            <li key={`${entry.timestamp}-${entry.source}-${entry.message}`} role={entry.level === 'error' ? 'alert' : undefined}>
              <strong>{entry.message}</strong>
              <span>{`${entry.level.toUpperCase()} | ${entry.source} | ${formatTimestamp(entry.timestamp)}`}</span>
              {entry.detail === null ? null : <p>{entry.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTimestamp(timestamp: string): string {
  const value = new Date(timestamp);

  if (Number.isNaN(value.getTime())) {
    return timestamp;
  }

  return value.toLocaleString();
}