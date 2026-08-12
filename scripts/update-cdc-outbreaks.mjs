import fs from "node:fs/promises";

const feedUrl = "https://tools.cdc.gov/api/v2/resources/media/132608.rss";
const sourceUrl = "https://www.cdc.gov/outbreaks/index.html";

function decodeHtml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function parseOutbreakFeed(rss) {
  return [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((match) => {
      const itemXml = match[1];
      return {
        title: readTag(itemXml, "title"),
        description: readTag(itemXml, "description"),
        url: readTag(itemXml, "link"),
        date: readTag(itemXml, "pubDate")
      };
    })
    .filter((item) => /outbreak|warns/i.test(`${item.title} ${item.description}`))
    .filter((item) => !/transcript|audio file/i.test(`${item.title} ${item.description}`))
    .slice(0, 6);
}

const response = await fetch(feedUrl);
if (!response.ok) {
  throw new Error(`CDC feed request failed: ${response.status} ${response.statusText}`);
}

const items = parseOutbreakFeed(await response.text());
const snapshot = {
  sourceName: "CDC Current Outbreak List",
  sourceUrl,
  feedUrl,
  updatedAt: new Date().toISOString(),
  items
};

await fs.writeFile("data/cdc-outbreaks.json", `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${items.length} CDC outbreak item(s) to data/cdc-outbreaks.json`);
