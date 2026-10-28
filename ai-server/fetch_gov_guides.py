"""Downloads public-domain pet health pages from US government sites and splits them into short passages.

Sources: CDC Healthy Pets (https://www.cdc.gov/healthy-pets/) and FDA Animal Health Literacy
(https://www.fda.gov/animal-veterinary/animal-health-literacy). Works of the US federal government
are in the public domain, so the text may be reused and adapted. Each passage keeps its page link.

  python fetch_gov_guides.py

Writes data/passages/gov_guides.csv (title, section, text, category, url, source). Pages are cached in
data/open/cache/gov/ so later runs work offline. Only passages about cats, dogs or pets in general
are kept, and passages that give medicine doses are left out, the same rules as fetch_open_data.py.
"""
import argparse
import csv
import hashlib
import html
import os
import re
import time
import urllib.parse
import urllib.request
from collections import Counter
from html.parser import HTMLParser

from evaluate import DOSE, words
from fetch_open_data import CAT, DOG, topic

CACHE = "data/open/cache/gov"
AGENT = "FurFriends-thesis-data/1.0 (student capstone project; contact via github.com/DevShinnn/furfriends)"
SITES = [
    # (start pages, link prefix to follow, source name)
    (["https://www.cdc.gov/healthy-pets/pets-animals/index.html", "https://www.cdc.gov/healthy-pets/diseases/index.html",
      "https://www.cdc.gov/healthy-pets/about/index.html", "https://www.cdc.gov/healthy-pets/emergency-preparedness/index.html",
      "https://www.cdc.gov/healthy-pets/travel/index.html"],
     "https://www.cdc.gov/healthy-pets/", "CDC Healthy Pets"),
    (["https://www.fda.gov/animal-veterinary/resources-you/animal-health-literacy"],
     "https://www.fda.gov/animal-veterinary/animal-health-literacy/", "US FDA Center for Veterinary Medicine"),
]
# Pages under those prefixes that aren't about pet owners' cats and dogs
SKIP = re.compile(r"(hcp|clinical|outbreak|exhibit|schools-daycares|educational-materials|kids|food-producing|minor-species|"
                  r"fdas-role|backyard-poultry|reptile|amphibian|rodent|fish|bird|horse|farm|livestock|ferret|hedgehog|"
                  r"media/pdfs|espanol|\.pdf$)", re.I)
PET = re.compile(r"\b(pets?|animals?)\b", re.I)


class Main(HTMLParser):
    """Collects the page's main text as (section heading, paragraph) pairs, and its links."""
    BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "td", "dd", "dt"}
    SKIP_TAGS = {"script", "style", "nav", "header", "footer", "aside", "form", "noscript", "svg", "button"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth_main = 0          # inside <main> or role=main
        self.skip = 0
        self.tag = None
        self.buf = []
        self.items = []              # (tag, text)
        self.links = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])
        if tag == "main" or a.get("role") == "main":
            self.depth_main += 1
        if tag in self.SKIP_TAGS or "breadcrumb" in (a.get("class") or ""):
            self.skip += 1
        if tag in self.BLOCK:
            self.flush()
            self.tag = tag

    def handle_endtag(self, tag):
        if tag in self.BLOCK:
            self.flush()
        if tag in self.SKIP_TAGS and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if self.depth_main and not self.skip and self.tag:
            self.buf.append(data)

    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        if text:
            self.items.append((self.tag, text))
        self.buf, self.tag = [], None


def get(url):
    path = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest()[:16] + ".html")
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    try:
        raw = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")
    except Exception as e:   # a missing page shouldn't stop the run
        print(f"  skipped {url}: {e}")
        raw = ""
    os.makedirs(CACHE, exist_ok=True)
    open(path, "w", encoding="utf-8").write(raw)
    time.sleep(2)   # FDA asks for 2 seconds between requests
    return raw


def passages(items, max_words):
    """Groups paragraphs under their heading, then cuts each group into passages of up to max_words."""
    title, section, out, cur = "", "", [], []

    def close():
        if cur:
            out.append((section, " ".join(cur)))
            cur.clear()
    for tag, text in items:
        if tag == "h1":
            title = section = text
        elif tag in ("h2", "h3", "h4"):
            close()
            section = text
        else:
            if tag == "li":
                text = "- " + text
            if cur and len(words(" ".join(cur))) + len(words(text)) > max_words:
                close()
            cur.append(text)
    close()
    return title, out


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", default="data/passages/gov_guides.csv")
    p.add_argument("--max-pages", type=int, default=250)
    p.add_argument("--max-words", type=int, default=180, help="longest passage")
    p.add_argument("--min-words", type=int, default=25)
    args = p.parse_args()

    rows, why, seen = [], Counter(), set()
    for starts, prefix, name in SITES:
        todo = list(starts)
        pages = 0
        while todo and pages < args.max_pages:
            url = todo.pop(0).split("#")[0]
            if url in seen:
                continue
            seen.add(url)
            raw = get(url)
            if not raw:
                continue
            pages += 1
            doc = Main()
            doc.feed(raw)
            for href in doc.links:
                nxt = urllib.parse.urljoin(url, html.unescape(href)).split("#")[0].split("?")[0]
                if nxt.startswith(prefix) and nxt not in seen and not SKIP.search(nxt[len(prefix):]):
                    todo.append(nxt)
            title, parts = passages(doc.items, args.max_words)
            for section, text in parts:
                full = f"{title} {section} {text}"
                reason = ("too short" if len(words(text)) < args.min_words else
                          "not about pets" if not (DOG.search(full) or CAT.search(full) or PET.search(full)) else
                          "mentions a medicine dose" if DOSE.search(text) else "")
                if reason:
                    why[reason] += 1
                    continue
                sp = "Both" if (DOG.search(full) and CAT.search(full)) or not (DOG.search(full) or CAT.search(full)) else "Dog" if DOG.search(full) else "Cat"
                rows.append({"title": title, "section": section if section != title else "", "text": text,
                             "category": topic(full), "species": sp, "url": url,
                             "source": f"{name}, {title}, {url} (public domain)"})
        print(f"{name}: {pages} pages")

    # The same passage can appear on several pages (shared callouts)
    unique, texts = [], set()
    for r in rows:
        if r["text"] in texts:
            why["repeated on another page"] += 1
            continue
        texts.add(r["text"])
        unique.append(r)
    with open(args.out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, ["title", "section", "text", "category", "species", "url", "source"])
        w.writeheader()
        w.writerows(unique)
    print(f"Kept {len(unique)} passages. Left out:")
    for k, n in why.most_common():
        print(f"  {n:>5}  {k}")
    print("By category: " + ", ".join(f"{k} {n}" for k, n in Counter(r["category"] for r in unique).most_common()))
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
