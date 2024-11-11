import { App, Component, Editor, MarkdownRenderer, MarkdownView, WorkspaceWindow } from "obsidian";
import MathPlugin from "src/main";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { cartesianToPolar, degreesToRadians, findIntersectionPoint, findSlope, polarToCartesian, toNumber } from "src/mathUtilities.js";
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
            const tikzjax=new FormatTikzjax(source);
            icon.onclick = () => new DebugModal(this.app,tikzjax.debugInfo).open();
            script.setText(tikzjax.getCode());
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

function regExp(pattern: string | RegExp, flags: string = ''): RegExp {
    pattern=pattern instanceof RegExp?pattern.source:pattern;
    return new RegExp(String.raw`${pattern}`, flags?flags:'');
}

function getRegex(){
    const basic = String.raw`[\w\d\s-,.:]`;
    return {
        basic: basic,
        merge: String.raw`[\+\-\|!\d.]`,
        //coordinate: new RegExp(String.raw`(${basic}+|1)`),
        coordinateName: String.raw`[\w_\d\s]`,
        text: String.raw`[\w\s-,.:$(!)_+\\{}=]`,
        formatting: String.raw`[\w\s\d=:,!';&*[\]{}%-<>]`
    };
}













interface token  {
    X?: number;
    Y?: number;
    type?: string;
    coordinateName?: string;
    coordinates?: any;
}




const parseNumber = (value: string) => {
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};

function findBeforeAfterAxis(axes: Array<Axis | string>, index: number): { before: number, after: number } {
       
    const beforeIndex = axes.slice(0,index).findLastIndex((axis: any) => axis instanceof Axis)
    const afterIndex = axes.findIndex((axis: any,idx: number) => axis instanceof Axis&&idx>index);

    if (beforeIndex === -1 || afterIndex === -1) {
        throw new Error("Couldn't find valid Axis objects.");
    }
    if (beforeIndex === afterIndex) {
        throw new Error("Praised axis as same token");
    }
    return { before: beforeIndex, after: afterIndex };
}


export class Axis {
    cartesianX: number;
    cartesianY: number;
    polarAngle: number;
    polarLength: number;
    name?: string;
    universal(coordinate: string, tokens?: FormatTikzjax,anchorArr?: any,anchor?: string): Axis {
        const matches=this.getCoordinateMatches(coordinate);
        const coordinateArr: Array<Axis|string> = [];
        matches.forEach((match: any,index: number) => {
            match=match.fullMatch;
            let axis: Axis|undefined;
            switch (true) {
                case /,/.test(match):
                    axis = new Axis();
                    axis.addCartesian(match);
                    coordinateArr.push(axis);
                    break;
                case /:/.test(match):
                    axis = new Axis();
                    axis.addPolar(match);
                    axis.polarToCartesian()
                    coordinateArr.push(axis);
                    break;
                case /![\d.]+!/.test(match):
                    coordinateArr.push(match);
                    break;
                case (/[\d\w]+/).test(match):
                    if (tokens)
                    axis = tokens.findOriginalValue(match)?.axis;
                else throw new Error(`Tried to find original coordinate value while not being provided with tokens`);
                    if (axis === undefined) {
                        throw new Error(`Couldn't find the coordinate ${match} from ${coordinate}`);
                    }
                    coordinateArr.push(axis);
                    break;
                default:
                    coordinateArr.push(match);
            }
        });
        this.mergeAxis(coordinateArr)

        if(anchorArr&&anchor&&anchor.match(/(--\+|--\+\+)/)){
            let a: Axis
            if (anchor.match(/(--\+)/)){
                a=anchorArr.find((coor: any)=> coor instanceof Axis)
            }else{
                a=anchorArr.findLast((coor: any)=> coor instanceof Axis)
            }
            this.complexCartesianAdd(a,"addition")
        }
        return this;
    }

