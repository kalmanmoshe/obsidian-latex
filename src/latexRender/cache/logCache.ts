import LatexCompilerPlugin from 'src/main';
import { ProcessedLog } from '../logs/latexLogParser';
import parseLatexLog from '../logs/humanReadableLogs';
import { Notice } from 'obsidian';
import { findMatchingCodeBlockSections } from '../resolvers/findSection';
import { LatexTask } from '../task/latexTask';
import { sectionToTaskSectionInfo } from '../resolvers/sectionUtils';
import { UserFacingPluginError } from '../errors/pluginErrors';
import { LatexRenderCompilationSession } from '../latexRenderCompilationSession';

export interface CachedLogInfo {
	log: ProcessedLog;
	userFacingErrors: UserFacingPluginError[];
	virtualToSource?: Map<string, string>;
}

export default class LogCache {
	private plugin: LatexCompilerPlugin;
	/**
	 * A cache that maps a hash to a ProcessedLog. This is used to store logs for LaTeX compilations.
	 * key:
	 */
	private cache?: Map<string, CachedLogInfo>;

	constructor(plugin: LatexCompilerPlugin) {
		this.plugin = plugin;
	}

	private getCache(): Map<string, CachedLogInfo> | undefined {
		if (!this.plugin.settings.saveLogs) {
			this.cache = undefined;
			return undefined;
		}

		if (!this.cache) {
			this.cache = new Map();
		}

		return this.cache;
	}

	addLog(logCacheKey: string, log: ProcessedLog | string, session: LatexRenderCompilationSession): void {
		const cache = this.getCache();
		if (!cache) return;
		if (typeof log === 'string') log = parseLatexLog(log);
		cache.set(
			logCacheKey, 
			{ 
				log, 
				userFacingErrors: session.userFacingErrors,
				virtualToSource: session.getVirtualPathMappings(),
			}
		);
	}

	getLog(logCacheKey: string): CachedLogInfo | undefined {
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
	): Promise<CachedLogInfo | undefined> {
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

		const sectionsFromMatching = await findMatchingCodeBlockSections(config.sourcePath, config.source, this.plugin.app);

		if (!sectionsFromMatching)
			throw new Error('No section found for this source');
		const sectionInfos = sectionsFromMatching.map((secFromMatch) =>
			sectionToTaskSectionInfo(secFromMatch),
		);
		const task = LatexTask.fromSectionInfos(
			this.plugin,
			config.sourcePath,
			sectionInfos,
		);
		const renderResult = await this.plugin.latexRenderer.detachedProcessAndRender(task);
		return {
			log: parseLatexLog(renderResult.result.log),
			userFacingErrors: renderResult.compilationSession?.userFacingErrors || [],
			virtualToSource: renderResult.compilationSession?.getVirtualPathMappings(),
		}
	}

	removeLog(logCacheKey: string): void {
		this.getCache()?.delete(logCacheKey);
	}
}
			