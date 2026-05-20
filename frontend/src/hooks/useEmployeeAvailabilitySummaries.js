import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";

const summaryCache = new Map();
const pendingIds = new Set();
const listeners = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener((value) => value + 1));
}

function resolveIds(usersOrIds) {
  return Array.from(
    new Set(
      (usersOrIds || [])
        .map((item) => Number(typeof item === "object" ? item?.id : item))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
}

export default function useEmployeeAvailabilitySummaries(usersOrIds = []) {
  const ids = useMemo(() => resolveIds(usersOrIds), [usersOrIds]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    listeners.add(setVersion);
    return () => {
      listeners.delete(setVersion);
    };
  }, []);

  useEffect(() => {
    const missingIds = ids.filter((id) => !summaryCache.has(id) && !pendingIds.has(id));
    if (!missingIds.length) return;

    missingIds.forEach((id) => pendingIds.add(id));

    let cancelled = false;

    api
      .get("/users/workload-summaries", {
        params: {
          ids: missingIds.join(",")
        }
      })
      .then(({ data }) => {
        if (cancelled) return;
        for (const item of data?.items || []) {
          const userId = Number(item?.userId || 0);
          if (!userId) continue;
          summaryCache.set(userId, item);
          pendingIds.delete(userId);
        }
        missingIds.forEach((id) => pendingIds.delete(id));
        notifyListeners();
      })
      .catch(() => {
        if (cancelled) return;
        missingIds.forEach((id) => pendingIds.delete(id));
        notifyListeners();
      });

    return () => {
      cancelled = true;
    };
  }, [ids]);

  return useMemo(() => {
    const result = {};
    ids.forEach((id) => {
      result[id] = summaryCache.get(id) || null;
    });
    return result;
  }, [ids, version]);
}