    complexCartesianAdd(axis: Axis,mode: string,modifier?: any){
        switch (mode) {
            case "addition":
                this.cartesianX+=axis.cartesianX;
                this.cartesianY+=axis.cartesianY;
                break;
            case "subtraction":
                break;
            case "rightProjection":
                this.cartesianX=axis.cartesianX
                break;
            case "internalPoint":
                this.cartesianX=(this.cartesianX+axis.cartesianX)*modifier;
                this.cartesianY=(this.cartesianY+axis.cartesianY)*modifier;
                break;
            default:
        }
        this.cartesianToPolar()
        return this
    };


    getCoordinateMatches(coordinate: string){
        const regexPattern = getRegex();
        const regexPatterns = [
            regExp(String.raw`(${regexPattern.basic}+)`, "g"),
            regExp(String.raw`(${regexPattern.merge}+)`, "g")
        ];
        
        // Step 1: Extract matches for each pattern separately
        const basicMatches = Array.from(coordinate.matchAll(regexPatterns[0])).map((match: RegExpExecArray) => ({
            fullMatch: match[0].replace(/-$/g, ""), // Remove trailing hyphen only
            index: match.index ?? 0,
            length: match[0].length
        }));
        
        const mergeMatches = Array.from(coordinate.matchAll(regexPatterns[1])).map((match: RegExpExecArray) => ({
            fullMatch: match[0],
            index: match.index ?? 0,
            length: match[0].length
        }));
        
        const matches: Array<{ fullMatch: string, index: number, length: number }> = [];

        function isOverlapping(match1: { index: number; length: number }, match2: { index: number; length: number }) {
            return match1.index < match2.index + match2.length && match2.index < match1.index + match1.length;
        }

        [...basicMatches, ...mergeMatches].forEach(match => {
            const overlappingIndex = matches.findIndex(existingMatch => isOverlapping(existingMatch, match));
            
            if (overlappingIndex !== -1) {
                const existingMatch = matches[overlappingIndex];
                
                // If the current match covers a larger range, replace the existing one
                if (match.length > existingMatch.length) {
                    matches[overlappingIndex] = match;
                }
            } else {
                matches.push(match);
            }
        });
        
        // Step 3: Sort the final matches by index
        matches.sort((a, b) => a.index - b.index);
        
        // Step 4: Validate the result
        if (matches.length === 0) {
            throw new Error("Coordinate is not valid; expected a valid coordinate.");
        }
        
        return matches;
        
    }

    constructor(cartesianX?: number, cartesianY?: number, polarLength?: number, polarAngle?: number) {
        if (cartesianX !== undefined) this.cartesianX = cartesianX;
        if (cartesianY !== undefined) this.cartesianY = cartesianY;
        if (polarLength !== undefined) this.polarLength = polarLength;
        if (polarAngle !== undefined) this.polarAngle = polarAngle;
    }

    clone(): Axis {
        return new Axis(this.cartesianX, this.cartesianY,this.polarLength,this.polarAngle);
    }
    
    
    mergeAxis(axes: Array<Axis | string>) {
        if (!axes.some((axis: any) => typeof axis === "string")) {
            Object.assign(this, (axes[0] as Axis).clone());
            return;
        }
        for (let i = 0; i < axes.length; i++) {
            const current = axes[i];
            if (typeof current !== "string") continue;
            const sides = findBeforeAfterAxis(axes, i);
            const beforeAxis = axes[sides.before] as Axis;
            const afterAxis = axes[sides.after] as Axis;

            let  match = current.match(/^\+$/);
            let mode,modifiers;
            if (match){
                mode = "addition"
            }
            match=current.match(/^-\|$/)
            if(!mode&&match){
                mode = "rightProjection"
            }
            match=current.match(/^\!([\d.]+)\!$/)
            if(!mode&&match){
                mode = "internalPoint"
                modifiers=toNumber(match[1])
            }

            if(mode){
                axes.splice(sides.before, sides.after - sides.before + 1, beforeAxis.complexCartesianAdd(afterAxis,mode,modifiers));
                i = sides.before;
            }

        }

        if (axes.length === 1 && axes[0] instanceof Axis) {
            Object.assign(this, (axes[0] as Axis).clone());
        }
    }
    
    

