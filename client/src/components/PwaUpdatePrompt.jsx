import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/* Update detection for the PWA.
 * registerType is 'prompt' (see vite.config.js): when a new deployment is
 * published, the waiting service worker triggers onNeedRefresh and this
 * component shows a dismissible banner. "Refresh now" swaps in the new
 * service worker and reloads the page. onOfflineReady is informational only —
 * it means the app shell is cached, NOT that labour/attendance data is
 * available offline (API responses are never cached). */
export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState(() => () => {});

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh: () => setNeedRefresh(true),
      onOfflineReady: () => {
        setOfflineReady(true);
        // the offline-ready note is informational — fade it out on its own
        setTimeout(() => setOfflineReady(false), 6000);
      },
    });
    setUpdateServiceWorker(() => update);
  }, []);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="pwa-banner" role="status">
      <span className="pwa-banner-text">
        {needRefresh
          ? '🔄 A new version of Labour Manager is available.'
          : '✓ App ready to work offline.'}
      </span>
      <div className="pwa-banner-actions">
        {needRefresh && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => updateServiceWorker(true)}
          >
            Refresh now
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
