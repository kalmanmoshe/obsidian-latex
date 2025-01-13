import { App, MarkdownView, Scope, WorkspaceWindow } from "obsidian";
import MathPlugin, { SvgBounds } from "src/main";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { cartesianToPolar, findIntersectionPoint, findSlope, polarToCartesian, toNumber } from "src/mathParser/mathUtilities.js";
import { DebugModal } from "src/desplyModals.js";
import { FormatTikzjax } from "./interpret/tokenizeTikzjax.js";
import { mapBrackets } from "src/utils/ParenUtensils.js";
import { BasicTikzToken } from "src/basicToken.js";



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
                const tikzjax=new FormatTikzjax(source,false);
                icon.onclick = () => new DebugModal(this.app,tikzjax.getCode(this.app)).open();
                script.setText(tikzjax.getCode(this.app));
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
export const arrToRegexString = (arr: Array<string>) => '(' + arr.join('|') + ')';

export function regExp(pattern: string | RegExp | Array<string>, flags: string = ''): RegExp {
    if (pattern instanceof RegExp) {
        pattern = pattern.source;
    } else if (Array.isArray(pattern)) {
        pattern = arrToRegexString(pattern);
    }

    // Create and return the RegExp
    return new RegExp(String.raw`${pattern}`, flags);
}


function getRegex(){
    const basic = String.raw`[\w\d\s-,.:]`;
    return {
        basic: basic,
        merge: String.raw`-\||\|-|![\d.]+!|\+|-`,
        //coordinate: new RegExp(String.raw`(${basic}+|1)`),
        coordinateName: String.raw`[\w_\d\s]`,
        text: String.raw`[\w\s-,.:'\$\(!\)_+\\{}=]`,
        formatting: String.raw`[\w\s\d=:,!';&*{}()%-<>]`
    };
}













interface token  {
    X?: number;
    Y?: number;
    type?: string;
    coordinateName?: string;
    coordinates?: any;
}







