'use client';

import { safeHref, sanitizeUrl } from '@atrium/schema';
import { useState } from 'react';

export interface MapFacadeProps {
  embedUrl: string;
  title: string;
  height?: 'sm' | 'md' | 'lg';
  rounded?: string;
  /** Show the placeholder until clicked (no third-party requests before consent). */
  facade?: boolean;
  facadeImage?: { src: string; alt?: string };
  openUrl?: string;
  address?: string;
  editor?: boolean;
}

/** Click-to-load map: a lightweight placeholder that swaps to the provider iframe on demand. */
export function MapFacade({ embedUrl, title, height = 'md', rounded = 'sm', facade = true, facadeImage, openUrl, address, editor }: MapFacadeProps) {
  const [loaded, setLoaded] = useState(!facade && !editor);
  return (
    <div className={`a-map a-map--${height} a-r-${rounded}`}>
      {loaded ? (
        <iframe className="a-map__frame" src={sanitizeUrl(embedUrl, 'https')} title={title} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      ) : (
        <div className="a-map__facade">
          {facadeImage?.src ? <img src={facadeImage.src} alt={facadeImage.alt ?? ''} className="a-map__img" loading="lazy" decoding="async" /> : <div className="a-map__pattern" aria-hidden="true" />}
          <div className="a-map__card">
            <svg className="a-map__pin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {address ? <p className="a-map__address">{address}</p> : null}
            <div className="a-map__actions">
              <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={() => !editor && setLoaded(true)}>
                Load map
              </button>
              {openUrl ? (
                <a className="a-btn a-btn--link a-btn--sm" href={safeHref(openUrl)} target="_blank" rel="noopener noreferrer">
                  Open in Maps
                </a>
              ) : null}
            </div>
            <p className="a-map__note">Loads content from a third-party map provider.</p>
          </div>
        </div>
      )}
    </div>
  );
}
