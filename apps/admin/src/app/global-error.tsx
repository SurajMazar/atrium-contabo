'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f7f7f5', color: '#1b1b19', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <p style={{ fontSize: 12, color: '#8c8b84', fontFamily: 'monospace' }}>500</p>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: '8px 0' }}>Atrium hit an unexpected error</h1>
          <p style={{ fontSize: 13, color: '#5f5e58' }}>{error.digest ? `Reference ${error.digest}` : 'Please try again.'}</p>
          <button type="button" onClick={reset} style={{ marginTop: 12, height: 32, padding: '0 12px', borderRadius: 6, border: 0, background: '#2b4fd8', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
