/**
 * Right panel: context (status, document) + workspace (structured data).
 * When structured outputs exist, shows tabs and full table view with sticky headers and actions.
 * Workspace panel: sizes to content first; when user drags the handle, uses manual width.
 */
import { forwardRef } from 'react';
import EdgarTables from './EdgarTables';
import ExtractorTables from './ExtractorTables';

function RightPanel({
  loading = false,
  currentRoute = null,
  fileId = null,
  filename = null,
  chatbotReady = false,
  chatbotProcessing = false,
  workspaceItems = [],
  activeWorkspaceId = null,
  onSelectWorkspace = null,
  onCloseWorkspaceItem = null,
  workspacePanelWidth = null,
}, ref) {
  const hasDocument = Boolean(fileId);
  const hasWorkspace = workspaceItems.length > 0;
  const workspaceStyle = hasWorkspace && typeof workspacePanelWidth === 'number'
    ? { width: workspacePanelWidth, minWidth: 380, maxWidth: '90vw' }
    : hasWorkspace
      ? { minWidth: 380, maxWidth: '90vw' }
      : undefined;
  const effectiveActive =
    activeWorkspaceId && workspaceItems.some((w) => w.id === activeWorkspaceId)
      ? activeWorkspaceId
      : workspaceItems[0]?.id ?? null;
  const activeItem = workspaceItems.find((w) => w.id === effectiveActive);
  const showPanel = loading || currentRoute || hasDocument || hasWorkspace;

  if (!showPanel) {
    return (
      <aside className="right-panel right-panel-empty">
        <div className="right-panel-placeholder">
          <p className="right-panel-placeholder-text">Structured data and context will appear here.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside ref={ref} className={`right-panel ${hasWorkspace ? 'right-panel-workspace' : ''}`} style={workspaceStyle}>
      <div className="right-panel-header">
        <span className="right-panel-title">{hasWorkspace ? 'Workspace' : 'Context'}</span>
      </div>
      <div className="right-panel-content">
        {!hasWorkspace && (
          <>
            {loading && (
              <div className="right-panel-block">
                <div className="right-panel-block-label">Status</div>
                <div className="right-panel-status right-panel-status-running">
                  <span className="right-panel-status-dot" />
                  <span>Running</span>
                </div>
              </div>
            )}
            {currentRoute && !loading && (
              <div className="right-panel-block">
                <div className="right-panel-block-label">Last route</div>
                <div className="right-panel-tag">{currentRoute}</div>
              </div>
            )}
            {hasDocument && (
              <div className="right-panel-block">
                <div className="right-panel-block-label">Document</div>
                <div className="right-panel-doc">
                  <span className="right-panel-doc-name" title={filename || fileId}>
                    {filename || 'Uploaded file'}
                  </span>
                  {chatbotProcessing && (
                    <div className="right-panel-status right-panel-status-waiting">
                      <span className="right-panel-status-dot" />
                      <span>Ingesting…</span>
                    </div>
                  )}
                  {chatbotReady && !chatbotProcessing && (
                    <div className="right-panel-status right-panel-status-completed">
                      <span className="right-panel-status-dot" />
                      <span>Ready for RAG</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {hasWorkspace && (
          <>
            <div className="right-panel-context-bar">
              {loading && (
                <div className="right-panel-status right-panel-status-running">
                  <span className="right-panel-status-dot" />
                  <span>Running</span>
                </div>
              )}
              {hasDocument && !loading && (
                <span className="right-panel-doc-inline" title={filename || fileId}>
                  {filename || 'Document'}
                </span>
              )}
            </div>
            <div className="workspace-tabs">
              {workspaceItems.map((item) => (
                <div
                  key={item.id}
                  className={`workspace-tab ${item.id === effectiveActive ? 'workspace-tab-active' : ''}`}
                  role="tab"
                  aria-selected={item.id === effectiveActive}
                  tabIndex={0}
                  onClick={() => onSelectWorkspace?.(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectWorkspace?.(item.id);
                    }
                  }}
                >
                  <span className="workspace-tab-label" title={item.title}>
                    {item.title}
                  </span>
                  <button
                    type="button"
                    className="workspace-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseWorkspaceItem?.(item.id);
                    }}
                    aria-label="Close"
                    title="Close"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="workspace-detail">
              {activeItem?.type === 'edgar' && (
                <div className="workspace-detail-inner workspace-detail-tables">
                  <EdgarTables data={activeItem.data} ticker={activeItem.ticker} />
                </div>
              )}
              {activeItem?.type === 'extractor' && (
                <div className="workspace-detail-inner workspace-detail-tables">
                  <ExtractorTables
                    extractedTables={activeItem.extractedTables}
                    fileId={activeItem.fileId}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

export default forwardRef(RightPanel);
