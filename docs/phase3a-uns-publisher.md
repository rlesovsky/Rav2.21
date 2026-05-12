# Phase 3a — UNS MQTT Publisher (Shipped)

**Status:** Code merged, default-off via `UNS_PUBLISH_ENABLED=false`. Awaiting smoke test against the EMQX broker at `192.254.155.2:1883`.
**Pairs with:** [`docs/i3x-integration.md`](./i3x-integration.md) (overall i3X architecture), [`docs/phase1-shipped.md`](./phase1-shipped.md) (consumer client + processing loop). The pre-implementation plan for this phase lived in the branch description; this document is the post-merge reference.
**Scope:** Publish derived Energy KPIs from `processing.LatestState` to the TSE EMQX broker as plain MQTT topics under the existing UNS hierarchy. Topics appear in MQTT Explorer as a new `Energy` folder as a **sibling of `Edge`** under `…/Seperator/1/`. Sibling, not child — these are Rav2.21-computed values, not Edge-published OT data, so they don't belong under the `Edge` subtree.

Named **Phase 3a** because it precedes the in-progress i3X producer ([`docs/phase3-shipped.md`](./phase3-shipped.md)) by exposing the same `LatestState` over a different protocol.

---

## 1. What gets published

Eight derived KPI topics, all rooted at `UNS_PUBLISH_BASE_TOPIC`:

```
Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Energy/
├── kw                   (number, kW)
├── state                (string: Processing | CIP | Idle | Shutdown)
├── cost_per_hour        (number, USD/h)
├── cost_today           (number, USD)
├── tou_period           (string: On-Peak | Mid-Peak | Off-Peak | Super Off-Peak)
├── tou_rate             (number, USD/kWh)
├── shift                (string: 1st Shift | 2nd Shift | 3rd Shift)
└── is_stale             (boolean)
```

Plus two operational topics:

```
…/Energy/_status      (string: "starting" | "online" | "offline")   ← LWT-backed
…/Energy/_snapshot    (JSON object, all 8 KPIs + timestamp)         ← convenience bundle
```

**Payload shape.** Each leaf carries a JSON-encoded scalar — `33.0`, `"Processing"`, `true`, `0.18`. Not a wrapped envelope, because the existing tree shows scalar leaves (`CIP 1 Caustic Pump = 1`, `Bowl Speed = 4183`) and we want Rav2.21's contribution to be visually indistinguishable from upstream values.

**Why also `_snapshot`?** AI/MCP consumers and Node-RED nodes that prefer one-shot reads benefit from a single JSON document. Costs nothing — same `LatestState` read, one extra publish per tick. The leading underscore keeps it visually separated from data topics in tree browsers. `retain=False` because a stale snapshot is worse than no snapshot.

## 2. What deliberately does NOT get published

- **`motor_amps`, `running`, `cip`, `process`.** Already exist upstream under `…/Seperator/1/Edge/Motor Amps`, `…/Running`, `…/CIP`, `…/Process`. Republishing duplicates truth. Rav2.21 is the source for **derived** energy economics, not a republisher of OT data it reads from the historian.
- **Historical timeline / ring buffer.** MQTT is publish-now; history belongs on the i3X producer (`POST /api/i3x/v1/objects/history`).
- **Aggregations (`/summary`, `/daily`).** Pull-shaped 7-day rollups, not streaming telemetry. Stay on the HTTP API.

## 3. Wire-format rules

These are deliberate choices encoded in the publisher and asserted by the test suite. Don't relax any without re-reading why it's pinned.

