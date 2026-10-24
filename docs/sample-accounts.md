# Sample accounts

Made-up owners in the **live** app (https://furfriends-black.vercel.app), stored in Supabase like
real accounts. Use them for the defense demo and for practising the usability test. The people,
pets, clinics and documents are all fictional.

| Email | Password | Owner | What's in it |
|---|---|---|---|
| `demo@furfriends.app` | `demo1234` | Alex Rivera, Quezon City | All 4 pets. This is the account the **"Log in with demo account"** and **"Try the demo"** buttons open, and the shareable link `#/demo` |
| `sample.maria@example.com` | `FurFriends2026` | Maria Santos, Quezon City | 2 cats (Mochi, Ginger) with full records |
| `sample.juan@example.com` | `FurFriends2026` | Juan Dela Cruz, Pasig City | 2 dogs (Bori, Kong) with full records |
| `sample.ana@example.com` | `FurFriends2026` | Ana Reyes, Makati City | No pets yet, for showing "Add a pet" from the start |

Each pet has a photo, documents (certificates, invoice, lab result, prescription, microchip),
medical history, vaccines (some due soon, one overdue), feeding plans with 2 weeks of meals logged,
grooming and deworming tasks, and upcoming vet appointments.

## The demo account
All four accounts are real Supabase accounts: log in on a phone and a laptop at the same time to show
changes syncing, and turn on reminders to show notifications. The demo account is **shared** by everyone
who taps a demo button, so:
- anyone's changes show up for everyone until it's reset;
- **Profile → Reset demo data** puts its pets back for everyone (or run `npm run seed`);
- it can't change its password or email, send survey answers or rate the assistant, so the shared login
  keeps working and the research data only holds real people. The three sample accounts have the same
  limits. The database enforces them too (`supabase/migrations/20261020000000_protect_shared_accounts.sql`),
  so they hold even for someone calling the API directly with the public password.

If the demo button ever says "The demo account isn't available right now", its password was changed
(possible only before that migration was run). Fix it in Supabase → Authentication → Users: delete
`demo@furfriends.app`, then run `npm run seed` to make it again.

## Refresh them
Before a demo, run this in the project folder:
```
npm run seed
```
It deletes each account's pets and files and adds them again, so due dates and the
meal log line up with today. Anything changed in these accounts during a demo is reset.

## Notes
- The repo is public, so anyone could log in with these passwords. Keep only made-up data in them,
  and run `npm run seed` to reset them if someone changes something.
- `@example.com` is reserved for examples, so no real person receives mail for the sample accounts. Sign-ups are confirmed automatically, so no mail is sent for the demo account either.
- The script never adds survey answers: the `usability_responses` table only holds real testers.
- Don't use these accounts for the real usability sessions. Each tester makes their own account
  (that's task 1 of the test).
