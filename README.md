# UPL
> Universal Programming Lab : Prompt Engineered by Dominic Alexander Cooper

# Stage 1 : Large Language Model Token Science

If we treat “token design” as a first-class engineering problem, here’s a **high-standard property set** attached to *each potential token*. Grouped for implementation as a schema (e.g., JSON/Parquet) and keep per-token analytics and policies tight.

# Identity & Encoding

* **token\_id** — Integer vocabulary index.
* **surface** — Canonical text (grapheme sequence / byte string).
* **byte\_seq** — Raw bytes (for byte-fallback models).
* **norm\_form** — Unicode normalization form applied (NFC/NFKC/NFD/NFKD/none).
* **detok\_rule** — How to join on detokenization (joiner, spacer, no-space, language-specific).
* **case\_pattern** — lower / UPPER / Title / Mixed / N/A.
* **has\_leading\_space** — Bool (e.g., GPT-2 “Ġ” behavior).
* **has\_trailing\_space** — Bool (explicit spacer tokens).
* **newline\_kind** — none / \n / \r\n / \r / mixed.
* **is\_control** — Bool (BOS/EOS/PAD/UNK/MASK/SEP/CLS/system/tool/json-delim).
* **is\_visible** — Bool (rendered glyphs vs control).

# Tokenizer & Segmentation

* **algo** — BPE / WordPiece / Unigram / BBPE / SentencePiece-char/byte.
* **merge\_rank** — BPE merge rank (lower = earlier merge).
* **unigram\_score** — SentencePiece log prob / cost.
* **prefix\_marker** — e.g., “##” (WordPiece), byte prefix.
* **is\_word\_start** — Bool (begins a word/grapheme cluster).
* **is\_word\_end** — Bool (ends a word/grapheme cluster).
* **min\_left\_context** — Min preceding chars for legal split.
* **min\_right\_context** — Min following chars for legal split.
* **split\_compat** — Safe to split into subpieces without ambiguity (Bool).
* **join\_compat** — Safe to merge with neighbors (Bool).

# Orthography & Unicode

