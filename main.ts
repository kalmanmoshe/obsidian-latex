import { Plugin, MarkdownRenderer, PluginSettingTab, App, Setting, Modal, Notice, Component } from 'obsidian';
import { controller } from './mathEngine.js';

// Define the interface for plugin settings
interface MathPluginSettings {
  background: string;
  evenRowBackground: string;
  oddRowBackground: string;
  infoModalBackground: string;
  fontSize: string;
  rowPadding: string;
  iconSize: string;
}

// Default settings
const DEFAULT_SETTINGS: MathPluginSettings = {
  background: `#44475A`,
  evenRowBackground: '#f9f9f9',
  oddRowBackground: '#747688',
  infoModalBackground: '#002B36',
  fontSize: '0.85em',
  rowPadding: '5px 10px',
  iconSize: '14px',
};

// Main plugin class
export default class MathPlugin extends Plugin {
  settings: MathPluginSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MathPluginSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor('math-engine', this.processMathBlock.bind(this));
    this.updateStyles();
  }

  onunload() {
    // Clean up resources if needed
  }

  // Markdown code block processor
  private processMathBlock(source: string, el: HTMLElement): void {
    el.classList.add('math-container');
  
    let expressions = source.split('\n').filter(line => line.trim() !== '');
    if (expressions.length === 0) {
      expressions = ['0'];
    }
  
    // Process each expression and create line containers
    expressions.forEach((expression, index) => {
      const lineContainer = el.createEl('div', { cls: 'math-line-container' });
  
      // Alternate row styling
      lineContainer.addClass(index % 2 === 0 ? 'math-row-even' : 'math-row-odd');
  
      // Create input and result containers
      const inputDiv = lineContainer.createEl('div', { cls: 'math-input' });
      const resultDiv = lineContainer.createEl('div', { cls: 'math-result' });
  
      let result;  // Declare result here, outside the try block
      try {
        // Mock result, replace this with actual logic
        result = controller(expression);
        if (typeof result === 'object') {
          MarkdownRenderer.renderMarkdown(`$\{${result.processedinput}\}$`, inputDiv, '', this);
          MarkdownRenderer.renderMarkdown(/(true|false)/.test(result.solution) ? result.solution : `$\{${result.solution}\}$`, resultDiv, '', this);
          console.log('',result.solutionInfo)
          const iconsDiv = this.createIconsContainer();
          this.addIconListeners(iconsDiv, result);  
          lineContainer.append(inputDiv, resultDiv, iconsDiv);
        }
      } catch (err) {
        MarkdownRenderer.renderMarkdown(expression, inputDiv, '', this);
        resultDiv.innerHTML = `<span class="error-text">${err.message}</span>`;
        lineContainer.addClass('math-error-line');
      }

      // Append the line container to the main element
      el.appendChild(lineContainer);
    });
  }
  
  
  // Create icons container
  private createIconsContainer(): HTMLElement {
    const iconsDiv = document.createElement('div');
    iconsDiv.classList.add('math-icons');
    iconsDiv.innerHTML = `
      <span class="math-info-icon">🛈</span>
      <span class="math-debug-icon">🐞</span>`;
    return iconsDiv;
  }

  // Add event listeners to icons
  private addIconListeners(iconsDiv: HTMLElement, result: any): void {
    iconsDiv.querySelector('.math-info-icon')?.addEventListener('click', () => {
      new InfoModal(this.app, result.mathinfo, result.solutionInfo).open();
    });

    iconsDiv.querySelector('.math-debug-icon')?.addEventListener('click', () => {
      new DebugModal(this.app, result.debugInfo).open();
    });
  }

  // Load settings
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  // Save settings
  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Update styles based on settings
  updateStyles() {
    const root = document.documentElement;
    root.style.setProperty('--row-background', this.settings.background);
    root.style.setProperty('--even-row-background', this.settings.evenRowBackground);
    root.style.setProperty('--odd-row-background', this.settings.oddRowBackground);
    root.style.setProperty('--info-modal-column-background', this.settings.infoModalBackground);
    root.style.setProperty('--font-size', this.settings.fontSize);
    root.style.setProperty('--row-padding', this.settings.rowPadding);
    root.style.setProperty('--icon-size', this.settings.iconSize);
  }
}

