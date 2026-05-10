"""Tests for the Phase 2 continuous processing service.

Covers the four acceptance criteria from i3x-integration.md §5 Phase 2:
  1. LatestState populates after one tick.
  2. /api/energy/current returns from LatestState with no historian call.
  3. Historian errors don't crash the loop; last good state is retained.
  4. Ring buffer trims to its configured size.
"""

from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from services import processing
from services.state_engine import STATE_PROCESSING, STATE_SHUTDOWN


def _good_values() -> dict:
    return {"motor_amps": 47.0, "running": True, "cip": False, "process": True}


def _all_none_values() -> dict:
    return {"motor_amps": None, "running": None, "cip": None, "process": None}


class ProcessingTickTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        processing._reset_for_tests()

    async def test_tick_populates_latest_state(self) -> None:
        with patch(
            "services.processing.historian_client.fetch_current_values",
            new_callable=AsyncMock,
            return_value=_good_values(),
        ):
            await processing._tick()

        s = processing.get_latest()
        self.assertEqual(s.amps, 47.0)
        self.assertEqual(s.running, True)
        self.assertEqual(s.process, True)
        self.assertEqual(s.state, STATE_PROCESSING)
        self.assertIsNotNone(s.kw)
        self.assertIsNotNone(s.last_updated)
        self.assertIsNotNone(s.last_good_update)
        self.assertFalse(s.is_stale)

    async def test_tick_appends_minute_sample_to_buffer(self) -> None:
        with patch(
            "services.processing.historian_client.fetch_current_values",
            new_callable=AsyncMock,
            return_value=_good_values(),
        ):
            await processing._tick()

        self.assertEqual(processing.buffer_size(), 1)

    async def test_fetch_failure_retains_last_good_state(self) -> None:
        with patch(
            "services.processing.historian_client.fetch_current_values",
            new_callable=AsyncMock,
            return_value=_good_values(),
        ):
            await processing._tick()

        good = processing.get_latest()
        good_amps = good.amps
        good_state = good.state
        good_last_good = good.last_good_update

        with patch(
            "services.processing.historian_client.fetch_current_values",
            new_callable=AsyncMock,
            side_effect=RuntimeError("historian down"),
        ):
            await processing._tick()

        after = processing.get_latest()
        self.assertEqual(after.amps, good_amps)
        self.assertEqual(after.state, good_state)
        self.assertEqual(after.last_good_update, good_last_good)
        self.assertTrue(after.is_stale)
        self.assertIsNotNone(after.last_updated)

    async def test_all_none_upstream_does_not_advance_last_good_update(self) -> None:
        with patch(
            "services.processing.historian_client.fetch_current_values",
            new_callable=AsyncMock,
            return_value=_all_none_values(),
        ):
            await processing._tick()

        s = processing.get_latest()
        self.assertIsNone(s.last_good_update)
        self.assertTrue(s.is_stale)
        # Default state when all booleans coerce to False is Shutdown.
        self.assertEqual(s.state, STATE_SHUTDOWN)

    async def test_ring_buffer_trims_to_max_length(self) -> None:
        # Stuff the buffer past its configured cap by pushing through the
        # underlying deque (avoids needing to wait real time between ticks).
        cap = processing._buffer.maxlen
        self.assertIsNotNone(cap)
        for i in range(cap + 50):
            processing._buffer.append((datetime.now(timezone.utc), {"kw": float(i)}))
        self.assertEqual(len(processing._buffer), cap)

    async def test_current_metrics_shape_matches_currentmetrics_schema(self) -> None:
        with patch(
            "services.processing.historian_client.fetch_current_values",
            new_callable=AsyncMock,
            return_value=_good_values(),
        ):
            await processing._tick()

        metrics = processing.current_metrics()
        for key in (
            "amps", "kw", "cost_per_hour", "state", "color",
            "tou_period", "tou_rate", "shift",
            "cost_today", "last_updated", "is_stale",
        ):
            self.assertIn(key, metrics)


class CurrentEndpointDoesNotHitHistorianTests(IsolatedAsyncioTestCase):
    """Acceptance criterion #2: /api/energy/current must not round-trip the historian."""

    async def asyncSetUp(self) -> None:
        processing._reset_for_tests()

    async def test_current_metrics_returns_without_historian_call(self) -> None:
        # Prime LatestState by running one tick with a mocked historian.
        with patch(
            "services.processing.historian_client.fetch_current_values",
            new_callable=AsyncMock,
            return_value=_good_values(),
        ):
            await processing._tick()

        # current_metrics() must be a pure read from LatestState — no awaits,
        # no historian calls. Set the dispatcher to blow up if touched.
        with patch(
            "services.historian_client.fetch_current_values",
            new_callable=AsyncMock,
            side_effect=AssertionError("must not call historian"),
        ), patch(
            "services.historian_client.fetch_all_tags",
            new_callable=AsyncMock,
            side_effect=AssertionError("must not call historian"),
        ):
            result = processing.current_metrics()

        self.assertEqual(result["state"], STATE_PROCESSING)
        self.assertIsNotNone(result["kw"])
        self.assertFalse(result["is_stale"])
