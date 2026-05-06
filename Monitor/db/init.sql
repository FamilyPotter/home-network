-- Network Monitor — Database Initialisation
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Devices ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS devices (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    mac           MACADDR     NOT NULL UNIQUE,
    ip            INET,
    hostname      TEXT,
    manufacturer  TEXT,
    category      TEXT,
    room          TEXT,
    connection    TEXT CHECK (connection IN ('Wired','Wireless','Unknown')),
    ip_type       TEXT CHECK (ip_type IN ('S','R','D')) DEFAULT 'D',
                  -- S=Static OS, R=Reserved DHCP, D=Dynamic
    description   TEXT,
    first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    online        BOOLEAN     NOT NULL DEFAULT FALSE,
    known         BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_devices_mac  ON devices (mac);
CREATE INDEX idx_devices_ip   ON devices (ip);
CREATE INDEX idx_devices_room ON devices (room);

-- ─── Scan Events ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scan_events (
    id         BIGSERIAL   PRIMARY KEY,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INT,
    total_hosts INT,
    new_devices INT,
    lost_devices INT
);

-- ─── Device State History ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS device_history (
    id         BIGSERIAL   PRIMARY KEY,
    device_id  UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    scan_id    BIGINT      REFERENCES scan_events(id) ON DELETE SET NULL,
    ip         INET,
    online     BOOLEAN     NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_history_device  ON device_history (device_id, changed_at DESC);
CREATE INDEX idx_history_changed ON device_history (changed_at DESC);

-- ─── AdGuard Query Log Cache ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS adguard_queries (
    id           BIGSERIAL   PRIMARY KEY,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_ip    INET,
    client_mac   MACADDR,
    question     TEXT,
    answer       TEXT,
    status       TEXT,
    elapsed_ms   INT
);

CREATE INDEX idx_adguard_client  ON adguard_queries (client_ip, fetched_at DESC);
CREATE INDEX idx_adguard_fetched ON adguard_queries (fetched_at DESC);

-- ─── Alerts ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts (
    id          BIGSERIAL   PRIMARY KEY,
    device_id   UUID        REFERENCES devices(id) ON DELETE CASCADE,
    alert_type  TEXT        NOT NULL,   -- new_device | offline | ip_change
    severity    TEXT        NOT NULL DEFAULT 'info',
    message     TEXT,
    acknowledged BOOLEAN    NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_device ON alerts (device_id, created_at DESC);

-- ─── Seed: known devices ──────────────────────────────────────────────────────

INSERT INTO devices (mac, ip, hostname, manufacturer, category, room, connection, ip_type, known, online, description) VALUES
  ('b0:be:76:c0:00:01', '192.168.0.1',   'deco-main',          'TP-Link',             'Network',      'Gym',                    'Wired',    'S', true, true,  'Deco X1500 main node — Wi-Fi 6 mesh gateway / Starlink uplink'),
  ('e8:6f:38:a9:df:57', '192.168.0.52',  'SDP-LAPTOP',         'ASUSTek Computer',    'Computer',     'Lounge',                 'Wireless', 'R', true, true,  'Dell laptop; AdGuard DNS reservation; Tailscale 100.67.46.14'),
  ('00:8a:76:9c:b1:8a', '192.168.0.79',  'FamilyiPad',         'Apple, Inc.',         'Mobile',       'Family Room',            'Wireless', 'R', true, false, 'Family iPad; permanent MAC; DHCP reservation .79'),
  ('f0:23:b9:eb:12:f9', '192.168.0.144', 'Fingbox',            'Fing',                'Network',      'Gym',                    'Wired',    'D', true, true,  'Fing network scanner / HA integration'),
  ('44:b7:d0:e5:06:c3', '192.168.0.89',  'hive-neo-hub',       'Computime',           'Smart Home',   'Gym',                    'Wired',    'D', true, true,  'Hive Neo Hub gen 2'),
  ('c8:08:e9:d4:bb:b5', '192.168.0.45',  'LG EF950V TV',       'LG Electronics',      'Entertainment','Family Room',            'Wireless', 'D', true, false, 'LG OLED EF950V 4K TV'),
  ('78:3e:53:a1:dc:f2', NULL,            'Sky Q Mini — Eddy',  'Sky UK',              'Entertainment','Eddy',                   'Wired',    'D', true, false, 'Sky Q Mini box — Eddy''s room'),
  ('14:49:e0:0a:58:63', NULL,            'Samsung TV',         'Samsung Electronics', 'Entertainment','Master Bedroom',          'Wireless', 'D', true, false, 'Samsung Smart TV — Master Bedroom'),
  ('02:12:46:c8:87:e8', '192.168.0.103', 'Sharon-iPhone',      'Apple, Inc.',         'Mobile',       'Family Room',            'Wireless', 'D', true, false, 'Sharon''s iPhone; randomised MAC')
ON CONFLICT (mac) DO NOTHING;
