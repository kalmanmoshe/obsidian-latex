import { Command, Modal, Notice, TFile } from 'obsidian';
import { LatexTask } from 'src/latexRender/task/latexTask';
import LatexCompilerPlugin from 'src/main';
import {
	CompileResult,
	CompileStatus,
} from 'src/latexRender/compiler/base/compilerBase/engine';
import {
	getLatexTaskSectionInfosFromFile,
	TaskSectionInformation,
} from 'src/latexRender/resolvers/taskSectionInformation';

export function getTestCommands(plugin: LatexCompilerPlugin): Command[] {
	return [
		createTestLatexCommand(plugin),
		createTestOnClipboard(),
		createCancelTestCommand(),
		createNewTestLatexCommand(plugin),
		createOpenLastTestResultCommand(),
	];
}

function createTestOnClipboard(): Command {
	return {
		id: 'test-clipboard',
		name: 'Test Clipboard (runs function on its content and writes back to clipboard)',
		callback: async () => {
			const clipboardText = await navigator.clipboard.readText();
			if (!clipboardText) {
				new Notice('Clipboard is empty or not accessible.');
				return;
			}
			try {
				//const result = cropSvgByPixels(clipboardText);
				// navigator.clipboard.writeText(result);
			} catch (err) {
				console.error('Error processing clipboard text:', err);
			}
		},
	};
}

function createTestLatexCommand(plugin: LatexCompilerPlugin): Command {
	return {
		id: 'test-latex-code-blocks',
		name: 'Test LaTeX Code Blocks (if the test is allrdy running, it will continue)',
		callback: () => CompileTest.startOrContinueTest(plugin),
	};
}

function createCancelTestCommand(): Command {
	return {
		id: 'cancel-latex-code-blocks-test',
		name: 'Cancel LaTeX Code Blocks Test',
		callback: () => CompileTest.cancelCurrentTest(),
	};
}

function createNewTestLatexCommand(plugin: LatexCompilerPlugin): Command {
	return {
		id: 'start-new-test-latex-code-blocks',
		name: 'Start new test LaTeX Code Blocks',
		callback: () => CompileTest.cancelAndStartNewTest(plugin),
	};
}

function createOpenLastTestResultCommand(): Command {
	return {
		id: 'open-last-test-result',
		name: 'Open Last Test Result',
		callback: () => CompileTest.openLastTestResult(),
	};
}

interface CompileTracker {
	stableSuccess: CompileAnalysisResult[];
	stableFailure: CompileAnalysisResult[];
	fixedErrors: CompileAnalysisResult[];
	newlyBroken: CompileAnalysisResult[];
	unknownSuccess: CompileAnalysisResult[];
	unknownFailure: CompileAnalysisResult[];
}

interface CompileAnalysisResult {
	compileResult: CompileResult;
	task: LatexTask;
	section: TaskSectionInformation;
}

class CompileTest {
	static plugin: LatexCompilerPlugin;
	static displayModal: TestResultModal;
	static tracker: CompileTracker;
	static sectionsByFile: {
		file: TFile;
		codeBlockSections: TaskSectionInformation[];
	}[] = [];

	static activeToken: string | null = null;
	static isRunning = false;
	static testStartTime: number;

	static hasCurrentTest() {
		return this.activeToken !== null;
	}

	static cancelCurrentTest() {
		this.activeToken = null;
		this.isRunning = false;

		if (this.displayModal) {
			this.displayModal.close();
		}

		new Notice('Current test was cancelled.');
	}

	static cancelAndStartNewTest(plugin: LatexCompilerPlugin) {
		if (this.hasCurrentTest()) {
			this.cancelCurrentTest();
		}

		this.startTest(plugin);
	}

	static openLastTestResult() {
		if (!this.hasCurrentTest()) {
			new Notice('No previous test result found.');
			return;
		}
		if (this.displayModal) {
			this.displayModal.open();
			new Notice('Showing previous test result. Cancel it to start a new one.');
		}
	}

	static startOrContinueTest(plugin: LatexCompilerPlugin) {
		if (this.hasCurrentTest()) {
			this.displayModal.open();

			new Notice(
				this.isRunning
					? 'Test is already running. Continuing with the current test.'
					: 'Showing previous test result. Cancel it to start a new one.',
			);

			return;
		}

		this.startTest(plugin);
	}

