# MVP Demo UI

React UI for the Agentic Router API ([Swagger](https://agentic-router-production-aa61.up.railway.app/docs)).

- **Chat interface**: Type a query; the router sends it to EDGAR, table extraction, or RAG.
- **EDGAR**: Tables for Balance Sheet, Income Statement, Cash Flow; **Export to Excel**.
- **Extractor**: After uploading a PDF, load pages with tables, select pages, preview, extract; tables shown with **Export to Excel**.
- **RAG**: Disabled until chatbot ingestion is complete; then ask questions and see answer + sources.

## Setup

```bash
cd mvp_demo_ui
npm install
```

## Run

```bash
npm run dev
```

Open http://localhost:5174 (or the port Vite prints). API base URL is set via `VITE_API_BASE` (default: production).

## Build

```bash
npm run build
```
