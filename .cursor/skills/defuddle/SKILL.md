---
name: defuddle
description: Extract clean Markdown from web pages with Defuddle CLI to save tokens. Prefer over raw HTML/WebFetch for docs pages.
---

# Defuddle

Use Defuddle CLI to extract clean readable content from web pages. Prefer over WebFetch for standard documentation / blog / reference pages — it removes navigation, ads, and clutter, reducing token usage.

If not installed: `npm install -g defuddle` (or `npx -y defuddle`).

## Usage

Always use `--md` for markdown output:

```bash
defuddle parse <url> --md
# or without global install:
npx -y defuddle parse <url> --md
```

Save to file:

```bash
defuddle parse <url> --md -o content.md
```

Extract specific metadata:

```bash
defuddle parse <url> -p title
defuddle parse <url> -p description
defuddle parse <url> -p domain
```

## Output formats

| Flag | Format |
|------|--------|
| `--md` | Markdown (preferred) |
| `--json` | JSON with HTML + markdown |
| (none) | HTML |
| `-p <prop>` | Specific metadata property |

## When not to use

- Obsidian vault / wikilink / Bases editing → skip (those skills are vault-local, not for code Cloud Agents)
- Already-clean raw source files in the repo → just Read them
