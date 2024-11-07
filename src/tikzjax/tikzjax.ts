import { App, Component, Editor, MarkdownRenderer, MarkdownView, WorkspaceWindow } from "obsidian";
import MathPlugin from "src/main";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { cartesianToPolar, degreesToRadians, findIntersectionPoint, findSlope, polarToCartesian } from "src/mathUtilities.js";
import { DebugModal } from "src/desplyModals.js";

import { EditorView } from "@codemirror/view";
import { error } from "console";
import { flattenArray } from "src/mathEngine.js";


export class Tikzjax {
    app: App;
    plugin: MathPlugin;
    activeView: MarkdownView | null;

    constructor(app: App,plugin: MathPlugin) {
      this.app=app;
      this.activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      this.plugin=plugin;
    }
    
    readyLayout(){
      this.plugin.app.workspace.onLayoutReady(() => {
        this.loadTikZJaxAllWindows();
        this.plugin.registerEvent(this.app.workspace.on("window-open", (win, window) => {
          this.loadTikZJax(window.document);
        }));
      });
    }
    
  
    loadTikZJax(doc: Document) {
          const s = document.createElement("script");
          s.id = "tikzjax";
          s.type = "text/javascript";
          s.innerText = tikzjaxJs;
          doc.body.appendChild(s);
  
  
          doc.addEventListener("tikzjax-load-finished", this.postProcessSvg);
      }
  
      unloadTikZJax(doc: Document) {
          const s = doc.getElementById("tikzjax");
          s?.remove();
  
          doc.removeEventListener("tikzjax-load-finished", this.postProcessSvg);
      }
  
      loadTikZJaxAllWindows() {
          for (const window of this.getAllWindows()) {
              this.loadTikZJax(window.document);
          }
      }
  
      unloadTikZJaxAllWindows() {
          for (const window of this.getAllWindows()) {
              this.unloadTikZJax(window.document);
          }
      }
  
      getAllWindows() {
          const windows = [];
          
          // push the main window's root split to the list
          windows.push(this.app.workspace.rootSplit.win);
          
          // @ts-ignore floatingSplit is undocumented
          const floatingSplit = this.app.workspace.floatingSplit;
          floatingSplit.children.forEach((child: any) => {
              // if this is a window, push it to the list 
              if (child instanceof WorkspaceWindow) {
                  windows.push(child.win);
              }
          });
  
          return windows;
      }
  
  
    registerTikzCodeBlock() {
          this.plugin.registerMarkdownCodeBlockProcessor("tikz", (source, el, ctx) => {
            const icon = Object.assign(el.createEl("div"), {
                className: "math-debug-icon",
                textContent: "🛈",
            });
            try{
            const script = el.createEl("script");
            script.setAttribute("type", "text/tikz");
            script.setAttribute("data-show-console", "true");
            
            script.setText(this.tidyTikzSource(source,icon));
            }
            catch(e){
                el.innerHTML = "";
                const errorDisplay = el.createEl("div", { cls: "math-error-line" });
                errorDisplay.innerText = `Error: ${e.message}`;
                errorDisplay.classList.add("error-text");
                console.error("TikZ Processing Error:", e);
            }
          });
      }
  
      addSyntaxHighlighting() {
          // @ts-ignore
          window.CodeMirror.modeInfo.push({name: "Tikz", mime: "text/x-latex", mode: "stex"});
      }
  
      removeSyntaxHighlighting() {
          // @ts-ignore
          window.CodeMirror.modeInfo = window.CodeMirror.modeInfo.filter(el => el.name != "Tikz");
      }
  
    tidyTikzSource(tikzSource: string,icon: HTMLElement) {
        
        const remove = "&nbsp;";
        tikzSource = tikzSource.replaceAll(remove, "");let lines = tikzSource.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);

        const tikzjax=new FormatTikzjax(lines.join("\n"));
        icon.onclick = () => new DebugModal(this.app,tikzjax.debugInfo).open();
        return tikzjax.getCode();
    }
  
      colorSVGinDarkMode(svg: string) {
        svg = svg.replaceAll(/("#000"|"black")/g, "\"currentColor\"")
                .replaceAll(/("#fff"|"white")/g, "\"var(--background-primary)\"");
        return svg;
      }
  
  
      optimizeSVG(svg: string) {
          return optimize(svg, {plugins:
              [
                  {
                      name: "preset-default",
                      params: {
                          overrides: {
                              cleanupIDs: false
                          }
                      }
                  }
              ]
          // @ts-ignore
          })?.data;
      }
  
  
      postProcessSvg = (e: Event) => {
  
          const svgEl = e.target as HTMLElement;
          let svg = svgEl.outerHTML;
  
          if (this.plugin.settings.invertColorsInDarkMode) {
            svg = this.colorSVGinDarkMode(svg);
          }
  
          svg = this.optimizeSVG(svg);
  
          svgEl.outerHTML = svg;
      }
}
















