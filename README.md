# WordStack

Learn English one sentence at a time. Students log in, **learn** each lesson's sentences with
audio cards, then **build** them by putting shuffled words in order. Every step is saved on the server,
and the teacher dashboard shows exactly what each student has done.

- **Students:** `https://your-app.cranl.net/`
- **Teacher:** `https://your-app.cranl.net/admin`

## The learning method

Every unit follows the same three steps, built around memorising whole sentences so students can speak:

1. **Read and say it.** The student reads the sentence, listens to it (normal or slow), then says it out loud and taps
   **"I said it out loud"**. The next sentence stays locked until they do. (Going back to a unit they already learned is free.)
2. **Re-order to prove it.** The sentence is hidden and its words are shuffled; the student puts them back in order.
3. **Grammar gap.** One word is missing from the sentence and the student chooses the right one of **three**. When the
   last gap is answered, the unit (and, after the last unit, the lesson) ends.

Step 3 is optional per sentence: a lesson with no gaps simply ends after step 2, exactly as before.

### Writing grammar gaps (teacher)

In the lesson editor, put one word of a sentence between brackets. The **first** word is the right answer, the other two are the
wrong choices the student sees (they are shown in a random order):

```
She [is|are|am] reading a book.
I live [in|on|at] Cairo.
```

- Writing only the answer, `They [were] late.`, fills in the two wrong choices for **am/is/are, was/were, have/has and do/does**.
  Other words (articles, prepositions...) need the teacher's own wrong choices, because things like *a/the* or *in/at* can both be right.
- **✨ Suggest grammar gaps** adds a gap to every sentence that has one of those safe words; check them, then save.
  **Remove all gaps** takes them away again.
- In a JSON file a gap can be written the same way (`"She [is|are|am] reading"`) or as data:
  `{ "en": "She is reading", "gap": { "index": 1, "answer": "is", "options": ["is", "are", "am"] } }`
  (`index` is the position of the word, counting from 0).

## Features

**Students**
- Sign up with name, email and password (or get an account from the teacher)
- Lessons are split into **units** (e.g. "At the airport", "At the hotel"). Units open in order: finishing one unlocks the next.
- Each unit has 2 steps: **1. Learn** (cards: read, listen normally or slowly, tap a word to hear it)
  and **2. Build** (tap or drag words into order; hints, stars, red marks for wrong words). Build unlocks after the cards.
- Progress is saved after every card and every sentence. It never goes backwards, and the best stars are kept.
  Students can stop at any time and continue on any device ("Continue where you stopped").
- **Home keeps your place, finished lessons move away:** going back from a lesson (the arrow or the phone's back button) returns to the same spot in the list. A lesson the student finishes leaves the home list and appears on the **Completed lessons** page (a 🏆 row on the home screen), where it can still be opened and played again.
- **On a computer** the app uses the whole window instead of a phone-sized strip: a dashboard on the home screen, lessons in a
  grid, a lesson's summary beside its units, and a larger stage for the cards and puzzle (everything also grows on big monitors).
  Phones and narrow windows are unchanged. With a keyboard: **1-9** pick a word, **Backspace** takes the last one back,
  **H** hint, **P** peek, **L** listen, **S** "I said it", **1-2-3** choose a grammar word, **Enter** next, **← →** move between cards.
- **Go back to anything:** every unit a student has opened can be revisited: read its cards again (jump to any card
  with the `1 / 5` button), practise the whole unit, or open **All sentences** to listen to or practise one single sentence.
- **Start over without losing anything:** *Restart* on a unit, or *Start lesson over* on the lesson page, replays it from
  the first sentence. Saved progress, unlocked units and stars are never reset or lowered. If the student does better
  than before, the improvement is added as **extra stars** (shown as "+N extra"; also visible to the teacher).
- **Everything is instant.** When a student opens the app, one request (`GET /api/app`) loads all their lessons, sentences and
  progress. It is kept in memory and on the device, so every screen (home, lesson, cards, puzzle, results, profile) opens at
  once with no waiting for the network, and a returning student never sees a loading screen. Stars, extra stars and unlocked
  units are worked out on the device with the same rules as the server (`public/progress-core.js`, shared by both) and saved to
  the server in the background; the server is then asked quietly for the latest and the screen is redrawn only if something
  changed (for example a new lesson from the teacher). The very first visit shows a skeleton that is already in the HTML.
  The teacher dashboard works the same way: pages you have seen open instantly and refresh in the background.
- Works offline for a while: finished sentences are queued and sent when the connection returns
- Home page with stars, sentences, day streak and lessons completed; profile page to change name and password
- "Practise your own text" (not tracked)

**Teacher (`/admin`)**
- **Overview:** students, activity today and this week, a chart of sentences built per day, and a live activity feed
- **Students:** search, add a student, open a student to see every lesson's status (cards, sentences built, stars,
  time, last activity), a 14-day chart and a full activity log. Edit details, reset the password,
  disable or enable the account, or delete it.
