import { MarkdownPostProcessorContext, Platform } from 'obsidian';
import { CompileResult, CompileStatus } from './compiler/base/compilerBase/engine';
import LatexCompilerPlugin from '../main';
import { CompilerType } from 'src/settings/settings.js';

import { pdfToHtml, pdfToOptimizedSVG, pdfToSVG } from './pdfToHtml/pdfToHtml';
import parseLatexLog, { createErrorDisplay, errorDiv } from './logs/HumanReadableLogs';
import { VfsCompileMode, VirtualFileSystem } from './VirtualFileSystem';
import { ProcessedLog } from './logs/latex-log-parser';
import PdfTeXCompiler from './compiler/swiftlatexpdftex/PdfTeXCompiler';
import { LatexTask, ProcessableLatexTask } from './task/latexTask';
import { PdfXeTeXCompiler } from './compiler/swiftlatexxetex/pdfXeTeXCompiler';
import LatexCompiler from './compiler/base/compilerBase/compiler';
import CompilerCache, { hashLatexContent } from './cache/compilerCache';
import { SVG_ID_KEY } from 'src/svg/nodes';
import { LatexRenderQueue } from './LatexRenderQueue';
import { getLogCacheKey } from './cache/logCache';

export const waitFor = async (condFunc: () => boolean) => {
	return new Promise<void>((resolve) => {
		if (condFunc()) {
			resolve();
		} else {
			setTimeout(async () => {
				await waitFor(condFunc);
				resolve();
			}, 100);
		}
	});
};

