'use client';

import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Heading4, Italic, Link2, List, ListOrdered, Quote, Unlink } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { ControlProps } from './types';

function ToolButton({ on, label, onClick, children, disabled }: { on?: boolean; label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('flex size-6 items-center justify-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30 [&_svg]:size-3.5', on && 'bg-accent-soft text-accent')}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      h4: e.isActive('heading', { level: 4 }),
      ul: e.isActive('bulletList'),
      ol: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
    }),
  });
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', prev ?? 'https://');
    if (url === null) return;
    if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  return (
    <div className="flex flex-wrap items-center gap-px border-b border-border px-1 py-0.5">
      <ToolButton label="Bold" on={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></ToolButton>
      <ToolButton label="Italic" on={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></ToolButton>
      <ToolButton label={s.link ? 'Edit link' : 'Add link'} on={s.link} onClick={setLink}><Link2 /></ToolButton>
      {s.link && <ToolButton label="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}><Unlink /></ToolButton>}
      <span className="mx-0.5 h-4 w-px bg-border" />
      <ToolButton label="Heading 2" on={s.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 /></ToolButton>
      <ToolButton label="Heading 3" on={s.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 /></ToolButton>
      <ToolButton label="Heading 4" on={s.h4} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}><Heading4 /></ToolButton>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <ToolButton label="Bulleted list" on={s.ul} onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></ToolButton>
      <ToolButton label="Numbered list" on={s.ol} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolButton>
      <ToolButton label="Quote" on={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote /></ToolButton>
    </div>
  );
}

/** TipTap editor producing sanitized-by-schema HTML (headings h2–h4, lists, links, emphasis, quotes). */
export function RichTextControl({ value, onChange, disabled, control }: ControlProps<string | undefined>) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, codeBlock: false, code: false, horizontalRule: false, link: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } }),
      Placeholder.configure({ placeholder: control.placeholder ?? 'Start writing…' }),
    ],
    content: value ?? '',
    editorProps: { attributes: { class: 'atrium-prose min-h-28 px-2.5 py-2 text-[13px] leading-5 outline-none' } },
    onUpdate: ({ editor: e }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(e.isEmpty ? undefined : e.getHTML(), { mergeKey: `rich:${control.name}` }), 250);
    },
    onBlur: ({ editor: e }) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        latest.current(e.isEmpty ? undefined : e.getHTML(), { mergeKey: `rich:${control.name}` });
      }
    },
  });

  // External changes (undo/redo, AI rewrite) flow back in when the editor is not being typed in.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if ((value ?? '') !== editor.getHTML()) editor.commands.setContent(value ?? '', { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-ring', disabled && 'opacity-60')}>
      {editor && !disabled && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
