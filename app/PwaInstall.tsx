"use client";

import { useEffect, useRef } from "react";
import "@khmyznikov/pwa-install";
import type { PWAInstallElement } from "@khmyznikov/pwa-install";

export default function PwaInstall() {
  const installRef = useRef<PWAInstallElement>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // The element already listens for the real `beforeinstallprompt` event
    // itself (and auto-triggers its own Apple/Android fallbacks on mount).
    // We only reveal the dialog once that real event has actually arrived,
    // so the "Install" button always has a genuine prompt behind it —
    // forcing it open earlier just shows a button that does nothing.
    const handleBeforeInstallPrompt = () => {
      installRef.current?.showDialog();
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
  }, []);

  return (
    <pwa-install
      ref={installRef}
      manifest-url="/manifest.webmanifest"
      name="Dependency Dashboard"
      description="Centralized Dependency using Renovate"
      icon="/icon-512.png"
    />
  );
}
