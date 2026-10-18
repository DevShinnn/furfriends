# FurFriends usability test guide

For the team members running the usability test. Each session takes about 25–30 minutes:
about 20 minutes of tasks, then the 5-minute in-app survey.

## Before testing
- **Testers:** aim for at least 12 pet owners (cats or dogs). SUS results become reasonably stable from about 12 people; more is better. Mix phone types (Android and iPhone) and ages.
- **Codes:** give each tester a participant code (P01, P02, …) and record it on the observation sheet. Don't write their name next to their answers.
- **Device:** the tester uses their own phone if possible. Open https://furfriends-black.vercel.app beforehand to check it loads.
- **Consent:** read this aloud, and only continue if they agree:
  > "We're testing the FurFriends app, not you. There are no wrong answers. Please think aloud as you go. We'll take notes on what you do, but not your name. Your survey answers are saved with a participant code and used only for our capstone research. You can stop at any time."

## During the session
Give one task at a time, read exactly as written. **Don't help** unless they're stuck for about 2 minutes or ask twice. If you help, mark the task "Needed help".

| # | Task (read aloud) | Done when |
|---|---|---|
| 1 | Create an account and log in. | They reach the Dashboard. |
| 2 | Add a pet with a photo, breed, age and weight. | The pet's profile shows all four. |
| 3 | Add a vaccination with its next due date. | It appears in the pet's Vaccinations tab. |
| 4 | Upload a document (photo or PDF) to your pet. | It appears in the pet's Documents tab. |
| 5 | Set up a feeding schedule and mark a meal as fed. | The meal shows "Fed". |
| 6 | Book a vet appointment. | It appears on the Vet visits page. |
| 7 | Find what to do if a dog ate chocolate. | They open the Poisoning guide. |
| 8 | Look up your pet's breed in the Breed guide. | The breed page is open. |
| 9 | Ask the AI assistant a question and rate the answer. | A 👍 or 👎 is selected. |
| 10 | Turn on reminders and allow notifications. | Profile says notifications are allowed. |

For each task, note on your sheet: **result** (done alone / needed help / couldn't do it), **time** in seconds, and **where they hesitated or said something** (quote them).

Task 9 needs the AI server running. If it isn't, skip the task and write "not run".

## After the tasks
1. Ask them to open **Profile → Help test FurFriends → Take the survey** (or go to https://furfriends-black.vercel.app/#/app/survey).
2. They enter their participant code, mark how each task went, answer the 10 statements and add comments.
3. Ask one last question out loud and write down the answer: *"What would make you use this app every week?"*

## Results for the thesis
Run the queries at the bottom of `supabase/migrations/20261019030000_usability_survey.sql` in the Supabase SQL editor. They give:
- **SUS score:** mean, standard deviation, minimum and maximum. 68 is the average for software in general. Above 68 is above average; above 80.3 is in the top 10% ("excellent").
- **Task success rate:** per task, how many did it alone, needed help or couldn't.
- **Average answer per SUS statement:** shows which parts of usability scored low.
- **Comments:** group them into themes, such as navigation, wording, speed and missing features.

Combine these with your observation sheets: the times, and the places people hesitated. Report the lowest-scoring tasks with the quotes that explain them, plus what you changed or would change.

**Reference:** Brooke, J. (1996). SUS: A "quick and dirty" usability scale. In *Usability Evaluation in Industry*. Taylor & Francis.
