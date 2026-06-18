import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import OpenAI from "openai";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const defaultInputDirectory = path.join(projectRoot, "data", "readings");
const defaultOutputFile = path.join(projectRoot, "data", "readings.js");
const defaultModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const sectionLabels = new Map([
  ["reading 1", "First Reading"],
  ["reading i", "First Reading"],
  ["first reading", "First Reading"],
  ["responsorial psalm", "Responsorial Psalm"],
  ["reading 2", "Second Reading"],
  ["reading ii", "Second Reading"],
  ["second reading", "Second Reading"],
  ["alleluia", "Alleluia"],
  ["verse before the gospel", "Verse Before the Gospel"],
  ["gospel", "Gospel"]
]);

const studySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    theme: { type: "string" },
    reflection: { type: "string" },
    discussionLevels: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", enum: ["Personal", "Work", "Family"] },
          helper: { type: "string" },
          questions: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: { type: "string" }
          }
        },
        required: ["title", "helper", "questions"]
      }
    },
    prayer: { type: "string" }
  },
  required: ["theme", "reflection", "discussionLevels", "prayer"]
};

function repairMojibake(value) {
  if (!/[Ãâ€™œž€]/.test(value)) {
    return value;
  }

  const windows1252Bytes = new Map([
    [0x20ac, 0x80],
    [0x201a, 0x82],
    [0x0192, 0x83],
    [0x201e, 0x84],
    [0x2026, 0x85],
    [0x2020, 0x86],
    [0x2021, 0x87],
    [0x02c6, 0x88],
    [0x2030, 0x89],
    [0x0160, 0x8a],
    [0x2039, 0x8b],
    [0x0152, 0x8c],
    [0x017d, 0x8e],
    [0x2018, 0x91],
    [0x2019, 0x92],
    [0x201c, 0x93],
    [0x201d, 0x94],
    [0x2022, 0x95],
    [0x2013, 0x96],
    [0x2014, 0x97],
    [0x02dc, 0x98],
    [0x2122, 0x99],
    [0x0161, 0x9a],
    [0x203a, 0x9b],
    [0x0153, 0x9c],
    [0x017e, 0x9e],
    [0x0178, 0x9f]
  ]);

  const bytes = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
    } else if (windows1252Bytes.has(codePoint)) {
      bytes.push(windows1252Bytes.get(codePoint));
    } else {
      return value;
    }
  }

  try {
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
    const originalErrors = (value.match(/[Ãâ�]/g) || []).length;
    const repairedErrors = (repaired.match(/[Ãâ�]/g) || []).length;
    return repairedErrors < originalErrors ? repaired : value;
  } catch {
    return value;
  }
}

