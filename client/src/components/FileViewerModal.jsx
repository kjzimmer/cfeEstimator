import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '../lib/api.js';

// Rendered via pdf.js (canvas), not the browser's native PDF viewer/iframe --
// mobile browsers (Android Chrome in particular) can't display a PDF embedded
// in an iframe, and the blob: URL can't be handed off to an external viewer
// app either. This keeps preview working the same way on every platform.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

function PdfPreview({ url }) {
  const containerRef = useRef(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [numPages, setNumPages] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    function updateWidth() {
      if (containerRef.current) setPageWidth(containerRef.current.clientWidth);
    }
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto flex flex-col items-center gap-3">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        onLoadError={(err) => setError(err.message || 'Failed to load PDF')}
        loading={<p className="text-sm text-text-secondary py-8">Loading PDF…</p>}
      >
        {pageWidth > 0 &&
          Array.from({ length: numPages || 0 }, (_, i) => (
            <Page
              key={i}
              pageNumber={i + 1}
              width={pageWidth}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              className="shadow-md"
            />
          ))}
      </Document>
      {error && <p className="text-sm text-red-600 py-8">{error}</p>}
    </div>
  );
}

export default function FileViewerModal({ projectId, fileId, filename, onClose }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    api
      .fetchFileBlobUrl(projectId, fileId)
      .then(({ url, mimeType }) => {
        if (cancelled) return;
        objectUrl = url;
        setState({ status: 'ready', url, mimeType });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, fileId]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isPdf = state.status === 'ready' && state.mimeType === 'application/pdf';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="bg-surface rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-medium text-text truncate">{filename}</p>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text text-sm px-2 py-1 rounded-md hover:bg-black/[0.05] transition-colors"
          >
            Close
          </button>
        </div>

        <div
          className={[
            'flex-1 overflow-auto p-4 bg-bg min-h-[50vh] flex',
            isPdf ? 'items-stretch justify-stretch' : 'items-center justify-center',
          ].join(' ')}
        >
          {state.status === 'loading' && <p className="text-sm text-text-secondary">Loading…</p>}

          {state.status === 'error' && <p className="text-sm text-red-600">{state.message}</p>}

          {state.status === 'ready' && state.mimeType.startsWith('image/') && (
            <img src={state.url} alt={filename} className="max-w-full max-h-full object-contain" />
          )}

          {isPdf && <PdfPreview url={state.url} />}

          {state.status === 'ready' &&
            !state.mimeType.startsWith('image/') &&
            state.mimeType !== 'application/pdf' && (
              <div className="text-center">
                <p className="text-sm text-text-secondary mb-3">
                  Preview isn't available for this file type ({state.mimeType}).
                </p>
                <a
                  href={state.url}
                  download={filename}
                  className="inline-block text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white transition-colors"
                >
                  Download
                </a>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
