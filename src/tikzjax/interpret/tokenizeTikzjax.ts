//// @ts-nocheck

import { processTikzString } from "./BasicMathJaxTokenGroup";
import { arrToRegexString, Axis, Coordinate, Draw, Formatting, regExp, Token, toPoint } from "../tikzjax";
import { findDeepestParenthesesScope, findModifiedParenIndex, findParenIndex, idParentheses, mapBrackets } from "src/utils/ParenUtensils";


function labelFreeFormTextSeparation(label: any[]){
    const colonIndex=label.findIndex(t=>t.name==='Colon')
     label=label.splice(colonIndex,label.length-colonIndex)
    return label.splice(1)
}

function cleanFormatting(formatting: any[],subType?: string): any[] {
    const values: any[][] = [];
    let currentGroup: any[] = [];
    const formattingKeys=[]

    if(subType==='Label'){
        const label=labelFreeFormTextSeparation(formatting)
        formattingKeys.push({key: 'freeFormText',value: label.toString()})
    }
    

    const bracketMap=mapBrackets('Curly_brackets_open',formatting);
    bracketMap.reverse()
    bracketMap.forEach((bracket: { open: number; close: number; }) => {
        if(formatting[bracket.open-1].name==='Equals'){
            let subFormatting=formatting.splice(bracket.open-1,bracket.close-(bracket.open-2))
            subFormatting=subFormatting.slice(2,-1)
            formatting[bracket.open-2].value=cleanFormatting(subFormatting,formatting[bracket.open-2].name)
        }
    });

    for (const item of formatting) {
        if (item.name === 'Comma') {
            if (currentGroup.length > 0) {
                values.push(currentGroup);
                currentGroup = [];
            }
        } else {
            currentGroup.push(item);
        }
    }
    if (currentGroup.length > 0) {
        values.push(currentGroup);
    }

    
    values.forEach((value) => {
        formattingKeys.push(assignFormatting(value));
    });
    return formattingKeys 
}

function assignFormatting(formatting: any[]): any{

    const isEquals=formatting.map((f,idx)=>f.name==='Equals'?idx:null).filter(t=>t!==null);
    const key=formatting[0]?.name

    if(isEquals.length===1)
        formatting=formatting.slice((isEquals[0]+1))

    let value=interpretFormattingValue(formatting);
    return {key,value}
}


function interpretFormattingValue(formatting: string | any[]){
    if (formatting.length===1){
        return formatting[0].value||true
    }
    return formatting
}

class TikzCommand{
    trigger: string;
    hookNum: number;
    hooks: any;
    content: BasicTikzToken[]
    addCommand(trigger: string, hookNum: number, content: any[]){
        this.trigger=trigger;
        this.hookNum=hookNum;
        this.content=content;
        this.findHooks()
        return this
    }
    findHooks(){
        const hashtagMap=this.content.map((item,index)=>item.getStringValue()==='Hashtag'&&this.content[index+1].getType()==='number'?index:null)
        .filter(t=>t!==null)
        if(hashtagMap.length!==this.hookNum){
            throw new Error(`Discrepancy between the number of hooks declared and the number of hooks found in the command hookNum: ${this.hookNum} hashtagMap.length: ${hashtagMap.length}`);
        }
        hashtagMap.sort((a,b)=>b-a)/*
        hashtagMap.forEach(idx => {
            const hashtag=this.content[idx];
            hashtag.type='Syntax'
            hashtag.name='hook'
            hashtag.value=this.content[idx+1]?.value;
            this.content.splice(idx+1,1)
        });*/
    }
    getInfo(){
        return {trigger: this.trigger,hooks: this.hookNum}
    }
}

class TikzCommands{
    commands: TikzCommand[]=[];
    constructor(){};
    addCommand(tokens: any){
        
    }
    addCommandByInterpretation(tokens: any[]) {
        console.log('tokens',tokens)
        const id1Token = tokens.find((item) => item.name === 'Curly_brackets_open');
        if (!id1Token) {
            console.error("Error: 'Curly_brackets_open' not found in tokens.");
            return;
        }
        let id1 = id1Token.value;
        const id2 = findModifiedParenIndex(id1, tokens, 0, 1);
        const id3 = findModifiedParenIndex(id1, tokens, 0, 1, 'Curly_brackets_open');
    
        if (!id2 || !id3) {
            console.error("Error: Unable to find matching brackets.");
            return;
        }
        id1=findParenIndex(id1, tokens)
        let trigger, hooks, content;
        content = tokens.splice(id3.open + 1, id3.close - id3.open - 1);
        hooks = tokens.splice(id2.open + 1, id2.close - id2.open - 1);
        trigger = tokens.splice(id1.open+1, id1.close - id1.open - 1);

        if (hooks.length === 1 && hooks[0]?.type === 'number') {
            hooks = hooks[0].value;
        } else {
            throw new Error("Invalid hooks: Expected a single numeric value.");
        }
        
        if (trigger.length === 1 && trigger[0]?.type === 'string') {
            trigger = trigger[0].value;
        } else {
            throw new Error("Invalid trigger: Expected a single string value.");
        }
        this.commands.push(new TikzCommand().addCommand(trigger, hooks, content))
    }

