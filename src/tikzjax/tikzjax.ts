import { App, Component, Editor, MarkdownRenderer, MarkdownView, WorkspaceWindow } from "obsidian";
import MathPlugin from "src/main";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { degreesToRadians } from "src/mathUtilities.js";
import { DebugModal } from "src/desplyModals.js";

import { EditorView } from "@codemirror/view";

interface CodeMirrorEditor extends Editor {
    cm: EditorView;
}


export class Tikzjax {
    app: App;
    plugin: MathPlugin;
    activeView: MarkdownView | null;
//const editor = activeView?.editor as CodeMirrorEditor | null;
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
            const script = el.createEl("script");
            script.setAttribute("type", "text/tikz");
            script.setAttribute("data-show-console", "true");
            
            script.setText(this.tidyTikzSource(source,icon));
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
          // Optimize the SVG using SVGO
          // Fixes misaligned text nodes on mobile
  
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
/*
function dissectCoordinates(match: any,tokens: any){
    const [fullMatch, position, coordName, label, formatting] = match;
    const { X: xValue, Y: yValue } = parseCoordinates(position, tokens);
    return {
        X: xValue !== undefined ? xValue : null,
        Y: yValue !== undefined ? yValue : null,
        original: position,
        coordinateName: coordName || null,
        label: label || null,
        formatting: formatting.trim() || null,
    };
}*/
function parseCoordinates(coordinate: any, tokens: any, formatting?: any,coordinatesArray?: any): {type:string, X:number, Y:number, name:string, original:string} {
    let xValue = null, yValue = null, name;
    
    const parseNumber = (value: any) => {
        const numberValue = parseFloat(value);
        return isNaN(numberValue) ? value : numberValue;
    };
    const findOriginalValue = (value: any) => {
        return tokens.find((token: any) => (token.type === "coordinate"||token.type === "node") && token.coordinateName === value);
    };
    
    const doubleMatchRegex=/\$\(([\w\d\s-,.:$+]+)\)\+\(([\w\d\s-,.:$+]+)\)\$/;
    let match=coordinate.match(doubleMatchRegex)
    if (match){
        //onsole.log(parseCoordinates(match[1],tokens),parseCoordinates(match[2],tokens))
        const coordinate1=parseCoordinates(match[1],tokens),coordinate2=parseCoordinates(match[2],tokens);
        [xValue, yValue]=[coordinate1.X+coordinate2.X,coordinate1.Y+coordinate2.Y]
    }
    const halfMatchRegex=/\$\(([\w\d\s-,.:$+]+)\)!([\d\s-,.:$+]+)!\(([\w\d\s-,.:$+]+)\)\$/;
    match=coordinate.match(halfMatchRegex)
    if (match){
        const coordinate1=parseCoordinates(match[1],tokens),coordinate2=parseCoordinates(match[3],tokens);
        const halfByValue=Number(match[2])
        if(!isNaN(halfByValue)){
            [xValue, yValue]=[(coordinate1.X+coordinate2.X)*halfByValue,(coordinate1.Y+coordinate2.Y)*halfByValue]
        }
    }
    else if (coordinate.includes(",")) {
        [xValue, yValue] = coordinate.split(",").map(parseNumber);
    }
    
    else if (coordinate.includes(":")) {
        const [angle, length] = coordinate.split(":").map(parseFloat);
        if (!isNaN(angle) && !isNaN(length)) {
        const radians = degreesToRadians(angle);
        [xValue, yValue] = [length * Math.cos(radians), length * Math.sin(radians)].map(val => Math.abs(val) < 1e-10 ? 0 : val);
        } else {
        console.error("Invalid polar coordinates:", coordinate);
        }
    }
    else if (coordinate.includes("intersection")) {
        const originalCoords = coordinate
        .replace(/intersection\s?of\s?/g, "")
        .replace(/(\s*and\s?|--)/g, " ")
        .split(" ")
        .map(findOriginalValue);
        const slopes = [
        findSlope(originalCoords[0], originalCoords[1]),
        findSlope(originalCoords[2], originalCoords[3])
        ];
        ({ X: xValue, Y: yValue } = findIntersectionPoint(originalCoords[0], originalCoords[2], slopes[0], slopes[1]));
    }  
    else {
        name = coordinate;
        const tokenMatch = findOriginalValue(coordinate);
        if (tokenMatch !== undefined) {
        [xValue, yValue] = [parseNumber(tokenMatch.X), parseNumber(tokenMatch.Y)];
        }
    }
    let coor={X:0,Y:0}
    if (formatting!==undefined&&coordinatesArray.length>0){
        if(formatting==="--+"){
        coor=coordinatesArray.find((token: any)=> token.type==="coordinate")||coor
        }
        else if (formatting === "--++") {
        coor = coordinatesArray.findLast((token: any) => token.type === "coordinate") || coor;
        }
    }
    xValue+=coor.X;yValue+=coor.Y;
    return {
        type: "coordinate",
        X: xValue,
        Y: yValue,
        name: name,
        original: coordinate,
    };
}

class Coordinate {
    x: number;
    y: number;
    original: string;
    coordinateName: string
    formatting: string;
    label:string;

