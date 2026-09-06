"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { MessageCircleHeart, X } from "lucide-react";
import { HealthCompanionChat } from "./health-companion-chat";
import { useHealthCompanion } from "@/lib/hooks/use-health-companion";
import { InnerGlow } from "../kiosk";

interface HealthCompanionBubbleProps {
  /** Device online status for live indicator */
  deviceOnline?: boolean;
}

export function HealthCompanionBubble({ deviceOnline = false }: HealthCompanionBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const { isAvailable } = useHealthCompanion();

  useEffect(() => {
    // Respect user's motion preferences
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Don't render if not available for this user type
  if (!isAvailable) {
    return null;
  }

  // Pop physicists: the bubble springs in, the panel springs out of the
  // bubble's corner and sinks back into it on close.
  const bubbleVariants: Variants = {
    hidden: { scale: 0, opacity: 0 },
    closed: {
      scale: 1,
      opacity: 1,
      transition: prefersReducedMotion
        ? { duration: 0 }
        : { type: "spring", stiffness: 500, damping: 22 },
    },
    open: {
      scale: 0,
      opacity: 0,
      transition: prefersReducedMotion
        ? { duration: 0 }
        : { duration: 0.15, ease: "easeIn" },
    },
  };

  const panelVariants: Variants = {
    hidden: { scale: 0.4, opacity: 0, y: 80 },
    visible: {
      scale: 1,
      opacity: 1,
      y: 0,
      transition: prefersReducedMotion
        ? { duration: 0 }
        : { type: "spring", stiffness: 380, damping: 28 },
    },
    exit: {
      scale: 0.25,
      opacity: 0,
      y: 100,
      transition: prefersReducedMotion
        ? { duration: 0 }
        : { duration: 0.22, ease: "easeIn" },
    },
  };

  return (
    <>
      {/* Bubble and panel share one AnimatePresence in wait mode, so the
          panel fully sinks into the bubble before the bubble pops back in. */}
      <AnimatePresence mode="wait">
        {!isOpen && (
          <motion.button
            key="companion-bubble"
            variants={bubbleVariants}
            initial="hidden"
            animate="closed"
            exit="open"
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_0_25px_rgba(139,92,246,0.45)] hover:shadow-[0_0_35px_rgba(139,92,246,0.6)] hover:from-violet-400 hover:to-purple-500 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-violet-500/50"
            aria-label="Open Health Companion"
          >
            <div className="relative">
              <MessageCircleHeart className="h-7 w-7" />
              {/* Live status indicator */}
              {deviceOnline && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-white"></span>
                </span>
              )}
            </div>
          </motion.button>
        )}
        {isOpen && (
          <motion.div
            key="companion-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed bottom-6 right-6 z-50 flex flex-col rounded-3xl border border-white/15 bg-[#16161f]/85 shadow-2xl backdrop-blur-xl overflow-hidden"
            style={{
              width: "min(420px, calc(100vw - 3rem))",
              height: "min(680px, calc(100vh - 3rem))",
              // Collapse toward the bubble's corner so close reads as
              // "sinking into the bubble" and open as "popping out of it".
              transformOrigin: "bottom right",
            }}
          >
            <InnerGlow />
            {/* Chat Header */}
            <div className="relative flex items-center justify-between px-5 py-4 border-b border-white/10 bg-gradient-to-r from-violet-500/20 to-purple-500/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]">
                  <MessageCircleHeart className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Health Companion</h3>
                  <p className="text-xs text-white/50">AI-powered health assistant</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label="Close chat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Chat Content */}
            <HealthCompanionChat deviceOnline={deviceOnline} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
