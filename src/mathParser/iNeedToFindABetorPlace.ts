import { App, Component, MarkdownRenderer, Modal, Notice, renderMath } from "obsidian";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "./mathUtilities";
import { DebugModal, InfoModal } from "src/mathParser/desplyModals";
import { MathInfo, MathPraiser } from "./mathEngine";
import { Token } from "./mathJaxTokens";

export function processMathBlock(source: string, mainContainer: HTMLElement): void {
    console.log("Processing math block");
    mainContainer.classList.add("math-container");
    
    const userVariables: { variable: string; value: string }[] = [];
    let skippedIndexes = 0;
    
    const expressions = source.split("\n")//map(line => line.replace(/[\s]+/,'').trim()).filter(line => line && !line.startsWith("//"));
    if (expressions.length === 0) {return;}
  
    expressions.forEach((expression, index) => {
      let lineContainer: HTMLDivElement = document.createElement("div");
      lineContainer.classList.add("math-line-container", (index-skippedIndexes) % 2 === 0 ? "math-row-even" : "math-row-odd");
  
      const processMath = new ProcessMath(this.app,lineContainer,expression,userVariables);
      processMath.initialize();
      
      if(processMath.mode!=="variable"){
        mainContainer.appendChild(lineContainer);
      }
      else{skippedIndexes++;}
    });
  }
  
  class ProcessMath {
    mathInput: any;
    userVariables: { variable: string; value: string }[] = [];
    mode = "math";
    private input: string;
    private result: string;
    private container: HTMLElement;
    private app: App;
  
    constructor(app: App,container: HTMLElement,mathInput: string,userVariables: any) {
      this.app = app;
      this.container = container;
      this.mathInput = mathInput;
      this.userVariables=userVariables;
    }
    addMathInputToPrase(mathInput: string){
      this.mathInput=mathInput;
    }
  
    initialize() {
      this.assignMode();
      this.setupContainer();
      this.handleVariables();
      this.calculateMath();
      this.displayInputAndResult();
    }
  
    private setupContainer() {
      ["math-input", "math-result"].forEach(className => {
        const div = document.createElement("div");
        div.classList.add(className);
        this.container.appendChild(div);
      });
      this.container.appendChild(Object.assign(document.createElement("div"), {
        className: "math-icons",
      }));
    }
  
    private calculateMath() {
      try {
        switch (this.mode) {
          case "binom":
            // eslint-disable-next-line no-case-declarations
            const binomModel = new BinomInfoModel(this.app, this.mathInput);
            this.addInfoModal(binomModel);
            //this.result = binomModel.getEqual();
            break;
          case "cos":
            // eslint-disable-next-line no-case-declarations
            const [, sideA, sideB, sideC] = this.mathInput.map(Number)
            //this.result=findAngleByCosineRule(sideA, sideB, sideC)
            break;
          case "vec":
            // eslint-disable-next-line no-case-declarations
            //this.result=new VecProcessor(this.mathInput[1],this.mathInput[2],this.mathInput[3]);
            //this.addInfoModal(new tikzGraph(this.app, this.result.graph));
            //this.addDebugModel(new DebugModal(this.app, this.result.vecInfo.debugInfo));
            //this.result=this.result.result
            break;
          case "variable":
            break;
          default:
            const mathParser = new MathPraiser();
            mathParser.setInput(this.mathInput);
            const mathGroupVariables: Set<string> = mathParser.getMathGroupVariables();
            //if(mathGroupVariables.size===0)
            mathParser.evaluate()
            console.log("this.result", this.result, mathGroupVariables);
            this.result = mathParser.getSolutions().toString();
            console.log("solution", this.result);
            this.input=mathParser.getInput();
            this.addInfoModal(new InfoModal(this.app, mathParser.mathInfo));
            this.addDebugModel(new DebugModal(this.app, mathParser.mathInfo.debugInfo));
            break;
        }
      } catch (err) {
        this.displayError(err);
        console.error("The initial praising failed",err);
      }
    }
    private displayInputAndResult() {
      const inputDiv = this.container.querySelector(".math-input") as HTMLElement;
      const resultDiv = this.container.querySelector(".math-result") as HTMLElement;
      inputDiv.appendChild(renderMath(this.input,true))
      resultDiv.appendChild(renderMath(this.result,true))
    }
  
    private displayError(err: Error) {
      const inputDiv = this.container.querySelector(".math-input") as HTMLElement;
      const resultDiv = this.container.querySelector(".math-result") as HTMLElement;
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
      const iconsDiv = this.container.querySelector(".math-icons") as HTMLElement;
      iconsDiv.appendChild(icon);
    }
  
    private addDebugModel(modal: any) {
      const icon = Object.assign(document.createElement("div"), {
        className: "math-debug-icon",
        textContent: "🐞",
      });
      icon.onclick = () => modal.open();
      const iconsDiv = this.container.querySelector(".math-icons") as HTMLElement;
      iconsDiv.appendChild(icon);
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
  
  
  
  
  
  
  function testMathEngine(){
    const expressions=[
      {expression: String.raw`2 \frac{(5-3)34}{\sqrt{2^{2}}}0.5`,expectedOutput: '34'},
      {expression: String.raw`(x+1)(x+3)=2`,expectedOutput: 'x_1=-0.26795,x_2=-3.73205'},
      {expression: String.raw`\frac{132}{1260+x^{2}}=0.05`,expectedOutput: 'x_1=-37.14835,x_2=37.14835'},
    ]
    const results=[]
    try{
      expressions.forEach(expression => {
        const math=new MathPraiser(expression.expression);
        if (1===1*1/*math.solution!==expression.expectedOutput*/){
          //results.push({expression: expression.expression,expectedOutput: expression.expectedOutput,actualOutput: math.solution})
        }
      });
    }
    catch(e){
      console.log(e)
    }
  }
  
  
  
  
  