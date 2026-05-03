import type { ChatMessage, ChatReplayTarget } from '../store/useAppStore';

type ChatPanelProps = {
  messages: ChatMessage[];
  prompt: string;
  disabled: boolean;
  sending: boolean;
  onPromptChange: (prompt: string) => void;
  onSendPrompt: () => void;
  onFocusFeatures: (target: ChatReplayTarget) => void;
};

export function ChatPanel(props: ChatPanelProps) {
  return (
    <section className="panel chat-panel">
      <div className="panel__header">
        <h2>Chat</h2>
        <p>Ask about the active drawing and reapply returned geometry highlights.</p>
      </div>
      <div className="chat-panel__transcript" aria-live="polite">
        {props.messages.length === 0 ? <p className="empty-state">No prompts yet. Open a drawing to begin.</p> : null}
        {props.messages.map((entry) => (
          <article key={entry.id} className={`chat-entry chat-entry--${entry.role}`}>
            <header>
              <strong>{entry.role === 'user' ? 'You' : 'Copilot'}</strong>
            </header>
            <p>{entry.text}</p>
            {entry.role === 'assistant' && entry.replayTargets.length > 0 ? (
              <div className="chat-entry__actions">
                {entry.replayTargets.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => props.onFocusFeatures(target)}
                  >
                    {target.label}
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