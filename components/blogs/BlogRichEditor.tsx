"use client";

import { useCallback, useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";

type BlogRichEditorProps = {
  blogId: string;
  initialJson?: Record<string, unknown> | null;
  initialHtml?: string;
  onChange: (payload: {
    html: string;
    json: Record<string, unknown>;
  }) => void;
};

const AlignedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-align": {
        default: "center",
        parseHTML: (element) =>
          element.getAttribute("data-align") ||
          element.style.textAlign ||
          "center",
        renderHTML: (attributes) => {
          const align = attributes["data-align"] || "center";
          return {
            "data-align": align,
            style: `display:block;margin:${
              align === "left"
                ? "0 auto 0 0"
                : align === "right"
                  ? "0 0 0 auto"
                  : "0 auto"
            };max-width:100%;height:auto;`,
          };
        },
      },
    };
  },
});

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`blog-toolbar-btn ${active ? "active" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function BlogRichEditor({
  blogId,
  initialJson,
  initialHtml,
  onChange,
}: BlogRichEditorProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      AlignedImage.configure({ allowBase64: false }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      Placeholder.configure({
        placeholder: "Write the post body… Select text for the inline style menu.",
      }),
    ],
    content:
      initialJson && Object.keys(initialJson).length > 0
        ? initialJson
        : initialHtml || "<p></p>",
    onUpdate: ({ editor: current }) => {
      onChange({
        html: current.getHTML(),
        json: current.getJSON() as Record<string, unknown>,
      });
    },
    editorProps: {
      attributes: {
        class: "blog-prose",
        spellcheck: "true",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (initialJson && Object.keys(initialJson).length > 0) {
      const current = JSON.stringify(editor.getJSON());
      const next = JSON.stringify(initialJson);
      if (current !== next) {
        editor.commands.setContent(initialJson);
      }
    }
    // Only hydrate once when editor mounts with server content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const uploadInlineImage = useCallback(
    async (file: File) => {
      if (!editor || uploading.current) return;
      uploading.current = true;
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", "inline");
        form.append("blog_id", blogId);
        const response = await fetch("/api/blogs/upload", {
          method: "POST",
          body: form,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error ?? "Upload failed");
        }
        editor
          .chain()
          .focus()
          .setImage({
            src: payload.url,
            alt: file.name.replace(/\.[^.]+$/, ""),
            "data-align": "center",
          } as never)
          .run();
      } finally {
        uploading.current = false;
      }
    },
    [blogId, editor],
  );

  if (!editor) {
    return <div className="empty-state">Loading editor…</div>;
  }

  return (
    <div className="blog-editor-shell">
      <div className="blog-block-toolbar" role="toolbar" aria-label="Block formatting">
        <ToolbarButton
          title="Paragraph"
          active={editor.isActive("paragraph")}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          P
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <span className="blog-toolbar-sep" />
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          title="Ordered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </ToolbarButton>
        <span className="blog-toolbar-sep" />
        <ToolbarButton
          title="Insert image"
          onClick={() => fileInput.current?.click()}
        >
          Image
        </ToolbarButton>
        <ToolbarButton
          title="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          Undo
        </ToolbarButton>
        <ToolbarButton
          title="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          Redo
        </ToolbarButton>
      </div>

      <BubbleMenu
        editor={editor}
        className="blog-bubble-menu"
        options={{ placement: "top" }}
      >
        <ToolbarButton
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          U
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          active={editor.isActive("link")}
          onClick={() => {
            const previous = editor.getAttributes("link").href as string | undefined;
            const href = window.prompt("Link URL", previous || "https://");
            if (href === null) return;
            if (!href.trim()) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: href.trim() })
              .run();
          }}
        >
          Link
        </ToolbarButton>
        <span className="blog-toolbar-sep" />
        <ToolbarButton
          title="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          L
        </ToolbarButton>
        <ToolbarButton
          title="Align center"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          C
        </ToolbarButton>
        <ToolbarButton
          title="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          R
        </ToolbarButton>
        <ToolbarButton
          title="Justify"
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          J
        </ToolbarButton>
        {editor.isActive("image") && (
          <>
            <span className="blog-toolbar-sep" />
            <ToolbarButton
              title="Image left"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { "data-align": "left" })
                  .run()
              }
            >
              Img L
            </ToolbarButton>
            <ToolbarButton
              title="Image center"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { "data-align": "center" })
                  .run()
              }
            >
              Img C
            </ToolbarButton>
            <ToolbarButton
              title="Image right"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { "data-align": "right" })
                  .run()
              }
            >
              Img R
            </ToolbarButton>
          </>
        )}
        <ToolbarButton
          title="Clear formatting"
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
        >
          Clear
        </ToolbarButton>
      </BubbleMenu>

      <EditorContent editor={editor} className="blog-editor-content" />
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".jpg,.jpeg,.png,.webp,.gif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadInlineImage(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
