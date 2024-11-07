import {Plugin, MarkdownRenderer, App, Modal, Component, Setting,Notice, WorkspaceWindow,} from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { CustomInputModal, HistoryModal, InputModal, vecInpotModel } from "./temp";
import {MathPluginSettings, DEFAULT_SETTINGS, MathPluginSettingTab,} from "./settings";
import { calculateBinom, degreesToRadians, findAngleByCosineRule, getUsableDegrees, polarToCartesian, radiansToDegrees, roundBySettings } from "./mathUtilities.js";
import { Tikzjax } from "./tikzjax/tikzjax";

export default class MathPlugin extends Plugin {
  settings: MathPluginSettings;
  tikzProcessor: Tikzjax
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MathPluginSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
    this.registerCommands();
    this.tikzProcessor=new Tikzjax(this.app,this)
    

    this.tikzProcessor.readyLayout();
		this.tikzProcessor.addSyntaxHighlighting();
		this.tikzProcessor.registerTikzCodeBlock();
  }
  onunload() {
		this.tikzProcessor.unloadTikZJaxAllWindows();
		this.tikzProcessor.removeSyntaxHighlighting();
	}
  
  
  private async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  public async saveSettings() {
    await this.saveData(this.settings);
  }

  private registerCommands() {
    this.addCommand({
      id: "open-input-form",
      name: "Open Input Form",
      callback: () => new CustomInputModal(this.app, this).open(),
    });

    this.addCommand({
      id: "view-session-history",
      name: "View Session History",
      //callback: () => new HistoryModal(this.app, this).open(),
    });
  }

  private processMathBlock(source: string, mainContainer: HTMLElement): void {
    mainContainer.classList.add("math-container");

    const userVariables: { variable: string; value: string }[] = [];
    let skippedIndexes = 0;

    const expressions = source.split("\n").map(line => line.trim()).filter(line => line);
    if (expressions.length === 0) {return;}

    
    expressions.forEach((expression, index) => {
      let lineContainer: HTMLDivElement = document.createElement("div");
      lineContainer.classList.add("math-line-container", (index-skippedIndexes) % 2 === 0 ? "math-row-even" : "math-row-odd");
      const processMath = new ProcessMath(expression,userVariables, this.app,lineContainer);
      processMath.initialize();
      if(processMath.mode!=="variable"){
        lineContainer = processMath.container as HTMLDivElement;
        mainContainer.appendChild(lineContainer);
      }
      else{skippedIndexes++;}
    });
  }
}




class ProcessMath {
  mathInput: any;
  userVariables: { variable: string; value: string }[] = [];
  mode = "math";
  result: any;
  container: HTMLElement;
  iconsDiv: HTMLElement;
  app: App;

  constructor(mathInput: string,userVariables: any, app: App, container: HTMLElement) {
    this.mathInput = mathInput;
    this.userVariables=userVariables;
    this.app = app;
    this.container = container;
    this.iconsDiv = Object.assign(document.createElement("div"), {
      className: "math-icons",
    });
  }

  async initialize() {
    this.assignMode();
    this.setupContainer();
    this.handleVariables();
    this.renderMath();
  }

  private setupContainer() {
    ["math-input", "math-result"].forEach(className => {
      const div = document.createElement("div");
      div.classList.add(className);
      this.container.appendChild(div);
    });
    this.container.appendChild(this.iconsDiv);
  }

  private renderMath() {
    const inputDiv = this.container.querySelector(".math-input") as HTMLElement;
    const resultDiv = this.container.querySelector(".math-result") as HTMLElement;
    try {
      switch (this.mode) {
        case "binom":
          // eslint-disable-next-line no-case-declarations
          const binomModel = new BinomInfoModel(this.app, this.mathInput);
          this.addInfoModal(binomModel);
          this.result = binomModel.getEqual();
          break;
        case "cos":
          // eslint-disable-next-line no-case-declarations
          const [ , sideA, sideB, sideC ] = this.mathInput.map(Number);
          this.result=findAngleByCosineRule(sideA, sideB, sideC)
          break;
        case "vec":
          // eslint-disable-next-line no-case-declarations
          this.result=new VecProcessor(this.mathInput[1],this.mathInput[2],this.mathInput[3]);
          this.addInfoModal(new tikzGraph(this.app, this.result.graph));
          this.addDebugModel(new DebugModal(this.app, this.result.vecInfo.debugInfo));
          this.result=this.result.result
          break;
        case "variable":
          break;
        default:
          // eslint-disable-next-line no-case-declarations
          this.result = new MathPraiser(this.mathInput);
          this.addInfoModal(new InfoModal(this.app, this.result.mathInfo));
          this.addDebugModel(new DebugModal(this.app, this.result.mathInfo.debugInfo));
          this.mathInput=this.result.input;
          this.result = this.result.solution;
          break;
      }
     this.addInputAndResultDiv(inputDiv, resultDiv, typeof this.mathInput==="string"?this.mathInput:this.mathInput[0], roundBySettings(this.result));
    } catch (err) {
      
      this.displayError(inputDiv, resultDiv, err);
      console.error("The initial praising failed",err);
    }
  }