- **Private lessons, straight from the student's card:** open a student and click **+ New lesson for …** to type
  or paste sentences. The lesson belongs to that student only, so there is no need to publish it first or tick
  students one by one. You can also import a JSON file for one student, give them a private lesson you already made,
  or remove a lesson from them (their progress is kept). Lessons for everyone still work as before
  (lesson editor → "Who can see this lesson?").
- **Lessons:** create and edit units (add, rename, reorder, remove), draft or published, reorder, copy the link, per-lesson progress report, import or export JSON
- **Download progress** as a CSV spreadsheet (opens in Excel)

## Environment variables (CranL → app → Environment)

| Name | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (Internal) |
| `PGPASSWORD` | if needed | Database password, used if `DATABASE_URL` has no password in it |
| `ADMIN_PASSWORD` | yes | Password for the teacher dashboard |
| `SESSION_SECRET` | recommended | Long random text. Keeps students logged in across restarts |
| `APP_NAME` | no | App name shown everywhere (default `WordStack`) |
| `ALLOW_SIGNUP` | no | Set to `false` so only the teacher can create student accounts |
| `PGSSL` | no | `true` if the database requires SSL |

Upgrading is automatic: on start the app adds any new tables, turns older lessons into a single unit, and keeps all lessons and student progress.

## Deploy / update on CranL

1. Upload all the files to your GitHub repository (replace the old ones).
2. CranL builds the new version (or click **Redeploy**).
3. Logs should show `WordStack running on http://0.0.0.0:3000`.

## Lesson import format

```json
{
  "lessons": [
    {
      "title": "At the Restaurant",
      "slug": "at-the-restaurant",
      "level": "A2",
      "emoji": "🍽️",
      "description": "Order food and ask for the bill.",
      "published": true,
      "visibility": "public",
      "units": [
        {
          "title": "Ordering",
          "sentences": [
            { "en": "Can I see the menu, please?" },
            { "en": "I would like a glass of water." }
          ]
        },
        {
          "title": "Paying",
          "sentences": [
            { "en": "Can we have the bill, please?" },
            { "en": "Can I pay by card?" }
          ]
        }
      ]
    }
  ]
}
```

A lesson can also use a plain `"sentences": [...]` list instead of `units`; it then becomes a single unit.
A sentence may appear only once per lesson. `visibility` is `"public"` (all students) or `"assigned"` (only students you select afterwards in the dashboard).
Importing from a student's card always creates new private lessons for that student (it never overwrites other lessons).
Importing a lesson with an existing `slug` from the Lessons page updates it and keeps student progress (units are matched by title). If a sentence's text changes,
students need to build that one sentence again.

## Reliability and safety

- Anything read from the device (saved progress, settings, the offline queue) is checked before use; damaged or old data is ignored and fetched again, so it can never break a screen.
- Requests have time limits, the offline queue is size-limited, and background syncing backs off when the network is down.
- Malformed requests get a 4xx answer (never a 500); logging in costs the same time whether or not the email exists; the activity log can never block a login.
- On a redeploy the server finishes open requests before it stops (SIGTERM), so a child's last save is not cut off.
- Starter lessons are only added to a brand-new database, never again after a teacher has deleted them.
- `npm test` checks all of this, including that the browser and the server work out stars identically.

## How stars and "extra" work

Each sentence gives 3 stars (perfect), 2 (1-2 mistakes/hints) or 1. The first result is the student's base score and
is what unlocks the next unit. When a sentence is played again, a lower or equal result changes nothing; a higher
result raises the best score and the difference is counted as extra (best = first + extra, never above 3 per sentence).

## Run locally

Requires Node 18+ and PostgreSQL.

```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/wordstack ADMIN_PASSWORD=test123 SESSION_SECRET=dev npm start
```

## Tests

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/wordstack_test npm test
```

The test database is wiped on every run, so use an empty one.

## Project layout

```
server.js               Express app, security headers, pages
src/db.js               PostgreSQL connection + automatic table setup
src/auth.js             Passwords (scrypt), sessions (signed cookies), rate limits
src/progress.js         Progress queries and streaks (uses public/progress-core.js)
src/routes/student.js   Sign-up/login, lessons, saving progress
src/routes/admin.js     Teacher API: overview, students, lessons, assignments, CSV
src/validate.js         Input rules
test/api.test.js        End-to-end API tests (run with TEST_DATABASE_URL set to an empty test database)
test/grammar.test.js    Grammar-gap parsing tests (no database needed)
src/seed.js             6 starter lessons (only added to an empty database)
public/progress-core.js Scoring rules shared by the server and the browser
public/grammar-core.js  Reads/writes grammar gaps like [is|are|am] (server, teacher editor)
public/app.js           Student app
public/admin.js         Teacher dashboard
```
