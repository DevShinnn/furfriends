/* The usability test for the thesis: the tasks testers try, and the System Usability Scale.
   The task ids are what gets saved, so keep them stable once testing starts. The guide for
   facilitators (docs/usability-test-guide.md) lists the same tasks in the same order. */

export const TASKS = [
  { id: "register", text: "Create an account and log in" },
  { id: "add_pet", text: "Add a pet with a photo, breed, age and weight" },
  { id: "add_vaccine", text: "Add a vaccination with its next due date" },
  { id: "upload_doc", text: "Upload a document (photo or PDF) to your pet" },
  { id: "feeding", text: "Set up a feeding schedule and mark a meal as fed" },
  { id: "appointment", text: "Book a vet appointment" },
  { id: "emergency", text: "Find what to do if a dog ate chocolate" },
  { id: "breed", text: "Look up your pet's breed in the Breed guide" },
  { id: "assistant", text: "Ask the AI assistant a question and rate the answer" },
  { id: "reminders", text: "Turn on reminders and allow notifications" },
];

export const TASK_RESULTS = [
  ["done", "Did it on my own"],
  ["help", "Needed help"],
  ["failed", "Couldn't do it"],
];

/* The 10 standard SUS statements (Brooke, 1996), with "the system" replaced by the app's name,
   which is the usual practice. Keep the order: odd items are positive, even items negative. */
export const SUS_ITEMS = [
  "I think that I would like to use FurFriends frequently.",
  "I found FurFriends unnecessarily complex.",
  "I thought FurFriends was easy to use.",
  "I think that I would need the support of a technical person to be able to use FurFriends.",
  "I found the various functions in FurFriends were well integrated.",
  "I thought there was too much inconsistency in FurFriends.",
  "I would imagine that most people would learn to use FurFriends very quickly.",
  "I found FurFriends very cumbersome to use.",
  "I felt very confident using FurFriends.",
  "I needed to learn a lot of things before I could get going with FurFriends.",
];

export const SCALE = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

/* Standard SUS scoring, 0–100. Same formula as the database column. */
export const susScore = (answers) =>
  answers.reduce((sum, a, i) => sum + (i % 2 === 0 ? a - 1 : 5 - a), 0) * 2.5;
