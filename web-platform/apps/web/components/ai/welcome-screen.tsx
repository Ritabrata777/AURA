"use client";

import { Heart, Droplet, Thermometer, Activity, Wifi, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

interface WelcomeScreenProps {
  onQuickAction: (message: string) => void;
}

const quickActions = [
  {
    icon: Heart,
    label: "How is my heart rate?",
    message: "How is my heart rate?",
    color: "text-red-300",
    chipBg: "bg-red-500/15",
  },
  {
    icon: Droplet,
    label: "How is my SpO2?",
    message: "How is my SpO2?",
    color: "text-blue-300",
    chipBg: "bg-blue-500/15",
  },
  {
    icon: Thermometer,
    label: "What's my temperature?",
    message: "What's my temperature?",
    color: "text-orange-300",
    chipBg: "bg-orange-500/15",
  },
  {
    icon: TrendingUp,
    label: "What changed recently?",
    message: "What changed in the last 2 minutes?",
    color: "text-purple-300",
    chipBg: "bg-purple-500/15",
  },
  {
    icon: Activity,
    label: "Explain my ECG",
    message: "What does my ECG show?",
    color: "text-green-300",
    chipBg: "bg-green-500/15",
  },
  {
    icon: Wifi,
    label: "Is my device connected?",
    message: "Is my device connected?",
    color: "text-white/70",
    chipBg: "bg-white/10",
  },
];

export function WelcomeScreen({ onQuickAction }: WelcomeScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center justify-center px-4 py-4"
    >
      {/* Welcome Message */}
      <div className="text-center mb-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="mb-3"
        >
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_0_25px_rgba(139,92,246,0.45)]">
            <Heart className="h-6 w-6" />
          </div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="text-xl font-semibold text-white mb-2"
        >
          Hi! I'm your Health Companion
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="text-sm text-white/50 max-w-sm"
        >
          I can help you understand your recent health readings and connected device.
        </motion.p>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="w-full space-y-2"
      >
        <p className="text-xs font-medium text-white/40 mb-3 text-center">
          You can ask me things like:
        </p>

        <div className="grid grid-cols-1 gap-2">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.message}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.05, duration: 0.2 }}
                onClick={() => onQuickAction(action.message)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${action.chipBg} ${action.color} flex-shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-white/85">{action.label}</span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Footer Note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.3 }}
        className="text-xs text-white/35 mt-4 mb-1 text-center max-w-xs"
      >
        I focus only on your health monitoring data. I can't help with coding, math, or unrelated topics.
      </motion.p>
    </motion.div>
  );
}