	private static async startTest(plugin: LatexCompilerPlugin) {
		this.plugin = plugin;
		this.activeToken = crypto.randomUUID();
		this.isRunning = true;

		const token = this.activeToken;
		this.testStartTime = Date.now();

		this.displayModal = new TestResultModal();
		this.displayModal.open();
		this.displayModal.setTestStartTime(this.testStartTime);
		this.tracker = {
			stableSuccess: [],
			stableFailure: [],
			fixedErrors: [],
			newlyBroken: [],
			unknownSuccess: [],
			unknownFailure: [],
		};

		const files = app.vault.getFiles().filter((f) => f.extension === 'md');
		this.sectionsByFile = await Promise.all(
			files.map(async (file) => ({
				file,
				codeBlockSections: await getLatexTaskSectionInfosFromFile(
					file as TFile,
				),
			})),
		);

		const totalSections = this.sectionsByFile.reduce(
			(sum, item) => sum + item.codeBlockSections.length,
			0,
		);

		this.displayModal.setTotalSections(totalSections);

		this.analyzeLatexCodeBlocks(token);
	}

	static async analyzeLatexCodeBlocks(token: string) {
		for (const { file, codeBlockSections } of this.sectionsByFile) {
			for (const section of codeBlockSections) {
				if (this.activeToken !== token) return;

				this.displayModal.setCurrent(file.path, section);

				const start = performance.now();
				const result = await this.analyzeSection(file, section);

				this.displayModal.recordResult(result.compileResult.status);

				const duration = performance.now() - start;

				const index =
					result.compileResult.status === CompileStatus.Success ? 0 : 1;

				const trackerIndex = result.task.getCacheStatusAsNum() + index;

				const keys = Object.keys(this.tracker) as (keyof CompileTracker)[];
				this.tracker[keys[trackerIndex]].push(result);

				this.displayModal.addResult(trackerIndex, result, duration);
			}
		}

		if (this.activeToken === token) {
			this.displayModal.finish();
			this.isRunning = false;

			// Do NOT clear activeToken here.
			// The current test stays alive until cancelCurrentTest().
		}
	}

	static async analyzeSection(
		file: TFile,
		section: TaskSectionInformation,
	): Promise<CompileAnalysisResult> {
		const task = LatexTask.fromSectionInfos(this.plugin, file.path, [
			section,
		]);
		const compileResult =
			await this.plugin.latexRenderer.detachedProcessAndRender(task);
		return { compileResult, task, section };
	}
}

class TestResultModal extends Modal {
	currentFileEl: HTMLElement;
	currentSectionEl: HTMLElement;
	resultsContainer: HTMLElement;
	private resultSections = new Map<string, HTMLElement>();
	testStartTime = 0;

	elapsedTimerId: number | null = null;
	totalDuration = 0;
	averageEl: HTMLElement;
	elapsedEl: HTMLElement;

	statsEl: HTMLElement;
	totalSections = 0;
	processed = 0;
	success = 0;
	failure = 0;

	constructor() {
		super(app);
		this.set();
	}

