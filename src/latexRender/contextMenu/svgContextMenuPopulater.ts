import { Menu, Notice, TFile, Platform } from 'obsidian';
import LatexRender from 'src/main';
import { LogDisplayModal } from '../logs/logDisplayModal';
import { LatexTask, ProcessableLatexTask } from '../task/latexTask';
import { ErrorClasses } from '../logs/HumanReadableLogs';
import {
	findTaskSectionInfoFromHashInFile,
	TaskSectionInformation,
} from '../resolvers/taskSectionInformation';
import { SVG_ID_KEY } from 'src/svg/nodes';
import { codeBlockToContent } from 'obsidian-dev-utils';
import ResultFileCache from '../cache/resultFileCache';

async function revealFileWithFocus(path: string) {
	if (!Platform.isDesktopApp) {
		new Notice('Reveal in file explorer is only available on desktop.');
		return;
	}

	const req = (globalThis as any).require;

	const { exec } = req("child_process");

	if (Platform.isWin) {
		const winPath = path.replace(/\//g, '\\');
		exec(`start "" explorer.exe /select,"${winPath}"`);
	} else if (Platform.isMacOS) {
		const script = `
			tell application "Finder"
				reveal POSIX file "${path}"
				activate
			end tell
		`;
		exec(`osascript -e '${script.replace(/\n/g, '')}'`);
	} else {
		const { shell } = await import('electron');
		shell.showItemInFolder(path);
	}
}

/**add:
 * - show logs (soch as \print{} \message{"hello world"} and more)
 * - properties (such as size, dependencies, hash, date created, )
 */
export class SvgContextMenuPopulater {
	plugin: LatexRender;
	menu: Menu;
	svgEl?: SVGElement;
	/**
	 * the container element that holds the SVG/err container.
	 */
	containerEl?: HTMLElement;
	/**
	 * The parent el of the code block has class block-language-latexsvg
	 */
	blockEl: HTMLElement;
	sourcePath: string;
	isError: boolean;
	content: string;
	private sourceAssignmentPromise: Promise<boolean> | null = null;
	stem: string;
	rawHash: string;
	depsHash: string;
	private resultFileCache: ResultFileCache;

	constructor(
		plugin: LatexRender,
		menu: Menu,
		trigeringElement: HTMLElement,
		sourcePath: string,
	) {
		this.plugin = plugin;
		this.menu = menu;
		this.resultFileCache =
			this.plugin.swiftlatexRender.cache.resultFileCache;
		this.assignElements(trigeringElement);
		this.sourcePath = sourcePath;
		this.addDisplayItems();
	}

	private assignElements(triggeringElement: HTMLElement) {
		this.blockEl = findSvgContainer(triggeringElement);

		this.svgEl = this.findSvg();
		this.containerEl = this.findErrorContainer();
		this.isError = !this.svgEl;

		this.assignStem();
	}

	private findSvg(): SVGElement | undefined {
		return Array.from(this.blockEl.children).find(
			(child): child is SVGElement => child instanceof SVGElement,
		);
	}

	private findErrorContainer(): HTMLElement | undefined {
		return Array.from(this.blockEl.children).find(
			(child): child is HTMLElement =>
				child instanceof HTMLElement &&
				child.classList.contains(ErrorClasses.Container),
		);
	}

	private assignStem() {
		const stem =
			this.svgEl?.getAttribute(SVG_ID_KEY) ??
			this.containerEl?.getAttribute(SVG_ID_KEY);

		if (!stem) {
			console.error(
				'No stem found for SVG/error container',
				this.svgEl,
				this.containerEl,
			);
			throw new Error('No stem found for SVG/error container');
		}

		this.stem = stem;

		({ rawHash: this.rawHash, depsHash: this.depsHash } =
			this.resultFileCache.stemToHashes(this.stem));
	}

	private addDisplayItems() {
		this.addItem(
			'Copy SVG',
			'copy',
			async () => {
				const svg = this.svgEl;
				if (svg) {
					const svgString = new XMLSerializer().serializeToString(
						svg,
					);
					await navigator.clipboard.writeText(svgString);
				}
			},
			{ hiddenOnError: true }
		);

		this.addItem(
			'properties',
			'settings',
			async () => {
				console.log('properties');
			},
			{ hiddenOnError: true }
		);

		this.addItem(
			'remove & re-render',
			'trash',
			async () => await this.removeAndReRender()
		);

		this.addItem(
			'Show logs',
			'info',
			async () => {
				this.showLogs();
			}
		);

		this.addItem(
			'Reveal in file explorer',
			'folder',
			async () => {
				this.revealFileInExplorer();
			},
			{ hiddenOnError: true }
		);

		this.addDebugDisplayItems();
	}

	private addDebugDisplayItems() {
		this.addItem(
			'Copy parsed source',
			'copy',
			async () => {
				const source = (await this.getProcessedTask())?.getProcessedContent();
				if (!source) return;
				await navigator.clipboard.writeText(source);
			}
		);

		this.addItem(
			'Copy raw SVG',
			'copy',
			async () => {
				const rawSvg = await this.getRawSvg();
				if (!rawSvg) {
					new Notice('Failed to get raw SVG content.');
					return;
				}
				await navigator.clipboard.writeText(rawSvg);
			},
			{ hiddenOnError: true }
		);
	}

	private addItem(
		title: string,
		icon: string,
		onClick: () => void | Promise<void>,
		options?: { hiddenOnError?: boolean },
	) {
		if (options?.hiddenOnError && this.isError) return;

		this.menu.addItem((item) => {
			item.setTitle(title);
			item.setIcon(icon);
			item.onClick(onClick);
		});
	}

	private revealFileInExplorer() {
		if (this.isError) {
			throw new Error(
				"Can't reveal file in explorer, this is an error container.",
			);
		}
		try {
			if (!this.resultFileCache.isPhysicalCatch()) {
				new Notice(
					"Result file cache is not physical, can't open file in explorer.",
				);
				return;
			}
			const filePath = this.resultFileCache.getAbsolutePathFromStem(
				this.stem,
			);
			revealFileWithFocus(filePath);
		} catch (err) {
			console.error('Failed to open file in explorer:', err);
		}
	}

	private async showLogs() {
		this.assignLatexContent();
		let log = this.plugin.swiftlatexRender.cache.getLog(this.stem);
		if (!log) {
			await this.assignLatexContent();
			log = await this.plugin.swiftlatexRender.cache.forceGetLog(
				this.stem,
				{ source: this.content, sourcePath: this.sourcePath },
			);
		}
		const modal = new LogDisplayModal(log);
		modal.open();
	}

	assignLatexContent(): Promise<boolean> {
		if (this.content !== undefined) return Promise.resolve(true);
		if (!this.sourceAssignmentPromise) {
			this.sourceAssignmentPromise = (async () => {
				const info = await this.getSectionInfo();
				this.content = codeBlockToContent(info.codeBlock);
				return true;
			})();
		}
		return this.sourceAssignmentPromise;
	}

	private async getFile() {
		console.log('Getting file for source path:', this.sourcePath);
		const file = app.vault.getAbstractFileByPath(this.sourcePath);
		if (!file) throw new Error('File not found');
		if (!(file instanceof TFile)) throw new Error('File is not a TFile');
		return file;
	}

	async getTask(): Promise<LatexTask> {
		await this.assignLatexContent();
		const file = await this.getFile();
		const sectionInfos = await findTaskSectionInfoFromHashInFile(
			file,
			this.rawHash,
		);
		if (!sectionInfos)
			throw new Error(
				'No section info found for hash: ' +
				this.rawHash +
				' in file: ' +
				file.path,
			);
		const task = LatexTask.fromSectionInfos(
			this.plugin,
			this.sourcePath,
			sectionInfos,
			this.blockEl,
		);
		return task;
	}

	async getSectionInfo(): Promise<TaskSectionInformation> {
		const file = await this.getFile();
		const sectionInfos = await findTaskSectionInfoFromHashInFile(
			file,
			this.rawHash,
		);
		if (!sectionInfos)
			throw new Error(
				'No section info found for hash: ' +
				this.rawHash +
				' in file: ' +
				file.path,
			);
		const sectionInfo = sectionInfos[0];
		this.content = codeBlockToContent(sectionInfo.codeBlock);
		return sectionInfo;
	}

	/**
	 * Cleans the block element by removing all its children.
	 */
	private cleanBlockEl() {
		while (this.blockEl.firstChild) {
			this.blockEl.removeChild(this.blockEl.firstChild);
		}
	}
	/**
	 * Can't be saved as contains dynamic content.
	 */
	private async removeAndReRender() {
		if (!this.isError) {
			const success = await this.resultFileCache.removeResultFileFromCache(
				this.stem,
			);
			if (!success) {
				console.error(
					'Failed to remove result file from cache:',
					this.stem,
				);
			}
		}
		this.cleanBlockEl();
		const task = await this.getTask();
		this.plugin.swiftlatexRender.queue.push(task);
		new Notice('SVG removed from cache. Re-rendering...');
	}

	private async getProcessedTask(): Promise<ProcessableLatexTask | undefined> {
		const task = await this.getTask();
		if (task.isProcess()) {
			const result = await task.process();
			if (result) {
				new Notice('Failed to process task');
				console.error('Failed to process task:', result);
				return undefined;
			}
		} else {
			new Notice('Task is not processable');
			console.error('Task is not processable:', task);
			return undefined;
		}
		return task;
	}

	private async getRawSvg() {
		const task = await this.getTask();
		const result =
			await this.plugin.swiftlatexRender.detachedProcessAndRenderToResultFile(
				task,
			);
		return result;
	}
}

function findSvgContainer(el: HTMLElement): HTMLElement {
	const container = climbToSvgContainer(el) ?? findChildSvgContainer(el);

	if (!container) {
		throw new Error('No SVG container found');
	}

	return container;
}

function climbToSvgContainer(el: HTMLElement): HTMLElement | undefined {
	let current: HTMLElement | null = el;

	while (current) {
		if (isSvgContainer(current)) {
			return current;
		}

		const childContainer = findChildSvgContainer(current);
		if (childContainer) {
			return childContainer;
		}

		current = current.parentElement;
	}

	return undefined;
}

function findChildSvgContainer(el: HTMLElement): HTMLElement | undefined {
	return Array.from(el.children).find(
		(child): child is HTMLElement =>
			child instanceof HTMLElement && isSvgContainer(child),
	);
}

function isSvgContainer(el: HTMLElement) {
	return el.classList.contains('block-language-latexsvg');
}