interface token  {
    X?: number;
    Y?: number;
    type?: string;
    coordinateName?: string;
    coordinates?: any;
}




const parseNumber = (value: string) => {
    console.log("value",value,parseFloat("-0.5"))
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};

flattenArray(){
    
}


class Axis {
    private cartesianX: number;
    private cartesianY: number;
    private polarAngle: number;
    private polarLength: number;
    ancer: Axis;
    makeAMFDeszen(coordinate: string, tokens: FormatTikzjax){
        const a=getRegex();
        const coordinates=coordinate.match(new RegExp(String.raw`${(a.basic)}`));
        if (!coordinates||coordinates.length<1){
            throw new Error("coordinate isnt valed expected a valed coord");
        }
        let coordinateArr: Array<Axis>=[];
        coordinates.forEach((coordinate: string)=> {
            let axis: Axis;
            switch (true) {
                case /,/.test(coordinate):
                    axis=new Axis()
                    axis.addCartesian(coordinate);
                    coordinateArr.push(axis)
                    break;
                case /:/.test(coordinate):
                    axis=new Axis();
                    axis.addPloar(coordinate);
                    coordinateArr.push(axis);
                case (/[\d\w]+/).test(coordinate):
                    axis=tokens.findOriginalValue(coordinate);
                    if (axis===undefined){
                        throw new Error(`codint find the coordinit ${coordinate}`);
                    }
                    coordinateArr.push(axis);
                    break;
                default:
                    throw new Error("this coord fomate is nut sported");
            }
        });
        return this;
    }

    addCartesian(polarAngle: any,polarLength?: any){
        if(!polarLength){
            [polarAngle,polarLength]=polarAngle.split(',').map(Number);
        }
        ({X: this.cartesianX,Y:this.cartesianY} = polarToCartesian(this.polarAngle,this.polarLength))
    }

    addPloar(x: string|number,y?:number){
        if(!y&&typeof x==="string"){
            [x,y]=x.split(':').map(Number);
        }
        ({angle: this.polarAngle, length: this.polarLength}=cartesianToPolar(this.cartesianX,this.cartesianY))
    }

    intersection(){
        const originalCoords = coord
            .replace(/intersection\s?of\s?/g, "")
            .replace(/(\s*and\s?|--)/g, " ")
            .split(" ")
            .map(findOriginalValue)
            .filter((token): token is Coordinate => token !== undefined);

        if (originalCoords.length < 4) {
            throw new Error("Intersection had undefined coordinates or insufficient data");
        }
        const slopes = [
            findSlope(originalCoords[0], originalCoords[1]),
            findSlope(originalCoords[2], originalCoords[3]),
        ];
        return findIntersectionPoint(originalCoords[0], originalCoords[2], slopes[0], slopes[1]);
    };

    getAxis(): Axis{
        return this;
    }
}

