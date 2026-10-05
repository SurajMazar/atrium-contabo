/** Update a query param without a navigation (keeps tab/item deep links shareable). */
export function setUrlParam(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* ignore */
  }
}
