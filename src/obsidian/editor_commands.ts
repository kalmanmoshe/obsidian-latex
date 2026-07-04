import { Command, Editor, Notice } from 'obsidian';

import LatexRender from 'src/main';
//import { assignCodeBlockName } from './codeBlockNamer';
import { getTestCommands } from 'src/tests/commands';
import { extractAllSectionsByFile } from 'src/latexRender/resolvers/latexSourceFromFile';
import { CacheStatus, hashLatexContent } from 'src/latexRender/cache/compilerCache';
import { LatexTask } from 'src/latexRender/task/latexTask';
import { codeBlockToContent } from 'obsidian-dev-utils';

// function getCodeBlockNamer(plugin: LatexRender) {
// 	return {
// 		id: 'name-code-block',
// 		name: 'Name Current Code Block',
// 		editorCallback: (editor: Editor) => assignCodeBlockName(plugin, editor),
// 	};
// }

function removeAllCachedPackages(plugin: LatexRender): Command {
	return {
		id: 'remove-all-cached-packages',
		name: 'Remove all cached packages',
		callback() {
			plugin.swiftlatexRender.cache.removeAllCachedPackages();
			new Notice('All cached packages removed');
		},
	};
}

async function extractAllUnrenderedSectionsByFile(plugin: LatexRender) {
	const sectionsByFile = await extractAllSectionsByFile();
	const sectionInfosByFile = [];

	for (const { file, codeBlockSections } of sectionsByFile) {
		const fileInfos = [];

		for (const section of codeBlockSections) {
			const codeBlock = codeBlockToContent(section.codeBlock);
			const hash = hashLatexContent(codeBlock);
			if (
				plugin.swiftlatexRender.cache.cacheStatusForHash(hash) ===
				CacheStatus.NotCached
			) {
				fileInfos.push(section);
			}
		}

		if (fileInfos.length > 0) {
			sectionInfosByFile.push({ file, codeBlockSections: fileInfos });
		}
	}
	return sectionInfosByFile;
}
async function renderAllUnrenderedCodeBlocks(plugin: LatexRender) {
	const sectionInfosByFile = await extractAllUnrenderedSectionsByFile(plugin);
	console.log(
		'Unrendered sections found:',
		sectionInfosByFile,
		sectionInfosByFile.length,
	);
	for (const { file, codeBlockSections } of sectionInfosByFile) {
		for (const codeBlock of codeBlockSections) {
			const task = LatexTask.fromSectionInfos(plugin, file.path, [
				codeBlock,
			]);
			plugin.swiftlatexRender.queue.push(task);
		}
	}
	console.log(
		'All unrendered code blocks are being processed',
		plugin.swiftlatexRender.queue,
	);
}

function getRenderAllUnrenderedCodeBlocks(plugin: LatexRender) {
	return {
		id: 'render-all-unrendered-code-blocks',
		name: 'Render All Unrendered Code Blocks',
		callback: async () => {
			renderAllUnrenderedCodeBlocks(plugin);
			new Notice('All unrendered code blocks are being processed');
		},
	};
}

function getRebuildQueue(plugin: LatexRender) {
	return {
		id: 'rebuild-queue',
		name: 'Rebuild Render Queue',
		callback: async () => {
			plugin.swiftlatexRender.queue.rebuild();
			new Notice('Render queue rebuilt');
		},
	};
}

function getAbortTasks(plugin: LatexRender) {
	return {
		id: 'abort-latex-tasks',
		name: 'Abort All LaTeX Tasks',
		callback: () => {
			plugin.swiftlatexRender.queue.abortAllWaiting();
			new Notice('All tasks aborted');
		},
	};
}

function getRestartCompilerCommand(plugin: LatexRender) {
	return {
		id: 'restart-compiler',
		name: 'Restart LaTeX Compiler',
		callback: async () => {
			await plugin.swiftlatexRender.restartCompiler();
			new Notice('LaTeX compiler restarted');
		},
	};
}

export const getEditorCommands = (
	plugin: LatexRender,
): (Command | undefined)[] => {
	return [
		...getTestCommands(plugin),
		//getCodeBlockNamer(plugin),
		removeAllCachedPackages(plugin),
		getRebuildQueue(plugin),
		getAbortTasks(plugin),
		getRenderAllUnrenderedCodeBlocks(plugin),
		getRestartCompilerCommand(plugin),
	];
};
