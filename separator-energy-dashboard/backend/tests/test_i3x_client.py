from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, MagicMock, patch

from services import i3x_client
from config import I3X_TAGS


# ============================================================================
# Pure unit tests
# ============================================================================
class BuildElementIdTests(TestCase):
    def test_canonical_construction_preserves_spaces_and_typo(self) -> None:
        result = i3x_client.build_tag_element_id(
            "Driftwood Historian",
            "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge",
            "Motor Amps",
        )
        self.assertEqual(
            result,
            "Driftwood Historian:Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Motor Amps",
        )


class IsGoodQualityTests(TestCase):
    """Strict — only the literal uppercase string 'GOOD' passes.

    Tolerance here would silently mask an upstream change. If Timebase ever
    starts emitting a different string we want startup validation or a
    suddenly-empty current-values response to fail loudly, not coerce.
    """

    def test_uppercase_good_passes(self) -> None:
        self.assertTrue(i3x_client._is_good_quality("GOOD"))

    def test_anything_else_rejected(self) -> None:
        for raw in (
            "Good", "good", " GOOD ",          # case + whitespace variants
            "Bad", "GoodNoData", "Uncertain",  # other i3X quality strings
            "", None, 192, True, 0,            # non-strings / edge values
        ):
            self.assertFalse(i3x_client._is_good_quality(raw), repr(raw))


class ExtractValueResultsTests(TestCase):
    """Timebase emits a flat dict keyed by elementId. That is the only shape."""

    def setUp(self) -> None:
        self.eid_amps = I3X_TAGS["motor_amps"]
        self.eid_run = I3X_TAGS["running"]

    def test_dict_keyed_history_shape(self) -> None:
        payload = {
            self.eid_amps: {
                "data": [
                    {"value": 12.4, "quality": "GOOD", "timestamp": "2026-05-10T13:00:00Z"},
                    {"value": 13.1, "quality": "GOOD", "timestamp": "2026-05-10T13:01:00Z"},
                ]
            },
            self.eid_run: {"error": "elementId not found", "reason": "..."},
        }
        out = i3x_client._extract_value_results(payload, [self.eid_amps, self.eid_run])
        self.assertEqual(len(out[self.eid_amps]), 2)
        self.assertEqual(out[self.eid_run], [])

    def test_unrequested_ids_default_to_empty(self) -> None:
        out = i3x_client._extract_value_results({}, [self.eid_amps])
        self.assertEqual(out[self.eid_amps], [])

    def test_non_dict_payload_returns_empty_for_all(self) -> None:
        out = i3x_client._extract_value_results([], [self.eid_amps])
        self.assertEqual(out[self.eid_amps], [])


# ============================================================================
# Async unit tests
# ============================================================================
class FetchTagHistoryTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._get_client_patcher = patch(
            "services.i3x_client.get_client", new_callable=AsyncMock, return_value=None
        )
        self._get_client_patcher.start()

    async def asyncTearDown(self) -> None:
        self._get_client_patcher.stop()

    async def test_history_drops_non_good_quality_points(self) -> None:
        start = datetime(2026, 5, 10, 13, 0, tzinfo=timezone.utc)
        end = datetime(2026, 5, 10, 14, 0, tzinfo=timezone.utc)
        eid = I3X_TAGS["running"]

        payload = {
            eid: {
                "data": [
                    {"value": 1, "quality": "GOOD", "timestamp": "2026-05-10T13:10:00.000Z"},
                    {"value": 0, "quality": "Bad",  "timestamp": "2026-05-10T13:20:00.000Z"},
                ]
            }
        }
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            result = await i3x_client.fetch_tag_history("running", start, end)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["q"], 192)
        self.assertEqual(result[0]["v"], 1)

    async def test_history_clamps_boundary_point_to_window_start(self) -> None:
        """Phase 0 scenario verbatim — Edge gateway 4h stale, sole returned point
        is forward-fill seed from before startTime. Must be CLAMPED to startTime,
        not filtered out (architecture doc §2.5)."""
        start = datetime(2026, 5, 10, 13, 0, tzinfo=timezone.utc)
        end = datetime(2026, 5, 10, 14, 0, tzinfo=timezone.utc)
        eid = I3X_TAGS["motor_amps"]

        payload = {
            eid: {
                "data": [
                    {"value": 12.4, "quality": "GOOD", "timestamp": "2026-05-10T09:00:00.000Z"}
                ]
            }
        }
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            result = await i3x_client.fetch_tag_history("motor_amps", start, end)

        self.assertEqual(len(result), 1, "boundary point must NOT be filtered out")
        self.assertEqual(result[0]["t"], "2026-05-10T13:00:00.000Z", "must be snapped to startTime")
        self.assertEqual(result[0]["v"], 12.4, "value must be preserved through clamp")

    async def test_history_does_not_clamp_upper_bound(self) -> None:
        start = datetime(2026, 5, 10, 13, 0, tzinfo=timezone.utc)
        end = datetime(2026, 5, 10, 14, 0, tzinfo=timezone.utc)
        eid = I3X_TAGS["motor_amps"]

        payload = {
            eid: {
                "data": [
                    {"value": 5.0, "quality": "GOOD", "timestamp": "2026-05-10T13:30:00.000Z"}
                ]
            }
        }
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            result = await i3x_client.fetch_tag_history("motor_amps", start, end)

        self.assertEqual(result[0]["t"], "2026-05-10T13:30:00.000Z")


class FetchAllTagsTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._get_client_patcher = patch(
            "services.i3x_client.get_client", new_callable=AsyncMock, return_value=None
        )
        self._get_client_patcher.start()

    async def asyncTearDown(self) -> None:
        self._get_client_patcher.stop()

    async def test_empty_history_returns_empty_lists_not_none(self) -> None:
        """Brief AC: stub returns `{"<eid>": {"data": []}}` for every tag.
        Result must be `{alias: []}` for every alias — empty lists, not None."""
        start = datetime(2026, 5, 10, 13, 0, tzinfo=timezone.utc)
        end = datetime(2026, 5, 10, 14, 0, tzinfo=timezone.utc)

        payload = {eid: {"data": []} for eid in I3X_TAGS.values()}
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            result = await i3x_client.fetch_all_tags(start, end)

        for alias in I3X_TAGS:
            self.assertIn(alias, result)
            self.assertEqual(result[alias], [], f"alias {alias!r} should be empty list")


class FetchCurrentValuesTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._get_client_patcher = patch(
            "services.i3x_client.get_client", new_callable=AsyncMock, return_value=None
        )
        self._get_client_patcher.start()

    async def asyncTearDown(self) -> None:
        self._get_client_patcher.stop()

    async def test_response_adapter_returns_internal_contract(self) -> None:
        payload = {
            I3X_TAGS["motor_amps"]: {"data": [{"value": 12.4, "quality": "GOOD", "timestamp": "2026-05-10T13:00:00Z"}]},
            I3X_TAGS["running"]:    {"data": [{"value": 1,    "quality": "GOOD", "timestamp": "2026-05-10T13:00:00Z"}]},
            I3X_TAGS["cip"]:        {"data": [{"value": 0,    "quality": "GOOD", "timestamp": "2026-05-10T13:00:00Z"}]},
            I3X_TAGS["process"]:    {"data": [{"value": 1,    "quality": "GOOD", "timestamp": "2026-05-10T13:00:00Z"}]},
        }
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            result = await i3x_client.fetch_current_values()

        self.assertEqual(
            result,
            {"motor_amps": 12.4, "running": True, "cip": False, "process": True},
        )

    async def test_per_tag_error_yields_none_for_that_tag(self) -> None:
        payload = {
            I3X_TAGS["motor_amps"]: {"data": [{"value": 12.4, "quality": "GOOD", "timestamp": "2026-05-10T13:00:00Z"}]},
            I3X_TAGS["running"]:    {"error": "elementId not found", "reason": "..."},
            I3X_TAGS["cip"]:        {"data": [{"value": 0, "quality": "GOOD", "timestamp": "2026-05-10T13:00:00Z"}]},
            I3X_TAGS["process"]:    {"data": [{"value": 1, "quality": "GOOD", "timestamp": "2026-05-10T13:00:00Z"}]},
        }
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            result = await i3x_client.fetch_current_values()

        self.assertEqual(result["motor_amps"], 12.4)
        self.assertIsNone(result["running"])
        self.assertEqual(result["cip"], False)
        self.assertEqual(result["process"], True)

    async def test_non_good_quality_drops_to_none(self) -> None:
        payload = {
            I3X_TAGS["motor_amps"]: {"data": [{"value": 12.4, "quality": "Uncertain", "timestamp": "2026-05-10T13:00:00Z"}]},
            I3X_TAGS["running"]:    {"data": []},
            I3X_TAGS["cip"]:        {"data": []},
            I3X_TAGS["process"]:    {"data": []},
        }
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            result = await i3x_client.fetch_current_values()

        self.assertIsNone(result["motor_amps"])
        self.assertIsNone(result["running"])

    async def test_lowercase_good_is_rejected(self) -> None:
        """Strict quality match — 'Good' or 'good' must NOT pass."""
        payload = {
            I3X_TAGS["motor_amps"]: {"data": [{"value": 12.4, "quality": "Good", "timestamp": "2026-05-10T13:00:00Z"}]},
            I3X_TAGS["running"]:    {"data": []},
            I3X_TAGS["cip"]:        {"data": []},
            I3X_TAGS["process"]:    {"data": []},
        }
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            result = await i3x_client.fetch_current_values()
        self.assertIsNone(result["motor_amps"])


