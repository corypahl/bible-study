const readings = window.ST_MARTHA_READINGS;
const bookCache = new Map();
const passageCache = new Map();
let availableVoices = [];

const bookMap = {
  "1 Cor": "1-corinthians",
  "1 John": "1-john",
  "1 Kgs": "3-kings",
  "1 Peter": "1-peter",
  "1 Thess": "1-thessalonians",
  "2 Cor": "2-corinthians",
  "2 Kgs": "4-kings",
  "2 Pet": "2-peter",
  "2 Sam": "2-kings",
  "Acts": "acts",
  "Ezek": "ezechiel",
  "Exod": "exodus",
  "Hos": "osee",
  "Isa": "isaie",
  "Jer": "jeremie",
  "John": "john",
  "Luke": "luke",
  "Mal": "malachie",
  "Mark": "mark",
  "Matt": "matthew",
  "Phil": "philippians",
  "Prov": "proverbs",
  "Ps": "psalms",
  "Rev": "apocalypse",
  "Rom": "romans",
  "Sir": "ecclesiasticus",
  "Wis": "wisdom",
  "Zech": "zacharias"
};

const elements = {
  select: document.querySelector("#weekSelect"),
  voiceSelect: document.querySelector("#voiceSelect"),
  liturgicalDate: document.querySelector("#liturgicalDate"),
  title: document.querySelector("#weekTitle"),
  theme: document.querySelector("#weekTheme"),
  readingsList: document.querySelector("#readingsList"),
  reflection: document.querySelector("#reflectionText"),
  discussion: document.querySelector("#discussionList"),
  prayer: document.querySelector("#prayerText"),
  officialLink: document.querySelector("#officialLink")
};

const preferredVoiceTerms = [
  "natural",
  "premium",
  "enhanced",
  "neural",
  "samantha",
  "ava",
  "allison",
  "susan",
  "victoria",
  "google us english",
  "microsoft aria",
  "microsoft jenny",
  "microsoft mark",
  "microsoft zira"
];

const defaultVoiceLang = "en-US";

function formatDisplayDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function findDefaultIndex() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = readings.findIndex((week) => new Date(`${week.date}T00:00:00`) >= today);
  return next === -1 ? readings.length - 1 : next;
}

