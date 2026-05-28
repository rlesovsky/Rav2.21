"""Tests for the legacy TimeBase REST client's point normalization.

Production incident (USE_I3X=false path): TimeBase returns good-quality points
that carry only a timestamp and quality, no 'v' value — boundary / no-data
markers. The client must drop them so downstream consumers (state_engine,
fetch_current_values) get the clean {t, v, q} contract and never KeyError.
"""

from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from services import timebase_client_legacy as legacy


def _resp(points: list[dict]) -> MagicMock:
    r = MagicMock()
    r.raise_for_status = MagicMock()
    r.json = MagicMock(return_value={"tl": [{"d": points}]})
    return r


class FetchTagHistoryFilteringTests(IsolatedAsyncioTestCase):
    async def _run(self, points: list[dict]) -> list[dict]:
        client = MagicMock()
        client.get = AsyncMock(return_value=_resp(points))
        start = datetime(2026, 5, 21, 0, 0, tzinfo=timezone.utc)
        end = datetime(2026, 5, 28, 0, 0, tzinfo=timezone.utc)
        return await legacy.fetch_tag_history("Some/Tag/Path", start, end, client)

    async def test_drops_quality_good_points_missing_value(self) -> None:
        points = [
            {"t": "2026-05-21T00:00:00Z", "v": 59, "q": 192},
            {"t": "2026-05-21T00:01:00Z", "q": 192},          # value-less marker
            {"t": "2026-05-21T00:02:00Z", "v": 44, "q": 192},
        ]
        result = await self._run(points)
        self.assertEqual(len(result), 2)
        self.assertTrue(all("v" in p for p in result))

    async def test_drops_points_missing_timestamp(self) -> None:
        points = [
            {"t": "2026-05-21T00:00:00Z", "v": 59, "q": 192},
            {"v": 12, "q": 192},                              # timestamp-less
        ]
        result = await self._run(points)
        self.assertEqual(len(result), 1)

    async def test_still_filters_bad_quality(self) -> None:
        points = [
            {"t": "2026-05-21T00:00:00Z", "v": 59, "q": 192},
            {"t": "2026-05-21T00:01:00Z", "v": 44, "q": 0},   # bad quality
        ]
        result = await self._run(points)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["v"], 59)

    async def test_all_value_less_returns_empty_list(self) -> None:
        points = [
            {"t": "2026-05-21T00:00:00Z", "q": 192},
            {"t": "2026-05-21T00:01:00Z", "q": 192},
        ]
        result = await self._run(points)
        self.assertEqual(result, [])
