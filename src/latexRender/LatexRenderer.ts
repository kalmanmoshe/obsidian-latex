import { MarkdownPostProcessorContext, Platform } from 'obsidian';
import { CompileResult, CompileStatus } from './compiler/base/compilerBase/engine';
import LatexCompilerPlugin from '../main';
import { CompilerType, ResultFileFormat } from 'src/settings/settings.js';
import { insertPdf } from './pdfConversion/pdfToHtml';
import parseLatexLog, { createErrorDisplay, errorDiv } from './logs/humanReadableLogs';
import { VfsCompileMode, VirtualFileSystem } from '../dependency/VirtualFileSystem';
import { ProcessedLog } from './logs/latexLogParser';
import PdfTeXCompiler from './compiler/swiftlatexpdftex/PdfTeXCompiler';
import { LatexTask } from './task/latexTask';
import { PdfXeTeXCompiler } from './compiler/swiftlatexxetex/pdfXeTeXCompiler';
import LatexCompiler from './compiler/base/compilerBase/compiler';
import CompilerCache, { hashLatexContent } from './cache/compilerCache';
import { LatexRenderQueue } from './task/LatexRenderQueue';
import { getLogCacheKey } from './cache/logCache';
import { pdfToSVG, LATEX_RENDER_ID_KEY, pdfToOptimizedSVG, insertSvg } from './pdfConversion/pdfToSVG';
import { CacheContent } from './cache/cacheBase/cacheBase';
import { LatexRenderChild } from './task/latexRenderChild';
import { LatexCodeBlockDefinition } from './codeBlockTypes';

export async function waitFor(condFunc: () => boolean): Promise<void> {
	while (!condFunc()) {
		await new Promise<void>((resolve) => {
			window.setTimeout(resolve, 100);
		});
	}
}

export class LatexRenderer {
	plugin: LatexCompilerPlugin;
	vfs: VirtualFileSystem;
	compiler?: LatexCompiler;
	cache: CompilerCache;
	queue?: LatexRenderQueue;

	async onload(plugin: LatexCompilerPlugin) {
		this.plugin = plugin;
		this.vfs = new VirtualFileSystem(plugin);
		this.cache = new CompilerCache(this.plugin);
		if (this.isNotIos()) {
			await this.loadCompiler();

			this.queue = new LatexRenderQueue((t) => this.processAndRenderLatexTask(t));
		}
	}

	switchCompiler(): Promise<void> {
		if (this.compiler === undefined) return this.loadCompiler();

		const isTex =
			this.compiler instanceof PdfTeXCompiler &&
			this.plugin.settings.compiler === CompilerType.PdfTeX;

		const isXeTeX =
			this.compiler instanceof PdfXeTeXCompiler &&
			this.plugin.settings.compiler === CompilerType.XeTeX;

		if (isTex || isXeTeX) return Promise.resolve();

		this.compiler.closeWorkers();
		this.compiler = undefined;

		return this.loadCompiler();
	}

