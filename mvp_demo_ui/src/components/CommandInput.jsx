/**
 * Command-like input for power-user feel. UI-only.
 */
export default function CommandInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ask or run a command…',
  disabled = false,
}) {
  return (
    <form className="command-input-wrap" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
      <div className="command-input-inner">
        <span className="command-input-prefix">›</span>
        <input
          type="text"
          className="command-input"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="command-input-submit" disabled={disabled} aria-label="Send">
          Send
        </button>
      </div>
    </form>
  );
}