// Settings tab class
class MathPluginSettingTab extends PluginSettingTab {
  plugin: MathPlugin;

  constructor(app: App, plugin: MathPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Math Plugin Settings' });

    // Add various settings
    this.addSetting(containerEl, 'Background Color', 'Set the background color.', 'background');
    this.addSetting(containerEl, 'Even Row Background Color', 'Set the background color for even rows.', 'evenRowBackground');
    this.addSetting(containerEl, 'Odd Row Background Color', 'Set the background color for odd rows.', 'oddRowBackground');
    this.addSetting(containerEl, 'info model Background Color', 'Set the background color for the info model.', 'infoModalBackground');
    this.addFontSetting(containerEl, 'Font Size', 'Set the font size for the rows.', 'fontSize');
    this.addFontSetting(containerEl, 'Row Padding', 'Set the padding for the rows.', 'rowPadding');
    this.addFontSetting(containerEl, 'Icon Size', 'Set the size of the icons.', 'iconSize');

    // Add a "Reset to Default" button
    new Setting(containerEl)
      .addButton(button =>
        button
          .setButtonText('Reset to Default')
          .setTooltip('Reset all settings to their default values')
          .onClick(async () => {
            await this.resetToDefault();
          }));
  }

  private addSetting(containerEl: HTMLElement, name: string, description: string, settingKey: keyof MathPluginSettings) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addColorPicker(colorPicker =>
        colorPicker.setValue(this.plugin.settings[settingKey])
          .onChange(async (value) => {
            this.plugin.settings[settingKey] = value;
            await this.plugin.saveSettings();
            this.plugin.updateStyles();
          }));
  }

  private addFontSetting(containerEl: HTMLElement, name: string, description: string, settingKey: keyof MathPluginSettings) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addText(text =>
        text.setPlaceholder(this.plugin.settings[settingKey])
          .setValue(this.plugin.settings[settingKey])
          .onChange(async (value) => {
            this.plugin.settings[settingKey] = value;
            await this.plugin.saveSettings();
            this.plugin.updateStyles();
          }));
  }

  // Reset settings to default values
  private async resetToDefault() {
    this.plugin.settings = { ...DEFAULT_SETTINGS };
    await this.plugin.saveSettings();
    this.plugin.updateStyles();
    new Notice('Settings have been reset to default.');
    this.display(); // Refresh the settings display
  }
}


// Custom modal classes for Info and Debug modals
class InfoModal extends Modal {
  result: string;
  solutionInfo: string;

  constructor(app: App, result: string, solutionInfo: string) {
    super(app);
    this.result = result;
    this.solutionInfo = solutionInfo;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('info-modal-style');
    contentEl.createEl('h2', { text: 'Result Details', cls: 'info-modal-title' });

    // Add content and button for copying details
    this.populateContent(contentEl);
  }
  
