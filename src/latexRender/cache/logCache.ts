import LatexRender from 'src/main';
import { ProcessedLog } from '../logs/latex-log-parser';
import parseLatexLog from '../logs/HumanReadableLogs';
import { MarkdownView, Notice } from 'obsidian';
import { getSectionsFromMatching } from '../resolvers/findSection';
import { LatexTask } from '../task/latexTask';
import { getFileSectionsFromPath } from '../resolvers/sectionCache';
import { sectionToTaskSectionInfo } from '../resolvers/sectionUtils';
import { getDependencyHash } from './compilerCache';

export function getLogCacheKey(rawHash: string, deps: string[] | string): string {
	const depsHash = Array.isArray(deps)
		? getDependencyHash(deps)
		: deps;
	return `${rawHash}-${depsHash}`;
}

export default class LogCache {
	private plugin: LatexRender;
	/**
	 * A cache that maps a hash to a ProcessedLog. This is used to store logs for LaTeX compilations.
	 * key:
	 */
	private cache?: Map<string, ProcessedLog>;

	constructor(plugin: LatexRender) {
		this.plugin = plugin;
	}

	private getCache(): Map<string, ProcessedLog> | undefined {
		if (!this.plugin.settings.saveLogs) {
			this.cache = undefined;
			return undefined;
		}

		if (!this.cache) {
			this.cache = new Map();
		}

		return this.cache;
	}

	addLog(log: ProcessedLog | string, logCacheKey: string): void {
		const cache = this.getCache();
		if (!cache) return;
		if (typeof log === 'string') log = parseLatexLog(log);
		cache.set(logCacheKey, log);
	}

	getLog(logCacheKey: string): ProcessedLog | undefined {
		return this.getCache()?.get(logCacheKey);
	}

	hasLog(logCacheKey: string): boolean {
		return !!this.getCache()?.has(logCacheKey);
	}

	/**
	 *
	 */
	async forceGetLog(
		logCacheKey: string,
		config: { source: string; sourcePath: string },
	): Promise<ProcessedLog | undefined> {
		if (this.hasLog(logCacheKey)) return this.cache!.get(logCacheKey);

		let cause = '';
		if (!this.plugin.settings.saveLogs) {
			cause =
				'This may be because log saving is disabled in the settings.\n';
		}
		new Notice(
			'No logs were found for this SVG element.\n' +
				cause +
				'Re-rendering the SVG to generate logs. This may take a moment...',
		);
		const { source, sourcePath } = config;
		const { file, sections } = await getFileSectionsFromPath(sourcePath);
		const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		const fileText =
			editor?.getValue() ?? (await app.vault.cachedRead(file));
		const sectionsFromMatching = getSectionsFromMatching(
			sections,
			fileText,
			source,
		);
		if (!sectionsFromMatching)
			throw new Error('No section found for this source');
		const sectionInfos = sectionsFromMatching.map((secFromMatch) =>
			sectionToTaskSectionInfo(secFromMatch),
		);
		const task = LatexTask.fromSectionInfos(
			this.plugin,
			sourcePath,
			sectionInfos,
		);
		const result =
			await this.plugin.swiftlatexRender.detachedProcessAndRender(task);
		return parseLatexLog(result.log);
	}

	removeLog(log: ProcessedLog, logCacheKey: string): void {
		this.getCache()?.delete(logCacheKey);
	}
}
