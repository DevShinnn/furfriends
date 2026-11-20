/* Unit tests for each functional requirement, and a flowchart for each use case, as one PDF.

     npm run test:report
       → runs every test in tests/ (Vitest), then writes
         docs/testing/test-results.json                         (the raw results)
         docs/testing/FurFriends-unit-tests-and-flowcharts.html (+ .pdf if Chrome is found)

   The results table is filled from the actual test run, never typed by hand: a failing test shows as failed.
   The use cases are the nine in the manuscript's Figure 2.2, plus two that were built later (marked so).
   Flowcharts are drawn by Mermaid (pinned, from the jsDelivr CDN), so the PDF step needs internet. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "testing");
const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- run the tests */
const jsonPath = join(OUT, "test-results.json");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = spawnSync(npx, ["vitest", "run", "--reporter=json", `--outputFile=${jsonPath}`], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
if (!existsSync(jsonPath)) { console.error("Vitest didn't write its results."); process.exit(1); }
const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const ver = (name) => (pkg.devDependencies?.[name] || pkg.dependencies?.[name] || "").replace(/^\^/, "");

const tests = raw.testResults.flatMap((file) => file.assertionResults.map((t) => {
  const m = t.title.match(/^\[(FR[\d.]+)\]\s*(.*)$/);
  return {
    fr: m ? m[1] : "?", title: m ? m[2] : t.title, status: t.status, ms: Math.round(t.duration || 0),
    file: file.name.replace(/\\/g, "/").replace(/^.*\/tests\//, "tests/"),
    error: (t.failureMessages || [])[0]?.split("\n")[0] || "",
  };
}));

/* ---------------------------------------------------------------- use cases, requirements, flowcharts */
const USE_CASES = [
  {
    id: "UC1", name: "Register / Login", source: "Figure 2.2",
    goal: "A pet owner creates an account or logs in, so their pets and records are kept private to them, and can set a new password with their security question if they forget it.",
    code: "src/pages/Auth.jsx (Login, Register, ForgotPassword), src/store/StoreContext.jsx (register, login, logout, forgotQuestion, resetPassword), src/lib/passwordReset.js, supabase/migrations/20261120120000_security_questions.sql",
    frs: [
      ["FR1.1", "Owners can create an account with name, email and password. The form requires a name, a valid email, a password of at least 8 characters, and matching passwords. If email confirmation is on, the owner is asked to check their email. Once the database has forgot password, sign-up also asks for a security question and answer."],
      ["FR1.2", "Owners can log in with email and password. Missing fields or wrong details show a clear message."],
      ["FR1.3", "Owners can log out, which ends the session and clears their data from the screen."],
      ["FR1.4", "Visitors can explore the app with a shared demo account, which no one can register over."],
      ["FR1.5", "Forgot password, with no email: the owner enters their email, answers the security question they picked (any letter case or spacing), and sets a new password of at least 8 characters, then is logged in. 5 wrong answers lock the reset for 15 minutes. Accounts with no question, and the shared accounts, are told to ask the FurFriends team."],
    ],
    flows: [
      ["Part a: log in, demo account and log out", `
flowchart TD
  S([Start]) --> A[Open FurFriends]
  A --> B{Logged in on<br/>this device?}
  B -- Yes --> Z[Dashboard]
  B -- No --> C[Log-in page]
  qA((A)) --> C
  C --> D{Owner chooses}
  D -- Create account --> UC1b[[Create account, UC1 part b]]
  D -- Demo account --> E[Log in with the<br/>shared demo account] --> Z
  D -- Log in --> F[/Enter email and password/]
  qB((B)) --> F
  F --> G{Both filled in?}
  G -- No --> G1[Show: Please enter your<br/>email and password] --> rB1((B))
  G -- Yes --> H{Correct email<br/>and password?}
  H -- No --> H1[Show: Incorrect<br/>email or password] --> rB2((B))
  H -- Yes --> I[Load profile and pets] --> Z
  Z --> O{Log out?}
  O -- Yes --> P[End session, clear<br/>data from screen] --> rA((A))
  O -- No --> X([End])`],
      ["Part b: create an account", `
flowchart TD
  S([From the log-in page:<br/>Create account]) --> J[/Enter name, email, password,<br/>confirm password/]
  qC((C)) --> J
  J --> K0[Check: name given, valid email,<br/>8+ characters, passwords match]
  K0 --> K{All OK?}
  K -- No --> K1[Show what to fix] --> rC1((C))
  K -- Yes --> L{Email already<br/>registered?}
  L -- Yes --> L1[Show: An account with<br/>this email already exists] --> rC2((C))
  L -- No --> M[Supabase creates the<br/>account and profile]
  M --> N{Email confirmation<br/>on?}
  N -- Yes --> N1[Show: Check your email;<br/>owner opens the link, then logs in] --> X1([Log-in page])
  N -- No --> Q[Security question saved,<br/>if the form asked for one]
  Q --> Z[Logged in: Dashboard] --> X([End])`],
      ["Part c: forgot password (security question, no email)", `
flowchart TD
  S([From the log-in page:<br/>Forgot password?]) --> A[/Enter the account's email/]
  qA((A)) --> A
  A --> B{Valid email?}
  B -- No --> B1[Show: Please enter a<br/>valid email address] --> rA1((A))
  B -- Yes --> C{Account has a<br/>security question?}
  C -- No --> C1([Show: no security question;<br/>ask the FurFriends team])
  C -- Yes --> D[Show the account's question]
  D --> E[/Answer, new password,<br/>confirm password/]
  qB((B)) --> E
  E --> F{8+ characters<br/>and match?}
  F -- No --> F1[Show what to fix] --> rB1((B))
  F -- Yes --> G{Locked after<br/>5 wrong answers?}
  G -- Yes --> G1([Show: try again<br/>in 15 minutes])
  G -- No --> H{Answer matches?<br/>Any letter case}
  H -- No --> H1[Show: tries left<br/>before a 15-minute wait] --> rB2((B))
  H -- Yes --> I[Database saves the new password<br/>and logs out other devices]
  I --> J[Logged in: Dashboard] --> X([End])`],
    ],
  },
  {
    id: "UC2", name: "Manage Pet Profile", source: "Figure 2.2",
    goal: "The owner adds, edits or deletes a pet, keeps its health records (medical history, vaccinations, documents, weight history), and sees its health check.",
    code: "src/components/Forms.jsx (PetForm, MedForm, VaxForm, DocForm), src/store/StoreContext.jsx (addPet, updatePet, deletePet, upsertItem, removeItem, saveWeight, removeWeight), src/lib/health.js, src/components/Health.jsx, supabase/migrations/20261112000000_weight_log.sql",
    frs: [
      ["FR2.1", "Add a pet with photo, name, species (cat or dog), breed, age, gender and weight. Name is required, age months must be 0 to 11, and weight must be above 0. Photos are kept in private storage under the owner's folder."],
      ["FR2.2", "Edit a pet's profile."],
      ["FR2.3", "Delete a pet, after confirming, together with all its records, photos and documents."],
      ["FR2.4", "Keep health records for each pet: medical history, vaccinations (the next due date must be after the date given) and documents (a photo or a PDF)."],
      ["FR2.5", "Each pet has a health check from its own records: vaccines, vet checkups (yearly for adults, every 6 months for seniors), recent illness, deworming, weight for its breed and life stage, and diet (including a food with something it's allergic to). Each check is on track, check soon or act now, shown as a ring on the profile and a badge on the pet's card. It follows the checked library and is not a diagnosis."],
      ["FR2.6", "Each pet keeps a weight history: today's weight is saved whenever its weight changes, the owner can add earlier weights or delete one, and the weight check shows the trend over the last year."],
    ],
    flows: [
      ["Part a: add or edit a pet", `
flowchart TD
  S([Start]) --> A[My Pets or pet profile]
  A --> B{Owner chooses}
  B -- Add pet --> C[/Photo, name, species, breed,<br/>age, gender, weight/]
  B -- Edit pet --> C0[Form opens with<br/>the pet's details] --> C
  qB((B)) --> C
  C --> D0[Check: name given, months 0-11,<br/>weight above 0]
  D0 --> D{All OK?}
  D -- No --> D1[Show the error] --> rB((B))
  D -- Yes --> E[Pet shows on screen at once]
  E --> F[Photo uploaded to private storage,<br/>pet saved to the database]
  F --> G{Saved on<br/>the server?}
  G -- No --> G1([Show: Couldn't save to the server,<br/>reload from the server])
  G -- Yes --> H[Pet profile page] --> X([End])`],
      ["Part b: delete a pet, or add a health record", `
flowchart TD
  S([Start]) --> A[Pet profile]
  A --> B{Owner chooses}
  B -- Delete pet --> I{Owner confirms<br/>delete?}
  I -- No --> X1([Back to the pet])
  I -- Yes --> J[Remove the pet, its records,<br/>photos and documents] --> X2([My Pets])
  B -- Add a health record --> K{Record type}
  qC((C)) --> K
  K -- Medical --> L[/Date, type, title, vet, notes/]
  K -- Vaccination --> M[/Vaccine, date given, next due/]
  K -- Document --> N[/Photo or PDF, title, type, date/]
  L & M & N --> O0[Check: required fields filled,<br/>next due after date given]
  O0 --> O{All OK?}
  O -- No --> O1[Show the error] --> rC((C))
  O -- Yes --> P[Record saved under the pet,<br/>shown in its tab] --> X([End])`],
      ["Part c: health check and weight history", `
flowchart TD
  S([Start]) --> A[Pet profile or My Pets]
  A --> B[Health check from the pet's own records:<br/>vaccines, vet checkups, recent illness,<br/>deworming, weight for its breed, diet]
  B --> C{Each check}
  C -- In order --> C1[On track]
  C -- Due soon or missing --> C2[Check soon]
  C -- Overdue, or a food with<br/>something it's allergic to --> C3[Act now]
  C1 & C2 & C3 --> D[Ring on the profile, badge on the card:<br/>how many of 6 are on track,<br/>and what to look at first]
  D --> E{Owner adds<br/>a weight?}
  E -- No --> X([End])
  E -- Yes --> F[/Date and weight/]
  F --> G{Today's date?}
  G -- Yes --> G1[Also becomes the<br/>pet's current weight] --> H
  G -- No --> H[Saved in the weight history]
  H --> I[Weight check shows the trend<br/>over the last year] --> X`],
    ],
  },
  {
    id: "UC3", name: "Set Care Reminders", source: "Figure 2.2",
    goal: "The owner sets feeding times, grooming, deworming, vaccine reminders and vet appointments, and marks them done.",
    code: "src/components/CareForms.jsx, src/lib/care.js, src/store/StoreContext.jsx (toggleFed, completeCare)",
    frs: [
      ["FR3.1", "Set feeding times (time, food, amount, days of the week) and tick each meal as fed for the day."],
      ["FR3.2", "Schedule grooming, deworming, vaccine reminders and vet appointments, once or repeating (every day up to every year)."],
      ["FR3.3", "Show what is overdue, due today and coming up. Marking a repeating task done moves it to its next date; a one-time task is closed. Vet visits are split into upcoming and past."],
      ["FR3.4", "Vaccinations with a next due date become reminders automatically, with their booster status."],
    ],
    flow: `
flowchart TD
  S([Start]) --> A[Pet profile, Care tab<br/>or Vet visits page]
  A --> B{What to schedule}
  B -- Feeding --> C[/Time, food, amount, days/]
  B -- Grooming, deworming<br/>or vaccine --> D[/Task, due date, how often/]
  B -- Vet appointment --> E[/Reason, date, time,<br/>clinic and notes/]
  C --> C1{Time and<br/>food given?}
  D --> D1{Name and<br/>date given?}
  E --> E1{Reason and<br/>date given?}
  C1 -- No --> W1([Show the error])
  D1 -- No --> W2([Show the error])
  E1 -- No --> W3([Show the error])
  C1 -- Yes --> F[Saved to the pet's schedule]
  D1 -- Yes --> F
  E1 -- Yes --> F
  V[Vaccination records<br/>with a next due date] --> G
  F --> G[Dashboard and care list: overdue first,<br/>then today, then coming up]
  G --> H{Owner marks<br/>an item done}
  H -- Meal --> I[Ticked as fed for today]
  H -- Task --> J{Does it repeat?}
  J -- Yes --> K[Next due = today + repeat]
  J -- No --> L[Marked completed]
  I & K & L --> X([End])`,
  },
  {
    id: "UC4", name: "Receive Notifications", source: "Figure 2.2",
    goal: "The owner is reminded of meals, care tasks, vaccines and vet visits, in the app and on the phone even when the app is closed.",
    code: "src/lib/reminders.js, src/components/Reminders.jsx, supabase/functions/send-reminders (web push, every 5 minutes)",
    frs: [
      ["FR4.1", "Work out which reminders are due: meals from 15 minutes before mealtime until ticked as fed, tasks due today or overdue, and vet visits also the day before."],
      ["FR4.2", "Announce each reminder only once on each device."],
      ["FR4.3", "Owners can turn reminders on or off in Profile."],
    ],
    flows: [
      ["Part a: while the app is open", `
flowchart TD
  S([Start]) --> A{Reminders on?}
  A -- No --> X1([No reminders])
  A -- Yes --> B{App open?}
  B -- No --> UC4b[[App closed, UC4 part b]]
  B -- Yes --> C[Every minute: work out what is due:<br/>meals from 15 min before, tasks due<br/>today or overdue, vet visits the day before too]
  C --> D{Already<br/>announced?}
  D -- Yes --> D1([Skip it])
  D -- No --> E[List it under the bell]
  E --> E1{App just<br/>opened?}
  E1 -- Yes --> I[Remember it was announced]
  E1 -- No --> F{Notifications<br/>allowed?}
  F -- Yes --> G[Phone or computer notification]
  F -- No --> H[Message inside the app]
  G & H --> I
  I --> X([End])`],
      ["Part b: when the app is closed", `
flowchart TD
  S([Reminders on,<br/>app closed]) --> J[Every 5 minutes: Supabase runs<br/>send-reminders with the same rules,<br/>in each device's time zone]
  J --> K{Already sent?}
  K -- Yes --> K1([Skip it])
  K -- No --> L[Web push notification<br/>to the phone]
  L --> M{Owner taps it?}
  M -- Yes --> N[App opens on the pet's care tab<br/>or the vet visits page]
  M -- No --> X([End])
  N --> X`],
    ],
  },
  {
    id: "UC5", name: "View Breed Care Tips", source: "Figure 2.2",
    goal: "The owner reads care tips for their pet's breed: feeding, exercise, grooming, behavior, health risks and healthy weight.",
    code: "src/lib/breeds.js, src/lib/breedCare.js, src/pages/Breeds.jsx, src/pages/PetDetail.jsx",
    frs: [
      ["FR5.1", "Match a pet's breed, or one of its other names (for example Aspin, Puspin), to the breed guide."],
      ["FR5.2", "Every breed has feeding, exercise, grooming and behavior tips, health risks, traits, and a healthy weight and life span range."],
    ],
    flow: `
flowchart TD
  S([Start]) --> A{Opened from}
  A -- Breed guide menu --> B[List of cat and dog breeds]
  B --> C[/Search, or filter: All breeds,<br/>Dogs, Cats, My pets' breeds/]
  C --> D[Owner opens a breed]
  A -- Pet profile --> E{Breed in<br/>the guide?}
  E -- No --> E1[Breed shown as typed,<br/>no guide link] --> X([End])
  E -- Yes --> F[Breed guide link] --> D
  D --> G[Summary, traits, healthy weight<br/>and life span, health risks]
  G --> H[Feeding, exercise, grooming<br/>and behavior tips]
  H --> X`,
  },
  {
    id: "UC6", name: "Open Emergency Guide", source: "Figure 2.2",
    goal: "In an emergency the owner opens step-by-step first aid while getting to a vet.",
    code: "src/lib/emergency.js, src/pages/Emergency.jsx",
    frs: [
      ["FR6.1", "Provide step-by-step first-aid guides for common emergencies, each with warning signs, steps, what not to do, and how urgent it is. The 8 emergencies named in the proposal are covered."],
      ["FR6.2", "Group the guides into 7 types, make them searchable, and include a common poisons list and the 'go to a vet now' warning signs."],
      ["FR6.3", "Recognise emergency wording in a question (for example 'ate chocolate', 'not breathing') and bring up the matching guide."],
    ],
    flow: `
flowchart TD
  S([Start]) --> A[Emergency page]
  A --> B[Shows: call your vet now,<br/>and the go to a vet now warning signs]
  B --> C{Owner chooses}
  qA((A)) --> C
  C -- Find a vet near me --> UC7[[Locate Veterinary Clinic, UC7]]
  C -- Pet's emergency card --> D[Allergies, medicines and<br/>vaccines to show the vet]
  C -- A guide --> E[/Search, or pick an emergency type/]
  E --> F[Open the guide]
  F --> G{How urgent?}
  G -- Go to a vet now --> H[Red label: Go to a vet now]
  G -- Call your vet --> I[Label: Call your vet]
  H & I --> J[Warning signs, numbered steps,<br/>what not to do, lists such as<br/>common poisons]
  J --> K[Back to Emergency guides] --> rA((A))
  D --> X([End])`,
  },
  {
    id: "UC7", name: "Locate Veterinary Clinic", source: "Figure 2.2",
    goal: "The owner finds vet clinics near them, with opening hours, nearest first.",
    code: "src/pages/Clinics.jsx, src/lib/clinics.js, supabase/functions/find-clinics (TomTom Places Search)",
    frs: [
      ["FR7.1", "Find vet clinics near the phone's location, or near the address (or city) saved in Profile when location is off."],
      ["FR7.2", "List only vet clinics: animal-bite centers, health centers and supply stores are left out, and a clinic listed twice is shown once."],
      ["FR7.3", "List clinics nearest first, with the distance."],
      ["FR7.4", "Show each clinic's opening hours for the week and whether it is open now; say so when hours are not listed."],
      ["FR7.5", "Widen the search to 25 km when fewer than 5 clinics are within 10 km, and reuse a search for the same ~1 km area for a week."],
    ],
    flows: [
      ["Part a: getting the owner's location", `
flowchart TD
  S([Start]) --> A[Open Find a vet: from Emergency,<br/>Vet visits, Dashboard or menu]
  A --> B{Location<br/>allowed?}
  B -- Yes --> L[Read the phone's location]
  B -- No --> C{Address or city<br/>saved?}
  C -- Yes --> G[Turn the address into a location:<br/>TomTom, Philippines only]
  G --> G1{Found?}
  G1 -- No --> G2([Show: couldn't find<br/>that address])
  G1 -- Yes --> F
  C -- No --> D[Owner taps Use my location]
  D --> E{Owner<br/>allows?}
  E -- No --> E1([Show how to allow it,<br/>or add an address in Profile])
  E -- Yes --> L
  L --> F[Send the location to<br/>the find-clinics function]
  F --> UC7b[[Search and show clinics, UC7 part b]]`],
      ["Part b: searching and showing clinics", `
flowchart TD
  S([Location received]) --> H{Logged in?}
  H -- No --> H1([Show: Please log in])
  H -- Yes --> I{Saved search for<br/>this area this week?}
  I -- Yes --> P[Use the saved clinics]
  I -- No --> J[TomTom: veterinarians<br/>within 10 km]
  J --> K{Fewer than 5?}
  K -- Yes --> K1[Search again<br/>within 25 km] --> M
  K -- No --> M[Leave out bite centers and shops,<br/>merge duplicates, save for a week]
  M --> P
  P --> Q[Map and list, nearest first:<br/>distance, and Open now, Closed<br/>or Hours not listed]
  Q --> R[/Filter: All, Open now, 24 hours/]
  R --> T[Owner taps a clinic: pin<br/>highlighted, week's hours shown]
  T --> UC8[[Call / Navigate to Clinic, UC8]]`],
    ],
  },
  {
    id: "UC8", name: "Call / Navigate to Clinic", source: "Figure 2.2",
    goal: "From a clinic in the list, the owner gets directions or calls it.",
    code: "src/lib/clinics.js (directionsUrl, telUrl), src/pages/Clinics.jsx",
    frs: [
      ["FR8.1", "Directions open Google Maps (the app on phones) with the route to the clinic: from the phone's location, or from the saved address when that was used."],
      ["FR8.2", "Call opens the phone's dialer with the clinic's number."],
    ],
    flow: `
flowchart TD
  S([Start]) --> A[Clinic in the Find a vet list]
  A --> B{Owner taps}
  B -- Directions --> C{Clinics found<br/>from}
  C -- Phone's location --> D[Google Maps opens with the route<br/>from where the phone is]
  C -- Saved address --> E[Google Maps opens with the route<br/>from the saved address]
  D & E --> F[Owner follows the route<br/>in Google Maps]
  B -- Call --> G{Has a phone<br/>number?}
  G -- No --> G1[No Call button:<br/>use Directions instead]
  G -- Yes --> H[Phone dialer opens<br/>with the number]
  F & G1 & H --> X([End])`,
  },
  {
    id: "UC9", name: "Manage Account Settings", source: "Figure 2.2",
    goal: "The owner updates their details, password and security question, and turns reminders on or off.",
    code: "src/pages/Profile.jsx, src/pages/Dashboard.jsx (security question reminder), src/store/StoreContext.jsx (updateUser, changePassword, saveSecurityQuestion, setNotifications)",
    frs: [
      ["FR9.1", "Update name, email, phone, city and address. Name is required and the email must be valid; a new email changes only after its confirmation link is opened."],
      ["FR9.2", "Change the password: at least 8 characters, typed twice, and the current password must be correct."],
      ["FR9.3", "The shared demo and sample accounts can't change their password or email."],
      ["FR9.4", "Set or change the security question for forgot password: a question from the list or the owner's own, an answer of at least 2 characters, and the current password, which the database checks. The answer is kept only as a hash. Owners without one are reminded on the dashboard; the shared accounts can't set one."],
    ],
    flows: [
      ["Part a: personal information", `
flowchart TD
  S([Start]) --> A[Profile page]
  A --> C[/Name, email, phone,<br/>city, address/]
  qA((A)) --> C
  C --> D{Name and<br/>email valid?}
  D -- No --> D1[Show the error] --> rA1((A))
  D -- Yes --> E{Shared account,<br/>new email?}
  E -- Yes --> E1[Show: this shared account's<br/>email can't be changed] --> rA2((A))
  E -- No --> F[Details saved]
  F --> G{Email changed?}
  G -- Yes --> G1[Confirmation link sent<br/>to the new email] --> X([End])
  G -- No --> X`],
      ["Part b: change password", `
flowchart TD
  S([Start]) --> A[Profile page: Change password]
  A --> H{Shared account?}
  H -- Yes --> H1([Show: this shared account's<br/>password can't be changed])
  H -- No --> I[/Current, new and<br/>confirm password/]
  qB((B)) --> I
  I --> J{8+ characters<br/>and match?}
  J -- No --> J1[Show the error] --> rB1((B))
  J -- Yes --> K{Current password<br/>correct?}
  K -- No --> K1[Show: Current password<br/>is incorrect] --> rB2((B))
  K -- Yes --> L[New password saved] --> X([End])`],
      ["Part c: reminders and log out", `
flowchart TD
  S([Start]) --> A[Profile page]
  A --> B{Owner chooses}
  B -- Log out --> UC1[[Register / Login, UC1]]
  B -- Reminders switch --> M[On or off saved<br/>to the profile]
  M --> M1{On, and notifications<br/>not yet allowed?}
  M1 -- No --> X([End])
  M1 -- Yes --> M2[Owner taps Allow notifications,<br/>the browser asks permission]
  M2 --> M3{Allowed?}
  M3 -- Yes --> M4[Device registered for alerts<br/>when the app is closed] --> X
  M3 -- No --> M5[Alerts only while<br/>the app is open] --> X`],
      ["Part d: security question", `
flowchart TD
  S([Start]) --> A{Opened from}
  A -- Dashboard reminder:<br/>Set a security question --> B[Profile page:<br/>Security question]
  A -- Profile page --> B
  B --> C{Shared demo<br/>account?}
  C -- Yes --> C1([Show: shared accounts can't<br/>set a security question])
  C -- No --> D[/Question from the list or my own,<br/>answer, current password/]
  qA((A)) --> D
  D --> E{Question chosen, answer of<br/>2+ characters, password given?}
  E -- No --> E1[Show what to fix] --> rA1((A))
  E -- Yes --> F{Current password<br/>correct?}
  F -- No --> F1[Show: Your password<br/>is incorrect] --> rA2((A))
  F -- Yes --> G[Answer saved only as a hash;<br/>forgot password now works] --> X([End])`],
    ],
  },
  {
    id: "UC10", name: "Ask FurFriends (AI assistant)", source: "Added during development, not in Figure 2.2",
    goal: "The owner asks a pet-care question in English, Tagalog or Taglish and gets an answer from checked sources, in a separate chat for each pet, using that pet's own records.",
    code: "src/lib/knowledge.js, src/lib/evidence.js, src/lib/assistant.js, src/lib/petAnswers.js, src/lib/petNotes.js, src/lib/chatHistory.js, src/pages/Assistant.jsx, api/ask.py",
    frs: [
      ["FR10.1", "Never give medicine doses; dose questions get 'only a vet can prescribe' advice."],
      ["FR10.2", "Give a short reply to greetings and thanks, and understand common Tagalog words."],
      ["FR10.3", "Answer only from checked sources. The AI gets only passages about the question (none for prices, other animals, or questions the library can't answer; a law only for legal questions). An AI answer that names a law, organisation, number or medicine its passages don't have, or wanders off them, is replaced by the checked answer, and only the passages an answer uses are credited. When the AI says it couldn't find an answer although a first-aid guide or a close passage was sent, it is asked once more, and that answer is kept only if it passes the same check and uses the best passage."],
      ["FR10.4", "Safety notes: emergency wording (English or Tagalog) brings up the first-aid guide first and 'go to a vet now'; an answer about a symptom or something the pet swallowed tells the owner to see a vet; a cat that hasn't eaten for days is told first to go to a vet now."],
      ["FR10.5", "Follow-up questions keep the subject they refer to, and a new topic or animal starts fresh. The AI gets the owner's messages in the conversation, never the app's earlier answers."],
      ["FR10.6", "With a pet chosen: questions about its own records (condition, vaccines, allergies, last vet visit, weight, diet, age, medicines) are answered from its health check, not by the AI; its name is searched as its species; the AI gets its profile (the whole profile from model v6 on); notes from its records are added under an answer only when relevant, replacing any the AI wrote; and he/she in the answer matches the pet's sex."],
      ["FR10.7", "One conversation per pet, plus one about pets in general. Picking a pet opens its chat, the AI gets only that chat, and New chat clears only that one. Chats are saved to the owner's account (on the shared accounts, only in the browser tab)."],
      ["FR10.8", "The AI's training data: no evaluation question or evaluation pet is trained on; the pets are simulated and labelled; 'couldn't find' examples really don't answer and never cover emergencies; symptom rules quote their checked answer word for word and are used only after two teammates approve them."],
    ],
    note: "These tests run the assistant's real code on the real knowledge index, with recorded search vectors and a faked AI server. How accurate the AI's own answers are is measured separately: the automatic benchmark and pet test (ai-server/README.md) and the held-out questions graded by the team (ai-server/evaluate.py).",
    flows: [
      ["Part a: rules before the AI", `
flowchart TD
  S([Start]) --> P[/Owner picks a pet or Pets in general:<br/>each has its own chat, UC10 part c/]
  P --> A[/Owner asks a question:<br/>English, Tagalog or Taglish/]
  A --> U{Emergency<br/>wording?}
  U -- Yes --> U1[Red box links to the first-aid guide;<br/>the guide is given to the AI first]
  U -- No --> B{Greeting, thanks<br/>or dose question?}
  U1 --> B
  B -- Yes --> B1[Short reply, or: I can't give doses,<br/>only a vet can prescribe] --> X([End])
  B -- No --> R{About the chosen<br/>pet's own records?}
  R -- Yes --> R1[Answer from its health check:<br/>no AI, no diagnosis] --> X
  R -- No --> C{Weight or breed<br/>question, pet chosen?}
  C -- Yes --> C1[Answer from the breed guide,<br/>using the pet's own weight] --> X
  C -- No --> UC10b[[Writing the answer, UC10 part b]]`],
      ["Part b: writing the answer", `
flowchart TD
  S([Question not answered<br/>by a rule]) --> D[Search on the device: up to 2 checked<br/>passages about the question; the pet's<br/>name is searched as cat or dog]
  D --> D1{Any passage<br/>about it?}
  D1 -- No --> H
  D1 -- Yes --> E[FurFriends AI on Vercel writes the<br/>answer from those passages and<br/>the pet's profile]
  E --> F{What came back?}
  F -- Nothing: offline<br/>or limit used up --> H
  F -- Couldn't find, though a first-aid<br/>guide or close passage was sent --> F1[Asked once more: kept only<br/>if it uses the best passage] --> G0
  F -- Couldn't find --> H
  F -- An answer --> G0{Says only what<br/>its passages say?}
  G0 -- Yes --> G[Show it: he/she for the pet, notes<br/>from its records, sources, rating]
  G0 -- No --> H{Checked answer<br/>close enough?}
  H -- Yes --> I[Show the checked answer<br/>with its source]
  H -- No --> J[Say there is no checked answer<br/>yet, offer similar questions]
  G & I & J --> K[Saved in that pet's chat] --> X([End])`],
      ["Part c: one chat per pet", `
flowchart TD
  S([Ask page]) --> A[/Owner picks a pet,<br/>or Pets in general/]
  qA((A)) --> A
  A --> B{Shared demo<br/>account?}
  B -- No --> C[Open that pet's chat,<br/>saved in the owner's account]
  B -- Yes --> D[Open that pet's chat,<br/>kept in this browser tab]
  C & D --> E[/Owner asks in this chat/]
  E --> F[The AI gets only this chat's questions;<br/>the answer lands in this chat]
  F --> G{Owner chooses}
  G -- Another pet --> rA1((A))
  G -- New chat about this pet --> H[Only this pet's<br/>chat is cleared] --> rA2((A))
  G -- Done --> X([End])`],
    ],
  },
  {
    id: "UC11", name: "Usability survey", source: "Added during development, not in Figure 2.2",
    goal: "A tester fills in the System Usability Scale (SUS) survey after trying the app, for the thesis results.",
    code: "src/lib/survey.js, src/pages/Survey.jsx, table usability_responses",
    frs: [
      ["FR11.1", "Collect the 10 standard SUS statements and compute the SUS score the standard way; shared demo accounts can't send answers."],
    ],
    flow: `
flowchart TD
  S([Start]) --> A[Survey page]
  A --> B[/Participant code, device, task results,<br/>10 SUS statements, comments/]
  qA((A)) --> B
  B --> C{All 10<br/>answered?}
  C -- No --> C1[Show which statements<br/>are missing] --> rA((A))
  C -- Yes --> D{Shared<br/>account?}
  D -- Yes --> D1[Show: this shared account<br/>can't send survey answers]
  D -- No --> E[Saved to usability_responses;<br/>SUS score computed by the database]
  E --> F[Thank-you message]
  D1 & F --> X([End])`,
  },
];

/* Requirements with no automated unit test, and why. Stated in the report so nothing looks tested that isn't. */
const NOT_UNIT_TESTED = [
  ["Web push when the app is closed (UC4)", "Runs in Supabase's send-reminders edge function on a schedule, outside the app. It uses the same rules as the tested src/lib/reminders.js. It was checked end to end on the live project on 19 Oct 2026 (one real notification sent, none on the rerun)."],
  ["Live TomTom data (UC7)", "The tests use recorded TomTom answers. The live find-clinics function was checked on 29 Oct 2026: 11 clinics for Batangas City, a repeat search served from the saved search, an address search for Lipa City, and a refusal when not logged in."],
  ["Map display and Google Maps app (UC7, UC8)", "Drawing the map and opening Google Maps happen in the browser and the phone; the tests check the exact links the buttons open."],
  ["Forgot password in the database (UC1, UC9)", "Checking the answer, the 15-minute lock and setting the new password are done by database functions in Supabase; the unit tests use a stand-in with the same rules. The SQL itself was run on 20 Nov 2026 on a local PostgreSQL 18 with a stand-in for Supabase's auth tables (supabase/tests/security_questions.sql): all 14 checks came out as expected. After it was applied to the live project the same day, it was checked there with the app's public key, without logging in: an unknown email gets no question and no reset, and a stranger can't read the table, set a question or see one."],
  ["Saved chats on the live database (UC10)", "Checked on the preview on 20 Nov 2026: the table and its row-level security with the app's public key (a stranger can't read or add chats), then saving and reopening each pet's chat by the team."],
  ["The AI model's own answers (UC10)", "The unit tests fake the AI server. The real model is measured separately: the automatic benchmark and pet test in ai-server/README.md, and the held-out questions graded by the team."],
];

/* ---------------------------------------------------------------- page */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const byFr = (fr) => tests.filter((t) => t.fr === fr);
const total = tests.length, passed = tests.filter((t) => t.status === "passed").length, failed = total - passed;
const known = new Set(USE_CASES.flatMap((u) => u.frs.map(([id]) => id)));
const orphans = tests.filter((t) => !known.has(t.fr));
const untested = USE_CASES.flatMap((u) => u.frs.map(([id]) => id)).filter((id) => !byFr(id).length);
const runAt = new Date(raw.startTime || Date.now());
const when = runAt.toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila" });

// Lettered circles are connectors: a "go back" loop ends at one and continues at the circle with the same letter.
// That keeps the charts free of crossing loop lines.
const styled = (flow) => {
  const conn = [...new Set([...flow.matchAll(/\b([qr][A-Z]\d?)\(\(/g)].map((m) => m[1]))];
  const links = [...flow.matchAll(/\b(UC\d+[a-z]?)\[\[/g)].map((m) => m[1]);
  return flow.trim()
    + "\n  classDef conn fill:#fff4d6,stroke:#c99a1c,color:#7a5a00,font-weight:bold"
    + (conn.length ? `\n  class ${conn.join(",")} conn` : "")
    + "\n  classDef link fill:#f1ece4,stroke:#8a8272"
    + (links.length ? `\n  class ${links.join(",")} link` : "");
};
const ucSection = (u) => {
  let n = 0;
  const rows = u.frs.flatMap(([fr]) => byFr(fr).map((t) => ({ ...t, id: `${u.id}-T${String(++n).padStart(2, "0")}` })));
  const ok = rows.filter((t) => t.status === "passed").length;
  return `
${(u.flows || [["", u.flow]]).map(([part, flow], i) => `
<section class="page">
  <div class="uc-head"><span class="tag">${u.id}</span><h2>${esc(u.name)}${part ? `<span class="part">Flowchart, ${esc(part)}</span>` : ""}</h2><span class="src">${esc(u.source)}</span></div>
  ${i === 0 ? `<p class="lead">${esc(u.goal)}</p>` : ""}
  <div class="flow"><pre class="mermaid">${esc(styled(flow))}</pre></div>
</section>`).join("")}
<section class="page">
  <div class="uc-head"><span class="tag">${u.id}</span><h2>${esc(u.name)}: unit tests</h2></div>
  <h3>Functional requirements</h3>
  <table class="frs"><tbody>${u.frs.map(([id, text]) => `<tr><td class="k">${id}</td><td>${esc(text)}</td><td class="num">${byFr(id).filter((t) => t.status === "passed").length}/${byFr(id).length} passed</td></tr>`).join("")}</tbody></table>
  <p class="code">Code under test: ${esc(u.code)}</p>
  <h3>Test cases (${ok} of ${rows.length} passed)</h3>
  <table class="tests"><thead><tr><th>Test ID</th><th>Req.</th><th>Test case and expected result</th><th>Result</th></tr></thead><tbody>
  ${rows.map((t) => `<tr><td class="k">${t.id}</td><td>${t.fr}</td><td>${esc(t.title)}${t.error ? `<div class="err">${esc(t.error)}</div>` : ""}</td><td class="res ${t.status}">${t.status === "passed" ? "Passed" : "Failed"}</td></tr>`).join("")}
  </tbody></table>
  ${u.note ? `<p class="note">${esc(u.note)}</p>` : ""}
</section>`;
};

const summaryRows = USE_CASES.map((u) => {
  const ts = u.frs.flatMap(([fr]) => byFr(fr));
  return `<tr><td class="k">${u.id}</td><td>${esc(u.name)}</td><td>${u.frs.length}</td><td>${ts.length}</td><td>${ts.filter((t) => t.status === "passed").length}</td><td>${ts.filter((t) => t.status !== "passed").length}</td><td class="src2">${esc(u.source)}</td></tr>`;
}).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>FurFriends unit tests and flowcharts</title>
<style>
  @page { size: A4; margin: 14mm 14mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 9.6pt/1.4 "Segoe UI", Arial, sans-serif; color: #1b1f1d; }
  .page { page-break-after: always; break-after: page; }
  section.page:last-of-type { page-break-after: auto; break-after: auto; }
  h1 { font-size: 26pt; margin: 0 0 4px; color: #123d33; letter-spacing: -0.5px; }
  h2 { font-size: 15pt; margin: 0; color: #123d33; }
  h3 { font-size: 11pt; color: #123d33; margin: 14px 0 6px; }
  .lead { color: #4a524e; margin: 6px 0 4px; }
  .tag { display: inline-block; background: #123d33; color: #fff; border-radius: 5px; padding: 2px 8px; font-size: 9pt; font-weight: 700; }
  .uc-head { display: flex; gap: 10px; align-items: center; border-bottom: 2px solid #ffc94d; padding-bottom: 6px; flex-wrap: wrap; }
  .uc-head .part { display: block; font-size: 10.5pt; font-weight: 600; color: #4a524e; margin-top: 2px; }
  .uc-head .src { margin-left: auto; font-size: 8.5pt; color: #6b736f; }
  .flow { margin-top: 6px; display: flex; justify-content: center; }
  .flow .mermaid { margin: 0; width: 100%; display: flex; justify-content: center; }
  .flow svg { max-width: 100% !important; max-height: 238mm; height: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 8.8pt; }
  th { text-align: left; background: #123d33; color: #fff; padding: 5px 7px; }
  td { padding: 4px 7px; border-bottom: 1px solid #e5dfd4; vertical-align: top; }
  tr { break-inside: avoid; }
  td.k { font-weight: 700; color: #123d33; white-space: nowrap; }
  td.num { white-space: nowrap; color: #4a524e; text-align: right; }
  tr:nth-child(even) td { background: #faf7f1; }
  .res { font-weight: 700; white-space: nowrap; }
  .res.passed { color: #238553; } .res.failed { color: #d0453a; }
  .err { color: #d0453a; font-size: 8pt; margin-top: 2px; }
  .code { font-size: 8.5pt; color: #6b736f; margin: 6px 0 0; }
  .note { font-size: 9pt; color: #4a524e; margin-top: 8px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 10px 0; }
  .card { border: 1px solid #ded7cb; border-radius: 8px; padding: 10px 12px; background: #fbf8f3; }
  .card b { display: block; font-size: 20pt; color: #123d33; }
  .card span { font-size: 9pt; color: #4a524e; }
  .card.ok b { color: #238553; } .card.bad b { color: ${failed ? "#d0453a" : "#123d33"}; }
  ul { margin: 4px 0 0 18px; padding: 0; } li { margin: 3px 0; }
  .src2 { font-size: 8pt; color: #6b736f; }
  .legend { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 8.5pt; color: #4a524e; margin-top: 6px; }
</style></head><body>

<section class="page">
  <span class="tag">Testing</span>
  <h1 style="margin-top:10px">FurFriends</h1>
  <p class="lead" style="font-size:13pt">Unit tests for each functional requirement, and a flowchart for each use case</p>
  <p>FurFriends: A Mobile-Based Pet Care Companion with Emergency Support System for Cat and Dog Owners. Live at furfriends-black.vercel.app.</p>
  <div class="cards">
    <div class="card"><b>${USE_CASES.length}</b><span>use cases (9 from Figure 2.2, 2 added)</span></div>
    <div class="card"><b>${known.size}</b><span>functional requirements</span></div>
    <div class="card ok"><b>${passed}/${total}</b><span>unit tests passed</span></div>
    <div class="card bad"><b>${failed}</b><span>failed</span></div>
  </div>
  <h3>Summary by use case</h3>
  <table><thead><tr><th>Use case</th><th>Name</th><th>Requirements</th><th>Tests</th><th>Passed</th><th>Failed</th><th>Source</th></tr></thead><tbody>${summaryRows}</tbody></table>
  ${untested.length ? `<p class="note" style="color:#d0453a">Requirements with no test: ${untested.join(", ")}</p>` : ""}
  ${orphans.length ? `<p class="note" style="color:#d0453a">Tests not tied to a listed requirement: ${orphans.length}</p>` : ""}

  <h3>How the tests were run</h3>
  <ul>
    <li><b>Run:</b> ${esc(when)} (Philippine time), with <code>npm run test:report</code>. The results tables below are filled in from that run, not typed by hand.</li>
    <li><b>Tools:</b> Vitest ${esc(ver("vitest"))} in a simulated browser (jsdom ${esc(ver("jsdom"))}), React Testing Library ${esc(ver("@testing-library/react"))}, Node ${esc(process.version)}.</li>
    <li><b>What is tested:</b> the app's real code (forms, the data store, scheduling, reminders, the health check and weight history, forgot password, breed and emergency content, the clinic search, and the assistant's rules, evidence check and per-pet chats). Each test is tagged with the requirement it checks.</li>
    <li><b>Test doubles:</b> Supabase is replaced by an in-memory fake that records every database call (its database functions, such as forgot password's, by stand-ins with the same rules), TomTom by recorded answers, and the AI server and the browser's search model by recorded answers and vectors, so tests never touch the live database or use the free TomTom searches. Reminder and schedule tests use a fixed clock (Thursday 29 Oct 2026, 10:00 AM); the health-check tests date their records from the day they run.</li>
    <li><b>Do the tests catch mistakes?</b> On 20 Nov 2026, four rules were broken on purpose, one at a time: the password length (UC1), the evidence check's law rule (UC10), he/she for the pet (UC10) and the shared accounts' security question (UC9). The matching tests failed each time (1, 1, 5 and 1 tests), and passed again once the code was restored. The same check on 29 Oct 2026 broke the password length, the clinic filter and the dose refusal.</li>
  </ul>
  <h3>Not covered by unit tests</h3>
  <table><tbody>${NOT_UNIT_TESTED.map(([a, b]) => `<tr><td class="k" style="white-space:normal;width:32%">${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</tbody></table>
  <h3>Flowchart symbols</h3>
  <div class="legend"><span>Rounded ends: start and end</span><span>Rectangle: a step</span><span>Slanted box: owner's input</span><span>Diamond: a decision</span><span>Lettered circle: connector; continue at the circle with the same letter</span><span>Double-edged box: continues in another use case</span></div>
</section>

${USE_CASES.map(ucSection).join("\n")}

<script src="${MERMAID}"></script>
<script>
  mermaid.initialize({ startOnLoad: true, securityLevel: "loose", theme: "base", fontFamily: "Segoe UI, Arial, sans-serif",
    themeVariables: { primaryColor: "#e3f1ec", primaryBorderColor: "#1f6f5a", primaryTextColor: "#123d33", lineColor: "#5b625e", fontSize: "15px", edgeLabelBackground: "#ffffff" },
    flowchart: { htmlLabels: true, curve: "basis", nodeSpacing: 26, rankSpacing: 34, useMaxWidth: true, padding: 8 } });
</script>
</body></html>`;

const htmlPath = join(OUT, "FurFriends-unit-tests-and-flowcharts.html");
writeFileSync(htmlPath, html);
console.log(`\n${passed}/${total} tests passed. HTML → ${htmlPath}`);

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
if (chrome) {
  const pdfPath = join(OUT, "FurFriends-unit-tests-and-flowcharts.pdf");
  const tmp = mkdtempSync(join(tmpdir(), "furfriends-pdf-"));
  const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=30000",
    `--user-data-dir=${join(tmp, "c")}`, `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: "ignore", timeout: 180000 });
  console.log(r.status === 0 && existsSync(pdfPath) ? `PDF → ${pdfPath}` : "PDF not made (open the HTML in a browser and print it, A4).");
} else console.log("Chrome not found: open the HTML in a browser and print it, A4.");
if (run.status !== 0 || failed) process.exitCode = 1;
