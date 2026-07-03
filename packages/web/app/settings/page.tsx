import { SettingsPageHeader } from "@/components/settings-shell";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SettingsPageHeader />
      <SettingsClient />
    </div>
  );
}