1. **Topic separator is `/`.** Spaces inside path segments are preserved verbatim (`Driftwood Dairy`, `Raw Side`, `El Monte CA`). No URL-encoding, no underscores-for-spaces, no slugifying. The MQTT spec allows spaces; the existing tree uses them; we match. Tested by `test_topic_strings_preserve_spaces_and_typo`.
2. **`Seperator` typo is preserved.** Fixing it here would split the Edge folder in MQTT Explorer between the corrected-spelled Energy subtree and the typo'd siblings. Worse outcome than living with the typo. Single-config-string change if/when upstream is fixed.
3. **JSON-encoded scalar payloads, UTF-8.** `33.0` not `b"33.0"` and not `"33.0"`. Python `True`/`False` serializes to JSON `true`/`false`, which Ignition, Node-RED, and Grafana all handle natively. Tested by `test_payloads_are_json_encoded_primitives`.
4. **Retain semantics:** data topics `retain=True`, `_status` `retain=True`, `_snapshot` `retain=False`. Data topics retain so any subscriber that connects mid-day sees the last known value immediately. `_status` retains so the broker holds the LWT-published `"offline"` until the publisher reconnects. `_snapshot` does not retain because a stale snapshot bundle is worse than no snapshot. Tested by `test_retain_and_qos_flags_pass_through`.
5. **QoS = 1 (at-least-once) on all publishes.** Not 0 (loses data during broker hiccups). Not 2 (expensive handshake for scalars where retain already gives us recovery). 1 is the standard for telemetry that matters but tolerates the rare duplicate.
6. **Numeric rounding matches the HTTP API.** `kw` to 2 decimals, `cost_per_hour` to 2, `cost_today` to 4, `tou_rate` to 4. Keeps `…/Energy/kw` and `GET /api/energy/current → kw` byte-identical for consumers that look at both.
7. **`None` becomes a non-publish, not a `null`.** When `LatestState.kw` is None (cold start), we **don't publish** to `…/Energy/kw`. A retained `null` confuses tag bindings and looks like a broken value. A missing topic is honest: "no value yet." The `_snapshot` bundle DOES include nulls because it's a complete-state document, not a live tag. Tested by `test_none_kpi_is_skipped_on_wire_but_included_in_snapshot`.
8. **Change detection with a 60s heartbeat floor.** Publish a data topic only when the rounded value changes OR when it's been ≥60s since the last publish for that topic. `_snapshot` ignores change detection (publishes every tick). Tested by `test_unchanged_within_heartbeat_window_is_suppressed` and `test_unchanged_past_heartbeat_floor_republishes`.

   The change-detection switch (from "publish every tick") is driven by likely Ignition consumption: subscribed tags with `retain-as-published=true` register a tag write event on every retained publish, which flows through tag change scripts, history pen evaluation, and alarm rate-of-change calcs. At 5s × 8 tags that's 96 write events per minute even when nothing changes. Change detection caps that to actual signal change plus a per-minute heartbeat — the heartbeat preserves "publisher alive" diagnostics without flooding downstream subscribers.

## 4. Lifecycle and connection state machine

