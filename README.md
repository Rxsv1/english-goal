# WordStack

Learn English one sentence at a time. Students log in, **learn** each lesson's sentences with
audio cards, then **build** them by putting shuffled words in order. Every step is saved on the server,
and the teacher dashboard shows exactly what each student has done.

- **Students:** `https://your-app.cranl.net/`
- **Teacher:** `https://your-app.cranl.net/admin`

## Features

**Students**
- Sign up with name, email and password (or get an account from the teacher)
- Lessons are split into **units** (e.g. "At the airport", "At the hotel"). Units open in order: finishing one unlocks the next.
- Each unit has 2 steps: **1. Learn** (cards: read, listen normally or slowly, tap a word to hear it)
  and **2. Build** (tap or drag words into order; hints, stars, red marks for wrong words). Build unlocks after the cards.
- Progress is saved after every card and every sentence. It never goes backwards, and the best stars are kept.
  Students can stop at any time and continue on any device ("Continue where you stopped").
- Works offline for a while: finished sentences are queued and sent when the connection returns
- Home page with stars, sentences, day streak and lessons completed; profile page to change name and password
- "Practise your own text" (not tracked)

**Teacher (`/admin`)**
- **Overview:** students, activity today and this week, a chart of sentences built per day, and a live activity feed
- **Students:** search, add a student, open a student to see every lesson's status (cards, sentences built, stars,
  time, last activity), a 14-day chart and a full activity log. Edit details, reset the password,
  disable or enable the account, or delete it.
- **Private lessons:** set a lesson to "Only selected students" and pick who gets it, from the lesson editor or
  from the student's page
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
Importing a lesson with an existing `slug` updates it and keeps student progress (units are matched by title). If a sentence's text changes,
students need to build that one sentence again.

## Run locally

Requires Node 18+ and PostgreSQL.

```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/wordstack ADMIN_PASSWORD=test123 SESSION_SECRET=dev npm start
```

## Project layout

```
server.js               Express app, security headers, pages
src/db.js               PostgreSQL connection + automatic table setup
src/auth.js             Passwords (scrypt), sessions (signed cookies), rate limits
src/progress.js         Stars, lesson status, streaks
src/routes/student.js   Sign-up/login, lessons, saving progress
src/routes/admin.js     Teacher API: overview, students, lessons, assignments, CSV
src/validate.js         Input rules
src/seed.js             6 starter lessons (only added to an empty database)
public/app.js           Student app
public/admin.js         Teacher dashboard
```
