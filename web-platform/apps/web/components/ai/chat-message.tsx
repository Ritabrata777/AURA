"use client";

import { Fragment, type ReactNode } from "react";
import { MessageCircleHeart, User } from "lucide-react";
import { motion } from "framer-motion";

interface ChatMessageProps {
  message: {
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  };
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
          isUser
            ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]"
            : "bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <MessageCircleHeart className="h-4 w-4" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[75%]`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm ${
            isUser
              ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)]"
              : "border border-white/10 bg-white/10 text-white/90"
          }`}
        >
          <div className="break-words">
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              renderMarkdown(message.content)
            )}
          </div>
        </div>
        
        {message.timestamp && (
          <span className="text-xs text-white/35 mt-1 px-1">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Minimal markdown renderer for assistant replies (Gemini returns markdown).
 * Supports **bold**, `code`, bullet and numbered lists, and paragraphs.
 * Deliberately dependency-free and text-only — no raw HTML is ever injected.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-i${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-black/40 px-1 py-0.5 font-mono text-[12px] text-violet-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function renderMarkdown(content: string): ReactNode {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[][] | null = null;
  let listOrdered = false;

  const flushList = () => {
    if (!listItems || listItems.length === 0) {
      listItems = null;
      return;
    }
    const items = listItems;
    const key = `list-${blocks.length}`;
    listItems = null;
    blocks.push(
      listOrdered ? (
        <ol key={key} className="my-1 list-decimal space-y-1 pl-5">
          {items.map((item, i) => (
            <li key={`${key}-${i}`}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="my-1 list-disc space-y-1 pl-5">
          {items.map((item, i) => (
            <li key={`${key}-${i}`}>{item}</li>
          ))}
        </ul>
      ),
    );
  };

  lines.forEach((line, index) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      const text = (bullet?.[1] ?? ordered?.[1] ?? "").trim();
      const isOrdered = Boolean(ordered);
      if (!listItems || listOrdered !== isOrdered) {
        flushList();
        listItems = [];
        listOrdered = isOrdered;
      }
      listItems.push(renderInline(text, `l${index}`));
      return;
    }
    flushList();
    if (line.trim() === "") return; // blank line = paragraph gap via spacing
    blocks.push(
      <p key={`p-${index}`} className="my-1 first:mt-0 last:mb-0">
        {renderInline(line, `p${index}`)}
      </p>,
    );
  });
  flushList();

  return <div className="space-y-1">{blocks}</div>;
}
