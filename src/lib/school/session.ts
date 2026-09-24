import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSessionSnapshot } from "./api";
import type { SessionSnapshot } from "./types";

export function useSchoolSession() {
  const { user, isPending } = useCurrentUserState();
  const [snap, setSnap] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setSnap(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getSessionSnapshot()
      .then((next) => {
        if (!cancelled) setSnap(next);
      })
      .catch(() => {
        if (!cancelled) setSnap(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isPending, tick]);

  return {
    user,
    isPending: isPending || Boolean(user && loading),
    snap,
    reload: () => setTick((n) => n + 1),
  };
}
