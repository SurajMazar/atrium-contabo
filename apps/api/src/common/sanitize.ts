import { walkNodes, type Node, type WebsiteDefinition } from '@atrium/schema';
import sanitizeHtml from 'sanitize-html';
import { RICH_TEXT_OPTIONS } from '../modules/collections/collections.service';

const EMBED_OPTIONS: sanitizeHtml.IOptions = {
  ...RICH_TEXT_OPTIONS,
  allowedTags: [...(RICH_TEXT_OPTIONS.allowedTags as string[]), 'iframe', 'div', 'section'],
  allowedAttributes: { ...(RICH_TEXT_OPTIONS.allowedAttributes as Record<string, string[]>), iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'loading', 'title', 'frameborder', 'referrerpolicy'], div: ['class', 'style'], section: ['class'] },
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'www.google.com', 'maps.google.com', 'open.spotify.com', 'w.soundcloud.com', 'calendly.com', 'www.openstreetmap.org', 'docs.google.com', 'airtable.com', 'forms.office.com'],
};

/** Sanitize HTML-bearing props in place (rich text, embeds). Called on every write path. */
export function sanitizeNodes(nodes: Node[]) {
  walkNodes(nodes, (n) => {
    if (typeof n.props.html === 'string') n.props.html = sanitizeHtml(n.props.html, n.type === 'embed' ? EMBED_OPTIONS : RICH_TEXT_OPTIONS);
  });
}

export function sanitizeDefinition(def: WebsiteDefinition) {
  def.pages.forEach((p) => sanitizeNodes(p.sections));
  sanitizeNodes([def.header, def.footer]);
  def.globalSections.forEach((g) => sanitizeNodes([g.node]));
}
