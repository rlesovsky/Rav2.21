"""Catalog integrity tests."""

from unittest import TestCase

from i3x_server import model


class CatalogShapeTests(TestCase):
    def test_counts(self) -> None:
        self.assertEqual(len(model.NAMESPACES), 1)
        self.assertEqual(len(model.OBJECT_TYPES), 2)
        self.assertEqual(len(model.RELATIONSHIP_TYPES), 1)
        self.assertEqual(len(model.FOLDERS), 3)
        self.assertEqual(len(model.TAGS), 9)
        self.assertEqual(len(model.ALL_OBJECTS), 12)

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

    def test_every_tag_under_unit_folder(self) -> None:
        for tag in model.TAGS:
            self.assertEqual(tag["parentId"], model.F_UNIT,
                             f"{tag['elementId']} not under {model.F_UNIT}")

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

    def test_unit_folder_has_nine_tag_children(self) -> None:
        children = model.get_children(model.F_UNIT)
        self.assertEqual(len(children), 9)
        self.assertTrue(all(model.is_tag(c) for c in children))
