import { Plugin, MarkdownView, MarkdownRenderer , PluginSettingTab, App, Setting, Modal } from 'obsidian';
import { controller } from './mathEngine.js';

interface MathPluginSettings {
  defaultMathEngine: string;
}

const DEFAULT_SETTINGS: MathPluginSettings = {
  defaultMathEngine: 'default'
}

export default class MathPlugin extends Plugin {
  settings: MathPluginSettings;

  async onload() {
    await this.loadSettings();

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

		MarkdownRenderer.renderMarkdown(`$\{${latexExpression}\}$`, inputDiv, '', this);




		const result=controller(expression);

        // Create a separate answer area (right side)
        const resultDiv = container.createEl('div', { cls: 'math-result-separate' });
        resultDiv.innerHTML = `<span class="math-result-text">${result.Solution}</span> <span class="math-result-icon">🛈</span>`;


        resultDiv.querySelector('.math-result-icon')?.addEventListener('click', () => {
          new InfoModal(this.app, `${result.info}`).open();
        });
      });
    });

    this.addSettingTab(new MathSettingTab(this.app, this));
  }

  onunload() {}

  processMath(source: string): string {
    try {
      const result = "1";  
      return result.toString();
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// Custom Modal for extra information
class InfoModal extends Modal {
	result: string;
  
	constructor(app: App, result: string) {
	  super(app);
	  this.result = result;
	}
  
	onOpen() {
	  const { contentEl } = this;
	  contentEl.createEl('h2', { text: 'Result Details' });
  
	  const infoSection = contentEl.createEl('div', { cls: 'info-section' });
	  
	  infoSection.innerHTML = `Details:<br>${this.result.replace(/\n/g, '<br>')}`;
	}
  
	onClose() {
	  const { contentEl } = this;
	  contentEl.empty();
	}
  }
  

class MathSettingTab extends PluginSettingTab {
  plugin: MathPlugin;

  constructor(app: App, plugin: MathPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Math Engine')
      .setDesc('Select the math engine to use for processing.')
      .addText(text => text
        .setPlaceholder('Enter engine name')
        .setValue(this.plugin.settings.defaultMathEngine)
        .onChange(async (value) => {
          this.plugin.settings.defaultMathEngine = value;
          await this.plugin.saveSettings();
        }));
  }
}