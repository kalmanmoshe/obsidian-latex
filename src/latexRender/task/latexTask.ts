import LatexRender from 'src/main';
import {
	MarkdownPostProcessorContext,
	MarkdownSectionInformation,
	MarkdownView,
	TFile,
} from 'obsidian';
import { getFileSectionsFromPath } from '../resolvers/sectionCache';
import {
	extractCodeBlockMetadata,
	extractCodeBlockName,
} from '../resolvers/latexSourceFromFile';
import { LatexAbstractSyntaxTree } from '../../ast/parse';
import { getSectionsFromMatching } from '../resolvers/findSection';
import { TaskSectionInformation } from '../resolvers/taskSectionInformation';
import { hashLatexContent } from '../cache/resultFileCache';

import { codeBlockToContent } from 'obsidian-dev-utils';
import {
	sectionToTaskSectionInfo,
	taskSectionInfoToContent,
} from '../resolvers/sectionUtils';
import { processTaskSource } from './latexTaskProcessor';
/**
 * Be careful of catching this as the file may change and until you don't generate a new one it will be static.
 */

/*interface TaskSectionInformation extends MarkdownSectionInformation{
	/**
	 * The file text where the task (source) is located. (i checked this and this is correct)
	 */
//text: string;
/*}*/

/**nameing conventions:
 * - Task: a general task that can be processed or not.
 * text - The full text of a file
 * codeBlock - The source code of a codeBlock including the code block delimiters.
 * content - The content of the code block without the delimiters.
 */
type InputFile = {
	name: string;
	content: string;
	dependencies: InputFile[];
};

export function createTask(
	plugin: LatexRender,
	process: boolean,
	content: string,
	el: HTMLElement,
	sourcePath: string,
	infos: TaskSectionInformation[],
): LatexTask | ProcessableLatexTask {
	return process
		? new ProcessableLatexTask(plugin, content, el, sourcePath, infos)
		: new LatexTask(plugin, content, el, sourcePath, infos);
}
export class BaseTask {
	plugin: LatexRender;
	content: string;
	sourcePath: string;
	md5Hash: string;
}
//const SOURCE_CHANGE_TIME_MARGIN = 1000;

/**
 * sets the section information for the task.
 * Attempts to locate the Markdown section that corresponds to a rendered code block,
 * even when section info is unavailable (e.g., virtual rendering or nested codeBlock environments).
 * @param ctx
 * @returns
 */
async function mdSecInfosFromMdPostProcessorCtx(
	ctx: MarkdownPostProcessorContext,
	content: string,
) {
	const sectionFromContext = ctx.getSectionInfo(this.el);
	if (sectionFromContext) {
		return [sectionFromContext];
	}
	const { file, sections } = await getFileSectionsFromPath(ctx.sourcePath);
	const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
	const fileText = editor?.getValue() ?? (await app.vault.cachedRead(file));
	// i want to move the logger to the plugin thats why i have the err for now, as a reminder
	let sectionInfos = getSectionsFromMatching(sections, fileText, content);

	if (!sectionInfos) {
		console.warn(
			sectionInfos,
			sections,
			fileText.split('\n'),
			content.split('\n'),
		);
		throw new Error(
			'No section information found for the task. This might be due to virtual rendering or nested codeBlock environments.',
		);
	}
	return sectionInfos;
}

export class LatexTask {
	plugin: LatexRender;
	protected content: string;
	sourcePath: string;
	uuid = crypto.randomUUID();
	rawHash: string;
	/**
	 * The resolved hash is the hash of the content after it has been processed and the dependencies have been resolved.
	 */
	resolvedHash: string;
	protected blockId: string;
	el: HTMLElement;
	protected sectionInfos: TaskSectionInformation[];
	protected onCompiled?: (task: LatexTask) => void;
	private error: string;
	private lastSectionInfoVerificationTime: number = Date.now();

	constructor(
		plugin: LatexRender,
		source: string,
		el: HTMLElement,
		sourcePath: string,
		sectionInfos: TaskSectionInformation[],
	) {
		this.plugin = plugin;
		this.setSource(source);
		this.el = el;
		this.sourcePath = sourcePath;
		this.setSectionInfos(sectionInfos);
	}

	set onCompiledCallback(callback: (task: LatexTask) => void) {
		this.onCompiled = callback;
	}

	isError() {
		return !!this.error;
	}

	hasSourceChangeTimeExceededMargin() {
		return (
			Date.now() - this.lastSectionInfoVerificationTime >
			this.plugin.settings.pdfEngineCooldown
		);
	}