function findBeforeAfterAxis(axes: Array<Axis | string>, index: number): { before: number, after: number } {
    
    let beforeIndex = axes.slice(0, index).findLastIndex((axis: any) => axis instanceof Axis);
    let afterIndex = axes.slice(index + 1).findIndex((axis: any) => axis instanceof Axis);

    // Adjust `afterIndex` since we sliced from `index + 1`
    if (afterIndex !== -1) {
        afterIndex += index + 1;
    }

    // Wrap around if not found
    if (beforeIndex === -1) {
        beforeIndex = axes.findLastIndex((axis: any) => axis instanceof Axis);
    }

    if (afterIndex === -1) {
        afterIndex = axes.findIndex((axis: any) => axis instanceof Axis);
    }
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
    quadrant?: number;

    constructor(cartesianX?: number, cartesianY?: number, polarLength?: number, polarAngle?: number,name?: string) {
        if (cartesianX !== undefined) this.cartesianX = cartesianX;
        if (cartesianY !== undefined) this.cartesianY = cartesianY;
        if (polarLength !== undefined) this.polarLength = polarLength;
        if (polarAngle !== undefined) this.polarAngle = polarAngle;
        this.name=name
    }
    
    clone(): Axis {
        return new Axis(this.cartesianX, this.cartesianY,this.polarLength,this.polarAngle,this.name);
    }
    parseInput(input: any) {
        const axes=[]
        const bracketMap = mapBrackets('Parentheses_open', input);
        axes.push(this.processIndividual(input));
            if(axes.length===1)
                return axes[0]
    }
    
    processIndividual(input: any) {
        let axis = new Axis();
        const isCartesian = input.some((token: any) => token.name === 'Comma');
        input = input.filter((token: any) => token.type !== 'Syntax');
        if (isCartesian && input.length === 2) {
            axis.cartesianX = input[0].value;
            axis.cartesianY = input[1].value;
        }
        return axis;
    }
    

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
                    if (tokens){}
                        //axis = tokens.findOriginalValue(match)?.axis;
                    else throw new Error(`Tried to find original coordinate value while not being provided with tokens`);
                    if (!axis) {
                        throw new Error(`Couldn't find the coordinate ${match} from ${coordinate}`);
                        return
                    }
                    axis.name=match
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

    mergeAxis(axes: Array<Axis | string>) {
        if (!axes.some((axis: any) => typeof axis === "string")) {
            Object.assign(this, (axes[0] as Axis).clone());
            return;
        }

        for (const axis of axes) {
            if(typeof axis === "string"){continue;}
            axis.name=undefined
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
            length: match[0].length-(match[0].match(/-$/)?1:0)
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
    addQuadrant(midPoint: Axis){
        const x=midPoint.cartesianX>this.cartesianX;
        const y=midPoint.cartesianY>this.cartesianY;
        this.quadrant=x?y?1:4:y?2:3;
    }
    toStringSVG(bounds: SvgBounds): string {
        const normalizedX = ((this.cartesianX - bounds.min.cartesianX) / (bounds.max.cartesianX - bounds.min.cartesianX)) * bounds.getWidth();
        const normalizedY = bounds.getHeight() - ((this.cartesianY - bounds.min.cartesianY) / (bounds.max.cartesianY - bounds.min.cartesianY)) * bounds.getHeight();
    
        return `${normalizedX} ${normalizedY}`;
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
            findSlope(originalCoords[0].axis as Axis, originalCoords[1].axis as Axis),
            findSlope(originalCoords[2].axis as Axis, originalCoords[3].axis as Axis),
        ];

        return findIntersectionPoint(originalCoords[0].axis as Axis, originalCoords[2].axis as Axis, slopes[0], slopes[1]);
    }
}

export function toPoint(value:number,format: string){
    switch (format) {
        case "Point":
            return value;
        case "cm": 
            return value*28.346;
        case "mm":
            return value* 2.8346;
        default:
            throw new Error("unknon format");
    }
}


function matchKeyWithValue(key: string): string {
    const valueMap: Record<string, string> = {
        "anchor": "anchor=",
        "rotate": "rotate=",
        "lineWidth": "line width=",
        "fill": "fill=",
        "fillOpacity": "fill opacity=",
        "textOpacity": "text opacity=",
        "textColor": "text color=",
        "draw": "draw=",
        "text": "text=",
        "pos": "pos=",
        "scale": "scale=",
        "decorate": "decorate",
        "sloped": "sloped",
        "decoration": "decoration=",
        "brace": "brace",
        "amplitude": "amplitude=",
        "angleRadius": "angle radius=",
        "angleEccentricity": "angle eccentricity=",
        "font": "font=",
        "picText": "pic text=",
        "label": "label=",
        "freeFormText": ':',
    };

    return valueMap[key] || '';
}


type Decoration = {
    brace?: boolean;
    coil: boolean;
    amplitude?: number;
    aspect?: number;
    segmentLength?: number;
    decoration?: Decoration; 
};

type Label = {
    freeFormText?: string;
    color?: string;
    opacity?: number
};
const defaultValues: Record<string, any> = {
    freeFormText: "",
    color: "",
    opacity: 1,
};

function lineWidthConverter(width: string){
    return Number(width.replace(/ultra\s*thin/,"0.1")
    .replace(/very\s*thin/,"0.2")
    .replace(/thin/,"0.4")
    .replace(/semithick/,"0.6")
    .replace(/thick/,"0.8")
    .replace(/very\s*thick/,"1.2")
    .replace(/ultra\s*thick/,"1.6"))
}

export class Formatting{
    // importent needs to be forst
    path?: string;

    scale: number;
    rotate?: number;
    lineWidth?: number=0.4;
    textOpacity: number;
    opacity?: number;
    fillOpacity?: number;
    pos?: number;
    angleEccentricity?: number;
    angleRadius?: number;
    levelDistance?: number;

    mode: string;
    anchor?: string;
    color?: string;
    textColor?: string;
    fill?: string;
    arrow?: string;
    draw?: string;
    text?: string;
    tikzset?: string;
    position?: string;
    lineStyle?: string;
    font?: string;
    picText?: string;
    
    sloped?: boolean;
    decorate?: boolean;
    label?: Label;
    decoration?: Decoration;

    constructor(formatting: any[],mode?: string){
        if(mode)this.mode=mode;
        this.assignFormatting(formatting||[]);
    }


    assignFormatting(
        formattingArr: Array<{ key: string; value: any }>,
        targetScope: Record<string, any> = this
    ) {
        for (const { key, value } of formattingArr) {
            
            const normalizedKey = Object.keys(targetScope).find(
                (prop) => prop.toLowerCase() === key.toLowerCase()
            ) || key;
    
            if (this.isNested(value)) {
                targetScope[normalizedKey] = targetScope[normalizedKey] || this.createNested(normalizedKey);
                this.assignFormatting(value,targetScope[normalizedKey])
                continue;
            }
            else{
                targetScope[normalizedKey]=value
            }
        }
    }
    
    setProperty(scope: any, key: any, value: any): void {
        if (typeof scope === "object" && scope !== null) {
            scope[key] = value;
        } else {
            console.error("Invalid scope provided. Expected an object but received:", scope);
        }
    }
    
    

    createNested(key: string) {
        switch (key) {
            case 'label':
                return { color: undefined, opacity: undefined,freeFormText: undefined };
            case 'decoration':
                return {
                    brace: undefined,
                    coil: false,
                    amplitude: undefined,
                    aspect: undefined,
                    segmentLength: undefined,
                    decoration: undefined,
                };
            default:
                return {};
        }
    }
    
    isNested(value: any){
        return Array.isArray(value) && value.some((item: any) => item.key && item.value);
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
                : rawValue.replace(/-\|/,'north');
        }
        else{
            value=formatting
        }
        
        //this.setProperty(key, value, nestedKey);
    }
    

    


    addTikzset(splitFormatting: any){
        const a=splitFormatting.find((item: string)=> item.match(/mass|ang|helplines/))
        if (!a&&!this.tikzset)return;
        if(a) this.tikzset=a;

        switch (this.tikzset) {
            case "mass":
                this.fill="yellow!60";
                this.path="draw";
                this.text="black";
                break;
            case "vec":
                this.arrow='->'
                break;
            case "helplines":
                this.lineWidth=0.4;
                this.draw='gray';
                break;
            case "ang":
                this.path='draw'
                this.fill='black!50';
                this.fillOpacity=0.5;
                this.draw='orange'
                this.arrow='<->'
                this.angleEccentricity=1.6;
                this.angleRadius=toPoint(0.5,"cm");
                this.text='orange';
                this.font='\\large';
                this.textOpacity=0.9;
            break;
        }
    }

    addSplopAndPosition(arr: any,index: number){
        const beforeAfter=findBeforeAfterAxis(arr,index);
        const [before, after]=[arr[beforeAfter.before],arr[beforeAfter.after]]
        if (this.position||this.sloped){return}
    
        const edge1 = before.quadrant?.toString()||"";
        const edge2 = after.quadrant?.toString()||"";
        const slope=findSlope(before,after)

        this.sloped = slope !== 0&&slope!==Infinity&&slope!==-Infinity;

        let quadrant

        if (edge1!==edge2)
            quadrant=edge1+edge2;
        else 
            quadrant=edge1;

        //sint parallel to Y axis
        if (slope!==Infinity&&slope!==-Infinity){
            this.position = quadrant.replace(/(3|4)/,"below").replace(/(1|2)/,"above").replace(/(belowabove|abovebelow)/,"")
        }
        //isnt parallel to X axis
        if (slope !== 0){
            this.position=this.position?this.position:'';
            this.position+=quadrant.replace(/(1|4)/,"right").replace(/(2|3)/,"left").replace(/(rightleft|leftright)/,"")
        }
        this.position = this.position?.replace(/[\d]+/g,"").replace(/(below|above)(right|left)/,"$1 $2");
    }

    
    

    interpretFormatting(formattingString: string) {
        const splitFormatting = formattingString.replace(/\s/g, "").match(/(?:{[^}]*}|[^,{}]+)+/g) || [];
    
        this.addTikzset(splitFormatting);
    
        const patterns: Record<string, (value: string) => void> = {
            "linewidth": (value) => this.split("lineWidth", value),
            "fill=": (value) => this.split("fill", value),
            "^fillopacity": (value) => this.split("fillOpacity", value),
            "^(->|<-|-*{Stealth}-*)$": (value) => { this.arrow = value; },
            "^(above|below|left|right){1,2}$": (value) => { this.position = value.replace(/(above|below|left|right)/, "$1 "); },
            "^pos=": (value) => this.split("pos", value),
            "^draw=": (value) => this.split("draw", value),
            "^decorate$": () => { this.decorate = true; },
            "^text=": (value) => this.split("text", value),
            "^anchor=": (value) => this.split("anchor", value),
            "^\"^\"$": () => this.setProperty("label",true,"freeFormText" as keyof NonNullable<Formatting["label"]>),
            "^brace$": () => this.setProperty("decoration",true,"brace" as keyof NonNullable<Formatting["decoration"]>),
            "^amplitude": (value) => this.split("decoration", value, "amplitude" as keyof NonNullable<Formatting["decoration"]>),
            "^draw$": (value) => { this.path = value; },
            "^(red|blue|pink|black|white|[!\\d.]+){1,5}$": (value) => { this.color = value; },
            "^(dotted|dashed|smooth|densely|loosely){1,2}$": (value) => { this.lineStyle = value.replace(/(densely|loosely)/, "$1 "); },
        };

        splitFormatting.forEach(formatting => {/*
            // Handle nested properties
            const match = formatting.match(/^([^=]+)={(.*)}$/);
            if (match) {
                const [_, parent, children] = match;

                const formattingObj = this as Record<string, any>;
                if (!formattingObj[parent]) {
                    formattingObj[parent] = {};
                }
                const parsedChild = new Formatting(this.mode,{},children);
                
                Object.assign(formattingObj[parent], (parsedChild as Record<string, any>)[parent]);
                return;
            }

            for (const [pattern, handler] of Object.entries(patterns)) {
                if (new RegExp(pattern).test(formatting)) {
                    handler(formatting);
                    return;
                }
            }*/
        });
    }
    

    toString(obj?: any): string {
        let string=obj?'{':'[';
        for (const [key, value] of Object.entries(obj?obj:this)) {
            if (key.match(/^(mode|tikzset)$/)){continue;}
            if(typeof value === 'object'&&value){
                string+=matchKeyWithValue(key as keyof Formatting)+this.toString(value)+','
            }
            else if (value) {
                string+=matchKeyWithValue(key as keyof Formatting)+(typeof value==="boolean"?'':value)+',';
            }
        }
        return string+(obj?'}':']');
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

type Mode = "coordinate" | "coordinate-inline" | "node" | "node-inline";

export class Coordinate {
    mode: Mode
    axis?: Axis
    formatting?: Formatting
    variable?: Axis
    label?: string
    
  constructor(mode: Mode,axis?: Axis,formatting?: Formatting,variable?: Axis,label?: string,) {
    this.mode=mode;
    this.axis=axis;
    this.formatting=formatting;
    this.variable=variable;
    this.label=label;
  }
    interpretCoordinate(coordinates: any[]){
        const formatting=coordinates.find(coor=>coor instanceof Formatting)
        const axis=coordinates.find(coor=>coor instanceof Axis)
        const variable=coordinates.find(coor=>coor?.type==='variable').value
        this.formatting=formatting;
        this.axis=axis
        this.variable=variable
        return this
    }
    clone(): Coordinate {
        return new Coordinate(
            this.mode,
            this.axis ? this.axis.clone() :undefined,
            this.formatting,
            this.variable,
            this.label,
        );
    }

    addAxis(cartesianX?: number, cartesianY?: number, polarLength?: number, polarAngle?: number){
        this.axis=new Axis(cartesianX, cartesianY, polarLength, polarAngle);
    }

    toString() {
        console.log(this.mode)
        switch (this.mode) {
            case "coordinate":
                if (this.axis)
                    return`\\coordinate ${this.formatting?.toString() || ''} (${this.variable || ""}) at (${this.axis.toString()});`
            case "node":
                if (this.axis){}
                    //return `\\node ${this.coordinateName?'('+this.coordinateName+')':''} at (${this.axis.toString()}) ${this.formatting?.toString()||''} {${this.label}};`
            case "node-inline":
                return `node ${this.formatting?.toString() || ''} {${this.label || ''}}`
            default:
                throw new Error("Couldn't find mode at to string coordinate");
                break;
        }
    }

}

export type Token =Axis | Coordinate |Draw|Formatting| string;

export class Draw {
    mode: string
    formatting: Formatting;
    coordinates: any[]=[];


    constructor(mode: string,formatting?: Formatting,coordinates?: any[], tokens?: FormatTikzjax,) {;
        this.mode=mode;
        if(formatting)
            this.formatting=formatting;
        if(coordinates)
            this.coordinates=coordinates;
    }
    createFromArray(arr: any){/*
        const coordinatesArray = [];
        for (let i=0;i<arr.length;i++){
            if (arr[i] instanceof Axis||arr[i] instanceof Coordinate){
                coordinatesArray.push(arr[i])
            }
            if(typeof arr==="string"){
                coordinatesArray.push(arr[i])
            }
        }
        
        return coordinatesArray;*/
    }

    fillCoordinates(schematic: any[], tokens?: FormatTikzjax) {
        if(schematic[0] instanceof Formatting){
            this.formatting=schematic[0]
            schematic.splice(0,1)
        }
        const referenceFirstAxisMap = schematic
            .map((coor, index) => (coor instanceof BasicTikzToken && coor.getStringValue() === 'ReferenceFirstAxis' ? index : null))
            .filter((t): t is number => t !== null); 

        const referenceLastAxisMap = schematic
            .map((coor, index) => (coor instanceof BasicTikzToken && coor.getStringValue() === 'ReferenceLastAxis' ? index : null))
            .filter((t): t is number => t !== null);
        
        const mappedReferences = referenceFirstAxisMap.map(index => {
            schematic[index].name='AxisConnecter'
            const nextAxisIndex = schematic.slice(index + 1).findIndex(item => item instanceof Axis);
            const nextAxis = nextAxisIndex !== -1 ? schematic[index + 1 + nextAxisIndex] : null;
        
            return nextAxis;
        });

        const relationships = referenceLastAxisMap.map(index => {
            schematic[index].name='AxisConnecter'
            const nextAxisIndex = schematic.slice(index + 1).findIndex(item => item instanceof Axis);
            const nextAxis = nextAxisIndex !== -1 ? schematic[index + 1 + nextAxisIndex] : null;

            const previousAxisIndex = schematic
                .slice(0, index)
                .reverse()
                .findIndex(item => item instanceof Axis);

            const previousAxis = previousAxisIndex !== -1 ? schematic[index - 1 - previousAxisIndex] : null;

            return {
                referenceFirstAxis: schematic[index],
                previousAxis,
                nextAxis,
            };
        });
        if(mappedReferences.length>0){
            const firstAxis=schematic.find(t=>t instanceof Axis)
            mappedReferences.forEach(axis => {
                axis.complexCartesianAdd(firstAxis,"addition")
            });
        }

        this.coordinates=schematic;
        return this
        
        /*
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
                coorArr.push(new Coordinate({label: schematic[i].value,formatting: new Formatting("node-inline",{},schematic[i].formatting),mode: "node-inline"}));
            }
            else{
                coorArr.push(schematic[i].value);
            }
        }
        return coorArr;*/
    }

    getSchematic(draw: string) {
        const regex=getRegex();
        const coordinatesArray = [];
        const nodeRegex = regExp(String.raw`node\s*\[?(${regex.formatting}*)\]?\s*{(${regex.text}*)}`);
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
    toStringDraw(){
        let result = `\\draw ${this.formatting?.toString()} `;
        this.coordinates.forEach((coordinate: any, index: number) => {
            switch (true) {
                case coordinate instanceof Coordinate&&coordinate.mode==="node-inline": {
                    result += coordinate.toString();
                    break;
                }
                case coordinate instanceof BasicTikzToken: {
                    result += coordinate.toString();
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

    toStringPic(){
        let result = `\\draw pic ${this.formatting.toString()||''} {angle = ${(this.coordinates[0] as Axis).name}--${(this.coordinates[1] as Axis).name}--${(this.coordinates[2] as Axis).name}} `;
     

        return result + ";";
    }

    toString() {
        if (this.mode==='draw')
            return this.toStringDraw();
        if(this.mode==='draw-pic-ang')
            return this.toStringPic()
        
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

