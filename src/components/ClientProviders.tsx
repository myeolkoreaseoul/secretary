"use client";

import { CommandPalette } from "./CommandPalette";
import { ChatSidebar } from "./ChatSidebar";
import { TimerWidget } from "./TimerWidget";

export function ClientProviders() {
  return (
    <>
      <CommandPalette />
      <ChatSidebar />
    </>
  );
}

export { TimerWidget };
