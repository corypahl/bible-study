import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeSourceText, parseReadingFile } from "../scripts/import-readings.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

test("repairs common UTF-8 mojibake", () => {
  assert.equal(
    normalizeSourceText("Jesusâ€™ heart â€œwas movedâ€"),
    "Jesus’ heart “was moved”"
  );
});

test("parses a dated reading file into normalized sections", async () => {
  const filename = path.join(projectRoot, "data", "readings", "061426.txt");
  const parsed = parseReadingFile(filename, await fs.readFile(filename, "utf8"));

  assert.equal(parsed.date, "2026-06-14");
  assert.equal(parsed.title, "Eleventh Sunday in Ordinary Time");
  assert.equal(parsed.lectionary, 91);
  assert.deepEqual(
    parsed.readings.map(({ label, ref }) => ({ label, ref })),
    [
      { label: "First Reading", ref: "Exodus 19:2-6a" },
      { label: "Responsorial Psalm", ref: "Psalm 100:1-2, 3, 5" },
      { label: "Second Reading", ref: "Romans 5:6-11" },
      { label: "Alleluia", ref: "Mark 1:15" },
      { label: "Gospel", ref: "Matthew 9:36—10:8" }
    ]
  );
  assert.match(parsed.readings[0].text, /eagle wings/);
  assert.doesNotMatch(parsed.readings[0].text, /â/);
});

test("rejects an empty reading file with a clear error", () => {
  assert.throws(
    () => parseReadingFile("011826.txt", ""),
    /file is empty/
  );
});

test("keeps sequences separate and removes alternate short Gospels", async () => {
  const corpusChristi = path.join(projectRoot, "data", "readings", "060726.txt");
  const corpusParsed = parseReadingFile(corpusChristi, await fs.readFile(corpusChristi, "utf8"));
  const sequence = corpusParsed.readings.find((reading) => reading.label === "Sequence");
  assert.equal(sequence.ref, "Lauda Sion");
  assert.match(sequence.text, /^Laud, O Zion/);

  const fifteenthSunday = path.join(projectRoot, "data", "readings", "071226.txt");
  const fifteenthParsed = parseReadingFile(
    fifteenthSunday,
    await fs.readFile(fifteenthSunday, "utf8")
  );
  const gospel = fifteenthParsed.readings.find((reading) => reading.label === "Gospel");
  assert.doesNotMatch(gospel.text, /\nor\nMatthew 13:1-9/);
});
