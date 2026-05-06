export interface Device {
  id: string;
  mac: string;
  ip: string | null;
  hostname: string | null;
  manufacturer: string | null;
  category: string | null;
  room: string | null;
  connection: "Wired" | "Wireless" | "Unknown" | null;
  ip_type: "S" | "R" | "D" | null;
  description: string | null;
  known: boolean;
  online: boolean;
  first_seen: string;
  last_seen: string;
}

export interface ScanEvent {
  id: number;
  scanned_at: string;
  duration_ms: number | null;
  total_hosts: number | null;
  new_devices: number | null;
  lost_devices: number | null;
}

export interface Alert {
  id: number;
  device_id: string | null;
  alert_type: string;
  severity: string;
  message: string | null;
  acknowledged: boolean;
  created_at: string;
}

export interface Stats {
  total_devices: number;
  online_devices: number;
  unknown_devices: number;
  last_scan: string | null;
  alerts_unack: number;
}

export interface AdguardStats {
  num_dns_queries: number;
  num_blocked_filtering: number;
  avg_processing_time: number;
  top_clients: Array<{ name: string; count: number }>;
  top_blocked_domains: Array<{ name: string; count: number }>;
  time_units: string;
  processing_time_histogram: number[];
}

export type SortKey = keyof Pick<
  Device,
  "hostname" | "ip" | "mac" | "manufacturer" | "category" | "room" |
  "connection" | "ip_type" | "online" | "known" | "first_seen" | "last_seen"
> | "status";

export type SortDir = "asc" | "desc";
