"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface HealthContext {
  timeWindow: string;
  heartRate: {
    current: number | null;
    minimum: number | null;
    maximum: number | null;
    average: number | null;
    trend: string;
  };
  spo2: {
    current: number | null;
    minimum: number | null;
    maximum: number | null;
    average: number | null;
    trend: string;
  };
  temperature: {
    current: number | null;
    minimum: number | null;
    maximum: number | null;
    average: number | null;
    trend: string;
  };
  ecg: {
    available: boolean;
    recording: boolean;
    lastSessionAt: string | null;
  };
  device: {
    online: boolean;
    lastSeen: string | null;
    deviceId: string | null;
  };
}

const STORAGE_KEY = "health-companion-messages";
const FIRST_TIME_KEY = "health-companion-first-time";

export function useHealthCompanion() {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(true);
  const [healthContext, setHealthContext] = useState<HealthContext | null>(null);
  const [isAvailable, setIsAvailable] = useState(false); // Start as false

  // Check if user is Individual User type
  const isIndividualUser = user?.role === "INDIVIDUAL_USER";

  // Load messages from localStorage on mount
  useEffect(() => {
    if (!isIndividualUser) {
      setIsAvailable(false);
      return;
    }

    // User is individual user, set available to true
    setIsAvailable(true);

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setMessages(JSON.parse(stored));
      } catch (error) {
        console.error("Failed to parse stored messages:", error);
      }
    }

    const firstTime = localStorage.getItem(FIRST_TIME_KEY);
    if (firstTime === "false") {
      setIsFirstTime(false);
    }
  }, [isIndividualUser]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0 && isIndividualUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      localStorage.setItem(FIRST_TIME_KEY, "false");
      setIsFirstTime(false);
    }
  }, [messages, isIndividualUser]);

  // Fetch health context periodically
  useEffect(() => {
    if (!token || !isIndividualUser) return;

    const fetchHealthContext = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ai/health-context`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            setHealthContext(data);
            setIsAvailable(true);
          }
        } else if (response.status === 401 || response.status === 403) {
          // User not authorized - not an individual user
          setIsAvailable(false);
        }
      } catch (error) {
        // Silently fail - this is expected for non-individual users
      }
    };

    // Fetch immediately
    fetchHealthContext();

    // Refresh every 30 seconds
    const interval = setInterval(fetchHealthContext, 30000);

    return () => clearInterval(interval);
  }, [token, isIndividualUser]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!token || !content.trim() || !isIndividualUser) return;

      const userMessage: ChatMessage = {
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      // Add user message immediately
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        // Prepare conversation history (last 10 messages for context)
        const conversationHistory = messages.slice(-10).map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: content.trim(),
            conversationHistory,
          }),
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();

          if (data.success) {
            const assistantMessage: ChatMessage = {
              role: "assistant",
              content: data.message,
              timestamp: data.timestamp,
            };

            setMessages((prev) => [...prev, assistantMessage]);
          } else {
            // Error from backend
            const errorMessage: ChatMessage = {
              role: "assistant",
              content: data.message || "Sorry, I couldn't process that right now. Please try again.",
              timestamp: new Date().toISOString(),
            };

            setMessages((prev) => [...prev, errorMessage]);
          }
        } else {
          throw new Error("Invalid response format");
        }
      } catch (error) {
        console.error("Failed to send message:", error);

        const errorMessage: ChatMessage = {
          role: "assistant",
          content: "Sorry, I couldn't connect to the server. Please check your connection and try again.",
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [token, messages, isIndividualUser]
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(FIRST_TIME_KEY, "true");
    setIsFirstTime(true);
  }, []);

  return {
    messages,
    isLoading,
    isFirstTime,
    healthContext,
    isAvailable,
    sendMessage,
    clearConversation,
  };
}