    replaceCallWithCommand(trigger: string,hookNumber: number,hooks: any[]){
        const content = this.commands.find(command => 
            command.trigger === trigger && hookNumber === command.hookNum
        )?.content;
        if(!content)return null;
        const map = content?.map((item, index) => 
            item.getStringValue() === 'hook' ? { index, value: item.getStringValue() } : null
        ).filter(t => t !== null);
        map?.reverse();

        const uniqueValues = new Set();/*Remove this disk for the err
        for (const { index, value } of map || []) {
            if (!uniqueValues.has(value)) {
                uniqueValues.add(value);
            }
            content.splice(index, 1, ...hooks[value-1]);
        }
        return content*/
    }

    getHooks(tokens: any[],ids: any[]){
        tokens.splice(0,1)
        const adjustmentValue=ids[0].open
        ids.forEach(id => {
            id.open-=adjustmentValue;
            id.close-=adjustmentValue;
        });
        ids.reverse();
        const hooks: any[][]=[]
        ids.forEach(id => {
            const removed=tokens.splice(id.open+1,id.close-(id.open+1))
            hooks.push(removed)
        });
        hooks.reverse();
        return hooks
    }
    
}


export class TikzVariable{
    //type: 

}
export class TikzVariables{
    variables: []=[]

}


export class FormatTikzjax {
	source: string;
    tokens: Array<Token>=[];
    tikzCommands: TikzCommands=new TikzCommands();
    //midPoint: Axis;
    private viewAnchors: {max: Axis,min:Axis,aveMidPoint: Axis}
	processedCode="";
    debugInfo = "";
    
	constructor(source: string,toEval?: boolean) {
        if(toEval){
            console.log(processTikzString(source))
        }
        /*
        if(!source.match(/(usepackage|usetikzlibrary)/)){
            const basicTikzTokens=new BasicTikzTokens(source)
            console.log('basicTikzTokens',basicTikzTokens)
            this.tokenize(basicTikzTokens.getTokens())
            console.log('tokenize',this.tokens)
            this.processedCode += this.toString()

            this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"
        }*/
        else {this.processedCode=source;}
        this.processedCode=this.tidyTikzSource(source);
        this.debugInfo+=this.processedCode;
	}
    tidyTikzSource(source: string) {
        const remove = "&nbsp;";
        source = source.replaceAll(remove, "");let lines = source.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g,"");
    }
    tokenize(basicTikzTokens: any[]){
        let endIndex
        for(let i=0;i<basicTikzTokens.length;i++){
            if (basicTikzTokens[i].name==='Draw'){
                endIndex=basicTikzTokens.slice(i).findIndex(t=>t.name==='Semicolon')+i
                const segment=basicTikzTokens.slice(i+1,endIndex)
                i=endIndex
                this.tokens.push(new Draw('draw').fillCoordinates(segment))
            }
            if (basicTikzTokens[i].name==='Coordinate'){
                endIndex=basicTikzTokens.slice(i).findIndex(t=>t.name==='Semicolon')+i
                const segment=basicTikzTokens.slice(i+1,endIndex)
                console.log(segment)
                i=endIndex
                this.tokens.push(new Coordinate('coordinate').interpretCoordinate(segment))
            }
        }
        /*
        They're going to be three types stringed syntax number.
         I use them to tokenize. using the ticks commands. Once tokenizer takes commands.
         I move on to actual evaluation.
        */

        
        let subdefinedTokens=[];
        /*
        for (let i=0;i<basicTikzTokens.length;i++){

        }*/
    }

    getCode(app: App){
        if (typeof this.source==="string"&&this.source.match(/(usepackage|usetikzlibrary)/)){
            return this.processedCode
        }
        return getPreamble(app)+this.processedCode+"\n\\end{tikzpicture}\\end{document}";
    }
    
    applyPostProcessing(){
        const flatAxes=flatten(this.tokens).filter((item: any)=> item instanceof Axis);
        flatAxes.forEach((axis: Axis) => {
            axis.addQuadrant(this.viewAnchors.aveMidPoint);
        });

        const flatDraw=flatten(this.tokens,[],Draw).filter((item: any)=> item instanceof Draw);
        flatDraw.forEach((draw: Draw) => {
            for (const  [index, coor] of draw.coordinates.entries()) {
                if (coor instanceof Coordinate) {
                    coor.formatting?.addSplopAndPosition(draw.coordinates,index)
                }
            }
        });
        
    }
    findViewAnchors() {
        const axes = flatten(this.tokens).filter((item: any) => item instanceof Axis);
        
        let sumOfX = 0, sumOfY = 0;
        let maxX = -Infinity, maxY = -Infinity;
        let minX = Infinity, minY = Infinity;
    
        this.viewAnchors = {
            max: new Axis(0, 0),
            min: new Axis(0, 0),
            aveMidPoint: new Axis(0, 0)
        };
    
        axes.forEach((axis: Axis) => {
            const { cartesianX, cartesianY } = axis;
    
            // Update sums for average calculation
            sumOfX += cartesianX;
            sumOfY += cartesianY;
    
            // Update max and min coordinates
            if (cartesianX > maxX) maxX = cartesianX;
            if (cartesianY > maxY) maxY = cartesianY;
            if (cartesianX < minX) minX = cartesianX;
            if (cartesianY < minY) minY = cartesianY;
        });
    
        const length = axes.length !== 0 ? axes.length : 1;
    
        // Set the viewAnchors
        this.viewAnchors.aveMidPoint = new Axis(sumOfX / length, sumOfY / length);
        this.viewAnchors.max = new Axis(maxX, maxY);
        this.viewAnchors.min = new Axis(minX, minY);
    }
    

    findOriginalValue(value: string) {
        return undefined;/*
        const og = this.tokens.slice().reverse().find(
            (token: Token) =>
                (token instanceof Coordinate) && token.coordinateName === value
        );
        return og instanceof Coordinate ? og.clone() : undefined;*/
    }
    

    toString(){
        let codeBlockOutput = "";
        console.log('this.tokens',this.tokens)
        //const extremeXY=getExtremeXY(this.tokens);
        this.tokens.forEach((token: any) => {
            if(token.toString()){
                codeBlockOutput +=token.toString()
            } else {
            codeBlockOutput += token;
          }
        });
        return codeBlockOutput;
    }
}


