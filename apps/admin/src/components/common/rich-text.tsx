'use client';

import { cn, IconButton, Tooltip } from '@atrium/ui';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Undo2 } from 'lucide-react';
import { useEffect } from 'react';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  id?: string;
  disabled?: boolean;
  /** Compact toolbar (bold/italic/link/lists only). */
  compact?: boolean;
}

function Btn({ editor, label, onClick, active, icon }: { editor: Editor; label: string; onClick: () => void; active?: boolean; icon: React.ReactNode }) {
  return (
    <Tooltip content={label}>
      <IconButton label={label} size="xs" onClick={onClick} disabled={!editor.isEditable} className={cn(active && 'bg-surface-3 text-fg')} aria-pressed={active}>
        {icon}
      </IconButton>
    </Tooltip>
  );
}

/** TipTap rich text editor emitting HTML. */
export function RichTextEditor({ value, onChange, placeholder = 'Write something…', className, minHeight = 140, id, disabled, compact }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    editorProps: { attributes: { class: 'atrium-prose px-3 py-2', ...(id ? { id } : {}), style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(value === '' && editor.isEmpty)) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-ring', disabled && 'opacity-60', className)}>
      {editor && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-2/50 px-1 py-0.5">
          <Btn editor={editor} label="Bold" icon={<Bold />} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
          <Btn editor={editor} label="Italic" icon={<Italic />} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
          {!compact && <Btn editor={editor} label="Strikethrough" icon={<Strikethrough />} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />}
          <span className="mx-1 h-4 w-px bg-border" />
          {!compact && (
            <>
              <Btn editor={editor} label="Heading" icon={<Heading2 />} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
              <Btn editor={editor} label="Subheading" icon={<Heading3 />} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
            </>
          )}
          <Btn editor={editor} label="Bulleted list" icon={<List />} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <Btn editor={editor} label="Numbered list" icon={<ListOrdered />} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          {!compact && <Btn editor={editor} label="Quote" icon={<Quote />} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />}
          <Btn
            editor={editor}
            label="Link"
            icon={<Link2 />}
            active={editor.isActive('link')}
            onClick={() => {
              const prev = editor.getAttributes('link').href as string | undefined;
              const url = window.prompt('Link URL', prev ?? 'https://');
              if (url === null) return;
              if (url === '') editor.chain().focus().unsetLink().run();
              else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
            }}
          />
          {!compact && (
            <>
              <span className="flex-1" />
              <Btn editor={editor} label="Undo" icon={<Undo2 />} onClick={() => editor.chain().focus().undo().run()} />
              <Btn editor={editor} label="Redo" icon={<Redo2 />} onClick={() => editor.chain().focus().redo().run()} />
            </>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
