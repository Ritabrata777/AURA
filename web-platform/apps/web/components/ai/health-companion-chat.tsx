"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Trash2 } from "lucide-react";
import { useHealthCompanion } from "@/lib/hooks/use-health-companion";
import { WelcomeScreen } from "./welcome-screen";
import { LiveDataStatus } from "./live-data-status";
import { ChatMessage } from "./chat-message";

interface HealthCompanionChatProps {
  deviceOnline?: boolean;
}

export function HealthCompanionChat({ deviceOnline = false }: HealthCompanionChatProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    isLoading,
    isFirstTime,
    healthContext,
    sendMessage,
    clearConversation,
  } = useHealthCompanion();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue.trim();
    setInputValue("");

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Live Data Status */}
      <LiveDataStatus deviceOnline={deviceOnline} healthContext={healthContext} />

      {/* Messages Container */}
      <div className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {isFirstTime && messages.length === 0 ? (
          <WelcomeScreen onQuickAction={sendMessage} />
        ) : (
          <>
            {messages.map((msg, index) => (
              <ChatMessage key={index} message={msg} />
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30 flex-shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="flex items-center gap-1 border border-white/10 bg-white/10 rounded-2xl px-4 py-3">
                  <span className="h-2 w-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="h-2 w-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="h-2 w-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="relative border-t border-white/10 bg-black/30 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your health readings..."
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{ minHeight: "42px" }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.35)] hover:bg-violet-500 disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50 flex-shrink-0"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-white/35">
            Press Enter to send, Shift+Enter for new line
          </p>
          {messages.length > 0 && (
            <button
              onClick={clearConversation}
              disabled={isLoading}
              className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-red-400 disabled:opacity-50 transition-colors"
              aria-label="Clear conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
