"""Route-level happy-path + error-case tests using FastAPI's TestClient."""

from unittest import TestCase
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from i3x_server.routes import router
from services import processing


def _app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    return app


def _client() -> TestClient:
    return TestClient(_app())


class InfoTests(TestCase):
    def test_info_returns_spec_and_capabilities(self) -> None:
        with _client() as c:
            r = c.get("/api/i3x/v1/info")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        result = body["result"]
        self.assertEqual(result["specVersion"], "1.0")
        self.assertEqual(result["serverVersion"], "beta")
        # Capability shape matches the reference server.
        self.assertIn("query", result["capabilities"])
        self.assertIn("update", result["capabilities"])
        self.assertIn("subscribe", result["capabilities"])


class NamespacesTests(TestCase):
    def test_lists_our_single_namespace(self) -> None:
        with _client() as c:
            r = c.get("/api/i3x/v1/namespaces")
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(len(body["result"]), 1)
        self.assertIn("uri", body["result"][0])
        self.assertIn("displayName", body["result"][0])


class ObjectsTests(TestCase):
    def test_get_objects_returns_full_catalog(self) -> None:
        with _client() as c:
            r = c.get("/api/i3x/v1/objects")
        body = r.json()
        self.assertTrue(body["success"])
        # 7 folders + 9 tags = 16
        self.assertEqual(len(body["result"]), 16)

    def test_get_objects_root_true_returns_only_top_level(self) -> None:
        # Spec: GET /objects?root=true returns roots (parentId=None) only.
        # Without this, i3X Explorer's Hierarchy tab shows every folder
        # as a duplicate root.
        with _client() as c:
            r = c.get("/api/i3x/v1/objects?root=true")
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(len(body["result"]), 1)
        self.assertEqual(body["result"][0]["elementId"], "driftwood-dairy")
        self.assertIsNone(body["result"][0]["parentId"])
        # ObjectInstance shape: only public fields, NO typeId / hasChildren / namespaceUri.
        first = body["result"][0]
        self.assertIn("typeElementId", first)
        self.assertNotIn("typeId", first)
        self.assertNotIn("hasChildren", first)
        self.assertNotIn("namespaceUri", first)

    def test_objects_list_known_id_succeeds(self) -> None:
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/list",
                       json={"elementIds": ["separator-1-kw"]})
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(len(body["results"]), 1)
        item = body["results"][0]
        self.assertTrue(item["success"])
        self.assertEqual(item["elementId"], "separator-1-kw")
        self.assertIsNone(item["error"])
        self.assertIsNone(item["subscriptionId"])

    def test_objects_list_unknown_id_per_element_error(self) -> None:
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/list",
                       json={"elementIds": ["does-not-exist"]})
        # Bulk wrapper still 200; per-element error.
        self.assertEqual(r.status_code, 200)
        item = r.json()["results"][0]
        self.assertFalse(item["success"])
        self.assertEqual(item["error"]["code"], "NotFound")

    def test_objects_list_empty_array_returns_422(self) -> None:
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/list", json={"elementIds": []})
        self.assertEqual(r.status_code, 422)

    def test_objects_related_returns_parent_and_children(self) -> None:
        """Reference shape: per-element result is a list of
        {sourceRelationship, object} items — parent (HasParent) and each
        child (HasComponent). For separator-1 that's 1 parent + 2 subfolders
        (Edge, Energy) = 3."""
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/related",
                       json={"elementIds": ["separator-1"]})
        body = r.json()
        self.assertTrue(body["success"])
        related = body["results"][0]["result"]
        self.assertEqual(len(related), 3)
        kinds = [item["sourceRelationship"] for item in related]
        self.assertEqual(kinds.count("HasParent"), 1)
        self.assertEqual(kinds.count("HasComponent"), 2)

    def test_objects_related_includes_metadata_when_requested(self) -> None:
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/related",
                       json={"elementIds": ["separator-1-kw"], "includeMetadata": True})
        related = r.json()["results"][0]["result"]
        # Each related object should now carry a metadata block.
        for item in related:
            self.assertIn("metadata", item["object"])
            self.assertIn("typeNamespaceUri", item["object"]["metadata"])

    def test_objects_related_unknown_id_per_element_error(self) -> None:
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/related",
                       json={"elementIds": ["does-not-exist"]})
        item = r.json()["results"][0]
        self.assertFalse(item["success"])
        self.assertEqual(item["error"]["code"], "NotFound")


