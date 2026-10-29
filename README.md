# Decathlon & Heptathlon

A small web app for scoring decathlon and heptathlon competitions. Add competitors, enter their results and follow the standings. Points follow the 2001 IAAF scoring tables.

## Features

- Named competitions, each fixed to decathlon or heptathlon (plus a mixed "General" list), up to 20 competitions with up to 40 competitors each.
- Enter a result per event; entering a new result for an event that already has one asks before replacing it.
- Edit a competitor's name and results, or remove a competitor.
- Standings with positions (ties share a place, 1-2-2-4) and medals for the top three.
- Times of a minute or more can be typed as `2:43` or in seconds.
- Results are validated against the current world records: a running time faster than the record, or a jump or throw beyond it, is rejected. A slow running time is saved and scores 0 points.
- Export the standings as CSV, and save or load a whole competition as a JSON file.
- Light and dark theme.

## Run it

You need Java 17 and Maven.

```bash
mvn spring-boot:run
```

Then open <http://localhost:8080>. Competitions are kept in memory, so use *Save* in the page to keep one between runs.

To build a runnable jar instead:

```bash
mvn clean package
java -jar target/Decathlon-1.0-SNAPSHOT.jar
```

## How it is built

| Part | Where |
|---|---|
| Scoring, standings, save/load, CSV (no framework code) | `src/main/java/com/example/decathlon/core/` |
| REST API (Spring Boot) | `src/main/java/com/example/decathlon/api/` |
| Web page | `src/main/resources/static/` (`index.html`, `app.js`) |

The REST API lives under `/api` (the default "General" competition) and `/api/competitions/{id}` (named competitions). The main routes are `GET /events`, `GET`/`POST /competitions`, `POST /competitors`, `POST /competitors/rename`, `POST /competitors/remove`, `POST /score`, `GET /standings`, `GET /export.csv` and `GET`/`POST /state`.

The world records and scoring constants are in `core/ScoringService.java`. Update a record there when it is broken.

## Tests

End-to-end tests use [Playwright](https://playwright.dev) with TypeScript and live in `e2e/tests/`. They run against the app on port 8080:

```bash
mvn spring-boot:run          # in one terminal
cd e2e
npm ci
npx playwright install chromium
npx playwright test
```

The same tests run in GitHub Actions on every push and pull request (`.github/workflows/e2e.yml`).

The requirements the app is built against are in [REQUIREMENTS.md](REQUIREMENTS.md).