    projection(axis1: Axis|undefined,axis2: Axis|undefined):any{
        if (!axis1||!axis2){throw new Error("axis's were undefined at projection");}
        return [{X: axis1.cartesianX,Y: axis2.cartesianY},{X: axis2.cartesianX,Y: axis1.cartesianY}]
    }
    combine(coordinateArr: any){
        let x=0,y=0;
        coordinateArr.forEach((coordinate: Axis)=>{
            x+=coordinate.cartesianX;
            y+=coordinate.cartesianY;
        })
        
        this.cartesianX=x;this.cartesianY=y;
    }
    addCartesian(x: string | number, y?: number): void {
        
        if (!y && typeof x === "string") {
            [x, y] = x.split(",").map(Number);
        }
        if (x === undefined || y === undefined) {
            throw new Error("Invalid Cartesian coordinates provided.");
        }
        this.cartesianX = x as number;
        this.cartesianY = y as number;
    }
    
    polarToCartesian(){
        const temp=polarToCartesian(this.polarAngle, this.polarLength)
        this.addCartesian(temp.X,temp.Y)
    }

    cartesianToPolar(){
        const temp=cartesianToPolar(this.cartesianX, this.cartesianY)
        this.addPolar(temp.angle,temp.length)
    }

    addPolar(angle: string | number, length?: number): void {
        if (!length && typeof angle === "string") {
            [angle, length] = angle.split(":").map(Number);
        }
        if (angle === undefined || length === undefined) {
            throw new Error("Invalid polar coordinates provided.");
        }
        this.polarAngle = angle as number;
        this.polarLength = length as number;
    }

    toString(){
        return this.cartesianX+","+this.cartesianY;
    }

    intersection(coord: string, findOriginalValue: (coord: string) => Coordinate | undefined): {X:number,Y:number} {
        const originalCoords = coord
            .replace(/intersection\s?of\s?/g, "")
            .replace(/(\s*and\s?|--)/g, " ")
            .split(" ")
            .map(findOriginalValue)
            .filter((token): token is Coordinate => token !== undefined);

        if (originalCoords.length < 4) {
            throw new Error("Intersection had undefined coordinates or insufficient data.");
        }

        const slopes = [
            findSlope(originalCoords[0].axis, originalCoords[1].axis),
            findSlope(originalCoords[2].axis, originalCoords[3].axis),
        ];

        return findIntersectionPoint(originalCoords[0].axis, originalCoords[2].axis, slopes[0], slopes[1]);
    }
}

function covort(value: number,convrsin: string){

}


function matchKeyWithValue(key: string): string {
    const valueMap: Record<string, string> = {
        "anchor": "anchor=",
        "rotate": "rotate=",
        "lineWidth": "line width=",
        "fill": "fill=",
        "fillOpacity": "fill opacity=",
        "textColor": "text color=",
        "draw": "draw=",
        "text": "text=",
        "pos": "pos=",
        "decorate": "decorate",
        "sloped": "sloped",
        "decoration": "decoration=",
        "decoration.brace": "brace",
        "decoration.amplitude": "amplitude="
    };

    return valueMap[key] || '';
}

export class Formatting{

    mode: string;
    rotate?: number;
    anchor?: string;
    lineWidth?: number;
    width?: string;
    color?: string;
    textColor?: string;
    fill?: string;
    fillOpacity?: number;
    arrow?: string;
    draw?: string;
    text?: string;
    pathAttribute?: string;
    tikzset?: string;
    pos?: number;
    position?: string;
    lineStyle?: string;
    sloped?: boolean;
    decoration?: {brace?: boolean,coil: boolean,amplitude?: number,aspect: number,segmentLength:number};
    decorate?: boolean;