  private addInputAndResultDiv(inputDiv: HTMLElement, resultDiv: HTMLElement, input: string, result: any) {
    MarkdownRenderer.renderMarkdown(`\${${input}}$`, inputDiv, "", new Component());
    const resultOutput = /(true|false)/.test(result) ? result : `\${${result}}$`;
    MarkdownRenderer.renderMarkdown(resultOutput, resultDiv, "", new Component());
  }

  private displayError(inputDiv: HTMLElement, resultDiv: HTMLElement, err: Error) {
    MarkdownRenderer.renderMarkdown(this.mathInput, inputDiv, "", new Component());
    resultDiv.innerHTML = `<span class="error-text">${err.message}</span>`;
    this.container.classList.add("math-error-line");
  }

  private assignMode() {
    const regexList = GetMathContextRegex();
    const matchObject = regexList.find(regexObj => regexObj.regex.test(this.mathInput));
    if (matchObject) {
      this.mode = matchObject.value;
      this.mathInput = this.mathInput.match(matchObject.regex);
    }
  }

  private addInfoModal(modal: any) {
    const icon = Object.assign(document.createElement("div"), {
      className: "math-info-icon",
      textContent: "🛈",
    });
    icon.onclick = () => modal.open();
    this.iconsDiv.appendChild(icon);
  }

  private addDebugModel(modal: any) {
    const icon = Object.assign(document.createElement("div"), {
      className: "math-debug-icon",
      textContent: "🐞",
    });
    icon.onclick = () => modal.open();
    this.iconsDiv.appendChild(icon);
  }

  private handleVariables() {
    if (this.mode==="variable") {
      this.handleVariableDeclaration();
    } else {
      this.replaceVariablesInExpression();
    }
  }

  private handleVariableDeclaration() {
    const [_,variable, value] = this.mathInput.map((part: string) => part.trim());
    if (!variable || !value) {
      console.warn(`Invalid variable declaration: ${this.mathInput}`);
      return;
    }
    const existingVarIndex = this.userVariables.findIndex(v => v.variable === variable);
    if (existingVarIndex !== -1) {
      this.userVariables[existingVarIndex].value = value;
    } else {
      this.userVariables.push({ variable, value });
    }
  }

  private replaceVariablesInExpression(){
    this.userVariables.forEach(({ variable, value }) => {
      if (typeof this.mathInput==="string"){
        this.mathInput = this.mathInput.replace(variable, value);
      }
    });
  }
}


function GetMathContextRegex() {
  return [
    { regex: /binom\((\d+),(\d+),(\d+)\)/, value: "binom" },
    { regex: /vec([+-]{0,2})\(([\d.+-]+[:,][\d.+-]+)\)([\d.+-]*)/, value: "vec" },
    { regex: /cos\(([\d.]+),([\d.]+),([\d.]+)\)/, value: "cos" },
    { regex: /var\s*([\w]+)\s*=\s*([\d.]+)/, value: "variable" },
  ];
}


class VecProcessor {
  userInput: any;
  environment: { X: string; Y: string };
  vecInfo = new MathInfo();
  Xcomponent: number;
  Ycomponent: number;
  modifier: number;
  result: string;
  graph: string;

  constructor(environment: string, mathInput: string, modifier: string) {
    const match = environment.match(/([+-]?)([+-]?)/);
    this.environment = { X: match?.[1] ?? "+", Y: match?.[2] ?? "+" };

    this.modifier = modifier.length > 0 ? getUsableDegrees(Number(modifier)) : 0;

    if (mathInput.includes(":")) {
      this.calculateComponents(mathInput);
    } else {
      this.addComponents(mathInput);
    }
    this.addGraph();
  }

  // Handle Cartesian input
  addComponents(mathInput: string) {
    [this.Xcomponent, this.Ycomponent] = mathInput.split(",").map(Number);
    const length = Math.sqrt(this.Xcomponent ** 2 + this.Ycomponent ** 2);
    this.vecInfo.addDebugInfo("Calculated length", length);

    const angle = getUsableDegrees(radiansToDegrees(Math.atan2(this.Ycomponent, this.Xcomponent)));
    this.vecInfo.addDebugInfo("Calculated angle", angle);

    this.result = `\\text{angle} = ${roundBySettings(angle)}\\degree, \\quad \\text{length} = ${roundBySettings(length)}`;
  }

  // Handle polar input
  calculateComponents(mathInput: string) {
    ({X: this.Xcomponent, Y: this.Ycomponent} = polarToCartesian(mathInput));
    this.vecInfo.addDebugInfo("X component", this.Xcomponent);
    this.vecInfo.addDebugInfo("Y component", this.Ycomponent);
    this.result = `x = ${roundBySettings(this.Xcomponent)}, \\quad y = ${roundBySettings(this.Ycomponent)}`;
  }