function populateSelect() {
  readings.forEach((week, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${formatDisplayDate(week.date)} - ${week.title}`;
    elements.select.append(option);
  });
}

function scoreVoice(voice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = 0;

  if (lang.startsWith("en-us")) {
    score += 8;
  } else if (lang.startsWith("en")) {
    score += 5;
  }

  preferredVoiceTerms.forEach((term, index) => {
    if (name.includes(term)) {
      score += 20 - index;
    }
  });

  if (voice.localService) {
    score += 1;
  }

  return score;
}

function getVoiceId(voice) {
  return `${voice.name}::${voice.lang}`;
}

function getBestVoice() {
  const englishUsVoices = availableVoices.filter((voice) => voice.lang.toLowerCase() === defaultVoiceLang.toLowerCase());
  const englishVoices = availableVoices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  return (englishUsVoices.length ? englishUsVoices : englishVoices)
    .sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
}

function populateVoiceSelect() {
  if (!("speechSynthesis" in window) || !elements.voiceSelect) {
    return;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    return;
  }

  availableVoices = voices;
  const savedVoice = localStorage.getItem("stMarthaVoice");
  const bestVoice = getBestVoice();
  const selectedVoice = savedVoice || (bestVoice ? getVoiceId(bestVoice) : "");

  elements.voiceSelect.innerHTML = "";
  const englishUsVoices = availableVoices.filter((voice) => voice.lang.toLowerCase() === defaultVoiceLang.toLowerCase());
  const englishVoices = availableVoices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const displayedVoices = englishUsVoices.length ? englishUsVoices : englishVoices;

  displayedVoices
    .sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name))
    .forEach((voice) => {
      const option = document.createElement("option");
      option.value = getVoiceId(voice);
      option.textContent = `${voice.name} (${voice.lang})`;
      elements.voiceSelect.append(option);
    });

  if (!elements.voiceSelect.options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Default voice";
    elements.voiceSelect.append(option);
  }

  elements.voiceSelect.value = [...elements.voiceSelect.options].some((option) => option.value === selectedVoice)
    ? selectedVoice
    : elements.voiceSelect.options[0].value;
}

function getSelectedVoice() {
  const voiceId = elements.voiceSelect ? elements.voiceSelect.value : "";
  return availableVoices.find((voice) => getVoiceId(voice) === voiceId) || getBestVoice();
}

function sanitizeReference(ref) {
  return ref
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\bor\b.*$/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\bcf\.\s*/gi, "")
    .trim();
}

function getBookKey(ref) {
  const names = Object.keys(bookMap).sort((a, b) => b.length - a.length);
  return names.find((name) => ref === name || ref.startsWith(`${name} `));
}

function parseVerseNumber(value) {
  const match = String(value).trim().match(/\d+/);
  return match ? Number(match[0]) : null;
}

function toDouayPsalmChapter(chapter) {
  if (chapter <= 8 || chapter >= 148) {
    return chapter;
  }

  if (chapter <= 113) {
    return chapter - 1;
  }

  if (chapter === 114 || chapter === 115) {
    return 113;
  }

  if (chapter === 116) {
    return 114;
  }

  if (chapter <= 146) {
    return chapter - 1;
  }

  return 146;
}

function normalizeChapter(bookKey, chapter) {
  return bookKey === "Ps" ? toDouayPsalmChapter(chapter) : chapter;
}

function parseSegments(ref) {
  const cleanRef = sanitizeReference(ref);
  const bookKey = getBookKey(cleanRef);
  if (!bookKey) {
    throw new Error(`Unsupported book in reference: ${ref}`);
  }

  const segmentText = cleanRef.slice(bookKey.length).trim();
  const parts = segmentText.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  const segments = [];
  let currentChapter = null;

  parts.forEach((part) => {
    const normalized = part.replace(/\+/g, ",");
    normalized.split(",").map((piece) => piece.trim()).filter(Boolean).forEach((piece) => {
      let working = piece;
      if (working.includes(":")) {
        const chapterMatch = working.match(/^(\d+)\s*:/);
        if (chapterMatch) {
          currentChapter = Number(chapterMatch[1]);
          working = working.slice(chapterMatch[0].length);
        }
      }

      if (!currentChapter) {
        return;
      }

      if (working.includes("-")) {
        const [startRaw, endRaw] = working.split("-").map((value) => value.trim());
        const start = parseVerseNumber(startRaw);
        let endChapter = currentChapter;
        let end = parseVerseNumber(endRaw);

        if (endRaw.includes(":")) {
          const [chapterRaw, verseRaw] = endRaw.split(":");
          endChapter = Number(chapterRaw);
          end = parseVerseNumber(verseRaw);
        }

        if (start && end) {
          segments.push({
            chapter: normalizeChapter(bookKey, currentChapter),
            start,
            endChapter: normalizeChapter(bookKey, endChapter),
            end
          });
          currentChapter = endChapter;
        }
      } else {
        const verse = parseVerseNumber(working);
        if (verse) {
          segments.push({
            chapter: normalizeChapter(bookKey, currentChapter),
            start: verse,
            endChapter: normalizeChapter(bookKey, currentChapter),
            end: verse
          });
        }
      }
    });
  });

  return { bookKey, file: bookMap[bookKey], segments };
}

async function loadBook(file) {
  if (bookCache.has(file)) {
    return bookCache.get(file);
  }

  const url = `https://raw.githubusercontent.com/janvier-s/original-douay-rheims/main/bible/raw/${file}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${file}`);
  }

  const data = await response.json();
  bookCache.set(file, data);
  return data;
}

function getChapter(book, chapterNumber) {
  return book.chapters.find((chapter) => Number(chapter.chapter) === Number(chapterNumber));
}

function versesForSegment(book, segment) {
  const verses = [];
  for (let chapterNumber = segment.chapter; chapterNumber <= segment.endChapter; chapterNumber += 1) {
    const chapter = getChapter(book, chapterNumber);
    if (!chapter) {
      continue;
    }

    const start = chapterNumber === segment.chapter ? segment.start : 1;
    const end = chapterNumber === segment.endChapter
      ? segment.end
      : Math.max(...chapter.verses.map((verse) => Number(verse.verse)));

    chapter.verses.forEach((verse) => {
      const verseNumber = Number(verse.verse);
      if (verseNumber >= start && verseNumber <= end) {
        const text = String(verse.text).replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
        verses.push(text);
      }
    });
  }
  return verses;
}

async function loadPassage(ref) {
  const cacheKey = sanitizeReference(ref);
  if (passageCache.has(cacheKey)) {
    return passageCache.get(cacheKey);
  }

  const parsed = parseSegments(ref);
  const book = await loadBook(parsed.file);
  const text = parsed.segments
    .flatMap((segment) => versesForSegment(book, segment))
    .join("\n");

  const result = text || "Passage text is not available for this citation. Use the official readings link for the liturgical text.";
  passageCache.set(cacheKey, result);
  return result;
}

function setLoadingReadings(week) {
  elements.readingsList.innerHTML = "";
  week.readings.forEach((reading, index) => {
    const article = document.createElement("article");
    article.className = "reading";
    article.innerHTML = `
      <div class="reading-header">
        <div>
          <h3>${reading.label}</h3>
          <cite>${reading.ref}</cite>
        </div>
        <div class="reading-actions">
          <button class="small-button read-reading-button" type="button" data-reading-index="${index}" disabled>
            Read
          </button>
          <button class="small-button stop-reading-button" type="button">
            Stop
          </button>
        </div>
      </div>
      <p class="reading-text loading">Loading passage text...</p>
    `;
    elements.readingsList.append(article);
  });
}

async function renderReadings(week) {
  const cards = [...elements.readingsList.querySelectorAll(".reading")];

  await Promise.all(week.readings.map(async (reading, index) => {
    const textElement = cards[index].querySelector(".reading-text");
    try {
      textElement.textContent = await loadPassage(reading.ref);
      textElement.classList.remove("loading");
      cards[index].querySelector(".read-reading-button").disabled = false;
    } catch (error) {
      textElement.textContent = "Passage text could not be loaded. Use the official readings link for this citation.";
      textElement.classList.add("loading");
      console.warn(error);
    }
  }));
}

function renderWeek(index) {
  window.speechSynthesis.cancel();
  const week = readings[index];

  elements.liturgicalDate.textContent = `${formatDisplayDate(week.date)} - ${week.cycle}`;
  elements.title.textContent = week.title;
  elements.theme.textContent = week.theme;
  elements.reflection.textContent = week.reflection;
  elements.prayer.textContent = week.prayer;
  elements.officialLink.href = week.officialUrl;

  elements.discussion.innerHTML = "";
  week.discussion.forEach((question) => {
    const item = document.createElement("li");
    item.textContent = question;
    elements.discussion.append(item);
  });

  setLoadingReadings(week);
  renderReadings(week);
}

function speakReading(index) {
  if (!("speechSynthesis" in window)) {
    alert("This browser does not support built-in text to speech.");
    return;
  }

  const card = elements.readingsList.querySelectorAll(".reading")[index];
  if (!card) {
    return;
  }

  const label = card.querySelector("h3").textContent;
  const ref = card.querySelector("cite").textContent;
  const text = card.querySelector(".reading-text").textContent;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`${label}. ${ref}. ${text}`);
  const voice = getSelectedVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = defaultVoiceLang;
  }
  utterance.rate = 0.88;
  utterance.pitch = 1.02;
  window.speechSynthesis.speak(utterance);
}

populateSelect();
populateVoiceSelect();
const defaultIndex = findDefaultIndex();
elements.select.value = String(defaultIndex);
renderWeek(defaultIndex);

elements.select.addEventListener("change", (event) => {
  renderWeek(Number(event.target.value));
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", populateVoiceSelect);
}

if (elements.voiceSelect) {
  elements.voiceSelect.addEventListener("change", () => {
    localStorage.setItem("stMarthaVoice", elements.voiceSelect.value);
    window.speechSynthesis.cancel();
  });
}

elements.readingsList.addEventListener("click", (event) => {
  const readButton = event.target.closest(".read-reading-button");
  if (readButton) {
    speakReading(Number(readButton.dataset.readingIndex));
    return;
  }

  if (event.target.closest(".stop-reading-button")) {
    window.speechSynthesis.cancel();
  }
});