* **script** — ISO 15924 (Latn, Cyrl, Arab, Deva, Hang, Hani, …).
* **bidi\_class** — L / R / AL / EN / AN / NSM / … (UAX #9).
* **grapheme\_len** — Grapheme cluster count (UAX #29).
* **combining\_marks** — Count (diacritics, accents).
* **shaping\_class** — Arabic joining (isol/ini/med/fin/dual/none).
* **emoji\_kind** — None / base / ZWJ-sequence / modifier / flag / keycap.
* **rtl\_safe** — Safe in RTL contexts without reordering issues (Bool).
* **width\_class** — Fullwidth / Halfwidth / Ambiguous.
* **confusables** — List of visually confusable code points (security).
* **zero\_width\_chars** — Presence of ZWJ/ZWNJ/ZWSP (Bool).

# Morphology & Lexicon

* **morph\_role** — stem / prefix / suffix / infix / clitic / whole-word.
* **lang** — ISO 639-1/3 primary language association(s).
* **pos\_prior** — Prior distribution over POS tags (if known).
* **lemma\_compat** — Maps to a lemma without loss (Bool).
* **affix\_productivity** — Low/med/high (estimated).
* **word\_boundary\_risk** — Risk of splitting salient morphemes (low→high).

# Syntax & Semantics

* **sent\_end\_candidate** — Can end a sentence (Bool).
* **clause\_boundary** — Often marks clause/phrase boundary (Bool).
* **punct\_kind** — none / comma / period / quote / bracket / math / other.
* **polysemy\_score** — Ambiguity level across senses (0–1).
* **entity\_hint** — person / org / loc / product / other / none.
* **domain\_hint** — general / legal / medical / code / math / web / social / ….
* **numeric\_kind** — digit / number-unit / decimal-point / sign / exponent / none.
* **unit\_kind** — SI / currency / time / date / percent / angle / other / none.
* **url\_email\_hint** — Appears in URLs/emails/handles (Bool).

# Code & Structured Text

* **code\_lang\_hint** — py / js / ts / c / cpp / java / html / css / sql / none.
* **indentation\_role** — tab / spaces / dedent / indent / none.
* **string\_delim** — quote/backtick triple-quote indicator (Bool).
* **escape\_sequence** — Begins/contains \n \t \xHH \uXXXX … (Bool).
* **json\_safe** — Won’t break JSON strings under common decoders (Bool).
* **xml\_html\_sensitive** — Contains `<` `&` `>` quotes (Bool).

# Frequency & Information

* **unigram\_freq** — P(token) in training corpus.
* **doc\_freq** — Document frequency (coverage).
* **mi\_neighbors** — Top mutual information neighbors (ids + scores).
* **avg\_bits\_surprisal** — Average −log₂ p over contexts.
* **entropy\_contrib** — Contribution to sequence entropy (estimated).
* **burstiness** — Overdispersion across docs (Poisson vs empirical).
* **topic\_skew** — KL divergence vs corpus average topic mix.
* **age\_of\_acquisition** — (Optional) psycholing estimate / N/A.

# Learned Geometry (Model-Internal)

* **embed\_norm** — L2 norm of embedding vector.
* **hubness** — K-occurrence as nearest neighbor (embedding space).
* **cluster\_id** — Unsupervised cluster label in embedding subspace.
* **semantic\_axes** — Projections (e.g., sentiment, formality, toxicity).
* **layer\_attention\_profile** — Avg attention by layer/head (vector).
* **activation\_sparsity** — % non-zeros across layers on average.
* **dead\_token** — Rarely/never predicted (Bool).
* **calibration\_bias** — Logit calibration error (systematic over/under).
* **gradient\_sensitivity** — Avg |∂loss/∂embedding| (training-time).

# Decoding & Control

* **stopword\_flag** — Language-specific stopword membership (set).
* **end\_token\_risk** — Likely to prematurely end JSON/Markdown/code blocks.
* **break\_pairing** — Can break bracket/quote pairing (Bool).
* **temperature\_sensitivity** — Output volatility vs temperature (low→high).
* **logit\_bias\_cap** — Safe range for external logit biasing.
* **sampling\_guard** — Must not sample under constraints X (enum/bitmask).
* **grammar\_tags** — Nonterminals it can satisfy under CFG/PEG constraints.
* **beam\_collapse\_risk** — Tends to create homogeneous beams (Bool).

# Safety, Privacy & Policy

* **pii\_affinity** — Likelihood to appear in PII (low/med/high).
* **pii\_kind** — email / phone / ssn / address / handle / none.
* **toxicity\_prior** — Probability of occurring in toxic contexts.
* **jailbreak\_affinity** — Appears in known jailbreak patterns (score).
* **copyright\_flag** — Part of known copyrighted strings (e.g., lyrics).
* **self\_harm\_affinity** — Safety taxonomy priors (0–1 per class).
* **medical\_legal\_flag** — Regulated domain hint (HIPAA/medical, legal).
* **geo\_sensitive** — Region-specific slur/taboo list memberships.
* **policy\_blocklist** — Policy rule ids that may ban this token.
* **redaction\_suggest** — Should be masked/redacted in logs (Bool).

# Robustness & Security

* **invisible\_seq\_risk** — Risk via zero-width/RTL control sequences.
* **spoofing\_risk** — Homoglyph/confusable attack susceptibility.
* **overfit\_signature** — Appears in memorized canaries (Bool/score).
* **noise\_stability** — Stability under OCR/ASR noise (score).
* **canonicalization\_loss** — Info lost by normalizer (none/low/high).
* **typo\_neighbors** — Edit-distance-1 confusables (set).

# Cross-Lingual & Transfer

* **lang\_coverage** — Languages where token appears with freq≥τ (set).
* **code\_switch\_affinity** — Likelihood in code-switch contexts (score).
* **transliteration\_map** — Maps to Latinized form(s) (optional).
* **script\_mix\_risk** — Mixed-script within a token (Bool).
* **phoneme\_hint** — IPA or grapheme-to-phoneme proxy (optional).

# Operational & Lifecycle

* **introduced\_in\_vocab** — Model/version where added.
* **deprecated** — Bool + replacement token(s).
* **license\_note** — If token encodes licensed terms (brand names, etc.).
* **train\_coverage\_gap** — Underrepresented vs deployment traffic (score).
* **telemetry\_opt\_out** — Should be excluded from logs/telemetry (Bool).
* **test\_coverage** — Exists in eval sets (which suites).
* **ablation\_impact** — Δmetrics if removed/merged (score).

---

## Notes for implementation

* Use this as a **schema**; most fields can be nullable until you compute them.
* Split properties into **static** (Unicode, tokenizer) vs **dynamic** (frequency, geometry, safety priors) to enable incremental updates.
* Persist per-token rows in a columnar store; recompute **dynamic** properties per release.
* Many properties are **vectors** (attention profile, semantic axes); store with small fixed dims and version their computation pipeline.
