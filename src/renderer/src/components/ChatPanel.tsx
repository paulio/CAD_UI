import type { HighlightMode } from '../../../shared/contracts';
import type { ChatTranscriptEntry } from '../store/useAppStore';

type ChatPanelProps = {
  transcript: ChatTranscriptEntry[];
  prompt: string;
  disabled: boolean;
  sending: boolean;
  onPromptChange: (prompt: string) => void;
  onSendPrompt: () => void;
  onFocusFeatures: (featureIds: string[], entityHandles: string[], mode: HighlightMode) => void;
};

export function ChatPanel(props: ChatPanelProps) {
  return (
    <section className="panel chat-panel">
      <div className="panel__header">
        <h2>Chat</h2>
        <p>Ask about the active drawing and reapply returned geometry highlights.</p>
      </div>
      <div className="chat-panel__transcript" aria-live="polite">
        {props.transcript.length === 0 ? <p className="empty-state">No prompts yet. Open a drawing to begin.</p> : null}
        {props.transcript.map((entry) => (
          <article key={entry.id} className={`chat-entry chat-entry--${entry.role}`}>
            <header>
              <strong>{entry.role === 'user' ? 'You' : 'Copilot'}</strong>
            </header>
            <p>{entry.text}</p>
            {entry.role === 'assistant' && entry.featureIds.length > 0 ? (
              <div className="chat-entry__actions">
                {entry.featureIds.map((featureId) => (
                  <button
                    key={featureId}
                    type="button"
                    onClick={() => props.onFocusFeatures([featureId], entry.entityHandles, entry.highlightMode)}
                  >
                    {`Focus feature ${featureId}`}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <label className="chat-panel__composer">
        <span>Ask about the drawing</span>
        <textarea
          aria-label="Ask about the drawing"
          value={props.prompt}
          onChange={(event) => props.onPromptChange(event.target.value)}
          rows={4}
          disabled={props.disabled}
          placeholder="Ask what the selected feature is, what is adjacent, or what changed."
        />
      </label>
      <button type="button" onClick={props.onSendPrompt} disabled={props.disabled || props.sending}>
        {props.sending ? 'Sending...' : 'Send prompt'}
      </button>
    </section>
  );
}