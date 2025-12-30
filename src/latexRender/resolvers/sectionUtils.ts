import { MarkdownSectionInformation, TFile } from 'obsidian';
import {
	findInnermostSectionInfo,
	getLatexTaskSectionInfosFromFile,
	TaskSectionInformation,
} from './taskSectionInformation';
import { Line } from '@codemirror/state';

export function sectionToTaskSectionInfo(
	section: MarkdownSectionInformation,
): TaskSectionInformation {
	return {
		lineStart: section.lineStart,
		lineEnd: section.lineEnd,
		codeBlock: section.text
			.split('\n')
			.slice(section.lineStart, section.lineEnd + 1)
			.join('\n'),
	};
}

export function taskSectionInfoToCodeBlock(
	fileText: string | string[],
	taskSection: TaskSectionInformation,
): string {
	if (typeof fileText === 'string') {
		fileText = fileText.split('\n');
	}
	return fileText
		.slice(taskSection.lineStart, taskSection.lineEnd + 1)
		.join('\n');
}

export function taskSectionInfoToContent(
	fileText: string | string[],
	taskSection: TaskSectionInformation,
): string {
	return taskSectionInfoToCodeBlock(fileText, taskSection)
		.split('\n')
		.slice(1, -1)
		.join('\n');
}

export async function codeMirrorLineToTaskSectionInfo(file: TFile, line: Line) {
	const sectionInfos = await getLatexTaskSectionInfosFromFile(file);
	return findInnermostSectionInfo(sectionInfos, line.number);
}