function parseCoordinates(
    coordinate: string,
    tokens: Array<Coordinate | string | Draw | token>,
    formatting?: string,
    coordinatesArray?: Array<Coordinate | string>
): { X: number; Y: number;} {
    let xValue = 0, yValue = 0;

    const handleFormatting = (): { X: number; Y: number } => {
        let coor = { X: 0, Y: 0 };
    
        if (formatting && coordinatesArray && coordinatesArray.length > 0) {
            if (formatting === "--+") {
                const found = coordinatesArray.find((token: string | Coordinate) => token instanceof Coordinate);
                coor = found && typeof found !== "string" ? found : coor;
            } else if (formatting === "--++") {
                const found = [...coordinatesArray].reverse().find((token: string | Coordinate) => token instanceof Coordinate);
                coor = found && typeof found !== "string" ? found : coor;
            }
        }
        return coor;
    };
    
    

    if(typeof coordinate!=="string"){
        throw new Error(`Expected coordinate to be string coordinate was ${typeof coordinate}`);
    }
    const ca = String.raw`[\w\d\s\-,.:]`; 
    const regex = new RegExp(String.raw`\$\((${ca}+)\)([\d+\w:!.]+)\((${ca}+)\)\$`);
    const match = coordinate.match(regex);
    if (match) {
        const coordinate1 = parseCoordinates(match[1], tokens);
        const coordinate2 = parseCoordinates(match[3], tokens);
        let matchTwo=match[2].match(new RegExp(String.raw`!(${ca})!`));
        if (matchTwo){
            if(matchTwo[1]!==null)
            [xValue, yValue] = [(coordinate1.X + coordinate2.X)*parseNumber(matchTwo[1]?.toString()), (coordinate1.Y + coordinate2.Y)*parseNumber(matchTwo[1]?.toString())];
        }

        else {
            [xValue, yValue] = [coordinate1.X + coordinate2.X, coordinate1.Y + coordinate2.Y];
        }
    }

    // Apply formatting adjustments if available
    const formattingAdjustment = handleFormatting();
    xValue += formattingAdjustment.X;
    yValue += formattingAdjustment.Y;
    
    if(typeof xValue!=="number"||typeof yValue!=="number"){
        throw new Error("Raising the coordinates failed. Couldn't find appropriate Xvalue or Yvalue");
    }
}


export class Coordinate {
    mode: string;
    axis: Axis;
    original: string;
    coordinateName: string|undefined;
    formatting: string;
    label: string;
    quadrant: number;

    asCoordinate(match: RegExpMatchArray, tokens: FormatTikzjax) {
        this.mode="coordinate";
        [this.original, this.coordinateName, this.label, this.formatting] = [match[1], match[2], match[3], match[4]];
        this.axis=new Axis().makeAMFDeszen(this.original,tokens);
        return this;
    }

    asNode(match: RegExpMatchArray, tokens: FormatTikzjax) {
        this.mode="node";
        [this.original, this.coordinateName, this.label, this.formatting] = [match[1], match[2], match[3], match[4]];
        this.axis=new Axis().makeAMFDeszen(this.original,tokens);
        return this;
    }

    simpleXY(coordinate: string, tokens: Array<any>, previousFormatting?: string, coordinatesArray?: any) {
        Object.assign(this, parseCoordinates(coordinate, tokens,previousFormatting,coordinatesArray));
        return this;
    }

    addXY(X: number, Y: number) {
        [this.X, this.Y] = [X, Y];
        return this;
    }

    toString() {
        return `\\coor{${this.X},${this.Y}}{${this.coordinateName || ""}}{${this.label || ""}}{${generateFormatting(this) || ""}}`;
    }

    toStringDraw() {
        return `(${this.coordinateName ? this.coordinateName : this.X + "," + this.Y})`;
    }

    addQuadrant(midPoint: Coordinate) {
        const xDirection = this.X > midPoint.X ? 1 : -1;
        const yDirection = this.Y > midPoint.Y ? 1 : -1;
        this.quadrant = yDirection === 1 ? (xDirection === 1 ? 1 : 2) : (xDirection === 1 ? 4 : 3);
    }
}
type CoordinateType =Array<Coordinate | { type: string; text: any; formatting: any, value?: any}>;

class Draw {
    formatting: string;
    coordinates: CoordinateType;

    constructor(match: RegExpMatchArray, tokens: FormatTikzjax) {
        this.formatting = match[1];
        this.coordinates = this.fillCoordinates(this.getSchematic(match[2]), tokens);
    }

    fillCoordinates(schematic: any[], tokens: FormatTikzjax) {
        const coorArr: CoordinateType=[];
        for (let i = 0; i < schematic.length; i++) {
            if (schematic[i].type === "coordinate") {
                let previousFormatting;

                if (i > 0 && schematic[i - 1].type === "formatting") {
                    previousFormatting = schematic[i - 1].value;
                } else if (i > 1 && schematic[i - 1].type === "node" && schematic[i - 2].type === "formatting") {
                    previousFormatting = schematic[i - 2].value;
                }
                coorArr.push(new Coordinate().simpleXY(schematic[i].value, tokens.tokens, previousFormatting, coorArr));
            } else{
                coorArr.push({...schematic[i]});
            }
        }
        return coorArr;
    }