# ============================================================================
# Startup validation
# ============================================================================
class ValidateElementIdsTests(IsolatedAsyncioTestCase):
    async def test_all_tags_present_with_no_error_field_passes(self) -> None:
        payload = {
            eid: {"displayName": eid.split("/")[-1], "typeId": "Tag"}
            for eid in I3X_TAGS.values()
        }
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            await i3x_client._validate_element_ids(client=None, element_ids=list(I3X_TAGS.values()))

    async def test_missing_entry_raises_with_named_id(self) -> None:
        all_eids = list(I3X_TAGS.values())
        payload = {eid: {"typeId": "Tag"} for eid in all_eids[:-1]}  # drop the last one
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            with self.assertRaises(RuntimeError) as ctx:
                await i3x_client._validate_element_ids(client=None, element_ids=all_eids)
        self.assertIn(all_eids[-1], str(ctx.exception))

    async def test_entry_with_error_field_counts_as_invalid(self) -> None:
        all_eids = list(I3X_TAGS.values())
        payload = {eid: {"typeId": "Tag"} for eid in all_eids}
        payload[all_eids[1]] = {"error": "not found", "reason": "..."}
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            with self.assertRaises(RuntimeError) as ctx:
                await i3x_client._validate_element_ids(client=None, element_ids=all_eids)
        self.assertIn(all_eids[1], str(ctx.exception))

    async def test_non_dict_payload_raises(self) -> None:
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value="not a list or dict"):
            with self.assertRaises(RuntimeError):
                await i3x_client._validate_element_ids(client=None, element_ids=list(I3X_TAGS.values()))

    async def test_spec_shape_array_payload_all_present_passes(self) -> None:
        """Spec response: top-level array of ObjectInstance dicts with elementId fields."""
        all_eids = list(I3X_TAGS.values())
        payload = [{"elementId": eid, "typeId": "Tag"} for eid in all_eids]
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            await i3x_client._validate_element_ids(client=None, element_ids=all_eids)

    async def test_spec_shape_array_missing_entry_raises_with_named_id(self) -> None:
        all_eids = list(I3X_TAGS.values())
        # Omit the last requested elementId from the response array.
        payload = [{"elementId": eid, "typeId": "Tag"} for eid in all_eids[:-1]]
        with patch("services.i3x_client._post", new_callable=AsyncMock, return_value=payload):
            with self.assertRaises(RuntimeError) as ctx:
                await i3x_client._validate_element_ids(client=None, element_ids=all_eids)
        self.assertIn(all_eids[-1], str(ctx.exception))


class StartupTests(IsolatedAsyncioTestCase):
    async def test_startup_calls_validate_only_no_info_probe(self) -> None:
        """startup() must NOT probe /i3x/info — Timebase returns 404 there."""
        with patch("services.i3x_client.get_client", new_callable=AsyncMock, return_value=None), \
             patch("services.i3x_client._validate_element_ids", new_callable=AsyncMock) as validate, \
             patch("services.i3x_client._post", new_callable=AsyncMock) as post:
            await i3x_client.startup()
        validate.assert_awaited_once()
        # Defensive: nothing in startup should hit the wire beyond _validate_element_ids,
        # which itself uses _post (mocked). No GET /i3x/info should be issued.
        post.assert_not_called()

    async def test_startup_propagates_validation_failure(self) -> None:
        with patch("services.i3x_client.get_client", new_callable=AsyncMock, return_value=None), \
             patch(
                 "services.i3x_client._validate_element_ids",
                 side_effect=RuntimeError("Missing or invalid elementIds: ['...']"),
             ):
            with self.assertRaisesRegex(RuntimeError, "Missing or invalid elementIds"):
                await i3x_client.startup()


# ============================================================================
# Diagnostic /info wrapper
# ============================================================================
class GetInfoTests(IsolatedAsyncioTestCase):
    async def _patched_client(self, status_code: int, json_payload=None, raise_request: bool = False):
        fake_client = MagicMock()
        if raise_request:
            import httpx
            fake_client.get = AsyncMock(side_effect=httpx.RequestError("boom"))
        else:
            fake_resp = MagicMock(status_code=status_code)
            fake_resp.json.return_value = json_payload
            fake_client.get = AsyncMock(return_value=fake_resp)
        return fake_client

    async def test_returns_payload_and_200_on_success(self) -> None:
        client = await self._patched_client(200, {"specVersion": "1.0"})
        with patch("services.i3x_client.get_client", new_callable=AsyncMock, return_value=client):
            info, status = await i3x_client.get_info()
        self.assertEqual(status, 200)
        self.assertEqual(info, {"specVersion": "1.0"})

    async def test_returns_none_and_404_when_upstream_omits_info(self) -> None:
        client = await self._patched_client(404, None)
        with patch("services.i3x_client.get_client", new_callable=AsyncMock, return_value=client):
            info, status = await i3x_client.get_info()
        self.assertIsNone(info)
        self.assertEqual(status, 404)

    async def test_returns_none_and_zero_on_network_error(self) -> None:
        client = await self._patched_client(0, raise_request=True)
        with patch("services.i3x_client.get_client", new_callable=AsyncMock, return_value=client):
            info, status = await i3x_client.get_info()
        self.assertIsNone(info)
        self.assertEqual(status, 0)

    async def test_unwraps_spec_result_wrapper(self) -> None:
        """If a future server speaks the spec envelope, surface result.* anyway."""
        client = await self._patched_client(200, {"success": True, "result": {"specVersion": "9"}})
        with patch("services.i3x_client.get_client", new_callable=AsyncMock, return_value=client):
            info, status = await i3x_client.get_info()
        self.assertEqual(info, {"specVersion": "9"})
