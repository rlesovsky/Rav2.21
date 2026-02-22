# =============================================================================
# services/cost_calculator.py — Energy Cost Calculations
# Driftwood Dairy | Texas Automation Systems
#
# All calculations based on 3-phase motor power:
#   kW = (Amps × Voltage × √3 × PF) / 1000
#   kWh = kW × hours_in_interval
#   cost = kWh × rate_per_kwh
# =============================================================================

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pandas as pd

from config import (
    VOLTAGE,
    POWER_FACTOR,
    SQRT3,
    DEFAULT_RATE_PER_KWH,
    FACILITY_TIMEZONE,
    SHIFTS,
    TOU_RATES,
)
from services.state_engine import ALL_STATES, STATE_COLORS

logger = logging.getLogger(__name__)

# Runtime config — can be updated via POST /api/config
_runtime_config = {
    "rate_per_kwh": DEFAULT_RATE_PER_KWH,
    "voltage":      VOLTAGE,
    "power_factor": POWER_FACTOR,
}


def get_config() -> dict:
    """Return current electrical and rate config."""
    return dict(_runtime_config)


def update_config(rate_per_kwh: float = None, voltage: float = None, power_factor: float = None):
    """Update runtime config values."""
    if rate_per_kwh is not None:
        _runtime_config["rate_per_kwh"] = round(rate_per_kwh, 4)
    if voltage is not None:
        _runtime_config["voltage"] = voltage
    if power_factor is not None:
        _runtime_config["power_factor"] = power_factor
    logger.info("config updated: %s", _runtime_config)


def amps_to_kw(amps: float) -> float:
    """
    Convert motor current (amps) to power (kW) using 3-phase formula.

    Args:
        amps: Motor current in amps

    Returns:
        Power in kilowatts, rounded to 2 decimal places
    """
    v  = _runtime_config["voltage"]
    pf = _runtime_config["power_factor"]
    return round((amps * v * SQRT3 * pf) / 1000, 2)


def _to_pacific(ts) -> datetime:
    """Convert a timestamp (datetime or pd.Timestamp) to facility local time."""
    if hasattr(ts, "tz_localize") and ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    if hasattr(ts, "tz_convert"):
        local = ts.tz_convert(FACILITY_TIMEZONE)
    else:
        local = ts.astimezone(ZoneInfo(FACILITY_TIMEZONE))
    return local


def get_tou_rate(timestamp) -> float:
    """
    Given a UTC timestamp, return the TOU $/kWh rate for that moment in
    facility local time. Uses TOU_RATES from config; falls back to flat
    rate on any error.
    """
    try:
        local = _to_pacific(timestamp)
        h = local.hour
        month = local.month
        weekday = local.weekday()  # 0=Mon .. 6=Sun; weekday < 5 means Mon–Fri
        is_weekday = weekday < 5

        if 6 <= month <= 9:  # Summer
            rates = TOU_RATES["summer"]
            if is_weekday and 16 <= h < 21:
                return rates["on_peak"]
            if is_weekday and 8 <= h < 16:
                return rates["mid_peak"]
            return rates["off_peak"]
        else:  # Winter (Oct–May)
            rates = TOU_RATES["winter"]
            if is_weekday and 16 <= h < 21:
                return rates["mid_peak"]
            if 8 <= h < 16:  # all days + weekends
                return rates["super_off_peak"]
            return rates["off_peak"]
    except Exception:
        return _runtime_config["rate_per_kwh"]


def get_shift(timestamp) -> str:
    """Given a UTC timestamp, return shift name (1st/2nd/3rd) in facility local time."""
    try:
        local = _to_pacific(timestamp)
        h = local.hour
        if 6 <= h < 14:
            return "1st Shift"
        if 14 <= h < 22:
            return "2nd Shift"
        return "3rd Shift"
    except Exception:
        return "Unknown"


