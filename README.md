# Faisal English Goal

A web app for practising English: learners put shuffled words in the right order to build sentences.
You manage lessons from a private admin page, and every lesson has its own link you can share.

- **Students:** `https://your-app.cranl.net/` (all lessons) or `https://your-app.cranl.net/lesson/greetings` (one lesson)
- **You:** `https://your-app.cranl.net/admin` (add, edit, reorder, publish/hide, import/export lessons)

## Features

- Tap words **or** drag them into place (works well on phones, tablets and computers)
- Wrong words turn red, hints place the next correct word, and up to 3 stars per sentence
- Sentences are read aloud after solving (normal and slow speed)
- Progress and stars are saved on each learner's device; a "practise hard sentences" round at the end
- "Practise your own text": paste any English text and it becomes a puzzle
- Installable as an app on phones (PWA), works offline for lessons already opened, and has a dark mode

## Deploy on CranL

1. **Put the code on GitHub.** Create a new repository and upload this folder (without `node_modules` and `data`).
2. **Create the app.** In CranL, click New Application, pick the repository and branch, and choose
   **Railpack** as the build type (it detects Node.js automatically). Set the **Port** to `3000`.
3. **Add a database.** Create a **PostgreSQL** database in the same project and select this app as the target.
   CranL then adds `DATABASE_URL` to the app for you. *Without a database, lessons are kept in a file that
   is wiped on every redeploy.*
4. **Set environment variables** on the app:

   | Name | Value |
   |---|---|
   | `ADMIN_PASSWORD` | A strong password for the `/admin` page (**required** to manage lessons) |
   | `SESSION_SECRET` | Optional. Any long random text; signs admin logins |
   | `PGSSL` | Optional. Set to `true` only if your database requires SSL connections |

5. **Deploy.** On first start the app creates its table and adds 6 starter lessons.
   Open `https://<your-app>.cranl.net/admin` to log in.

A custom domain can be added in CranL with a CNAME record; SSL is automatic.

## Managing lessons

In `/admin`:

- **New lesson:** title, icon (an emoji), level (A1–C2), short description, and sentences, **one per line**
  (2–20 words each). The link name is filled in from the title; you can change it.
- **Draft vs. published:** untick *Published* to hide a lesson while you work on it.
- **Order:** drag the ☰ handle; students see lessons in this order.
- **Copy link:** copies the lesson's share link to send to students.
- **Export all / Import JSON:** back up your lessons or upload many at once. On import, lessons with the
  same link name are replaced, and new ones are added.

Import file format:

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
      "sentences": [
        { "en": "Can I see the menu, please?" },
        { "en": "I would like a glass of water." }
      ]
    }
  ]
}
```

## Run locally

```bash
npm install
ADMIN_PASSWORD=test123 npm start
```

Then open http://localhost:3000. Without `DATABASE_URL`, lessons are stored in `data/lessons.json`.

## Project layout

```
server.js            Express server and API
src/store.js         Storage: PostgreSQL (DATABASE_URL) or a local JSON file
src/validate.js      Lesson validation rules
src/seed.js          Starter lessons (added only when the database is empty)
public/index.html    Student app (library, game, practice)  -> public/app.js
public/admin.html    Lesson manager                         -> public/admin.js
public/sw.js         Offline support
```

### API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/lessons` | – | Published lessons |
| GET | `/api/lessons/:slug` | – | One published lesson with sentences |
| POST | `/api/admin/login` | – | `{password}` → `{token}` (valid 7 days) |
| GET/POST | `/api/admin/lessons` | Bearer | List all / create |
| GET/PUT/DELETE | `/api/admin/lessons/:id` | Bearer | Read / update / delete |
| POST | `/api/admin/reorder` | Bearer | `{ids:[...]}` |
| POST | `/api/admin/import` | Bearer | `{lessons:[...]}` |
| GET | `/api/admin/export` | Bearer | Download all lessons |
| GET | `/healthz` | – | Health check |
