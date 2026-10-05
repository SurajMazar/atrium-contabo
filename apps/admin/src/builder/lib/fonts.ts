export interface CuratedFont {
  family: string;
  category: 'serif' | 'sans' | 'display' | 'mono' | 'script';
  weights: number[];
  fallback: string;
}

const serif = 'Georgia, "Times New Roman", serif';
const sans = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Curated Google Fonts that hold up in production (good hinting, full weights). */
export const CURATED_FONTS: CuratedFont[] = [
  { family: 'Inter', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Manrope', category: 'sans', weights: [300, 400, 500, 600, 700, 800], fallback: sans },
  { family: 'DM Sans', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Plus Jakarta Sans', category: 'sans', weights: [300, 400, 500, 600, 700, 800], fallback: sans },
  { family: 'Work Sans', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Outfit', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Figtree', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Karla', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Jost', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Lato', category: 'sans', weights: [300, 400, 700, 900], fallback: sans },
  { family: 'Montserrat', category: 'sans', weights: [300, 400, 500, 600, 700, 800], fallback: sans },
  { family: 'Poppins', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Raleway', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Nunito Sans', category: 'sans', weights: [300, 400, 600, 700, 800], fallback: sans },
  { family: 'Space Grotesk', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Sora', category: 'sans', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Archivo', category: 'sans', weights: [300, 400, 500, 600, 700, 800], fallback: sans },
  { family: 'Cormorant Garamond', category: 'serif', weights: [300, 400, 500, 600, 700], fallback: serif },
  { family: 'Cormorant', category: 'serif', weights: [300, 400, 500, 600, 700], fallback: serif },
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800], fallback: serif },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700], fallback: serif },
  { family: 'EB Garamond', category: 'serif', weights: [400, 500, 600, 700], fallback: serif },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], fallback: serif },
  { family: 'Fraunces', category: 'serif', weights: [300, 400, 500, 600, 700], fallback: serif },
  { family: 'DM Serif Display', category: 'serif', weights: [400], fallback: serif },
  { family: 'Bodoni Moda', category: 'serif', weights: [400, 500, 600, 700], fallback: serif },
  { family: 'Marcellus', category: 'serif', weights: [400], fallback: serif },
  { family: 'Crimson Pro', category: 'serif', weights: [300, 400, 500, 600, 700], fallback: serif },
  { family: 'Newsreader', category: 'serif', weights: [300, 400, 500, 600, 700], fallback: serif },
  { family: 'Source Serif 4', category: 'serif', weights: [300, 400, 600, 700], fallback: serif },
  { family: 'Merriweather', category: 'serif', weights: [300, 400, 700, 900], fallback: serif },
  { family: 'Italiana', category: 'display', weights: [400], fallback: serif },
  { family: 'Syne', category: 'display', weights: [400, 500, 600, 700, 800], fallback: sans },
  { family: 'Bebas Neue', category: 'display', weights: [400], fallback: sans },
  { family: 'Oswald', category: 'display', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Unbounded', category: 'display', weights: [300, 400, 500, 600, 700], fallback: sans },
  { family: 'Great Vibes', category: 'script', weights: [400], fallback: 'cursive' },
  { family: 'Pinyon Script', category: 'script', weights: [400], fallback: 'cursive' },
  { family: 'JetBrains Mono', category: 'mono', weights: [400, 500, 700], fallback: 'ui-monospace, monospace' },
  { family: 'IBM Plex Mono', category: 'mono', weights: [400, 500, 600], fallback: 'ui-monospace, monospace' },
];

export function fontPreviewUrl(families: string[]): string {
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`).join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap&text=AaBbGgRr0123`;
}