    quickAdd(mode: string,formatting: any,formattingForInterpretation?:string ){
        this.mode=mode;
        this.formattingSpecificToMode();
        this.interpretFormatting(formattingForInterpretation||"")
        this.rotate=toNumber(formatting?.rotate)??this.rotate;
        this.anchor=formatting?.anchor?.replace(/-\|/,"south")?.replace(/\|-/,"north")??this.anchor;
        return this;
    }

    formattingSpecificToMode(){
        switch (this.mode) {
            case "node-mass":
                this.fill="yellow!60";
                this.pathAttribute="draw";
                this.text="black";
                break;
        }
    }
    addSplopAndPosition(arr: any,index: number){
        const beforeAfter=findBeforeAfterAxis(arr,index);
        const [before, after]=[arr[beforeAfter.before],arr[beforeAfter.after]]
        if (this.position||this.sloped){return}
    
        const edge1 = before.quadrant?.toString()||"";
        const edge2 = after.quadrant?.toString()||"";
        const slope=findSlope(edge1,edge2)

        this.sloped = slope !== 0;

        let quadrant
        if (edge1!==edge2)quadrant=edge1+edge2;
        else quadrant=edge1;

        if (slope!==Infinity&&slope!==-Infinity){
            this.position = quadrant.replace(/(3|4)/,"below").replace(/(1|4)/,"above")
        }
        if (this.sloped){
            this.position+=quadrant.replace(/(2|3)/,"right").replace(/(1|4)/,"left")
        }
        // Remove unused quadrants. and Add space if two words
        this.position = this.position?.replace(/[\d]+/g,"").replace(/(below|above)(right|right)/,"$1 $2");
    }
    interpretFormatting(formatting: string){
        const splitFormatting=formatting.match(/(?:{[^}]*}|[^,{}]+)+/g) || [];
        splitFormatting.forEach(formatting => {
            //console.log(formatting)
            const match = formatting.match(/^([^=]+)={(.*)}$/);
            switch (true) {
                case !!match: {
                    if (match){
                        const  [_,parent, children]=match;
                        this.interpretFormatting(children)
                    }
                    break;
                }
                case formatting.includes("linewidth"): {
                    this.split("lineWidth",formatting)
                    break;
                }
                case formatting.includes("fill="): {
                    this.split("fill",formatting)
                    break;
                }
                case formatting.includes("fillopacity"): {
                    this.split("fillOpacity",formatting)
                    break;
                }
                case !!formatting.match(/^(->|<-|-*{Stealth}-*)$/): {
                    this.arrow = formatting
                    break;
                }
                case !!formatting.match(/^(above|below|left|right){1,2}$/): {
                    this.position=formatting.replace(/(above|below|left|right)/,"$1 ")
                    break;
                }
                case !!formatting.match(/^pos=/): {
                    this.split("pos",formatting)
                    break;
                }
                case !!formatting.match(/^draw=/): {
                    this.split("draw",formatting)
                    break;
                }
                case !!formatting.match(/^decorate$/): {
                    this.decorate=true;
                    break;
                }
                case !!formatting.match(/^text=/): {
                    this.split("text",formatting)
                    break;
                }
                case !!formatting.match(/^brace$/): {
                    this.split("decoration",true,"brace" as keyof NonNullable<Formatting["decoration"]>,);
                    break;
                }
                case !!formatting.match(/^amplitude/):
                    this.split("decoration",formatting,"amplitude" as keyof NonNullable<Formatting["decoration"]>,)
                    break;
                case !!formatting.match(/^draw$/):
                    this.pathAttribute = formatting;break;
                case !!formatting.match(/^helplines$/):
                    this.tikzset = formatting.replace(/helplines/g,"help lines");break;
                case !!formatting.match(/^(red|blue|pink|black|white|[!\d.]+){1,5}$/):
                    this.color=formatting;break;
                case !!formatting.match(/^(dotted|dashed|smooth|densely|loosely){1,2}$/):
                    this.lineStyle=formatting.replace(/(densely|loosely)/,"$1 ");break;
            }
        });
    }

    split<K extends keyof Formatting, NK extends keyof NonNullable<Formatting[K]> | undefined>(
        key: K,
        formatting: any,
        nestedKey?: NK
    ): void {
        let value;

        if(typeof formatting!=="boolean"){
            let match = formatting.split("=");
    
            // Ensure the formatting string is valid
            if (match.length < 2 || !match[1]) return;
        
            // Trim any potential whitespace around the value
            const rawValue = match[1].trim();
        
            // Determine if the value is a number or a string
            value = !isNaN(parseFloat(rawValue)) && isFinite(+rawValue)
                ? parseFloat(rawValue)
                : rawValue;
        }
        else{
            value=formatting
        }
        
        this.setProperty(key, value, nestedKey);
    }
    
    setProperty<K extends keyof Formatting, NK extends keyof NonNullable<Formatting[K]> | undefined>(
        key: K,
        value: any,
        nestedKey?: NK
    ): void {
        const formattingObj = this as Record<string, any>;
    
        if (nestedKey) {
            if (!formattingObj[key] || typeof formattingObj[key] !== 'object') {
                formattingObj[key] = {};
            }
            formattingObj[key][nestedKey] = value;
        } else {
            formattingObj[key] = value;
        }
    }
    
    
    toString(): string {
        let string='[';
        for (const [key, value] of Object.entries(this)) {
            if (key==="mode"){continue;}
            if(typeof value === 'object'){
                string+=this.handleObjectToString(value,key)
            }
            else if (value) {
                string+=matchKeyWithValue(key as keyof Formatting)+(typeof value==="boolean"?'':value)+',';
            }
        }
        return string="]";
    }
    handleObjectToString(obj: object, parentKey: string): string {
        let result = matchKeyWithValue(parentKey)+'{';
        for (const [key, value] of Object.entries(obj)) {
            if (value) {
                result += matchKeyWithValue(`${parentKey}.${key}`) + (typeof value === "boolean" ? '' : value) + ',';
            }
        }
        return result+"},";
    }
}

