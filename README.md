# KeyFlow

KeyFlow is a high-performance typing tutor designed specifically for software engineers. It focuses on muscle memory for programming syntax, special characters, and essential IDE shortcuts. Unlike standard typing tools, KeyFlow pulls real-world code snippets dynamically via the GitHub API to ensure users practice with authentic, modern production code.

---
<img width="1041" height="663" alt="Снимок экрана 2026-05-01 130535" src="https://github.com/user-attachments/assets/52611c03-7de4-400a-a437-c89b22914fe2" />

## Technical Stack

| Category | Technology |
| :--- | :--- |
| Framework | Next.js 16.2 (App Router) |
| Styling | Tailwind CSS (Glassmorphism UI) |
| Animations | Framer Motion |
| Icons | Lucide React |
| Data Source | GitHub REST API |
| Deployment | Vercel |

---

## Core Features

### 1. Dynamic Content Fetching
KeyFlow integrates with the GitHub API to fetch real code from top-tier repositories such as `facebook/react`, `django/django`, and `rust-lang/rust`. Snippets are pre-fetched in batches of 8 and cached in memory, so there is no noticeable delay between segments. When the pool runs low the app silently refills it in the background.

### 2. Difficulty Progression
Each difficulty level maps to a non-overlapping complexity score range (based on special-character density, generic types, async patterns, and line length):

- **Junior** — simple assignments, variable declarations, basic function calls. Senior-only constructs (generics, trait bounds, advanced type annotations) are hard-blocked.
- **Middle** — typed functions, closures, control flow, basic generics.
- **Senior** — complex generics, trait/interface definitions, decorators, and high-density special characters.

### 3. Integrated Hotkey Mode
A toggleable overlay that interrupts the typing flow at random intervals, requiring the user to execute specific IDE key combinations (e.g., `Cmd + Shift + P`) to proceed. Supports separate Win and Mac layouts.

### 4. Interactive Visual Keyboard
A floating key-press indicator rendered in the bottom-right corner. Each keystroke triggers an animated badge that flies in from the corner and is coloured green for a correct character or red for an error, providing instant tactile feedback without blocking the typing area.

### 5. Fallback Behaviour
If the GitHub API is unavailable or the rate limit is exhausted, KeyFlow automatically falls back to a built-in library of curated local snippets. The status badge in the UI changes from green ("Live GitHub code") to red ("Offline — using local snippets") so the user always knows which source is active.

---

## Development Setup

### Security Note on the GitHub Token

The token is exposed as `NEXT_PUBLIC_GITHUB_TOKEN`, which means it is bundled into the client-side JavaScript and **visible to anyone who inspects the page source**. This is acceptable for personal projects or internal tools, but for a public deployment you should:

1. Move the fetch logic to a Next.js **Route Handler** (`app/api/snippets/route.ts`).
2. Reference the token only as `GITHUB_TOKEN` (no `NEXT_PUBLIC_` prefix) — Next.js will keep it server-side only.
3. Apply rate-limiting to your own Route Handler endpoint to prevent abuse.

### Environment Configuration

Create a `.env.local` file in the root directory:

```
NEXT_PUBLIC_GITHUB_TOKEN=your_github_token_here
```

> Without a token, the GitHub API allows ~60 unauthenticated requests per hour. With a token the limit rises to 5 000 requests per hour — enough for extended sessions.

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/SSS010/keyflow.git
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

---

## Application Logic

### Coding Metrics

| Metric | Description |
| :--- | :--- |
| WPM | Words Per Minute based on 5-character word averages. |
| Accuracy | Percentage of correct keystrokes over total attempts. |
| Session | A discrete round composed of multiple fetched code snippets. |

### Difficulty Rules

| Level | Error Handling | Requirements |
| :--- | :--- | :--- |
| Junior | Visual highlight only | Complete the snippet |
| Middle | Backspace required to correct errors | Complete the snippet with no remaining errors |
| Senior | Hard lock on error + shake animation | Must type the correct character to proceed |

---

## Known Limitations

| Limitation | Details |
| :--- | :--- |
| GitHub Search API rate limit | Without authentication: ~60 req/hr. With a personal token: 5 000 req/hr. The app falls back to local snippets automatically. |
| Snippet repetition | The pool is drawn from a finite set of files per repository. With a short session length and many restarts, the same line may occasionally appear more than once. |
| Network instability | If a fetch times out mid-session, the current pool is exhausted and the app falls back to local snippets for the remainder of that session. |
| Token exposure | `NEXT_PUBLIC_GITHUB_TOKEN` is visible in client-side bundles. See the Security Note above for the recommended mitigation. |
| Language coverage | Only TypeScript, Python, and Rust are currently supported. Adding a new language requires entries in `GITHUB_TARGETS`, `FALLBACK_SNIPPETS`, `COMMENT_RE`, and the language selector component. |

---

## License

This project is licensed under the MIT License. Portions of the code fetched via the GitHub API are subject to the licenses of their respective source repositories.