	private set() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', {
			text: 'Running LaTeX Compilation Tests...',
		});
		this.elapsedEl = contentEl.createEl('p', {
			text: 'Elapsed: 0.0s',
		});

		this.averageEl = contentEl.createEl('p', {
			text: 'Average per block: 0.0ms',
		});
		this.statsEl = contentEl.createEl('p', {
			text: 'Processed: 0/0 | Success: 0 (0%) | Failure: 0 (0%)',
		});

		this.currentFileEl = contentEl.createEl('p', {
			text: 'Current File: ...',
		});
		this.currentSectionEl = contentEl.createEl('p', {
			text: 'Current Section: ...',
		});
		this.resultsContainer = contentEl.createDiv();

		contentEl.createEl('button', {
			text: 'Save Report to Vault',
			cls: 'mod-cta',
		}).onclick = () => this.saveReport();
	}

	setTestStartTime(startTime: number) {
		this.testStartTime = startTime;

		const dateStr = new Date(startTime).toLocaleString();
		this.contentEl.createEl('p', { text: `Test started: ${dateStr}` });

		if (this.elapsedTimerId !== null) {
			window.clearInterval(this.elapsedTimerId);
		}

		this.elapsedTimerId = window.setInterval(() => {
			const elapsed = (Date.now() - this.testStartTime) / 1000;
			this.elapsedEl.setText(`Elapsed: ${elapsed.toFixed(1)}s`);
		}, 100);
	}

	setCurrent(filePath: string, section: TaskSectionInformation) {
		this.currentFileEl.setText(`File: ${filePath}`);
		this.currentSectionEl.setText(`Section line: ${section.lineStart}`);
	}

	private getOrCreateSection(label: string): HTMLElement {
		let section = this.resultSections.get(label);

		if (section) return section;

		const wrapper = this.resultsContainer.createDiv({
			cls: 'compile-test-section',
		});

		wrapper.createEl('h4', {
			text: `${label}`,
		});

		section = wrapper.createDiv();
		this.resultSections.set(label, section);

		return section;
	}

	addResult(
		labelIndex: number,
		result: CompileAnalysisResult,
		duration: number,
	) {
		this.totalDuration += duration;
		const completedBlocks = this.processed + 1;

		const average =
			this.processed === 0 ? 0 : this.totalDuration / completedBlocks;

		this.averageEl.setText(`Average per block: ${average.toFixed(1)}ms`);

		const label = Object.keys(CompileTest.tracker)[labelIndex];
		const sectionLine = result.section.lineStart;

		const container = this.getOrCreateSection(label);

		const entry = container.createDiv({
			cls: 'compile-test-result',
		});

		entry.createEl('p', {
			text: `${result.task.sourcePath} (Line ${sectionLine}) — ${duration.toFixed(1)}ms`,
		});

		entry.createEl('a', {
			text: 'Go to code block ↗',
			href: `obsidian://open?path=${encodeURIComponent(
				result.task.sourcePath,
			)}#^${sectionLine}`,
			cls: 'external-link',
		});
	}

	finish() {
		if (this.elapsedTimerId !== null) {
			window.clearInterval(this.elapsedTimerId);
			this.elapsedTimerId = null;
		}

		const totalTime = ((Date.now() - this.testStartTime) / 1000).toFixed(1);

		this.elapsedEl.setText(`Elapsed: ${totalTime}s`);

		this.currentFileEl.setText('✔️ All files processed.');
		this.currentSectionEl.setText('');

		this.contentEl.createEl('button', {
			text: 'Save Report to Vault',
			cls: 'mod-cta',
		}).onclick = () => this.saveReport();
	}

	setTotalSections(total: number) {
		this.totalSections = total;
		this.updateStats();
	}

	recordResult(status: CompileStatus) {
		this.processed++;

		if (status === CompileStatus.Success) {
			this.success++;
		} else {
			this.failure++;
		}

		this.updateStats();
	}

	private updateStats() {
		const successPercent =
			this.processed === 0 ? 0 : (this.success / this.processed) * 100;

		const failurePercent =
			this.processed === 0 ? 0 : (this.failure / this.processed) * 100;

		this.statsEl.setText(
			`Processed: ${this.processed}/${this.totalSections} | ` +
			`Success: ${this.success} (${successPercent.toFixed(1)}%) | ` +
			`Failure: ${this.failure} (${failurePercent.toFixed(1)}%)`,
		);
	}

	async saveReport() {
		const tracker = CompileTest.tracker;
		let idx = 0;
		if (app.vault.getAbstractFileByPath('compile-report.md') !== null) {
			idx++;
			while (
				app.vault.getAbstractFileByPath(
					'compile-report' + idx + '.md',
				) !== null
			) { }
		}

		const path =
			idx === 0 ? 'compile-report.md' : 'compile-report-' + idx + '.md';

		const report = this.generateMarkdownReport(tracker);
		await app.vault.create(path, report);
		new Notice(`Report saved to ${path}`);
	}

	generateMarkdownReport(tracker: CompileTracker): string {
		const date = new Date(this.testStartTime).toLocaleString();
		const blocks = Object.entries(tracker).map(([label, results]) => {
			const items = (results as CompileAnalysisResult[])
				.map((r: CompileAnalysisResult) => {
					const line = r.section.lineStart;
					const link = `obsidian://open?path=${encodeURIComponent(r.task.sourcePath)}#^${line}`;
					return `- [${r.task.sourcePath}](<${link}>) (Line ${line})`;
				})
				.join('\n');
			return `### ${label} (${results.length})\n${items}`;
		});

		return `# Compile Report\n\n**Started:** ${date}\n\n${blocks.join('\n\n')}`;
	}
}
