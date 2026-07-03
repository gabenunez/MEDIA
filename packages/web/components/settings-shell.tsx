import { ServerCog } from "lucide-react";

/** Prerendered settings header — static export shell. */
export function SettingsPageHeader() {
  return (
    <div className="mb-8 border-b border-border/70 pb-6">
      <p className="mb-1 flex items-center gap-2 font-mono text-[0.68rem] uppercase text-primary">
        <ServerCog className="h-3.5 w-3.5" />
        Control room
      </p>
      <h1 className="text-3xl font-bold">Settings</h1>
    </div>
  );
}