    getSchematic(draw: string) {
        const coordinatesArray = [];
        const nodeRegex = new RegExp(String.raw`node\s*\[(${f}*)\]\s*{(${t}+)}`);
        const formattingRegex = /(--cycle|cycle|--\+\+|--\+|--|-\||\|-|grid|circle|rectangle)/;
        const ca = String.raw`\w\d\s\-,.:`; // Define allowed characters for `ca`
        const coordinateRegex = new RegExp(String.raw`(\([${ca}]+\)|\(\$\([${ca}]+\)[${ca}!:+\-]+\([${ca}]+\)\$\))`);
        
        let i = 0;
        let loops = 0;
        while (i < draw.length && loops < 100) { // Increase loop limit or add condition based on parsed length
            loops++;
            const coordinateMatch = draw.slice(i).match(coordinateRegex);
            console.log(coordinateMatch)
            if (coordinateMatch?.index === 0) {
                coordinatesArray.push({ type: "coordinate", value: coordinateMatch[1] });
                i += coordinateMatch[0].length;
            }

            const formattingMatch = draw.slice(i).match(formattingRegex);
            if (formattingMatch?.index === 0) {
                i += formattingMatch[0].length;
                coordinatesArray.push({ type: "formatting", value: formattingMatch[0] });
            }

            const nodeMatch = draw.slice(i).match(nodeRegex);
            if (nodeMatch?.index === 0) {
                coordinatesArray.push({
                    type: "node",
                    formatting: nodeMatch[1] || "",
                    value: nodeMatch[2]
                });
                i += nodeMatch[0].length;
            }
        }
        if (loops === 100) {
            throw new Error("Parsing exceeded safe loop count");
        }

        return coordinatesArray;
    }

    isCoordinate(obj: any): obj is Coordinate {
        return obj && obj instanceof Coordinate;
    }

    toString() {
        let result = `\\draw [${this.formatting}]`;
        let beforeToken: Coordinate | undefined;
        let afterToken: Coordinate | undefined;
        let slope;

        this.coordinates.forEach((coordinate: any, index: number) => {
            switch (coordinate.type) {
                case "node": {
                    // Wrap in braces to create a block scope
                    const afterCoordinates = this.coordinates.slice(index).filter(this.isCoordinate);
                    afterToken = afterCoordinates.length > 0 ? afterCoordinates[0] : undefined;

                    if (!afterToken && this.coordinates.some((token: any) => token?.value === "cycle")) {
                        afterToken = this.isCoordinate(this.coordinates[0]) ? this.coordinates[0] : undefined;
                    }

                    const beforeCoordinates = this.coordinates.slice(0, index).reverse().filter(this.isCoordinate);
                    beforeToken = beforeCoordinates.length > 0 ? beforeCoordinates[0] : undefined;

                    if (beforeToken && afterToken) {
                        slope = findSlope(beforeToken, afterToken);
                        result += `node [${sideNodeFormatting(coordinate.formatting, slope, beforeToken, afterToken)}] {${coordinate.value}} `;
                    } else {
                        result += `node [${coordinate.formatting}] {${coordinate.value}} `;
                    }
                    break;
                }
                case "formatting": {
                    result += coordinate.value.match(/(--\+\+|--\+|--)/)?"--":coordinate.value;
                    break;
                }
                default: {
                    result += coordinate.coordinateName
                        ? `(${coordinate.coordinateName})`
                        : `(${coordinate.X},${coordinate.Y})`;
                    break;
                    
                }
            }
        });

        return result + ";";
    }
}



class FormatTikzjax {
	source: string;
    tokens: Array<token | string|any>=[];
    midPoint: Coordinate;
	processedCode="";
    debugInfo = "";
    
	constructor(source: string) {
		this.source = source.replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "");
        this.debugInfo+=this.source;
        this.tokenize();
        this.findMidpoint();
        this.applyQuadrants();
        this.debugInfo+="\n"+JSON.stringify(this.midPoint,null,0.01)+"\n"
        this.debugInfo+=JSON.stringify(this.tokens,null,0.01)+"\n\n"

