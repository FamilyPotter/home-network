import { useEffect, useRef, useState } from "react";

const BASE = import.meta.env.VITE_API_URL ?? "http://192.168.0.150:8000";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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