	private async loadCompiler() {
		if (this.plugin.settings.compiler === CompilerType.PdfTeX) {
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
	async codeBlockProcessor(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		definition: LatexCodeBlockDefinition,
	) {
		el.classList.add(
			'latex-compiler-render',
			`latex-compiler-overflow-${this.plugin.settings.overflowStrategy}`,
		);

		const rawHash = hashLatexContent(source);
		const createResult = await LatexTask.createAsync(this.plugin, definition, source, el, ctx);

		if (createResult.isError) {
			const errorMessage = createResult.result instanceof Error
				? createResult.result.message
				: String(createResult.result);

			const child = new LatexRenderChild(el);
			ctx.addChild(child);
			this.displayError(
				child,
				`Error creating task: ${errorMessage}`,
				ctx.sourcePath,
				this.cache.resultFileCache.getFileStem(rawHash, []),
				false
			);
			return;
		}

		const task = createResult.result as LatexTask;

		try {
			// PDF file has already been cached
			// Could have a case where pdfCache has the key but the cached file has been deleted
			const wasRestoredFromCache = await this.restoreFromCache(task);
			if (wasRestoredFromCache) return;
		} catch (err) {
			console.error('Error restoring from cache:', err, task.getDebugInfo());
		}

		this.queue?.push(task);
	}

	/**
	 * Processes and renders the given LaTeX task.
	 *
	 * @param task The task to process and render.
	 * @returns `true` if the task was compiled and rendered; `false` if it was restored from cache or failed during processing.
	 */
	private async processAndRenderLatexTask(task: LatexTask): Promise<boolean> {
		if (await this.restoreFromCache(task)) {
			return false;
		}

		if (await this.shouldSkipStaleTask(task)) return false;

		if (!this.compiler?.isResponsive()) {
			console.error('Compiler is unresponsive. Aborting task:', task.getDebugInfo());
			this.displayErrorForTask(task, 'Compiler is unresponsive. Please restart the compiler.');
			return false;
		}

		const processError = await task.process();

		if (processError) {
			console.error('Error processing task:', processError, task.getDebugInfo());
			const errorMessage = processError instanceof Error ? processError.message : processError;
			this.displayErrorForTask(task, `Error processing task: ${errorMessage}`);
			return false;
		}

		console.log('Rendering task:', task.getDebugInfo());

		await this.renderLatexToElement(task);
		await this.reCheckQueue(); // only re-check the queue after a valide rendering
		return true;
	}

	private async shouldSkipStaleTask(task: LatexTask): Promise<boolean> {
		if (!task.isStillValid() || !task.hasSourceChangeTimeExceededMargin()) return false;
		if (await task.verifySource()) return false;

		if (this.hasNewerQueuedTask(task)) {
			console.warn('Skipping stale task because a newer task exists:', task.getDebugInfo());
			return true;
		}

		console.error('Source files changed and could not be resolved:', task.getDebugInfo());

		this.displayErrorForTask(
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

		const processError = await task.process();
		if (processError) {
			console.error('Error processing task:', processError, task.getDebugInfo());
			const errorMessage = processError instanceof Error ? processError.message : processError;
			return new CompileResult(undefined, CompileStatus.ProcessingError, errorMessage);
		}

		try {
			return await this.renderLatexToPDF(
				task.getProcessedContent(), 
				VfsCompileMode.compileAll
			);
		} catch (err) {
			const errorText = err instanceof LatexCompilationError ? err.latexLog : toErrorString(err);
			return new CompileResult(undefined, CompileStatus.CompileError, errorText);
		}
	}

	async detachedProcessAndRenderToResultFile(task: LatexTask) {
		const compileResult = await this.detachedProcessAndRender(task);
		if (compileResult.isStatus(CompileStatus.CompileError)) {
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
			if (await this.restoreFromCache(task)) {
				blockIdsToRemove.add(task.getBlockId());
			}
		}

		if (blockIdsToRemove.size === 0) return;

		this.queue.removeFromWaiting((task) => blockIdsToRemove.has(task.getBlockId()));
	}

	async onunload() {
		this.compiler?.closeWorkers();
	}

	private displayErrorForTask(
		task: LatexTask,
		err: string,
		parseErr: boolean = false
	): void {
		// there is nothing to display the error to, so we just return.
		if (!task.renderChild) return;
		this.displayError(task.renderChild, err, task.getStem(), task.sourcePath, parseErr);
	}

	private displayError(
		renderChild: LatexRenderChild,
		err: string,
		hash: string,
		sourcePath: string,
		parseErr: boolean
	): void {
		const el = renderChild.containerEl;
		el.innerHTML = '';
		let child: HTMLElement;

		if (parseErr) {
			const processedError: ProcessedLog = this.cache.getLog(hash) || parseLatexLog(err);
			child = createErrorDisplay(processedError);
		} else {
			child = errorDiv({ title: err });
		}

		child.setAttribute(LATEX_RENDER_ID_KEY, hash);
		el.appendChild(child);
		this.plugin.menuDecider.add(renderChild, sourcePath)
	}

	private async renderLatexToElement(task: LatexTask): Promise<void> {
		const { content, rawHash, sourcePath, dependencyPaths, stem, format } = task.getRenderData();

		try {
			const result = await this.renderLatexToPDF(content, VfsCompileMode.compileAll, {
				fetchPkgData: true,
				md5Hash: rawHash,
				dependencyPaths,
			});

			const resultFile = await this.createResultFile(result.pdf, stem, format);

			await this.renderResultFile(task, resultFile);

			await this.cache.resultFileCache.addFile(
				resultFile,
				rawHash,
				dependencyPaths,
				sourcePath,
				format
			);
		} catch (err) {
			const isCompilationError = err instanceof LatexCompilationError;
			const errorText = isCompilationError
				? err.latexLog
				: toErrorString(err);

			console.error('Error rendering LaTeX to element:', err);
			this.displayErrorForTask(task, errorText, isCompilationError);
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

		if (config.fetchPkgData) {
			await this.cache.fetchPackageCacheData();
		}

		if (!result.isStatus(CompileStatus.Success)) {
			throw new LatexCompilationError(result.log);
		}

		return result;
	}

	private async createResultFile(pdfData: Uint8Array, stem: string, format: ResultFileFormat): Promise<CacheContent> {
		if (format === 'pdf') return pdfData;

		const config = {
			invertColorsInDarkMode: this.plugin.settings.invertColorsInDarkMode,
			autoRemoveWhitespace: this.plugin.settings.autoRemoveWhitespace,
			stem,
		};

		return await pdfToOptimizedSVG(pdfData, config)
	}

	private async restoreFromCache(task: LatexTask) {
		const result = await this.cache.resultFileCache.getResultFileFromRawHash(
			task.rawHash,
			task.sourcePath,
			task.resultFormat,
			() => getCacheDependencyPaths(task, this.vfs, this.plugin),
		);
		if (result === undefined) return false;

		return this.renderResultFile(task, result.data);
	}

	private async renderResultFile(
		task: LatexTask,
		data: CacheContent,
	): Promise<boolean> {
		// using getStem here will work fine and we dont have to worry about it not being generated yet because we are only calling this function after a successful compilation/fetch from cache, which will always generate the stem before calling this function.
		const renderChild = task.renderChild, stem = task.getStem();
		//we successfully restored from cache, but the task has no renderer child to render to. 
		if (!renderChild) return true;

		if (task.resultFormat === 'svg') {
			if (typeof data !== 'string') {
				console.warn(`Expected SVG cache entry ${stem} to contain text data.`);
				return false;
			}

			insertSvg(data, renderChild, task.sourcePath, this.plugin);
			return true;
		}

		if (!(data instanceof Uint8Array)) {
			console.warn(
				`Expected PDF cache entry ${stem} to contain binary data.`,
			);
			return false;
		}

		await insertPdf(
			data,
			renderChild,
			stem,
			task.sourcePath,
			this.plugin,
		);

		return true;
	}

	isNotIos(): this is LatexRenderer & {
		queue: LatexRenderQueue;
		compiler: LatexCompiler;
	} {
		return !Platform.isIosApp;
	}
}

async function getCacheDependencyPaths(
	task: LatexTask,
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

class LatexCompilationError extends Error {
	constructor(public readonly latexLog: string) {
		super('LaTeX compilation failed');
		this.name = 'LatexCompilationError';
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