export const latexCodeBlockNamesRegex = /(`|~){3,} *(latex|tikz)/;

type HandleErrorOptions = {
	/**
	 * If true, the error will be parsed and displayed as a log.
	 */
	parseErr?: boolean;
	/**
	 * If true, the error will be thrown after handling.
	 */
	throw?: boolean;
};

/**
 * add command to rerender all fils using (\input{}) this file
 * add resove tab indentasins setting
 * The goust bubble happens when I do ctrl z
 * add replac all & replace in selection
 *
 */
/**
 * add option for Persistent preamble.so it won't get deleted.after use Instead, saved until overwritten
 */
export class LatexRenderer {
	plugin: LatexCompilerPlugin;
	vfs: VirtualFileSystem = new VirtualFileSystem();
	compiler?: LatexCompiler;
	cache: CompilerCache;
	queue?: LatexRenderQueue;

	async onload(plugin: LatexCompilerPlugin) {
		this.plugin = plugin;
		if (this.isNotIos()) {
			this.cache = new CompilerCache(this.plugin);
			await this.loadCompiler();

			this.queue = new LatexRenderQueue({
				renderTask: this.processAndRenderLatexTask.bind(this),
				getCooldown: () => this.plugin.settings.pdfEngineCooldown,
			});
		}

		console.log('SwiftlatexRender loaded');
	}

	switchCompiler(): Promise<void> {
		if (this.compiler === undefined) return this.loadCompiler();

		const isTex =
			this.compiler instanceof PdfTeXCompiler &&
			this.plugin.settings.compiler === CompilerType.TeX;

		const isXeTeX =
			this.compiler instanceof PdfXeTeXCompiler &&
			this.plugin.settings.compiler === CompilerType.XeTeX;

		if (isTex || isXeTeX) return Promise.resolve();

		this.compiler.closeWorkers();
		this.compiler = undefined as any;

		return this.loadCompiler();
	}

	private async loadCompiler() {
		if (this.plugin.settings.compiler === CompilerType.TeX) {
			this.compiler = new PdfTeXCompiler();
		} else {
			this.compiler = new PdfXeTeXCompiler();
		}

		this.vfs.setPdfCompiler(this.compiler);
		await this.compiler.loadEngines();
		await this.cache.loadPackageCache();
		await this.compiler.setTexliveEndpoint(this.plugin.settings.package_url);
	}

	async restartCompiler() {
		this.compiler?.closeWorkers();
		this.queue?.abortAllWaiting();
		await this.loadCompiler();
	}

	// i have to also cache the files refrenced my the hash and thar loction becose thar can i a file that is Referencing the same files.But because it's in a different directory, those files in actuality are different, leading to a different render.
	async codeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const isLangTikz = el.classList.contains('block-language-tikz');

		el.classList.remove('block-language-tikz', 'block-language-latex');
		el.classList.add(
			'block-language-latexsvg',
			`overflow-${this.plugin.settings.overflowStrategy}`,
		);

		const rawHash = hashLatexContent(source);

		const createResult = await LatexTask.createAsync(this.plugin, isLangTikz, source, el, ctx);

		if (createResult.isError) {
			this.handleError(
				el,
				'Error creating task: ' + createResult.result,
				this.cache.resultFileCache.getFileStem(rawHash, []),
			);
			return;
		}

		// Attach a menu to the element for user interaction, such as re-rendering or viewing logs.
		this.plugin.menuDecider.add(el, ctx.sourcePath);

		const task = createResult.result as LatexTask | ProcessableLatexTask;

		// PDF file has already been cached
		// Could have a case where pdfCache has the key but the cached file has been deleted
		const wasRestoredFromCache = await restoreFromCache(task, this.plugin);

		if (wasRestoredFromCache) return;

		this.queue?.push(task as LatexTask);
	}

	/**
	 * Processes and renders the given LaTeX task.
	 *
	 * @param task The task to process and render.
	 * @returns `true` if the task was compiled and rendered; `false` if it was restored from cache or failed during processing.
	 */
	private async processAndRenderLatexTask(task: LatexTask): Promise<boolean> {
		if (await restoreFromCache(task, this.plugin)) {
			console.log('Found in catch for', task.getBlockId());
			return false;
		}

		if (await this.shouldSkipStaleTask(task)) return false;

		if (!this.compiler?.isResponsive()) {
			console.error('Compiler is unresponsive. Aborting task:', task.getDebugInfo());
			this.handleErrorForTask(task, 'Compiler is unresponsive. Please restart the compiler.');
			return false;
		}

		if (task.isProcess()) {
			const processError = await task.process();

			task.log();
			if (processError) {
				this.handleErrorForTask(task, `Error processing task: ${processError}`);
				return false;
			}
		} else {
			// We need to make sure there is no file in the VFS
			this.vfs.removeNonAutoUseFiles();
		}

		console.log('Rendering task:', task.getDebugInfo());

		await this.renderLatexToElement(task);
		await this.reCheckQueue(); // only re-check the queue after a valide rendering
		return true;
	}

	private async shouldSkipStaleTask(task: LatexTask): Promise<boolean> {
		if (!task.hasSourceChangeTimeExceededMargin()) return false;
		if (await task.verifySource()) return false;

		if (this.hasNewerQueuedTask(task)) {
			console.warn('Skipping stale task because a newer task exists:', task.getDebugInfo());
			return true;
		}

		console.error('Source files changed and could not be resolved:', task.getDebugInfo());

		this.handleErrorForTask(
			task,
			'Error processing task: Source files have changed and could not be resolved.',
		);

		return true;
	}

	private hasNewerQueuedTask(task: LatexTask): boolean {
		if (!this.isNotIos()) return false;

		return this.queue
			.getWaitingTasks()
			.some((waitingTask) => waitingTask.getBlockId() === task.getBlockId());
	}

	async detachedProcessAndRender(task: LatexTask) {
		if (!this.compiler?.isResponsive()) {
			console.error('Compiler is unresponsive. Aborting task:', task.getDebugInfo());
			return new CompileResult(
				undefined,
				CompileStatus.EngineCrashed,
				'Compiler is unresponsive. Please restart the compiler.',
			);
		}

		if (task.isProcess()) {
			const processError = await task.process();
			task.log();
			if (processError) {
				return new CompileResult(undefined, CompileStatus.ProcessingError, processError);
			}
		}
		try {
			const compileMode = task.isProcess() ? VfsCompileMode.compileAll : VfsCompileMode.none;

			return await this.renderLatexToPDF(task.getProcessedContent(), compileMode);
		} catch (err) {
			return new CompileResult(undefined, CompileStatus.CompileError, toErrorString(err));
		}
	}

	async detachedProcessAndRenderToResultFile(task: LatexTask) {
		const compileResult = await this.detachedProcessAndRender(task);
		if (compileResult.status === CompileStatus.CompileError) {
			return;
		}
		const resultFile = pdfToSVG(compileResult.pdf);
		return resultFile;
	}

	/**
	 * Re-checks the queue to see if any tasks can be removed based on whether their PDF has been restored from cache.
	 * If a task's PDF cannot be restored, it is removed from the queue.
	 * Solves edge case where head is in the processing state when a similar task is registered to the universal method
	 */
	private async reCheckQueue() {
		if (!this.queue) return;
		const blockIdsToRemove = new Set<string>();
		const waitingTasks = this.queue.getWaitingTasks();

		for (const task of waitingTasks) {
			if (await restoreFromCache(task, this.plugin)) {
				blockIdsToRemove.add(task.getBlockId());
			}
		}

		if (blockIdsToRemove.size === 0) return;

		this.queue.removeFromWaiting((task) => blockIdsToRemove.has(task.getBlockId()));
	}

	async onunload() {
		this.compiler?.closeWorkers();
	}

	private handleErrorForTask(
		task: LatexTask,
		err: string,
		options: HandleErrorOptions = {},
	): void {
		const el = task.el;
		const stem = task.getStem();
		this.handleError(el, err, stem, options);
	}

	private handleError(
		el: HTMLElement,
		err: string,
		hash: string,
		options: HandleErrorOptions = {},
	): void {
		el.innerHTML = '';
		let child: HTMLElement;

		if (options.parseErr) {
			const processedError: ProcessedLog = this.cache.getLog(hash) || parseLatexLog(err);
			child = createErrorDisplay(processedError);
		} else {
			child = errorDiv({ title: err });
		}

		child.setAttribute(SVG_ID_KEY, hash);
		el.appendChild(child);
		if (options.throw) throw err;
	}

	private async renderLatexToElement(task: LatexTask): Promise<void> {
		const { el, content, rawHash, sourcePath, dependencyPaths, stem } = task.getRenderData();

		try {
			const compileMode = task.isProcess() ? VfsCompileMode.compileAll : VfsCompileMode.none;
			const result = await this.renderLatexToPDF(content, compileMode, {
				fetchPkgData: true,
				md5Hash: rawHash,
				dependencyPaths,
			});

			el.innerHTML = '';
			await this.translatePDF(result.pdf, el, stem);

			this.cache.resultFileCache.addFile(el.innerHTML, rawHash, dependencyPaths, sourcePath);
		} catch (err) {
			this.handleErrorForTask(task, toErrorString(err), {
				parseErr: true,
			});
		} finally {
			if (!this.compiler?.isResponsive()) {
				console.warn('Compiler is unresponsive.');
			} else {
				await this.compiler?.waitUntilReady();
			}
		}
	}

	private async renderLatexToPDF(
		source: string,
		vfsCompileMode: VfsCompileMode,
		config: { fetchPkgData?: boolean; md5Hash?: string; dependencyPaths?: string[] } = {},
	): Promise<CompileResult> {
		await this.compiler!.waitUntilReady();

		await this.vfs.loadVirtualFileSystemFiles(vfsCompileMode);

		await this.compiler!.writeMemFSFile('main.tex', source);
		await this.compiler!.setEngineMainFile(0, 'main.tex');

		const result = await this.compiler!.compileLaTeX();
		console.log('Compilation result:', result);

		await this.vfs.removeNonAutoUseFiles();

		if (config.md5Hash && config.dependencyPaths) {
			const logCacheKey = getLogCacheKey(config.md5Hash, config.dependencyPaths);
			this.cache.addLog(result.log, logCacheKey);
		}

		if (result.status !== 0) {
			throw new Error(result.log);
		}

		if (config.fetchPkgData) {
			await this.cache.fetchPackageCacheData();
		}

		return result;
	}

	private async translatePDF(
		pdfData: Uint8Array,
		el: HTMLElement,
		stem: string,
		outputSVG = true,
	): Promise<void> {
		return new Promise<void>((resolve) => {
			const config = {
				invertColorsInDarkMode: this.plugin.settings.invertColorsInDarkMode,
				autoRemoveWhitespace: this.plugin.settings.autoRemoveWhitespace,
				stem,
			};
			if (outputSVG) {
				pdfToOptimizedSVG(pdfData, config).then((svg: string) => {
					el.innerHTML = svg;
					resolve();
				});
			} else {
				pdfToHtml(pdfData).then((htmlData) => {
					el.createEl('object', htmlData);
					resolve();
				});
			}
		});
	}

	isNotIos(): this is LatexRenderer & {
		queue: LatexRenderQueue;
		compiler: LatexCompiler;
	} {
		return !Platform.isIosApp;
	}
}

//TODO: put this somewahere better
function restoreFromCache(task: LatexTask, plugin: LatexCompilerPlugin) {
	return plugin.latexRenderer.cache.resultFileCache.restoreFromCache(
		task.el,
		task.rawHash,
		task.sourcePath,
		() => {
			if (task instanceof ProcessableLatexTask) {
				return getCacheDependencyPaths(task, plugin.latexRenderer.vfs, plugin);
			}
			return Promise.resolve([]);
		},
	);
}

async function getCacheDependencyPaths(
	task: ProcessableLatexTask,
	vfs: VirtualFileSystem,
	plugin: LatexCompilerPlugin,
): Promise<string[]> {
	const explicitDeps = await vfs
		.getParser()
		.collectSurfaceDependencyPaths(task.getContent(), task.sourcePath);

	const autoUsePaths = plugin.settings.compilerVfsEnabled
		? vfs
				.getAutoUseFiles()
				.map((file) => file.path)
				.filter((path) => !explicitDeps.includes(path))
		: [];

	return [...new Set([...explicitDeps, ...autoUsePaths])].sort();
}

export class TimeoutError extends Error {
	constructor(message = 'Timed out') {
		super(message);
		this.name = 'TimeoutError';
	}
}

function toErrorString(e: unknown): string {
	if (typeof e === 'string') return e;
	if (e instanceof Error) return e.stack ?? e.message ?? String(e);
	try {
		return JSON.stringify(e, null, 2);
	} catch {
		return String(e);
	}
}
