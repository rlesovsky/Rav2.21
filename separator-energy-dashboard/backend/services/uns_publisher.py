"""UNS MQTT publisher (Phase 3a).

Publishes derived energy KPIs from processing.LatestState to the TSE EMQX
broker as plain MQTT topics under the existing UNS hierarchy. Topics show
up in MQTT Explorer as an "Energy" folder that's a sibling of "Edge" under
.../Seperator/1/ — sibling because these are Rav2.21-computed values, not
Edge-published OT data.

Lifecycle (start()/stop() symmetric with services.processing):

  startup:   uns_publisher.start()        # spawns _run() task
  shutdown:  uns_publisher.stop()         # signals stop event, awaits task

Connection state machine inside _run():

  1. Build aiomqtt.Client with LWT = (_status, "offline", retain=true).
  2. Enter the client context. CONNACK = "connected".
  3. Publish "_status" = "starting" (retain=true) immediately.
  4. Tick loop: read LatestState, publish KPIs (with change-detection +
     60s heartbeat floor), publish _snapshot every tick.
  5. First successful KPI publish flips _status to "online".
  6. On clean stop: publish "_status" = "offline" (retain=true), then exit
     the context — this sends a clean DISCONNECT which SUPPRESSES the LWT,
     so the retained "offline" is what the broker holds.
  7. On MqttError mid-loop: skip the offline publish (connection's broken),
     let the LWT fire on the broker side, sleep with exponential backoff,
     and reconnect.

See docs/phase3a-uns-publisher.md for the wire-format contract.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import aiomqtt

from config import (
    UNS_HEARTBEAT_FLOOR_SEC,
    UNS_MQTT_CLIENT_ID,
    UNS_MQTT_HOST,
    UNS_MQTT_KEEPALIVE_SEC,
    UNS_MQTT_PASSWORD,
    UNS_MQTT_PORT,
    UNS_MQTT_USERNAME,
    UNS_PUBLISH_BASE_TOPIC,
    UNS_PUBLISH_INTERVAL_SEC,
    UNS_PUBLISH_QOS,
    UNS_PUBLISH_RETAIN_DATA,
    UNS_RECONNECT_MAX_BACKOFF,
)
from services import processing

logger = logging.getLogger(__name__)


# --- KPI catalog ------------------------------------------------------------
# (topic_leaf, LatestState attribute, decimals or None for non-numeric).
# Order is the order they're emitted each tick.
#
# Adding/removing a KPI here? Keep i3x_server/model.TAGS in sync if the
# same LatestState field is exposed over the i3X producer too. The two
# catalogs are deliberately separate (different fields, different decimals
# — see docs/phase3a-uns-publisher.md §2) but field-level drift between
# them is silent and confusing for consumers that read both.
KPIS: list[tuple[str, str, Optional[int]]] = [
    ("kw",            "kw",            2),
    ("state",         "state",         None),
    ("cost_per_hour", "cost_per_hour", 2),
    ("cost_today",    "cost_today",    4),
    ("tou_period",    "tou_period",    None),
    ("tou_rate",      "tou_rate",      4),
    ("shift",         "shift",         None),
    ("is_stale",      "is_stale",      None),
]

STATUS_LEAF   = "_status"
SNAPSHOT_LEAF = "_snapshot"


# --- Module-level singletons ------------------------------------------------
_task: Optional[asyncio.Task] = None
_stop_event: Optional[asyncio.Event] = None

# Sentinel for "no previous publish recorded" — distinct from None, which is
# itself a valid (suppressed) KPI value the cache needs to remember.
_UNSET: Any = object()


# --- Topic helpers ----------------------------------------------------------
def _topic(leaf: str) -> str:
    return f"{UNS_PUBLISH_BASE_TOPIC}/{leaf}"


def _round(value: Any, decimals: Optional[int]) -> Any:
    if decimals is None or value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return round(float(value), decimals)
    return value


# --- Publish helpers --------------------------------------------------------
async def _publish_value(client: aiomqtt.Client, leaf: str, value: Any,
                         *, retain: bool) -> None:
    await client.publish(
        _topic(leaf),
        payload=json.dumps(value).encode("utf-8"),
        qos=UNS_PUBLISH_QOS,
        retain=retain,
    )


def _build_will() -> aiomqtt.Will:
    return aiomqtt.Will(
        topic=_topic(STATUS_LEAF),
        payload=json.dumps("offline").encode("utf-8"),
        qos=UNS_PUBLISH_QOS,
        retain=True,
    )


def _build_client() -> aiomqtt.Client:
    return aiomqtt.Client(
        hostname=UNS_MQTT_HOST,
        port=UNS_MQTT_PORT,
        identifier=UNS_MQTT_CLIENT_ID,
        username=UNS_MQTT_USERNAME or None,
        password=UNS_MQTT_PASSWORD or None,
        keepalive=UNS_MQTT_KEEPALIVE_SEC,
        will=_build_will(),
    )


# --- Tick logic -------------------------------------------------------------
async def _publish_tick(
    client: aiomqtt.Client,
    last_published: dict[str, Any],
    last_publish_at: dict[str, datetime],
) -> bool:
    """Publish one tick's worth of KPIs.

    Returns True iff at least one KPI was actually published (i.e., we have
    real data the caller can use to gate the starting->online transition).

    Change-detection rules:
      - Cold start (no entry in last_published): always publish.
      - Unchanged value within UNS_HEARTBEAT_FLOOR_SEC: suppress.
      - Unchanged value past the heartbeat floor: republish.
      - None values: don't publish, don't update cache.

    The _snapshot topic publishes every tick regardless of change detection
    (retain=False, so it's a "current state" pull point, not a tag write
    event source for Ignition).
    """
    snapshot = processing.get_latest()

    # Cold start: processing loop hasn't produced a successful tick yet.
    # Stay silent rather than publishing nulls (wire-format rule 7).
    if snapshot.last_good_update is None:
        return False

    now = datetime.now(timezone.utc)
    snapshot_bundle: dict[str, Any] = {}
    any_published = False

    for leaf, attr, decimals in KPIS:
        raw = getattr(snapshot, attr, None)
        value = _round(raw, decimals)

        # Snapshot bundle includes nulls — it's a "current full state" doc,
        # not a wire-format-rule-7 individual topic.
        snapshot_bundle[leaf] = value

        if value is None:
            continue

        prev = last_published.get(leaf, _UNSET)
        last_at = last_publish_at.get(leaf)
        changed = prev is _UNSET or prev != value
        heartbeat_due = (
            last_at is None
            or (now - last_at).total_seconds() >= UNS_HEARTBEAT_FLOOR_SEC
        )
        if not changed and not heartbeat_due:
            continue

        await _publish_value(client, leaf, value, retain=UNS_PUBLISH_RETAIN_DATA)
        last_published[leaf] = value
        last_publish_at[leaf] = now
        any_published = True

    # Snapshot bundle: every tick, retain=false. Include a timestamp so
    # consumers can tell how fresh it is without comparing against system time.
    snapshot_bundle["timestamp"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    await client.publish(
        _topic(SNAPSHOT_LEAF),
        payload=json.dumps(snapshot_bundle).encode("utf-8"),
        qos=UNS_PUBLISH_QOS,
        retain=False,
    )

    return any_published


# --- Outer run loop ---------------------------------------------------------
async def _run() -> None:
    """Outer loop — owns connect/disconnect, reconnect-with-backoff,
    and the inner tick loop."""
    assert _stop_event is not None
    backoff = 1.0

    while not _stop_event.is_set():
        try:
            client = _build_client()
            async with client:
                logger.info(
                    "uns_publisher: connected to %s:%s as %s, LWT on %s",
                    UNS_MQTT_HOST, UNS_MQTT_PORT, UNS_MQTT_CLIENT_ID,
                    _topic(STATUS_LEAF),
                )
                # Overwrites any retained "offline" left by a prior LWT firing.
                await _publish_value(client, STATUS_LEAF, "starting", retain=True)

                online_emitted = False
                last_published: dict[str, Any] = {}
                last_publish_at: dict[str, datetime] = {}
                try:
                    while not _stop_event.is_set():
                        any_published = await _publish_tick(
                            client, last_published, last_publish_at,
                        )
                        if any_published and not online_emitted:
                            await _publish_value(
                                client, STATUS_LEAF, "online", retain=True,
                            )
                            online_emitted = True

                        # wait_for, not sleep, so stop() preempts the interval.
                        try:
                            await asyncio.wait_for(
                                _stop_event.wait(),
                                timeout=UNS_PUBLISH_INTERVAL_SEC,
                            )
                        except asyncio.TimeoutError:
                            pass
                finally:
                    # Clean-shutdown emit: only if we got here without the
                    # connection breaking. A broken connection will raise
                    # MqttError out of this publish, which we swallow so the
                    # LWT path can fire on the broker side instead.
                    try:
                        await _publish_value(
                            client, STATUS_LEAF, "offline", retain=True,
                        )
                    except (aiomqtt.MqttError, OSError) as exc:
                        logger.debug(
                            "uns_publisher: offline-on-stop publish skipped (%s); "
                            "LWT will cover it",
                            exc,
                        )
            backoff = 1.0
            if _stop_event.is_set():
                break
        except aiomqtt.MqttError as exc:
            logger.warning(
                "uns_publisher: connection error (%s) — reconnect in %ss",
                exc, backoff,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("uns_publisher: unexpected error in run loop")

        # Backoff before reconnect, with stop-event short-circuit.
        try:
            await asyncio.wait_for(_stop_event.wait(), timeout=backoff)
        except asyncio.TimeoutError:
            pass
        backoff = min(backoff * 2, UNS_RECONNECT_MAX_BACKOFF)


# --- Lifecycle --------------------------------------------------------------
async def start() -> None:
    """Spawn the publisher task. Idempotent."""
    global _task, _stop_event
    if _task is not None and not _task.done():
        return
    _stop_event = asyncio.Event()
    _task = asyncio.create_task(_run(), name="uns-publisher")
    logger.info(
        "uns_publisher: started (base=%r, interval=%ss, heartbeat_floor=%ss)",
        UNS_PUBLISH_BASE_TOPIC, UNS_PUBLISH_INTERVAL_SEC, UNS_HEARTBEAT_FLOOR_SEC,
    )


async def stop() -> None:
    """Signal stop, wait for the task to drain (with a bounded timeout in
    case the broker is unreachable and the offline-publish is hung)."""
    global _task, _stop_event
    if _task is None or _stop_event is None:
        return
    _stop_event.set()
    try:
        await asyncio.wait_for(_task, timeout=10.0)
    except asyncio.TimeoutError:
        logger.warning("uns_publisher: stop timed out, cancelling task")
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    _task = None
    _stop_event = None
    logger.info("uns_publisher: stopped")


# --- Test hook --------------------------------------------------------------
def _reset_for_tests() -> None:
    global _task, _stop_event
    _task = None
    _stop_event = None
