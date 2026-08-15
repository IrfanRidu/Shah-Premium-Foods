import { createWorker } from "tesseract.js";

// Advanced HRMS Features spec: "The HRMS should automatically extract
// employee information from uploaded documents using self-hosted OCR
// and AI... Do NOT use paid OCR APIs. Use open-source OCR technologies
// running on my own server." Tesseract.js is the standard, genuinely
// open-source, self-hosted answer for this — the recognition itself
// runs entirely as a local Node process, no external API calls and no
// per-page fees. One caveat worth being upfront about: by default,
// Tesseract.js downloads its open-source language-data file (e.g.
// eng.traineddata, a few MB) from a public CDN the FIRST time it runs,
// which is a one-time model download, not a per-request API call — for
// a deployment that must never make ANY external network call, that
// file can be pre-downloaded and pointed to locally instead (see
// Tesseract.js's own `langPath` worker option).
//
// Not executed in this sandbox — no network access here to even fetch
// the language-data file, no test document images, no way to verify
// real-world OCR accuracy. Written correctly against Tesseract.js's
// documented API; same honest caveat already applied to the CRM
// module's SIP.js/Asterisk code and Phase C's docxtemplater/pizzip.
export async function runOcr(imageBuffer) {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(imageBuffer);
    return { text: data.text, confidence: (data.confidence || 0) / 100 };
  } finally {
    await worker.terminate();
  }
}

// ── ICAO 9303 TD3 (passport) Machine Readable Zone parsing ─────────
// Spec: "Uploading a passport should automatically populate: Passport
// Number, Full Name, Nationality, Date of Birth, Gender, Date of Issue,
// Date of Expiry, Issuing Country." This session's own earlier note
// (PROGRESS_TRACKER.md, Phase D plan) called MRZ parsing out as "more
// reliable than free-form OCR+guessing" — every passport in the world
// (TD3 format, the standard for individual passport booklets) carries
// this exact fixed-width, checksum-protected 2-line format on its photo
// page, regardless of issuing country or language, so it's actually
// MORE reliable to find and parse those 2 lines than to try to read the
// human-readable text elsewhere on the page. This parser was verified
// against the canonical ICAO 9303 specimen MRZ (a standard reference
// example, not a document to be identified) before being used here —
// including a deliberately-corrupted checksum case to confirm the
// validator genuinely fails invalid input rather than always reporting
// success.
function mrzCharValue(c) {
  if (c === "<") return 0;
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - "0".charCodeAt(0);
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
  return 0;
}
function mrzCheckDigit(str) {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += mrzCharValue(str[i]) * weights[i % 3];
  return sum % 10;
}

// Locates the 2 consecutive 44-character MRZ lines inside noisy,
// full-page OCR text. Tolerant of OCR line-length noise (40-48 chars,
// then padded/truncated to the standard 44) since a scanned/photographed
// passport photo page rarely OCRs perfectly character-for-character —
// the checksum validation downstream is what actually signals whether a
// found candidate is trustworthy, not this detection step.
function findMrzLines(rawText) {
  const lines = rawText.split(/\r?\n/).map((l) => l.replace(/\s/g, "").toUpperCase());
  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^[A-Z0-9<]{40,48}$/.test(line));
  for (let i = 0; i < candidates.length - 1; i++) {
    const a = candidates[i], b = candidates[i + 1];
    if (b.index === a.index + 1 && a.line.startsWith("P")) {
      return [a.line.padEnd(44, "<").slice(0, 44), b.line.padEnd(44, "<").slice(0, 44)];
    }
  }
  return null;
}

function parseMrzTD3(line1, line2) {
  const issuingCountry = line1.slice(2, 5);
  const nameField = line1.slice(5).replace(/<+$/, "");
  const [surname, givenNamesRaw] = nameField.split("<<");
  const givenNames = (givenNamesRaw || "").replace(/</g, " ").trim().replace(/\s+/g, " ");

  const passportNumberRaw = line2.slice(0, 9);
  const passportNumberCheck = line2[9];
  const nationality = line2.slice(10, 13);
  const dobRaw = line2.slice(13, 19);
  const dobCheck = line2[19];
  const sex = line2[20];
  const expiryRaw = line2.slice(21, 27);
  const expiryCheck = line2[27];

  const formatDate = (yymmdd) => {
    if (!/^\d{6}$/.test(yymmdd)) return "";
    const yy = yymmdd.slice(0, 2), mm = yymmdd.slice(2, 4), dd = yymmdd.slice(4, 6);
    // 2-digit MRZ years are genuinely ambiguous without the document's
    // issue-date context (a real implementation would cross-reference
    // it) — 00-50 -> 2000s, 51-99 -> 1900s is the same default
    // convention most MRZ parsers fall back on.
    const yyyy = Number(yy) <= 50 ? `20${yy}` : `19${yy}`;
    return `${yyyy}-${mm}-${dd}`;
  };

  return {
    issuingCountry,
    surname: surname || "",
    givenNames,
    passportNumber: passportNumberRaw.replace(/</g, ""),
    passportNumberValid: mrzCheckDigit(passportNumberRaw) === Number(passportNumberCheck),
    nationality,
    dateOfBirth: formatDate(dobRaw),
    dobValid: mrzCheckDigit(dobRaw) === Number(dobCheck),
    sex: sex === "M" ? "Male" : sex === "F" ? "Female" : "",
    dateOfExpiry: formatDate(expiryRaw),
    expiryValid: mrzCheckDigit(expiryRaw) === Number(expiryCheck),
  };
}

