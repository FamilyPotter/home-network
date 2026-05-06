import { useEffect, useRef, useState } from "react";

/** Empty VITE_API_URL → same-origin `/api/...` (nginx proxies to FastAPI). Set VITE_API_URL for dev against remote API. */
function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const raw = import.meta.env.VITE_API_URL;
  if (raw != null && String(raw).trim() !== "") {
    return `${String(raw).replace(/\/$/, "")}${p}`;
  }
  return `/api${p}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function usePolled<T>(path: string, intervalMs = 10_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = async () => {
    try {
      const d = await apiFetch<T>(path);
      setData(d);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch_();
    timer.current = setInterval(fetch_, intervalMs);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [path, intervalMs]);

  return { data, loading, error, refetch: fetch_ };
}