export class Coordinate {
    mode: string;
    axis: Axis;
    original?: string;
    coordinateName?: string;
    formatting?: Formatting;
    label?: string;
    quadrant?: number;
    
    constructor(
        mode?: string,
        axis?: Axis,
        original?: string,
        coordinateName?: string,
        formatting?: Formatting,
        label?: string,
        quadrant?: number
    ) {

        if (mode !== undefined) this.mode = mode;
        if (axis !== undefined) this.axis = axis;
        this.original = original;
        this.coordinateName = coordinateName;
        this.formatting = formatting;
        this.label = label;
        this.quadrant = quadrant;
    }
    clone(): Coordinate {
        return new Coordinate(
            this.mode,
            this.axis.clone(),
            this.original,
            this.coordinateName,
            this.formatting,
            this.label,
            this.quadrant
        );
    }
   
    addInfo(match: {original?: string,coordinateName?: string,label?: string,formatting?: string}, mode: string,tokens?: FormatTikzjax,formatting?: object) {
        this.mode=mode;
        ([{original: this.original,coordinateName: this.coordinateName,label: this.label}]=[match])
        if(this.original){
            this.axis=new Axis().universal(this.original,tokens);
        }
            this.formatting=new Formatting();
            this.formatting.quickAdd(this.mode,formatting,match.formatting);
        
        return this;
    }

    toString() {
        switch (this.mode) {
            case "coordinate":
                return `\\coor{${this.axis.toString()}}{${this.coordinateName || ""}}{${this.label || ""}}{}`;
            case "node":
                return
            case "node-inline":
                return `node ${this.formatting?.toString()} {${this.label}}`
            case "node-mass":
                return `\\node ${this.coordinateName?'('+this.coordinateName+')':''} at (${this.axis.toString()}) ${this.formatting?.toString()} {${this.label}};`
            default:
                throw new Error("Couldn't find mode at to string coordinate");
                break;
        }
        
    }

