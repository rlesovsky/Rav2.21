"""Envelope shape regression guards.

Every assertion here pins a specific field present (or required-but-null)
on the api.i3x.dev/v1 reference server. If a future change drops one of
these keys, downstream clients that pattern-match on shape will fail
silently — these tests fail loudly first.
"""

from datetime import datetime, timezone
from unittest import TestCase

from i3x_server import envelope


class UnaryEnvelopeTests(TestCase):
    def test_unary_success_shape(self) -> None:
        out = envelope.unary_success({"hello": "world"})
        self.assertEqual(out, {"success": True, "result": {"hello": "world"}})


class BulkEnvelopeTests(TestCase):
    def test_bulk_success_uses_results_with_s(self) -> None:
        out = envelope.bulk_success([{"a": 1}])
        self.assertIn("results", out)
        self.assertNotIn("result", out)
        self.assertEqual(out["success"], True)


class PerElementTests(TestCase):
    def test_success_includes_required_null_fields(self) -> None:
        out = envelope.per_element_success("eid-1", {"value": 42})
        # Reference server returns these keys even when null.
        for key in ("success", "elementId", "subscriptionId", "result", "error"):
            self.assertIn(key, out, f"missing key: {key}")
        self.assertEqual(out["success"], True)
        self.assertEqual(out["elementId"], "eid-1")
        self.assertIsNone(out["subscriptionId"])
        self.assertIsNone(out["error"])
        self.assertEqual(out["result"], {"value": 42})

    def test_error_shape(self) -> None:
        out = envelope.per_element_error("bad-eid", "NotFound", "no such tag")
        self.assertEqual(out["success"], False)
        self.assertEqual(out["elementId"], "bad-eid")
        self.assertIsNone(out["result"])
        self.assertIsNone(out["subscriptionId"])
        self.assertEqual(out["error"], {"code": "NotFound", "message": "no such tag"})


class VqtTests(TestCase):
    def test_vqt_includes_iscomposition_and_components(self) -> None:
        ts = datetime(2026, 5, 10, 22, 14, 33, tzinfo=timezone.utc)
        out = envelope.vqt(value=33.6, quality="Good", timestamp=ts)
        self.assertEqual(out["isComposition"], False)
        self.assertIsNone(out["components"])
        self.assertEqual(out["value"], 33.6)
        self.assertEqual(out["quality"], "Good")
        self.assertEqual(out["timestamp"], "2026-05-10T22:14:33Z")

    def test_timestamp_is_seconds_precision_with_z(self) -> None:
        ts = datetime(2026, 5, 10, 22, 14, 33, 999000, tzinfo=timezone.utc)
        out = envelope.vqt(0, "Good", ts)
        # No fractional seconds — reference uses second precision.
        self.assertNotIn(".", out["timestamp"])
        self.assertTrue(out["timestamp"].endswith("Z"))


class QualityClassificationTests(TestCase):
    def test_never_good_returns_bad(self) -> None:
        q = envelope.quality_for_latest(latest_field_value=None, is_stale=True, has_ever_been_good=False)
        self.assertEqual(q, "Bad")

    def test_fresh_value_returns_good(self) -> None:
        q = envelope.quality_for_latest(latest_field_value=33.6, is_stale=False, has_ever_been_good=True)
        self.assertEqual(q, "Good")

    def test_stale_value_returns_uncertain(self) -> None:
        q = envelope.quality_for_latest(latest_field_value=33.6, is_stale=True, has_ever_been_good=True)
        self.assertEqual(q, "Uncertain")

    def test_none_value_with_history_returns_good_no_data(self) -> None:
        q = envelope.quality_for_latest(latest_field_value=None, is_stale=False, has_ever_been_good=True)
        self.assertEqual(q, "GoodNoData")
