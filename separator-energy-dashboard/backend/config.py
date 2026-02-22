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

# --- TimeBase Historian Connection -------------------------------------------
TIMEBASE_HOST     = os.getenv("TIMEBASE_HOST", "192.254.155.2")
TIMEBASE_PORT     = int(os.getenv("TIMEBASE_PORT", "4511"))
TIMEBASE_BASE_URL = f"http://{TIMEBASE_HOST}:{TIMEBASE_PORT}"
TIMEBASE_DATASET  = os.getenv("TIMEBASE_DATASET", "Driftwood Historian")

# --- UNS Tag Paths (as stored in TimeBase) -----------------------------------
_BASE = os.getenv("TAG_BASE_PATH", "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge")
_PV   = f"{_BASE}/Process Values"

TAGS = {
    "motor_amps":  f"{_BASE}/Motor Amps",
    "running":     f"{_PV}/Running",
    "cip":         f"{_PV}/CIP",
    "process":     f"{_PV}/Process",
}

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

# --- Data Quality Thresholds -------------------------------------------------
MIN_GOOD_QUALITY  = int(os.getenv("MIN_GOOD_QUALITY", "192"))
MAX_MOTOR_AMPS    = int(os.getenv("MAX_MOTOR_AMPS", "100"))
