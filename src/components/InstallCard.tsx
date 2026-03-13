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

/**
 * Floating install banner — fixed to the bottom of the viewport so it
 * never interrupts the game grid. Uses safe-area-inset-bottom so it clears
 * the home indicator on iPhones.
 */
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
  if (!deferredPrompt && !isIosSafari()) return null;

  const isIos = !deferredPrompt && isIosSafari();

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)',
        zIndex: 60,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--card-border)',
        borderRadius: 14,
        boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: 22, flexShrink: 0 }}>📲</span>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {isIos ? 'Add to iPhone' : 'Install Arcade Hub'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isIos
            ? 'Tap Share → Add to Home Screen'
            : 'Full-screen, offline, faster'}
        </div>
      </div>

      {/* Install / action button */}
      {!isIos && (
        <button
          style={{
            flexShrink: 0,
            padding: '6px 14px',
            borderRadius: 8,
            background: 'var(--accent-blue)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={async () => {
            if (!deferredPrompt) return;
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice.catch(() => undefined);
            setDeferredPrompt(null);
          }}
        >
          Install
        </button>
      )}

      {/* Dismiss */}
      <button
        aria-label="Dismiss install banner"
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--bg-primary)',
          border: '1px solid var(--card-border)',
          color: 'var(--text-muted)',
          fontSize: 14,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={() => setDismissed(true)}
      >
        ✕
      </button>
    </div>
  );
}