class ValueTests(TestCase):
    def setUp(self) -> None:
        # Prime LatestState with deterministic data.
        processing._reset_for_tests()
        latest = processing.get_latest()
        latest.state = "Processing"
        latest.kw = 33.6
        latest.cost_per_hour = 5.04
        latest.cost_today = 12.50
        latest.tou_period = "Off-Peak"
        latest.shift = "1st Shift"
        latest.amps = 47.0
        latest.running = True
        latest.cip = False
        from datetime import datetime, timezone
        now = datetime(2026, 5, 10, 22, 0, 0, tzinfo=timezone.utc)
        latest.last_updated = now
        latest.last_good_update = now
        latest.is_stale = False

    def test_value_reads_from_latest_state(self) -> None:
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/value",
                       json={"elementIds": [
                           "separator-1-state",
                           "separator-1-kw",
                           "separator-1-running",
                       ]})
        body = r.json()
        results = {item["elementId"]: item for item in body["results"]}

        self.assertEqual(results["separator-1-state"]["result"]["value"], "Processing")
        self.assertEqual(results["separator-1-state"]["result"]["quality"], "Good")
        self.assertEqual(results["separator-1-kw"]["result"]["value"], 33.6)
        self.assertEqual(results["separator-1-running"]["result"]["value"], True)

        # VQT envelope guard: every result has isComposition + components keys.
        for item in body["results"]:
            r = item["result"]
            self.assertEqual(r["isComposition"], False)
            self.assertIsNone(r["components"])

    def test_value_unknown_id_per_element_error(self) -> None:
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/value",
                       json={"elementIds": ["nonexistent-tag"]})
        item = r.json()["results"][0]
        self.assertFalse(item["success"])
        self.assertEqual(item["error"]["code"], "NotFound")

    def test_stale_value_quality_is_uncertain(self) -> None:
        latest = processing.get_latest()
        latest.is_stale = True
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/value",
                       json={"elementIds": ["separator-1-kw"]})
        result = r.json()["results"][0]["result"]
        self.assertEqual(result["quality"], "Uncertain")


class HistoryTests(TestCase):
    def setUp(self) -> None:
        processing._reset_for_tests()

    def test_history_invalid_time_returns_400(self) -> None:
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/history",
                       json={
                           "elementIds": ["separator-1-kw"],
                           "startTime": "not-a-date",
                           "endTime":   "2026-05-10T22:00:00Z",
                       })
        self.assertEqual(r.status_code, 400)

    def test_history_inverted_window_returns_400(self) -> None:
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/history",
                       json={
                           "elementIds": ["separator-1-kw"],
                           "startTime": "2026-05-10T23:00:00Z",
                           "endTime":   "2026-05-10T22:00:00Z",
                       })
        self.assertEqual(r.status_code, 400)

    def test_history_empty_buffer_returns_empty_values(self) -> None:
        # Buffer is empty (test reset). Should return success + empty values list.
        with _client() as c:
            r = c.post("/api/i3x/v1/objects/history",
                       json={
                           "elementIds": ["separator-1-kw"],
                           "startTime": "2026-05-10T20:00:00Z",
                           "endTime":   "2026-05-10T22:00:00Z",
                       })
        body = r.json()
        item = body["results"][0]
        self.assertTrue(item["success"])
        self.assertEqual(item["result"]["values"], [])
        self.assertEqual(item["result"]["isComposition"], False)
