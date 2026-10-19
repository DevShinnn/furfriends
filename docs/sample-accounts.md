# Sample accounts

Made-up owners in the **live** app (https://furfriends-black.vercel.app), stored in Supabase like
real accounts. Use them for the defense demo and for practising the usability test. The people,
pets, clinics and documents are all fictional.

| Email | Password | Owner | What's in it |
|---|---|---|---|
| `sample.maria@example.com` | `FurFriends2026` | Maria Santos, Quezon City | 2 cats (Mochi, Ginger) with full records |
| `sample.juan@example.com` | `FurFriends2026` | Juan Dela Cruz, Pasig City | 2 dogs (Bori, Kong) with full records |
| `sample.ana@example.com` | `FurFriends2026` | Ana Reyes, Makati City | No pets yet, for showing "Add a pet" from the start |

Each pet has a photo, documents (certificates, invoice, lab result, prescription, microchip),
medical history, vaccines (some due soon, one overdue), feeding plans with 2 weeks of meals logged,
grooming and deworming tasks, and upcoming vet appointments.

## How they differ from the demo account
- **Demo account** (`demo@furfriends.app` / `demo1234`): lives only in the browser, works offline, resets per device. Good for a quick look.
- **Sample accounts:** real Supabase accounts. Log in on a phone and a laptop at the same time to show changes syncing, and turn on reminders to show notifications.

## Refresh them
Before a demo, run this in the project folder:
```
npm run seed
```
It deletes each sample account's pets and files and adds them again, so due dates and the
meal log line up with today. Anything changed in these accounts during a demo is reset.

## Notes
- The repo is public, so anyone could log in with these passwords. Keep only made-up data in them,
  and run `npm run seed` to reset them if someone changes something.
- `@example.com` is reserved for examples, so no real person receives mail for these accounts.
- The script never adds survey answers: the `usability_responses` table only holds real testers.
- Don't use these accounts for the real usability sessions. Each tester makes their own account
  (that's task 1 of the test).