export function extractPassportFields(ocrText) {
  const mrz = findMrzLines(ocrText);
  if (!mrz) return { fields: [] };
  const p = parseMrzTD3(mrz[0], mrz[1]);
  // Confidence reflects whether the checksums actually validated, not a
  // guess — a passport whose MRZ checksums all pass is genuinely
  // reliable data; one where they don't (OCR misread a character, or
  // this wasn't really a passport MRZ) should visibly prompt review
  // rather than silently look as trustworthy as a validated read.
  const allChecksPassed = p.passportNumberValid && p.dobValid && p.expiryValid;
  const confidence = allChecksPassed ? 0.95 : 0.4;
  const fullName = [p.givenNames, p.surname].filter(Boolean).join(" ");
  return {
    fields: [
      { field: "passport_number", value: p.passportNumber, confidence },
      { field: "full_name", value: fullName, confidence },
      { field: "nationality", value: p.nationality, confidence },
      { field: "date_of_birth", value: p.dateOfBirth, confidence },
      { field: "gender", value: p.sex, confidence },
      { field: "date_of_expiry", value: p.dateOfExpiry, confidence },
      { field: "issuing_country", value: p.issuingCountry, confidence },
    ].filter((f) => f.value),
  };
}

// ── National ID heuristic extraction ────────────────────────────
// This session's own earlier plan (PROGRESS_TRACKER.md) flagged
// National ID formats as varying by country and needing the user's
// specific layout to extract reliably, rather than guessing one. This
// implements Bangladesh's NID format (10, 13, or 17 digit numbers) as
// the default — a reasonable starting point given this project's own
// context (Dhaka-based), not a confirmed requirement — and is
// deliberately isolated in its own function so a different country's
// format can be swapped in without touching anything else in this file
// or its callers. Unlike passport MRZ (a fixed, checksum-verifiable
// international standard), this is genuine best-effort heuristic
// regex matching against free-form OCR text with no error-detection of
// its own, so confidence is capped well below what a validated MRZ read
// gets — every result from this function should be treated as
// needing human review, not as reliable extracted data.
export function extractNationalIdFields(ocrText) {
  const fields = [];
  const compact = ocrText.replace(/[\s-]/g, "");

  const nidMatch = compact.match(/\b\d{17}\b/) || compact.match(/\b\d{13}\b/) || compact.match(/\b\d{10}\b/);
  if (nidMatch) fields.push({ field: "nid_number", value: nidMatch[0], confidence: 0.5 });

  const dobMatch = ocrText.match(/Date of Birth[:\s]*([\d]{1,2}[\s/.-][A-Za-z]{3,9}[\s/.-][\d]{4}|[\d]{1,2}[\s/.-][\d]{1,2}[\s/.-][\d]{4})/i);
  if (dobMatch) fields.push({ field: "date_of_birth", value: dobMatch[1].trim(), confidence: 0.45 });

  const nameMatch = ocrText.match(/^Name[:\s]+(.+)$/im);
  if (nameMatch) fields.push({ field: "full_name", value: nameMatch[1].trim(), confidence: 0.4 });

  const fatherMatch = ocrText.match(/Father'?s?\s*Name[:\s]+(.+)/i);
  if (fatherMatch) fields.push({ field: "father_name", value: fatherMatch[1].trim().split("\n")[0], confidence: 0.4 });

  const motherMatch = ocrText.match(/Mother'?s?\s*Name[:\s]+(.+)/i);
  if (motherMatch) fields.push({ field: "mother_name", value: motherMatch[1].trim().split("\n")[0], confidence: 0.4 });

  const addressMatch = ocrText.match(/Address[:\s]+(.+)/i);
  if (addressMatch) fields.push({ field: "address", value: addressMatch[1].trim().split("\n")[0], confidence: 0.35 });

  return { fields };
}

// Advanced HRMS Features spec's "Supported documents" list also includes
// Driving License, Birth Certificate, Educational/Experience
// Certificates, Bank Documents, and Tax Documents — these vary far too
// widely in layout (any institution, any bank, any country) to build a
// heuristic extractor for without real examples to work from, unlike
// passport MRZ (a true fixed standard) or even national ID (at least a
// single country's roughly-fixed government format). Deliberately not
// guessed at: these document types are still fully supported for
// upload, storage, and OCR text extraction (so HR can read what's on
// them), just without automatic field population — status lands on
// "Needs Review" with an empty extractedFields list rather than
// fabricated-looking low-confidence guesses.
export function extractDocumentFields(documentType, ocrText) {
  if (documentType === "Passport") return extractPassportFields(ocrText);
  if (documentType === "National ID") return extractNationalIdFields(ocrText);
  return { fields: [] };
}
