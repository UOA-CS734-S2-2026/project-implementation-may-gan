import privacyJson from "./privacy.json";
import termsJson from "./terms.json";
import { validateLegalDocument, type LegalDocument } from "./types";

export type { LegalBlock, LegalDocument, LegalDocumentStatus, LegalSection } from "./types";
export { validateLegalDocument } from "./types";

export const privacyDocument: LegalDocument = validateLegalDocument(privacyJson);
export const termsDocument: LegalDocument = validateLegalDocument(termsJson);

export const legalDocuments = [privacyDocument, termsDocument] as const;