        this.processedCode += this.reconstruct();
        this.debugInfo+=this.processedCode;
	}
    getCode(){
        return getPreamble()+this.processedCode+"\n\\end{tikzpicture}\\end{document}";
    }
    tokenize() {
        
        const ca = String.raw`\w\d\s\-,.:`; // Define allowed characters for `ca`
        const c = new RegExp(String.raw`([${ca}]+|\$\([${ca}]+\)[${ca}!:+\-]+\([${ca}]+\)\$)`, "g");

        // Define `coorRegex` with escaped characters for specific matching
        const cn = String.raw`[\w_\d\s]`; // Coordinate name
        const t = String.raw`[\w\d\s\-,.:$(!)_\-\{}\+\\]`; // Text with specific characters
        const f = String.raw`[\w\s\d=:,!';&*\{\}%\-<>]`; // Formatting with specific characters

        // Define `coorRegex` using escaped braces and patterns
        const coorRegex = new RegExp(String.raw`\\coor\{(${c.source})\}\{(${cn}*)\}\{(${t}*)\}\{(${f}*)\}`, "g");
        const nodeRegex = new RegExp(String.raw`\\node\{(${c})\}\{(${cn}*)\}\{(${t}*)\}\{(${f}*)\}`, "g");
        const se = new RegExp(String.raw`\\node\s*(${t}*)\s*at\s*(${c}*)\s*\[(${f}*)\]\s*\{(${t}*)\}`, "g");
        const ss = new RegExp(String.raw`\\coordinate\s*(\[label=\{\[(.*?)\]:\\\w*\s*([\w\s]*)\}\])?\s*\((${cn}+)\)\s*at\s*\((${c.source})\);`, "g");
        const drawRegex = new RegExp(String.raw`\\draw\[(${f}*)\]([^;]*);`, "g");
        const xyaxisRegex = new RegExp(String.raw`\\xyaxis({['"\`\w\d-<>\$,]+})?({['"\`\w\d-<>$,]+})?`, "g");
        const gridRegex = new RegExp(String.raw`\\grid({[\d-.]+})?`, "g");
        const circleRegex = new RegExp(String.raw`\\circle\{(${c}+)\}\{(${c}+)\}\{(${c}+)\}\{([\w\s\d]*)\}`, "g");
        const massRegex = new RegExp(String.raw`\\mass\{(${c}+)\}\{(${t}*)\}\{?([-|>]*)?\}?\{?([-.\s\d]*)?\}?`, "g");
        const vecRegex = new RegExp(String.raw`\\vec\{(${c}+)\}\{(${c}+)\}\{(${t}*)\}\{?([-|>]*)?\}?`, "g");
        
        const regexPatterns = [coorRegex, se, ss, nodeRegex, drawRegex, xyaxisRegex, gridRegex, circleRegex, massRegex, vecRegex];
        const matches = regexPatterns.flatMap(pattern => [...this.source.matchAll(pattern)]);
        
        // Sort matches by their index to ensure correct order
        matches.sort((a, b) => (a.index || 0) - (b.index || 0));
      
        let currentIndex = 0;
        for (const match of matches) {
          if (match.index !== undefined && match.index > currentIndex) {
            this.tokens.push(this.source.slice(currentIndex, match.index));
          } 

          if (match[0].startsWith("\\coor")) {
            if(match[0].startsWith("\\coordinate")){
                ([match[1],match[2],match[4],match[5]]=[match[5],match[4],match[1],match[2]])
            }
            //console.log(match)
            this.tokens.push(new Coordinate().asCoordinate(match,this.tokens));
          } else if (match[0].startsWith("\\draw")) {
            this.tokens.push(new Draw(match, this));
          } else if (match[0].startsWith("\\xyaxis")) {
            this.tokens.push(dissectXYaxis(match));
          } else if (match[0].startsWith("\\grid")) {
            this.tokens.push({type: "grid", rotate: match[1]});
          } else if (match[0].startsWith("\\node")) {
            if (match[0].match(/\\node\s*\(/)){
                ([match[1],match[3],match[4],match[3]]=[match[2],match[1],match[3],match[4]])
            }
            this.tokens.push(new Coordinate().asNode(match, this.tokens));
          } else if (match[0].startsWith("\\circle")) {
            this.tokens.push({
              type: "circle",
              formatting: match[4],
              coordinates: [
                new Coordinate().simpleXY(match[1], this.tokens),
                new Coordinate().simpleXY(match[2], this.tokens),
                new Coordinate().simpleXY(match[3], this.tokens),
              ],
            });
          } else if (match[0].startsWith("\\mass")) {
            this.tokens.push({
              type: "mass",
              text: match[2] || "",
              formatting: match[3] || null,
              rotate: Number(match[4]) || 0,
              ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[1], this.tokens)),
            });
          } else if (match[0].startsWith("\\vec")) {
            this.tokens.push({
              type: "vec",
              text: match[3] || "",
              formatting: match[4] || null,
              rotate: Number(match[5]) || 0,
              anchor:{...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[1], this.tokens)),},
              ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[2], this.tokens)),
            });
          }
      
          if (match.index !== undefined) {
            currentIndex = match.index + match[0].length;
          }
        }
        
        if (currentIndex < this.source.length) {
            this.tokens.push(this.source.slice(currentIndex));
        }
    }

    findMidpoint() {
        let coordinates = this.tokens.filter((token: token) => token instanceof Coordinate);
        this.tokens
        .filter((token: token) => token instanceof Draw)
        .forEach((object: Draw) => {
            coordinates = coordinates.concat(
                object.coordinates.filter((token: token) => token instanceof Coordinate)
            );
        });
        let sumOfX = 0, sumOfY = 0;
        coordinates.forEach((coordinate: token) => {
          sumOfX += Number(coordinate.X);
          sumOfY += Number(coordinate.Y); 
        });

        this.midPoint=new Coordinate().addXY(
            sumOfX / coordinates.length!==0?coordinates.length:1
            ,sumOfY / coordinates.length!==0?coordinates.length:1
        )
    }
    findOriginalValue = (value: string) => {
        const og = this.tokens.find(
            (token: token) =>
                (token instanceof Coordinate || token?.type === "node") && token.coordinateName === value
        );
        return og instanceof Coordinate ? og : undefined;
    };
    applyQuadrants() {
        this.tokens.forEach((token: any) => {
          if (typeof token === "object" && token !== null&&token.type==="coordinate") {
            token.addQuadrant(this.midPoint);
          }
        });
    }

    reconstruct(){
        let codeBlockOutput = "";
        const extremeXY=getExtremeXY(this.tokens);
        this.tokens.forEach((token: any) => {

            if(token instanceof Coordinate||token instanceof Draw){
                codeBlockOutput +=token.toString()
            }
          if (typeof token === "object") {
            /*switch(token.type){
                case "coordinate":
                    codeBlockOutput += token.toString();
                    break;
                case "node":
                    codeBlockOutput += `\\node (${token.coordinateName}) at (${token.X},${token.Y}) [${generateFormatting(token)}] {${token.label}};`;
                    break;
                case "draw":
                    codeBlockOutput+=token.toString()
                    break;
                case "xyaxis":
                    codeBlockOutput+=`\\draw [${token.xDirection==="up"?"-{Stealth}":"{Stealth}-"}](${extremeXY.minX},0)`
                    codeBlockOutput+=`--(${extremeXY.maxX},0)`
                    
                    codeBlockOutput+=token.Xnode?`node [${token.Xformatting.substring(1,token.Xformatting.length-1)}] {${token.Xnode}};`:";"
                    
                    codeBlockOutput+=`\\draw [${token.yDirection==="up"?"-{Stealth}":"{Stealth}-"}](${extremeXY.minY},0)`
                    codeBlockOutput+=`--(0,${extremeXY.maxY})`
                    codeBlockOutput+=token.Ynode?`node [${token.Yformatting.substring(1,token.Yformatting.length-1)}] {${token.Ynode}};`:";"
                    
                    break;
                case "grid":
                    codeBlockOutput+=`\\draw [] (${extremeXY.minX},${extremeXY.minY}) grid [rotate=${token?.rotate||0},xstep=.75cm,ystep=.75cm] (${extremeXY.maxX},${extremeXY.maxY});`
                    break;
                case "circle":
                    temp=calculateCircle(token.coordinates[0],token.coordinates[1],token.coordinates[2])
                    codeBlockOutput+=`\\draw [line width=1pt,${token.formatting}] (${temp?.center.X},${temp?.center.Y}) circle [radius=${temp?.radius}];`
                    break;
                case "mass":
                    temp=token.formatting!==null?token.formatting==="-|"?"south":"north":"north";
                    codeBlockOutput+=`\\node[fill=yellow!60,draw,text=black,anchor= ${temp},rotate=${token.rotate}] at (${token.X},${token.Y}){${token.text}};`
                    break;
                case "vec":
                    codeBlockOutput+=`\\draw [-{Stealth},${token.formatting||""}](${token.anchor.X},${token.anchor.Y})--node [] {${token.text}}(${token.X+token.anchor.X},${token.Y+token.anchor.Y});`
            }*/
          } else {
            codeBlockOutput += token;
          }
        });
        return codeBlockOutput;
    }
}






