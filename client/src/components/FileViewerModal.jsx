import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

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

        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-bg min-h-[50vh]">
          {state.status === 'loading' && <p className="text-sm text-text-secondary">Loading…</p>}

          {state.status === 'error' && <p className="text-sm text-red-600">{state.message}</p>}

          {state.status === 'ready' && state.mimeType.startsWith('image/') && (
            <img src={state.url} alt={filename} className="max-w-full max-h-full object-contain" />
          )}

          {state.status === 'ready' && state.mimeType === 'application/pdf' && (
            <iframe src={state.url} title={filename} className="w-full h-full min-h-[70vh]" />
          )}

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
