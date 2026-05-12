"""Tests for the Phase 3a UNS MQTT publisher.

All tests run offline against method-level stubs of aiomqtt.Client. They
verify the wire-format contract from docs/phase3a-uns-publisher.md:

    1. Tick emits 8 leaf publishes + 1 _snapshot when LatestState is populated.
    2. Topic strings preserve spaces and the 'Seperator' typo verbatim.
    3. Payloads are JSON-encoded primitives (33.0 not "33.0", true not "true").
    4. None KPI values are skipped on the wire (rule 7) but appear in _snapshot.
    5. Cold start (last_good_update is None) skips the entire tick.
    6. Retain/QoS flags pass through to publish().
    7. LWT is registered on connect with the correct topic/payload/qos/retain.
    8. MqttError mid-run logs, sleeps with backoff, retries — does not crash.
    9. Change detection: unchanged within heartbeat floor suppresses;
       same value at or past the floor republishes.

The tests stub aiomqtt at the method level — they don't prove the publisher
actually establishes a CONNECT packet against a real broker. The smoke
test in docs/phase3a-uns-publisher.md closes that gap on first deploy.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, MagicMock, patch

import aiomqtt

from services import processing, uns_publisher


def _prime_latest(**overrides) -> None:
    """Populate processing.LatestState with a deterministic snapshot
    representing 'one successful tick has happened.'"""
    processing._reset_for_tests()
    s = processing.get_latest()
    s.kw            = 33.0
    s.state         = "Processing"
    s.cost_per_hour = 9.9
    s.cost_today    = 12.5
    s.tou_period    = "Off-Peak"
    s.tou_rate      = 0.18
    s.shift         = "1st Shift"
    s.is_stale      = False
    now = datetime(2026, 5, 10, 22, 0, 0, tzinfo=timezone.utc)
    s.last_updated     = now
    s.last_good_update = now
    for k, v in overrides.items():
        setattr(s, k, v)


def _mock_client() -> MagicMock:
    """Build a MagicMock that behaves like aiomqtt.Client for the publisher's
    purposes — only the .publish() method matters."""
    client = MagicMock()
    client.publish = AsyncMock()
    return client


class TickPublishTests(IsolatedAsyncioTestCase):
    """Direct tests against _publish_tick (no broker, no event loop)."""

    async def asyncSetUp(self) -> None:
        _prime_latest()

    async def test_tick_emits_eight_leaves_plus_snapshot(self) -> None:
        client = _mock_client()
        any_pub = await uns_publisher._publish_tick(client, {}, {})

        self.assertTrue(any_pub)
        # 8 KPIs (kw, state, cost_per_hour, cost_today, tou_period,
        # tou_rate, shift, is_stale) + 1 _snapshot.
        self.assertEqual(client.publish.await_count, 9)

        emitted_topics = [
            call.args[0] if call.args else call.kwargs["topic"]
            for call in client.publish.await_args_list
        ]
        self.assertIn(
            "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Energy/kw",
            emitted_topics,
        )
        self.assertIn(
            "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Energy/_snapshot",
            emitted_topics,
        )

    async def test_topic_strings_preserve_spaces_and_typo(self) -> None:
        """Wire-format rules 1 & 2: spaces preserved, 'Seperator' typo preserved."""
        client = _mock_client()
        await uns_publisher._publish_tick(client, {}, {})

        for call in client.publish.await_args_list:
            topic = call.args[0] if call.args else call.kwargs["topic"]
            self.assertIn(" ", topic, f"topic should retain spaces: {topic}")
            self.assertIn("Seperator", topic, f"typo must be preserved: {topic}")
            self.assertNotIn("Separator/", topic, f"corrected spelling leaked: {topic}")
            self.assertNotIn("%20", topic, f"topic must not be URL-encoded: {topic}")

    async def test_payloads_are_json_encoded_primitives(self) -> None:
        """Wire-format rule 3: 33.0 not "33.0", true not "true"."""
        client = _mock_client()
        await uns_publisher._publish_tick(client, {}, {})

        emitted = {}
        for call in client.publish.await_args_list:
            topic = call.args[0] if call.args else call.kwargs["topic"]
            payload = call.kwargs["payload"]
            emitted[topic.rsplit("/", 1)[-1]] = payload

        # Numeric: bare JSON number, not a quoted string.
        kw_payload = emitted["kw"].decode("utf-8")
        self.assertEqual(json.loads(kw_payload), 33.0)
        self.assertNotIn('"', kw_payload)  # not "33.0"

        # Boolean: JSON true / false, not Python True / False or strings.
        is_stale_payload = emitted["is_stale"].decode("utf-8")
        self.assertEqual(is_stale_payload, "false")

        # String: JSON-quoted.
        state_payload = emitted["state"].decode("utf-8")
        self.assertEqual(json.loads(state_payload), "Processing")
        self.assertTrue(state_payload.startswith('"') and state_payload.endswith('"'))

    async def test_none_kpi_is_skipped_on_wire_but_included_in_snapshot(self) -> None:
        """Wire-format rule 7: None values don't publish to their leaf topic
        (a missing topic is honest; retained null breaks consumers). But the
        _snapshot bundle includes them as JSON null so consumers see the
        complete current state in one read."""
        _prime_latest(kw=None)
        client = _mock_client()
        await uns_publisher._publish_tick(client, {}, {})

        emitted = {}
        for call in client.publish.await_args_list:
            topic = call.args[0] if call.args else call.kwargs["topic"]
            payload = call.kwargs["payload"]
            emitted[topic.rsplit("/", 1)[-1]] = payload

        # No 'kw' leaf publish at all.
        self.assertNotIn("kw", emitted)

        # _snapshot still publishes, and contains kw: null.
        snapshot_payload = json.loads(emitted["_snapshot"].decode("utf-8"))
        self.assertIn("kw", snapshot_payload)
        self.assertIsNone(snapshot_payload["kw"])

    async def test_cold_start_skips_entire_tick(self) -> None:
        """Wire-format rule 7 cold-start: before processing has ever
        succeeded (last_good_update is None), publish nothing at all —
        not even _snapshot. 'Connected but waiting for data' is the
        _status='starting' signal; the leaves stay absent."""
        processing._reset_for_tests()  # last_good_update is None
        client = _mock_client()
        any_pub = await uns_publisher._publish_tick(client, {}, {})

        self.assertFalse(any_pub)
        client.publish.assert_not_awaited()

    async def test_retain_and_qos_flags_pass_through(self) -> None:
        """Wire-format rules 4 & 5: data topics retain=True (subscribers
        that connect mid-day see last known value); _snapshot retain=False
        (stale snapshots are worse than no snapshot); everything QoS=1."""
        client = _mock_client()
        await uns_publisher._publish_tick(client, {}, {})

        for call in client.publish.await_args_list:
            topic = call.args[0] if call.args else call.kwargs["topic"]
            qos = call.kwargs["qos"]
            retain = call.kwargs["retain"]

            self.assertEqual(qos, 1, f"QoS should be 1 on {topic}")
            if topic.endswith("/_snapshot"):
                self.assertFalse(retain, "_snapshot must NOT retain")
            else:
                self.assertTrue(retain, f"data topic must retain: {topic}")


class ChangeDetectionTests(IsolatedAsyncioTestCase):
    """§5 revision: publish on change with a heartbeat floor, not every tick.
    Keeps Ignition tag-write-event load proportional to actual signal change."""

    async def asyncSetUp(self) -> None:
        _prime_latest()

    async def test_unchanged_within_heartbeat_window_is_suppressed(self) -> None:
        client = _mock_client()
        last_published: dict = {}
        last_publish_at: dict = {}

        # Tick 1: populates the cache, publishes everything.
        await uns_publisher._publish_tick(client, last_published, last_publish_at)
        first_call_count = client.publish.await_count

        # Tick 2 with identical LatestState — every data topic should be
        # suppressed; only _snapshot republishes (it ignores change detection).
        client.publish.reset_mock()
        await uns_publisher._publish_tick(client, last_published, last_publish_at)

        emitted = [
            (call.args[0] if call.args else call.kwargs["topic"])
            for call in client.publish.await_args_list
        ]
        self.assertEqual(len(emitted), 1, f"expected snapshot only, got {emitted}")
        self.assertTrue(emitted[0].endswith("/_snapshot"))

        # Sanity: tick 1 emitted the full set.
        self.assertGreater(first_call_count, 1)

    async def test_unchanged_past_heartbeat_floor_republishes(self) -> None:
        client = _mock_client()
        last_published: dict = {}
        last_publish_at: dict = {}

        await uns_publisher._publish_tick(client, last_published, last_publish_at)

        # Backdate all last_publish_at entries past the heartbeat floor.
        stale = datetime.now(timezone.utc) - timedelta(
            seconds=uns_publisher.UNS_HEARTBEAT_FLOOR_SEC + 1,
        )
        for k in list(last_publish_at):
            last_publish_at[k] = stale

        client.publish.reset_mock()
        await uns_publisher._publish_tick(client, last_published, last_publish_at)

        # All 8 KPIs republish, plus _snapshot = 9.
        self.assertEqual(client.publish.await_count, 9)


class LWTContractTests(IsolatedAsyncioTestCase):
    """Wire-format rule (LWT): the Will must be set at connect time with
    the right topic, payload, qos, and retain so the broker fires it when
    our TCP session drops uncleanly."""

    def test_will_topic_is_status_under_base_path(self) -> None:
        will = uns_publisher._build_will()
        self.assertEqual(
            will.topic.value if hasattr(will.topic, "value") else str(will.topic),
            "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Energy/_status",
        )

    def test_will_payload_is_json_offline(self) -> None:
        will = uns_publisher._build_will()
        self.assertEqual(will.payload, b'"offline"')

    def test_will_qos_and_retain(self) -> None:
        will = uns_publisher._build_will()
        self.assertEqual(will.qos, 1)
        self.assertTrue(will.retain)


class ReconnectResilienceTests(IsolatedAsyncioTestCase):
    """A failing CONNECT must not crash the publisher task. The outer loop
    catches MqttError, logs, sleeps with backoff, and reconnects."""

    async def asyncSetUp(self) -> None:
        _prime_latest()
        uns_publisher._reset_for_tests()

    async def test_mqtt_error_on_connect_loops_with_backoff(self) -> None:
        """Patch the client factory to return a context manager whose __aenter__
        raises MqttError twice, then succeeds — proves we don't crash and we
        keep retrying."""
        attempts = {"count": 0}

        class _Stub:
            async def __aenter__(self_inner):
                attempts["count"] += 1
                if attempts["count"] <= 2:
                    raise aiomqtt.MqttError("simulated CONNECT refusal")
                # Third attempt: signal stop so the tick loop exits cleanly
                # after this connect completes.
                assert uns_publisher._stop_event is not None
                uns_publisher._stop_event.set()
                return self_inner

            async def __aexit__(self_inner, exc_type, exc, tb):
                return False

            async def publish(self_inner, *a, **kw):
                return None

        # Speed up the test: patch the backoff sleeps to be near-instant.
        # Also patch out the heartbeat by setting interval to 0.01.
        with patch.object(uns_publisher, "UNS_PUBLISH_INTERVAL_SEC", 0.01), \
             patch.object(uns_publisher, "UNS_RECONNECT_MAX_BACKOFF", 0.01), \
             patch.object(uns_publisher, "_build_client", return_value=_Stub()):

            await uns_publisher.start()
            # Drain — outer loop should retry CONNECT, hit attempt 3, see
            # stop set, and exit cleanly.
            await asyncio.wait_for(uns_publisher._task, timeout=5.0)

        # Three CONNECT attempts: two failures + one success-then-stop.
        self.assertGreaterEqual(attempts["count"], 3)

        # Task completed without raising (i.e., no crash).
        self.assertTrue(uns_publisher._task.done())
        self.assertIsNone(uns_publisher._task.exception())
