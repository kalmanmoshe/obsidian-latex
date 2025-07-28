import { SectionCache } from "obsidian";

/**
 * Removes the opening and closing delimiters from a code block string. (i.e., the ``` lines).
 * @param codeBlock 
 * @returns 
 */
export function codeBlockToContent(codeBlock: string): string {
  return codeBlock.split("\n").slice(1, -1).join("\n");
}

/**
 * Extracts the raw markdown content of a section from the file. 
 */
export function extractSectionSource(fileText: string, section: SectionCache): string {
  const lines = fileText.split("\n");
  return lines
    .slice(section.position.start.line + 1, section.position.end.line)
    .join("\n");
}