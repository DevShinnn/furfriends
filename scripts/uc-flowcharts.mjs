/* Builds docs/system-design/FurFriends-use-case-flowcharts.html and .pdf: one flowchart per page for
   Figures 2.9–2.25 (UC1–UC10), portrait A4, with a symbol key first.

     node scripts/uc-flowcharts.mjs

   Every step and message follows the app's code (the files are named under each figure); update the chart
   when that code changes. The charts are drawn by Mermaid (jsDelivr CDN, pinned version), so the PDF step
   needs internet. The PDF is printed by headless Chrome, as in scripts/system-design.mjs. */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "system-design");
const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";

// Shared styles: start/end, input/output, error messages and off-page connectors.
const STYLE = `
  classDef term fill:#123d33,stroke:#123d33,color:#ffffff
  classDef io fill:#fff7dd,stroke:#b38600,color:#3d2e00
  classDef err fill:#fdecea,stroke:#b3261e,color:#5c1410
  classDef conn fill:#ffc94d,stroke:#8a6500,color:#3d2e00`;

const FIGURES = [
  ["2.9", "UC1 Register / Login, Part a: Log in, Demo Account, and Log Out",
    "src/pages/Auth.jsx, src/components/DemoAccounts.jsx, src/store/StoreContext.jsx (login, logout, fetchAll)", `
flowchart TD
  S(["Start"]):::term --> O["Open FurFriends"]
  O --> L{"Already logged in?"}
  L -->|Yes| D
  L -->|No| P["Show the Log in screen"]
  P --> C{"How does the owner<br/>log in?"}
  C -->|Email and password| I[/"Enter email and password,<br/>tap Log in"/]:::io
  C -->|Demo account| DM[/"Tap Log in with demo account,<br/>or pick one of the 4 demo accounts"/]:::io
  I --> E{"Both filled in?"}
  E -->|No| E1["Please enter your email<br/>and password."]:::err
  E1 --> I
  E -->|Yes| A["Check the email and password<br/>with Supabase Auth"]
  DM --> A
  A --> V{"Accepted?"}
  V -->|No| V1["Show why: Incorrect email or password,<br/>Please confirm your email first, or<br/>The demo account isn't available"]:::err
  V1 --> P
  V -->|Yes| F["Load the owner's profile, pets, records,<br/>schedules and documents"]
  F --> FL{"Loaded?"}
  FL -->|No| F1["Log out and show:<br/>Couldn't load your data"]:::err
  F1 --> P
  FL -->|Yes| D["Show the Dashboard with<br/>Welcome back! or Welcome!"]
  D --> U["Owner uses the app"]
  U --> LO[/"Tap Log out<br/>(sidebar or Profile)"/]:::io
  LO --> CL["End the Supabase session; clear the<br/>AI chat and the data on screen"]
  CL --> M["Show: You've been logged out"]
  M --> R["Return to the Log in screen"]
  R --> X(["End"]):::term`],

  ["2.10", "UC1 Register / Login, Part b: Create an Account",
    "src/pages/Auth.jsx (Register), src/store/StoreContext.jsx (register), supabase/migrations/20261017000000_init.sql (handle_new_user)", `
flowchart TD
  S(["Start"]):::term --> P["On the Log in screen,<br/>tap Create an account"]
  P --> R[/"Enter full name, email, password<br/>and confirm password; tap Create account"/]:::io
  R --> CK["Check, in order: name filled in; valid email;<br/>password at least 8 characters; passwords match"]
  CK --> V{"All checks pass?"}
  V -->|No| VE["Show the first problem: Please enter your name. /<br/>Please enter a valid email address. / Password must<br/>be at least 8 characters. / Passwords don't match."]:::err
  VE --> R
  V -->|Yes| SU["Create the account in Supabase Auth;<br/>a profile row is made with the name"]
  SU --> OK{"Created?"}
  OK -->|No| SE["Show why: An account with this email<br/>already exists, or Too many emails sent"]:::err
  SE --> R
  OK -->|Yes| CF{"Email confirmation<br/>required?"}
  CF -->|Yes| CE["Show Check your email: a confirmation<br/>link was sent; Go to log in"]
  CE --> X
  CF -->|No| LD["Load the new owner's data"]
  LD --> W["Show the Dashboard: Account created —<br/>welcome to FurFriends!"]
  W --> X(["End"]):::term`],

  ["2.11", "UC2 Manage Pet Profile, Part a: Add or Edit a Pet",
    "src/components/Forms.jsx (PetForm), src/pages/Pets.jsx, src/pages/PetDetail.jsx, src/store/StoreContext.jsx (addPet, updatePet)", `
flowchart TD
  S(["Start"]):::term --> T{"Add a new pet<br/>or edit one?"}
  T -->|Add| A["Tap Add pet: open Add a new pet<br/>(Cat and Female by default)"]
  T -->|Edit| B["Open the pet and tap Edit:<br/>the form shows its details"]
  A --> IN
  B --> IN
  IN[/"Enter photo (optional), name, species, breed,<br/>age in years and months, weight and gender"/]:::io
  IN --> PH{"Photo chosen?"}
  PH -->|Yes| PR{"Readable image?"}
  PR -->|No| PE["That file couldn't be<br/>read as an image."]:::err
  PE --> IN
  PR -->|Yes| RS["Shrink the photo<br/>to 900 px JPEG"]
  RS --> SV
  PH -->|No| SV[/"Tap Create profile<br/>or Save changes"/]:::io
  SV --> CK["Check, in order: name filled in; age not negative<br/>and months 0 to 11; weight empty or more than 0"]
  CK --> V{"All checks pass?"}
  V -->|No| VE["Show the first problem: Please give your pet a name. /<br/>Age months must be between 0 and 11. /<br/>Weight must be greater than 0."]:::err
  VE --> IN
  V -->|Yes| MD{"Adding or editing?"}
  MD -->|Adding| AD["Show the new pet right away and<br/>open its profile: (name) added"]
  MD -->|Editing| ED["Update the profile on screen:<br/>(name)'s profile updated"]
  AD --> DB
  ED --> DB
  DB["Save in Supabase in the background:<br/>photo to storage, then the pets table"]
  DB --> OK{"Saved?"}
  OK -->|No| ER["Couldn't save to the server: reload<br/>from the server, undoing the change"]:::err
  ER --> X
  OK -->|Yes| X(["End"]):::term`],

  ["2.12", "UC2 Manage Pet Profile, Part b: Delete a Pet or Add a Health Record",
    "src/components/Forms.jsx (useDeletePet, MedForm, VaxForm, DocForm), src/pages/PetDetail.jsx, src/store/StoreContext.jsx (deletePet, upsertItem)", `
flowchart TD
  S(["Start"]):::term --> P["Open the pet's profile"]
  P --> C{"What does the<br/>owner do?"}
  C -->|Delete the pet| D1[/"Tap Delete"/]:::io
  D1 --> CF["Ask: Delete (name)? This permanently removes<br/>the profile with its medical records,<br/>vaccinations and documents"]
  CF --> CO{"Confirmed?"}
  CO -->|Cancel| X
  CO -->|Delete profile| RM["Remove the pet from the screen:<br/>(name)'s profile deleted"]
  RM --> DD["Delete the pet in Supabase; its records,<br/>schedules and files go with it"]
  DD --> OK
  C -->|Add a health record| TB{"Which tab?"}
  TB -->|Medical history| M[/"Date, type, title or diagnosis,<br/>vet or clinic, notes"/]:::io
  M --> MV{"Date and title<br/>filled in?"}
  MV -->|No| ME["Date and title<br/>are required."]:::err
  ME --> M
  MV -->|Yes| SAVE
  TB -->|Vaccinations| V[/"Vaccine, date given, next due,<br/>clinic, lot number"/]:::io
  V --> VV{"Vaccine and date given filled<br/>in; next due after it?"}
  VV -->|No| VE["Vaccine name and date given are<br/>required, or Next due date must<br/>be after the date given."]:::err
  VE --> V
  VV -->|Yes| SAVE
  TB -->|Documents| F[/"Photo, scan or PDF (up to 10 MB),<br/>title, type, date, notes"/]:::io
  F --> FV{"Image or PDF chosen,<br/>and a title?"}
  FV -->|No| FE["Please choose a photo, a scan or a<br/>PDF; That PDF is over 10 MB; or<br/>Please give the document a title."]:::err
  FE --> F
  FV -->|Yes| SAVE
  SAVE["Show the record on its tab<br/>with a confirmation message"]
  SAVE --> SDB["Save in Supabase in the background<br/>(a document's file goes to storage first)"]
  SDB --> OK{"Saved?"}
  OK -->|No| ER["Couldn't save to the server: reload<br/>from the server, undoing the change"]:::err
  ER --> X
  OK -->|Yes| X(["End"]):::term`],

  ["2.13", "UC3 Set Care Reminders",
    "src/pages/Care.jsx (PetCarePanel, PetSchedule), src/components/CareForms.jsx (FeedingForm, TaskForm, AppointmentForm), src/lib/care.js", `
flowchart TD
  S(["Start"]):::term --> P["Open the pet's Feeding & care tab,<br/>then Manage"]
  P --> K{"What kind of<br/>reminder?"}
  K -->|Meal| FM[/"Time, food, amount,<br/>which days, notes"/]:::io
  FM --> FV{"Time and food filled in,<br/>and at least one day?"}
  FV -->|No| FE["Pick a feeding time, Add the food,<br/>or Choose at least one day"]:::err
  FE --> FM
  K -->|Grooming, deworming<br/>or vaccine task| TM[/"Type, name, due date,<br/>how often, notes"/]:::io
  TM --> TV{"Name and due date<br/>filled in?"}
  TV -->|No| TE["Give this task a name, or<br/>Choose when it's due"]:::err
  TE --> TM
  K -->|Vet appointment| AM[/"What it's for, date, time,<br/>clinic and notes"/]:::io
  AM --> AV{"Reason and date<br/>filled in?"}
  AV -->|No| AE["What's the visit for? or<br/>Choose the appointment date"]:::err
  AE --> AM
  K -->|Vaccine booster| VX["Add a vaccination with a Next due date<br/>(Figure 2.12); it shows as a reminder"]
  FV -->|Yes| SH
  TV -->|Yes| SH
  AV -->|Yes| SH
  SH["Show the reminder right away in Upcoming,<br/>Chart and Manage, with a confirmation"]
  SH --> DB["Save in Supabase: meals in feeding_schedules,<br/>tasks and visits in care_tasks"]
  DB --> OK{"Saved?"}
  OK -->|No| ER["Couldn't save to the server: reload<br/>from the server, undoing the change"]:::err
  ER --> X
  OK -->|Yes| X
  VX --> X(["End"]):::term`],

  ["2.14", "UC4 Receive Notifications, Part a: While the App Is Open",
    "src/components/Reminders.jsx (useReminders, ReminderWatcher, BellButton), src/lib/reminders.js (dueReminders, showSystemNotification)", `
flowchart TD
  S(["Start: app open<br/>and logged in"]):::term --> ON{"Reminders switched<br/>on in Profile?"}
  ON -->|No| OFF["No reminders; the bell says<br/>Reminders are turned off"]
  OFF --> X
  ON -->|Yes| T["Check the pets' meals, tasks, visits and<br/>vaccine due dates on the device"]
  T --> RU["Due: a meal within 15 minutes, a task due today<br/>or overdue, a vet visit today or tomorrow"]
  RU --> DUE{"Anything due?"}
  DUE -->|No| W["Wait 60 seconds"]
  W --> T
  DUE -->|Yes| BELL["Show the number on the bell"]
  BELL --> NEW{"Not announced yet, and<br/>app not just opened?"}
  NEW -->|No| W
  NEW -->|Yes| PERM{"Notifications allowed<br/>on this device?"}
  PERM -->|Yes| SYS["Show a system notification<br/>(up to 3 at a time)"]
  PERM -->|No| TOAST["Show an in-app message"]
  SYS --> TAP
  TOAST --> TAP
  TAP{"Owner taps the notification<br/>or opens the bell?"}
  TAP -->|No| W
  TAP -->|Yes| OPEN["Open the pet's care or vaccines tab,<br/>or Appointments"]
  OPEN --> ACT[/"Tap Mark fed or Done"/]:::io
  ACT --> X(["End"]):::term`],

  ["2.15", "UC4 Receive Notifications, Part b: When the App Is Closed",
    "src/lib/push.js, public/sw-notify.js, supabase/functions/send-reminders/index.ts, supabase/migrations/20261019020000_push_notifications.sql", `
flowchart TD
  S(["Start"]):::term --> AL["Owner allows notifications<br/>in Profile (Figure 2.23)"]
  AL --> PS{"Browser supports<br/>web push?"}
  PS -->|No| NO["Alerts arrive only while the app<br/>is open (Figure 2.14)"]
  NO --> X
  PS -->|Yes| SUB["Subscribe this device and save it<br/>in push_subscriptions"]
  SUB --> CRON["Every 5 minutes, the Supabase scheduler<br/>calls the send-reminders function"]
  CRON --> AU{"Correct secret?"}
  AU -->|No| AE["Refuse the call<br/>(401 Unauthorized)"]:::err
  AE --> X
  AU -->|Yes| LOAD["Load owners with reminders on:<br/>their devices, pets, meals, tasks and vaccines"]
  LOAD --> RU["Due in the last 10 minutes (owner's time zone): a meal<br/>at its time; a task at 8 AM or its time; a vet visit<br/>2 h before and at 6 PM the day before; overdue at 8 AM"]
  RU --> DUE{"Anything due?"}
  DUE -->|No| NX["Wait for the next run"]
  NX --> CRON
  DUE -->|Yes| SENT{"Already sent?<br/>(push_log)"}
  SENT -->|Yes| NX
  SENT -->|No| PUSH["Send a web push to each<br/>of the owner's devices"]
  PUSH --> GONE{"Device no longer<br/>subscribed (404 or 410)?"}
  GONE -->|Yes| DEL["Delete that device's subscription"]
  DEL --> X
  GONE -->|No| SHOW["The phone shows the notification,<br/>even with FurFriends closed"]
  SHOW --> TAP{"Owner taps it?"}
  TAP -->|No| X
  TAP -->|Yes| WIN{"A FurFriends window<br/>already open?"}
  WIN -->|Yes| NAV["Switch to it and go to<br/>the reminder's page"]
  WIN -->|No| OW["Open FurFriends at<br/>the reminder's page"]
  NAV --> X
  OW --> X(["End"]):::term`],

  ["2.16", "UC5 View Breed Care Tips",
    "src/pages/Breeds.jsx (Breeds, BreedDetail), src/lib/breeds.js, src/lib/breedCare.js, src/pages/PetDetail.jsx", `
flowchart TD
  S(["Start"]):::term --> E{"Where does the<br/>owner start?"}
  E -->|Breed guide menu| L["Open the breed list<br/>(29 dog and cat breeds, built into the app)"]
  E -->|Pet profile| M{"Pet's breed is<br/>in the guide?"}
  M -->|Yes| BG[/"Tap Breed guide on<br/>the Breed card"/]:::io
  BG --> DT
  M -->|No| L
  L --> F[/"Search by name, or pick All breeds,<br/>Dogs, Cats or My pets' breeds"/]:::io
  F --> MA{"Any breed matches?"}
  MA -->|No| NM["No breeds match. Mixed-breed dogs are under<br/>Aspin and mixed-breed cats under Puspin."]:::err
  NM --> F
  MA -->|Yes| C[/"Tap a breed card"/]:::io
  C --> DT["Open the breed page"]
  DT --> FD{"Breed found?"}
  FD -->|No| NF["Breed not found,<br/>with an All breeds button"]:::err
  NF --> L
  FD -->|Yes| SH["Show facts, care tips (feeding, exercise,<br/>grooming, behavior), trait meters,<br/>health watch-list and care tips"]
  SH --> YP{"Owner has a pet<br/>of this breed?"}
  YP -->|Yes| WC["Compare the pet's weight with the<br/>breed's typical range"]
  WC --> X
  YP -->|No| X(["End"]):::term`],

  ["2.17", "UC6 Open Emergency Guide",
    "src/pages/Emergency.jsx (Emergency, EmergencyGuide, EmergencyCard), src/lib/emergency.js, src/pages/Assistant.jsx", `
flowchart TD
  S(["Start"]):::term --> E{"How does the owner<br/>get there?"}
  E -->|Emergency menu| L["Open the emergency page: when to go to a vet now,<br/>Find a vet near me, each pet's card"]
  E -->|Ask FurFriends| AI["The question sounds like an emergency:<br/>show the red box with up to 3 guides"]
  AI --> G
  L --> NV{"Needs a vet<br/>right away?"}
  NV -->|Yes| CL["Tap Find a vet near me:<br/>Locate Veterinary Clinic (Figure 2.18)"]
  CL --> X
  NV -->|No| Q[/"Search, e.g. poison, bleeding, heat,<br/>or pick a type"/]:::io
  Q --> MA{"Any guide matches?"}
  MA -->|No| NM["No guide matches.<br/>If you're unsure, call your vet."]:::err
  NM --> Q
  MA -->|Yes| T[/"Tap a guide"/]:::io
  T --> G["Open the guide (16 guides,<br/>built into the app, work offline)"]
  G --> FD{"Guide found?"}
  FD -->|No| NF["Guide not found, with an<br/>All emergency guides button"]:::err
  NF --> L
  FD -->|Yes| SHOW["Show the urgency, What to do now steps,<br/>Signs to look for and Don't list"]
  SHOW --> CD{"Heading to the vet?"}
  CD -->|Yes| CARD["Open the pet's emergency card: allergies,<br/>medicine, recent conditions, vaccines,<br/>owner's phone and usual vet"]
  CARD --> X
  CD -->|No| X(["End"]):::term`],

  ["2.18", "UC7 Locate Veterinary Clinic, Part a: Getting the Owner's Location",
    "src/pages/Clinics.jsx, src/lib/clinics.js (locate, locationAllowed), src/pages/Profile.jsx (address)", `
flowchart TD
  S(["Start"]):::term --> O["Open Find a vet"]
  O --> RC{"Searched in the last<br/>10 minutes?"}
  RC -->|Yes| RS["Show that result again"]
  RS --> B((B)):::conn
  RC -->|No| G{"Location already<br/>allowed?"}
  G -->|Yes| GPS
  G -->|No| AD{"Address or city saved<br/>in Profile?"}
  AD -->|Yes| ADDR["Use the saved address"]
  AD -->|No| IDLE["Show Find clinics near you: share your<br/>location, or add your address in Profile"]
  IDLE --> BTN[/"Tap Use my location"/]:::io
  BTN --> GPS["Ask the browser for the location<br/>(the permission prompt shows the first time;<br/>15-second limit)"]
  GPS --> OK{"Location found?"}
  OK -->|Yes| A((A)):::conn
  OK -->|No| ERR["Show why: the browser can't share it,<br/>location is blocked, or GPS is off / timed out"]:::err
  ERR --> NX{"What does the<br/>owner do?"}
  NX -->|Try again| GPS
  NX -->|Use my address| ADDR
  NX -->|Add my address| PR["Enter the address in Profile<br/>(Figure 2.21)"]
  PR --> X(["End"]):::term
  ADDR --> A`],

  ["2.19", "UC7 Locate Veterinary Clinic, Part b: Searching and Showing Clinics",
    "src/lib/clinics.js (searchClinics), supabase/functions/find-clinics/index.ts and clinics.js, src/pages/Clinics.jsx (ClinicMap)", `
flowchart TD
  A((A)):::conn --> ON{"Online?"}
  ON -->|No| OFF["You're offline. Connect to the<br/>internet to find clinics."]:::err
  OFF --> X
  ON -->|Yes| CALL["Send the location or address<br/>to the find-clinics function"]
  CALL --> LG{"Logged in?"}
  LG -->|No| LE["Please log in to find clinics."]:::err
  LE --> X
  LG -->|Yes| HA{"Address sent<br/>instead of a location?"}
  HA -->|Yes| GEO["Find the address with TomTom<br/>(kept for 30 days)"]
  GEO --> GF{"Address found?"}
  GF -->|No| NF["We couldn't find that address. Try<br/>adding the barangay and city."]:::err
  NF --> X
  GF -->|Yes| CA
  HA -->|No| CA{"Same area searched in<br/>the last 7 days?"}
  CA -->|Yes| USE["Use the saved clinic list"]
  CA -->|No| TT["Ask TomTom for vets within 10 km<br/>(25 km if fewer than 5 are found)"]
  TT --> TA{"TomTom answers?"}
  TA -->|No| TE["The clinic search isn't answering<br/>right now. Try again in a minute."]:::err
  TE --> X
  TA -->|Yes| FIL["Remove non-clinics and duplicates;<br/>save the list for 7 days"]
  FIL --> USE
  USE --> DIST["Work out each clinic's distance<br/>and sort nearest first"]
  B((B)):::conn --> SHOW
  DIST --> ANY{"Any clinics?"}
  ANY -->|No| NONE["No clinics found within<br/>10 or 25 km"]
  NONE --> X(["End"]):::term
  ANY -->|Yes| SHOW["Show the map and numbered list with opening<br/>hours; filter All, Open now or 24 hours"]
  SHOW --> SEL[/"Tap a pin or a card"/]:::io
  SEL --> DET["Highlight the clinic and show its hours<br/>for the week (call or navigate: Figure 2.20)"]
  DET --> C((C)):::conn`],

  ["2.20", "UC8 Call / Navigate to Clinic",
    "src/pages/Clinics.jsx (clinic card actions), src/lib/clinics.js (directionsUrl, telUrl)", `
flowchart TD
  C((C)):::conn --> SEL["Clinic selected in the list<br/>(Figure 2.19)"]
  SEL --> CH{"Call or get<br/>directions?"}
  CH -->|Directions| DR[/"Tap Directions"/]:::io
  DR --> SRC{"Search used the<br/>saved address?"}
  SRC -->|Yes| O1["Open Google Maps directions from<br/>the address to the clinic"]
  SRC -->|No| O2["Open Google Maps directions from<br/>the phone's location to the clinic"]
  O1 --> GM
  O2 --> GM["Google Maps opens in a new tab<br/>or in the Maps app"]
  GM --> X
  CH -->|Call| PH{"Clinic has a phone<br/>number listed?"}
  PH -->|No| NB["No Call button is shown;<br/>use Directions instead"]:::err
  NB --> DR
  PH -->|Yes| TEL[/"Tap Call (number)"/]:::io
  TEL --> DIAL["The phone's dialer opens<br/>with the clinic's number"]
  DIAL --> X(["End"]):::term`],

  ["2.21", "UC9 Manage Account Settings, Part a: Personal Information",
    "src/pages/Profile.jsx, src/store/StoreContext.jsx (updateUser)", `
flowchart TD
  S(["Start"]):::term --> O["Open Profile"]
  O --> IN[/"Edit full name, email, and the optional<br/>phone, city and address (up to 200 characters)"/]:::io
  IN --> SV[/"Tap Save changes"/]:::io
  SV --> CK["Check, in order: name filled in; valid email;<br/>not a shared demo account changing its email"]
  CK --> V{"All checks pass?"}
  V -->|No| VE["Show the first problem: Name can't be empty. /<br/>Please enter a valid email address. /<br/>This shared account's email can't be changed."]:::err
  VE --> IN
  V -->|Yes| UP["Save the name, phone, city and<br/>address in the profiles table"]
  UP --> OK{"Saved?"}
  OK -->|No| ER["Show the server's message"]:::err
  ER --> IN
  OK -->|Yes| EC{"Email changed?"}
  EC -->|No| DONE["Show: Profile updated"]
  EC -->|Yes| AU["Ask Supabase Auth to<br/>change the email"]
  AU --> AOK{"Accepted?"}
  AOK -->|No| AER["Show the error"]:::err
  AER --> IN
  AOK -->|Yes| LINK["We sent a confirmation link to (email).<br/>Your email changes once you click it."]
  DONE --> X
  LINK --> X(["End"]):::term`],

  ["2.22", "UC9 Manage Account Settings, Part b: Change Password",
    "src/pages/Profile.jsx, src/store/StoreContext.jsx (changePassword)", `
flowchart TD
  S(["Start"]):::term --> O["Open Profile, Change password"]
  O --> IN[/"Enter current password, new password<br/>and confirm new password"/]:::io
  IN --> SV[/"Tap Update password"/]:::io
  SV --> SA{"A shared demo account?"}
  SA -->|Yes| SE["This shared account's password<br/>can't be changed."]:::err
  SE --> X
  SA -->|No| L{"New password at least 8<br/>characters, and matches?"}
  L -->|No| LE["New password must be at least<br/>8 characters, or New passwords<br/>don't match."]:::err
  LE --> IN
  L -->|Yes| CUR["Check the current password<br/>with Supabase Auth"]
  CUR --> CK{"Correct?"}
  CK -->|No| CE["Current password is incorrect."]:::err
  CE --> IN
  CK -->|Yes| UP["Set the new password"]
  UP --> UOK{"Accepted?"}
  UOK -->|No| UE["Show the server's message"]:::err
  UE --> IN
  UOK -->|Yes| DONE["Clear the fields and show Password updated;<br/>the owner stays logged in"]
  DONE --> X(["End"]):::term`],

  ["2.23", "UC9 Manage Account Settings, Part c: Reminders and Log Out",
    "src/pages/Profile.jsx (NotificationSettings), src/lib/push.js, src/store/StoreContext.jsx (setNotifications, logout)", `
flowchart TD
  S(["Start"]):::term --> O["Open Profile"]
  O --> C{"What does the<br/>owner do?"}
  C -->|Reminders| SW[/"Tap the Reminders switch"/]:::io
  SW --> SV["Save the setting in profiles; show<br/>Reminders turned on or off"]
  SV --> ON{"Turned on?"}
  ON -->|No| DROP["Unsubscribe this device from push<br/>and remove it from the server"]
  DROP --> X
  ON -->|Yes| PERM{"Notification permission<br/>on this device?"}
  PERM -->|Allowed| SUB["Subscribe this device to push and save it:<br/>Alerts also arrive when FurFriends is closed"]
  SUB --> X
  PERM -->|Not asked yet| ASK[/"Tap Allow notifications"/]:::io
  ASK --> BR{"Owner allows it in<br/>the browser prompt?"}
  BR -->|Yes| SUB
  BR -->|No| BLK
  PERM -->|Blocked| BLK["Notifications are blocked for this site.<br/>Change the site's setting in the browser, then reload."]:::err
  BLK --> X
  PERM -->|Not supported| NS["This browser can't show notifications.<br/>On iPhone, add FurFriends to the Home Screen first."]:::err
  NS --> X
  C -->|Log out| LO[/"Tap Log out"/]:::io
  LO --> END1["End the session and clear the data on screen;<br/>show You've been logged out"]
  END1 --> LOGIN["Go to the Log in screen"]
  LOGIN --> X(["End"]):::term`],

  ["2.24", "UC10 Ask FurFriends, Part a: Safety Rules Before the AI",
    "src/pages/Assistant.jsx, src/lib/assistant.js (askKnowledge), src/lib/knowledge.js (queryText, chatReply, safetyReply, search), src/lib/evidence.js (planAnswer), src/lib/emergency.js", `
flowchart TD
  S(["Start"]):::term --> Q[/"Owner types a question,<br/>in English or Tagalog"/]:::io
  Q --> EM{"Sounds like an<br/>emergency?"}
  EM -->|Yes| RED["Show the red box with links to the<br/>first-aid guides (Figure 2.17)"]
  RED --> QT
  EM -->|No| QT["Join a follow-up with the earlier question;<br/>add English for Tagalog words"]
  QT --> CH{"Greeting, thanks, or<br/>What can you do?"}
  CH -->|Yes| IR["Reply with a short introduction"]
  IR --> X
  CH -->|No| DO{"Asks for a<br/>medicine dose?"}
  DO -->|Yes| DR["Reply that FurFriends doesn't give<br/>doses: ask your vet"]
  DR --> X
  DO -->|No| BR{"About the selected pet's<br/>breed weight or health?"}
  BR -->|Yes| BG["Reply from the breed guide"]
  BG --> X
  BR -->|No| MD{"Search model already<br/>on this device?"}
  MD -->|No| DL["Download it once, showing Getting<br/>the assistant ready on your device (%)"]
  DL --> SE
  MD -->|Yes| SE["Search the 610 checked passages on the device<br/>(meaning match plus keyword match)"]
  SE --> PL["Keep only passages about the question:<br/>emergency guide first when urgent; none for prices<br/>or other animals; laws only for legal questions;<br/>must cover the question's main words"]
  PL --> EV{"Any passage left?"}
  EV -->|Yes| A((A)):::conn
  EV -->|No| FB["Show the closest checked answer, or<br/>I don't have a checked answer for that"]
  FB --> EN["Add the cat appetite note, and go to a vet<br/>now when it is an emergency"]
  EN --> X(["End"]):::term`],

  ["2.25", "UC10 Ask FurFriends, Part b: Writing the Answer",
    "src/lib/assistant.js (askServer, askKnowledge), api/ask.py, src/lib/evidence.js (reviewAnswer, withEmergency), src/lib/knowledge.js (withAppetiteAdvice, withVetAdvice), src/pages/Assistant.jsx (rating)", `
flowchart TD
  A((A)):::conn --> LG{"Logged in<br/>and online?"}
  LG -->|No| FB
  LG -->|Yes| SEND["Send the owner's messages, a short pet<br/>summary and up to 2 passages to /api/ask"]
  SEND --> SC["Server checks the login, the AI's monthly<br/>time limit and that passages were sent"]
  SC --> SV{"Checks pass?"}
  SV -->|No| FB
  SV -->|Yes| LD{"Model already<br/>loaded?"}
  LD -->|No| WK["Load furfriends-rag-v2 from Hugging Face<br/>(about 45 s; the app shows Waking up)"]
  WK --> GEN
  LD -->|Yes| GEN["Write the answer from the passages, stream it<br/>to the app and record the CPU time"]
  GEN --> NF{"Model says the passages<br/>don't cover it?"}
  NF -->|Yes| FB
  NF -->|No| RV["Check the answer: no doses; every law, organisation,<br/>number, link and medicine is in the passages;<br/>most of its words come from them"]
  RV --> CK{"Passes?"}
  CK -->|No| FB["Use the checked answer instead"]
  CK -->|Yes| CR["Credit only the passages it used;<br/>add vet advice for symptoms"]
  CR --> ADD
  FB --> ADD["Add the cat appetite note, and go to a vet<br/>now when it is an emergency"]
  ADD --> SHOW["Show the answer with its sources (and a note<br/>when only weaker passages matched)"]
  SHOW --> RT{"Owner rates it?"}
  RT -->|Thumbs up| SAVE
  RT -->|Thumbs down| RS[/"Pick a reason, e.g. Wrong<br/>or inaccurate, Unsafe advice"/]:::io
  RS --> SAVE["Save the rating"]
  SAVE --> X
  RT -->|No| X(["End"]):::term`],
];

