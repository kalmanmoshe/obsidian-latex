import { App, Modal } from 'obsidian';
import { ProcessedLog, File, ErrorLevel } from './latex-log-parser';

type LogTab = {
	name: string;
	render: (container: HTMLElement) => void;
};

export class LogDisplayModal extends Modal {
	log: ProcessedLog;

	constructor(log: ProcessedLog, app: App) {
		super(app);
		this.log = log;
		this.modalEl.addClass('latex-compiler-log-modal');
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'LaTeX log' });

		const tabs: LogTab[] = [];

		if (this.log.all.length > 0) {
			tabs.push({
				name: 'Errors',
				render: (container) => this.renderErrors(container),
			});
		}

		if (this.log.files.length > 0) {
			tabs.push({
				name: 'Files',
				render: (container) => this.renderFiles(container),
			});
		}

		if (this.log.raw?.trim()) {
			tabs.push({
				name: 'Raw',
				render: (container) => this.renderRaw(container),
			});
		}

		const tabsContainer = contentEl.createDiv('latex-compiler-log-tabs');
		const buttonsContainer = tabsContainer.createDiv('latex-compiler-log-buttons');
		const sectionsContainer = tabsContainer.createDiv('latex-compiler-log-sections');
		const contentSections = new Map<string, HTMLElement>();

		tabs.forEach(({ name, render }) => {
			const button = buttonsContainer.createEl('button', {
				text: name,
				cls: 'latex-compiler-log-tab-button',
			});
			const section = sectionsContainer.createDiv('latex-compiler-log-tab-content');
			section.addClass('is-hidden');

			contentSections.set(name, section);

			button.addEventListener('click', () => {
				for (const currentSection of contentSections.values()) {
					currentSection.addClass('is-hidden');
				}

				for (const child of Array.from(buttonsContainer.children)) {
					if (child.instanceOf(HTMLElement)) {
						child.removeClass('active');
					}
				}

				section.removeClass('is-hidden');
				button.addClass('active');
			});

			render(section);
		});

		(buttonsContainer.firstChild as HTMLElement)?.click();
		contentEl.appendChild(tabsContainer);
	}

	private renderErrors(container: HTMLElement) {
		const allErrors = this.log.all;
		allErrors.sort((a, b) => {
			const severity = {
				[ErrorLevel.Error]: 0,
				[ErrorLevel.Warning]: 1,
				[ErrorLevel.Typesetting]: 2,
			};
			return severity[a.level] - severity[b.level];
		});
		allErrors.forEach((err) => {
			const box = container.createDiv('latex-compiler-log-error-box ' + `level-${err.level}`);

			box.createDiv({
				text: `${err.level.toUpperCase()}: ${err.message}`,
				cls: 'latex-compiler-log-error-header',
			});

			if (err.file || err.line !== null) {
				box.createDiv({
					text: `↳ ${err.file ?? 'unknown file'}:${err.line ?? '?'}`,
					cls: 'latex-compiler-log-error-location',
				});
			}

			if (err.content) {
				box.createEl('pre', {
					text: err.content,
					cls: 'latex-compiler-log-error-snippet',
				});
			}

			if (err.cause) {
				box.createDiv({
					text: `Cause: ${err.cause}`,
					cls: 'latex-compiler-log-error-cause',
				});
			}
		});
	}

	private renderFiles(container: HTMLElement) {
		const renderTree = (file: File, parent: HTMLElement, depth = 0) => {
			const wrapper = parent.createDiv('latex-compiler-log-file-wrapper depth-' + depth);

			if (file.files?.length) {
				const details = wrapper.createEl('details', {
					cls: 'latex-compiler-log-file-details',
				});
				details.createEl('summary', {
					text: file.path,
					cls: 'latex-compiler-log-file-summary',
				});
				file.files.forEach((child) => renderTree(child, details, depth + 1));
			} else {
				// Just a line, no <details>
				wrapper.createEl('div', {
					text: file.path,
					cls: 'latex-compiler-log-file-line',
				});
			}
		};

		this.log.files.forEach((file) => renderTree(file, container));
	}

	private renderRaw(container: HTMLElement) {
		const wrapper = container.createDiv();

		const scrollContainer = wrapper.createDiv(
			'latex-compiler-log-raw-scroll',
		);

		scrollContainer.createEl('pre', {
			text: this.log.raw,
			cls: 'latex-compiler-log-raw-content',
		});

		const copyButton = wrapper.createEl('button', {
			text: 'Copy',
			cls: 'latex-compiler-log-copy-button',
		});

		copyButton.addEventListener('click', () => {
			navigator.clipboard
				.writeText(this.log.raw)
				.then(() => {
					copyButton.textContent = 'Copied!';
					window.setTimeout(() => (copyButton.textContent = 'Copy'), 1500);
				})
				.catch(() => {
					copyButton.textContent = 'Failed';
					window.setTimeout(() => (copyButton.textContent = 'Copy'), 1500);
				});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
