"""Tests for state_engine.build_dataframe across the failure modes that
caused post-outage Analysis-tab 500s at Driftwood.

Covers:
  * Empty raw input → empty DataFrame, no exceptions.
  * Sparse boolean tags (single boundary-clamped point) → no NaN reaches
    classify_state; minute grid is fully populated via ffill.
  * String-typed boolean values ("true"/"False") → tolerant coercion;
    previously `bool(int("true"))` raised ValueError on every minute and
    bubbled up as HTTP 500 through the entire /summary, /daily, /timeline
    handler set.
  * Mixed value types — bool, int, string — coexisting in the same series.
"""

from datetime import datetime, timedelta, timezone
from unittest import TestCase

from services import state_engine
from services.state_engine import (
    STATE_PROCESSING, STATE_CIP, STATE_IDLE, STATE_SHUTDOWN,
)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class CoerceBoolTests(TestCase):
    """The bool-coercion helper that replaced the fragile `bool(int(x))` path."""

    def test_native_bool_passes_through(self) -> None:
        self.assertIs(state_engine._coerce_bool(True), True)
        self.assertIs(state_engine._coerce_bool(False), False)

    def test_int_and_float_coerce(self) -> None:
        self.assertIs(state_engine._coerce_bool(1), True)
        self.assertIs(state_engine._coerce_bool(0), False)
        self.assertIs(state_engine._coerce_bool(1.0), True)
        self.assertIs(state_engine._coerce_bool(0.0), False)

    def test_string_coerces_case_insensitive(self) -> None:
        for s in ("true", "True", "TRUE", "1", "on", "yes", "  true  "):
            self.assertIs(state_engine._coerce_bool(s), True, repr(s))
        for s in ("false", "False", "FALSE", "0", "off", "no"):
            self.assertIs(state_engine._coerce_bool(s), False, repr(s))

    def test_none_and_garbage_become_none(self) -> None:
        self.assertIsNone(state_engine._coerce_bool(None))
        self.assertIsNone(state_engine._coerce_bool("maybe"))


class BuildDataframeTests(TestCase):
    """Regression coverage for the post-outage 500s."""

    def setUp(self) -> None:
        # Window: a 5-minute slice. End is "now-ish" UTC-aligned.
        self.end = datetime(2026, 5, 27, 12, 0, tzinfo=timezone.utc)
        self.start = self.end - timedelta(minutes=5)

    def _amps_series(self) -> list[dict]:
        """A point per minute across the window — enough that every minute
        has a motor_amps reading within the 30s nearest tolerance."""
        return [
            {"t": _iso(self.start + timedelta(minutes=i)), "v": 47.0, "q": 192}
            for i in range(6)
        ]

    def test_all_empty_raw_returns_empty_frame(self) -> None:
        df = state_engine.build_dataframe(
            {"motor_amps": [], "running": [], "cip": [], "process": []}
        )
        self.assertTrue(df.empty)

    def test_points_missing_value_key_are_skipped_not_crash(self) -> None:
        """Production incident: the legacy TimeBase feed includes good-quality
        points that carry only a timestamp (no 'v' key) — a boundary/no-data
        marker buried mid-series. Previously crashed with KeyError: 'v' and
        500'd every Analysis panel. Such points must be skipped, real ones kept."""
        amps = self._amps_series()
        # Inject a value-less marker in the middle of the dense amp series.
        amps.insert(3, {"t": _iso(self.start + timedelta(minutes=2, seconds=30)), "q": 192})
        raw = {
            "motor_amps": amps,
            "running":    [{"t": _iso(self.start), "v": 1, "q": 192},
                           {"t": _iso(self.start + timedelta(minutes=1)), "q": 192}],  # value-less
            "cip":        [{"t": _iso(self.start), "v": 0, "q": 192}],
            "process":    [{"t": _iso(self.start), "v": 0, "q": 192}],
        }
        df = state_engine.build_dataframe(raw)
        self.assertFalse(df.empty, "real points must survive after dropping value-less markers")
        self.assertFalse(df["state"].isna().any())
        self.assertTrue((df["state"] == STATE_IDLE).all())  # running=1, process/cip=0

    def test_all_points_value_less_returns_empty_not_crash(self) -> None:
        raw = {
            "motor_amps": [{"t": _iso(self.start), "q": 192}],   # no 'v'
            "running":    [{"t": _iso(self.start), "q": 192}],
            "cip":        [{"t": _iso(self.start), "q": 192}],
            "process":    [{"t": _iso(self.start), "q": 192}],
        }
        df = state_engine.build_dataframe(raw)
        self.assertTrue(df.empty)

    def test_sparse_boolean_with_single_boundary_clamped_point(self) -> None:
        """Smoking-gun scenario: booleans logged on-change have zero in-window
        points; i3X returns a single boundary-clamped seed point at startTime."""
        raw = {
            "motor_amps": self._amps_series(),
            "running":    [{"t": _iso(self.start), "v": True, "q": 192}],
            "cip":        [{"t": _iso(self.start), "v": False, "q": 192}],
            "process":    [{"t": _iso(self.start), "v": True, "q": 192}],
        }
        df = state_engine.build_dataframe(raw)

        self.assertFalse(df.empty)
        # Every row must have a non-null state — no NaN/NA bleed-through.
        self.assertFalse(df["state"].isna().any())
        # Process was True → state must be Processing for every row.
        self.assertTrue((df["state"] == STATE_PROCESSING).all(),
                        f"states observed: {df['state'].value_counts().to_dict()}")

    def test_string_typed_booleans_do_not_raise(self) -> None:
        """Previously crashed with `ValueError: invalid literal for int() with
        base 10: 'true'`. The whole Analysis tab returned HTTP 500."""
        raw = {
            "motor_amps": self._amps_series(),
            "running":    [{"t": _iso(self.start), "v": "true",  "q": 192}],
            "cip":        [{"t": _iso(self.start), "v": "false", "q": 192}],
            "process":    [{"t": _iso(self.start), "v": "True",  "q": 192}],
        }
        df = state_engine.build_dataframe(raw)
        self.assertFalse(df.empty)
        self.assertTrue((df["state"] == STATE_PROCESSING).all())

    def test_running_only_yields_idle(self) -> None:
        raw = {
            "motor_amps": self._amps_series(),
            "running":    [{"t": _iso(self.start), "v": 1, "q": 192}],
            "cip":        [{"t": _iso(self.start), "v": 0, "q": 192}],
            "process":    [{"t": _iso(self.start), "v": 0, "q": 192}],
        }
        df = state_engine.build_dataframe(raw)
        self.assertTrue((df["state"] == STATE_IDLE).all())

    def test_all_booleans_empty_defaults_to_shutdown(self) -> None:
        raw = {
            "motor_amps": self._amps_series(),
            "running":    [],
            "cip":        [],
            "process":    [],
        }
        df = state_engine.build_dataframe(raw)
        self.assertFalse(df.empty)
        self.assertTrue((df["state"] == STATE_SHUTDOWN).all())

    def test_cip_takes_precedence_over_running(self) -> None:
        raw = {
            "motor_amps": self._amps_series(),
            "running":    [{"t": _iso(self.start), "v": True,  "q": 192}],
            "cip":        [{"t": _iso(self.start), "v": True,  "q": 192}],
            "process":    [{"t": _iso(self.start), "v": False, "q": 192}],
        }
        df = state_engine.build_dataframe(raw)
        self.assertTrue((df["state"] == STATE_CIP).all())
