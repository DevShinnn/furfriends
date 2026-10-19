import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import Icon, { Stars } from "../components/Icon";
import { Brand } from "../components/AppShell";
import { isEmail, peso } from "../lib/utils";

const S = (f) => `/assets/site/${f}.jpg`;
const PET = (f) => `/assets/pets/${f}.jpg`;
const DOCIMG = (f) => `/assets/docs/${f}.svg`;

const NAV = [["features", "Features"], ["how", "How it works"], ["stories", "Stories"], ["pricing", "Pricing"], ["faq", "FAQ"]];
const MARQUEE = [
  [PET("bori-1"), "Bori · Golden"], [S("cat-blue"), "Olive · Tabby"], [S("corgi"), "Peanut · Corgi"], [PET("ginger-2"), "Ginger · Maine Coon"],
  [S("beagle"), "Milo · Beagle"], [S("siamese"), "Luna · Siamese"], [PET("kong-2"), "Kong · Frenchie"], [S("tuxedo"), "Oreo · Tuxedo"],
  [S("pug"), "Dumpling · Pug"], [S("cat-sunglasses"), "Maverick · British SH"], [S("husky"), "Sky · Husky"], [PET("mochi-1"), "Mochi · Tabby"],
];
const FAQS = [
  ["Which pets does FurFriends support?", "Right now FurFriends is designed for cats and dogs, with breed lists, vaccine suggestions and care details tailored to each."],
  ["Can I manage more than one pet?", "Yes — add as many pet profiles as you like. Each one has its own profile photo, medical history, vaccination records and documents."],
  ["How do vaccine reminders work?", "Add the date a vaccine was given and when the next booster is due. Your dashboard highlights anything due in the next 30 days and flags anything overdue."],
  ["What documents can I store?", "Anything from the vet: vaccination certificates, lab results, prescriptions, invoices, X-rays and microchip papers. Just take a photo or upload a scan."],
  ["Can I install it on my phone?", "Yes. FurFriends is a Progressive Web App — open it in your phone's browser and choose “Install” or “Add to Home Screen”. It even works offline."],
  ["Is my pets' data private?", "Your records sit behind your account login and are never shared. The demo account is shared by everyone who tries it and is reset often, so don't put real details in it."],
];
const PLANS = [
  { name: "Starter", monthly: 0, yearly: 0, desc: () => "For a single furry friend getting started.", cta: "Start for free", to: "/register",
    features: ["Up to 2 pet profiles", "Medical & vaccine records", "20 documents per pet", "Dashboard reminders"] },
  { name: "Family", monthly: 199, yearly: 149, featured: true, desc: (y) => `${y ? `Billed ${peso(149 * 12)} yearly.` : "Billed monthly, cancel any time."} For busy multi-pet homes.`,
    cta: "Try Family in the demo", demo: true, features: ["Unlimited pets", "Unlimited document storage", "Email & push reminders", "Share with family members", "Export records to PDF"] },
  { name: "Breeder & Sitter", monthly: 599, yearly: 449, desc: (y) => `${y ? `Billed ${peso(449 * 12)} yearly.` : "Billed monthly."} For people caring for many pets.`,
    cta: "Get started", to: "/register", features: ["Everything in Family", "Multiple households", "Hand-off records to owners", "Priority support"] },
];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal, .count-up");
    const countUp = (el) => {
      const to = Number(el.dataset.to), suf = el.dataset.suffix || "", t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 1400);
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString() + suf;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      if (e.target.classList.contains("count-up")) countUp(e.target);
      io.unobserve(e.target);
    }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function Landing() {
  const { user, demoLogin } = useStore();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [yearly, setYearly] = useState(true);
  const [nl, setNl] = useState({ email: "", msg: "", ok: false });
  useReveal();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 10);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const demo = async () => {
    const err = await demoLogin();
    if (err) return toast(err, "error");
    toast("Welcome! You're exploring the demo account"); navigate("/app");
  };
  const go = (id) => {
    setMenu(false);
    const t = document.getElementById(id);
    if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
  };
  const subscribe = (e) => {
    e.preventDefault();
    if (!isEmail(nl.email.trim())) return setNl({ ...nl, msg: "Please enter a valid email address.", ok: false });
    setNl({ email: "", msg: "Thanks! You're on the list. (Demo — nothing was sent.)", ok: true });
  };
  const marquee = MARQUEE.map(([src, cap], i) => <figure key={i}><img src={src} alt={cap} loading="lazy" /><figcaption>{cap}</figcaption></figure>);

  return (
    <>
      <div className={`l-nav-wrap ${scrolled ? "scrolled" : ""}`}>
        <div className="container l-nav">
          <Brand />
          <nav className="l-links">{NAV.map(([id, l]) => <button key={id} onClick={() => go(id)}>{l}</button>)}</nav>
          <div className="right">
            {user
              ? <Link className="btn btn-primary" to="/app">Open dashboard <Icon name="arrowR" className="arrow" /></Link>
              : <><Link className="login-link" to="/login">Log in</Link><button className="btn btn-primary" onClick={demo}>Try the demo <Icon name="arrowR" className="arrow" /></button></>}
          </div>
          <button className="icon-btn menu-btn" onClick={() => setMenu(!menu)} aria-label="Open menu" aria-expanded={menu}><Icon name={menu ? "close" : "menu"} /></button>
          <div className={`mobile-menu ${menu ? "open" : ""}`}>
            {NAV.map(([id, l]) => <button key={id} onClick={() => go(id)}>{l}</button>)}
            {user ? <Link className="btn btn-primary btn-lg" to="/app">Open dashboard</Link>
              : <><Link to="/login">Log in</Link><button className="btn btn-coral btn-lg" onClick={demo}>Try the live demo</button></>}
          </div>
        </div>
      </div>

      <header className="hero">
        <div className="container hero-grid">
          <div>
            <span className="tag reveal"><b>NEW</b> Scan & store vet documents</span>
            <h1 className="reveal d1">Every paw's story, <em>beautifully</em>{" "}
              <span className="squiggle">kept.<svg viewBox="0 0 200 16" preserveAspectRatio="none"><path d="M2 12 C 40 2, 70 2, 100 9 S 160 15, 198 4" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" /></svg></span>
            </h1>
            <p className="lead reveal d2">FurFriends brings your pets' profiles, medical history, vaccination records and vet documents together in one organised place — so you're always ready for the next visit.</p>
            <div className="cta reveal d3">
              <button className="btn btn-coral btn-lg" onClick={demo}>Try the live demo <Icon name="arrowR" className="arrow" /></button>
              <Link className="btn btn-ghost btn-lg" to="/register">Create free account</Link>
            </div>
            <div className="proof reveal d3">
              <div className="faces"><img src={PET("bori-1")} alt="" /><img src={S("cat-blue")} alt="" /><img src={S("corgi")} alt="" /><img src={PET("mochi-1")} alt="" /></div>
              <div><Stars size={15} /><small><b>4.9/5</b> from 2,400+ pet parents</small></div>
            </div>
          </div>
          <div className="hero-art reveal d2" aria-hidden="true">
            <div className="blob a" /><div className="blob b" />
            <div className="photo p1"><img src={PET("bori-1")} alt="" /></div>
            <div className="photo p2"><img src={PET("mochi-1")} alt="" /></div>
            <div className="photo p3"><img src={PET("kong-1")} alt="" /></div>
            <div className="float-card f1"><div className="ic" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}><Icon name="syringe" /></div><div><b>FVRCP booster</b><small>Mochi · due in 13 days</small></div></div>
            <div className="float-card f2"><div className="ic" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}><Icon name="clip" /></div><div><b>Checkup logged</b><small>Bori · healthy weight</small></div></div>
            <div className="float-card f3"><div className="ic" style={{ background: "var(--coral-soft)", color: "var(--coral-2)" }}><Icon name="file" size={18} /></div><div><b>Lab results saved</b><small>added to Bori's documents</small></div></div>
          </div>
        </div>
        <div className="marquee"><div className="marquee-track">{marquee}{marquee}</div></div>
      </header>

      <section className="section" id="features">
        <div className="container">
          <div className="section-head reveal">
            <span className="kicker">Features</span>
            <h2>Everything about your pets, <em>finally</em> in one place.</h2>
            <p>From the first puppy checkup to the latest booster shot, FurFriends keeps it organised, searchable and always in your pocket.</p>
          </div>
          <div className="bento">
            <div className="tile t-photos reveal">
              <div className="chip-ic"><Icon name="file" size={22} /></div>
              <h3>Every vet document, digitised</h3>
              <p>Snap a photo of certificates, lab results, prescriptions and invoices. They're saved on each pet's profile, ready to open whenever the vet asks.</p>
              <div className="mini-docs">
                <img src={DOCIMG("mochi-vaccine-cert")} alt="Vaccination certificate" /><img src={DOCIMG("bori-lab-results")} alt="Lab results" />
                <img src={DOCIMG("mochi-prescription")} alt="Prescription" /><img src={DOCIMG("bori-invoice")} alt="Invoice" />
              </div>
            </div>
            <div className="tile t-vax reveal d1">
              <div className="chip-ic" style={{ background: "#fff", color: "var(--warn)" }}><Icon name="syringe" /></div>
              <h3>Vaccine reminders</h3>
              <p>See what's due, what's overdue, and what's covered — at a glance.</p>
              <div className="mini-list">
                {[["bori-1", "DHPP", "Bori", "danger", "Overdue"], ["ginger-1", "FeLV", "Ginger", "warn", "5 days"], ["mochi-1", "FVRCP", "Mochi", "warn", "13 days"], ["kong-1", "Rabies", "Kong", "ok", "Covered"]].map(([img, v, n, k, l]) => (
                  <div className="mini-row" key={v + n}><img src={PET(img)} alt="" /><div className="grow"><b>{v}</b><small>{n}</small></div><span className={`pill ${k}`}>{l}</span></div>
                ))}
              </div>
            </div>
            <div className="tile t-med reveal">
              <div className="chip-ic" style={{ background: "#fff", color: "var(--coral-2)" }}><Icon name="clip" /></div>
              <h3>Medical timeline</h3>
              <p>Checkups, illnesses, surgeries, allergies and meds — with vet notes.</p>
              <div className="mini-list">
                <div className="mini-row"><span className="pill ok">Checkup</span><div className="grow"><b>Annual wellness exam</b></div></div>
                <div className="mini-row"><span className="pill danger">Illness</span><div className="grow"><b>Respiratory infection</b></div></div>
              </div>
            </div>
            <div className="tile t-multi reveal d1">
              <div className="chip-ic" style={{ background: "#fff", color: "var(--cat)" }}><Icon name="users" /></div>
              <h3>Multi-pet homes</h3>
              <p>A profile for every cat and dog.</p>
              <div className="stack-faces">{["mochi-1", "bori-1", "ginger-1", "kong-1"].map((f) => <img key={f} src={PET(f)} alt="" />)}</div>
            </div>
            <div className="tile t-secure reveal d2">
              <div className="chip-ic" style={{ background: "#fff", color: "#2f6fb3" }}><Icon name="phone" size={20} /></div>
              <h3>Install it like an app</h3>
              <p>Add FurFriends to your home screen. It opens full-screen and works offline.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="how" style={{ background: "var(--bg-2)" }}>
        <div className="container">
          <div className="section-head center reveal"><span className="kicker">How it works</span><h2>Set up in <em>three</em> minutes.</h2></div>
          <div className="steps">
            {[["01", "Create a profile", "Add a photo, name, species, breed, age, gender and weight for each cat or dog.", "dogs-running", ""],
              ["02", "Add records & documents", "Log vet visits and vaccines, then snap photos of the paperwork you get.", "cat-highfive", "d1"],
              ["03", "Stay on top of care", "Your dashboard flags upcoming boosters before they're overdue.", "terrier", "d2"]].map(([n, t, p, img, d]) => (
              <div className={`step reveal ${d}`} key={n}><div className="num">{n}</div><h3>{t}</h3><p>{p}</p><div className="img"><img src={S(img)} alt="" loading="lazy" /></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div className="pic reveal">
            <div className="pic-frame"><img src={S("owner-dog")} alt="A couple with their dog" loading="lazy" /></div>
            <div className="float-card"><div className="ic" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="check" size={18} /></div><div><b>Ready for the vet</b><small>Full history in one tap</small></div></div>
          </div>
          <div className="reveal d1">
            <span className="kicker">Built for real life</span>
            <h2>Walk into every vet visit <em>prepared.</em></h2>
            <ul className="checks">
              {[["Complete history, instantly", "No more digging through paper folders or old emails."],
                ["Never miss a booster", "Overdue and upcoming vaccines surface right on your dashboard."],
                ["Paperwork, digitised", "Certificates, lab results and receipts are saved on each pet's profile."]].map(([b, s]) => (
                <li key={b}><span className="ck"><Icon name="check" size={14} /></span><div><b>{b}</b><span>{s}</span></div></li>
              ))}
            </ul>
            <button className="btn btn-primary btn-lg" onClick={demo}>See it in action <Icon name="arrowR" className="arrow" /></button>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="band reveal">
          <div className="paw-bg"><Icon name="paw" size={340} /></div>
          {[["12400", "+", "pets with a FurFriends"], ["86", "k", "vet records logged"], ["97", "%", "boosters on time"], ["140", "k", "documents stored"]].map(([to, suf, l]) => (
            <div className="st" key={l}><b className="count-up" data-to={to} data-suffix={suf}>0</b><span>{l}</span></div>
          ))}
        </div>
      </section>

      <section className="section" id="stories">
        <div className="container">
          <div className="section-head center reveal"><span className="kicker">Stories</span><h2>Loved by pet parents <em>everywhere.</em></h2></div>
          <div className="quotes">
            {[["“Our vet asked for Bori's vaccine certificate and I pulled it up in five seconds. I actually felt organised for once.”", PET("bori-1"), "Jiwoo H.", "Golden retriever parent", ""],
              ["“Three cats, three vaccine schedules. FurFriends is the only reason nobody is overdue.”", S("cat-blue"), "Marta S.", "Cat mom × 3", "d1"],
              ["“I use it to hand over records when Peanut goes to the sitter. Clean, fast, and genuinely pretty to use.”", S("corgi"), "Daniel K.", "Corgi dad", "d2"]].map(([q, img, n, r, d]) => (
              <div className={`quote reveal ${d}`} key={n}><Stars /><blockquote>{q}</blockquote><div className="who"><img src={img} alt="" /><div><b>{n}</b><small>{r}</small></div></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="pricing" style={{ background: "var(--bg-2)" }}>
        <div className="container">
          <div className="section-head center reveal">
            <span className="kicker">Pricing</span>
            <h2>Simple plans for <em>every</em> pack.</h2>
            <div className="billing">
              <button className={yearly ? "" : "on"} onClick={() => setYearly(false)}>Monthly</button>
              <button className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Yearly<span className="save">-25%</span></button>
            </div>
          </div>
          <div className="plans">
            {PLANS.map((p, i) => (
              <div className={`plan reveal ${p.featured ? "featured" : ""} ${i ? `d${i}` : ""}`} key={p.name}>
                <div className="pname">{p.name} {p.featured && <span className="badge">MOST POPULAR</span>}</div>
                <div className="price">{peso(yearly ? p.yearly : p.monthly)}<small> /month</small></div>
                <p className="pdesc">{p.desc(yearly)}</p>
                <ul>{p.features.map((f) => <li key={f}><Icon name="check" /> {f}</li>)}</ul>
                {p.demo
                  ? <button className="btn btn-coral btn-block" onClick={demo}>{p.cta}</button>
                  : <Link className="btn btn-ghost btn-block" to={p.to}>{p.cta}</Link>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container faq-grid">
          <div className="reveal">
            <span className="kicker">FAQ</span>
            <h2>Questions? <em>We've got answers.</em></h2>
            <p style={{ color: "var(--ink-2)", marginTop: 18, fontSize: 17 }}>Can't find what you're looking for? Try the demo — it's the fastest way to see how FurFriends works.</p>
          </div>
          <div className="faq reveal d1">
            {FAQS.map(([q, a], i) => (
              <details key={q} open={i === 0}><summary>{q}<span className="pm"><Icon name="plus" size={16} /></span></summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="container">
        <div className="final reveal">
          <div>
            <h2>Give them the care they <em>deserve.</em></h2>
            <p>Join thousands of pet parents keeping health records and vet documents together. Free to start, no credit card needed.</p>
            <div className="cta">
              <button className="btn btn-white btn-lg" onClick={demo}>Launch the demo <Icon name="arrowR" className="arrow" /></button>
              <Link className="btn btn-outline btn-lg" to="/register">Create account</Link>
            </div>
          </div>
          <div className="collage" aria-hidden="true"><img src={PET("ginger-2")} alt="" /><img src={S("beagle")} alt="" /><img src={PET("kong-2")} alt="" /></div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <Brand />
              <p>Health records and vet documents for the cats and dogs you love.</p>
              <form className="newsletter" onSubmit={subscribe} noValidate>
                <input type="email" placeholder="Your email for pet-care tips" aria-label="Email address" value={nl.email} onChange={(e) => setNl({ ...nl, email: e.target.value })} />
                <button className="btn btn-primary btn-sm" type="submit">Subscribe</button>
              </form>
              <div className="nl-msg" style={{ color: nl.ok ? "var(--ok)" : "var(--danger)" }}>{nl.msg}</div>
            </div>
            <div><h4>Product</h4><ul><li><button onClick={() => go("features")}>Features</button></li><li><button onClick={() => go("pricing")}>Pricing</button></li><li><button onClick={demo}>Live demo</button></li></ul></div>
            <div><h4>Company</h4><ul><li><button onClick={() => go("stories")}>Stories</button></li><li><button onClick={() => go("faq")}>FAQ</button></li><li><Link to="/register">Sign up</Link></li></ul></div>
            <div><h4>Account</h4><ul><li><Link to="/login">Log in</Link></li><li><Link to="/register">Create account</Link></li><li><button onClick={() => go("how")}>How it works</button></li></ul></div>
          </div>
          <div className="footer-bottom"><span>© {new Date().getFullYear()} FurFriends. Demo prototype — figures and testimonials are illustrative.</span><span>Photos: Unsplash</span></div>
        </div>
      </footer>
    </>
  );
}
