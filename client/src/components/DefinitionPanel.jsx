const COMPONENT_LABELS = {
  sow: 'Scope of Work',
  location: 'Location',
  materials: 'Materials',
  assets: 'Assets',
  labor: 'Labor',
  billing: 'Billing',
  siteVisit: 'Site Visit',
};

function labelFor(key) {
  return COMPONENT_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export default function DefinitionPanel({ definition, pulsingKeys }) {
  const entries = Object.entries(definition || {});

  return (
    <div className="h-full flex flex-col bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text">Project Definition</h2>
        <p className="text-xs text-text-secondary">Builds up automatically as the conversation progresses</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 && (
          <p className="px-4 py-8 text-sm text-text-secondary text-center">
            Not yet configured — coming soon. Start the conversation and this will fill in.
          </p>
        )}

        {entries.map(([key, content]) => (
          <div
            key={key}
            className={[
              'px-4 py-3 border-b border-border last:border-b-0 transition-colors',
              pulsingKeys?.has(key) ? 'field-pulse' : '',
            ].join(' ')}
          >
            <p className="text-xs font-mono uppercase tracking-wide text-text-secondary mb-1.5">
              {labelFor(key)}
            </p>
            <pre className="whitespace-pre-wrap font-mono text-xs text-text leading-relaxed">
              {content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
