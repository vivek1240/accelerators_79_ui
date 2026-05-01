/**
 * Left sidebar: multi-PDF upload, flow tabs, document list (focus + chat scope).
 */
const TABS = [
  { id: 'edgar', label: 'EDGAR', description: 'Get data for publicly listed companies' },
  { id: 'extract', label: 'Extract', description: 'Extract tables from PDF pages' },
  { id: 'analysis', label: 'Analysis', description: 'Insights and visualizations for extracted tables' },
  { id: 'rag', label: 'Advanced chatbot', description: 'Ask questions about your document' },
];

const ADMIN_TAB = { id: 'admin', label: 'Admin', description: 'User access' };

function docStatusLine(doc) {
  if (doc.magError) return 'MAG error';
  if (doc.magProcessing || doc.chatbotProcessing) return 'Processing…';
  if (doc.magReady && doc.memoryId) return 'Analyst memory ready';
  if (doc.chatbotReady) return 'Chat ready';
  return 'Pending';
}

export default function Sidebar({
  activeTab,
  onTabChange,
  documents = [],
  focusedFileId = null,
  onFocusFile = null,
  selectedChatFileIds = null,
  onToggleChatFile = null,
  onPdfUpload = null,
  uploading = false,
  onLogout = null,
  userEmail = null,
  userRole = 'user',
  className = '',
}) {
  const tabs = userRole === 'admin' ? [...TABS, ADMIN_TAB] : TABS;
  const selected = selectedChatFileIds instanceof Set ? selectedChatFileIds : new Set();

  return (
    <aside className={`sidebar ${className}`}>
      <div className="sidebar-brand">
        <span className="sidebar-brand-icon">◇</span>
        <span className="sidebar-brand-name">Accelerate79ers</span>
      </div>
      {userEmail && (
        <div className="sidebar-user">
          <span className="sidebar-user-email" title={userEmail}>{userEmail}</span>
        </div>
      )}

      <div className="sidebar-section sidebar-upload-section">
        <div className="sidebar-label">PDF (Extract & Advanced chatbot)</div>
        <label className={`sidebar-upload-area ${uploading ? 'sidebar-upload-area-uploading' : ''}`}>
          <input
            type="file"
            accept=".pdf"
            multiple
            disabled={uploading}
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length && onPdfUpload) onPdfUpload(files);
              e.target.value = '';
            }}
            className="sidebar-upload-input"
            aria-label="Upload PDF"
          />
          <span className="sidebar-upload-label">
            {uploading
              ? 'Uploading…'
              : documents.length
                ? `Add PDF (${documents.length} loaded)`
                : 'Upload PDF'}
          </span>
          {uploading && (
            <span className="sidebar-upload-helper">
              <span className="sidebar-upload-dots" aria-hidden="true" />
              Preparing pages, tables, and analyst memory for chat.
            </span>
          )}
        </label>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">
          <div className="sidebar-label">Flows</div>
          <ul className="sidebar-list sidebar-list-tabs">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  type="button"
                  className={`sidebar-item sidebar-tab ${activeTab === tab.id ? 'sidebar-item-active' : ''}`}
                  onClick={() => onTabChange?.(tab.id)}
                  title={tab.description}
                >
                  <span className="sidebar-tab-row">
                    <span className="sidebar-item-icon">◇</span>
                    <span className="sidebar-item-title">{tab.label}</span>
                  </span>
                  {tab.description && (
                    <span className="sidebar-item-desc">{tab.description}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">Documents</div>
          <div className="sidebar-workspace">
            {documents.length === 0 ? (
              <p className="sidebar-workspace-empty">No PDF uploaded</p>
            ) : (
              <ul className="sidebar-doc-list">
                {documents.map((doc) => {
                  const isFocus = doc.fileId === focusedFileId;
                  const inChat = selected.has(doc.fileId);
                  return (
                    <li key={doc.fileId} className={`sidebar-doc-row ${isFocus ? 'sidebar-doc-row-focus' : ''}`}>
                      <label className="sidebar-doc-chat" title="Include in Advanced chatbot context">
                        <input
                          type="checkbox"
                          checked={inChat}
                          onChange={() => onToggleChatFile?.(doc.fileId)}
                          aria-label={`Chat context: ${doc.filename}`}
                        />
                      </label>
                      <button
                        type="button"
                        className="sidebar-doc-main"
                        onClick={() => onFocusFile?.(doc.fileId)}
                        title="Focus for Extract / workspace"
                      >
                        <span className="sidebar-doc-name" title={doc.filename}>{doc.filename}</span>
                        <span className="sidebar-doc-meta">{docStatusLine(doc)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </nav>
      {onLogout && (
        <div className="sidebar-footer">
          <button type="button" className="sidebar-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </aside>
  );
}
