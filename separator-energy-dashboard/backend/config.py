# =============================================================================
# config.py — Separator Energy Dashboard
# Driftwood Dairy | El Monte, CA | Texas Automation Systems
#
# All settings can be overridden via environment variables.
# In Docker, set them in docker-compose.yml or .env file.
# =============================================================================

import os

from dotenv import load_dotenv

load_dotenv()  # loads .env file if present (no-op in Docker if vars set directly)


def _env_bool(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


# --- i3X Consumer Connection --------------------------------------------------
# Default ON — i3X is the supported path. Set USE_I3X=false to fall back to
# the legacy REST client during commissioning rollback only. Both clients
# resolve to the same physical tags via I3X_TAGS, so the flip is non-destructive.
USE_I3X = _env_bool("USE_I3X", "true")
I3X_BASE_URL = os.getenv(
    "I3X_BASE_URL",
    f"http://{os.getenv('TIMEBASE_HOST', '192.254.155.2')}:{os.getenv('TIMEBASE_PORT', '4511')}",
).rstrip("/")
I3X_DATASET = os.getenv("I3X_DATASET", os.getenv("TIMEBASE_DATASET", "Driftwood Historian"))
I3X_SEPARATOR_BASE_PATH = os.getenv(
    "I3X_SEPARATOR_BASE_PATH",
    "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge",
)
I3X_TAG_MOTOR_AMPS = os.getenv("I3X_TAG_MOTOR_AMPS", "Motor Amps")
I3X_TAG_RUNNING = os.getenv("I3X_TAG_RUNNING", "Running")
I3X_TAG_CIP = os.getenv("I3X_TAG_CIP", "CIP")
I3X_TAG_PROCESS = os.getenv("I3X_TAG_PROCESS", "Process")
I3X_TIMEOUT_SECONDS = float(os.getenv("I3X_TIMEOUT_SECONDS", "10"))


def _i3x_element_id(tag_name: str) -> str:
    return f"{I3X_DATASET}:{I3X_SEPARATOR_BASE_PATH}/{tag_name}"


I3X_TAGS = {
    "motor_amps": _i3x_element_id(I3X_TAG_MOTOR_AMPS),
    "running": _i3x_element_id(I3X_TAG_RUNNING),
    "cip": _i3x_element_id(I3X_TAG_CIP),
    "process": _i3x_element_id(I3X_TAG_PROCESS),
}

# Deprecated aliases retained for legacy fallback compatibility
TIMEBASE_BASE_URL = I3X_BASE_URL
TIMEBASE_DATASET = I3X_DATASET

# --- UNS Tag Paths (as stored in TimeBase) -----------------------------------
# Legacy REST tagnames are derived from the same i3X element IDs by stripping
# the "{dataset}:" prefix. This guarantees both clients query the same physical
# tags, so flipping USE_I3X for rollback can't silently dim the dashboard.
#
# Phase 0 §2.3 captured all four tags as direct children of /Edge — there is
# no /Process Values subfolder on this historian. If a future deployment
# diverges, override I3X_SEPARATOR_BASE_PATH (and the per-tag I3X_TAG_* vars)
# rather than reintroducing a separate TAGS dict.
def _strip_dataset_prefix(eid: str) -> str:
    return eid.split(":", 1)[1] if ":" in eid else eid


TAGS = {alias: _strip_dataset_prefix(eid) for alias, eid in I3X_TAGS.items()}

# --- Electrical Parameters ---------------------------------------------------
VOLTAGE      = int(os.getenv("VOLTAGE", "460"))           # Volts, 3-phase
POWER_FACTOR = float(os.getenv("POWER_FACTOR", "0.88"))   # Typical induction motor
SQRT3        = 1.732

# --- SCE Energy Rate (TOU-GS-2 Commercial) -----------------------------------
# Blended rate estimate — override via POST /api/config with actual bill rate
DEFAULT_RATE_PER_KWH = float(os.getenv("DEFAULT_RATE_PER_KWH", "0.30"))

# --- Facility Timezone -------------------------------------------------------
FACILITY_TIMEZONE = os.getenv("FACILITY_TIMEZONE", "US/Pacific")

# --- Shift Definitions (facility local time) ---------------------------------
SHIFTS = {
    "1st Shift": {"start": 6, "end": 14},   # 6:00 AM - 2:00 PM
    "2nd Shift": {"start": 14, "end": 22},   # 2:00 PM - 10:00 PM
    "3rd Shift": {"start": 22, "end": 6},    # 10:00 PM - 6:00 AM (wraps midnight)
}

# --- SCE TOU-GS-2 Rate Structure (placeholder rates for POC) ------------------
# Season: "summer" = Jun 1 - Sep 30, "winter" = Oct 1 - May 31
# TOU periods (facility local time, weekdays only for on/mid-peak):
#   Summer On-Peak:      4 PM - 9 PM weekdays
#   Summer Mid-Peak:     8 AM - 4 PM weekdays
#   Summer Off-Peak:     9 PM - 8 AM all days + weekends/holidays
#   Winter Mid-Peak:     4 PM - 9 PM weekdays
#   Winter Off-Peak:     9 PM - 8 AM all days
#   Winter Super Off-Peak: 8 AM - 4 PM all days + weekends/holidays
TOU_RATES = {
    "summer": {
        "on_peak":  float(os.getenv("TOU_SUMMER_ON_PEAK", "0.38")),
        "mid_peak": float(os.getenv("TOU_SUMMER_MID_PEAK", "0.28")),
        "off_peak": float(os.getenv("TOU_SUMMER_OFF_PEAK", "0.18")),
    },
    "winter": {
        "mid_peak":       float(os.getenv("TOU_WINTER_MID_PEAK", "0.30")),
        "off_peak":       float(os.getenv("TOU_WINTER_OFF_PEAK", "0.22")),
        "super_off_peak": float(os.getenv("TOU_WINTER_SUPER_OFF_PEAK", "0.16")),
    },
}

# --- Analysis Window ---------------------------------------------------------
LOOKBACK_DAYS = int(os.getenv("LOOKBACK_DAYS", "7"))

# --- Continuous processing service (Phase 2) ---------------------------------
PROCESSING_INTERVAL_SECONDS = float(os.getenv("PROCESSING_INTERVAL_SECONDS", "5"))
PROCESSING_BUFFER_MINUTES = int(os.getenv("PROCESSING_BUFFER_MINUTES", "1440"))
STALE_THRESHOLD_SECONDS = float(os.getenv("STALE_THRESHOLD_SECONDS", "60"))

# --- Data Quality Thresholds -------------------------------------------------
MIN_GOOD_QUALITY  = int(os.getenv("MIN_GOOD_QUALITY", "192"))
MAX_MOTOR_AMPS    = int(os.getenv("MAX_MOTOR_AMPS", "100"))

# --- UNS MQTT Publisher (Phase 3a) -------------------------------------------
# Egress to the EMQX broker — publishes derived energy KPIs as plain MQTT
# topics under the existing UNS hierarchy so they appear in MQTT Explorer
# as a new "Energy" folder beside Alarms / Faults / Indicators under
# .../Seperator/1/Edge/. See docs/phase3a-uns-publisher.md for the contract.
#
# Ships OFF by default — flip UNS_PUBLISH_ENABLED to true after the smoke
# test in the doc. Same gate pattern as USE_I3X in Phase 1.
UNS_PUBLISH_ENABLED = _env_bool("UNS_PUBLISH_ENABLED", "false")
UNS_MQTT_HOST       = os.getenv("UNS_MQTT_HOST", "192.254.155.2")
UNS_MQTT_PORT       = int(os.getenv("UNS_MQTT_PORT", "1883"))
UNS_MQTT_CLIENT_ID  = os.getenv("UNS_MQTT_CLIENT_ID", "rav221-separator-energy")
UNS_MQTT_USERNAME   = os.getenv("UNS_MQTT_USERNAME", "")
UNS_MQTT_PASSWORD   = os.getenv("UNS_MQTT_PASSWORD", "")
UNS_MQTT_KEEPALIVE_SEC = int(os.getenv("UNS_MQTT_KEEPALIVE_SEC", "60"))
UNS_PUBLISH_BASE_TOPIC = os.getenv(
    "UNS_PUBLISH_BASE_TOPIC",
    # Energy is a sibling of Edge under the unit, not a child — these are
    # Rav2.21-derived values, not Edge-published OT data. Keeping them out
    # of the Edge subtree avoids implying they came from the upstream PLC.
    "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Energy",
)
UNS_PUBLISH_INTERVAL_SEC  = float(os.getenv("UNS_PUBLISH_INTERVAL_SEC", "5"))
UNS_PUBLISH_QOS           = int(os.getenv("UNS_PUBLISH_QOS", "1"))
UNS_PUBLISH_RETAIN_DATA   = _env_bool("UNS_PUBLISH_RETAIN_DATA", "true")
UNS_RECONNECT_MAX_BACKOFF = float(os.getenv("UNS_RECONNECT_MAX_BACKOFF", "60"))
# Change-detection heartbeat floor: even if a value is unchanged, republish
# at least this often so downstream consumers can detect a frozen publisher
# via per-topic message age (the _status / LWT covers process-level liveness;
# this covers stuck-LatestState liveness).
UNS_HEARTBEAT_FLOOR_SEC = float(os.getenv("UNS_HEARTBEAT_FLOOR_SEC", "60"))
