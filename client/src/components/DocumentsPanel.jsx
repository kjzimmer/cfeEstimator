import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import FileViewerModal from './FileViewerModal.jsx';

const TYPE_LABELS = {
  'site-note': 'Site Note',
  photo: 'Photo',
  'work-order': 'Work Order',
  other: 'Other',
};

const TYPE_OPTIONS = Object.keys(TYPE_LABELS);

const SOURCE_LABELS = {
  chat: 'via chat',
  direct: 'uploaded',
  system: 'generated',
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadForm({ projectId, onUploaded }) {
  const [type, setType] = useState('other');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  async function handleFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const stored = await api.uploadDocument(projectId, file, type);
      onUploaded(stored);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
      >
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors"
      >
        {uploading ? 'Uploading…' : 'Upload document'}
      </button>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePicked} />
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function DocumentsPanel({ projectId }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [viewingFile, setViewingFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listFiles(projectId)
      .then((data) => {
        if (!cancelled) setFiles(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="h-full flex flex-col bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">Documents</h2>
          <p className="text-xs text-text-secondary">Every file tied to this project, in one place</p>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <UploadForm projectId={projectId} onUploaded={(f) => setFiles((prev) => [f, ...(prev || [])])} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}

        {files && files.length === 0 && (
          <p className="px-4 py-8 text-sm text-text-secondary text-center">
            No documents yet — attach one in the conversation or upload here.
          </p>
        )}

        {files &&
          files.map((f) => (
            <button
              key={f.id}
              onClick={() => setViewingFile({ fileId: f.id, filename: f.filename })}
              className="w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-black/[0.02] transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-text truncate">{f.filename}</p>
                <p className="text-xs text-text-secondary">
                  {f.uploaded_by_name || 'Unknown'} · {SOURCE_LABELS[f.source] || f.source} ·{' '}
                  {formatSize(f.size_bytes)}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium px-2 py-1 rounded-md bg-accent/10 text-accent">
                {TYPE_LABELS[f.type] || f.type}
              </span>
            </button>
          ))}
      </div>

      {viewingFile && (
        <FileViewerModal
          projectId={projectId}
          fileId={viewingFile.fileId}
          filename={viewingFile.filename}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  );
}
