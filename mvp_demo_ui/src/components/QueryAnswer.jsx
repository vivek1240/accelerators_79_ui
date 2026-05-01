import { useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { exportElementToPdf } from '../utils/exportAnswerPdf';

function slugForFilename(text) {
  if (!text || typeof text !== 'string') return 'answer';
  const s = text
    .slice(0, 48)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return s || 'answer';
}

export default function QueryAnswer({ answer, question = '', streaming = false }) {
  const endRef = useRef(null);
  const proseRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const hasAnswerText = Boolean((answer || '').trim());

  useEffect(() => {
    if (streaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [answer, streaming]);

  const handleExportPdf = useCallback(async () => {
    if (!proseRef.current || streaming || !answer?.trim()) return;
    setExporting(true);
    try {
      await exportElementToPdf(proseRef.current, {
        filename: `${slugForFilename(question)}.pdf`,
      });
    } finally {
      setExporting(false);
    }
  }, [answer, question, streaming]);

  return (
    <div className="query-answer">
      <div className="query-answer-block">
        <div className="query-answer-toolbar">
          <button
            type="button"
            className="query-answer-export-btn"
            onClick={handleExportPdf}
            disabled={streaming || exporting || !answer?.trim()}
          >
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
        <div className="query-answer-prose" ref={proseRef}>
          {streaming && !hasAnswerText && (
            <div className="query-answer-waiting" aria-live="polite">
              <span className="query-answer-waiting-label">Thinking</span>
              <span className="query-answer-waiting-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children, ...props }) => (
                <div className="md-table-wrap">
                  <table {...props}>{children}</table>
                </div>
              ),
              blockquote: ({ children, ...props }) => (
                <blockquote className="md-blockquote" {...props}>{children}</blockquote>
              ),
              h2: ({ children, ...props }) => (
                <h2 className="md-h2" {...props}>{children}</h2>
              ),
              h3: ({ children, ...props }) => (
                <h3 className="md-h3" {...props}>{children}</h3>
              ),
            }}
          >
            {answer || ''}
          </ReactMarkdown>
          {streaming && <span className="streaming-cursor" />}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}