**Library:** [`aiomqtt`](https://pypi.org/project/aiomqtt/) `2.3.0` — the asyncio-native successor to `asyncio-mqtt`. Pure Python. Matches the codebase's asyncio-first style.

**Connection target** (defaults; overridable via env):

```
broker:    192.254.155.2:1883     (TLS: no; auth: none — open on infrastructure network)
client_id: rav221-separator-energy
keepalive: 60s
```

**State transitions on `_status`:**

```
   (LWT registered with broker at CONNECT)
              │
              ▼
       publisher starts          ──┐
              │                    │
              ▼                    │  retain=true on every transition
       _status = "starting"        │  qos=1
              │                    │
              ▼                    │
       first successful tick       │
              │                    │
              ▼                    │
       _status = "online"          │
              │                    │
        ┌─────┴──────┐             │
        ▼            ▼             │
   clean stop    crash/network     │
        │            │             │
        ▼            ▼             │
   publish        broker fires     │
   "offline"      LWT = "offline"  │
        │            │             │
        └─────┬──────┘             │
              ▼                  ──┘
       _status = "offline"
```

Once `online`, the only path back is `offline` (via clean shutdown or LWT). We never regress `online → starting`.

**Clean-shutdown publish ordering.** `stop()` sets the stop event, the tick loop exits, and the `finally` block publishes `"offline"` with `retain=True` **before** the `async with client:` exits — the publish awaits PUBACK (QoS 1), then the context manager sends a clean DISCONNECT, which SUPPRESSES the LWT. The retained `"offline"` is what the broker holds. If the broker has already disconnected us by the time `finally` runs, the offline publish raises `MqttError`, we swallow it, and the LWT path covers the same outcome.

**Reconnect strategy.** `aiomqtt.MqttError` on connect or mid-loop is caught by the outer loop, logged, and followed by an exponential backoff (1s → 2s → 4s → … capped at `UNS_RECONNECT_MAX_BACKOFF=60s`). The processing loop ticks independently, so when the publisher reconnects it sends fresh values immediately, not stale ones from before the disconnect. Tested by `test_mqtt_error_on_connect_loops_with_backoff`.

**Lifespan order in `main.py`:**

```
startup:   historian_client.startup() → processing.start() → uns_publisher.start()
shutdown:  uns_publisher.stop() → processing.stop() → historian_client.shutdown()
```

Reverse order on shutdown matters: the publisher reads from `processing.LatestState`, which reads via `historian_client`. Each layer must stop before the layer it depends on tears down.

## 5. Configuration

| Env var | Default | Notes |
|---|---|---|
| `UNS_PUBLISH_ENABLED` | `false` | Master switch. Ships off — flip after smoke test §6. |
| `UNS_MQTT_HOST` | `192.254.155.2` | EMQX broker. |
| `UNS_MQTT_PORT` | `1883` | Plain MQTT, no TLS. |
| `UNS_MQTT_CLIENT_ID` | `rav221-separator-energy` | Must be unique on the broker. |
| `UNS_MQTT_USERNAME` | (empty) | Set if EMQX requires auth. |
| `UNS_MQTT_PASSWORD` | (empty) | Set with username. |
| `UNS_MQTT_KEEPALIVE_SEC` | `60` | LWT fires after ~1.5× this without traffic. |
| `UNS_PUBLISH_BASE_TOPIC` | `Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Energy` | Sibling of `Edge`, not nested under it. Spaces and `Seperator` typo preserved. |
| `UNS_PUBLISH_INTERVAL_SEC` | `5` | Tick rate. |
| `UNS_PUBLISH_QOS` | `1` | At-least-once. |
| `UNS_PUBLISH_RETAIN_DATA` | `true` | Data topics retained; `_snapshot` always non-retained regardless. |
| `UNS_RECONNECT_MAX_BACKOFF` | `60` | Max sleep between reconnect attempts. |
| `UNS_HEARTBEAT_FLOOR_SEC` | `60` | Republish unchanged values at least this often. |

All declared explicitly in `docker-compose.yml` rather than relying on defaults, matching the existing convention.

## 6. Smoke test plan

```bash
# Step 1 — code deployed, publisher OFF, nothing on the broker
cd ~/Rav2.21/separator-energy-dashboard
docker compose up -d --build
docker compose logs separator-dashboard | grep -i uns
# Expected: no UNS publisher startup line. Dashboard otherwise unchanged.

# Step 2 — probe broker reachability from inside the container's network
docker compose exec separator-dashboard sh -c \
    "timeout 3 nc -zv 192.254.155.2 1883"
# Expected: "succeeded" or "open". If not, network/firewall issue, not our code.

# Step 3 — subscribe externally first, so you can see the publisher come up
mosquitto_sub -h 192.254.155.2 -p 1883 -v \
    -t "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Energy/#"
# Expected at this point: nothing (publisher still disabled).

# Step 4 — flip the flag, restart
# Edit docker-compose.yml: UNS_PUBLISH_ENABLED=true
docker compose up -d --force-recreate
docker compose logs -f separator-dashboard | grep -i uns
# Expected lines:
#   uns_publisher: started (base='Driftwood Dairy/...', interval=5.0s, heartbeat_floor=60.0s)
#   uns_publisher: connected to 192.254.155.2:1883 as rav221-separator-energy,
#                  LWT on Driftwood Dairy/.../_status

# Step 5 — verify subscriber sees traffic
# The mosquitto_sub from Step 3 should now show, in order:
#   .../Energy/_status      "starting"
#   .../Energy/_status      "online"
#   .../Energy/kw           33.0
#   .../Energy/state        "Processing"
#   .../Energy/cost_per_hour 9.9
#   ... (tick every 5s; values mostly suppressed by change detection;
#         _snapshot publishes every tick)

# Step 6 — verify in MQTT Explorer
# Connect to 192.254.155.2:1883, navigate the existing tree.
# The "Energy" folder should appear as a new sibling under .../Seperator/1/Edge/
# alongside Alarms, Faults, Configuration, etc.

# Step 7 — verify LWT by killing the container ungracefully
docker compose kill separator-dashboard
# Expected within ~1.5× keepalive (90s): mosquitto_sub shows
#   .../Energy/_status      "offline"
# Then restart cleanly:
docker compose up -d separator-dashboard
# Expected:
#   .../Energy/_status      "starting"  (then "online" after first tick)

# Step 8 — verify clean-shutdown publish
docker compose stop separator-dashboard
# Expected promptly: mosquitto_sub shows
#   .../Energy/_status      "offline"
# (Came from the publisher itself, not the broker's LWT — same observable
# state, but the publish happens within ~1s instead of waiting for keepalive.)
```

### Troubleshooting

| Symptom | Likely cause | Where to look |
|---|---|---|
| Step 2 nc check times out | Broker unreachable from container's network | Try from host: `nc -zv 192.254.155.2 1883`. Host works but container doesn't → Docker network issue, not Rav2.21. |
| Step 4 logs show `connection error: ...refused` | Broker reachable but auth required | Set `UNS_MQTT_USERNAME` and `UNS_MQTT_PASSWORD` in compose. |
| Step 4 logs show `connected` but Step 5 only shows `_status: starting`, never `online` | Cold start — `last_good_update` still None because historian hasn't returned good data yet | Check `/api/energy/current` — if `is_stale: true`, fix upstream first. Publisher is deliberately silent until processing has good data. |
| Topics appear in `mosquitto_sub` but not in MQTT Explorer's tree | UI thing — MQTT Explorer needs a connection refresh, not a publisher fix | Right-click the connection → reconnect. |
| Step 7 LWT doesn't fire | Container shut down cleanly (DISCONNECT packet suppressed LWT) | Use `docker compose kill -s SIGKILL` or yank the network, not `docker compose stop`. |

## 7. Rollback

Single env var:

```bash
# In docker-compose.yml:
UNS_PUBLISH_ENABLED=false
docker compose up -d --force-recreate
```

Publisher's `stop()` publishes `"offline"` retained on the way down, then disconnects cleanly. Retained data topics on the broker remain in place until something publishes over them; they're harmless. If a permanent rollback wants to clear them:

```bash
for topic in kw state cost_per_hour cost_today tou_period tou_rate shift is_stale _status _snapshot; do
    mosquitto_pub -h 192.254.155.2 -p 1883 -r -n \
        -t "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Energy/$topic"
done
```

## 8. Files changed

```
NEW    backend/services/uns_publisher.py        ~290 lines
NEW    backend/tests/test_uns_publisher.py      ~250 lines, 12 tests
NEW    docs/phase3a-uns-publisher.md            this document
EDIT   backend/config.py                        +UNS_* block
EDIT   backend/main.py                          +uns_publisher in lifespan, gated on UNS_PUBLISH_ENABLED
EDIT   backend/requirements.txt                 +aiomqtt==2.3.0
EDIT   docker-compose.yml                       +UNS_* env block
```

No edits to `services/processing.py`, `services/i3x_client.py`, `services/historian_client.py`, `services/state_engine.py`, `services/cost_calculator.py`, `routers/energy.py`, the i3X producer module, or anything in `frontend/`. The publisher is strictly egress — it reads from `processing.LatestState` and writes to MQTT, touching no existing publish/read paths.

## 9. Known limitations and future work

- **Single separator.** The base path is a single config var. If/when Rav2.21 expands to multiple separators, either run a second container with a different `UNS_PUBLISH_BASE_TOPIC` or refactor the publisher to loop over a list of units.
- **Test coverage is method-level, not wire-level.** The 12 tests stub `aiomqtt.Client` at the method level — they prove "given a connected client, the publisher calls `.publish()` with the right args" but not "the publisher actually establishes a CONNECT packet with the correct keepalive and LWT against a real broker." The smoke test in §6 closes that gap on first deploy. Same shape as the gap acknowledged in Phase 1's i3X client tests.
- **No Sparkplug B.** Plain MQTT only. Sparkplug would offer death certificates, birth metrics, and explicit type metadata, but the existing UNS tree in this facility is plain MQTT and matching it was the goal. Sparkplug can be a future protocol option without changing this publisher.
