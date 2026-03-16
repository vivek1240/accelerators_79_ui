import { useState, useEffect, useRef } from 'react';
import { getPages, getPagePreview, extract } from '../api';
import ExtractorTables from './ExtractorTables';

export default function ExtractorFlow({
  fileId,
  onError,
  onExtractionComplete,
  alreadyExtractedIndices = new Set(),
  onPreviewUrlsLoaded,
}) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [justExtracted, setJustExtracted] = useState(false);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [previewUrls, setPreviewUrls] = useState({});
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractTipIndex, setExtractTipIndex] = useState(0);
  const blobUrlsRef = useRef({});

  const extractTips = [
    'Locating tables and headers in your document…',
    'Normalizing rows and columns into a structured view…',
    'Aligning periods and totals so numbers add up…',
    'Collecting metadata to help you audit later…',
  ];

  useEffect(() => {
    return () => {
      Object.values(blobUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      blobUrlsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!loadingExtract) {
      setExtractProgress(0);
      return;
    }
    setExtractProgress(10);
    setExtractTipIndex(0);
    const progressInterval = setInterval(() => {
      setExtractProgress((prev) => {
        if (prev >= 92) return prev;
        const next = prev + Math.random() * 8;
        return next > 92 ? 92 : next;
      });
    }, 600);
    const tipInterval = setInterval(() => {
      setExtractTipIndex((prev) => (prev + 1) % extractTips.length);
    }, 2600);
    return () => {
      clearInterval(progressInterval);
      clearInterval(tipInterval);
    };
  }, [loadingExtract]);

  const availablePages = pages.filter((p) => !alreadyExtractedIndices.has(p.page_index));

  const loadPages = async () => {
    Object.values(blobUrlsRef.current).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    blobUrlsRef.current = {};
    setLoading(true);
    setJustExtracted(false);
    setPreviewUrls({});
    try {
      const res = await getPages(fileId);
      if (res?.success && res?.data?.pages_with_tables?.length) {
        const list = res.data.pages_with_tables;
        setPages(list);
        setSelected(new Set());
        setLoadingPreviews(true);
        const urls = {};
        await Promise.all(
          list.map(async (p) => {
            try {
              const blob = await getPagePreview(fileId, p.page_index);
              if (blob instanceof Blob) {
                const url = URL.createObjectURL(blob);
                blobUrlsRef.current[p.page_index] = url;
                urls[p.page_index] = url;
              } else {
                urls[p.page_index] = null;
              }
            } catch {
              urls[p.page_index] = null;
            }
          })
        );
        setPreviewUrls((prev) => ({ ...prev, ...urls }));
        onPreviewUrlsLoaded?.(urls);
      } else {
        setPages([]);
        onError?.('No pages with tables found for this document.');
      }
    } catch (e) {
      onError?.(e?.response?.data?.detail?.message || e?.message || 'Failed to load pages');
      setPages([]);
    } finally {
      setLoading(false);
      setLoadingPreviews(false);
    }
  };

  const toggle = (pageIndex) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  };

  const runExtract = async () => {
    if (selected.size === 0) {
      onError?.('Select at least one page.');
      return;
    }
    setLoadingExtract(true);
    setExtractProgress(10);
    try {
      const res = await extract(fileId, Array.from(selected));
      if (res?.success && res?.data?.extracted_tables?.length) {
        const tables = res.data.extracted_tables;
        setJustExtracted(true);
        setSelected(new Set());
        if (onExtractionComplete) onExtractionComplete(tables);
      } else {
        onError?.('Extraction returned no tables.');
      }
    } catch (e) {
      onError?.(e?.response?.data?.detail?.message || e?.message || 'Extraction failed');
    } finally {
      setLoadingExtract(false);
      setExtractProgress(100);
    }
  };

  const hasMorePages = availablePages.length > 0;
  const hasAlreadyExtracted = alreadyExtractedIndices.size > 0;

  if (hasAlreadyExtracted && pages.length === 0 && !loading) {
    return (
      <div className="extractor-flow-card">
        <button type="button" className="btn-primary" onClick={loadPages}>
          Extract more tables
        </button>
      </div>
    );
  }

  if (hasAlreadyExtracted && justExtracted && !hasMorePages) {
    return (
      <div className="extractor-flow-card">
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
          All pages with tables have been extracted.
        </p>
        <button type="button" className="btn-secondary" onClick={loadPages} style={{ marginTop: 10 }}>
          Refresh pages
        </button>
      </div>
    );
  }

  return (
    <div className="extractor-flow-card">
      <div className="extractor-flow-label">
        {hasAlreadyExtracted ? 'Select more pages to extract' : 'Select pages to extract (all previews shown)'}
      </div>
      {pages.length === 0 && !loading && (
        <button type="button" className="btn-primary" onClick={loadPages}>
          {hasAlreadyExtracted ? 'Load more pages' : 'Load pages with tables'}
        </button>
      )}
      {loading && <p className="extractor-flow-loading">Loading pages…</p>}
      {availablePages.length > 0 && (
        <>
          {loadingPreviews && <p className="extractor-flow-loading">Loading previews…</p>}
          <div className="extractor-flow-pages-grid">
            {availablePages.map((p) => {
              const displayPageNum = typeof p.page_number === 'number' && p.page_number >= 1 ? p.page_number : null;
              const pageLabel = displayPageNum != null ? `Page ${displayPageNum}` : 'Page ?';
              return (
                <label
                  key={p.page_index}
                  className={`extractor-flow-page-card ${selected.has(p.page_index) ? 'extractor-flow-page-card-selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.page_index)}
                    onChange={() => toggle(p.page_index)}
                    className="extractor-flow-page-checkbox"
                  />
                  <div className="extractor-flow-page-preview-wrap">
                    {previewUrls[p.page_index] ? (
                      <img src={previewUrls[p.page_index]} alt={pageLabel} className="extractor-flow-page-preview-img" />
                    ) : (
                      <div className="extractor-flow-page-preview-placeholder">Preview</div>
                    )}
                  </div>
                  <span className="extractor-flow-page-number">{pageLabel}</span>
                </label>
              );
            })}
          </div>
          <div className="extractor-flow-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={runExtract}
              disabled={loadingExtract || selected.size === 0}
            >
              {loadingExtract ? 'Extracting…' : `Extract ${selected.size} page(s)`}
            </button>
            <button type="button" className="btn-secondary" onClick={loadPages}>
              Refresh pages
            </button>
          </div>
          {loadingExtract && (
            <div className="extractor-progress">
              <div className="extractor-progress-bar">
                <div
                  className="extractor-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, extractProgress))}%` }}
                />
              </div>
              <div className="extractor-progress-text">
                <span className="extractor-progress-label">Working on your tables…</span>
                <span className="extractor-progress-tip">{extractTips[extractTipIndex]}</span>
              </div>
            </div>
          )}
        </>
      )}
      {pages.length > 0 && availablePages.length === 0 && !loading && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
          All pages with tables have been extracted.
        </p>
      )}
    </div>
  );
}
