import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ConversationPanel from '../components/ConversationPanel.jsx';
import DefinitionPanel from '../components/DefinitionPanel.jsx';
import DocumentsPanel from '../components/DocumentsPanel.jsx';
import WorkOrderPanel from '../components/WorkOrderPanel.jsx';
import TasksPanel from '../components/TasksPanel.jsx';

const PULSE_DURATION_MS = 1700;
const TABS = [
  { key: 'definition', label: 'Definition' },
  { key: 'documents', label: 'Documents' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'workOrder', label: 'Work Order' },
];

export default function ProjectPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [pulsingKeys, setPulsingKeys] = useState(new Set());
  const [activeTab, setActiveTab] = useState('definition');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getProject(id), api.listMessages(id)]).then(([p, m]) => {
      if (cancelled) return;
      setProject(p);
      setMessages(m);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const flashChangedKeys = useCallback((prevDefinition, nextDefinition) => {
    const changed = new Set();
    for (const [key, value] of Object.entries(nextDefinition || {})) {
      if (prevDefinition?.[key] !== value) changed.add(key);
    }
    if (changed.size === 0) return;
    setPulsingKeys(changed);
    setTimeout(() => setPulsingKeys(new Set()), PULSE_DURATION_MS);
  }, []);

  async function handleSend(content) {
    setSending(true);
    setError('');
    const prevDefinition = project?.definition;
    try {
      const { userMessage, agentMessage, project: updatedProject } = await api.sendMessage(id, content);
      setMessages((prev) => [...prev, userMessage, agentMessage]);
      setProject(updatedProject);
      flashChangedKeys(prevDefinition, updatedProject.definition);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleUploadFile(file) {
    setSending(true);
    setError('');
    try {
      await api.uploadFile(id, file);
      const [freshMessages, freshProject] = await Promise.all([
        api.listMessages(id),
        api.getProject(id),
      ]);
      setMessages(freshMessages);
      setProject(freshProject);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!project) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-6.5rem)]">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/projects" className="text-xs text-text-secondary hover:text-text">
            ← Projects
          </Link>
          <h1 className="text-lg font-semibold text-text">{project.name}</h1>
          <p className="text-xs text-text-secondary">{project.customer_name || 'No customer set'}</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        <ConversationPanel
          messages={messages}
          currentUserId={user?.id}
          projectId={id}
          onSend={handleSend}
          onUploadFile={handleUploadFile}
          sending={sending}
        />
        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex items-center gap-1 bg-surface border border-border rounded-md p-0.5 w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:text-text',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            {activeTab === 'definition' && (
              <DefinitionPanel definition={project.definition} pulsingKeys={pulsingKeys} />
            )}
            {activeTab === 'documents' && <DocumentsPanel projectId={id} />}
            {activeTab === 'tasks' && <TasksPanel projectId={id} />}
            {activeTab === 'workOrder' && <WorkOrderPanel projectId={id} isAdmin={Boolean(user?.isAdmin)} />}
          </div>
        </div>
      </div>
    </div>
  );
}
