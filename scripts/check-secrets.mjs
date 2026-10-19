/* Looks for passwords and secret keys before code goes to GitHub. The repo is public, so a
   secret that is pushed once must be treated as leaked, even if a later commit removes it.
   That is why this reads every file version in the commits, not only the latest files.

     node scripts/check-secrets.mjs                 → commits not yet on GitHub (run before git push)
     node scripts/check-secrets.mjs --all           → the whole history
     node scripts/check-secrets.mjs --install-hook  → run it automatically before every git push

   Exit code 1 means something was found and should be removed before pushing.
   The publishable Supabase key (sb_publishable_…) and the old "anon" key are meant to be public,
   so they are not reported. */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 }).trim();

/* ---------------------------------------------------------------- what counts as a secret */
const RULES = [
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g },
  { name: "Supabase service role key or login token", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, check: secretJwt },
  { name: "Database password in a connection link", re: /\bpostgres(?:ql)?:\/\/[^:\s/@]+:([^@\s]{6,})@/g, check: (m) => !placeholder(m[1]) },
  { name: "Private key file", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/g },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}/g },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{30,}/g },
  { name: "OpenAI API key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g, check: (m) => !m[0].startsWith("sk-ant-") },
  { name: "Hugging Face token", re: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "Stripe secret key", re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}/g },
  { name: "Slack token", re: /\bxox[abprs]-[0-9A-Za-z-]{10,}/g },
  { name: "Vercel token", re: /\bVERCEL_TOKEN\s*[=:]\s*["']?([A-Za-z0-9]{20,})/g },
  // NAME=value lines in settings files, for secrets that have no recognisable shape.
  { name: "Secret setting with a value", re: /^\s*(?:export\s+|set\s+)?[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PASSWORD|PRIVATE_KEY|API_KEY|TOKEN)[A-Z0-9_]*\s*=\s*["']?([^"'\s#]{12,})/gm, check: (m) => !placeholder(m[1]) },
];

/* Fill-in-the-blank examples such as <secret key>, your-key, sb_publishable_..., ${VAR} or os.environ[...] */
function placeholder(v) {
  return /^[<$%{[(]|\.\.\.|…|your|example|changeme|placeholder|xxxx|^\*+$|environ|process\.env|env\(/i.test(v);
}

/* Supabase's "anon" JWT is public by design; anything else (service_role, a user's login) is not. */
function secretJwt(m) {
  try {
    const body = JSON.parse(Buffer.from(m[0].split(".")[1], "base64url").toString("utf8"));
    return body.role !== "anon";
  } catch {
    return false; // not a real token, just text that looks like one
  }
}

/* .env files hold the real values; only the .env.example templates belong in the repo. */
const SECRET_FILE = /(^|\/)\.env(\.(?!example$)[^/]+)?$|(^|\/)[^/]+\.local\.sql$|\.(pem|p12|pfx|key)$|(^|\/)id_(rsa|ed25519)$/;

/* ---------------------------------------------------------------- which file versions to read */
function upstream() {
  for (const ref of ["@{upstream}", "origin/main"]) {
    if (spawnSync("git", ["rev-parse", "--verify", "--quiet", ref]).status === 0) return ref;
  }
  return null;
}

/* Every [blob, path, commit] added or changed by the given commits. */
function versions(commits) {
  const seen = new Map();
  for (const c of commits) {
    const out = git("diff-tree", "-r", "--root", "--no-commit-id", "--no-renames", "--diff-filter=AM", c);
    for (const line of out.split("\n").filter(Boolean)) {
      const [meta, path] = line.split("\t");
      const blob = meta.split(" ")[3];
      if (!seen.has(blob)) seen.set(blob, { blob, path, commit: c });
    }
  }
  return [...seen.values()];
}

/* Reads many blobs in one git call instead of one call per file. */
function readBlobs(list) {
  if (!list.length) return [];
  const raw = execFileSync("git", ["cat-file", "--batch"], { input: list.map((v) => v.blob).join("\n") + "\n", maxBuffer: 1 << 30 });
  const out = [];
  let at = 0;
  for (const v of list) {
    const header = raw.subarray(at, raw.indexOf(10, at)).toString();
    const size = Number(header.split(" ")[2]);
    const start = at + header.length + 1;
    out.push({ ...v, data: raw.subarray(start, start + size) });
    at = start + size + 1;
  }
  return out;
}

function scan(file) {
  const found = [];
  if (SECRET_FILE.test(file.path)) found.push({ rule: "Settings file with real values (only .env.example should be committed)", line: 0, value: "" });
  if (file.data.includes(0)) return found; // pictures, PDFs and other non-text files
  const text = file.data.toString("utf8");
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      if (rule.check && !rule.check(m)) continue;
      found.push({ rule: rule.name, line: text.slice(0, m.index).split("\n").length, value: m[1] || m[0] });
    }
  }
  return found;
}

const mask = (v) => (v.length <= 8 ? "****" : `${v.slice(0, 4)}…${v.slice(-2)} (${v.length} characters)`);

/* ---------------------------------------------------------------- run */
if (args.includes("--install-hook")) {
  const hooks = git("rev-parse", "--git-path", "hooks");
  const hook = join(hooks, "pre-push");
  writeFileSync(hook, "#!/bin/sh\n# Added by scripts/check-secrets.mjs: stop the push if a secret is found.\nexec node scripts/check-secrets.mjs\n");
  chmodSync(hook, 0o755);
  console.log(`Installed ${hook}. Every git push now runs the secret check first.`);
  process.exit(0);
}

let commits, scope;
const base = upstream();
if (args.includes("--all") || !base) {
  commits = git("rev-list", "--all").split("\n").filter(Boolean);
  scope = `the whole history (${commits.length} commits)`;
} else {
  commits = git("rev-list", `${base}..HEAD`).split("\n").filter(Boolean);
  scope = `${commits.length} commit(s) not yet on ${base.replace("@{upstream}", "GitHub")}`;
}

// Oldest first, so each secret is reported once, at the commit that added it.
const files = readBlobs(versions(commits.reverse()));
const once = new Set();
const problems = files
  .flatMap((f) => scan(f).map((p) => ({ ...p, path: f.path, commit: f.commit })))
  .filter((p) => !once.has(`${p.path}|${p.rule}|${p.value}`) && once.add(`${p.path}|${p.rule}|${p.value}`))
  .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);

if (!problems.length) {
  console.log(`No secrets found in ${scope} (${files.length} file versions checked).`);
  process.exit(0);
}

console.log(`Found ${problems.length} possible secret(s) in ${scope}:\n`);
for (const p of problems) {
  const where = p.line ? `${p.path}:${p.line}` : p.path;
  console.log(`  ${where}  (commit ${p.commit.slice(0, 7)})\n    ${p.rule}${p.value ? `: ${mask(p.value)}` : ""}`);
}
console.log(`
Do not push. Move the value into a .env.local file (it is never committed) and remove it from
these commits. If any of it is already on GitHub, treat it as leaked: make a new key in the
service's settings and delete the old one, because removing it from the code is not enough.`);
process.exit(1);