function dissectXYaxis(match: RegExpMatchArray) {
    let Xnode:RegExpMatchArray|string="", Ynode:RegExpMatchArray|string="";

    if (match[1] && match[2]) {
        Xnode = match[1].match(/['`"]([\w\d&$]+)['`"]/)||"";
        Ynode = match[2].match(/['`"]([\w\d&$]+)['`"]/)||"";
        Xnode=Xnode[0].substring(1,Xnode.length)
        Ynode=Ynode[0].substring(1,Ynode.length)
    }
    
    return {
        type: "xyaxis",
        Xformatting: match[1]?.replace(/(->|<-|['`"].*?['`"])/g, ""),
        Yformatting: match[2]?.replace(/(->|<-|['`"].*?['`"])/g, ""),
        xDirection: match[1] && /->/.test(match[1]) ? "left" : "right",
        yDirection: match[2] && /->/.test(match[2]) ? "down" : "up",
        Xnode: Xnode,
        Ynode: Ynode,
    };
}

function getRegex(){
    return {
        basic: `[\w\d\s-,.:]`,
        coordinate: new RegExp(String.raw`(${this.basic}+|1)`),
        coordinateName:new RegExp(String.raw`[\w_\d\s]`),
        text: new RegExp(String.raw`[\w\d\s-,.:$(!)_\-\{}+\\]`),
        formatting: new RegExp(String.raw`[\w\s\d=:,!';&*[\]\{\}%-<>]`),
    }
}

  








