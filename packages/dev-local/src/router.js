import { useEffect, useState } from 'react';

// Hash-based routing. It needs no server rewrites (works on GitHub Pages as-is)
// and no base-path handling. Routes:
//   #/dashboard         — the project list / create / clone flow (default)
//   #/edit/<projectId>  — the editor for one project
//
// Opening a project reloads the page on purpose: a WebContainer can only boot
// once per page, so each project gets a fresh page (and fresh container).

/** @returns {{ name: 'dashboard' } | { name: 'editor', id: string }} */
export function currentRoute() {
  const path = window.location.hash.replace(/^#/, '') || '/dashboard';
  if (path.startsWith('/edit/')) {
    return {
      name: 'editor',
      id: decodeURIComponent(path.slice('/edit/'.length)),
    };
  }
  return { name: 'dashboard' };
}

/**
 * @param {string} path  e.g. '/dashboard' or `/edit/${id}`
 * @param {{ reload?: boolean }} [opts]
 */
export function navigate(path, { reload = false } = {}) {
  window.location.hash = path;
  if (reload) window.location.reload();
}

export function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}
