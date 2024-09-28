import { Plugin, MarkdownView, MarkdownRenderer , PluginSettingTab, App, Setting, Modal,  Notice, Component } from 'obsidian';
import { controller } from './mathEngine.js';


export default class MathPlugin extends Plugin {

  async onload() {

    this.registerMarkdownCodeBlockProcessor('math-engine', (source, el, ctx) => {
		const rawSource = String.raw`${source}`;
		const expressions = rawSource.split('\n');

      	expressions.forEach((expression, index) => {
        const container = el.createEl('div', { cls: 'math-line-container' });

        // Add alternating row colors for distinction
        if (index % 2 === 0) {
          container.addClass('math-row-even');
        } else {
          container.addClass('math-row-odd');
        }

        // Display the input (left side)
		const inputDiv = container.createEl('div', { cls: 'math-input' });
		const latexExpression = String.raw`${expression}`;
		const resultDiv = container.createEl('div', { cls: 'math-result-separate' });
		const result = controller(expression);
		if (expression.length !== 0) {

			MarkdownRenderer.renderMarkdown(`$\{${latexExpression.replace(/(?<!\\)(tan|sin|cos|binom|frac|asin|acos|atan|sqrt)/g, "\\$1")}\}$`,inputDiv,'',this);
			
			if (Array.isArray(result) && result.length > 0) {
				resultDiv.innerHTML = `<span class="error-text">Error: ${result[0]}</span>`;
		} else if (typeof result === 'object' && !Array.isArray(result)) {

			resultDiv.innerHTML = `<span class="math-result-text">${result.Solution}</span> <span class="math-result-icon">🛈</span>`;

			resultDiv.querySelector('.math-result-icon')?.addEventListener('click', () => {
			new InfoModal(this.app, result.info, result.SolutionInfo).open();
			});
		} else {
			resultDiv.innerHTML = `<span class="error-text">Unexpected result format. Please check your input.</span>`;
		}
		}
      });
    });

  }
  onunload() {}
}

// Custom Modal for extra information
class InfoModal extends Modal {
    result: string;
    SolutionInfo: string;
    constructor(app: App, result: string, SolutionInfo: string) {
        super(app);
        this.result = result;
        this.SolutionInfo = SolutionInfo;
    }
    onOpen() {
        const { contentEl } = this;

        contentEl.addClass('custom-modal-style');
        // Render title
        contentEl.createEl('h2', { text: 'Result Details', cls: 'modal-title' });

        // Create a flex container for two columns
        const columnContainer = contentEl.createEl('div', { cls: 'column-container' });

        // Left column (e.g., results)
        const leftColumn = columnContainer.createEl('div', { cls: 'left-column' });
        leftColumn.innerHTML = `${this.result.replace(/\n/g, '<br>')}`;

        // Right column (e.g., actions or additional info)
        const rightColumn = columnContainer.createEl('div', { cls: 'right-column' });
        rightColumn.innerHTML = `${this.SolutionInfo.replace(/\n/g, '<br>')}`;

        // Button container
        const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });
        const actionButton = buttonContainer.createEl('button', { text: 'Copy Details', cls: 'modal-action-button' });
        actionButton.addEventListener('click', () => {
            navigator.clipboard.writeText(this.result);
            new Notice('Details copied to clipboard!');
        });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}