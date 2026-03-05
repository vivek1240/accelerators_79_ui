import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { analyze as apiAnalyze } from '../api';

// ---------------------------------------------------------------------------
// Color palettes & constants
// ---------------------------------------------------------------------------

const COLOR_PALETTES = {
  blue:      ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8'],
  green_red: ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#a855f7'],
  multi:     ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#14b8a6'],
  warm:      ['#f59e0b', '#ef4444', '#ec4899', '#f97316', '#e11d48'],
};
function getColors(hint) { return COLOR_PALETTES[hint] || COLOR_PALETTES.multi; }

const SEVERITY_STYLES = {
  high:   { border: '#ef4444', bg: 'rgba(239,68,68,0.06)',   icon: '!!' },
  medium: { border: '#f59e0b', bg: 'rgba(245,158,11,0.06)',  icon: '!' },
  low:    { border: '#3b82f6', bg: 'rgba(59,130,246,0.06)',   icon: 'i' },
};
const TYPE_LABELS = {
  trend: 'Trend', anomaly: 'Anomaly', comparison: 'Comparison',
  composition: 'Composition', risk: 'Risk',
};
const SENTIMENT_COLORS = { positive: '#22c55e', negative: '#ef4444', neutral: '#94a3b8' };

function yAxisFmt(v) {
  if (Math.abs(v) >= 1e9)  return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6)  return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3)  return `${(v / 1e3).toFixed(1)}K`;
  return v;
}

// Fingerprint a table so we can tell "already analyzed" vs "new"
function tableFingerprint(tbl) {
  const pg = tbl.page_index ?? tbl.page_number ?? '?';
  const title = tbl.table_metadata?.table_title || tbl.data?.table_metadata?.table_title || '';
  const rowCount = tbl.data?.rows?.length ?? 0;
  return `${pg}::${title}::${rowCount}`;
}

// ---------------------------------------------------------------------------
// Chart components
// ---------------------------------------------------------------------------