  private populateContent(contentEl: HTMLElement): void {
    
    const columnContainer = contentEl.createEl('div', { cls: 'info-modal-main-container' });
    const resultLines = this.result.split('\n');
    const solutionLines = this.solutionInfo.split('\n');

    resultLines.forEach((line, index) => {
      const lineContainer = columnContainer.createEl('div', { cls: 'info-modal-line-container' });
      
      const leftLine = lineContainer.createEl('div', { cls: 'info-modal-left-line' });
      MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${line}\\end{aligned}\}$`, leftLine, '', new Component());

      const rightLine = lineContainer.createEl('div', { cls: 'info-modal-right-line' });
      MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${solutionLines[index] || ''}\\end{aligned}\}$`, rightLine, '', new Component());
    });

    const buttonContainer = contentEl.createEl('div', { cls: 'info-modal-Copy-button-container' });
    const actionButton = buttonContainer.createEl('button', { text: 'Copy Details', cls: 'info-modal-Copy-button' });

    actionButton.addEventListener('click', () => {
      navigator.clipboard.writeText(this.result);
      new Notice('Details copied to clipboard!');
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class DebugModal extends Modal {
  debugInfo: string;

  constructor(app: App, debugInfo: string) {
    super(app);
    this.debugInfo = debugInfo;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('custom-modal-style');
    contentEl.createEl('h2', { text: 'Debug Information', cls: 'debug-Modal-title' });

    const debugContent = contentEl.createEl('div', { cls: 'debug-info-container' });
    MarkdownRenderer.renderMarkdown(`\`\`\`js\n${this.debugInfo}\n\`\`\``, debugContent, '', new Component());
  }

  onClose() {
    this.contentEl.empty();
  }
}


function getMathJsSymbols() {
  const mathjsBuiltInSymbols = [
    "f|abs()",
    "f|acos()",
    "f|acosh()",
    "f|acot()",
    "f|acoth()",
    "f|acsc()",
    "f|acsch()",
    "f|add()",
    "f|and()",
    "f|apply()",
    "f|arg()",
    "f|asec()",
    "f|asech()",
    "f|asin()",
    "f|asinh()",
    "f|atan()",
    "f|atan2()",
    "f|atanh()",
    "p|atm",
    "p|atomicMass",
    "p|avogadro",
    "f|bellNumbers()",
    "f|bin()",
    "f|bitAnd()",
    "f|bitNot()",
    "f|bitOr()",
    "f|bitXor()",
    "p|bohrMagneton",
    "p|bohrRadius",
    "p|boltzmann",
    "f|catalan()",
    "f|cbrt()",
    "f|ceil()",
    "p|classicalElectronRadius",
    "f|clone()",
    "f|column()",
    "f|combinations()",
    "f|combinationsWithRep()",
    "f|compare()",
    "f|compareNatural()",
    "f|compareText()",
    "f|compile()",
    "f|composition()",
    "f|concat()",
    "p|conductanceQuantum",
    "f|conj()",
    "f|cos()",
    "f|cosh()",
    "f|cot()",
    "f|coth()",
    "p|coulomb",
    "f|count()",
    "f|cross()",
    "f|csc()",
    "f|csch()",
    "f|ctranspose()",
    "f|cube()",
    "f|cumsum()",
    "f|deepEqual()",
    "f|derivative()",
    "f|det()",
    "p|deuteronMass",
    "f|diag()",
    "f|diff()",
    "f|distance()",
    "f|divide()",
    "f|dot()",
    "f|dotDivide()",
    "f|dotMultiply()",
    "f|dotPow()",
    "c|e",
    "p|efimovFactor",
    "f|eigs()",
    "p|electricConstant",
    "p|electronMass",
    "p|elementaryCharge",
    "f|equal()",
    "f|equalText()",
    "f|erf()",
    "f|evaluate()",
    "f|exp()",
    "f|expm()",
    "f|expm1()",
    "f|factorial()",
    "p|faraday",
    "p|fermiCoupling",
    "f|fft()",
    "f|filter()",
    "p|fineStructure",
    "p|firstRadiation",
    "f|fix()",
    "f|flatten()",
    "f|floor()",
    "f|forEach()",
    "f|format()",
    "f|gamma()",
    "p|gasConstant",
    "f|gcd()",
    "f|getMatrixDataType()",
    "p|gravitationConstant",
    "p|gravity",
    "p|hartreeEnergy",
    "f|hasNumericValue()",
    "f|help()",
    "f|hex()",
    "f|hypot()",
    "c|i",
    "f|identity()",
    "f|ifft()",
    "f|im()",
    "c|Infinity",
    "f|intersect()",
    "f|inv()",
    "p|inverseConductanceQuantum",
    "f|invmod()",
    "f|isInteger()",
    "f|isNaN()",
    "f|isNegative()",
    "f|isNumeric()",
    "f|isPositive()",
    "f|isPrime()",
    "f|isZero()",
    "f|kldivergence()",
    "p|klitzing",
    "f|kron()",
    "f|larger()",
    "f|largerEq()",
    "f|lcm()",
    "f|leafCount()",
    "f|leftShift()",
    "f|lgamma()",
    "c|LN10",
    "c|LN2",
    "f|log()",
    "f|log10()",
    "c|LOG10E",
    "f|log1p()",
    "f|log2()",
    "c|LOG2E",
    "p|loschmidt",
    "f|lsolve()",
    "f|lsolveAll()",
    "f|lup()",
    "f|lusolve()",
    "f|lyap()",
    "f|mad()",
    "p|magneticConstant",
    "p|magneticFluxQuantum",
    "f|map()",
    "f|matrixFromColumns()",
    "f|matrixFromFunction()",
    "f|matrixFromRows()",
    "f|max()",
    "f|mean()",
    "f|median()",
    "f|min()",
    "f|mod()",
    "f|mode()",
    "p|molarMass",
    "p|molarMassC12",
    "p|molarPlanckConstant",
    "p|molarVolume",
    "f|multinomial()",
    "f|multiply()",
    "c|NaN",
    "p|neutronMass",
    "f|norm()",
    "f|not()",
    "f|nthRoot()",
    "f|nthRoots()",
    "p|nuclearMagneton",
    "c|null",
    "f|numeric()",
    "f|oct()",
    "f|ones()",
    "f|or()",
    "f|parser()",
    "f|partitionSelect()",
    "f|permutations()",
    "c|phi",
    "c|pi",
    "f|pickRandom()",
    "f|pinv()",
    "p|planckCharge",
    "p|planckConstant",
    "p|planckLength",
    "p|planckMass",
    "p|planckTemperature",
    "p|planckTime",
    "f|polynomialRoot()",
    "f|pow()",
    "f|print()",
    "f|prod()",
    "p|protonMass",
    "f|qr()",
    "f|quantileSeq()",
    "p|quantumOfCirculation",
    "f|random()",
    "f|randomInt()",
    "f|range()",
    "f|rationalize()",
    "f|re()",
    "p|reducedPlanckConstant",
    "f|reshape()",
    "f|resize()",
    "f|resolve()",
    "f|rightArithShift()",
    "f|rightLogShift()",
    "f|rotate()",
    "f|rotationMatrix()",
    "f|round()",
    "f|row()",
    "p|rydberg",
    "p|sackurTetrode",
    "f|schur()",
    "f|sec()",
    "f|sech()",
    "p|secondRadiation",
    "f|setCartesian()",
    "f|setDifference()",
    "f|setDistinct()",
    "f|setIntersect()",
    "f|setIsSubset()",
    "f|setMultiplicity()",
    "f|setPowerset()",
    "f|setSize()",
    "f|setSymDifference()",
    "f|setUnion()",
    "f|sign()",
    "f|simplify()",
    "f|simplifyConstant()",
    "f|simplifyCore()",
    "f|sin()",
    "f|sinh()",
    "f|size()",
    "f|slu()",
    "f|smaller()",
    "f|smallerEq()",
    "f|sort()",
    "p|speedOfLight",
    "f|sqrt()",
    "c|SQRT1_2",
    "c|SQRT2",
    "f|sqrtm()",
    "f|square()",
    "f|squeeze()",
    "f|std()",
    "p|stefanBoltzmann",
    "f|stirlingS2()",
    "f|subset()",
    "f|subtract()",
    "f|sum()",
    "f|sylvester()",
    "f|symbolicEqual()",
    "f|tan()",
    "f|tanh()",
    "c|tau",
    "p|thomsonCrossSection",
    "f|to()",
    "f|trace()",
    "f|transpose()",
    "f|typeOf()",
    "f|unaryMinus()",
    "f|unaryPlus()",
    "f|unequal()",
    "f|usolve()",
    "f|usolveAll()",
    "p|vacuumImpedance",
    "f|variance()",
    "p|weakMixingAngle",
    "p|wienDisplacement",
    "f|xgcd()",
    "f|xor()",
    "f|zeros()"
  ];
  return mathjsBuiltInSymbols;
}