    asCoordinate(match: any,tokens: any){
        [this.original, this.coordinateName, this.label, this.formatting] = [match[1],match[2],match[3],match[4]];
        ({ X: this.x, Y: this.y} = parseCoordinates(this.original, tokens));
    }

    asNode(match: any,tokens: any){

    }
    asDraw(match: string,tokens: any){
        ({ X: this.x, Y: this.y, original: this.original, name: this.coordinateName } = parseCoordinates(match, tokens));
    }

    tostringCoor(){
        return `\\coor{${this.x},${this.y}}{${this.coordinateName || ""}}{${this.label || ""}}{${generateFormatting(this)||""}}`;
    }
    tostringDraw(){
        return `(${this.coordinateName?this.coordinateName:this.x+','+this.y})`;
    }
}

const c = String.raw`[\w\d\s-,.:$(!)+]`;//Coordinates
const cn = String.raw`[\w_]`;//coor name
const t = String.raw`[\w\d\s-,.:$(!)_\-\{}+]`;//text
const f = String.raw`[\w\s\d=:,!';&*[\]\{\}%-]`;//Formatting.

class FormatTikzjax {
	source: string;
    tokens: any;
    midPoint: any;
	processedCode="";
    debugInfo = "";
	constructor(source: string) {
		this.source=source;
        this.debugInfo+=this.source;
        this.tokens = this.tokenize();
        this.findMidpoint();
        this.applyQuadrants();
        this.debugInfo+=JSON.stringify(this.tokens,null,0.01)+"\n\n"

        this.processedCode += this.reconstruct();
        this.debugInfo+=this.processedCode;
	}
    getCode(){
        return getPreamble()+this.processedCode+"\n\\end{tikzpicture}\\end{document}";
    }
    tokenize() {
        // Create `tokens` array and define regular expressions
        const tokens = [];
        
        // Use `String.raw` for regex patterns to avoid double escaping
        const coorRegex = new RegExp(String.raw`\\coor\{(${c}+)\}\{(${cn}*)\}\{(${t}*)\}\{(${f}*)\}`, "g");
        const nodeRegex = new RegExp(String.raw`\\node\{([\w\d\s-,.:]+)\}\{([A-Za-z]*)\}\{([A-Za-z]*)\}\{(${f}*)\}`, "g");
        const ss = new RegExp(String.raw`\\coordinate\s*\[label=\{\[(.*?)\]:\\\w*\s*([\w\s]*)\}\]\s*\((\w+)\)\s*at\s*\(\$?\(?([\w\d\s-,.]+)\)?\$?\)?;`, "g");
        const drawRegex = new RegExp(String.raw`\\draw\s*\[(${f}*)\]\s*(.*?);`, "g");
        const xyaxisRegex = new RegExp(String.raw`\\xyaxis({['"\`\w\d-<>\$,]+})?({['"\`\w\d-<>$,]+})?`, "g");
        const gridRegex = new RegExp(String.raw`\\grid({[\d-.]+})?`, "g");
        const circleRegex = new RegExp(String.raw`\\circle\{(${c}+)\}\{(${c}+)\}\{${c}+)\}\{([\w\s\d]*)\}`, "g");
        const massRegex = new RegExp(String.raw`\\mass\{(${c}+)\}\{(${t}*)\}\{?([-|>]*)?\}?\{?([-.\s\d]*)?\}?`, "g");
        const vecRegex = new RegExp(String.raw`\\vec\{(${c}+)\}\{(${c}+)\}\{(${t}*)\}\{?([-|>]*)?\}?`, "g");
    
        const regexPatterns = [coorRegex, ss, nodeRegex, drawRegex, xyaxisRegex, gridRegex, circleRegex, massRegex, vecRegex];
        const matches = regexPatterns.flatMap(pattern => [...this.source.matchAll(pattern)]);
        
        // Sort matches by their index to ensure correct order
        matches.sort((a, b) => (a.index || 0) - (b.index || 0));
      
        let currentIndex = 0;
        for (const match of matches) {
          if (match.index !== undefined && match.index > currentIndex) {
            tokens.push(this.source.slice(currentIndex, match.index));
          }
      
          if (match[0].startsWith("\\coor")) {
            tokens.push(new Coordinate().asCoordinate(match,tokens));
          } else if (match[0].startsWith("\\draw")) {
            tokens.push(dissectDraw(match, tokens));
          } else if (match[0].startsWith("\\xyaxis")) {
            tokens.push(dissectXYaxis(match));
          } else if (match[0].startsWith("\\grid")) {
            tokens.push({type: "grid", rotate: match[1]});
          } else if (match[0].startsWith("\\node")) {
            tokens.push({type: "node", ...dissectCoordinates(match, tokens)});
          } else if (match[0].startsWith("\\circle")) {
            tokens.push({
              type: "circle",
              formatting: match[4],
              coordinates: [
                parseCoordinates(match[1], tokens),
                parseCoordinates(match[2], tokens),
                parseCoordinates(match[3], tokens),
              ],
            });
          } else if (match[0].startsWith("\\mass")) {
            tokens.push({
              type: "mass",
              text: match[2] || "",
              formatting: match[3] || null,
              rotate: Number(match[4]) || 0,
              ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[1], tokens)),
            });
          } else if (match[0].startsWith("\\vec")) {
            tokens.push({
              type: "vec",
              text: match[3] || "",
              formatting: match[4] || null,
              rotate: Number(match[5]) || 0,
              anchor:{...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[1], tokens)),},
              ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[2], tokens)),
            });
          }
      
          if (match.index !== undefined) {
            currentIndex = match.index + match[0].length;
          }
        }
      
        if (currentIndex < this.source.length) {
          tokens.push(this.source.slice(currentIndex));
        }
      
        return tokens;
    }

    findMidpoint() {
        //console.log(this.tokens)
        let coordinates = this.tokens.filter((token: any) => token.type && token.type === "coordinate");
        
        if (coordinates.length === 0) {
            const tempTokens = this.tokens.filter((token: any) => token.type && token.type === "draw");
            tempTokens.forEach((object: any) => {
            coordinates = coordinates.concat(object.coordinates.filter((token: any) => token.type && token.type === "coordinate"));
          });
        }
        let sumOfX = 0, sumOfY = 0;
        coordinates.forEach((coordinate: any) => {
          sumOfX += Number(coordinate.X);
          sumOfY += Number(coordinate.Y); 
        });
        this.midPoint= {
          X: sumOfX / coordinates.length!==0?coordinates.length:1,
          Y: sumOfY / coordinates.length!==0?coordinates.length:1,
        };
    }
    
    applyQuadrants() {
        this.tokens.forEach((token: any) => {
          if (typeof token === "object" && token !== null&&token.type==="coordinate") {
            token.quadrant = findQuadrant(token,this.midPoint)
          }
        });
    }

    reconstruct(){
        let codeBlockOutput = "",temp: string | { center: { X: number; Y: number; }; radius: number; equation: string; } | null;
        const extremeXY=getExtremeXY(this.tokens);
        this.tokens.forEach((token: any) => {
          if (typeof token === "object") {
            switch(token.type){
                case "coordinate":
                    codeBlockOutput += token.Tostring();
                    break;
                case "node":
                    codeBlockOutput += `\\node (${token.coordinateName}) at (${token.X},${token.Y}) [${generateFormatting(token)}] {${token.label}};`;
                    break;
                case "draw":
                    codeBlockOutput+=`\\draw [${token.formatting}] ${reconstructDraw(token,this.tokens,this.midPoint)}`
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
              }
          } else {
            codeBlockOutput += token;
          }
        });
        return codeBlockOutput;
    }
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





