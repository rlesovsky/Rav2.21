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

import pandas as pd

from config import TAGS

logger = logging.getLogger(__name__)

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
        if s.empty:
            df[alias] = None
            continue

        s_reindexed = s.reindex(minute_index, method=None)

        if alias in ("running", "cip", "process"):
            # Boolean tags: stored on-change → forward-fill to propagate last known value
            # Historian returns integer 1/0; cast explicitly for safety
            s_reindexed = s.reindex(minute_index.union(s.index)).sort_index()
            s_reindexed = s_reindexed.map(
                lambda x: None if pd.isna(x) else bool(int(x))
            )
            s_reindexed = s_reindexed.ffill().reindex(minute_index)
            df[alias] = s_reindexed.astype("boolean")
        else:
            # Analog tags: snap to nearest 1-min bucket, no interpolation
            s_reindexed = s.reindex(minute_index, method="nearest", tolerance=pd.Timedelta("30s"))
            df[alias] = s_reindexed

    # Drop rows where motor_amps is missing (no raw reading within 30s of that minute)
    df = df.dropna(subset=["motor_amps"])

    # Log suspect motor amp readings but let them pass through
    if (df["motor_amps"] > 100).any():
        logger.warning(
            "state_engine: %d rows with Motor Amps > 100A",
            (df["motor_amps"] > 100).sum(),
        )

    # Fill remaining NaN booleans with False (safe default)
    for col in ("running", "cip", "process"):
        if col in df.columns:
            df[col] = df[col].fillna(False)

    # Classify state for each row
    def _row_state(row) -> str:
        return classify_state(
            process=bool(int(row.get("process", False) or 0)),
            cip=bool(int(row.get("cip", False) or 0)),
            running=bool(int(row.get("running", False) or 0)),
        )

    df["state"] = df.apply(_row_state, axis=1)

    logger.info(
        "state_engine: built DataFrame rows=%d  state_counts=%s",
        len(df),
        df["state"].value_counts().to_dict(),
    )
    return df
