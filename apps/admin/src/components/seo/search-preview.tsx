import { Globe } from 'lucide-react';

/** Applies a title template: `%s` → page title, `{site}` → site title. */
export function applyTitleTemplate(template: string, pageTitle: string, siteTitle: string): string {
  const t = template.trim() || '%s';
  return t.replaceAll('%s', pageTitle).replaceAll('{site}', siteTitle || 'Site');
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Google-style search result preview (approximate truncation by characters). */
export function SearchPreview({ title, description, url, siteName, favicon }: { title: string; description: string; url: string; siteName: string; favicon?: string }) {
  let host = url;
  let path = '';
  try {
    const u = new URL(url);
    host = u.host;
    path = u.pathname.replace(/\/$/, '');
  } catch {
    /* show as-is */
  }
  const crumbs = path.split('/').filter(Boolean);
  return (
    <div className="rounded-lg border border-border bg-surface p-4" aria-label="Search result preview">
      <div className="mb-3 text-2xs font-medium uppercase tracking-wide text-fg-subtle">Search preview</div>
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 text-fg-subtle">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={favicon} alt="" className="size-4 object-contain" />
          ) : (
            <Globe className="size-3.5" strokeWidth={1.5} />
          )}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm text-fg">{siteName || host}</div>
          <div className="truncate text-xs text-fg-muted">
            https://{host}
            {crumbs.map((c) => (
              <span key={c}> › {c}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 line-clamp-1 text-base leading-6 text-accent">{truncate(title || 'Untitled page', 62)}</div>
      <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-fg-muted">{description ? truncate(description, 160) : <span className="italic text-fg-subtle">Search engines will pick a snippet from the page content.</span>}</p>
    </div>
  );
}