	/**
	 * Ensures the code block still exists for this task.
	 * Returns true if the source is still present or could be re-resolved, false otherwise.
	 */
	async verifySource(): Promise<boolean> {
		const returnVerify = (value: boolean) => {
			this.lastSectionInfoVerificationTime = Date.now();
			return value;
		};
		this.lastSectionInfoVerificationTime = Date.now();
		const file = app.vault.getAbstractFileByPath(this.sourcePath);
		if (!file || !(file instanceof TFile)) return returnVerify(false);

		// First pass: use cached text (fast)
		const fileText = await app.vault.cachedRead(file);
		const lines = fileText.split('\n');
		const verifiedSectionInfos: any[] = [];

		for (const sectionInfo of this.sectionInfos) {
			if (sectionInfo.lineEnd < lines.length) {
				const sectionContent = taskSectionInfoToContent(
					lines,
					sectionInfo,
				);
				if (sectionContent === this.content) {
					verifiedSectionInfos.push(sectionInfo);
				}
			}
		}

		if (verifiedSectionInfos.length === this.sectionInfos.length) {
			return returnVerify(true);
		}

		return returnVerify(await this.rebuildTaskFromContent());
	}

	/**
	 * Rebuilds the task from the content.
	 * @returns {boolean} - Returns true if the task was successfully rebuilt, false otherwise.
	 */
	async rebuildTaskFromContent(): Promise<boolean> {
		const verifiedSectionInfos: TaskSectionInformation[] = [];
		const file = app.vault.getAbstractFileByPath(this.sourcePath);
		if (!file || !(file instanceof TFile)) return false;
		const upToDateFileText = await app.vault.read(file);
		const { sections } = await getFileSectionsFromPath(this.sourcePath);
		const sectionInfos = getSectionsFromMatching(
			sections,
			upToDateFileText,
			this.content,
		);

		if (!sectionInfos || sectionInfos.length === 0) return false;

		verifiedSectionInfos.push(
			...sectionInfos.map((sec) => sectionToTaskSectionInfo(sec)),
		);
		this.setSectionInfos(verifiedSectionInfos);
		return true;
	}

	static baseCreate(
		plugin: LatexRender,
		process: boolean,
		content: string,
		el: HTMLElement,
		sourcePath: string,
		sectionInfo: TaskSectionInformation | TaskSectionInformation[],
	): LatexTask {
		const sectionInfos = Array.isArray(sectionInfo)
			? sectionInfo
			: [sectionInfo];
		const task = createTask(
			plugin,
			process,
			content,
			el,
			sourcePath,
			sectionInfos,
		);
		return task;
	}

	/**
	 * this method creates a LatexTask from a section information object. it creates a temp div element to hold the task.
	 * @param plugin
	 * @param path
	 * @param sectionInfo
	 * @returns
	 */
	static fromSectionInfos(
		plugin: LatexRender,
		path: string,
		sectionInfos: TaskSectionInformation[],
		el?: HTMLElement,
	): LatexTask {
		if (sectionInfos.length === 0) {
			throw new Error(
				'No section information provided for creating a task.',
			);
		}
		const contents = sectionInfos.map((sec) =>
			codeBlockToContent(sec.codeBlock),
		);
		if (!contents.every((c) => c === contents[0])) {
			throw new Error(
				'All section contents must be the same for creating a task from multiple sections.',
			);
		}
		const content = contents[0];
		const metadatas = sectionInfos.map((sec) =>
			extractCodeBlockMetadata(sec.codeBlock),
		);
		if (
			!metadatas.every((meta) => meta.language === metadatas[0].language)
		) {
			throw new Error(
				'All section metadata languages must be the same for creating a task from multiple sections.',
			);
		}
		const isProcess = metadatas[0].language === 'tikz';
		return LatexTask.baseCreate(
			plugin,
			isProcess,
			content,
			el ?? document.createElement('div'),
			path,
			sectionInfos,
		);
	}

	static async createAsync(
		plugin: LatexRender,
		process: boolean,
		content: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) {
		try {
			const mdSectionInfos = await mdSecInfosFromMdPostProcessorCtx(
				ctx,
				content,
			);
			console.log('mdSectionInfos', mdSectionInfos);
			const infos = mdSectionInfos.map((sec) =>
				sectionToTaskSectionInfo(sec),
			);
			console.log('taskSectionInfos', infos);
			const task = createTask(
				plugin,
				process,
				content,
				el,
				ctx.sourcePath,
				infos,
			);
			console.log('Created task from context:', task);
			return { isError: false, result: task };
		} catch (err) {
			console.error('Error while ensuring section info for task:', err);
			return { isError: true, result: err };
		}
	}

	isProcess(): this is ProcessableLatexTask {
		return this instanceof ProcessableLatexTask;
	}

	getCacheStatus() {
		return this.plugin.swiftlatexRender.cache.cacheStatusForHash(
			this.rawHash,
		);
	}

	getCacheStatusAsNum() {
		return this.plugin.swiftlatexRender.cache.cacheStatusForHashAsNum(
			this.rawHash,
		);
	}

	restoreFromCache() {
		return this.plugin.swiftlatexRender.cache.resultFileCache.restoreFromCache(
			this.el,
			this.rawHash,
			this.sourcePath,
		);
	}

