# =============================================================================
# services/state_engine.py — Separator Operating State Classification
# Driftwood Dairy | Texas Automation Systems
#
# State logic (4 states, 3 boolean tags from Process Values):
#   Processing — Process is True
#   CIP        — CIP is True
#   Idle       — Running is True, but Process and CIP are both False
#   Shutdown   — Running is False, Process is False, CIP is False
# =============================================================================

import logging
from datetime import datetime

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_BOOL_TAGS = ("running", "cip", "process")
_TRUTHY_STRINGS = frozenset({"1", "true", "t", "on", "yes", "y"})
_FALSY_STRINGS = frozenset({"0", "false", "f", "off", "no", "n"})


def _coerce_bool(value: object) -> bool | None:
    """Tolerant boolean coercion for historian values.

    Booleans from i3X / Timebase arrive in any of: native bool, 0/1 ints, 0.0/1.0
    floats, or "true"/"false" strings (case-insensitive). The previous
    `bool(int(value))` form raised ValueError on the string form, which is the
    root cause of the post-outage Analysis-tab 500s when a tag has been
    written with the string representation.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if pd.isna(value):
            return None
        return bool(value)
    if isinstance(value, str):
        s = value.strip().lower()
        if s in _TRUTHY_STRINGS:
            return True
        if s in _FALSY_STRINGS:
            return False
        return None
    try:
        return bool(value)
    except Exception:
        return None

# State constants
STATE_PROCESSING = "Processing"
STATE_CIP        = "CIP"
STATE_IDLE       = "Idle"
STATE_SHUTDOWN   = "Shutdown"

ALL_STATES = [STATE_PROCESSING, STATE_CIP, STATE_IDLE, STATE_SHUTDOWN]

# Colors for frontend (matches React STATE_COLORS)
STATE_COLORS = {
    STATE_PROCESSING: "#22C55E",
    STATE_CIP:        "#3B82F6",
    STATE_IDLE:       "#F59E0B",
    STATE_SHUTDOWN:   "#6B7280",
}


def classify_state(process: bool, cip: bool, running: bool) -> str:
    """
    Classify one time interval into an operating state.

    Args:
        process: Separator is actively processing
        cip:     CIP cycle is active
        running: Motor is running

    Returns:
        One of: 'Processing', 'CIP', 'Idle', 'Shutdown'
    """
    if process:
        return STATE_PROCESSING
    elif cip:
        return STATE_CIP
    elif running:
        return STATE_IDLE
    else:
        return STATE_SHUTDOWN


def build_dataframe(raw: dict[str, list[dict]]) -> pd.DataFrame:
    """
    Align the 4 raw tag streams (motor_amps, running, cip, process) into a
    single 1-minute resampled DataFrame.

    Args:
        raw: Output from timebase_client.fetch_all_tags()
             {"motor_amps": [...], "running": [...], "cip": [...], "process": [...]}

    Returns:
        DataFrame with columns: motor_amps, running, cip, process, state —
        indexed by UTC datetime at 1-minute intervals.
    """
    if not any(raw.values()):
        logger.warning("state_engine: all tag streams are empty")
        return pd.DataFrame()

    # Build a Series for each tag
    series = {}
    for alias, points in raw.items():
        if not points:
            logger.warning("state_engine: tag '%s' has no data", alias)
            series[alias] = pd.Series(dtype=float)
            continue

        idx = pd.to_datetime([p["t"] for p in points], utc=True)
        vals = [p["v"] for p in points]
        series[alias] = pd.Series(vals, index=idx, name=alias)

    # Determine overall time range from all tags
    all_times = pd.DatetimeIndex([
        t for s in series.values() if not s.empty for t in s.index
    ])
    if all_times.empty:
        return pd.DataFrame()

    start = all_times.min().floor("min")
    end   = all_times.max().floor("min")
    minute_index = pd.date_range(start=start, end=end, freq="1min", tz="UTC")

    # Resample each tag to 1-minute uniform index
    df = pd.DataFrame(index=minute_index)

    for alias, s in series.items():
        if alias in _BOOL_TAGS:
            # Coerce values up front using the tolerant helper. The raw stream
            # may contain native bools, 0/1 ints, or "true"/"false" strings —
            # downstream code only handles bool/None safely.
            if s.empty:
                df[alias] = pd.Series([False] * len(minute_index), index=minute_index, dtype="boolean")
                continue

            coerced = s.map(_coerce_bool).astype("boolean")
            # Forward-fill over the union of the tag's own timestamps and the
            # minute grid, then reindex back to the grid. This propagates the
            # last known value into otherwise-empty minute buckets. Casting
            # up front avoids pandas' deprecated object-dtype ffill downcast.
            s_reindexed = coerced.reindex(minute_index.union(coerced.index)).sort_index()
            s_reindexed = s_reindexed.ffill().reindex(minute_index)
            df[alias] = s_reindexed
        else:
            # Analog tags: snap to nearest 1-min bucket, no interpolation.
            if s.empty:
                df[alias] = None
                continue
            s_reindexed = s.reindex(minute_index, method="nearest", tolerance=pd.Timedelta("30s"))
            df[alias] = s_reindexed

    # Drop rows where motor_amps is missing (no raw reading within 30s of that minute)
    df = df.dropna(subset=["motor_amps"])

    if df.empty:
        logger.info("state_engine: no motor_amps rows survived nearest-bucket join")
        return df

    # Log suspect motor amp readings but let them pass through
    if (df["motor_amps"] > 100).any():
        logger.warning(
            "state_engine: %d rows with Motor Amps > 100A",
            (df["motor_amps"] > 100).sum(),
        )

    # Backfill any remaining NaN booleans with False (Shutdown is the safe default)
    # and cast to plain numpy bool — eliminates BooleanDtype/pd.NA traps in apply().
    for col in _BOOL_TAGS:
        if col not in df.columns:
            df[col] = False
        df[col] = df[col].fillna(False).astype(bool)

    # Vectorized state classification — equivalent to classify_state() row-wise
    # but skips a slow Python apply over 10k+ rows and avoids any value that
    # could trip the row-iteration with a `pd.NA or 0` short-circuit.
    process = df["process"].to_numpy(dtype=bool)
    cip     = df["cip"].to_numpy(dtype=bool)
    running = df["running"].to_numpy(dtype=bool)
    state = np.where(
        process, STATE_PROCESSING,
        np.where(cip, STATE_CIP,
                 np.where(running, STATE_IDLE, STATE_SHUTDOWN))
    )
    df["state"] = state

    logger.info(
        "state_engine: built DataFrame rows=%d  state_counts=%s",
        len(df),
        df["state"].value_counts().to_dict(),
    )
    return df
