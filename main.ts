import { Plugin, MarkdownView, MarkdownRenderer, PluginSettingTab, App, Setting, Modal, Notice, Component, Editor, EditorPosition } from 'obsidian';
import { controller } from './mathEngine.js';
// Define the interface for plugin settings
interface MathPluginSettings {
  numberFormatting: string
  background: string;
  evenRowBackground: string;
  oddRowBackground: string;
  infoModalBackground: string;
  fontSize: string;
  rowPadding: string;
  iconSize: string;
  sessionHistory: { input: string, result: string }[]; 
}

const DEFAULT_SETTINGS: MathPluginSettings = {
  numberFormatting: '.000',
  background: `#44475A`,
  evenRowBackground: '#f9f9f9',
  oddRowBackground: '#747688',
  infoModalBackground: '#002B36',
  fontSize: '0.85em',
  rowPadding: '5px 10px',
  iconSize: '14px',
  sessionHistory: []
};

export default class MathPlugin extends Plugin {
  settings: MathPluginSettings;
  
  async onload() {
    // Load settings and register the markdown processor
    await this.loadSettings();
    this.addSettingTab(new MathPluginSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor('math-engine', this.processMathBlock.bind(this));
    this.updateStyles();

    this.addCommand({
      id: 'open-input-form',
      name: 'Open Input Form',
      callback: () => {
        new CustomInputModal(this.app, this).open();
      }
    });
    this.addCommand({
      id: 'view-session-history',
      name: 'View Session History',
      callback: () => {
        new HistoryModal(this.app, this).open();
      }
    });
  }
  
  private processMathBlock(source: string, el: HTMLElement): void {
    let userVariables: any[] = [];
    let skippedIndexes=0
    el.classList.add('math-container');

    let expressions = source.split('\n').filter(line => line.trim() !== '');
    if (expressions.length === 0) {
      expressions = ['0'];
    }

    expressions.forEach((expression, index) => {
      expression = expression.replace(/\s/g, "");
      userVariables.forEach(({ variable, value }) => {
        const variableRegex = new RegExp(`\\b${variable.trim()}\\b`, 'g'); 
        expression = expression.replace(variableRegex, value.trim());
      });

      // Handle variable declaration
      if (expression.startsWith('var') && expression.includes('=')) {
        let splitVar = expression.substring(3).split('=');
        const index = userVariables.findIndex(v => v.variable === splitVar[0].trim());
        if (index !== -1) {
          userVariables[index].value = splitVar[1].trim();
        } else {
          userVariables.push({ variable: splitVar[0].trim(), value: splitVar[1].trim() });
        }
        skippedIndexes++;
        return;
      }

      const lineContainer = el.createEl('div', { cls: 'math-line-container' });
      lineContainer.addClass((index-skippedIndexes)%2 === 0 ? 'math-row-even' : 'math-row-odd');
      const inputDiv = lineContainer.createEl('div', { cls: 'math-input' });
      const resultDiv = lineContainer.createEl('div', { cls: 'math-result' });
      
      const binomRegex = /binom\(([\d.]+),([\d.]+),([\d.]+)\)/;
      const match = expression.match(binomRegex);

      if (match) {
        let binom=new binomInfoModel(this.app, match )
        inputDiv.innerText = `${expression}`;
        resultDiv.innerHTML = `${binom.getEqual()}`;
        const iconsDiv = this.createIconsContainer();
        this.addIconListeners(iconsDiv, match,'binom');
        lineContainer.append(inputDiv, resultDiv, iconsDiv);
        el.appendChild(lineContainer);
        return
      }

      let result;
      try {
        result = controller(expression);
        if (typeof result === 'object') {
          MarkdownRenderer.renderMarkdown(`$\{${result.processedinput}\}$`, inputDiv, '', this);
          MarkdownRenderer.renderMarkdown(/(true|false)/.test(result.solution) ? result.solution : `$\{${result.solution}\}$`, resultDiv, '', this);
          const iconsDiv = this.createIconsContainer();
          this.addIconListeners(iconsDiv, result,'default');
          lineContainer.append(inputDiv, resultDiv, iconsDiv);
        }
      } catch (err) {
        MarkdownRenderer.renderMarkdown(expression, inputDiv, '', this);
        resultDiv.innerHTML = `<span class="error-text">${err.message}</span>`;
        lineContainer.addClass('math-error-line');
      }
      
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

  private addIconListeners(iconsDiv: HTMLElement, result: any,infoMode: string): void {
    iconsDiv.querySelector('.math-info-icon')?.addEventListener('click', () => {
      switch (infoMode) {
        case 'binom':
          new binomInfoModel(this.app, result).open();
          break;
        default:
          new InfoModal(this.app, result.mathInfo, result.solutionInfo).open();
      }
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


class CustomInputModal extends Modal {
  plugin: MathPlugin;
  userChoice: number = 0;
  userCoordinatesInput: string = '(0,0),(1,0),(1,1)';
  userSidesInput: string = '';
  userAnglesInput: string = '';
  resultContainer: HTMLElement;
  shapesCharacteristics: any;
  evaledUserInputInfo: any = null;
  savedValues: any = {};

  constructor(app: App, plugin: MathPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Enter Math Expression' });

    // Assign shapesCharacteristics globally
    this.shapesCharacteristics = getShapesCharacteristics();

    const settingsContainer = contentEl.createDiv({ cls: 'settings-container' });
    const dynamicFieldContainer = contentEl.createDiv({ cls: 'dynamic-field-container' });
    const tikzGraphContainer = contentEl.createDiv({ cls: 'dynamic-field-container' });
    const submitButton = contentEl.createEl('button', { text: 'Submit', attr: { disabled: 'true' } });
    const temporaryDebugArea = contentEl.createDiv({ cls: 'temporary-debug-area' });
    submitButton.addEventListener('click', () => {
      if (this.evaledUserInputInfo && this.evaledUserInputInfo.meetsMinRequirements) {
        this.handleSubmit();
      } else {
        new Notice('Please enter valid input.');
      }
    });

    new Setting(settingsContainer)
      .setName('Choose shape')
      .setDesc('Select the shape to perform the operations on.')
      .addDropdown(dropdown => {
        this.shapesCharacteristics.forEach((shape: any, index: number) => {
          dropdown.addOption(index.toString(), shape.name);
        });
        this.userChoice = 0;
        this.renderDynamicFields(dynamicFieldContainer);
        
        dropdown.onChange(value => {
          this.userChoice = Number(value);
          this.renderDynamicFields(dynamicFieldContainer);
        });
      });
    
    contentEl.addEventListener('input', () => {
      this.evaledUserInputInfo = this.testMinInputRequirements();
      if (this.evaledUserInputInfo.meetsMinRequirements) {
        submitButton.removeAttribute('disabled');
        tikzGraphContainer.empty();
        MarkdownRenderer.renderMarkdown(createTikzGraph(this.evaledUserInputInfo), tikzGraphContainer, '', new Component);
        
        temporaryDebugArea.empty();
        MarkdownRenderer.renderMarkdown(`\`\`\`js\n${JSON.stringify(this.evaledUserInputInfo, null, 0.01)}\n\`\`\``+createTikzGraph(this.evaledUserInputInfo), temporaryDebugArea, '', new Component);
      } else {
        submitButton.setAttribute('disabled', 'true');
      }
    });
    
  }

  renderDynamicFields(container: HTMLElement) {
    container.findAll('.dynamic-field').forEach(el => el.remove());
    const shape = this.shapesCharacteristics[this.userChoice];

    new Setting(container)
      .setName('Coordinates')
      .setDesc(`Enter ${shape.coordinates} coordinates for ${shape.name} in (x, y) format`)
      .addText(text => {
        text.setValue(this.userCoordinatesInput||''); 
        text.onChange(value => {
          this.userCoordinatesInput = value;
        });
      })
      .settingEl.addClass('dynamic-field');

    new Setting(container)
      .setName('Sides')
      .setDesc(`Enter ${shape.coordinates} sides for ${shape.name}`)
      .addText(text => {
        text.setValue(this.userSidesInput||''); 
        text.onChange(value => {
          this.userSidesInput = value;
        });
      })
      .settingEl.addClass('dynamic-field');

    new Setting(container)
      .setName('Angles')
      .setDesc(`Enter ${shape.coordinates} angles for ${shape.name}`)
      .addText(text => {
        text.setValue(this.userAnglesInput||'');
        text.onChange(value => {
          this.userAnglesInput = value;
        });
      })
      .settingEl.addClass('dynamic-field');

    new Setting(container)
      .addButton(button =>
        button
          .setButtonText('Clear')
          .setTooltip('Clear all previous fields')
          .onClick(() => {
            this.userCoordinatesInput='';
            this.userSidesInput='';
            this.userAnglesInput='';
            this.renderDynamicFields(container);
          })
      )
      .settingEl.addClass('dynamic-field');
  }

  private testMinInputRequirements() {
    const objectifiedCoordinates = splitCoordinates(this.userCoordinatesInput),
          objectifiedSides = splitSides(this.userSidesInput),
          objectifiedAngles = splitAngles(this.userAnglesInput);

    const shapeName = this.shapesCharacteristics[this.userChoice].name;

    const isShapeValid = checkShapeRequirements(shapeName, objectifiedCoordinates, objectifiedSides, objectifiedAngles);

    if (isShapeValid) {
      if (!this.resultContainer) {
        this.resultContainer = this.contentEl.createEl('div', { cls: 'input-modal-result-container' });
      }
      this.resultContainer.classList.remove('input-modal-result-err');
      this.resultContainer.classList.add('input-modal-result-container');
    } else {
      if (!this.resultContainer) {
        this.resultContainer = this.contentEl.createEl('div', { cls: 'input-modal-result-err' });
      }
      this.resultContainer.classList.remove('input-modal-result-container');
      this.resultContainer.classList.add('input-modal-result-err');
    }
    return { meetsMinRequirements: isShapeValid,shape: shapeName, coordinates: objectifiedCoordinates, sides: objectifiedSides, angles: objectifiedAngles };
  }

  private handleSubmit() {

      const result = this.evaledUserInputInfo;
      this.resultContainer.textContent = JSON.stringify(result);

      this.plugin.settings.sessionHistory.push({
        input: this.userAnglesInput,
        result: result
      });
      this.plugin.saveSettings();
    
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

function createTikzGraph(userInput: any){
  const shapesCharacteristics=getShapesCharacteristics(),beginGraph=`\`\`\`tikz\n`,endGraph=`\n\`\`\``;
  let displayPictureOption=String.raw`[scale=1pt, x=1cm, y=1cm,white]`;
  userInput = nameTheShape(
    userInput.shape,
    userInput.coordinates,
    userInput.sides,
    userInput.angles
  );
  return `\`\`\`js\n`+JSON.stringify(userInput+calculateShape(userInput),null,0.01)+endGraph;
}

function calculateShape(userInput: any) {
  const shapesCharacteristics = getShapesCharacteristics();
  let coordinates = userInput.coordinates;
  let lengths: { edge1: string, edge2: string, length: number }[] = [];

  for (let i = 0; i < coordinates.length; i++) {
    let secondCoordinate = i!==coordinates.length-1?i+1:0;
    console.log(i,coordinates.length,i===coordinates.length-1)
    lengths.push({
      edge1: coordinates[i].name,
      edge2: coordinates[secondCoordinate].name,
      length: findLength(coordinates[i], coordinates[secondCoordinate])
    });
  }
  
  return JSON.stringify(lengths);
}


function findLength(coordinate1: any,coordinate2: any){
  const valueX=coordinate1.x-coordinate2.x;
  const valueY=coordinate1.y-coordinate2.y;
  return Math.sqrt(Math.pow(valueX,2)+Math.pow(valueY,2))
}
function reconstructCoordinates(coordinates: any){
  
}
function nameTheShape(
  shape: string, 
  coordinates: { name?: string, x: number, y: number }[], 
  sides: { name?: string, length: number }[], 
  angles: { name?: string, degrees: number }[]
) {
  const alphabet: readonly string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  let unnamedIndex = 0;
  let usedNames: Set<string> = new Set();


  function assignUniqueName(): string {
    while (usedNames.has(alphabet[unnamedIndex])) {
      unnamedIndex++;
    }
    const newName = alphabet[unnamedIndex++];
    usedNames.add(newName);
    return newName;
  }

  // Process coordinates
  let newCoordinates: { name: string, x: number, y: number }[] = coordinates.map(coordinate => {
    if (!coordinate.name) {
      coordinate.name = assignUniqueName();
    }
    usedNames.add(coordinate.name); 
    return { name: coordinate.name, x: coordinate.x, y: coordinate.y };
  });

  let newSides: { name: string, length: number }[] = sides.map(side => {
    if (!side.name) {
      side.name = assignUniqueName();
    }
    usedNames.add(side.name); 
    return { name: side.name, length: side.length };
  });
  let newAngles: { name: string, degrees: number }[] = angles.map(angle => {
    if (!angle.name) {
      angle.name = assignUniqueName();
    }

    usedNames.add(angle.name); 
    
    return { name: angle.name, degrees: angle.degrees };
  });

  return {
    shape: shape,
    coordinates: newCoordinates,
    sides: newSides,
    angles: newAngles
  };
}


function checkShapeRequirements(shapeName: string, objectifiedCoordinates: any[], objectifiedSides: any[], objectifiedAngles: any[]): boolean {
  const shapesCharacteristics = getShapesCharacteristics();
  const shape = shapesCharacteristics.find(s => s.name === shapeName);
  if (!shape) {
    throw new Error(`criteria for shape "${shapeName}" not found`);
  }
  
  const isValidCombination = shape.combinations.some(combo => {
    const hasValidcoords = combo.coordinates ? objectifiedCoordinates.length >= combo.coordinates : true;
    const hasValidSides = combo.sides ? objectifiedSides.length >= combo.sides : true;
    const hasValidAngles = combo.angles ? objectifiedAngles.length >= combo.angles : true;
    return hasValidSides && hasValidAngles&&hasValidcoords;
  });
  
  return isValidCombination;
}

function splitCoordinates(input: string): { x: number, y: number, name?: string }[] {
  input=input.replace(/\s/g,"")
  const regex = /\((\d+),(\d+)\)([a-zA-Z]{1,5})?/g;
  const matches = [];
  let match;

  while ((match = regex.exec(input)) !== null) {
    const [fullInput, x, y,name] = match;
    matches.push({
      x: Number(x),
      y: Number(y),
      ...(name ? { name } : {}) 
    });
  }
  return matches;
}
function splitSides(input: string): { value: number, name?: string }[] {
  input=input.replace(/\s/g,"")
  const regex = /([a-zA-Z]{1,5})?=?(\d+)/g;
  const matches = [];
  let match;

  while ((match = regex.exec(input)) !== null) {
    const [fullInput, name, value] = match;
    matches.push({
      value: Number(value),
      ...(name ? { name } : {}) 
    });
  }
  return matches;
}
function splitAngles(input: string): { value: number, name?: string }[] {
  input=input.replace(/\s/g,"")
  const regex = /([a-zA-Z]{1,5})?=?(\d+)/g;
  const matches = [];
  let match;

  while ((match = regex.exec(input)) !== null) {
    const [fullInput, name, value] = match;
    matches.push({
      value: Number(value),
      ...(name ? { name } : {}) 
    });
  }
  return matches;
}

// Custom History Modal class for session history
class HistoryModal extends Modal {
  plugin: MathPlugin;

  constructor(app: App, plugin: MathPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Session History' });

    // If there is no history, display a message
    if (this.plugin.settings.sessionHistory.length === 0) {
      contentEl.createEl('p', { text: 'No session history found.' });
      return;
    }

    // Display each session in the history
    this.plugin.settings.sessionHistory.forEach((session, index) => {
      const sessionDiv = contentEl.createEl('div', { cls: 'history-session' });
      sessionDiv.createEl('h3', { text: `Session ${index + 1}` });
      sessionDiv.createEl('p', { text: `Input: ${session.input}` });
      sessionDiv.createEl('p', { text: `Result: ${session.result}` });
    });

    // Close button
    const closeButton = contentEl.createEl('button', { text: 'Close' });
    closeButton.addEventListener('click', () => {
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty(); // Clean up modal content on close
  }
}


class InfoModal extends Modal {
  mathInfo: string[];
  solutionInfo: string[];

  constructor(app: App, mathInfo: string[], solutionInfo: string[]) {
    super(app);
    this.mathInfo = mathInfo;
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
    
    this.mathInfo.forEach((line, index) => {
      const lineContainer = columnContainer.createEl('div', { cls: 'info-modal-line-container' });
      
      const leftLine = lineContainer.createEl('div', { cls: 'info-modal-left-line' });
      MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${line}\\end{aligned}\}$`, leftLine, '', new Component());

      const rightLine = lineContainer.createEl('div', { cls: 'info-modal-right-line' });
      MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${this.solutionInfo[index] || ''}\\end{aligned}\}$`, rightLine, '', new Component());
    });

    const buttonContainer = contentEl.createEl('div', { cls: 'info-modal-Copy-button-container' });
    const actionButton = buttonContainer.createEl('button', { text: 'Copy Details', cls: 'info-modal-Copy-button' });

    actionButton.addEventListener('click', () => {
      navigator.clipboard.writeText(this.mathInfo.join('\n'));
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
class MathPluginSettingTab extends PluginSettingTab {
  plugin: MathPlugin;

  constructor(app: App, plugin: MathPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const toSetOptions=[
      {value: 1000,display: 'formatted .000' },
      {value: 10000,display: 'formatted .0000' },
      {value: 100000,display: 'formatted .00000' },
    ]

    containerEl.empty();
    containerEl.createEl('h2', { text: 'Math Plugin Settings' });
    this.addMultiChoiceSetting(containerEl, 'Rendered number format', 'Choose how to format numbers in the result', toSetOptions,'numberFormatting');
    containerEl.createEl('h2', { text: 'Math Plugin style' });

    // Add various settings
    this.addColorSetting(containerEl, 'Background Color', 'Set the background color.', 'background');
    this.addColorSetting(containerEl, 'Even Row Background Color', 'Set the background color for even rows.', 'evenRowBackground');
    this.addColorSetting(containerEl, 'Odd Row Background Color', 'Set the background color for odd rows.', 'oddRowBackground');
    this.addColorSetting(containerEl, 'infoModal Background Color', 'Set the background color for the info modal.', 'infoModalBackground');
    this.addFontSetting(containerEl, 'Font Size', 'Set the font size for the rows.', 'fontSize');
    this.addFontSetting(containerEl, 'Row Padding', 'Set the padding for the rows.', 'rowPadding');
    this.addFontSetting(containerEl, 'Icon Size', 'Set the size of the icons.', 'iconSize');

    new Setting(containerEl)
      .addButton(button =>
        button
          .setButtonText('Wipe History Module')
          //.setTooltip('Reset all settings to their default values')
          .onClick(async () => {
            this.plugin.settings.sessionHistory = [];
           new Notice('History was wiped.')
          }));
    new Setting(containerEl)
    .addButton(button =>
      button
        .setButtonText('Reset to Default')
        .setTooltip('Reset all settings to their default values')
        .onClick(async () => {
          await this.resetToDefault();
        }));
  }
  private addMultiChoiceSetting(containerEl: HTMLElement, name: string, description: string, choices: any,settingKey: keyof MathPluginSettings) {
    if (settingKey === 'sessionHistory') {
      console.error("sessionHistory cannot be modified with addFontSetting (string expected).");
      return;
    }

      new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addDropdown(dropdown => {
        choices.forEach((choice: any) => {
          dropdown.addOption(choice.value,choice.display);
        });
        dropdown.onChange(async (value) => {
            this.plugin.settings[settingKey] = value;
            await this.plugin.saveSettings();
            this.plugin.updateStyles();
        });
      });
  }

  private addColorSetting(containerEl: HTMLElement, name: string, description: string, settingKey: keyof MathPluginSettings) {
    if (settingKey === 'sessionHistory') {
      console.error("sessionHistory cannot be modified with addSetting (string expected).");
      return;
    }
  
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addColorPicker(colorPicker => {
        const settingValue = this.plugin.settings[settingKey];
        
        if (typeof settingValue === 'string') { 
          colorPicker.setValue(settingValue);
        }
        
        colorPicker.onChange(async (value) => {
          if (typeof this.plugin.settings[settingKey] === 'string') {
            this.plugin.settings[settingKey] = value;
            await this.plugin.saveSettings();
            this.plugin.updateStyles();
          } else {
            console.error(`Cannot assign a string value to ${settingKey} (non-string setting).`);
          }
        });
      });
  }
  
  private addFontSetting(containerEl: HTMLElement, name: string, description: string, settingKey: keyof MathPluginSettings) {
    // Ensure that 'sessionHistory' is not being processed by addFontSetting
    if (settingKey === 'sessionHistory') {
      console.error("sessionHistory cannot be modified with addFontSetting (string expected).");
      return;
    }
  
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addText(text => {
        const settingValue = this.plugin.settings[settingKey];
        
        // Ensure that the setting is a string
        if (typeof settingValue === 'string') { 
          text.setPlaceholder(settingValue).setValue(settingValue);
        }
        
        text.onChange(async (value) => {
          // Ensure we are only assigning to string settings
          if (typeof this.plugin.settings[settingKey] === 'string') {
            this.plugin.settings[settingKey] = value;
            await this.plugin.saveSettings();
            this.plugin.updateStyles();
          } else {
            console.error(`Cannot assign a string value to ${settingKey} (non-string setting).`);
          }
        });
      });
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
function getShapesCharacteristics(){
  return [
    {
      name: 'line', 
      coordinates: 2,
      sides: 1,
      angles:0,
      combinations: [
        { coordinates: 2},
        { sides: 1,angles: 0,coordinates: 0},
      ]
    },
    {
      name: 'triangle', 
      coordinates: 3, 
      sides: 1,
      angles:0,
      combinations: [
        { coordinates: 3},
        { sides: 3, angles: 0 }, // 3 sides, at least 1 angle
        { sides: 2, angles: 1 }, // 2 sides and 1 angle (SAS)
        { angles: 2, sides: 1 }  // 2 angles and 1 side (ASA)
      ]
    },
    {
      name: 'square',
      coordinates: 4,
      sides: 1,
      angles:0,
      combinations: [
        { coordinates: 3}, 
        { sides: 2},
        { angles: 0},  
      ]
    }
  ];
}

class binomInfoModel extends Modal {
  private n: number;
  private k: number;
  private p: number;

  private equal: number = 0;
  private less: number = 0;
  private lessEqual: number = 0;
  private big: number = 0;
  private bigEqual: number = 0;
  
  constructor(app: App, source: any) {
    super(app);
    this.n = Number(source[1]); 
    this.k = Number(source[2]); 
    this.p = Number(source[3]);
  }

  onOpen() {
    this.assignProbability();
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Binomial Probability Results' });
    contentEl.createEl('p', { text: `P(X = ${this.k}) = ${this.equal}` });
    contentEl.createEl('p', { text: `P(X < ${this.k}) = ${this.less}` });
    contentEl.createEl('p', { text: `P(X <= ${this.k}) = ${this.lessEqual}` });
    contentEl.createEl('p', { text: `P(X > ${this.k}) = ${this.big}` });
    contentEl.createEl('p', { text: `P(X >= ${this.k}) = ${this.bigEqual}` });
  }
  public getEqual(): number{;return this.factorial(this.n,this.k,this.p)}

  private factorial(n: number, k: number, p: number) {
    let sum = 1, sumK = 1, sumNK = 1;
    
    // Calculate factorials
    for (let i = 1; i <= n; i++) {
      sum *= i;
      if (i === k) sumK = sum;
      if (i === (n - k)) sumNK = sum;
    }
    return sum / (sumK * sumNK) * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }

  private assignProbability() {
    for (let i = 0; i <= this.n; i++) {
      if (i === this.k) {this.equal = this.factorial(this.n, i, this.p);}
      if (i < this.k) {this.less += this.factorial(this.n, i, this.p);}
      if (i <= this.k) {this.lessEqual += this.factorial(this.n, i, this.p);}
      if (i > this.k) {this.big += this.factorial(this.n, i, this.p);}
      if (i >= this.k) {this.bigEqual += this.factorial(this.n, i, this.p);}
    }
  }
}



