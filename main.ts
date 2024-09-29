import { Plugin, MarkdownView, MarkdownRenderer , PluginSettingTab, App, Setting, Modal,  Notice, Component } from 'obsidian';
import { controller } from './mathEngine.js';


export default class MathPlugin extends Plugin {

  async onload() {

    this.registerMarkdownCodeBlockProcessor('math-engine', (source, el, ctx) => {
      const rawSource = String.raw`${source}`;
      const expressions = rawSource.split('\n');
      let lastResult: string | null = null;  // Variable to store result of lines starting with '::'

      expressions.forEach((expression, index) => {
        const container = el.createEl('div', { cls: 'math-line-container' });

        // Add alternating row colors for distinction
        if (index % 2 === 0) {
          container.addClass('math-row-even');
        } else {
          container.addClass('math-row-odd');
        }

        // Check if the line starts with "::"
        if (expression.trim().startsWith('::')) {
          const actualExpression = expression.trim().slice(2).trim(); // Remove the "::" for evaluation
          const result = controller(actualExpression);  // Evaluate the expression

          if (typeof result === 'object' && !Array.isArray(result)) {
            lastResult = result.Solution;  // Store the solution for future lines
          } else {
            lastResult = null;  // Reset if result is not an object
          }
        }

        const inputDiv = container.createEl('div', { cls: 'math-input' });
        const resultDiv = container.createEl('div', { cls: 'math-result-separate' });
        const result = controller(expression);

        // Render input expression as LaTeX
        MarkdownRenderer.renderMarkdown(`$\{${expression.replace(/(?<!\\)(tan|sin|cos|binom|frac|asin|acos|atan|sqrt)/g, "\\$1")}\}$`, inputDiv, '', this);

        if (Array.isArray(result) && result.length > 0) {
          resultDiv.innerHTML = `<span class="error-text">Error: ${result[0]}</span>`;
        } else if (typeof result === 'object' && !Array.isArray(result)) {
          resultDiv.innerHTML = `<span class="math-result-text">${result.Solution}</span> <span class="math-result-icon">🛈</span> <span class="math-debug-icon">🐞</span>`;

          resultDiv.querySelector('.math-result-icon')?.addEventListener('click', () => {
            new InfoModal(this.app, result.info, result.SolutionInfo).open();
          });

          resultDiv.querySelector('.math-debug-icon')?.addEventListener('click', () => {
            new DebugModal(this.app, result.debugInfo).open();
          });
        } else {
          resultDiv.innerHTML = `<span class="error-text">Unexpected result format. Please check your input.</span>`;
        }

        // If the line does not start with "::", compare its result with the last stored result
        if (!expression.trim().startsWith('::') && lastResult !== null) {
          if (typeof result === 'object' && !Array.isArray(result) && result.Solution !== lastResult) {
            container.addClass('math-error-line');  // Add a class to color the line red
          }
        }

        container.appendChild(resultDiv);
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

// Custom Modal for debugging information
class DebugModal extends Modal {
  debugInfo: string;
  constructor(app: App, debugInfo: string) {
      super(app);
      this.debugInfo = debugInfo;
  }
  onOpen() {
      const { contentEl } = this;

      contentEl.addClass('custom-modal-style');
      // Render title
      contentEl.createEl('h2', { text: 'Debug Information', cls: 'modal-title' });

      // Debug information display
      const debugContent = contentEl.createEl('div', { cls: 'debug-info-container' });
      MarkdownRenderer.renderMarkdown(`\`\`\`js\n${this.debugInfo}\n\`\`\``, debugContent, '', new Component());

  }
  onClose() {
      const { contentEl } = this;
      contentEl.empty();
  }
}
