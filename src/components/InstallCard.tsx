import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isWebKit = /webkit/i.test(ua);
  const isCriOS = /crios|fxios|edgios/i.test(ua);
  return isIos && isWebKit && !isCriOS;
}

export function InstallCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (standalone || dismissed) return null;

  if (deferredPrompt) {
    return (
      <div className="card install-card p-3 mb-3">
        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Install Arcade Hub</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Add it to your home screen for a full-screen app shell, offline cache, and faster relaunches.
        </div>
        <div className="flex gap-2 mt-3">
          <button
            className="pressable px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
            onClick={async () => {
              await deferredPrompt.prompt();
              await deferredPrompt.userChoice.catch(() => undefined);
              setDeferredPrompt(null);
            }}
          >
            Install
          </button>
          <button
            className="pressable px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
            onClick={() => setDismissed(true)}
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (isIosSafari()) {
    return (
      <div className="card install-card p-3 mb-3">
        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Add To iPhone</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          In Safari, tap Share and then Add to Home Screen to install the app on your iPhone.
        </div>
        <button
          className="pressable px-3 py-2 rounded-lg text-xs font-semibold mt-3"
          style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
          onClick={() => setDismissed(true)}
        >
          Hide
        </button>
      </div>
    );
  }

  return null;
}
