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

(A unit can also have the optional **Arabic → English** step between Build and Grammar: see "Arabic → build the English" below.)

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

### Grammar tips and "why it's wrong" (teacher)

Each unit can have a short **grammar tip** (up to 300 characters, several short lines allowed, with an optional Arabic version). In the lesson editor
open **💡 Grammar tip for this unit** under the unit's sentences.

- **Before the Grammar step** the student sees the tip on a card, reads it, and presses **Start**. This happens every time the Grammar step starts.
  On the Grammar screen a **💡 Tip** button (key **T** on a computer) opens it again over the screen. A unit without a tip works exactly as before.
- The Arabic tip follows the same rule as the Arabic on the cards: the server sends it only to students the teacher switched Arabic on for.
- **Why a wrong word is wrong:** write the reason after the sentence with `??`. When the student picks a wrong word, the reason is shown on the card
  (instead of only "Not that one"). A gap without a reason shows the old message. Up to 140 characters, and a reason needs a gap.

```
She [is|are|am] reading a book. ?? We use "is" with she.
She [is|are|am] reading a book. ?? We use "is" with she. // هي تقرأ كتاباً
```
In JSON: `"units": [{ "title": "...", "tip": "...", "tipAr": "...", "sentences": [...] }]` and
`{ "en": "She is reading", "gap": { "index": 1, "answer": "is", "options": ["is","are","am"], "why": "We use \"is\" with she." } }`.
Export writes them, import reads them. An older file with **no** `tip` key does not erase the tips already written for a unit with the same title
(write `"tip": ""` to remove one on purpose).

### Lessons open one by one (teacher)

Lessons for everybody are **closed until the student passes the quiz of the lesson before it**. The order is **by level (A1, A2, B1 …) and then the order on the Lessons page** (drag ☰ to change it).

- **Opening:** the first lesson is open. When a student finishes a lesson (every unit built, grammar answered and its quizzes passed, including the final quiz of a longer lesson), the next one in the order opens at once.
  "Next lesson" on the celebration screen goes to the next open one. On the home screen the lessons are shown in this order; a closed one shows a 🔒 and "Pass the quiz of “…” to open".
