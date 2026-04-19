import type { ResearchReportSettings } from "../settings";

export interface ResearchContextInput {
  selectedText?: string;
  documentContent?: string;
  documentTitle?: string;
  documentPath?: string;
}

export interface PreparedResearchContext extends ResearchContextInput {
  truncationNotes: string[];
}

export const MAX_SELECTION_CHARS = 8000;
const DEFAULT_DOCUMENT_CONTEXT_CHARS = 12000;
const MIN_DOCUMENT_CONTEXT_CHARS = 2000;

function normalizeTrimmed(value?: string): string | undefined {
  const normalized = String(value || "").trim();
  return normalized ? normalized : undefined;
}

function normalizeDocument(value?: string): string | undefined {
  const raw = String(value || "");
  return raw.trim() ? raw : undefined;
}

function clampDocumentLimit(settings: ResearchReportSettings): number {
  return Math.max(
    Number.isFinite(settings.maxDocumentContextChars)
      ? settings.maxDocumentContextChars
      : DEFAULT_DOCUMENT_CONTEXT_CHARS,
    MIN_DOCUMENT_CONTEXT_CHARS
  );
}

export function prepareResearchContext(
  settings: ResearchReportSettings,
  context: ResearchContextInput
): PreparedResearchContext {
  const truncationNotes: string[] = [];

  let selectedText = normalizeTrimmed(context.selectedText);
  if (selectedText && selectedText.length > MAX_SELECTION_CHARS) {
    truncationNotes.push(`选中文本已截断到前 ${MAX_SELECTION_CHARS} 字。`);
    selectedText = selectedText.slice(0, MAX_SELECTION_CHARS);
  }

  let documentContent = normalizeDocument(context.documentContent);
  const maxDocumentChars = clampDocumentLimit(settings);
  if (documentContent && documentContent.length > maxDocumentChars) {
    truncationNotes.push(`文档上下文已截断到前 ${maxDocumentChars} 字。`);
    documentContent = documentContent.slice(0, maxDocumentChars);
  }

  return {
    selectedText,
    documentContent,
    documentTitle: normalizeTrimmed(context.documentTitle),
    documentPath: normalizeTrimmed(context.documentPath),
    truncationNotes,
  };
}
