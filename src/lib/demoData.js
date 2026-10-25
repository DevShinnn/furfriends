import { uid, addDays, todayISO } from "./utils";
import { feedsOn } from "./care";

export const DEMO_EMAIL = "demo@furfriends.app";
export const DEMO_PASS = "demo1234";
export const DEMO_PROFILE = { name: "Alex Rivera", phone: "0917 123 4567", city: "Quezon City" };

const DOC = (file, title, type, days, notes = "") => ({ id: uid(), src: `/assets/docs/${file}.svg`, title, type, date: addDays(days), notes });
const med = (days, type, title, vet, notes) => ({ id: uid(), date: addDays(days), type, title, vet, notes });
const vax = (name, given, due, vet, lot = "") => ({ id: uid(), name, dateGiven: addDays(given), nextDue: addDays(due), vet, lot });

const meal = (time, food, amount, days = []) => ({ id: uid(), time, food, amount, days, notes: "" });
const appt = (title, due, dueTime, notes, done = false) => ({ id: uid(), kind: "Vet appointment", title, nextDue: addDays(due), dueTime, repeatDays: 0, lastDone: done ? addDays(due) : null, notes, done });
const care = (kind, title, due, repeatDays, lastDone = null, notes = "") => ({ id: uid(), kind, title, nextDue: addDays(due), repeatDays, lastDone: lastDone === null ? null : addDays(lastDone), notes, done: false });

// Attach feeding plans and care tasks, plus ~2 weeks of feeding history so the
// calendar log has something to show. Today's first meal is already ticked off.
function withCare(pet, meals, tasks) {
  const fedLog = {};
  for (let i = 1; i <= 13; i++) {
    const iso = addDays(-i);
    let fed = meals.filter((m) => feedsOn(m, iso)).map((m) => m.id);
    if (i === 4 || i === 9) fed = fed.slice(0, -1); // a couple of realistic gaps (a meal missed)
    if (fed.length) fedLog[iso] = fed;
  }
  fedLog[todayISO()] = meals.slice(0, 1).map((m) => m.id);
  return { ...pet, feeding: meals, care: tasks, fedLog };
}

const MAPLE = "Maple Vet Clinic";
const RIVER = "Riverside Animal Hospital";

