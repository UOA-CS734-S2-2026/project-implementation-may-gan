export const legalDocumentStatuses = ["draft", "approved"] as const;
export type LegalDocumentStatus = (typeof legalDocumentStatuses)[number];

export type LegalLinkBlock = {
  type: "link";
  label: string;
  href: "/privacy" | "/terms";
};

export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | LegalLinkBlock;

export type LegalSection = {
  id: string;
  title: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  schemaVersion: 1;
  id: "privacy" | "terms";
  title: string;
  status: LegalDocumentStatus;
  version: string;
  effectiveDate: string | null;
  summary: string;
  sections: LegalSection[];
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const sectionIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateLegalDocument(value: unknown): LegalDocument {
  if (!isRecord(value)) throw new Error("Legal document must be an object.");
  if (value.schemaVersion !== 1) throw new Error("Unsupported legal document schema.");
  if (value.id !== "privacy" && value.id !== "terms") throw new Error("Invalid legal document ID.");
  if (!isNonEmptyString(value.title) || !isNonEmptyString(value.version) || !isNonEmptyString(value.summary)) {
    throw new Error("Legal document metadata is incomplete.");
  }
  if (!legalDocumentStatuses.includes(value.status as LegalDocumentStatus)) {
    throw new Error("Legal document status is invalid.");
  }
  if (value.effectiveDate !== null && (!isNonEmptyString(value.effectiveDate) || !datePattern.test(value.effectiveDate))) {
    throw new Error("Legal document effective date is invalid.");
  }
  if (value.status === "approved" && value.effectiveDate === null) {
    throw new Error("Approved legal documents need an effective date.");
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    throw new Error("Legal document needs sections.");
  }

  const sectionIds = new Set<string>();
  const sections = value.sections.map((section) => {
    if (!isRecord(section) || !isNonEmptyString(section.id) || !sectionIdPattern.test(section.id) || !isNonEmptyString(section.title) || !Array.isArray(section.blocks) || section.blocks.length === 0) {
      throw new Error("Legal document section is invalid.");
    }
    if (sectionIds.has(section.id)) throw new Error(`Duplicate legal section ID: ${section.id}`);
    sectionIds.add(section.id);
    return {
      id: section.id,
      title: section.title,
      blocks: section.blocks.map(validateBlock),
    };
  });

  return {
    schemaVersion: 1,
    id: value.id,
    title: value.title,
    status: value.status as LegalDocumentStatus,
    version: value.version,
    effectiveDate: value.effectiveDate as string | null,
    summary: value.summary,
    sections,
  };
}

function validateBlock(value: unknown): LegalBlock {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("Legal document block is invalid.");
  if (value.type === "paragraph") {
    if (!isNonEmptyString(value.text)) throw new Error("Legal paragraph is invalid.");
    return { type: "paragraph", text: value.text };
  }
  if (value.type === "list") {
    if (!Array.isArray(value.items) || value.items.length === 0 || !value.items.every(isNonEmptyString)) {
      throw new Error("Legal list is invalid.");
    }
    return { type: "list", items: value.items };
  }
  if (value.type === "link") {
    if (!isNonEmptyString(value.label) || (value.href !== "/privacy" && value.href !== "/terms")) {
      throw new Error("Legal link is invalid.");
    }
    return { type: "link", label: value.label, href: value.href };
  }
  throw new Error("Unsupported legal document block.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
