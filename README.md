# St. Martha Sunday Bible Study

A static GitHub Pages app for a Catholic family Bible study group. It defaults to the next available Sunday, lets the group select another week, shows prepared Sunday reading text, and reads each passage aloud with the browser's built-in `speechSynthesis`.

## Import Reading Files

Place source files in `data/readings` using the Sunday date as `MMDDYY.txt`, such as `061426.txt`. Each file should contain the Sunday title, optional `Lectionary:` number, and sections headed `Reading 1`, `Responsorial Psalm`, `Reading 2`, `Alleluia`, and `Gospel`.

Install dependencies and set an OpenAI API key:

```powershell
npm install
$env:OPENAI_API_KEY = "your-api-key"
```

Validate and generate summaries without changing `data/readings.js`:

```powershell
npm run import-readings -- --dry-run
```

Import every populated dated TXT file (empty Sunday placeholders are ignored):

```powershell
npm run import-readings
```

Import one file:

```powershell
npm run import-readings -- --file data/readings/061426.txt
```

The script normalizes common encoding problems, preserves the supplied Scripture wording, and uses AI only for the theme, reflection, Personal/Work/Family discussion questions, and prayer. The app lists only fully imported weeks and never displays fallback passage text. Set `OPENAI_MODEL` or pass `--model` to override the default model.

To use reviewed study content without an API call:

```powershell
node scripts/import-readings.mjs --study-data data/study-content.json
```

Use `--skip-invalid` when incomplete placeholder files should remain unavailable:

```powershell
node scripts/import-readings.mjs --study-data data/study-content.json --skip-invalid
```

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, open **Settings > Pages**.
3. Set the source to the default branch and root folder.
4. Save, then open the generated Pages URL.

## Sources

- Sunday lectionary citations and official links are based on the Roman Catholic lectionary tables compiled by Felix Just, S.J. at `catholic-resources.org`.
- Official liturgical readings are linked to `bible.usccb.org`.