- **Not part of the rule:** **private lessons** (🔒 selected students, or made from a student's card) are always open and are not in the chain. Drafts are not in it either.
- **Older progress keeps working:** a lesson a student has already started or finished is never closed by this rule.
- **Enforced on the server:** a closed lesson cannot be opened, built, quizzed or spoken into, not even by typing its link (the server answers "Finish “…” first to open this lesson."). Daily reviews of earlier work are never blocked.
- **Teacher switch:** on the Lessons page, **🔒 Lessons open one by one** (on by default). Switch it off to open every lesson; switch it on again and the rule applies again. To let one student skip ahead, give them a private lesson or switch the rule off.
- Technical: `lessonLocks()` in `public/progress-core.js` (the same code in the app and on the server); the switch is the flag `lessons_open_all` in `app_flags`; `GET /api/app` returns `lock`.

### Arabic → build the English (optional step)

After **Build** and before **Grammar**, a unit can offer one more step for the sentences that have Arabic: the student sees **only the Arabic** and builds
the English sentence from shuffled word tiles (the same puzzle as Build: hints, red marks, "swap the orange words"). There is no Listen button, and nothing is
read aloud, until the sentence is solved. A sentence without Arabic skips the step.

- **It works even when the student's Arabic switch is off.** The switch still only controls flipping the cards in the Learn step: the server sends the
  step's Arabic in its own field (`arq`), only for lessons that have the step switched on.
- **Optional for the student, nothing else changes.** It gives no stars and is not needed to finish a unit or a lesson (grammar and the quiz still decide that), so
  older progress cannot change. After Build the result screen offers **Next: Arabic → English 🔤** with a *Skip to Grammar / Skip to the quiz* button under it. The lesson page's
  **Continue** button leads to it after Build until the student starts the grammar; it is also in the unit's step list ("Arabic → English") for practice.
- **Saved on the server like Build:** the first try's mistakes, hints and seconds are kept per sentence (`sentence_progress.arb_*`); tries after that are practice. A request that is sent
  twice (bad signal) is counted once. The **teacher's timeline** shows "built the English from the Arabic" with mistakes, hints and time (and "practised … again" for repeats), and it counts for the day streak.
- **Teacher setting per lesson:** in the lesson editor tick or untick **Arabic → English step**. It is on by default (it only appears for sentences that have Arabic, so a lesson without
  Arabic is unchanged). Turning it off hides the step and stops accepting results; results already saved are kept. In JSON it is `"arStep": true/false` on the lesson (written by *Export all*;
  an older file without `arStep` never changes the setting).

### Daily review of hard sentences

Sentences the student found hard come back on a schedule, so they stay in memory. **Nothing needs to be set up by the teacher.**

- **What is "weak":** a sentence built with a mistake or a hint the first time, a wrong grammar word the first time, a wrong answer in a quiz, or a mistake/hint in the
  Arabic → English step. (Practising again is practice and does not add sentences.) Perfect sentences are never scheduled.
- **The schedule:** a weak sentence comes back after **1 day, then 3, 7, 14 and 30 days**. A correct review moves it to the next interval (after the 30-day one it is
  finished); a wrong review sends it back to 1 day. *Correct* means: right at the first try, without a hint. A sentence that becomes weak again starts again at 1 day.
  Days are UTC dates (the same days the streak uses).
- **Student:** when sentences are due, the home screen shows **🧠 Review (N)** (on phones and computers; sentences from finished lessons count too). A session has **up to 10**
  due sentences, most overdue first, and mixes **Build** questions with **Grammar** questions (a sentence with a grammar gap is asked as Grammar about half of the time;
  one without a gap is always Build). The questions are the normal Build puzzle and Grammar screen, one screen each. At the end the student sees what was right and when each
  sentence comes back, and can start another session if more are due. It works offline: answers are saved on the phone and sent later like everything else.
- **Reviews never change stars** (or units, quizzes or lesson completion). They **count for the day streak**.
- **Teacher:** a student's timeline has a **Reviews** filter and shows each answer ("daily review (build): right · next review in 7 days", or "wrong", "reviewed early", "finished all
  reviews"). A sentence the teacher deletes or rewrites, or a lesson the student can no longer open, is simply not asked any more.
- **After the update (once, automatic):** on first start the app adds the sentences students *already* found hard (by the same rules, from their saved progress and quiz answers) to
  their schedules, with their first review **spread over the next 7 days** (about a seventh each day) instead of all on day one. Restarting never repeats this.
- Technical: table `review_items` (one row per student and sentence: stage, due date); the schedule rules are in `public/review-core.js`, shared by the app and the server
  (`POST /api/review/answer` applies them; `GET /api/app` returns `reviews`, the sentences due today).

### Speaking check on the cards (microphone)

On a browser with speech recognition (Chrome, Edge, and Safari on newer iPhones: `SpeechRecognition` / `webkitSpeechRecognition`) the **"I said it out loud"** button on the Learn
cards becomes a **🎤 microphone button**. Phones or browsers without it keep the old button, exactly as before. The step still only appears the first time through a unit (and when the
student starts it over), and the next sentence stays locked until the sentence is said.

- **How it works:** the student taps 🎤 and says the sentence. The phone gets back the *text* it heard and compares it with the sentence (`public/speak-core.js`): case, punctuation and
  apostrophes are ignored (`Don't` = `dont`), a hyphen splits a word (`check-in` = `check in`), the numbers 0-20 count as words (`2` = `two`), and the words are matched **in order**.
  A try **passes at 80% of the words** (4 of 5, 5 of 6...; a 4-word sentence needs all 4). The words it did **not** hear are shown in orange on the card, the heard ones in green.
- **Up to 3 tries**, then the button becomes **Continue anyway**. A try where nothing was heard (or the student stopped) does not use up a try.
- **The microphone is asked for only when the student first taps 🎤** (never on page load). If the permission is refused, or speech recognition does not work (for example no
  network for the recognition service, or Siri dictation is off on an iPhone), the old "I said it out loud" button is used from then on, with a short message.
  While the microphone listens, the Listen and Slowly buttons are switched off so the phone does not hear its own voice. **The microphone is only on after a tap and while the student speaks:** it closes when the browser has its result (the app switches it off by force 1.5 seconds later if the browser does not), after 8 seconds if nobody speaks (15 seconds once speech has started), when the student taps the button again, when the app goes to the background, and when the card or page is left. If a browser (iPhones often do) ends the recording with only a partial result, that text is used. When nothing was heard, the message shows the browser's error code.
- **Only text is sent, never audio.** After the sentence is passed (or the 3rd try is used) the phone sends the text of each try; **the server scores it again with the same
  `speak-core.js`**, so a score cannot be made up by the phone. It keeps, for each student and sentence: the best score ever, the number of tries, whether it was ever passed, and the best
  text heard (table `speaking_scores`). Saving works offline like everything else. It never changes progress, stars or the streak.
- **Teacher:** the student's timeline shows "said a sentence out loud … 83% ✓ · heard: “…” · 2 tries" (part of the *Sentences & cards* filter); the student's card has a **🎤 Speaking** panel (average and the
  lowest sentences with what was heard); and the lesson's **progress page** has **🎤 Hardest to say**: the sentences with the lowest average score across students, with tries and how many did not pass.
  Teachers need to do nothing after the update. The speech recognition of Chrome sends the voice to the browser maker's service, so it needs an internet connection and a secure (`https`) page.

### Tap a word to see its meaning

On a Learn card, tapping a word still reads it aloud, and now also shows a small **bubble with its Arabic meaning** next to the word (right-to-left text). It closes when the student taps
anywhere else, on Escape, on the next card, or after 5 seconds. The bubble floats inside the card, so nothing moves and the screen never scrolls. A word without a meaning shows **no bubble**.
**It is always available**: the meanings are sent to every student, whether or not the Arabic switch for the cards is on for them (that switch still only controls flipping the whole card).

- **Matching ignores case and punctuation:** `Airport`, `airport.` and `(airport)` are all the word `airport` (so are `Don’t` and `don't`). A hyphenated word like `check-in` is one word.
- **Each lesson has a word list**, `{ "words": { "airport": "مطار", "boarding": "صعود الطائرة" } }`, in JSON import/export (*Export all* writes it; importing a file **without** `words` keeps the list a lesson
  already has, `"words": {}` clears it). In the **lesson editor**, open **📖 Word meanings** and write one `word = meaning` per line (`airport = مطار`); the editor checks every line. Meanings must be Arabic text
  (up to 80 characters), a lesson can have up to 1000, and only words that really appear in the lesson's sentences are sent to students.
- **Many words at once with an AI** (Lessons page > **📖 Word meanings**), exactly like the Arabic translations:
  1. **Download words without meaning**: up to 100 different words at a time, each once (any capitals/punctuation made plain), with an example sentence so the AI picks the right meaning. Tiny words
     (`a an the to of in on at is am are was were be and or i it he she we you they do does my your for with`) are left out, and so are words that already have a meaning in every lesson that uses them.
  2. Give the file and the instruction (**Copy the instruction for the AI**) to your AI; 3. paste its whole answer back and press **Add the meanings**. Repeat until the page says everything is ready.
  The same safety checks apply: the answer is understood even with text around it or in a code block, and also as a plain `{ "word": "Arabic" }` map or a lessons file; a word is added only to
  lessons whose sentences **really contain it** (a word the AI changed is reported, not added); text that is not Arabic is refused; meanings that already exist are kept unless you tick **Replace
  meanings that already exist**; sentences, units and student progress are never touched.

## Features

**Students**
- Sign up with name, email and password (or get an account from the teacher)
- Lessons are split into **units** (e.g. "At the airport", "At the hotel"). Units open in order: finishing one unlocks the next.
- Each unit has these steps: **1. Learn** (cards: read, listen normally or slowly, tap a word to hear it and see its Arabic meaning, say the sentence into the microphone)
  and **2. Build** (tap or drag words into order; hints, stars, red marks for wrong words). Build unlocks after the cards. Then an optional **Arabic → English** step, the **Grammar**
  step (with a tip card and the reason for a wrong word) and the **quiz**. Hard sentences come back later in the **daily Review**.
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

**After updating to this version** (nothing is required, but this is what happens and what a teacher may want to do):
- New columns/tables are added on the first start (`lessons.ar_step`, `lessons.words`, `sentence_progress.arb_*`, `review_items`, `speaking_scores`). Nothing is removed or changed, and no one's stars, units, quizzes or lesson completion change.
- **Lessons open one by one is ON** from the first start: students see unstarted lessons as closed until they pass the quiz of the lesson before it (lessons already started stay open). Switch it off on the Lessons page if you do not want it yet.
- **Daily review:** on that first start, sentences students already found hard are added to their review schedules, with the first reviews **spread over the next 7 days**. Students will see a **🧠 Review (N)** card from tomorrow.
- **Arabic → English step:** it appears after Build for every sentence that already has Arabic (it is optional for students). To stop it for a lesson, untick **Arabic → English step** in that lesson's editor.
- **Grammar tips, "why", word meanings:** nothing shows until the teacher writes them (lesson editor, JSON, or the *Word meanings* download for the AI on the Lessons page).
- **Speaking check:** automatic on phones/browsers with speech recognition. Make sure the site is served over `https` (CranL does this), otherwise the microphone is not available and the old button is used.
- Reload the app once on each phone so the new files load (the app updates itself the next time it is opened online).

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

A unit may also have `"tip"` and `"tipAr"` (see "Grammar tips"), a grammar gap may have `"why"`, and a lesson may have `"arStep"` (the Arabic → English step on/off, default on)
and `"words"` (word meanings, see "Tap a word"). A sentence may have `"ar"` (its Arabic). Every one of these is optional: a file without them keeps what the lesson already has.
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
least one sentence (Build, Arabic → English or Grammar); a missed day resets it to 0. The database is the source of truth: the phone saves progress
at once, sends it in the background, and re-reads everything from the server when the app is opened, when the connection comes back
and about once a minute.

## Grammar gaps are automatic

When a teacher saves a lesson (or imports a JSON file), every sentence without a gap that contains am/is/are, was/were, have/has or
do/does gets a grammar gap automatically (switch in the lesson editor; it can be turned off). Sentences without one of those words
get no gap, because a safe wrong choice cannot be made for them. Existing lessons are not changed until they are saved again.

## Importing and ordering lessons (JSON)

**Export all** writes every lesson in the order of the Lessons page; **Import JSON** reads a file like that (edit it by hand or with an AI).
- A lesson with the same `slug` is updated (student progress is kept; units are matched by their title), a new `slug` creates a new lesson.
- **The order of the file is the order in the app.** The lessons of the file are put in file order in the places they already take; lessons that
  are not in the file stay exactly where they are; new lessons come after the others. (A file with every lesson gives exactly its order.)
  The order of the units and of the sentences inside a lesson also follows the file. You can still drag ☰ on the Lessons page.
- An import made from a student's card (private lessons) never changes the order of the other lessons.

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
test/grammar.test.js    Grammar-gap parsing tests, including tips/"why" (no database needed)
test/review.test.js     Review schedule rules (no database needed)
test/speak.test.js      Speaking check scoring (no database needed)
test/words.test.js      Word meaning matching and checks (no database needed)
test/locks.test.js      Lesson order rule (no database needed)
src/seed.js             6 starter lessons (only added to an empty database)
public/progress-core.js Scoring rules shared by the server and the browser
public/review-core.js   Review schedule (1, 3, 7, 14, 30 days) shared by the server and the browser
public/speak-core.js    Speaking check scoring (heard text vs sentence) shared by the server and the browser
public/words-core.js    Word meanings: matching a tapped word with a lesson's list (server, editor, app)
public/grammar-core.js  Reads/writes grammar gaps like [is|are|am] (server, teacher editor)
public/app.js           Student app
public/admin.js         Teacher dashboard
```
