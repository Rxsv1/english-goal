# WordStack

Learn English one sentence at a time. Students log in, **learn** each lesson's sentences with
audio cards, then **build** them by putting shuffled words in order. Every step is saved on the server,
and the teacher dashboard shows exactly what each student has done.

- **Students:** `https://your-app.cranl.net/`
- **Teacher:** `https://your-app.cranl.net/admin`

## One-screen lessons (phones)

While a student plays a step (cards, build, grammar) the page is exactly one screen tall and never scrolls: a top bar, a stage
that takes the space that is left, and a dock with round icon buttons and one main button pinned at the bottom.
Results of a step ("Perfect!", "Next") slide up as a sheet over the dock. In the Build step the word tiles shrink a little for
long sentences so everything fits; the code for this is `fit()` in `runPuzzle` (`public/app.js`) and the "v3" part of `public/style.css`.
Progress inside a step is a row of dots, the Hint button shows how many of its 3 hints are left, and finishing a lesson opens a full-screen
celebration with a "Next lesson" button. iPhones get a one-time "Add to Home Screen" tip, and a slim bar shows while the phone is offline.
The lesson page shows only the current unit open; tapping any other unit opens a short list of its steps.

## The learning method

Every unit follows the same three steps, built around memorising whole sentences so students can speak:

1. **Read and say it.** The student reads the sentence, listens to it (normal or slow), then says it out loud and taps
   **"I said it out loud"**. The next sentence stays locked until they do. (Going back to a unit they already learned is free.)
2. **Re-order to prove it.** The sentence is hidden and its words are shuffled; the student puts them back in order.
   There is no Listen button (and nothing is read aloud) until the sentence is solved, because hearing it would give the answer away.
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
  Phones and narrow windows are unchanged. With a keyboard: **Backspace** takes the last word back,
  **H** hint, **P** peek, **S** "I said it" (and **L** to listen once a sentence is solved), **1-2-3** choose the first/second/third grammar word, **Enter** next, **← →** move between cards.
- **Go back to anything:** every unit a student has opened can be revisited: read its cards again (jump to any card
  with the `1 / 5` button), practise the whole unit, or open **All sentences** to listen to or practise one single sentence.
- **Start over without losing anything:** *Restart* on a unit, or *Start lesson over* on the lesson page, replays it from
  the first sentence. Saved progress, unlocked units and stars are never reset or changed: playing a sentence again is
  **practice only** and gives no stars.
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

## How stars work

Each sentence gives 3 stars (perfect), 2 (1-2 mistakes/hints) or 1. In the Build step only the **first** wrong arrangement of a
sentence counts as a mistake, and a sentence has at most 3 hints. The result of the first time is the student's score and is
what unlocks the next unit. Playing a sentence again is practice only: the saved stars never change (so "extra" stars are always 0
for new progress; older extra stars in the database are still shown). The streak counts the days on which the student finished at
least one sentence (Build or Grammar); a missed day resets it to 0. The database is the source of truth: the phone saves progress
at once, sends it in the background, and re-reads everything from the server when the app is opened, when the connection comes back
and about once a minute.

## Grammar gaps are automatic

When a teacher saves a lesson (or imports a JSON file), every sentence without a gap that contains am/is/are, was/were, have/has or
do/does gets a grammar gap automatically (switch in the lesson editor; it can be turned off). Sentences without one of those words
get no gap, because a safe wrong choice cannot be made for them. Existing lessons are not changed until they are saved again.

## Quizzes (required)

