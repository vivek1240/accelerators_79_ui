/**
 * Left sidebar: PDF upload, flow tabs (EDGAR / Extract / Advanced chatbot), workspace doc indicator.
 */
const TABS = [
  { id: 'edgar', label: 'EDGAR', description: 'Get data for publicly listed companies' },
  { id: 'extract', label: 'Extract', description: 'Extract tables from PDF pages' },
  { id: 'rag', label: 'Advanced chatbot', description: 'Ask questions about your document' },
];

const ADMIN_TAB = { id: 'admin', label: 'Admin', description: 'User access' };

export default function Sidebar({
  activeTab,
  onTabChange,
  fileId = null,
  filename = null,
  onPdfUpload = null,
  uploading = false,
  onNewChat = null,
  onLogout = null,
  userEmail = null,
  userRole = 'user',
  className = '',
}) {
  const tabs = userRole === 'admin' ? [...TABS, ADMIN_TAB] : TABS;
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
        <label className="sidebar-upload-area">
          <input
            type="file"
            accept=".pdf"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && onPdfUpload) onPdfUpload(f);
              e.target.value = '';
            }}
            className="sidebar-upload-input"
            aria-label="Upload PDF"
          />
          <span className="sidebar-upload-label">
            {uploading ? 'Uploading…' : filename ? filename : 'Upload PDF'}
          </span>
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
          <div className="sidebar-label">Document</div>
          <div className="sidebar-workspace">
            {fileId && filename ? (
              <div className="sidebar-workspace-doc">
                <span className="sidebar-workspace-doc-icon">📄</span>
                <span className="sidebar-workspace-doc-name" title={filename}>{filename}</span>
              </div>
            ) : (
              <p className="sidebar-workspace-empty">No PDF uploaded</p>
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
