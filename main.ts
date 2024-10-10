import { Plugin, MarkdownView, MarkdownRenderer , PluginSettingTab, App, Setting, Modal,  Notice, Component } from 'obsidian';
import { controller } from './mathEngine.js';


export default class MathPlugin extends Plugin {

  async onload() {

    this.registerMarkdownCodeBlockProcessor('math-engine', (source, el, ctx) => {
      const rawSource = String.raw`${source}`;
      let expressions = rawSource.split('\n').filter(line => line.trim() !== '');
      if (expressions.length === 0) {
        expressions = ['0']; 
      }
      let lastResult: string | null = null;  // Variable to store result of lines starting with '::'
      
      expressions.forEach((expression, index) => {
      const container = el.createEl('div', { cls: 'math-line-container' });

        // Add alternating row colors for distinction
        if (index % 2 === 0) {
          container.addClass('math-row-even');
        } else {
          container.addClass('math-row-odd');
        }

        if (expression.trim().startsWith('::')) {
          const actualExpression = expression.trim().slice(2).trim(); 
          const result = controller(actualExpression);  // Evaluate the expression

          if (typeof result === 'object' && !Array.isArray(result)) {
            lastResult = result.solution;  // Store the solution for future lines
          } else {
            lastResult = null;  // Reset if result is not an object
          }
        }
        
        const inputDiv = container.createEl('div', { cls: 'math-input' });
        const resultDiv = container.createEl('div', { cls: 'math-result' });
        const result = controller(expression);
        
        // Render input expression as LaTeX
        MarkdownRenderer.renderMarkdown(`$\{${expression.replace(/(?<!\\|[a-z])(tan|sin|cos|binom|frac|asin|acos|atan|sqrt)/g, "\\\\$1")}\}$`, inputDiv, '', this);

        if (Array.isArray(result) && result) {
          resultDiv.innerHTML = `<span class="error-text">${result[0]}</span>`;
        } else if (typeof result === 'object' && !Array.isArray(result)) {
          resultDiv.innerHTML = `
          <div class="math-result-text">${result.solution}</div>
          <div class="math-icons">
            <span class="math-info-icon">🛈</span>
            <span class="math-debug-icon">🐞</span>
          </div>`;
          resultDiv.querySelector('.math-info-icon')?.addEventListener('click', () => {
            new InfoModal(this.app, result.info, result.solutionInfo).open();
          });

          resultDiv.querySelector('.math-debug-icon')?.addEventListener('click', () => {
            new DebugModal(this.app, result.debugInfo).open();
          });
        } else {
          resultDiv.innerHTML = `<span class="error-text">Unexpected result format. Please check your input.</span>`;
        }

        // If the line does not start with "::", compare its result with the last stored result
        if (!expression.trim().startsWith('::') && lastResult !== null) {
          if (typeof result === 'object' && !Array.isArray(result) && result.solution !== lastResult) {
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
      contentEl.addClass('info-modal-style');
      contentEl.createEl('h2', { text: 'Result Details', cls: 'info-modal-title' });
  
      const columnContainer = contentEl.createEl('div', { cls: 'info-modal-main-container' });
  
      // Split the result and solution into lines
      const resultLines = this.result.split('\n');
      const solutionLines = this.SolutionInfo.split('\n');
      resultLines.pop()
      resultLines.forEach((line, index) => {
          const lineContainer = columnContainer.createEl('div', { cls: 'info-modal-line-container' });
  
          // Left column line (result)
          const leftLine = lineContainer.createEl('div', { cls: 'info-modal-left-line' });
          MarkdownRenderer.renderMarkdown(`\$\\begin{aligned}&${line}\\end{aligned}\$`, leftLine, '', new Component());
  
          // Right column line (solution)
          const rightLine = lineContainer.createEl('div', { cls: 'info-modal-right-line' });
          MarkdownRenderer.renderMarkdown(`\$\\begin{aligned}&${solutionLines[index] || ''}\\end{aligned}\$`, rightLine, '', new Component());
          //rightLine.innerHTML = `${solutionLines[index] || ''}`; // Ensure that if solutionLines is shorter, it adds an empty line
      });
  
      // Button container
      const buttonContainer = contentEl.createEl('div', { cls: 'info-modal-Copy-button-container' });
      const actionButton = buttonContainer.createEl('button', { text: 'Copy Details', cls: 'info-modal-Copy-button' });
      
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
      contentEl.createEl('h2', { text: 'Debug Information', cls: 'debug-Modal-title' });

      // Debug information display
      const debugContent = contentEl.createEl('div', { cls: 'debug-info-container' });
      MarkdownRenderer.renderMarkdown(`\`\`\`js\n${this.debugInfo}\n\`\`\``, debugContent, '', new Component());

  }
  onClose() {
      const { contentEl } = this;
      contentEl.empty();
  }
}