export function demoPets(ownerId) {
  const [mochi, bori, ginger, kong] = [
    {
      id: uid(), ownerId, name: "Mochi", species: "Cat", breed: "Domestic Shorthair", ageYears: 3, ageMonths: 4, gender: "Female", weight: 4.2,
      photo: "/assets/pets/mochi-1.jpg",
      documents: [
        DOC("mochi-vaccine-cert", "FVRCP & Rabies certificate", "Vaccination certificate", -200, "Original kept in the blue folder."),
        DOC("mochi-prescription", "Doxycycline prescription", "Prescription", -140, "For upper respiratory infection."),
      ],
      medical: [
        med(-12, "Checkup", "Annual wellness exam", `Dr. Santos · ${MAPLE}`, "Healthy weight, teeth clean. Recommended dental chews."),
        med(-140, "Illness", "Mild upper respiratory infection", `Dr. Santos · ${MAPLE}`, "Prescribed doxycycline for 7 days. Fully recovered."),
        med(-410, "Surgery", "Spay procedure", `Dr. Reyes · ${RIVER}`, "No complications. Stitches removed after 10 days."),
      ],
      vaccinations: [vax("FVRCP", -352, 13, MAPLE, "FV-22871"), vax("Rabies", -200, 530, MAPLE, "RB-10934")],
    },
    {
      id: uid(), ownerId, name: "Bori", species: "Dog", breed: "Golden Retriever", ageYears: 5, ageMonths: 0, gender: "Male", weight: 29.4,
      photo: "/assets/pets/bori-1.jpg",
      documents: [
        DOC("bori-invoice", "Paw injury visit invoice", "Invoice / receipt", -30, "Submitted to insurance."),
        DOC("bori-lab-results", "Blood panel before heartworm meds", "Lab result", -95, "All values normal."),
      ],
      medical: [
        med(-30, "Injury", "Paw pad laceration", `Dr. Cruz · ${RIVER}`, "Cleaned and bandaged. Cone for 5 days."),
        med(-95, "Medication", "Heartworm prevention started", `Dr. Cruz · ${RIVER}`, "Monthly chewable, given on the 1st."),
        med(-260, "Allergy", "Chicken protein sensitivity", `Dr. Cruz · ${RIVER}`, "Switched to salmon-based diet. Itching resolved."),
      ],
      vaccinations: [vax("DHPP", -380, -15, RIVER, "DH-55120"), vax("Rabies", -90, 640, RIVER, "RB-11820"), vax("Bordetella", -160, 22, RIVER)],
    },
    {
      id: uid(), ownerId, name: "Ginger", species: "Cat", breed: "Maine Coon", ageYears: 2, ageMonths: 1, gender: "Male", weight: 6.1,
      photo: "/assets/pets/ginger-1.jpg",
      documents: [DOC("ginger-vaccine-cert", "Vaccination certificate", "Vaccination certificate", -120)],
      medical: [
        med(-60, "Checkup", "Dental cleaning", `Dr. Santos · ${MAPLE}`, "Minor tartar removed. No extractions needed."),
        med(-300, "Surgery", "Neuter procedure", `Dr. Santos · ${MAPLE}`, "Routine. Back to normal within 3 days."),
      ],
      vaccinations: [vax("FVRCP", -120, 245, MAPLE, "FV-23110"), vax("FeLV", -360, 5, MAPLE, "FL-00871")],
    },
    {
      id: uid(), ownerId, name: "Kong", species: "Dog", breed: "French Bulldog", ageYears: 1, ageMonths: 3, gender: "Male", weight: 11.2,
      photo: "/assets/pets/kong-1.jpg",
      documents: [DOC("kong-microchip", "Microchip registration", "Microchip / registration", -300, "Needed for travel.")],
      medical: [med(-45, "Checkup", "Puppy exam & deworming", `Dr. Santos · ${MAPLE}`, "Growing well. Watch breathing in hot weather.")],
      vaccinations: [vax("DHPP", -45, 320, MAPLE, "DH-60012"), vax("Rabies", -20, 345, MAPLE, "RB-12004")],
    },
  ];
  return [
    withCare(mochi, [meal("07:00", "Royal Canin Indoor (dry)", "1/4 cup"), meal("12:30", "Wet food pouch", "1 pouch", [1, 3, 5]), meal("19:00", "Royal Canin Indoor (dry)", "1/4 cup")], [
      care("Grooming", "Brushing", 1, 7, -6), care("Grooming", "Nail trim", 9, 30, -21),
      care("Deworming", "Milbemax tablet", 18, 90, -72, "Give with food."),
      appt("Annual checkup & FVRCP booster", 12, "10:00", `Dr. Santos · ${MAPLE}`),
    ]),
    withCare(bori, [meal("06:30", "Salmon & rice kibble", "2 cups"), meal("18:00", "Salmon & rice kibble", "2 cups")], [
      care("Grooming", "Bath", -2, 14, -16), care("Grooming", "Teeth brushing", 0, 2, -2), care("Grooming", "Full groom (salon)", 24, 60, -36, "Paws & Suds, Katipunan"),
      care("Deworming", "Heartworm chewable", 8, 30, -22), care("Deworming", "Drontal Plus", 40, 90, -50),
      appt("Paw re-check", 2, "16:30", `Dr. Cruz · ${RIVER}`), appt("Paw pad injury", -30, "18:15", `Dr. Cruz · ${RIVER}`, true),
    ]),
    withCare(ginger, [meal("07:15", "Grain-free chicken (dry)", "1/3 cup"), meal("19:15", "Grain-free chicken (dry)", "1/3 cup")], [
      care("Grooming", "Brushing (long coat)", 0, 3, -3), care("Deworming", "Broadline spot-on", 3, 30, -27),
      appt("Dental check", -1, "14:00", `Dr. Santos · ${MAPLE}`),
    ]),
    withCare(kong, [meal("07:30", "Puppy kibble", "3/4 cup"), meal("12:30", "Puppy kibble", "1/2 cup"), meal("18:30", "Puppy kibble", "3/4 cup")], [
      care("Grooming", "Face wrinkle cleaning", 1, 2, -1), care("Grooming", "Nail trim", 12, 21, -9),
      care("Deworming", "Puppy deworming", 5, 30, -25), care("Vaccination", "Leptospirosis", 9, 0, null, "First dose — book at Maple Vet."),
    ]),
  ];
}

/* Every practice login in the live app (docs/sample-accounts.md). Passwords are public; the data is made up. */
export const SAMPLE_PASS = "FurFriends2026";
export const DEMO_ACCOUNTS = [
  { email: DEMO_EMAIL, password: DEMO_PASS, name: "Alex Rivera", city: "Quezon City", pets: ["mochi-1", "bori-1", "ginger-1", "kong-1"], about: "All 4 pets: Mochi, Bori, Ginger & Kong. The one-click demo, shared by everyone.", main: true },
  { email: "sample.maria@example.com", password: SAMPLE_PASS, name: "Maria Santos", city: "Quezon City", pets: ["mochi-1", "ginger-1"], about: "2 cats (Mochi, Ginger) with full records." },
  { email: "sample.juan@example.com", password: SAMPLE_PASS, name: "Juan Dela Cruz", city: "Pasig City", pets: ["bori-1", "kong-1"], about: "2 dogs (Bori, Kong) with full records." },
  { email: "sample.ana@example.com", password: SAMPLE_PASS, name: "Ana Reyes", city: "Makati City", pets: [], about: "No pets yet. Start here to show “Add a pet”." },
];