    addQuadrant(midPoint: Axis) {
        const xDirection = this.axis.cartesianX > midPoint.cartesianX ? 1 : -1;
        const yDirection = this.axis.cartesianY > midPoint.cartesianY ? 1 : -1;
        this.quadrant = yDirection === 1 ? (xDirection === 1 ? 1 : 2) : (xDirection === 1 ? 4 : 3);
    }
}

type Token =Axis | Coordinate |Draw| string;

export class Draw {
    mode?: string
    formatting: Formatting=new Formatting();
    coordinates: Array<Token>;

    constructor(match: {formatting: string|any,draw: string|any}, tokens?: FormatTikzjax,mode?: string) {
        this.mode=mode;
        this.mode=`draw${mode?"-"+mode:""}`;
        this.formatting.quickAdd(`draw`,{},match.formatting);
        if(typeof match.draw==="string")
        this.coordinates = this.fillCoordinates(this.getSchematic(match.draw), tokens);
        else{

        }
    }

    createFromArray(arr: any){
        const coordinatesArray = [];
        for (let i=0;i<arr.length;i++){
            if (arr[i] instanceof Axis||arr[i] instanceof Coordinate){
                coordinatesArray.push(arr[i])
            }
            if(typeof arr==="string"){
                coordinatesArray.push(arr[i])
            }
        }

        for (let i = 1; i < coordinatesArray.length; i++) {
            if (coordinatesArray[i] instanceof Coordinate) {
                let found = false;
                while (i < coordinatesArray.length && !found) {
                    i++;
                    if (typeof coordinatesArray[i] === "string") {
                        break;
                    }
                    if (coordinatesArray[i] instanceof Coordinate) {
                        found = true;
                    }
                }
                i--; 
                if (found) {
                    coordinatesArray.push('--');
                }
            }
        }
        return coordinatesArray;
    }

    fillCoordinates(schematic: any[], tokens?: FormatTikzjax) {
        const coorArr: Array<Token>=[];
        for (let i = 0; i < schematic.length; i++) {
            if (schematic[i].type === "coordinate") {
                let previousFormatting;

                if (i > 0 && schematic[i - 1].type === "formatting") {
                    previousFormatting = schematic[i - 1].value;
                } else if (i > 1 && schematic[i - 1].type === "node" && schematic[i - 2].type === "formatting") {
                    previousFormatting = schematic[i - 2].value;
                }
                coorArr.push(new Axis().universal(schematic[i].value, tokens, coorArr, previousFormatting, ));
            } else if(schematic[i].type === "node"){
                coorArr.push(new Coordinate().addInfo({label: schematic[i].value,formatting: schematic[i].formatting},"node-inline",tokens));
            }
            else{
                coorArr.push(schematic[i].value);
            }
        }
        return coorArr;
    }

    getSchematic(draw: string) {
        const regex=getRegex();
        const coordinatesArray = [];
        const nodeRegex = regExp(String.raw`node\s*\[(${regex.formatting}*)\]\s*{(${regex.text}*)}`);
        const formattingRegex = /(--cycle|cycle|--\+\+|--\+|--|-\||\|-|grid|circle|rectangle)/;
        const ca = String.raw`\w\d\s\-,.:`; // Define allowed characters for `ca`
        const coordinateRegex = new RegExp(String.raw`(\([${ca}]+\)|\(\$\([${ca}]+\)[${ca}!:+\-]+\([${ca}]+\)\$\))`);
        let i = 0;
        let loops = 0;
        
        while (i < draw.length && loops < 100) { // Increase loop limit or add condition based on parsed length
            loops++;
            const coordinateMatch = draw.slice(i).match(coordinateRegex);
            

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
        let result = `\\draw ${this.formatting?.toString()} `;
        let beforeToken: Coordinate | undefined;
        let afterToken: Coordinate | undefined;
        let slope;

        this.coordinates.forEach((coordinate: any, index: number) => {
            switch (true) {
                case coordinate instanceof Coordinate&&coordinate.mode==="node-inline": {
                    result += coordinate.toString();
                    break;
                }
                case typeof coordinate==="string": {
                    result += /(--\+\+|--\+)/.test(coordinate)?"--":coordinate;
                    break;
                }
                default: {
                    result +=`(${coordinate.toString()})`
                    break;
                }
            }
        });

        return result + ";";
    }
}
export class FormatTikzjax {
	source: string;
    tokens: Array<Token>=[];
    midPoint: Axis;
	processedCode="";
    debugInfo = "";
    