  // Vector addition
  add(vector: VecProcessor): VecProcessor {
    this.Xcomponent += vector.Xcomponent;
    this.Ycomponent += vector.Ycomponent;
    return this;
  }

  // Apply dynamic scaling and generate LaTeX TikZ code for vector visualization
  addGraph() {
    const targetSize = 10;
    const maxComponent = Math.max(Math.abs(this.Xcomponent), Math.abs(this.Ycomponent));

    // Determine scaling factor
    let scale = 1;
    if (maxComponent < targetSize) {
      scale = targetSize / maxComponent; // Upscale if too small
    } else if (maxComponent > targetSize) {
      scale = targetSize / maxComponent; // Downscale if too large
    }

    // Apply scaling factor to both components
    const scaledX = this.Xcomponent * scale;
    const scaledY = this.Ycomponent * scale;
    const vectorLength = Math.sqrt(scaledX ** 2 + scaledY ** 2);
    const vectorAngle = getUsableDegrees(radiansToDegrees(Math.atan2(scaledY, scaledX)));

    // Generate LaTeX code for vector components and main vector
    const tikzCode = String.raw`
      \coor{${roundBySettings(scaledX)}, ${roundBySettings(scaledY)}}{vec}{}{}
      \coor{${roundBySettings(scaledX)}, 0}{X}{}{}
      \coor{0, ${roundBySettings(scaledY)}}{Y}{}{}
      \coor{0, 0}{anc}{}{}

      % X Component
      \draw [line width=1pt, draw=yellow, -{Stealth}] 
        (anc) -- node {${roundBySettings(this.Xcomponent)}$_{x}$} 
        (X);

      % Y Component
      \draw [line width=1pt, draw=yellow, -{Stealth}] 
        (anc) -- node {${roundBySettings(this.Ycomponent)}$_{y}$} 
        (Y);

      % Full Vector
      \draw [line width=1pt, draw=red, -{Stealth}] 
        (anc) -- node {${roundBySettings(vectorLength)}} 
        (vec);

      % Angle Annotation
      %\ang{X}{anc}{vec}{}{${roundBySettings(vectorAngle)}$^{\circ}$}
    `.replace(/^\s+/gm, "");

    this.vecInfo.addDebugInfo("Scaling factor", scale);
    this.vecInfo.addDebugInfo("TikZ graph code", tikzCode);
    this.graph = tikzCode;
  }
}



class tikzGraph extends Modal {
  tikzCode: string
  constructor(app: App,tikzCode: string){
    super(app);
    this.tikzCode=tikzCode;
  }

  onOpen() {
    const beginEnvironment="```tikz\n[white]\n"
    const endEnvironment="\n```";
    MarkdownRenderer.renderMarkdown(beginEnvironment+this.tikzCode+endEnvironment, this.contentEl, "", new Component());
    const actionButton = this.contentEl.createEl("button", { text: "Copy graph", cls: "info-modal-Copy-button" });

    actionButton.addEventListener("click", () => {
      navigator.clipboard.writeText(this.tikzCode);
      new Notice("Graph copied to clipboard!");
    });
  }
  onClose(): void {
    const { contentEl } = this;
      contentEl.empty();
  }
}






class BinomInfoModel extends Modal {
  private n: number;
  private k: number;
  private p: number;
  private equal = 0;
  private less = 0;
  private lessEqual = 0;
  private big = 0;
  private bigEqual = 0;

  constructor(app: App, source: string) {
    super(app);
    const [_, n, k, p] = source.match(/\d+/g)!.map(Number);
    this.n = n;
    this.k = k;
    this.p = p;
  }

  onOpen() {
    this.calculateProbabilities();
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Binomial Probability Results" });
    contentEl.createEl("p", { text: `P(X = ${this.k}) = ${this.equal}` });
    contentEl.createEl("p", { text: `P(X < ${this.k}) = ${this.less}` });
    contentEl.createEl("p", { text: `P(X <= ${this.k}) = ${this.lessEqual}` });
    contentEl.createEl("p", { text: `P(X > ${this.k}) = ${this.big}` });
    contentEl.createEl("p", { text: `P(X >= ${this.k}) = ${this.bigEqual}` });
  }

  public getEqual(): number {
    return calculateBinom(this.n, this.k, this.p);
  }

  private calculateProbabilities() {
    for (let i = 0; i <= this.n; i++) {
      const probability = calculateBinom(this.n, i, this.p);
      if (i === this.k) this.equal = probability;
      if (i < this.k) this.less += probability;
      if (i <= this.k) this.lessEqual += probability;
      if (i > this.k) this.big += probability;
      if (i >= this.k) this.bigEqual += probability;
    }
  }
}