function flatten(data: any, results: any[] = [], stopClass?: any): any[] {
    if (Array.isArray(data)) {
      for (const item of data) {
        flatten(item, results, stopClass);
      }
    } else if (typeof data === 'object' && data !== null) {
      // If the object is an instance of the stopClass, add it to results and stop flattening
      if (stopClass && data instanceof stopClass) {
        results.push(data);
        return results;
      }
  
      // Add the current object to results
      results.push(data);
  
      // Recursively flatten properties of the object
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          flatten(data[key], results, stopClass);
        }
      }
    }
    return results;
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





import * as fs from 'fs';
import { BasicTikzToken } from "src/mathParser/basicToken";
import { App, FileSystemAdapter } from "obsidian";


function getStyFileContent(filePath: fs.PathLike): string {
    try {
        // Check if the file exists before trying to read
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        } else {
            console.error(`File does not exist: ${filePath}`);
            return '';
        }
    } catch (error) {
        console.error('Error reading the .sty file:', error instanceof Error ? error.message : error);
        return '';
    }
}

import * as path from 'path';
export function getPreamble(app: App):string{
    
    let styContent = ''
    const adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
        const vaultPath = adapter.getBasePath();
        const preamblePath = path.join(vaultPath, 'obsidian','data', 'Files', 'preamble.sty');
        //styContent = getStyFileContent(preamblePath);
    }
    styContent=styContent.split('\n').filter(line=>!line.match(/(int|frac)/)).join('\n')

    const ang="\\tikzset{ang/.style 2 args={fill=black!50,opacity=0.5,text opacity=0.9,draw=orange,<->,angle eccentricity=#1,angle radius=#2cm,text=orange,font=\\large},ang/.default={1.6}{0.5}}"
  
    const mark="\\def\\mark#1#2#3{\\path [decoration={markings, mark=at position 0.5 with {\\foreach \\x in {#1} { \\draw[line width=1pt] (\\x,-3pt) -- (\\x,3pt); }}}, postaction=decorate] (#2) -- (#3);}"
  
    const arr="\\newcommand{\\arr}[8]{\\coordinate (2) at ($(#2)!#7!(#3)$);\\coordinate (1) at ($(2)!#5mm!90:(#3)$);\\coordinate (3) at ($(2)!#5mm+#4cm!#8:(#3)$);\\draw [line width=1pt,<-] (1)--(3)node [pos=#6] {\\large #1};}" 
    const lene="\\def\\cor#1#2#3#4#5{\\coordinate (#1) at($(#2)!#3!#4:(#5)$);}\\def\\dr#1#2{\\draw [line width=#1,]#2;}\\newcommand{\\len}[6]{\\cor{1}{#2}{#3}{90}{#4}\\cor{3}{#4}{#3}{-90}{#2}\\node (2) at ($(1)!0.5!(3)$) [rotate=#6]{\\large #1};\\dr{#5pt,|<-}{(1)--(2)}\\dr{#5pt,->|}{(2)--(3)}}"
    const spring="\\newcommand{\\spring}[4]{\\tikzmath{coordinate \\start, \\done;\\start = (#1);\\done = (#2);}\\draw[thick] ($(\\start) + (-1.5,0)$) --++(3,0);\\draw (\\start) --+ (0,-0.25cm);\\draw ($(\\start) + (\\donex+0cm,\\doney+0.25cm)$)--+(0,-0.25);\\draw[decoration={aspect=0.3, segment length=3, amplitude=2mm,coil,},decorate] (\\startx,\\starty-0.25cm) --($(\\start) + (\\donex,\\doney+0.25cm)$)node[midway,right=0.25cm,black]{#4};\\node[fill=yellow!60,draw,text=black,anchor= north] at ($(\\start) + (\\donex,\\doney)$){#3};}"
    
    const tree="\\newcommand{\\lenu}[3]{\\tikzset{level distance=20mm,level #1/.style={sibling distance=#2mm, nodes={fill=red!#3,circle,inner sep=1pt,draw=none,text=black,}}}}"
    
    const table="\\tikzset{ table/.style={matrix of nodes,row sep=-\\pgflinewidth,column sep=-\\pgflinewidth,nodes={rectangle,draw=black,align=center},minimum height=1.5em,text depth=0.5ex,text height=2ex,nodes in empty cells,every even row/.style={nodes={fill=gray!60,text=black,}},column 1/.style={nodes={text width=5em,font=\\bfseries}},row 1/.style={nodes={font=\\bfseries}}}}"
    const coor="\\def\\coor#1#2#3#4{\\coordinate [label={[#4]:\\Large #3}] (#2) at ($(#1)$);}"
    const mass=`\\def\\mass#1#2{\\node[fill=yellow!60,draw,text=black,anchor= north] at (#1){#2};}`
    const massSet="\\tikzset{ mass/.style={fill=yellow!60,draw,text=black}}"
    const dvector="\\newcommand{\\dvector}[2]{\\coordinate (temp1) at ($(0,0 -| #1)$);\\coordinate (temp2) at ($(0,0 |- #1)$);\\draw [line width=0.7pt,#2] (#1)--(temp1)(#1)--(temp2);}"
    
    const picAng="\\newcommand{\\ang}[5]{\\coordinate (ang1) at (#1); \\coordinate (ang2) at (#2); \\coordinate (ang3) at (#3); \\pgfmathanglebetweenpoints{\\pgfpointanchor{ang3}{center}}{\\pgfpointanchor{ang2}{center}}\\let\\angCB\\pgfmathresult\\pgfmathanglebetweenpoints{\\pgfpointanchor{ang2}{center}}{\\pgfpointanchor{ang1}{center}}\\let\\angAB\\pgfmathresult\\pgfmathparse{\\angCB - \\angAB}\\ifdim\\pgfmathresult pt<0pt\\pgfmathparse{\\pgfmathresult + 360}\\fi\\ifdim\\pgfmathresult pt>180pt\\pgfmathparse{360 - \\pgfmathresult}\\fi\\let\\angB\\pgfmathresult\\pgfmathsetmacro{\\angleCheck}{abs(\\angB - 90)}\\ifthenelse{\\lengthtest{\\angleCheck pt < 0.1pt}}{\\pic [ang#5,\"{${#4}\$}\",]{right angle=ang1--ang2--ang3};}{\\pic [ang#5,\"{${#4}\$}\",]{angle=ang1--ang2--ang3};}}"
    const preamble="\\usepackage{pgfplots,ifthen}\\usetikzlibrary{arrows.meta,angles,quotes,positioning, calc, intersections,decorations.markings,math,spy,matrix,patterns,snakes,decorations.pathreplacing,decorations.pathmorphing,patterns,shadows,shapes.symbols}"
    
    return '\\documentclass{standalone}'+preamble+styContent+ang+mark+arr+lene+spring+tree+table+coor+dvector+picAng+massSet+"\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}"
}