	constructor(source: string|Array<Token>) {
        if(typeof source==="string")
		this.source = this.tidyTikzSource(source);
        else this.tokens=source
        this.debugInfo+=this.source;
        this.tokenize();
        this.findMidpoint();
        this.applyPostProcessing();
        this.debugInfo+="\n\nthis.midPoint:\n"+JSON.stringify(this.midPoint,null,1)+"\n"
        this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"

        this.processedCode += this.reconstruct();
        this.debugInfo+=this.processedCode;
	}
    
    tidyTikzSource(tikzSource: string) {
        const remove = "&nbsp;";
        tikzSource = tikzSource.replaceAll(remove, "");let lines = tikzSource.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "");;
    }

    applyPostProcessing(){
        for(let i=0;i<this.tokens.length;i++){
            
        }
    }
    getCode(){
        return getPreamble()+this.processedCode+"\n\\end{tikzpicture}\\end{document}";
    }
    tokenize() {
        
        const ca = String.raw`\w\d\s-,.:|`; // Define allowed characters for `ca`
        const c = String.raw`[$(]{0,2}[${ca}]+[)$]{0,2}|\$\([${ca}]+\)[${ca}!:+]+\([${ca}]+\)\$`;
        // Define `coorRegex` with escaped characters for specific matching
        const cn = String.raw`[\w_\d\s]`; // Coordinate name
        const t = String.raw`\$[\w\d\s\-,.:(!)\-\{\}\+\\]*\$|[\w\d\s\-,.:(!)_\-\+\\]*`; // Text with specific characters
        const f = String.raw`[\w\s\d=:,!';.&*\{\}%\-<>]`; // Formatting with specific characters

        // Define `coorRegex` using escaped braces and patterns
        const coorRegex = new RegExp(String.raw`\\coor\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const nodeRegex = new RegExp(String.raw`\\node\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const se = new RegExp(String.raw`\\node\s*\(*(${cn})\)*\s*at\s*\((${c})\)\s*\[(${f}*)\]\s*\{(${t})\}`, "g");
        const ss = new RegExp(String.raw`\\coordinate\s*(\[label=\{\[(.*?)\]:\\\w*\s*([\w\s]*)\}\])?\s*\((${cn}+)\)\s*at\s*\((${c})\);`, "g");
        const drawRegex = new RegExp(String.raw`\\draw\[(${f}*)\]([^;]*);`, "g");
        const xyaxisRegex = new RegExp(String.raw`\\xyaxis{(${t})}{(${t})}`, "g");
        const gridRegex = new RegExp(String.raw`\\grid{([\d-.]+)}`, "g");
        const circleRegex = new RegExp(String.raw`\\circle\{(${c}+)\}\{(${c}+)\}\{(${c}+)\}\{([\w\s\d]*)\}`, "g");
        const massRegex = new RegExp(String.raw`\\mass\{(${c})\}\{(${t})\}\{(-\||\||>){0,1}\}\{([\d.]*)\}`,"g");

        const vecRegex = new RegExp(String.raw`\\vec\{(${c})\}\{(${c})\}\{(${t})\}\{(${f}*)\}`, "g");
        const regexPatterns = [coorRegex, se, ss, nodeRegex, drawRegex, circleRegex, massRegex, vecRegex];
        let matches: any[]=[];
        regexPatterns.forEach(ab => {
            matches.push(...[...this.source.matchAll(ab)])
        });
        
        matches.sort((a, b) => (a.index || 0) - (b.index || 0));

        [xyaxisRegex,gridRegex].forEach(ab => {
            matches.push(...[...this.source.matchAll(ab)])
        });

        let currentIndex = 0;
        for (const match of matches) {
          if (match.index !== undefined && match.index > currentIndex) {
            this.tokens.push(this.source.slice(currentIndex, match.index));
          }
          
          if (match[0].startsWith("\\coor")) {
            let i={original: match[1],coordinateName: match[2],label: match[3],formatting: match[4]}
            if(match[0].startsWith("\\coordinate")){
                Object.assign(i,{original: match[5],coordinateName: match[4],label: match[3],formatting: match[2]})
            }
            this.tokens.push(new Coordinate().addInfo(i,"coordinate",this));
          } else if (match[0].startsWith("\\draw")) {
            this.tokens.push(new Draw({formatting: match[1],draw: match[2]}, this));
          } else if (match[0].startsWith("\\xyaxis")) {
            //this.tokens.push(dissectXYaxis(match));
          } else if (match[0].startsWith("\\grid")) {
            //this.tokens.push({type: "grid", rotate: match[1]});
          } else if (match[0].startsWith("\\node")) {
            let i={original: match[1],coordinateName: match[3],label: match[4],formatting: match[3]}
            if (match[0].match(/\\node\s*\(/)){
                Object.assign(i,{original: match[2],coordinateName: match[1],label: match[3],formatting: match[4]});
            }
            this.tokens.push(new Coordinate().addInfo(i,"node",this));
          } else if (match[0].startsWith("\\circle")) {/*
            this.tokens.push({
              type: "circle",
              formatting: match[4],
              coordinates: [
                new Coordinate().simpleXY(match[1], this.tokens),
                new Coordinate().simpleXY(match[2], this.tokens),
                new Coordinate().simpleXY(match[3], this.tokens),
              ],
            });*/
          } else if (match[0].startsWith("\\mass")) {
            let i={original: match[1], label: match[2]}
            this.tokens.push(new Coordinate().addInfo(i,"node-mass",this,{anchor: match[3],rotate: match[4]}))

          } else if (match[0].startsWith("\\vec")) {
            match[2]=`(${match[1]})--+node[]{${match[3]}}(${match[2]})`
            match[1]=match[4]+',->'
            this.tokens.push(new Draw(match,this))
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
        let coordinates = this.tokens.filter((token: Token) => token instanceof Coordinate);
        this.tokens
        .filter((token: Token) => token instanceof Draw)
        .forEach((object: Draw) => {
            coordinates = coordinates.concat(
                object.coordinates.filter((token: any) => token instanceof Coordinate)
            );
        });
        let sumOfX = 0, sumOfY = 0;
        coordinates.forEach((coordinate: token) => {
          sumOfX += Number(coordinate.X);
          sumOfY += Number(coordinate.Y); 
        });

        this.midPoint=new Axis();
        this.midPoint.addCartesian(
            sumOfX / coordinates.length!==0?coordinates.length:1
            ,sumOfY / coordinates.length!==0?coordinates.length:1
        )
    }

    findOriginalValue(value: string) {
        const og = this.tokens.slice().reverse().find(
            (token: Token) =>
                (token instanceof Coordinate) && token.coordinateName === value
        );
        return og instanceof Coordinate ? og.clone() : undefined;
    }
    
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
            switch(token.type){/*
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
                case "vec":
                    codeBlockOutput+=`\\draw [-{Stealth},${token.formatting||""}](${token.anchor.X},${token.anchor.Y})--node [] {${token.text}}(${token.X+token.anchor.X},${token.Y+token.anchor.Y});`
            */}
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




/*
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
*/


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
    const preamble="\\usepackage{pgfplots,ifthen}\\usetikzlibrary{arrows.meta,angles,quotes,positioning, calc, intersections,decorations.markings,math,spy,matrix,patterns,snakes,decorations.pathreplacing,decorations.pathmorphing,patterns,shadows,shapes.symbols}"
    return preamble+ang+mark+arr+lene+spring+tree+table+coor+dvector+picAng+"\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}"
}