function getExtremeXY(tokens: any) {
let maxX = -Infinity;
let maxY = -Infinity;
let minX = Infinity;
let minY = Infinity;

tokens.forEach((token: any) => {
    if (token.type === "coordinate") {
    if (token.X > maxX) maxX = token.X;
    if (token.X < minX) minX = token.X;

    if (token.Y > maxY) maxY = token.Y;
    if (token.Y < minY) minY = token.Y;
    }
});

return {
    maxX,maxY,minX,minY,
};
}


function sideNodeFormatting(formatting: string,slope: number,beforeToken: Coordinate,afterToken: Coordinate) {
    if (formatting.match(/(above|below|left|right)/)) {
        return formatting;
    }
    formatting+=formatting.length>0?",":"";

    const edge1 = beforeToken.quadrant?.toString()||"";
    const edge2 = afterToken.quadrant?.toString()||"";

    if (slope!==Infinity&&slope!==-Infinity){
        if (slope !== 0) {
        formatting += "sloped, ";
        }
        if (/(3|4)/.test(edge1) && /(3|4)/.test(edge2)) {
        formatting += "below ";
        }
        else if (/(1|2)/.test(edge1) && /(1|2)/.test(edge2)) {
        formatting += "above ";
        }
    }

    if (slope !== 0){
        if (/(1|4)/.test(edge1) && /(1|4)/.test(edge2)) {
        formatting += "right";
        }
        else if(/(2|3)/.test(edge1) && /(2|3)/.test(edge2)){
        formatting += "left";
        }
    }
    return formatting;
}

function generateFormatting(coordinate: Coordinate){
    if (typeof coordinate.label !== "string"){ return ""; }
    const formatting = coordinate.formatting?.split(",") || [];
    if (formatting.some((value: string) => /(above|below|left|right)/.test(value))) {
        return coordinate.formatting;
    }
    if(formatting.length>0&&!formatting[formatting.length-1].endsWith(",")){formatting.push(",")}
    switch(coordinate.quadrant){
        case 1:
        formatting.push("above right, ");
        break;
        case 2:
        formatting.push("above left, ");
        break;
        case 3:
        formatting.push("below left, ");
        break;
        case 4: 
        formatting.push("below right, ");
        break;
    }
    return formatting.join("");
}



