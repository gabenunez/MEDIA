"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTvMode } from "@/lib/tv-mode";
import { isIosDevice, isStandalonePwa, shouldOfferPwaInstall } from "@/lib/pwa";

const DISMISS_KEY = "media:pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallBanner() {
  const pathname = usePathname();
  const isTvMode = useTvMode();
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isTvMode || !shouldOfferPwaInstall() || isStandalonePwa()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    setIos(isIosDevice());
    setVisible(true);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [isTvMode]);

  if (isTvMode || pathname.startsWith("/watch") || !visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const installAndroid = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
  };

  return (
    <div className="border-b border-border/70 bg-card/90 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Save MEDIA! to your phone</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {ios
              ? "In Safari, tap Share, then Add to Home Screen. Downloads stay on this iPhone, compressed under 500 MB so they fit."
              : "Install the app, then download compressed titles to watch offline."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ios ? (
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
              <Share className="h-3.5 w-3.5" /> Share → Add to Home Screen
            </span>
          ) : deferred ? (
            <Button size="sm" onClick={() => void installAndroid()}>
              Install
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
