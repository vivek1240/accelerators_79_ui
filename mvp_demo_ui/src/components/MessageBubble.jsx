/**
 * Single message bubble with optional avatar, route tag, and inline actions (copy).
 * UI-only; no logic changes.
 */
import { useState } from 'react';

function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (typeof text !== 'string') return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      className={`message-action message-action-copy ${className}`}
      onClick={handleCopy}
      title={copied ? 'Copied' : 'Copy'}
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function UserBubble({ text }) {
  return (
    <div className="message message-user">
      <div className="message-avatar message-avatar-user" aria-hidden>You</div>
      <div className="message-bubble message-bubble-user">{text}</div>
    </div>
  );
}

export function AssistantBubble({ children, routeTag = null, explanation = null, text = null, copyText = null }) {
  return (
    <div className="message message-assistant">
      <div className="message-avatar message-avatar-assistant" aria-hidden>AI</div>
      <div className="message-bubble message-bubble-assistant">
        <div className="message-bubble-header">
          {routeTag && <span className="message-tag">{routeTag}</span>}
          {copyText != null && <CopyButton text={copyText} />}
        </div>
        {explanation && <p className="message-explanation">{explanation}</p>}
        {text && <p className="message-text">{text}</p>}
        {children}
      </div>
    </div>
  );
}

export function SystemBubble({ text }) {
  return (
    <div className="message message-system">
      <div className="message-avatar message-avatar-system" aria-hidden />
      <div className="message-bubble message-bubble-system">{text}</div>
    </div>
  );
}