	setSource(source: string) {
		this.content = source;
		this.rawHash = hashLatexContent(source);
		if (!this.resolvedHash) {
			this.resolvedHash = this.rawHash;
		}
	}

	getContent() {
		return this.content;
	}

	getProcessedContent() {
		return this.getContent();
	}

	/**
	 * sets the section information for the task as well as dependent properties.
	 * @param infos
	 */
	protected setSectionInfos(
		infos: (TaskSectionInformation | MarkdownSectionInformation)[],
	) {
		for (const info of infos) {
			const taskInfo =
				'text' in info ? sectionToTaskSectionInfo(info) : info;
			this.sectionInfos ??= [];
			this.sectionInfos.push(taskInfo as TaskSectionInformation);
		}

		this.sectionInfos!.sort((a, b) => a.lineStart - b.lineStart);

		const numberKey = this.sectionInfos!.map((sec) => sec.lineStart).join(
			'|',
		);
		this.blockId = this.sourcePath.replace(/ /g, '_') + '||' + numberKey;
	}

	getBlockId() {
		if (!this.blockId) {
			throw new Error('Block ID is not set. Call setSectionInfo first.');
		}
		return this.blockId;
	}

	getDependencyPaths(): string[] {
		return [];
	}

	getBaseName() {
		return this.plugin.swiftlatexRender.cache.resultFileCache.getFileBaseName(
			this.rawHash,
			this.getDependencyPaths(),
		);
	}

	getRenderData() {
		return {
			el: this.el,
			content: this.getProcessedContent(),
			rawHash: this.rawHash,
			sourcePath: this.sourcePath,
			dependencyPaths: this.getDependencyPaths(),
			basename: this.getBaseName(),
		};
	}

	getDebugInfo() {
		return {
			vfsFils: this.plugin.swiftlatexRender.vfs.getClonedFiles(),
			sourcePath: this.sourcePath,
			content: this.content,
			rawHash: this.rawHash,
			resolvedHash: this.resolvedHash,
			blockId: this.blockId,
			sectionInfos: this.sectionInfos.map((sec) => ({
				lineStart: sec.lineStart,
				lineEnd: sec.lineEnd,
				codeBlock: sec.codeBlock,
			})),
			lastSectionInfoVerificationTime:
				this.lastSectionInfoVerificationTime,
		};
	}
}
//Create a block ID that is generated from all possible solutions.

export class ProcessableLatexTask extends LatexTask {
	/**
	 * Because we can't guarantee one section information per task, there may be situations where there are multiple. we don't have enough information to prefer one over the other, so we must consider them all.
	 */
	private possibleNames: string[];
	processed: boolean = false;
	processingTime: number;
	private ast: LatexAbstractSyntaxTree | null = null;
	sectionInfos: TaskSectionInformation[];
	private astContent: string | null = null;
	private dependencyPaths: string[] = [];

	constructor(
		plugin: LatexRender,
		content: string,
		el: HTMLElement,
		sourcePath: string,
		infos: TaskSectionInformation[],
	) {
		super(plugin, content, el, sourcePath, infos);
	}

	//TODO: rm this is temp for debugging
	getAst() { return this.ast; }

	getProcessedContent(): string {
		if (!this.ast || !this.astContent)
			throw new Error('AST is not set for this task.');
		return this.astContent;
	}

	getDependencyPaths(): string[] {
		return this.dependencyPaths;
	}

	protected setSectionInfos(
		infos: (TaskSectionInformation | MarkdownSectionInformation)[],
	) {
		super.setSectionInfos(infos);

		const names = [];
		for (const section of this.sectionInfos) {
			const line = section.codeBlock.split('\n')[0];
			const name = extractCodeBlockName(line);
			if (name) names.push(name);
		}
		this.possibleNames = names;
	}

	getPossibleNames() {
		return this.possibleNames;
	}

	setAst(ast: LatexAbstractSyntaxTree) {
		this.ast = ast;
		this.astContent = ast.toString();
		this.resolvedHash = hashLatexContent(this.astContent);
	}

	/**
	 * Logs the task information to the console.
	 * (for debugging purposes rm later)
	 */
	log() {
		console.log(
			`[TIMER] Total processing time: ${(this.processingTime || NaN).toFixed(2)} ms`,
		);
		console.log('ast', this.ast?.clone());
		console.log('task', this);
	}

	async process(): Promise<void|string> {
		return await processTaskSource(
			this,
			this.plugin.swiftlatexRender.vfs,
			this.plugin
		);
	}

	getDebugInfo() {
		return {
			...super.getDebugInfo(),
			ast: this.ast ? this.ast.clone() : null,
			astContent: this.astContent,
			dependencyPaths: this.dependencyPaths,
			processed: this.processed,
			processingTime: this.processingTime,
			possibleNames: this.possibleNames,
		};
	}
}
