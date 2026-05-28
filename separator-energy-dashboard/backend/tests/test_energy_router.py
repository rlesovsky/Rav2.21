"""Tests for routers/energy.py error-handling contract.

When state_engine or the historian fails, the aggregation endpoints must
return HTTP 200 with an empty-shape payload (and a `warning` string on
/summary) — never HTTP 500. This was the post-outage Driftwood incident:
sparse boolean data raised inside build_dataframe and every Analysis-tab
panel rendered "Request failed with status code 500".
"""

from contextlib import asynccontextmanager
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import main


@asynccontextmanager
async def _noop_lifespan(app):
    yield


def _client() -> TestClient:
    # Skip startup so tests don't reach the historian. main.app.router holds
    # the lifespan callable that TestClient invokes on enter/exit.
    main.app.router.lifespan_context = _noop_lifespan  # type: ignore[attr-defined]
    return TestClient(main.app)


class SummaryEndpointTests(IsolatedAsyncioTestCase):
    async def test_state_engine_exception_returns_200_with_warning(self) -> None:
        with patch(
            "routers.energy.historian_client.fetch_all_tags",
            new_callable=AsyncMock,
            return_value={"motor_amps": [], "running": [], "cip": [], "process": []},
        ), patch(
            "routers.energy.state_engine.build_dataframe",
            side_effect=RuntimeError("simulated build failure"),
        ):
            with _client() as client:
                response = client.get("/api/energy/summary")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("warning", body)
        self.assertIsNotNone(body["warning"])
        self.assertEqual(body["total_cost_usd"], 0)
        self.assertEqual(body["total_kwh"], 0)
        # Empty-summary shape must include the four canonical states so the
        # frontend renders zero rows for each without optional-chain churn.
        for state in ("Processing", "CIP", "Idle", "Shutdown"):
            self.assertIn(state, body["by_state"])

    async def test_empty_historian_data_returns_warning(self) -> None:
        with patch(
            "routers.energy.historian_client.fetch_all_tags",
            new_callable=AsyncMock,
            return_value={"motor_amps": [], "running": [], "cip": [], "process": []},
        ):
            with _client() as client:
                response = client.get("/api/energy/summary")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNotNone(body.get("warning"))


class DailyEndpointTests(IsolatedAsyncioTestCase):
    async def test_state_engine_exception_returns_200_with_empty_list(self) -> None:
        with patch(
            "routers.energy.historian_client.fetch_all_tags",
            new_callable=AsyncMock,
            return_value={"motor_amps": [], "running": [], "cip": [], "process": []},
        ), patch(
            "routers.energy.state_engine.build_dataframe",
            side_effect=RuntimeError("simulated build failure"),
        ):
            with _client() as client:
                response = client.get("/api/energy/daily")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


class TimelineEndpointTests(IsolatedAsyncioTestCase):
    async def test_state_engine_exception_returns_200_with_empty_list(self) -> None:
        # Force the cold-start branch by emptying the ring buffer first.
        from services import processing
        processing._reset_for_tests()

        with patch(
            "routers.energy.historian_client.fetch_all_tags",
            new_callable=AsyncMock,
            return_value={"motor_amps": [], "running": [], "cip": [], "process": []},
        ), patch(
            "routers.energy.state_engine.build_dataframe",
            side_effect=RuntimeError("simulated build failure"),
        ):
            with _client() as client:
                response = client.get("/api/energy/timeline")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
