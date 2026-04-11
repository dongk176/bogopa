"use client";

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NativeChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type NativeChatPersona = {
  personaId: string;
  personaName: string;
  avatarUrl?: string;
  lastMessage?: string;
  isLocked?: boolean;
};

export type NativeChatStatePayload = {
  personaId: string;
  personaName: string;
  avatarUrl?: string;
  personas?: NativeChatPersona[];
  messages: NativeChatMessage[];
  isTyping?: boolean;
  memoryBalance?: number | null;
};

export type NativeChatSendMessageEvent = {
  text: string;
};

export type NativeChatSelectPersonaEvent = {
  personaId: string;
};

export type NativeChatSubscribeMemoryPassEvent = {
  personaId?: string;
  personaName?: string;
};

export type NativeChatConfirmMemoryStoreOptions = {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
};

export type NativeChatConfirmMemoryStoreResult = {
  confirmed: boolean;
};

type NativeChatPlugin = {
  present(options: NativeChatStatePayload): Promise<void>;
  sync(options: NativeChatStatePayload): Promise<void>;
  dismiss(): Promise<void>;
  confirmMemoryStore(
    options?: NativeChatConfirmMemoryStoreOptions,
  ): Promise<NativeChatConfirmMemoryStoreResult>;
  addListener(
    eventName: "sendMessage",
    listenerFunc: (event: NativeChatSendMessageEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(eventName: "close", listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(
    eventName: "selectPersona",
    listenerFunc: (event: NativeChatSelectPersonaEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "subscribeMemoryPass",
    listenerFunc: (event: NativeChatSubscribeMemoryPassEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(eventName: "createMemory", listenerFunc: () => void): Promise<PluginListenerHandle>;
};

export const NativeChat = registerPlugin<NativeChatPlugin>("NativeChat");
