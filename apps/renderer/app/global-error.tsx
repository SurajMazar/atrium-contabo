'use client';

/** Last-resort error document (e.g. the API is unreachable). Never cached. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6f3ee', color: '#24211d', font: '16px/1.6 ui-sans-serif, system-ui, sans-serif' }}>
        <main style={{ maxWidth: '30rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ font: '500 2rem/1.2 Georgia, serif' }}>Temporarily unavailable</h1>
          <p style={{ color: '#6b645b' }}>This site could not be loaded right now. Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ padding: '.75rem 1.25rem', border: 0, borderRadius: 4, background: '#24211d', color: '#fff', font: 'inherit', cursor: 'pointer' }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