function DynamicChart({ config }) {
  const { chart_type, title, x_key, series, data, color_hint } = config;
  const colors = getColors(color_hint);
  if (!data?.length || !series?.length) return null;

  if (chart_type === 'pie') {
    const pieData = data.map((d, i) => ({
      name: d[x_key] || d.name || `Item ${i + 1}`,
      value: d[series[0]?.key] ?? 0,
    }));
    return (
      <div className="aa-chart-card aa-fade-in">
        <div className="aa-chart-card-title">{title}</div>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name"
              cx="50%" cy="50%" outerRadius={100} innerRadius={50}
              paddingAngle={2}
              label={({ name, percent }) => `${name.length > 14 ? name.slice(0, 12) + '…' : name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ strokeWidth: 1 }}>
              {pieData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => v?.toLocaleString()} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart_type === 'line') {
    return (
      <div className="aa-chart-card aa-fade-in">
        <div className="aa-chart-card-title">{title}</div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
            <XAxis dataKey={x_key} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={72} tickFormatter={yAxisFmt} />
            <Tooltip formatter={(v) => v?.toLocaleString()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                stroke={colors[i % colors.length]} strokeWidth={2.5}
                dot={{ r: 4, strokeWidth: 2 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const isStacked = chart_type === 'stacked_bar';
  return (
    <div className="aa-chart-card aa-fade-in">
      <div className="aa-chart-card-title">{title}</div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
          <XAxis dataKey={x_key} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={72} tickFormatter={yAxisFmt} />
          <Tooltip formatter={(v) => v?.toLocaleString()} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label}
              fill={colors[i % colors.length]}
              stackId={isStacked ? 'stack' : undefined}
              radius={isStacked ? undefined : [4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricTile({ metric }) {
  const col = SENTIMENT_COLORS[metric.sentiment] || SENTIMENT_COLORS.neutral;
  return (
    <div className="aa-metric aa-fade-in" style={{ borderTopColor: col }}>
      <span className="aa-metric-label">{metric.label}</span>
      <span className="aa-metric-value">{metric.value}</span>
      {metric.delta && <span className="aa-metric-delta" style={{ color: col }}>{metric.delta}</span>}
    </div>
  );
}

function InsightCard({ insight }) {
  const sev = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.low;
  return (
    <div className="aa-insight aa-fade-in" style={{ borderLeftColor: sev.border, background: sev.bg }}>
      <div className="aa-insight-top">
        <span className="aa-insight-sev" style={{ background: sev.border }}>{sev.icon}</span>
        <span className="aa-insight-type">{TYPE_LABELS[insight.type] || insight.type}</span>
      </div>
      <div className="aa-insight-title">{insight.title}</div>
      <div className="aa-insight-desc">{insight.description}</div>
    </div>
  );
}

function AnalysisCard({ analysis, index }) {
  return (
    <div className="aa-section aa-slide-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="aa-section-header">
        <div className="aa-section-header-left">
          <span className="aa-section-num">#{index + 1}</span>
          <span className="aa-section-title">{analysis.title}</span>
        </div>
        <span className="aa-section-badge">
          {analysis.metrics?.length || 0} metrics · {analysis.chart_configs?.length || 0} charts
        </span>
      </div>

      {analysis.executive_summary && (
        <div className="aa-summary">
          <p className="aa-summary-text">{analysis.executive_summary}</p>
        </div>
      )}

      {analysis.metrics?.length > 0 && (
        <div className="aa-metrics-row">
          {analysis.metrics.map((m, i) => <MetricTile key={i} metric={m} />)}
        </div>
      )}

      {analysis.insights?.length > 0 && (
        <div className="aa-insights-grid">
          {analysis.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      )}

      {analysis.chart_configs?.length > 0 && (
        <div className="aa-charts-grid">
          {analysis.chart_configs.map((cfg, i) => <DynamicChart key={i} config={cfg} />)}
        </div>
      )}
    </div>
  );
}

function InlineLoader({ count }) {
  return (
    <div className="aa-inline-loader aa-fade-in">
      <div className="aa-inline-loader-ring" />
      <span className="aa-inline-loader-text">
        Analyzing {count} new table{count !== 1 ? 's' : ''}…
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component — persistent, append-only
// ---------------------------------------------------------------------------

export default function AdvancedAnalysis({ extractedTables, filename, onError }) {
  // Cache: fingerprint → analysis result
  const cacheRef = useRef({});
  const [analysisEntries, setAnalysisEntries] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const prevLengthRef = useRef(0);

  const analyzeNewTables = useCallback(async (newTables) => {
    if (!newTables.length) return;
    setPendingCount(newTables.length);
    try {
      const res = await apiAnalyze(newTables, filename);
      if (res?.success && res?.data?.analyses) {
        const newEntries = [];
        res.data.analyses.forEach((a, i) => {
          const fp = tableFingerprint(newTables[i]);
          cacheRef.current[fp] = a;
          newEntries.push(a);
        });
        setAnalysisEntries((prev) => [...prev, ...newEntries]);
      } else {
        onError?.('Analysis returned no results for the new tables.');
      }
    } catch {
      onError?.('Analysis failed — make sure the FastAPI server has the /analyze endpoint.');
    } finally {
      setPendingCount(0);
    }
  }, [filename, onError]);

  useEffect(() => {
    if (!extractedTables?.length) return;
    const currentLen = extractedTables.length;
    const prevLen = prevLengthRef.current;

    if (currentLen <= prevLen) return;
    prevLengthRef.current = currentLen;

    // Find tables not yet analyzed
    const newTables = extractedTables.slice(prevLen).filter(
      (tbl) => !cacheRef.current[tableFingerprint(tbl)]
    );
    if (newTables.length) analyzeNewTables(newTables);
  }, [extractedTables, analyzeNewTables]);

  // Reset when a new PDF is uploaded (extractedTables goes to [])
  useEffect(() => {
    if (!extractedTables?.length && analysisEntries.length > 0) {
      cacheRef.current = {};
      setAnalysisEntries([]);
      prevLengthRef.current = 0;
    }
  }, [extractedTables]);

  if (!extractedTables?.length && !analysisEntries.length) {
    return (
      <div className="aa-empty">
        <div className="aa-empty-visual">
          <div className="aa-empty-circle" />
          <div className="aa-empty-circle aa-empty-circle-2" />
          <div className="aa-empty-icon-wrap">📊</div>
        </div>
        <h3 className="aa-empty-title">No tables analyzed yet</h3>
        <p className="aa-empty-text">
          Head to the <strong>Extract</strong> tab, pick some pages and extract tables.
          Each extraction will automatically generate deep insights and visualizations here.
        </p>
      </div>
    );
  }

  return (
    <div className="aa-container">
      <div className="aa-header">
        <div className="aa-header-left">
          <h2 className="aa-header-title">Advanced Analysis</h2>
          <span className="aa-header-meta">
            {analysisEntries.length} table{analysisEntries.length !== 1 ? 's' : ''} analyzed
            {filename ? ` · ${filename}` : ''}
          </span>
        </div>
        {extractedTables?.length > 0 && (
          <span className="aa-header-count">
            {extractedTables.length} extracted total
          </span>
        )}
      </div>

      <div className="aa-sections">
        {analysisEntries.map((a, i) => (
          <AnalysisCard key={i} analysis={a} index={i} />
        ))}
        {pendingCount > 0 && <InlineLoader count={pendingCount} />}
      </div>
    </div>
  );
}
