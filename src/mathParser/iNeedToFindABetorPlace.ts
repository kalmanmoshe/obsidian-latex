import { App, Component, MarkdownRenderer, Modal, Notice, renderMath } from "obsidian";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "./mathUtilities";
import { DebugModal, InfoModal } from "src/desplyModals";
import { MathInfo, MathPraiser } from "./mathEngine";
import { Axis } from "src/tikzjax/tikzjax";
import { FormatTikzjax } from "src/tikzjax/interpret/tokenizeTikzjax";
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
  
      const processMath = new ProcessMath(expression,userVariables, this.app,lineContainer);
      processMath.initialize();
      
      if(processMath.mode!=="variable"){
        lineContainer = processMath.container as HTMLDivElement;
        mainContainer.appendChild(lineContainer);
      }
      else{skippedIndexes++;}
    });
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
    addMathInputToPrase(mathInput: string){
      this.mathInput=mathInput;
    }
  
    initialize() {
      this.assignMode();
      this.setupContainer();
      this.handleVariables();
      this.calculateMath();
    }
  
    private setupContainer() {
      ["math-input", "math-result"].forEach(className => {
        const div = document.createElement("div");
        div.classList.add(className);
        this.container.appendChild(div);
      });
      this.container.appendChild(this.iconsDiv);
    }
  
    private calculateMath() {
      const inputDiv = this.container.querySelector(".math-input") as HTMLElement;
      const resultDiv = this.container.querySelector(".math-result") as HTMLElement;
      let solution: string='';
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
            const [ , sideA, sideB, sideC ] = this.mathInput.map(Number);
            //this.result=findAngleByCosineRule(sideA, sideB, sideC)
            break;
          case "vec":
            // eslint-disable-next-line no-case-declarations
            //this.result=new VecProcessor(this.mathInput[1],this.mathInput[2],this.mathInput[3]);
            this.addInfoModal(new tikzGraph(this.app, this.result.graph));
            this.addDebugModel(new DebugModal(this.app, this.result.vecInfo.debugInfo));
            //this.result=this.result.result
            break;
          case "variable":
            break;
          default:
            this.result = new MathPraiser();
            this.result.setInput(this.mathInput);
            const mathGroupVariables: Set<Token> = this.result.getMathGroupVariables();
            const a=this.result.evaluate()
            console.log("this.result", this.result, mathGroupVariables);
            solution = this.result.toStringLatex();
            console.log("solution", solution);
            this.addInfoModal(new InfoModal(this.app, this.result.mathInfo));
            this.addDebugModel(new DebugModal(this.app, this.result.mathInfo.debugInfo));
            this.mathInput=this.result.input;
            break;
        }
       this.addInputAndResultDiv(inputDiv, resultDiv, typeof this.mathInput==="string"?this.mathInput:this.mathInput[0], solution);
      } catch (err) {
        this.displayError(inputDiv, resultDiv, err);
        console.error("The initial praising failed",err);
      }
    }
  
    private addInputAndResultDiv(inputDiv: HTMLElement, resultDiv: HTMLElement, input: string, result: string) {
      inputDiv.appendChild(renderMath(input,true))
      //MarkdownRenderer.renderMarkdown(`\${${input}}$`, inputDiv, "", new Component());
      //const resultOutput = /(true|false)/.test(result) ? result : `\${${result}}$`;
      console.log("result",result,roundBySettings(result))
      resultDiv.appendChild(renderMath(result,true))
      //MarkdownRenderer.renderMarkdown(resultOutput, resultDiv, "", new Component());
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
    graph?: any;
  
    constructor(environment: string, mathInput: string, modifier: string) {
      this.userInput=mathInput;
      const match = environment.match(/([+-]?)([+-]?)/);
      this.environment = { X: match?.[1] ?? "+", Y: match?.[2] ?? "+" };
  
      this.modifier = modifier.length > 0 ? getUsableDegrees(Number(modifier)) : 0;
  
      this.axis=new Axis().universal(this.userInput)
      if (!this.axis.polarAngle)
        this.axis.cartesianToPolar();
      this.vecInfo.addDebugInfo("axis",this.axis);
      this.addResult();
      this.addGraph();
    }
    addResult(){
      if (this.userInput.includes(":"))
        this.result=`x = ${this.axis.cartesianX}\\quad,y = ${this.axis.cartesianY}`
      else
        this.result=`angle = ${this.axis.polarAngle}\\quad,length = ${this.axis.polarLength}`
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
  
  
     // const draw= [ancer,'--',new Coordinate({mode:"node-inline",label: this.axis.polarLength.toString()}),this.axis];
      //const drawX= [ancer,'--',new Coordinate({mode:"node-inline",label: this.axis.cartesianX.toString()}),new Axis(this.axis.cartesianX,0)];
      //const drawY= [ancer,'--',new Coordinate({mode:"node-inline",label: this.axis.cartesianY.toString()}),new Axis(0,this.axis.cartesianY)];
  
      this.graph=[
        //new Formatting("globol",{color: "white",scale: 1,}),
        //new Draw({drawArr: draw,formattingObj: {lineWidth: 1,draw: "red",arror: "-{Stealth}"}}),
        //new Draw({drawArr: drawX,formattingObj: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"}}),
        //new Draw({drawArr: drawY,formattingObj: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"}}),
      ]
      
      
      this.vecInfo.addDebugInfo("this.graph",JSON.stringify(this.graph.tokens,null,1));
      this.vecInfo.addDebugInfo("this.graph.toString()\n",JSON.stringify(this.graph.toString()));
      /* Generate LaTeX code for vector components and main vector
      const t = String.raw`
  
        % Angle Annotation
        %\ang{X}{anc}{vec}{}{${roundBySettings(vectorAngle)}$^{\circ}$}
      `.replace(/^\s+/gm, "");*/
      this.vecInfo.addDebugInfo("Scaling factor", scale);
    }
  }
  
  
  
  
  
  class tikzGraph extends Modal {
    tikz: FormatTikzjax;
    constructor(app: App,tikzCode: any){
      super(app);
      this.tikz=new FormatTikzjax(tikzCode);
    }
  
    onOpen() {
      const { contentEl } = this;
      const code=this.tikz;
      const script = contentEl.createEl("script");
      script.setAttribute("type", "text/tikz");
      script.setAttribute("data-show-console", "true");
      script.setText(code.getCode(this.app));
      
      const actionButton = contentEl.createEl("button", { text: "Copy graph", cls: "info-modal-Copy-button" });
  
      actionButton.addEventListener("click", () => {
        navigator.clipboard.writeText(this.tikz.getCode(this.app));
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
  
  
  
  
  