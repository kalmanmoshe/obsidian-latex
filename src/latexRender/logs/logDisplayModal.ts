import { Modal } from 'obsidian';
import { ProcessedLog, File, ErrorLevel } from './latex-log-parser';

export class LogDisplayModal extends Modal {
	log: ProcessedLog;

	constructor(log: ProcessedLog) {
		super(app);
		this.log = log;
		this.modalEl.addClass('latex-compiler-log-modal');
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'LaTeX Log' });

		const tabs = [
			...([this.log.all].length > 0
				? [{ name: 'Errors', render: this.renderErrors.bind(this) }]
				: []),
			...(this.log.files.length > 0
				? [{ name: 'Files', render: this.renderFiles.bind(this) }]
				: []),
			...(this.log.raw?.trim()
				? [{ name: 'Raw', render: this.renderRaw.bind(this) }]
				: []),
		];

		const tabsContainer = contentEl.createDiv('latex-compiler-log-tabs');
		const buttonsContainer = tabsContainer.createDiv('latex-compiler-log-buttons');
		const sectionsContainer = tabsContainer.createDiv('latex-compiler-log-sections');
		const contentSections: Record<string, HTMLElement> = {};
		tabs.forEach(({ name, render }) => {
			const button = buttonsContainer.createEl('button', {
				text: name,
				cls: 'latex-compiler-log-tab-button',
			});
			const section = sectionsContainer.createDiv(
				'latex-compiler-log-tab-content',
			);
			section.style.display = 'none';
			contentSections[name] = section;

			button.onclick = () => {
				for (const sec of Object.values(contentSections))
					sec.style.display = 'none';
				for (const btn of Array.from(buttonsContainer.children))
					btn.removeClass('active');
				section.style.display = '';
				button.addClass('active');
			};
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
			const box = container.createDiv(
				'latex-compiler-log-error-box ' + `level-${err.level}`,
			);

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
			const wrapper = parent.createDiv(
				'latex-compiler-log-file-wrapper depth-' + depth,
			);

			if (file.files?.length) {
				const details = wrapper.createEl('details', {
					cls: 'latex-compiler-log-file-details',
				});
				details.createEl('summary', {
					text: file.path,
					cls: 'latex-compiler-log-file-summary',
				});
				file.files.forEach((child) =>
					renderTree(child, details, depth + 1),
				);
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

		const scrollContainer = wrapper.createDiv();
		scrollContainer.setAttribute(
			'style',
			'overflow-x: auto; overflow-y: auto; max-height: 500px;',
		);

		const rawPre = scrollContainer.createEl('pre');
		rawPre.textContent = this.log.raw;
		rawPre.setAttribute(
			'style',
			'margin: 0; white-space: pre; user-select: text;',
		);

		const copyButton = wrapper.createEl('button', { text: 'Copy' });
		copyButton.setAttribute('style', 'margin-top: 5px;');

		copyButton.addEventListener('click', () => {
			navigator.clipboard
				.writeText(this.log.raw)
				.then(() => {
					copyButton.textContent = 'Copied!';
					setTimeout(() => (copyButton.textContent = 'Copy'), 1500);
				})
				.catch(() => {
					copyButton.textContent = 'Failed';
					setTimeout(() => (copyButton.textContent = 'Copy'), 1500);
				});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