def get_tou_period(timestamp) -> str:
    """Given a UTC timestamp, return TOU period display name for facility local time."""
    try:
        local = _to_pacific(timestamp)
        h = local.hour
        month = local.month
        weekday = local.weekday()
        is_weekday = weekday < 5

        if 6 <= month <= 9:
            if is_weekday and 16 <= h < 21:
                return "On-Peak"
            if is_weekday and 8 <= h < 16:
                return "Mid-Peak"
            return "Off-Peak"
        else:
            if is_weekday and 16 <= h < 21:
                return "Mid-Peak"
            if 8 <= h < 16:
                return "Super Off-Peak"
            return "Off-Peak"
    except Exception:
        return "Off-Peak"


def interval_cost(kw: float, interval_minutes: float = 1.0) -> float:
    """
    Calculate the energy cost for a single time interval.

    Args:
        kw:               Power in kilowatts
        interval_minutes: Duration of interval in minutes (default: 1)

    Returns:
        Cost in USD, rounded to 6 decimal places
    """
    hours = interval_minutes / 60.0
    kwh   = kw * hours
    rate  = _runtime_config["rate_per_kwh"]
    return round(kwh * rate, 6)


def calculate_costs(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add kw, kwh, cost_usd, shift, tou_period, and tou_rate to a state-classified
    DataFrame. Cost uses TOU rate per row; falls back to flat rate if lookup fails.

    Args:
        df: Output from state_engine.build_dataframe() — must have motor_amps + state

    Returns:
        DataFrame with additional columns: kw, kwh, cost_usd, shift, tou_period, tou_rate
    """
    if df.empty:
        return df

    df = df.copy()
    df["kw"]   = df["motor_amps"].apply(amps_to_kw)
    df["kwh"]  = df["kw"] * (1 / 60)  # 1-minute intervals
    df["tou_rate"]   = df.index.map(get_tou_rate)
    df["cost_usd"]   = (df["kwh"] * df["tou_rate"]).round(6)
    df["shift"]      = df.index.map(get_shift)
    df["tou_period"] = df.index.map(get_tou_period)

    return df


def aggregate_by_shift(df: pd.DataFrame) -> dict:
    """
    Aggregate the DataFrame by shift: for each shift, return total hours, kWh,
    cost_usd, and a nested breakdown by state.
    """
    if df.empty or "shift" not in df.columns:
        return {name: {"hours": 0, "kwh": 0, "cost_usd": 0, "by_state": {s: {"hours": 0, "kwh": 0, "cost_usd": 0, "pct_time": 0, "color": STATE_COLORS[s]} for s in ALL_STATES}} for name in SHIFTS}

    by_shift = {}
    for shift_name in SHIFTS:
        mask = df["shift"] == shift_name
        shift_df = df[mask]
        if len(shift_df) == 0:
            by_shift[shift_name] = {
                "hours":    0,
                "kwh":      0,
                "cost_usd": 0,
                "by_state": {s: {"hours": 0, "kwh": 0, "cost_usd": 0, "pct_time": 0, "color": STATE_COLORS.get(s, "#000000")} for s in ALL_STATES},
            }
            continue
        by_state = {}
        for state in ALL_STATES:
            smask = shift_df["state"] == state
            s_df = shift_df[smask]
            hours = round(len(s_df) / 60, 1)
            kwh = round(s_df["kwh"].sum(), 1)
            cost = round(s_df["cost_usd"].sum(), 2)
            pct_time = round((len(s_df) / max(len(shift_df), 1)) * 100, 1)
            by_state[state] = {
                "hours":    hours,
                "kwh":      kwh,
                "cost_usd": cost,
                "pct_time": pct_time,
                "color":    STATE_COLORS.get(state, "#000000"),
            }
        by_shift[shift_name] = {
            "hours":    round(len(shift_df) / 60, 1),
            "kwh":      round(shift_df["kwh"].sum(), 1),
            "cost_usd": round(shift_df["cost_usd"].sum(), 2),
            "by_state": by_state,
        }
    return by_shift


def aggregate_summary(df: pd.DataFrame) -> dict:
    """
    Roll up 7-day cost totals by state and by shift.

    Returns:
        {
          "period": "...",
          "rate_per_kwh": 0.30,
          "total_cost_usd": 847.32,
          "total_kwh": 2824.4,
          "by_state": {...},
          "by_shift": {...}
        }
    """
    if df.empty:
        return _empty_summary()

    df = calculate_costs(df)

    total_kwh  = round(df["kwh"].sum(), 1)
    total_cost = round(df["cost_usd"].sum(), 2)

    by_state = {}
    for state in ALL_STATES:
        mask = df["state"] == state
        state_df = df[mask]
        hours     = round(len(state_df) / 60, 1)          # 1-row = 1 minute
        kwh       = round(state_df["kwh"].sum(), 1)
        cost      = round(state_df["cost_usd"].sum(), 2)
        pct_time  = round((len(state_df) / max(len(df), 1)) * 100, 1)
        by_state[state] = {
            "hours":     hours,
            "kwh":       kwh,
            "cost_usd":  cost,
            "pct_time":  pct_time,
            "color":     STATE_COLORS.get(state, "#000000"),
        }

    by_shift = aggregate_by_shift(df)

    period_start = df.index.min().strftime("%Y-%m-%d") if not df.empty else "N/A"
    period_end   = df.index.max().strftime("%Y-%m-%d") if not df.empty else "N/A"

    return {
        "period":         f"{period_start} to {period_end}",
        "rate_per_kwh":   _runtime_config["rate_per_kwh"],
        "total_cost_usd": total_cost,
        "total_kwh":      total_kwh,
        "by_state":       by_state,
        "by_shift":       by_shift,
    }


def aggregate_daily(df: pd.DataFrame) -> list[dict]:
    """
    Roll up cost by day, state, and shift — returns one row per day.

    Returns:
        [
          {
            "date": "2026-02-14",
            "total_cost_usd": 121.04,
            "total_kwh": 403.5,
            "by_state": {...},
            "by_shift": {...}
          },
          ...
        ]
    """
    if df.empty:
        return []

    df = calculate_costs(df)

    # Group by local date (US/Pacific)
    df = df.copy()
    df["date"] = df.index.tz_convert("America/Los_Angeles").date

    results = []
    for date, day_df in df.groupby("date"):
        by_state = {}
        for state in ALL_STATES:
            s = day_df[day_df["state"] == state]
            by_state[state] = {
                "hours":    round(len(s) / 60, 1),
                "kwh":      round(s["kwh"].sum(), 1),
                "cost_usd": round(s["cost_usd"].sum(), 2),
                "color":    STATE_COLORS.get(state, "#000000"),
            }
        by_shift = {}
        for shift_name in SHIFTS:
            smask = day_df["shift"] == shift_name
            shift_df = day_df[smask]
            if len(shift_df) == 0:
                by_shift[shift_name] = {
                    "hours":    0,
                    "kwh":      0,
                    "cost_usd": 0,
                    "by_state": {s: {"hours": 0, "kwh": 0, "cost_usd": 0, "pct_time": 0, "color": STATE_COLORS.get(s, "#000000")} for s in ALL_STATES},
                }
                continue
            shift_by_state = {}
            for state in ALL_STATES:
                s = shift_df[shift_df["state"] == state]
                n = len(s)
                pct = round((n / max(len(shift_df), 1)) * 100, 1)
                shift_by_state[state] = {
                    "hours":    round(n / 60, 1),
                    "kwh":      round(s["kwh"].sum(), 1),
                    "cost_usd": round(s["cost_usd"].sum(), 2),
                    "pct_time": pct,
                    "color":   STATE_COLORS.get(state, "#000000"),
                }
            by_shift[shift_name] = {
                "hours":    round(len(shift_df) / 60, 1),
                "kwh":      round(shift_df["kwh"].sum(), 1),
                "cost_usd": round(shift_df["cost_usd"].sum(), 2),
                "by_state": shift_by_state,
            }
        results.append({
            "date":           str(date),
            "total_cost_usd":  round(day_df["cost_usd"].sum(), 2),
            "total_kwh":      round(day_df["kwh"].sum(), 1),
            "by_state":       by_state,
            "by_shift":       by_shift,
        })

    return sorted(results, key=lambda r: r["date"])


def aggregate_timeline(df: pd.DataFrame) -> list[dict]:
    """
    Return per-hour kW, state, and cost for the last 24 hours.

    Returns:
        [
          {"timestamp": "2026-02-21T00:00:00Z", "kw": 33.0, "state": "Processing",
           "cost_usd": 9.90, "kwh": 33.0},
          ...
        ]
    """
    if df.empty:
        return []

    df = calculate_costs(df)

    # Return 1-minute resolution for the chart (last 1440 rows = 24 hrs)
    last_24h = df.tail(1440).copy()
    last_24h = last_24h.reset_index()
    last_24h = last_24h.rename(columns={"index": "timestamp"})

    return [
        {
            "timestamp":   row["timestamp"].isoformat(),
            "kw":          round(row["kw"], 2),
            "kwh":         round(row["kwh"], 4),
            "cost_usd":    round(row["cost_usd"], 4),
            "state":       row["state"],
            "color":       STATE_COLORS.get(row["state"], "#000000"),
            "tou_period":  row["tou_period"],
            "tou_rate":    round(float(row["tou_rate"]), 4),
            "shift":       row["shift"],
        }
        for _, row in last_24h.iterrows()
    ]


def current_cost(
    amps: float | None,
    state: str,
    tou_period: str | None = None,
    tou_rate: float | None = None,
    shift: str | None = None,
) -> dict:
    """
    Calculate live cost metrics from current motor amps. Uses tou_rate when
    provided, otherwise flat rate fallback.

    Returns:
        {"amps": 47.0, "kw": 33.0, "cost_per_hour": 9.90, "state": "...",
         "tou_period": "...", "tou_rate": 0.28, "shift": "1st Shift", ...}
    """
    if amps is None:
        return {
            "amps":          None,
            "kw":            None,
            "cost_per_hour": None,
            "state":         state,
            "color":         STATE_COLORS.get(state, "#000000"),
            "tou_period":    tou_period or "Off-Peak",
            "tou_rate":      tou_rate if tou_rate is not None else _runtime_config["rate_per_kwh"],
            "shift":         shift or "Unknown",
        }

    kw = amps_to_kw(amps)
    rate = tou_rate if tou_rate is not None else _runtime_config["rate_per_kwh"]
    cost_per_hour = round(kw * rate, 2)

    return {
        "amps":          round(amps, 1),
        "kw":            kw,
        "cost_per_hour": cost_per_hour,
        "state":         state,
        "color":         STATE_COLORS.get(state, "#000000"),
        "tou_period":   tou_period or "Off-Peak",
        "tou_rate":     round(rate, 4) if rate is not None else _runtime_config["rate_per_kwh"],
        "shift":        shift or "Unknown",
    }


def _empty_summary() -> dict:
    by_state = {
        s: {"hours": 0, "kwh": 0, "cost_usd": 0, "pct_time": 0, "color": STATE_COLORS[s]}
        for s in ALL_STATES
    }
    by_shift = {
        name: {"hours": 0, "kwh": 0, "cost_usd": 0, "by_state": dict(by_state)}
        for name in SHIFTS
    }
    return {
        "period":         "No data",
        "rate_per_kwh":   _runtime_config["rate_per_kwh"],
        "total_cost_usd": 0,
        "total_kwh":      0,
        "by_state":       by_state,
        "by_shift":       by_shift,
    }
