import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function QueryAnswer({ question, answer }) {
  return (
    <div className="query-answer">
      <div className="query-question-block">
        <span className="query-label">Question</span>
        <p className="query-question">{question}</p>
      </div>
      <div className="query-answer-block">
        <span className="query-label">Answer</span>
        <div className="query-answer-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {answer || ''}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
