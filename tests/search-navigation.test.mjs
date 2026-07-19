import assert from "node:assert/strict";
import test from "node:test";
import { moveSearchSelection, selectedSearchResult } from "../lib/search-navigation.mjs";

const results = [
  { slug: "samsung-electronics" },
  { slug: "kr-005935" },
];

test("loading search results cannot navigate with a stale selection", () => {
  assert.equal(selectedSearchResult(results, 0, true), undefined);
  assert.equal(selectedSearchResult(results, 0, false)?.slug, "samsung-electronics");
});

test("keyboard selection remains inside the available result range", () => {
  assert.equal(moveSearchSelection(0, results.length, -1), 0);
  assert.equal(moveSearchSelection(0, results.length, 1), 1);
  assert.equal(moveSearchSelection(1, results.length, 1), 1);
  assert.equal(moveSearchSelection(0, 0, 1), 0);
});
