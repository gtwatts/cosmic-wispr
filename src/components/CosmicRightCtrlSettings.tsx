import React, { useEffect, useState } from "react";

type Status = { supported: boolean; installed?: boolean; enabled?: boolean; ready?: boolean };
export default function CosmicRightCtrlSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    const update = () =>
      window.electronAPI
        ?.getCosmicGestureStatus?.()
        .then((value) => {
          if (mounted) setStatus(value);
        })
        .catch(() => {});
    update();
    const timer = setInterval(update, 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);
  if (!status?.supported) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Right Ctrl dictation</span>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(status.enabled && status.installed)}
          aria-label="Right Ctrl dictation"
          disabled={!status.installed}
          className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-50"
          onClick={async () => {
            try {
              await window.electronAPI.setCosmicGestureEnabled?.(!status.enabled);
              const next = await window.electronAPI.getCosmicGestureStatus?.();
              if (next) setStatus(next);
              setError("");
            } catch {
              setError("Could not update Right Ctrl. Please try again.");
            }
          }}
        >
          {status.enabled && status.installed ? "On" : "Off"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Hold Right Ctrl to speak, then release to paste. Double-tap for hands-free recording; tap
        again to finish. Your regular dictation shortcut stays available.
      </p>
      {!status.installed && (
        <p className="text-xs text-muted-foreground">
          The Right Ctrl keyboard helper needs to be installed first.
        </p>
      )}
      {status.installed && status.enabled && !status.ready && (
        <p className="text-xs text-muted-foreground">
          Waiting for an unlocked desktop and keyboard. Your regular shortcut still works.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
