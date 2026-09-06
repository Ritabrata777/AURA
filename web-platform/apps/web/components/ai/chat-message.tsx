"use client";

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
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
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