Every unit ends with a **quiz** (step 4, after Cards, Build and Grammar), and a lesson with more than one unit ends with a **final quiz** of
the whole lesson. A unit is finished when everything is built, the grammar is answered **and its quiz is passed**; a lesson is finished
when every unit is and the final quiz is passed (a lesson with one unit has no final quiz: its unit quiz is the lesson's quiz).

- Questions are multiple choice (3 options) and made automatically from the lesson's own sentences: *listen and choose the sentence*,
  *choose the missing word* (a grammar gap is used when the sentence has one), and *choose the sentence whose words are in the right order*.
  One question per sentence, at most 10, picked at random; every try is a new quiz. A phone that cannot speak gets no listening questions.
- Pass mark **70%** (rounded up); try as many times as you like. A wrong answer shows the right one and moves on. No stars: pass or fail.
- `public/quiz-core.js` builds and marks a quiz from a seed, and is shared by the app and the server. The phone sends only the seed and
  the chosen answers; the server builds the same quiz again and marks it itself, so a pass cannot be made up.
- Progress finished **before** quizzes existed keeps its credit (a one-time step in `src/db.js` gives it a passed quiz), so nobody sees a
  finished unit or lesson become unfinished.

### Teacher page

- **Students:** last active, the lesson they are on, stars, quiz results; a **needs attention** list (no activity for 7 days while there is
  still something to do, or 3 failed tries at the same quiz) on the Overview and as a filter in Students.
- **A student's card:** a timeline of every step (by day, with mistakes, hints and time; filter: sentences / quizzes) and a **Quizzes** panel
  with every attempt opening to each question, what the student chose and the right answer, plus **Reset quiz** (the student takes that quiz
  again; the unit/lesson is open again until they pass; old attempts stay visible).
- **A lesson's progress page:** a Final-quiz column and the **hardest sentences** (wrong tries and hints while building, wrong grammar choices,
  wrong quiz answers, across all students).

## On a computer

Windows 900 px wide and up get their own stylesheet, `public/desktop.css` (linked with `media="(min-width: 900px)"` in `index.html` and
`admin.html`), so the phone styles in `style.css` are never touched by it. What it does:

- Text size grows smoothly with the window. Controls outside the lesson steps are a little smaller than on a phone.
- **Lesson steps (Cards, Build, Grammar, Quiz):** the top bar spans the whole window; the puzzle and the cards are in a wider box; the word
  tiles are smaller; the buttons and the result card keep a sensible width instead of stretching.
- **Lesson page:** left, the summary; right, the units. The steps of a unit open inside its card instead of in a pop-up (the unit you are on
  is open from the start). On a phone they still open in a bottom sheet.
- **Home:** a compact sidebar that fits on one screen (stats in one slim row, a slim Continue card, a one-line Completed row) and a grid of
  lessons (3 columns on wide windows) with the level filter on the "All lessons" line above it.
- **Teacher pages:** Overview / Students / Lessons are a sidebar on the left; a student's card has two columns (numbers and lessons on the
  left, quizzes and the timeline on the right).

`app.js` builds a different Home and opens unit steps differently when `isPc()` is true, and redraws when the window crosses 900 px.

## Arabic translation on the cards

A student can flip a card to see its Arabic translation (the **ع Arabic** button; **EN** flips back). Cards only. It is **off for everybody by
default**: the teacher switches it on for each student (the **ع** switch on the Students page, or on the student's own card), or for all students
at once with **Enable for all / Disable for all**. The server only sends the Arabic to students it is switched on for, and a student sees the button
on a card when that sentence has Arabic. There is no online translation service: the Arabic comes from an AI model, in a few minutes, like this.

### Adding the Arabic with an AI (Lessons page > "Arabic translations")

1. Press **Download the sentences** (a file with up to 100 sentences that have no Arabic yet, each only once).
2. Open your AI (ChatGPT, Claude, Gemini...), press **Copy the instruction for the AI**, and send the instruction together with the file (or paste
   the file's content).
3. Copy the AI's whole answer, paste it into the box and press **Add the translations**. Repeat from step 1 until the page says everything is ready.

The app is careful with what comes back, so nothing can be damaged:
- It understands the answer even if the AI adds a sentence before it or wraps it in a code block. It also accepts a plain list of `{"en", "ar"}`,
  a map `{"English": "Arabic"}`, or the lessons file (Export all > the AI adds `"ar"` to each sentence > Import).
- Arabic is only added to sentences that match **exactly** (every lesson that has that sentence). If the AI changed the English of a sentence, it
  is reported and not added. An answer that is not Arabic text is refused. Nothing else in a lesson is touched, and students' progress is not affected.
- Arabic that already exists is kept, unless you tick **Replace Arabic that already exists**.
- You can also write or change one sentence yourself in the lesson editor, after `//`: `She is reading a book // هي تقرأ كتاباً`.
- New sentences added to a lesson later simply show up in the next download.

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
