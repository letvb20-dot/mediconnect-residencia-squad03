import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'

export function RichTextEditor({ onChange, value }) {
  const lastSyncedHtmlRef = useRef(value || '')
  const applyingExternalContentRef = useRef(false)
  const tiptapEditor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'report-rich-surface min-h-[560px] px-4 py-3 text-sm leading-6 text-[#e5e5e5] outline-none',
      },
    },
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: currentEditor }) => {
      if (applyingExternalContentRef.current) return

      const nextHtml = currentEditor.getHTML()
      lastSyncedHtmlRef.current = nextHtml
      onChange(nextHtml)
    },
  })

  useEffect(() => {
    if (!tiptapEditor) return

    const nextValue = value || ''
    if (lastSyncedHtmlRef.current === nextValue) return

    if (tiptapEditor.getHTML() === nextValue) {
      lastSyncedHtmlRef.current = nextValue
      return
    }

    applyingExternalContentRef.current = true
    try {
      tiptapEditor.commands.setContent(nextValue, { emitUpdate: false })
    } finally {
      applyingExternalContentRef.current = false
    }
    lastSyncedHtmlRef.current = nextValue
  }, [tiptapEditor, value])

  const blockFormat = tiptapEditor?.isActive('heading', { level: 2 })
    ? 'h2'
    : tiptapEditor?.isActive('heading', { level: 3 })
      ? 'h3'
      : 'p'

  return (
    <div className="report-rich-editor overflow-hidden rounded-sm border border-[#404040] bg-[#171717]">
      <div className="report-rich-toolbar flex flex-wrap items-center gap-1 border-b border-[#404040] bg-[#202020] px-3 py-2">
        <ToolbarButton disabled={!tiptapEditor?.can().undo()} label="Desfazer" name="undo" onClick={() => tiptapEditor?.chain().focus().undo().run()} />
        <ToolbarButton disabled={!tiptapEditor?.can().redo()} label="Refazer" name="redo" onClick={() => tiptapEditor?.chain().focus().redo().run()} />
        <span className="mx-1 h-5 w-px bg-[#404040]" />
        <select
          className="h-8 rounded-sm border border-[#404040] bg-[#171717] px-2 text-xs font-semibold text-[#d4d4d4]"
          onChange={(event) => {
            const selected = event.target.value

            if (selected === 'h2') {
              tiptapEditor?.chain().focus().toggleHeading({ level: 2 }).run()
              return
            }

            if (selected === 'h3') {
              tiptapEditor?.chain().focus().toggleHeading({ level: 3 }).run()
              return
            }

            tiptapEditor?.chain().focus().setParagraph().run()
          }}
          value={blockFormat}
        >
          <option value="p">Padrao</option>
          <option value="h2">Titulo</option>
          <option value="h3">Subtitulo</option>
        </select>
        <ToolbarButton active={tiptapEditor?.isActive('bold')} label="Negrito" name="bold" onClick={() => tiptapEditor?.chain().focus().toggleBold().run()} />
        <ToolbarButton active={tiptapEditor?.isActive('italic')} label="Italico" name="italic" onClick={() => tiptapEditor?.chain().focus().toggleItalic().run()} />
        <ToolbarButton active={tiptapEditor?.isActive('underline')} label="Sublinhado" name="underline" onClick={() => tiptapEditor?.chain().focus().toggleUnderline().run()} />
        <ToolbarButton active={tiptapEditor?.isActive('strike')} label="Tachado" name="strike" onClick={() => tiptapEditor?.chain().focus().toggleStrike().run()} />
        <span className="mx-1 h-5 w-px bg-[#404040]" />
        <ToolbarButton active={tiptapEditor?.isActive({ textAlign: 'left' })} label="Alinhar a esquerda" name="align-left" onClick={() => tiptapEditor?.chain().focus().setTextAlign('left').run()} />
        <ToolbarButton active={tiptapEditor?.isActive({ textAlign: 'center' })} label="Centralizar" name="align-center" onClick={() => tiptapEditor?.chain().focus().setTextAlign('center').run()} />
        <ToolbarButton active={tiptapEditor?.isActive({ textAlign: 'right' })} label="Alinhar a direita" name="align-right" onClick={() => tiptapEditor?.chain().focus().setTextAlign('right').run()} />
        <ToolbarButton active={tiptapEditor?.isActive('bulletList')} label="Lista" name="list" onClick={() => tiptapEditor?.chain().focus().toggleBulletList().run()} />
      </div>
      <EditorContent editor={tiptapEditor} />
    </div>
  )
}

function ToolbarButton({ active = false, disabled = false, label, name, onClick }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`grid size-8 place-items-center rounded-sm transition ${
        active ? 'bg-[#3b82f6]/20 text-[#3b82f6]' : 'text-[#a3a3a3] hover:bg-[#303030] hover:text-[#e5e5e5]'
      } disabled:cursor-not-allowed disabled:opacity-40`}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={label}
      type="button"
    >
      <RichTextIcon className="size-4" name={name} />
    </button>
  )
}

function RichTextIcon({ className = 'size-4', name }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
  }

  const icons = {
    undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-1" />,
    redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h1" />,
    bold: <path d="M7 5h6a4 4 0 0 1 0 8H7zM7 13h7a4 4 0 0 1 0 8H7z" />,
    italic: <path d="M19 4h-9M14 20H5M15 4 9 20" />,
    underline: <path d="M6 4v6a6 6 0 0 0 12 0V4M4 21h16" />,
    strike: <path d="M5 12h14M16 6a4 4 0 0 0-4-2c-2 0-4 1-4 3 0 4 8 2 8 7 0 2-2 4-5 4-2 0-4-1-5-3" />,
    'align-left': <path d="M4 6h16M4 12h10M4 18h16" />,
    'align-center': <path d="M4 6h16M7 12h10M4 18h16" />,
    'align-right': <path d="M4 6h16M10 12h10M4 18h16" />,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  }

  return <svg {...common}>{icons[name] || icons.list}</svg>
}
