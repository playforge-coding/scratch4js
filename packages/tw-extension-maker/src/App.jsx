import { Suspense, lazy, useEffect, useState } from 'react';

import { getProject } from './db.js';
import { navigate, useRoute } from './router.js';
import { Dashboard } from './routes/Dashboard.jsx';

// The editor pulls in Monaco + scratch-vm + scratch-blocks (heavy); load it only
// when actually editing, so the dashboard stays light.
const Editor = lazy(() =>
  import('./routes/Editor.jsx').then((m) => ({ default: m.Editor })),
);

function Splash({ text }) {
  return (
    <div className="grid h-full place-items-center bg-surface-0 text-sm text-fg-subtle">
      {text}
    </div>
  );
}

function EditorLoader({ id }) {
  // undefined = loading, null = not found
  const [record, setRecord] = useState(undefined);

  useEffect(() => {
    let alive = true;
    getProject(id).then((r) => alive && setRecord(r ?? null));
    return () => {
      alive = false;
    };
  }, [id]);

  if (record === undefined) return <Splash text="Loading project…" />;
  if (record === null) {
    navigate('/dashboard');
    return <Splash text="Project not found." />;
  }
  return (
    <Suspense fallback={<Splash text="Loading editor…" />}>
      <Editor record={record} />
    </Suspense>
  );
}

export function App() {
  const route = useRoute();

  // Normalize the default URL to the dashboard hash.
  useEffect(() => {
    if (!window.location.hash) window.location.hash = '/dashboard';
  }, []);

  if (route.name === 'editor') return <EditorLoader id={route.id} />;
  return <Dashboard />;
}