export function normalizeSourceText(value) {
  return repairMojibake(value)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseDateFromFilename(filename) {
  const match = path.basename(filename).match(/^(\d{2})(\d{2})(\d{2})\.txt$/i);
  if (!match) {
    throw new Error(`${filename}: expected a filename in MMDDYY.txt format`);
  }

  const [, month, day, year] = match;
  const fullYear = 2000 + Number(year);
  const date = `${fullYear}-${month}-${day}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (
    parsed.getUTCFullYear() !== fullYear
    || parsed.getUTCMonth() + 1 !== Number(month)
    || parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error(`${filename}: filename does not contain a valid date`);
  }

  return date;
}

function normalizeSectionLabel(line) {
  const normalized = line.trim().toLowerCase();
  if (normalized.startsWith("at the procession with palms") && normalized.endsWith("gospel")) {
    return "Procession Gospel";
  }
  if (normalized.startsWith("at the mass") && /reading\s+(1|i)$/.test(normalized)) {
    return "First Reading";
  }
  if (normalized.startsWith("sequence")) {
    return "Sequence";
  }
  return sectionLabels.get(normalized) || null;
}

export function parseReadingFile(filename, rawText) {
  const normalized = normalizeSourceText(rawText);
  const lines = normalized.split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex === -1) {
    throw new Error(`${filename}: file is empty`);
  }

  const title = lines[firstContentIndex].trim();
  const lectionaryLine = lines
    .slice(firstContentIndex + 1)
    .find((line) => /^lectionary\s*:/i.test(line.trim()));
  const lectionaryMatch = lectionaryLine?.match(/lectionary\s*:\s*(\d+)/i);
  const readings = [];

  let index = firstContentIndex + 1;
  while (index < lines.length) {
    const heading = lines[index].trim();
    const label = normalizeSectionLabel(heading);
    if (!label) {
      index += 1;
      continue;
    }

    index += 1;
    while (index < lines.length && !lines[index].trim()) {
      index += 1;
    }

    let ref;
    if (label === "Sequence") {
      ref = heading.replace(/^sequence\s*[\u2014\u2013-]?\s*/i, "").trim() || "Sequence";
    } else {
      ref = lines[index]?.trim();
      if (!ref || normalizeSectionLabel(ref)) {
        throw new Error(`${filename}: ${label} is missing a citation`);
      }
      index += 1;
    }

    const body = [];
    while (index < lines.length && !normalizeSectionLabel(lines[index])) {
      body.push(lines[index]);
      index += 1;
    }

    let text = body.join("\n").replace(/^\n+|\n+$/g, "").replace(/\n{3,}/g, "\n\n");
    if (!["Responsorial Psalm", "Alleluia", "Verse Before the Gospel"].includes(label)) {
      [text] = text.split(/\n\s*or:?\s*\n+(?=(?:[1-3]\s+)?[A-Z])/i);
      text = text.trim();
    }
    if (!text) {
      throw new Error(`${filename}: ${label} is missing passage text`);
    }

    readings.push({ label, ref, text });
  }

  if (!readings.some((reading) => reading.label === "Gospel")) {
    throw new Error(`${filename}: no Gospel section was found`);
  }

  return {
    date: parseDateFromFilename(filename),
    title,
    lectionary: lectionaryMatch ? Number(lectionaryMatch[1]) : null,
    readings
  };
}

function validateStudyContent(content) {
  const expectedTitles = ["Personal", "Work", "Family"];
  if (!content || !Array.isArray(content.discussionLevels)) {
    throw new Error("AI response did not contain discussionLevels");
  }

  const titles = content.discussionLevels.map((level) => level.title);
  if (titles.join("|") !== expectedTitles.join("|")) {
    throw new Error(`AI response discussion order must be ${expectedTitles.join(", ")}`);
  }

  for (const field of ["theme", "reflection", "prayer"]) {
    if (typeof content[field] !== "string" || !content[field].trim()) {
      throw new Error(`AI response is missing ${field}`);
    }
  }

  content.discussionLevels.forEach((level) => {
    if (!level.helper?.trim() || level.questions?.length !== 3 || level.questions.some((item) => !item.trim())) {
      throw new Error(`AI response contains an incomplete ${level.title} discussion section`);
    }
  });
}

function existingWeekHasStudyContent(week) {
  return Boolean(
    week
    && typeof week.theme === "string"
    && week.theme.trim()
    && typeof week.reflection === "string"
    && week.reflection.trim()
    && typeof week.prayer === "string"
    && week.prayer.trim()
    && (
      Array.isArray(week.discussionLevels)
      || Array.isArray(week.discussion)
    )
  );
}

async function generateStudyContent(client, parsedFile, model) {
  const readingInput = parsedFile.readings
    .map((reading) => `${reading.label}\n${reading.ref}\n${reading.text}`)
    .join("\n\n");

  const response = await client.responses.create({
    model,
    store: false,
    reasoning: { effort: "low" },
    instructions: [
      "You prepare a Roman Catholic Sunday Bible study for 3-4 families, with adults participating and no children in the discussion.",
      "Use only the supplied readings. Do not introduce claims that are not grounded in them.",
      "Write a one-sentence theme, a concise 120-180 word reflection, and a brief closing prayer.",
      "Create exactly three discussion sections in this order: Personal, Work, Family.",
      "Each section needs a reading-specific helper sentence and exactly three distinct questions.",
      "Questions must cite concrete people, images, tensions, or teachings from these readings and connect them to realistic current-life situations.",
      "Avoid generic templates such as 'How does this apply?' and do not repeat a question across sections.",
      "Keep the tone thoughtful, practical, faithful to Catholic teaching, and suitable for spoken group discussion."
    ].join(" "),
    input: `Sunday: ${parsedFile.title}\nDate: ${parsedFile.date}\n\n${readingInput}`,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "sunday_study_content",
        strict: true,
        schema: studySchema
      }
    }
  });

  if (!response.output_text) {
    throw new Error("OpenAI returned no text output");
  }

  const content = JSON.parse(response.output_text);
  validateStudyContent(content);
  return content;
}

async function loadExistingWeeks(filename) {
  const source = await fs.readFile(filename, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename });
  const weeks = sandbox.window.ST_MARTHA_READINGS;
  if (!Array.isArray(weeks)) {
    throw new Error(`${filename}: window.ST_MARTHA_READINGS was not an array`);
  }
  return weeks;
}

function mergeImportedWeek(existingWeek, parsedFile, studyContent, sourceFilename) {
  const importedWeek = {
    ...existingWeek,
    title: parsedFile.title,
    ...(parsedFile.lectionary ? { lectionary: parsedFile.lectionary } : {}),
    readings: parsedFile.readings,
    sourceFile: `data/readings/${sourceFilename}`
  };

  if (!studyContent) {
    return importedWeek;
  }

  const { discussion: _legacyDiscussion, ...currentWeek } = importedWeek;
  return {
    ...currentWeek,
    theme: studyContent.theme.trim(),
    reflection: studyContent.reflection.trim(),
    discussionLevels: studyContent.discussionLevels.map((level) => ({
      title: level.title,
      helper: level.helper.trim(),
      questions: level.questions.map((question) => question.trim())
    })),
    prayer: studyContent.prayer.trim()
  };
}

function serializeWeeks(weeks) {
  return `window.ST_MARTHA_READINGS = ${JSON.stringify(weeks, null, 2)};\n`;
}

function parseArguments(argv) {
  const options = {
    dryRun: false,
    files: [],
    inputDirectory: defaultInputDirectory,
    outputFile: defaultOutputFile,
    model: defaultModel,
    studyData: null,
    skipInvalid: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--file") {
      options.files.push(argv[++index]);
    } else if (argument === "--input-dir") {
      options.inputDirectory = path.resolve(argv[++index]);
    } else if (argument === "--output") {
      options.outputFile = path.resolve(argv[++index]);
    } else if (argument === "--model") {
      options.model = argv[++index];
    } else if (argument === "--study-data") {
      options.studyData = path.resolve(argv[++index]);
    } else if (argument === "--skip-invalid") {
      options.skipInvalid = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

async function findInputFiles(options) {
  if (options.files.length) {
    return options.files.map((filename) => path.resolve(filename));
  }

  const entries = await fs.readdir(options.inputDirectory, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /^\d{6}\.txt$/i.test(entry.name))
    .map((entry) => path.join(options.inputDirectory, entry.name))
    .sort();

  const files = [];
  for (const filename of candidates) {
    const stats = await fs.stat(filename);
    if (stats.size > 0) {
      files.push(filename);
    }
  }

  return files;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.studyData && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const inputFiles = await findInputFiles(options);
  if (!inputFiles.length) {
    throw new Error(`No MMDDYY.txt files found in ${options.inputDirectory}`);
  }

  const weeks = await loadExistingWeeks(options.outputFile);
  const client = options.studyData ? null : new OpenAI();
  const studyData = options.studyData
    ? JSON.parse(await fs.readFile(options.studyData, "utf8"))
    : null;

  for (const inputFile of inputFiles) {
    const rawText = await fs.readFile(inputFile, "utf8");
    let parsedFile;
    try {
      parsedFile = parseReadingFile(inputFile, rawText);
    } catch (error) {
      if (options.skipInvalid) {
        console.warn(`Skipping ${path.basename(inputFile)}: ${error.message}`);
        continue;
      }
      throw error;
    }
    const weekIndex = weeks.findIndex((week) => week.date === parsedFile.date);
    if (weekIndex === -1) {
      throw new Error(`${inputFile}: no existing readings.js entry for ${parsedFile.date}`);
    }

    console.log(`Generating study content for ${parsedFile.date} - ${parsedFile.title}`);
    const studyContent = studyData
      ? (studyData[parsedFile.date] || null)
      : await generateStudyContent(client, parsedFile, options.model);
    if (studyContent) {
      validateStudyContent(studyContent);
    } else if (!existingWeekHasStudyContent(weeks[weekIndex])) {
      throw new Error(`${inputFile}: no study content found for ${parsedFile.date}`);
    }
    weeks[weekIndex] = mergeImportedWeek(
      weeks[weekIndex],
      parsedFile,
      studyContent,
      path.basename(inputFile)
    );
  }

  const importedWeekCount = weeks.filter(
    (week) => Array.isArray(week.readings)
      && week.readings.length > 0
      && week.readings.every((reading) => typeof reading.text === "string" && reading.text.trim())
  ).length;
  const output = serializeWeeks(weeks);
  if (options.dryRun) {
    console.log(
      `Dry run complete. ${inputFiles.length} file(s) validated and ${importedWeekCount} week(s) would be available in the app; ${options.outputFile} was not changed.`
    );
    return;
  }

  await fs.writeFile(options.outputFile, output, "utf8");
  console.log(`Updated ${options.outputFile}; ${importedWeekCount} imported week(s) are available in the app.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
