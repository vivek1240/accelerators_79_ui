import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as api from './api';
const getError = api.getErrorMessage;
import Auth from './components/Auth';
import AdminDashboard from './components/AdminDashboard';
import EdgarTables from './components/EdgarTables';
import ExtractorFlow from './components/ExtractorFlow';
import QueryAnswer from './components/QueryAnswer';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import ChatLoader from './components/ChatLoader';
import CommandInput from './components/CommandInput';
import { UserBubble, AssistantBubble, SystemBubble } from './components/MessageBubble';

const TAB_LABELS = {
  edgar: 'EDGAR',
  extract: 'Extract',
  rag: 'RAG',
  admin: 'Admin',
};

function truncateTitle(text, max = 36) {
  if (!text || text.length <= max) return text || 'New chat';
  return text.slice(0, max).trim() + '…';
}

function genId() {
  return crypto.randomUUID?.() ?? `ws-${Date.now()}`;
}

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = api.getStoredAuth();
    if (stored?.token && stored?.user) {
      api.setAuthToken(stored.token, stored.user);
      return stored.user;
    }
    return null;
  });
  const [activeTab, setActiveTab] = useState('edgar');
  const [sharedPdf, setSharedPdf] = useState({
    fileId: null,
    filename: null,
    chatbotReady: false,
    chatbotProcessing: false,
  });
  const [edgarMessages, setEdgarMessages] = useState([]);
  const [extractMessages, setExtractMessages] = useState([]);
  const [ragMessages, setRagMessages] = useState([]);
  const [workspaceItems, setWorkspaceItems] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(null);
  const [resizing, setResizing] = useState(false);
  const rightPanelRef = useRef(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);

  const { fileId, filename, chatbotReady, chatbotProcessing } = sharedPdf;

  const messagesByTab = useMemo(
    () => ({ edgar: edgarMessages, extract: extractMessages, rag: ragMessages }),
    [edgarMessages, extractMessages, ragMessages]
  );
  const currentMessages = messagesByTab[activeTab] ?? [];
  const setCurrentMessages = useCallback(
    (fn) => {
      if (activeTab === 'edgar') setEdgarMessages(fn);
      if (activeTab === 'extract') setExtractMessages(fn);
      if (activeTab === 'rag') setRagMessages(fn);
    },
    [activeTab]
  );

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const w = window.innerWidth - e.clientX;
      const minW = 380;
      const maxW = Math.floor(0.9 * window.innerWidth);
      setWorkspacePanelWidth(Math.round(Math.min(maxW, Math.max(minW, w))));
    };
    const onUp = () => setResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    if (rightPanelRef.current && workspacePanelWidth == null) {
      setWorkspacePanelWidth(rightPanelRef.current.offsetWidth);
    }
    setResizing(true);
  }, [workspacePanelWidth]);

  const addWorkspaceItem = useCallback((item) => {
    const id = item.id ?? genId();
    setWorkspaceItems((prev) => [...prev, { ...item, id }]);
    setActiveWorkspaceId(id);
    return id;
  }, []);

  const removeWorkspaceItem = useCallback((id) => {
    setWorkspaceItems((prev) => {
      const next = prev.filter((w) => w.id !== id);
      setActiveWorkspaceId((a) => (a === id ? (next[0]?.id ?? null) : a));
      return next;
    });
  }, []);

  const showToast = useCallback((text, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(() => setUser(null));
    return () => api.setUnauthorizedHandler(null);
  }, []);

  const handleAuthenticated = useCallback((data) => {
    const userInfo = {
      user_id: data.user_id,
      email: data.email ?? '',
      name: data.name ?? null,
      role: data.role ?? 'user',
      is_allowed: data.is_allowed ?? false,
    };
    api.setAuthToken(data.access_token, userInfo);
    setUser(userInfo);
  }, []);

  const handleLogout = useCallback(() => {
    api.clearAuthToken();
    setUser(null);
  }, []);

  const pollStatus = useCallback(async (fid) => {
    for (let i = 0; i < 60; i++) {
      try {
        const res = await api.status(fid);
        const d = res?.data;
        if (d?.chatbot_ready) {
          setSharedPdf((p) => ({ ...p, chatbotReady: true, chatbotProcessing: false }));
          return true;
        }
        if (d?.chatbot_error) {
          setSharedPdf((p) => ({ ...p, chatbotProcessing: false }));
          showToast(d.chatbot_error, true);
          return false;
        }
        setSharedPdf((p) => ({ ...p, chatbotProcessing: d?.chatbot_processing ?? true }));
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 3000));
    }
    setSharedPdf((p) => ({ ...p, chatbotProcessing: false }));
    showToast('Ingestion timed out', true);
    return false;
  }, [showToast]);

  const handlePdfUpload = useCallback(
    async (file) => {
      if (!file?.name?.toLowerCase().endsWith('.pdf')) {
        showToast('Please select a PDF file', true);
        return;
      }
      setUploading(true);
      setSharedPdf({
        fileId: null,
        filename: null,
        chatbotReady: false,
        chatbotProcessing: false,
      });
      try {
        const res = await api.upload(file);
        if (!res?.success || !res?.data?.file_id) {
          showToast(res?.error?.message || 'Upload failed', true);
          return;
        }
        const fid = res.data.file_id;
        const fname = res.data.filename || file.name;
        setSharedPdf((p) => ({
          ...p,
          fileId: fid,
          filename: fname,
          chatbotProcessing: res.data.chatbot_status === 'ingesting',
          chatbotReady: res.data.chatbot_status !== 'ingesting',
        }));
        showToast(
          res.data.chatbot_status === 'ingesting'
            ? 'PDF uploaded. RAG will be ready when ingestion finishes.'
            : 'PDF uploaded. Ready for Extract and RAG.'
        );
        if (res.data.chatbot_status === 'ingesting') pollStatus(fid);
      } catch (e) {
        showToast(getError(e, 'Upload failed'), true);
      } finally {
        setUploading(false);
      }
    },
    [showToast, pollStatus]
  );

  const handleNewChat = useCallback(() => {
    if (activeTab === 'edgar') setEdgarMessages([]);
    if (activeTab === 'extract') setExtractMessages([]);
    if (activeTab === 'rag') setRagMessages([]);
  }, [activeTab]);

  const appendToCurrentTab = useCallback(
    (...newMessages) => {
      setCurrentMessages((prev) => [...prev, ...newMessages]);
    },
    [setCurrentMessages]
  );

  const handleSend = useCallback(async () => {
    const q = (input || '').trim();
    if (!q) return;
    setInput('');

    const newUserMsg = { id: Date.now(), role: 'user', text: q };
    setCurrentMessages((prev) => [...prev, newUserMsg]);
    setLoading(true);

    try {
      if (activeTab === 'edgar') {
        const routeRes = await api.route(q, false);
        if (!routeRes?.success || !routeRes?.data) {
          showToast(routeRes?.error?.message || 'Routing failed', true);
          setLoading(false);
          return;
        }
        const routeData = routeRes.data;
        const match = q.match(/\b([A-Z]{1,5})\b/);
        const ticker =
          routeData.extracted_params?.ticker || (match && match[1]) || 'AAPL';
        const numYears = routeData.extracted_params?.num_years || 3;
        try {
          const edgarRes = await api.edgar(ticker.toUpperCase(), numYears);
          if (edgarRes?.success && edgarRes?.data) {
            const workspaceId = addWorkspaceItem({
              type: 'edgar',
              title: `EDGAR · ${edgarRes.data.ticker || 'Financials'}`,
              data: edgarRes.data,
              ticker: edgarRes.data.ticker,
            });
            appendToCurrentTab({
              id: Date.now() + 1,
              role: 'assistant',
              type: 'edgar',
              data: edgarRes.data,
              ticker: edgarRes.data.ticker,
              workspaceId,
            });
          } else {
            showToast(edgarRes?.error?.message || 'EDGAR fetch failed', true);
          }
        } catch (e) {
          showToast(getError(e, 'EDGAR failed'), true);
        }
      } else if (activeTab === 'rag') {
        if (!fileId) {
          showToast('Upload a PDF in the sidebar first to use RAG', true);
        } else if (!chatbotReady) {
          showToast('Document is still ingesting. RAG will be available when ready.', true);
        } else {
          try {
            const queryRes = await api.query(fileId, q);
            if (queryRes?.success && queryRes?.data) {
              appendToCurrentTab({
                id: Date.now() + 1,
                role: 'assistant',
                type: 'query',
                data: queryRes.data,
              });
            } else {
              showToast(queryRes?.error?.message || 'Query failed', true);
            }
          } catch (e) {
            const code = e?.response?.data?.detail?.code;
            const msg = getError(e);
            if (code === 'CHATBOT_NOT_READY') {
              setSharedPdf((p) => ({ ...p, chatbotReady: false, chatbotProcessing: true }));
              pollStatus(fileId);
            }
            showToast(msg || 'Query failed', true);
          }
        }
      }
    } catch (e) {
      showToast(getError(e, 'Request failed'), true);
    } finally {
      setLoading(false);
    }
  }, [
    input,
    activeTab,
    fileId,
    chatbotReady,
    showToast,
    pollStatus,
    appendToCurrentTab,
    setCurrentMessages,
    addWorkspaceItem,
  ]);

  const lastRoute = useMemo(() => {
    const msgs = currentMessages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m?.type === 'edgar') return 'EDGAR';
      if (m?.type === 'extractor_flow') return 'Extract';
      if (m?.type === 'query') return 'RAG';
    }
    return TAB_LABELS[activeTab] || null;
  }, [activeTab, currentMessages]);

  const inputPlaceholder =
    activeTab === 'edgar'
      ? 'e.g. Apple 10-K last 3 years'
      : activeTab === 'rag'
        ? 'Ask about your document…'
        : 'Ask or run a command…';

  const showChatInput = (activeTab === 'edgar' || activeTab === 'rag') && activeTab !== 'admin';

  if (!user) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  // Logged in but not allowed (and not admin): show request-access card only
  if (!user.is_allowed && user.role !== 'admin') {
    return (
      <div className="app-layout request-access-layout">
        <div className="request-access-card">
          <h1 className="request-access-title">Ask admin for access</h1>
          <p className="request-access-text">
            Your account is not yet approved. Please contact an administrator to get access to the app.
          </p>
          <button type="button" className="btn-primary auth-submit" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        fileId={fileId}
        filename={filename}
        onPdfUpload={handlePdfUpload}
        uploading={uploading}
        onNewChat={handleNewChat}
        onLogout={handleLogout}
        userEmail={user.email}
        userRole={user.role}
      />
      <div className="main-area">
        <main className="app-main">
          {activeTab === 'edgar' && (
            <>
              {currentMessages.length === 0 && !loading && (
                <div className="welcome-card">
                  <h2 className="welcome-title">EDGAR</h2>
                  <p className="welcome-text">
                    Ask for SEC financials by company and years (e.g. Apple 10-K last 3 years).
                  </p>
                </div>
              )}
              <div className="messages-list">
                {currentMessages.map((msg) => (
                  <div key={msg.id} className="msg-row msg-row-animate">
                    <MessageBlock
                      msg={msg}
                      onError={showToast}
                      workspaceActiveId={activeWorkspaceId}
                      onOpenWorkspace={setActiveWorkspaceId}
                      addWorkspaceItem={addWorkspaceItem}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'extract' && (
            <>
              {!fileId && (
                <div className="welcome-card">
                  <h2 className="welcome-title">Extract tables</h2>
                  <p className="welcome-text">
                    Upload a PDF in the left sidebar. Then use this flow to select pages and extract
                    tables.
                  </p>
                </div>
              )}
              {fileId && (
                <>
                  {currentMessages.length === 0 && (
                    <div className="msg-row">
                      <SystemBubble text={`Document "${filename || 'PDF'}" ready. Select pages to extract below.`} />
                    </div>
                  )}
                  {currentMessages.map((msg) => (
                    <div key={msg.id} className="msg-row msg-row-animate">
                      <MessageBlock
                        msg={msg}
                        onError={showToast}
                        workspaceActiveId={activeWorkspaceId}
                        onOpenWorkspace={setActiveWorkspaceId}
                        addWorkspaceItem={addWorkspaceItem}
                      />
                    </div>
                  ))}
                  <div className="msg-row">
                    <div className="output-card">
                      <ExtractorFlow
                        fileId={fileId}
                        onError={(msg) => showToast(msg, true)}
                        showResultsInWorkspace
                        onExtractionComplete={(extractedTables) => {
                          const id = addWorkspaceItem({
                            type: 'extractor',
                            title: 'Extracted tables',
                            extractedTables,
                            fileId,
                          });
                          setActiveWorkspaceId(id);
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === 'rag' && (
            <>
              {currentMessages.length === 0 && !loading && (
                <div className="welcome-card">
                  <h2 className="welcome-title">RAG · Document Q&A</h2>
                  <p className="welcome-text">
                    {fileId
                      ? chatbotReady
                        ? 'Ask questions about your uploaded document.'
                        : 'Document is still ingesting. You can ask when ready.'
                      : 'Upload a PDF in the left sidebar to ask questions about it.'}
                  </p>
                </div>
              )}
              <div className="messages-list">
                {currentMessages.map((msg) => (
                  <div key={msg.id} className="msg-row msg-row-animate">
                    <MessageBlock
                      msg={msg}
                      onError={showToast}
                      workspaceActiveId={activeWorkspaceId}
                      onOpenWorkspace={setActiveWorkspaceId}
                      addWorkspaceItem={addWorkspaceItem}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'admin' && (
            <AdminDashboard onError={(msg) => showToast(msg, true)} />
          )}

          {loading && (
            <div className="msg-row msg-row-animate">
              <ChatLoader />
            </div>
          )}
        </main>

        <footer className="app-footer">
          <div className="chatbar">
            {showChatInput && (
              <>
                <CommandInput
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSend}
                  placeholder={inputPlaceholder}
                  disabled={loading}
                />
              </>
            )}
            {activeTab === 'extract' && (
              <p className="chatbar-hint">Use the flow above to select pages and extract tables.</p>
            )}
          </div>
        </footer>
      </div>

      {workspaceItems.length > 0 && (
        <div
          className={`workspace-resize-handle ${resizing ? 'workspace-resize-handle-active' : ''}`}
          role="separator"
          aria-label="Resize workspace panel"
          onMouseDown={handleResizeStart}
        />
      )}

      <RightPanel
        ref={rightPanelRef}
        loading={loading}
        currentRoute={lastRoute}
        fileId={fileId}
        filename={filename}
        chatbotReady={chatbotReady}
        chatbotProcessing={chatbotProcessing}
        workspaceItems={workspaceItems}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={setActiveWorkspaceId}
        onCloseWorkspaceItem={removeWorkspaceItem}
        workspacePanelWidth={workspacePanelWidth}
      />

      {toast && (
        <div className={`toast ${toast.isError ? 'toast-error' : ''}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function MessageBlock({
  msg,
  onError,
  workspaceActiveId,
  onOpenWorkspace,
  addWorkspaceItem,
}) {
  if (msg.role === 'user') {
    return <UserBubble text={msg.text} />;
  }
  if (msg.role === 'system') {
    return <SystemBubble text={msg.text} />;
  }

  if (msg.type === 'edgar' && msg.data) {
    const merged = msg.data?.merged || {};
    const years = merged.years || [];
    const count = [merged.balance_sheet, merged.income_statement, merged.cash_flow_statement].filter(
      Boolean
    ).length;
    const isActive = workspaceActiveId === msg.workspaceId;
    return (
      <AssistantBubble routeTag={`EDGAR · ${msg.ticker}`}>
        <button
          type="button"
          className={`structured-preview-card ${isActive ? 'structured-preview-card-active' : ''}`}
          onClick={() => onOpenWorkspace?.(msg.workspaceId)}
          aria-pressed={isActive}
        >
          <span className="structured-preview-title">Financial statements</span>
          <span className="structured-preview-meta">
            {msg.ticker} · {count} statement{count !== 1 ? 's' : ''} · {years.length} year
            {years.length !== 1 ? 's' : ''}
          </span>
          <span className="structured-preview-action">View in workspace →</span>
        </button>
      </AssistantBubble>
    );
  }
  if (msg.type === 'extractor_flow' && msg.fileId) {
    return (
      <AssistantBubble routeTag="Table extraction">
        <div className="output-card">
          <ExtractorFlow
            fileId={msg.fileId}
            onError={onError}
            showResultsInWorkspace
            onExtractionComplete={(extractedTables) => {
              const id = addWorkspaceItem({
                type: 'extractor',
                title: 'Extracted tables',
                extractedTables,
                fileId: msg.fileId,
              });
              onOpenWorkspace?.(id);
            }}
          />
        </div>
      </AssistantBubble>
    );
  }
  if (msg.type === 'query' && msg.data) {
    return (
      <AssistantBubble routeTag="RAG" copyText={msg.data.answer}>
        <div className="output-card">
          <QueryAnswer
            question={msg.data.question}
            answer={msg.data.answer}
            chunks={msg.data.chunks}
          />
        </div>
      </AssistantBubble>
    );
  }

  return (
    <AssistantBubble
      routeTag={msg.route ? `${msg.route}${msg.confidence != null ? ` · ${Math.round(msg.confidence * 100)}%` : ''}` : null}
      explanation={msg.explanation}
      text={msg.text}
      copyText={msg.text}
    />
  );
}
