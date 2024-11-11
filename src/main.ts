import {Plugin, MarkdownRenderer, App, Modal, Component, Setting,Notice, WorkspaceWindow,} from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { CustomInputModal, HistoryModal, InputModal, vecInpotModel } from "./temp";
import {MathPluginSettings, DEFAULT_SETTINGS, MathPluginSettingTab,} from "./settings";
import { calculateBinom, degreesToRadians, findAngleByCosineRule, getUsableDegrees, polarToCartesian, radiansToDegrees, roundBySettings } from "./mathUtilities.js";
import { Axis, Coordinate, Draw, FormatTikzjax, Formatting, Tikzjax } from "./tikzjax/tikzjax";
import { NumeralsSuggestor } from "./suggestor.js";

export default class MathPlugin extends Plugin {
  settings: MathPluginSettings;
  tikzProcessor: Tikzjax
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MathPluginSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
    this.registerCommands();
    this.registerEditorSuggest(new NumeralsSuggestor(this));


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
  axis: Axis;
  modifier: number;
  result: string;
  graph?: FormatTikzjax;

  constructor(environment: string, mathInput: string, modifier: string) {
    const match = environment.match(/([+-]?)([+-]?)/);
    this.environment = { X: match?.[1] ?? "+", Y: match?.[2] ?? "+" };

    this.modifier = modifier.length > 0 ? getUsableDegrees(Number(modifier)) : 0;

    this.axis=new Axis().universal(mathInput)
    this.addGraph();
  }

  
  addGraph() {
    const targetSize = 10;
    const maxComponent = Math.max(Math.abs(this.axis.cartesianX), Math.abs(this.axis.cartesianY));

    // Determine scaling factor
    let scale = 1;
    if (maxComponent < targetSize) {
      scale = targetSize / maxComponent;
    } else if (maxComponent > targetSize) {
      scale = targetSize / maxComponent;
    }
    // i need to make it "to X axis"
    //const vectorAngle = getUsableDegrees(radiansToDegrees(Math.atan2(scaledY, scaledX)));
    
    const ancer=new Axis(0,0);
    ancer.addCartesian();

    let axis1=this.axis.clone();
    axis.cartesianY=0

    const c1=new Coordinate("node-inline",axis);

    const formatting={lineWidth: 1,draw: "yellow",arror: "-{Stealth}"}
    const draw= [ancer,'--',c1,ancer]

    this.graph=new FormatTikzjax([
      new Formatting().quickAdd("globol",{color: "white",scale: 1,}),
      new Draw({formatting: formatting,draw: draw},undefined,"draw",),
      //new Draw({formatting: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"},draw: [ancer,'--',new Coordinate(),new Axis()]},undefined,"draw",),
      //new Draw({formatting: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"},draw: [ancer,'--',new Coordinate(),new Axis()]},undefined,"draw",),
    ])
    
    this.vecInfo.addDebugInfo(JSON.stringify(this.graph.tokens,null,1));
    this.vecInfo.addDebugInfo(JSON.stringify(this.graph.toString(),));
    /* Generate LaTeX code for vector components and main vector
    const t = String.raw`

      % Angle Annotation
      %\ang{X}{anc}{vec}{}{${roundBySettings(vectorAngle)}$^{\circ}$}
    `.replace(/^\s+/gm, "");*/

    this.vecInfo.addDebugInfo("Scaling factor", scale);
    //this.vecInfo.addDebugInfo("TikZ graph code", tikzCode);
    //this.graph = tikzCode;
  }
}



class tikzGraph extends Modal {
  tikz: FormatTikzjax
  constructor(app: App,tikzCode: FormatTikzjax){
    super(app);
    this.tikz=tikzCode;
  }

  onOpen() {
    const script = this.contentEl.createEl("script");
    script.setAttribute("type", "text/tikz");
    script.setAttribute("data-show-console", "true");
    script.setText(this.tikz.getCode());
    
    const actionButton = this.contentEl.createEl("button", { text: "Copy graph", cls: "info-modal-Copy-button" });

    actionButton.addEventListener("click", () => {
      navigator.clipboard.writeText(this.tikz.getCode());
      new Notice("Graph copied to clipboard!");
    });
  }
  onClose(): void {
    const { contentEl } = this;
      contentEl.empty();
  }
}

type DistributionType = 'normal' | 'binomial' | 'poisson';

class Distribution {
  private type: DistributionType;
  private mean: number;
  private variance: number;
  private stdDev: number;

  // For Binomial Distribution
  private trials: number;
  private probability: number;

  // For Poisson Distribution
  private lambda: number;

  constructor(type: DistributionType, params: Record<string, number>) {
    this.type = type;

    // Initialize based on distribution type
    switch (type) {
      case 'normal':
        this.mean = params.mean || 0;
        this.stdDev = params.stdDev || 1;
        this.variance = this.stdDev ** 2;
        break;
      case 'binomial':
        this.trials = params.trials || 1;
        this.probability = params.probability || 0.5;
        this.mean = this.trials * this.probability;
        this.variance = this.mean * (1 - this.probability);
        this.stdDev = Math.sqrt(this.variance);
        break;
      case 'poisson':
        this.lambda = params.lambda || 1;
        this.mean = this.lambda;
        this.variance = this.lambda;
        this.stdDev = Math.sqrt(this.variance);
        break;
      default:
        throw new Error('Unsupported distribution type');
    }
  }

  /**
   * Calculate the probability density function (PDF) for the Normal Distribution.
   */
  public normalPDF(x: number): number {
    if (this.type !== 'normal') {
      throw new Error('PDF only applies to the Normal Distribution');
    }
    const expPart = Math.exp(-((x - this.mean) ** 2) / (2 * this.variance));
    return (1 / (this.stdDev * Math.sqrt(2 * Math.PI))) * expPart;
  }

  /**
   * Calculate the cumulative distribution function (CDF) for the Normal Distribution.
   */
  public normalCDF(x: number): number {
    if (this.type !== 'normal') {
      throw new Error('CDF only applies to the Normal Distribution');
    }
    return 0.5 * (1 + this.erf((x - this.mean) / (Math.sqrt(2) * this.stdDev)));
  }

  /**
   * Calculate the probability mass function (PMF) for the Binomial Distribution.
   */
  public binomialPMF(x: number): number {
    if (this.type !== 'binomial') {
      throw new Error('PMF only applies to the Binomial Distribution');
    }
    const combination = this.factorial(this.trials) /
      (this.factorial(x) * this.factorial(this.trials - x));
    return combination * Math.pow(this.probability, x) * Math.pow(1 - this.probability, this.trials - x);
  }

  /**
   * Calculate the probability mass function (PMF) for the Poisson Distribution.
   */
  public poissonPMF(x: number): number {
    if (this.type !== 'poisson') {
      throw new Error('PMF only applies to the Poisson Distribution');
    }
    return (Math.pow(this.lambda, x) * Math.exp(-this.lambda)) / this.factorial(x);
  }

  /**
   * Error function approximation for Normal Distribution CDF.
   */
  private erf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const a = 0.3275911;
    const p = 0.254829592;
    const q = -0.284496736;
    const r = 1.421413741;
    const s = -1.453152027;
    const t = 1.061405429;
    const u = 1 + a * Math.abs(x);
    const poly = (((((p * u + q) * u + r) * u + s) * u + t) * u);
    return sign * (1 - poly * Math.exp(-x * x));
  }

  /**
   * Factorial function.
   */
  private factorial(n: number): number {
    if (n < 0) return NaN;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  }
}


class DistributionModel extends Modal {
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



