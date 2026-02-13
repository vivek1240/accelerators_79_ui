/**
 * Skeleton loader while agent is running. UI-only.
 */
export default function ChatLoader() {
  return (
    <div className="message message-assistant">
      <div className="message-avatar message-avatar-assistant" aria-hidden>AI</div>
      <div className="message-bubble message-bubble-assistant message-bubble-loader">
        <div className="loader-content">
          <div className="loader-line loader-line-1" />
          <div className="loader-line loader-line-2" />
          <div className="loader-line loader-line-3" />
          <div className="loader-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    </div>
  );
}
