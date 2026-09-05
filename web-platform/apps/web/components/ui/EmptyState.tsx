"use client";

import { LucideIcon } from "lucide-react";
import { glassCard, InnerGlow } from "../kiosk";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={`${glassCard} p-12 text-center`}>
      <InnerGlow />
      <Icon className="relative h-12 w-12 text-white/30 mx-auto mb-4" />
      <h3 className="relative text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="relative text-sm text-white/50 mb-6 max-w-md mx-auto">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="relative px-5 py-2.5 bg-violet-500 text-white rounded-xl hover:bg-violet-400 transition-colors font-medium text-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