function dissectXYaxis(match: any) {
    let Xnode = "", Ynode = "";

    if (match[1] && match[2]) {
        Xnode = match[1].match(/['`"]([\w\d&$]+)['`"]/);
        Ynode = match[2].match(/['`"]([\w\d&$]+)['`"]/);
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


function dissectDraw(match: any, tokens: any) {
    if (!match || !match[2]) {
        console.error("Invalid match input, aborting function.");
        return null; 
    }

    const path = match[2]; 
    const coordinatesArray = [];
    //[a-zA-Z0-9.\\{}>\-\\<$\s]*
    const nodeRegex = new RegExp(String.raw`[\s]*node\s*\[?(${f}*)\]?\s*{(${c}+)}\s*`);
    const formattingRegex = /[\s]*(cycle|--cycle|--\+\+|--\+|--|circle|rectangle)[\s]*/;
    const coordinateRegex = new RegExp(String.raw`\s*\((${c}+)\)[\s]*`);
    let i = 0,j = 0;

    while (i < path.length && j < 20) {
        j++;
        //console.log(coordinatesArray)
        const coordinateMatch=path.slice(i).match(coordinateRegex)
        if (coordinateMatch?.index===0) {
        coordinatesArray.push({ type: "coordinate", value: coordinateMatch[1] });
        i += coordinateMatch[0].length;
        }

        const formattingMatch=path.slice(i).match(formattingRegex)
        if(formattingMatch?.index===0){
        i += formattingMatch[0].length;
        coordinatesArray.push({ type: "formatting", value: formattingMatch[0] });
        }

        const nodeMatch=path.slice(i).match(nodeRegex)
        if(nodeMatch?.index===0){
        coordinatesArray.push({ type: "node", formatting: nodeMatch[1] || "", value: nodeMatch[2] });
        i += nodeMatch[0].length; 
        }
    }
    if (j===20){
        return match[0]
    }

    for (let i = 0; i < coordinatesArray.length; i++) {
        if (coordinatesArray[i].type === "coordinate") {
        let previousFormatting = undefined;

        if (i > 0 && coordinatesArray[i - 1].type === "formatting") {
            previousFormatting = coordinatesArray[i - 1].value;
        }
        else if (i > 1 && coordinatesArray[i - 1].type === "node" && coordinatesArray[i - 2].type === "formatting") {
            previousFormatting = coordinatesArray[i - 2].value;
        }
        coordinatesArray.splice(i, 1, parseCoordinates(coordinatesArray[i].value, tokens, previousFormatting,coordinatesArray));
        }
    }

    return {
        type: "draw",
        formatting: match[1],
        coordinates: coordinatesArray,
    };
}





function findIntersectionPoint(coordinate1: any, coordinate2: any, slope1: number, slope2: number) {
    const xValue = ((slope2 * coordinate2.X) - (slope1 * coordinate1.X) + (coordinate1.Y - coordinate2.Y)) / (slope2 - slope1);
    return {
        X: xValue, 
        Y: createLineFunction(coordinate1, slope1)(xValue)
    };
}


function createLineFunction(coordinate: any, slope: number) {
    return function(x: number) {
        return slope * (x - coordinate.X) + coordinate.Y;
    };
}

interface token  {
    X: number;
    Y: number;
}
function findQuadrant(token: token,midPoint: any){
    if (midPoint===null){return null}
    const xDirection = token.X > midPoint.X ? 1 : -1;
    const yDirection = token.Y > midPoint.Y ? 1 : -1;
    return yDirection === 1 ? (xDirection === 1 ? 1 : 2) : (xDirection === 1 ? 4 : 3);
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


function reconstructDraw(token: any,tokens: any,midPoint: any){
let string="",beforeToken,afterToken,slope;
token.coordinates.forEach((coordinate: any,index: number) => {
    switch(coordinate.type){
    case "coordinate":
        if(coordinate.name){string+=`(${coordinate.name})`;}
        else{string+=`(${coordinate.X},${coordinate.Y})`;}
        break;
    case "node":
        afterToken=token.coordinates.slice(index).find((token: any)=> token.type==="coordinate");
        if (afterToken===undefined&&token.coordinates[token.coordinates.length-1].value==="cycle"){
        afterToken=token.coordinates[0]
        }
        beforeToken=token.coordinates.slice(0, index).reverse()
        .find((token: any) => token.type === "coordinate");
        slope=findSlope(beforeToken,afterToken)
        string+=`node [${sideNodeFormatting(coordinate.formatting,slope,beforeToken,afterToken,midPoint)}] {${coordinate.value}} `
        break;
    case "formatting":
        string+=coordinate.value;
        break;
    }
});
return string+";"
}



function findSlope(coordinate1: any, coordinate2: any) {
const deltaY = coordinate2.Y - coordinate1.Y;
const deltaX = coordinate2.X - coordinate1.X;
return deltaY / deltaX;
}

function sideNodeFormatting(formatting: string,slope: number,beforeToken: any,afterToken: any,midPoint: any) {
    if (formatting.match(/(above|below|left|right)/)) {
        return formatting;
    }
    formatting+=formatting.length>0?",":"";

    const edge1 = findQuadrant(beforeToken,midPoint)?.toString()||"";
    const edge2 = findQuadrant(afterToken,midPoint)?.toString()||"";

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

    function generateFormatting(coordinate: any){
    if (typeof coordinate.label !== "string"){ return ""; }
    const formatting = coordinate.formatting?.split(",") || [];
    if (formatting.some((value: any) => /(above|below|left|right)/.test(value))) {
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

    function calculateCircle(point1: any, point2: any, point3: any) {
    const x1 = point1.X, y1 = point1.Y;
    const x2 = point2.X, y2 = point2.Y;
    const x3 = point3.X, y3 = point3.Y;

    // Calculate the determinants needed for solving the system
    const A = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - y2 * x3);
    const B = (x1 ** 2 + y1 ** 2) * (y3 - y2) + (x2 ** 2 + y2 ** 2) * (y1 - y3) + (x3 ** 2 + y3 ** 2) * (y2 - y1);
    const C = (x1 ** 2 + y1 ** 2) * (x2 - x3) + (x2 ** 2 + y2 ** 2) * (x3 - x1) + (x3 ** 2 + y3 ** 2) * (x1 - x2);
    const D = (x1 ** 2 + y1 ** 2) * (x3 * y2 - x2 * y3) + (x2 ** 2 + y2 ** 2) * (x1 * y3 - x3 * y1) + (x3 ** 2 + y3 ** 2) * (x2 * y1 - x1 * y2);

    if (A === 0) {
        return null; // The points are collinear, no unique circle
    }

    // Calculate the center (h, k) of the circle
    const h = -B / (2 * A);
    const k = -C / (2 * A);

    // Calculate the radius of the circle
    const r = Math.sqrt((B ** 2 + C ** 2 - 4 * A * D) / (4 * A ** 2));

    return {
        center: { X: h, Y: k },
        radius: r,
        equation: `(x - ${h.toFixed(2)})^2 + (y - ${k.toFixed(2)})^2 = ${r.toFixed(2)}^2`
    };
}
