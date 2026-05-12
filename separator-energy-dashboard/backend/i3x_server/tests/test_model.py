"""Catalog integrity tests."""

from unittest import TestCase

from i3x_server import model


class CatalogShapeTests(TestCase):
    def test_counts(self) -> None:
        self.assertEqual(len(model.NAMESPACES), 1)
        self.assertEqual(len(model.OBJECT_TYPES), 2)
        self.assertEqual(len(model.RELATIONSHIP_TYPES), 2)  # HasComponent + HasParent
        # 7 folders: root, site, area, class, unit, edge, energy
        self.assertEqual(len(model.FOLDERS), 7)
        self.assertEqual(len(model.TAGS), 9)
        self.assertEqual(len(model.ALL_OBJECTS), 16)

    def test_element_ids_are_unique(self) -> None:
        seen: set[str] = set()
        for obj in model.ALL_OBJECTS:
            self.assertNotIn(obj["elementId"], seen, f"duplicate elementId: {obj['elementId']}")
            seen.add(obj["elementId"])

    def test_parent_ids_resolve(self) -> None:
        for obj in model.ALL_OBJECTS:
            pid = obj["parentId"]
            if pid is None:
                continue
            self.assertIn(pid, model.ELEMENT_LOOKUP, f"{obj['elementId']} parents missing {pid}")

    def test_every_tag_under_edge_or_energy(self) -> None:
        # Passthrough tags live under Edge (mirrors MQTT); derived signals
        # under Energy (Rav2.21-computed, no MQTT analog).
        for tag in model.TAGS:
            expected = model.F_EDGE if tag["is_passthrough"] else model.F_ENERGY
            self.assertEqual(tag["parentId"], expected,
                             f"{tag['elementId']} not under {expected}")

    def test_passthrough_tags_have_historian_tag(self) -> None:
        for tag in model.TAGS:
            if tag["is_passthrough"]:
                self.assertIsNotNone(tag["historian_tag"],
                                     f"passthrough {tag['elementId']} missing historian_tag")

    def test_public_object_instance_strips_internal_fields(self) -> None:
        # Pick a tag that has internal metadata.
        tag = model.TAG_LOOKUP["separator-1-kw"]
        public = model.public_object_instance(tag)
        self.assertEqual(set(public.keys()),
                         {"elementId", "displayName", "typeElementId",
                          "parentId", "isComposition", "isExtended"})

    def test_children_lookup_matches_parents(self) -> None:
        # Every object's parent should list this object as a child.
        for obj in model.ALL_OBJECTS:
            pid = obj["parentId"]
            if pid is None:
                continue
            children = model.get_children(pid)
            self.assertIn(obj["elementId"], children)

    def test_unit_folder_has_edge_and_energy_subfolders(self) -> None:
        children = model.get_children(model.F_UNIT)
        self.assertEqual(set(children), {model.F_EDGE, model.F_ENERGY})

    def test_edge_holds_three_passthrough_tags(self) -> None:
        children = model.get_children(model.F_EDGE)
        self.assertEqual(len(children), 3)
        self.assertTrue(all(model.is_tag(c) for c in children))
        self.assertTrue(all(model.TAG_LOOKUP[c]["is_passthrough"] for c in children))

    def test_energy_holds_six_derived_tags(self) -> None:
        children = model.get_children(model.F_ENERGY)
        self.assertEqual(len(children), 6)
        self.assertTrue(all(model.is_tag(c) for c in children))
        self.assertTrue(all(not model.TAG_LOOKUP[c]["is_passthrough"] for c in children))
