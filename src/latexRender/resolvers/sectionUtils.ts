import { MarkdownSectionInformation, TFile, SectionCache } from "obsidian";
import { findInnermostSectionInfo, getLatexTaskSectionInfosFromFile, TaskSectionInformation } from "./taskSectionInformation";
import { Line } from "@codemirror/state";

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



export function sectionToTaskSectionInfo(section: MarkdownSectionInformation): TaskSectionInformation {
  return {
    lineStart: section.lineStart,
    lineEnd: section.lineEnd,
    codeBlock: section.text.split("\n").slice(section.lineStart, section.lineEnd + 1).join("\n"),
  };
}

export async function codeMirrorLineToTaskSectionInfo(file: TFile, line: Line) {
  const sectionInfos = await getLatexTaskSectionInfosFromFile(file);
  return findInnermostSectionInfo(sectionInfos, line.number);
}