function getPreamble():string{
    const ang="\\tikzset{ang/.style 2 args={fill=black!50,opacity=0.5,text opacity=0.9,draw=orange,<->,angle eccentricity=#1,angle radius=#2cm,text=orange,font=\\large},ang/.default={1.6}{0.5}}"
  
    const mark="\\def\\mark#1#2#3{\\path [decoration={markings, mark=at position 0.5 with {\\foreach \\x in {#1} { \\draw[line width=1pt] (\\x,-3pt) -- (\\x,3pt); }}}, postaction=decorate] (#2) -- (#3);}"
  
    const arr="\\newcommand{\\arr}[8]{\\coordinate (2) at ($(#2)!#7!(#3)$);\\coordinate (1) at ($(2)!#5mm!90:(#3)$);\\coordinate (3) at ($(2)!#5mm+#4cm!#8:(#3)$);\\draw [line width=1pt,<-] (1)--(3)node [pos=#6] {\\large #1};}" 
    const lene="\\def\\cor#1#2#3#4#5{\\coordinate (#1) at($(#2)!#3!#4:(#5)$);}\\def\\dr#1#2{\\draw [line width=#1,]#2;}\\newcommand{\\len}[6]{\\cor{1}{#2}{#3}{90}{#4}\\cor{3}{#4}{#3}{-90}{#2}\\node (2) at ($(1)!0.5!(3)$) [rotate=#6]{\\large #1};\\dr{#5pt,|<-}{(1)--(2)}\\dr{#5pt,->|}{(2)--(3)}}"
    const spring="\\newcommand{\\spring}[4]{\\tikzmath{coordinate \\start, \\done;\\start = (#1);\\done = (#2);}\\draw[thick] ($(\\start) + (-1.5,0)$) --++(3,0);\\draw (\\start) --+ (0,-0.25cm);\\draw ($(\\start) + (\\donex+0cm,\\doney+0.25cm)$)--+(0,-0.25);\\draw[decoration={aspect=0.3, segment length=3, amplitude=2mm,coil,},decorate] (\\startx,\\starty-0.25cm) --($(\\start) + (\\donex,\\doney+0.25cm)$)node[midway,right=0.25cm,black]{#4};\\node[fill=yellow!60,draw,text=black,anchor= north] at ($(\\start) + (\\donex,\\doney)$){#3};}"
    
    const tree="\\newcommand{\\lenu}[3]{\\tikzset{level distance=20mm,level #1/.style={sibling distance=#2mm, nodes={fill=red!#3,circle,inner sep=1pt,draw=none,text=black,}}}}"
    
    const table="\\tikzset{ table/.style={matrix of nodes,row sep=-\\pgflinewidth,column sep=-\\pgflinewidth,nodes={rectangle,draw=black,align=center},minimum height=1.5em,text depth=0.5ex,text height=2ex,nodes in empty cells,every even row/.style={nodes={fill=gray!60,text=black,}},column 1/.style={nodes={text width=5em,font=\\bfseries}},row 1/.style={nodes={font=\\bfseries}}}}"
    const coor="\\def\\coor#1#2#3#4{\\coordinate [label={[#4]:\\Large #3}] (#2) at ($(#1)$);}"
    //const mass=`\\def\\mass#1#2{\\node[fill=yellow!60,draw,text=black,anchor= north] at (#1){#2};}`
    const dvector="\\newcommand{\\dvector}[2]{\\coordinate (temp1) at ($(0,0 -| #1)$);\\coordinate (temp2) at ($(0,0 |- #1)$);\\draw [line width=0.7pt,#2] (#1)--(temp1)(#1)--(temp2);}"
    
    const picAng="\\newcommand{\\ang}[5]{\\coordinate (ang1) at (#1); \\coordinate (ang2) at (#2); \\coordinate (ang3) at (#3); \\pgfmathanglebetweenpoints{\\pgfpointanchor{ang3}{center}}{\\pgfpointanchor{ang2}{center}}\\let\\angCB\\pgfmathresult\\pgfmathanglebetweenpoints{\\pgfpointanchor{ang2}{center}}{\\pgfpointanchor{ang1}{center}}\\let\\angAB\\pgfmathresult\\pgfmathparse{\\angCB - \\angAB}\\ifdim\\pgfmathresult pt<0pt\\pgfmathparse{\\pgfmathresult + 360}\\fi\\ifdim\\pgfmathresult pt>180pt\\pgfmathparse{360 - \\pgfmathresult}\\fi\\let\\angB\\pgfmathresult\\pgfmathsetmacro{\\angleCheck}{abs(\\angB - 90)}\\ifthenelse{\\lengthtest{\\angleCheck pt < 0.1pt}}{\\pic [ang#5,\"{${#4}\$}\",]{right angle=ang1--ang2--ang3};}{\\pic [ang#5,\"{${#4}\$}\",]{angle=ang1--ang2--ang3};}}"
    const preamble="\\usepackage{pgfplots,ifthen}\\usetikzlibrary{arrows.meta,angles,quotes,positioning, calc, intersections,decorations.markings,math,spy,matrix,patterns,snakes,decorations.pathmorphing,patterns,shadows,shapes.symbols}"
    return preamble+ang+mark+arr+lene+spring+tree+table+coor+dvector+picAng+"\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}"
}