// The symbol key: one small chart per symbol.
const LEGEND = [
  ['S(["Start"]):::term', "Terminator: where the flow starts or ends"],
  ['P["Load the owner\'s data"]', "Process: a step the app or the server does"],
  ['D{"Valid?"}', "Decision: one arrow per answer (Yes / No, or the choices)"],
  ['I[/"Enter email"/]:::io', "Input / output: what the owner enters, taps or is shown"],
  ['E["Please enter your name."]:::err', "Error message: shown when a check fails; the arrow returns to the step to fix"],
  ['C((A)):::conn', "Connector: the flow continues on another page at the circle with the same letter"],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const page = ([no, title, files, code]) => `
<section class="page">
  <div class="fig"><pre class="mermaid">${esc(code.trim() + "\n" + STYLE)}</pre></div>
  <p class="caption"><b>Figure ${no}</b> Flowchart: ${esc(title)}</p>
  <p class="src">Source: ${esc(files)}</p>
</section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>FurFriends use case flowcharts</title>
<style>
  @page { size: A4 portrait; margin: 12mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5pt/1.45 "Segoe UI", Arial, sans-serif; color: #1b1f1d; }
  .page { page-break-after: always; break-after: page; width: 186mm; height: 271mm; overflow: hidden; display: flex; flex-direction: column; }
  .page:last-of-type { page-break-after: auto; break-after: auto; }
  .fig { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .caption { text-align: center; margin: 4mm 0 1mm; font-size: 11pt; }
  .src { text-align: center; margin: 0; font-size: 8pt; color: #6b726e; }
  h1 { color: #123d33; font-size: 20pt; margin: 0 0 2mm; border-bottom: 3px solid #ffc94d; padding-bottom: 2mm; }
  h2 { color: #123d33; font-size: 13pt; margin: 4mm 0 2mm; }
  .cover p { margin: 2mm 0; }
  .key td { vertical-align: middle; }
  .key td.sym { width: 34mm; height: 13mm; padding: 0.5mm; text-align: center; }
  .key svg { display: block; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; line-height: 1.3; }
  td, th { border: 1px solid #cfd6d2; padding: 0.9mm 2.4mm; text-align: left; vertical-align: top; }
  th { background: #e3f1ec; color: #123d33; }
  .cover .fig { display: none; }
</style></head><body>
<section class="page cover">
  <h1>FurFriends: use case flowcharts</h1>
  <p>Figures 2.9 to 2.25 show, for each use case, the steps the FurFriends app takes, the checks it makes and the
  messages the owner sees. Each chart follows the app's code; the files are listed under each figure.</p>
  <h2>Symbols</h2>
  <table class="key">${[0, 2, 4].map((i) => `
    <tr>${LEGEND.slice(i, i + 2).map(([node, meaning]) => `<td class="sym"><pre class="mermaid">${esc(`flowchart LR\n  ${node}\n${STYLE}`)}</pre></td><td>${esc(meaning)}</td>`).join("")}</tr>`).join("")}
  </table>
  <p>Arrows show the order of steps. A decision has one arrow per answer. Lettered circles join charts that continue on
  another page: <b>A</b> links the two parts of UC7 and of UC10, <b>B</b> links a repeated clinic search
  (Figure 2.18) to the clinic list (Figure 2.19), and <b>C</b> links UC7 to UC8.
  Messages in quotes are shown to the owner word for word; <i>(name)</i> stands for the pet's or owner's name.</p>
  <h2>Figures</h2>
  <table><tr><th>Figure</th><th>Use case</th></tr>
  ${FIGURES.map(([no, title]) => `<tr><td>${no}</td><td>${esc(title)}</td></tr>`).join("\n  ")}
  </table>
</section>
${FIGURES.map(page).join("\n")}
<script src="${MERMAID}"></script>
<script>
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "base", fontFamily: "Segoe UI, Arial, sans-serif",
    themeVariables: { primaryColor: "#e3f1ec", primaryBorderColor: "#1f6f5a", primaryTextColor: "#123d33", lineColor: "#5b625e", fontSize: "17px" },
    flowchart: { htmlLabels: true, curve: "basis", nodeSpacing: 20, rankSpacing: 22, padding: 8, wrappingWidth: 480, useMaxWidth: false } });
  // Each chart is scaled to fit its page (never enlarged past 1.25×); the key's symbols are drawn at 0.7×.
  mermaid.run({ querySelector: ".mermaid", suppressErrors: true }).finally(() => {
    for (const svg of document.querySelectorAll(".fig svg, .key svg")) {
      const [, , w, h] = svg.getAttribute("viewBox").split(/[ ,]+/).map(Number);
      const box = svg.closest(".fig");
      const k = box ? Math.min(box.clientWidth / w, box.clientHeight / h, 1.25) : 0.7;
      svg.style.maxWidth = "none";
      svg.setAttribute("width", Math.floor(w * k));
      svg.setAttribute("height", Math.floor(h * k));
      svg.dataset.scale = k.toFixed(2);
    }
    document.body.dataset.done = "1";
  });
</script>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
const htmlPath = join(OUT_DIR, "FurFriends-use-case-flowcharts.html");
writeFileSync(htmlPath, html);
console.log(`HTML → ${htmlPath}`);

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
if (chrome) {
  const pdfPath = join(OUT_DIR, "FurFriends-use-case-flowcharts.pdf");
  const tmp = mkdtempSync(join(tmpdir(), "furfriends-pdf-"));
  const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=30000",
    `--user-data-dir=${join(tmp, "c")}`, `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: "ignore", timeout: 180000 });
  console.log(r.status === 0 && existsSync(pdfPath) ? `PDF → ${pdfPath}` : "PDF not made (open the HTML in a browser and print it, portrait A4).");
} else console.log("Chrome not found: open the HTML in a browser and print it, portrait A4.");
