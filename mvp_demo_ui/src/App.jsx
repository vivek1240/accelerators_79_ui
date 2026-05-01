import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as api from './api';
const getError = api.getErrorMessage;
import AdminDashboard from './components/AdminDashboard';
import EdgarTables from './components/EdgarTables';
import ExtractorFlow from './components/ExtractorFlow';
import ExtractorTables from './components/ExtractorTables';
import QueryAnswer from './components/QueryAnswer';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import ChatLoader from './components/ChatLoader';
import CommandInput from './components/CommandInput';
import { UserBubble, AssistantBubble, SystemBubble } from './components/MessageBubble';
// Advanced analysis UI is currently disabled for performance.
// import AdvancedAnalysis from './components/AdvancedAnalysis';

const TAB_LABELS = {
  edgar: 'EDGAR',
  extract: 'Extract',
  analysis: 'Analysis',
  rag: 'Advanced chatbot',
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
  const [activeTab, setActiveTab] = useState('edgar');
  /** @type {{ fileId: string, filename: string, memoryId?: string|null, parsed?: boolean, magReady?: boolean, magProcessing?: boolean, magError?: string|null, chatbotReady?: boolean, chatbotProcessing?: boolean }[]} */
  const [documents, setDocuments] = useState([]);
  const [focusedFileId, setFocusedFileId] = useState(null);
  /** fileIds included in MAG / chat context */
  const [selectedChatFileIds, setSelectedChatFileIds] = useState(() => new Set());
  const [deepThinking, setDeepThinking] = useState(true);
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
  const [allExtractedTables, setAllExtractedTables] = useState([]);
  const [extractedPageIndices, setExtractedPageIndices] = useState(() => new Set());
  const [pagePreviewUrls, setPagePreviewUrls] = useState({});

  const [streamingMsgId, setStreamingMsgId] = useState(null);

  const focusedDoc = useMemo(
    () => documents.find((d) => d.fileId === focusedFileId) || documents[documents.length - 1] || null,
    [documents, focusedFileId]
  );
  const fileId = focusedDoc?.fileId ?? null;
  const filename = focusedDoc?.filename ?? null;

  const readyMemoryIdsForChat = useMemo(() => {
    const pool =
      selectedChatFileIds.size > 0
        ? documents.filter((d) => selectedChatFileIds.has(d.fileId))
        : documents;
    return pool.filter((d) => d.memoryId && d.magReady).map((d) => d.memoryId);
  }, [documents, selectedChatFileIds]);

  const anyMagReady = useMemo(
    () => documents.some((d) => d.magReady && d.memoryId),
    [documents]
  );

  const chatbotProcessing = useMemo(
    () => documents.some((d) => d.magProcessing || d.chatbotProcessing),
    [documents]
  );

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
    let resolvedId = item.id ?? null;
    setWorkspaceItems((prev) => {
      // For extractor results, reuse a single tab per file so "View in workspace"
      // does not create duplicates.
      if (item.type === 'extractor' && item.fileId) {
        const existing = prev.find(
          (w) => w.type === 'extractor' && w.fileId === item.fileId
        );
        if (existing) {
          resolvedId = existing.id;
          const updated = prev.map((w) =>
            w.id === existing.id ? { ...w, ...item, id: existing.id } : w
          );
          return updated;
        }
      }

      if (!resolvedId) {
        resolvedId = genId();
      }
      return [...prev, { ...item, id: resolvedId }];
    });
    if (resolvedId) {
      setActiveWorkspaceId(resolvedId);
    }
    return resolvedId;
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

  const toggleChatFile = useCallback((fid) => {
    setSelectedChatFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  }, []);

  const pollStatus = useCallback(async (fid) => {
    for (let i = 0; i < 60; i++) {
      try {
        const res = await api.status(fid);
        const d = res?.data;
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.fileId === fid
              ? {
                  ...doc,
                  parsed: d?.parsed ?? doc.parsed,
                  chatbotReady: d?.chatbot_ready ?? doc.chatbotReady,
                  chatbotProcessing: d?.chatbot_processing ?? false,
                  magReady: d?.mag_ready ?? doc.magReady,
                  magProcessing: d?.mag_processing ?? false,
                  magError: d?.mag_error ?? doc.magError,
                  memoryId: d?.memory_id || doc.memoryId,
                }
              : doc
          )
        );
        if (d?.mag_error) {
          showToast(d.mag_error, true);
          return false;
        }
        if (d?.chatbot_ready) {
          setSelectedChatFileIds((prev) => new Set(prev).add(fid));
          return true;
        }
        if (d?.chatbot_error) {
          showToast(d.chatbot_error, true);
          return false;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 3000));
    }
    showToast('Ingestion timed out', true);
    return false;
  }, [showToast]);

  const handlePdfUpload = useCallback(
    async (fileOrFiles) => {
      const raw = fileOrFiles?.length != null ? Array.from(fileOrFiles) : [fileOrFiles];
      const files = raw.filter((f) => f?.name?.toLowerCase?.().endsWith('.pdf'));
      if (!files.length) {
        showToast('Please select one or more PDF files', true);
        return;
      }
      setUploading(true);
      try {
        for (const file of files) {
          const res = await api.upload(file);
          if (!res?.success || !res?.data?.file_id) {
            showToast(res?.error?.message || 'Upload failed', true);
            continue;
          }
          const fid = res.data.file_id;
          const fname = res.data.filename || file.name;
          const ingesting = res.data.chatbot_status === 'ingesting' || res.data.mag_status === 'ingesting';
          const newDoc = {
            fileId: fid,
            filename: fname,
            memoryId: res.data.memory_id || null,
            parsed: res.data.parsed ?? true,
            magReady: res.data.mag_status === 'ready',
            magProcessing: res.data.mag_status === 'ingesting',
            magError: null,
            chatbotReady: res.data.chatbot_status !== 'ingesting',
            chatbotProcessing: ingesting,
          };
          setDocuments((prev) => [...prev.filter((d) => d.fileId !== fid), newDoc]);
          setFocusedFileId(fid);
          setSelectedChatFileIds((prev) => new Set(prev).add(fid));
          showToast(
            ingesting
              ? `Uploaded "${fname}". MAG / chat processing…`
              : `Uploaded "${fname}". Ready for Extract and chat.`
          );
          if (ingesting) pollStatus(fid);
          else {
            const ingestMsg = {
              id: Date.now() + Math.random(),
              role: 'system',
              text: `Document "${fname}" is ready. You can extract tables or chat.`,
            };
            setEdgarMessages((prev) => [...prev, ingestMsg]);
            setExtractMessages((prev) => [...prev, ingestMsg]);
            setRagMessages((prev) => [...prev, ingestMsg]);
          }
        }
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

    let skipFinallyLoading = false;

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
        const memoryIds = readyMemoryIdsForChat;
        if (memoryIds.length === 0 && documents.length > 0) {
          showToast(
            'Advanced chatbot uses MAG only. With PDFs uploaded, wait for analyst memory to be ready or select ready files in sidebar.',
            true
          );
        } else {
          const msgId = Date.now() + 1;

          appendToCurrentTab({
            id: msgId,
            role: 'assistant',
            type: 'query',
            streaming: true,
            data: { question: q, answer: '', route: null, model: null },
          });
          setStreamingMsgId(msgId);

          api.magQueryStream({
            question: q,
            memoryIds,
            deepThinking,
            sessionId: `rag_${api.sessionUserId}`,
            onMeta: (meta) => {
              setRagMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? { ...m, data: { ...m.data, route: meta.route, model: meta.model } }
                    : m
                )
              );
            },
            onChunk: (text) => {
              setRagMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? { ...m, data: { ...m.data, answer: (m.data.answer || '') + text } }
                    : m
                )
              );
            },
            onDone: (evt) => {
              setRagMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? {
                        ...m,
                        streaming: false,
                        data: {
                          ...m.data,
                          ...(Array.isArray(evt?.chunks) && evt.chunks.length
                            ? { chunks: evt.chunks }
                            : {}),
                          ...(evt?.filters_applied != null
                            ? { filters_applied: evt.filters_applied }
                            : {}),
                        },
                      }
                    : m
                )
              );
              setStreamingMsgId(null);
              setLoading(false);
            },
            onError: (msg, extra = {}) => {
              if (extra?.code === 'MAG_NOT_READY') {
                setDocuments((prev) =>
                  prev.map((d) =>
                    d.memoryId && memoryIds.includes(d.memoryId)
                      ? { ...d, magReady: false, magProcessing: true }
                      : d
                  )
                );
                memoryIds.forEach((mid) => {
                  const d = documents.find((x) => x.memoryId === mid);
                  if (d?.fileId) pollStatus(d.fileId);
                });
              }
              showToast(msg || 'Streaming query failed', true);
              setRagMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? {
                        ...m,
                        streaming: false,
                        data: {
                          ...m.data,
                          answer: `${m.data.answer || ''}\n\n*${msg || 'Stream error'}*`,
                        },
                      }
                    : m
                )
              );
              setStreamingMsgId(null);
              setLoading(false);
            },
          });
          skipFinallyLoading = true;
          return;
        }
      }
    } catch (e) {
      showToast(getError(e, 'Request failed'), true);
    } finally {
      if (!skipFinallyLoading) setLoading(false);
    }
  }, [
    input,
    activeTab,
    documents,
    readyMemoryIdsForChat,
    deepThinking,
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
      if (m?.type === 'query') return 'Advanced chatbot';
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

  return (
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        documents={documents}
        focusedFileId={focusedFileId}
        onFocusFile={setFocusedFileId}
        selectedChatFileIds={selectedChatFileIds}
        onToggleChatFile={toggleChatFile}
        onPdfUpload={handlePdfUpload}
        uploading={uploading}
        userRole="user"
      />
      <div className="main-area">
        <main className={`app-main${activeTab === 'rag' ? ' app-main--rag' : ''}`}>
          {activeTab === 'edgar' && (
            <>
              {currentMessages.length === 0 && !loading && (
                <div className="welcome-card">
                  <h2 className="welcome-title">EDGAR</h2>
                  <p className="welcome-text">
                    Get data for publicly listed companies. Ask for SEC financials by company and years (e.g. Apple 10-K last 3 years).
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
                  <h2 className="welcome-title">Extract</h2>
                  <p className="welcome-text">
                    Extract tables from PDF pages. Upload a PDF in the left sidebar, then select pages and extract tables.
                  </p>
                </div>
              )}
              {fileId && (
                <>
                  {allExtractedTables.length === 0 && (
                    <div className="msg-row">
                      <SystemBubble text={`Document "${filename || 'PDF'}" ready. Select pages to extract below.`} />
                    </div>
                  )}

                  {allExtractedTables.length > 0 && (
                    <div className="msg-row" style={{ maxWidth: '100%' }}>
                      <div style={{ width: '100%' }}>
                        <ExtractorTables
                          extractedTables={allExtractedTables}
                          fileId={fileId}
                          pagePreviewUrls={pagePreviewUrls}
                          onExportError={(msg) => showToast(msg, true)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="msg-row">
                    <div className="output-card">
                      <ExtractorFlow
                        fileId={fileId}
                        onError={(msg) => showToast(msg, true)}
                        alreadyExtractedIndices={extractedPageIndices}
                        onPreviewUrlsLoaded={(urls) => setPagePreviewUrls((prev) => ({ ...prev, ...urls }))}
                        onExtractionComplete={(extractedTables) => {
                          setAllExtractedTables((prev) => [...prev, ...extractedTables]);
                          setExtractedPageIndices((prev) => {
                            const next = new Set(prev);
                            extractedTables.forEach((t) => {
                              if (t.page_index != null) next.add(t.page_index);
                            });
                            return next;
                          });
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === 'analysis' && (
            <div className="aa-empty">
              <div className="aa-empty-visual">
                <div className="aa-empty-circle" />
                <div className="aa-empty-circle aa-empty-circle-2" />
                <div className="aa-empty-icon-wrap">🚧</div>
              </div>
              <h3 className="aa-empty-title">Analysis temporarily disabled</h3>
              <p className="aa-empty-text">
                The advanced analysis and visualization flow is turned off for now to keep the app fast.
                You can re‑enable it later by wiring the <code>AdvancedAnalysis</code> component back in.
              </p>
            </div>
          )}

          {activeTab === 'rag' && (
            <>
              {currentMessages.length === 0 && !loading && (
                <div className="welcome-card">
                  <h2 className="welcome-title">Advanced chatbot</h2>
                  <p className="welcome-text">
                    {readyMemoryIdsForChat.length > 0
                      ? `Analyst memory (MAG) is ready for ${readyMemoryIdsForChat.length} document${
                          readyMemoryIdsForChat.length !== 1 ? 's' : ''
                        }. Answers stream live from the model. Use sidebar checkboxes for chat scope.`
                      : documents.length === 0
                        ? 'No PDF uploaded: generic MAG chat is available now. Upload PDFs anytime to add analyst memory context.'
                        : anyMagReady
                          ? 'Select at least one document with ready analyst memory (checkbox in sidebar), or wait for MAG processing to finish.'
                          : 'MAG is still building analyst memory for your PDFs. You can use Extract while you wait.'}
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

          {loading && !streamingMsgId && (
            <div className="msg-row msg-row-animate">
              <ChatLoader />
            </div>
          )}
        </main>

        <footer className="app-footer">
          <div className={`chatbar${activeTab === 'rag' ? ' chatbar--rag' : ''}`}>
            {activeTab === 'rag' && (
              <button
                type="button"
                className={`chatbar-mode-pill ${deepThinking ? 'chatbar-mode-pill-active' : ''}`}
                onClick={() => setDeepThinking((v) => !v)}
                disabled={loading}
                aria-pressed={deepThinking}
                title="Toggle deeper reasoning for advanced chatbot"
              >
                Deep thinking {deepThinking ? 'On' : 'Off'}
              </button>
            )}
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
            {activeTab === 'analysis' && (
              <p className="chatbar-hint">Extract tables first, then view insights and visualizations here.</p>
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
        chatbotReady={anyMagReady}
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
      <AssistantBubble copyText={msg.data.answer}>
        <div className="output-card">
          <QueryAnswer
            answer={msg.data.answer}
            question={msg.data.question}
            chunks={msg.data.chunks}
            streaming={!!msg.streaming}
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
