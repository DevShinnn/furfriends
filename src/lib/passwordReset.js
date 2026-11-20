/* Forgot password with a security question (supabase/migrations/20261120120000_security_questions.sql).
   No email is sent: the owner answers the question they picked, and the database sets the new password.
   The answer is stored only as a hash, compared without letter case or extra spaces. 5 wrong answers lock the reset
   for 15 minutes. Until the migration is applied these database functions don't exist, and the app hides the feature. */
export const QUESTIONS = [
  "What was the name of your elementary school?",
  "What was your childhood nickname?",
  "What was the name of your best friend as a child?",
  "What is the name of the street you grew up on?",
  "What was the name of your first teacher?",
  "What was the first movie you watched in a cinema?",
];
export const OWN_QUESTION = "Write my own question";
export const MIN_ANSWER = 2;   // as in the migration

// The database function isn't there: the migration isn't applied yet.
const missing = (error) => !!error && (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message || ""));

/* Is forgot password set up in the database? */
export async function resetReady(db) {
  const { error } = await db.rpc("security_question_for", { p_email: "" });
  return !missing(error);
}

/* The question for an email: { question } (null when there's none), or { error }. */
export async function questionFor(db, email) {
  const { data, error } = await db.rpc("security_question_for", { p_email: email });
  if (missing(error)) return { error: "unavailable" };
  return error ? { error: error.message } : { question: data || null };
}

/* { ok: true }, or { ok: false, error: "no_question" | "short" | "wrong" (with left) | "locked" (with minutes) | "unavailable" | a message } */
export async function resetWithAnswer(db, { email, answer, password }) {
  const { data, error } = await db.rpc("reset_password_with_answer", { p_email: email, p_answer: answer, p_new_password: password });
  if (missing(error)) return { ok: false, error: "unavailable" };
  if (error) return { ok: false, error: error.message };
  return data || { ok: false, error: "no_question" };
}

/* This account's question: the question, null when it has none, or undefined when the feature isn't set up. */
export async function myQuestion(db) {
  const { data, error } = await db.rpc("my_security_question");
  return error ? undefined : data || null;
}

/* Sets or changes this account's question (the database checks the password). Resolves to an error message or null. */
export async function saveQuestion(db, { question, answer, password }) {
  const { error } = await db.rpc("set_security_question", { p_question: question, p_answer: answer, p_password: password });
  return missing(error) ? "Security questions aren't set up yet." : error ? error.message : null;
}
