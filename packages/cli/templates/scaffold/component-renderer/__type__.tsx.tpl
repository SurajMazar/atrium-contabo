import type { ReactNode } from 'react';

/**
 * React renderer for the "{{type}}" component (scaffolded by `atrium new-component`).
 * Receives props already parsed by the registry definition, so defaults are applied.
 * Keep it server-renderable (no hooks/browser APIs) — interactive parts belong in islands.
 * Style with theme tokens (CSS custom properties) so every site theme applies.
 */
export interface {{Pascal}}Props {
  heading?: string;
  eyebrow?: string;
  subheading?: string;
  items: Array<{ title: string; text?: string }>;
}

export interface {{Pascal}}RendererProps {
  nodeId: string;
  variant?: string;
  props: {{Pascal}}Props;
  children?: ReactNode;
}

export function {{Pascal}}Renderer({ nodeId, variant = 'default', props }: {{Pascal}}RendererProps) {
  const Tag = '{{level}}' === 'section' ? 'section' : 'div';
  return (
    <Tag data-node-id={nodeId} data-component="{{type}}" data-variant={variant} className={`atrium-{{type}} atrium-{{type}}--${variant}`}>
      {props.eyebrow ? <p className="atrium-eyebrow">{props.eyebrow}</p> : null}
      {props.heading ? <h2 className="atrium-heading">{props.heading}</h2> : null}
      {props.subheading ? <p className="atrium-subheading">{props.subheading}</p> : null}
      <ul className="atrium-{{type}}__items">
        {props.items.map((item, i) => (
          <li key={i} className="atrium-{{type}}__item">
            <h3>{item.title}</h3>
            {item.text ? <p>{item.text}</p> : null}
          </li>
        ))}
      </ul>
    </Tag>
  );
}
