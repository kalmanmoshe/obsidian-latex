//// @ts-nocheck

import { processTikzString } from "./BasicMathJaxTokenGroup";
import { arrToRegexString, Axis, Coordinate, Draw, Formatting, regExp, Token, toPoint } from "../tikzjax";
import { findDeepestParenthesesScope, findModifiedParenIndex, findParenIndex, idParentheses, mapBrackets } from "src/ParenUtensils";


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

const testSave=String.raw`
\NewDocumentCommand{\drawincircle}{ O{} O{} m m m }{%
  % Extract coordinates for vertices A, B, and C.
  \getxy{#3}{\xA}{\yA}
  \getxy{#4}{\xB}{\yB}
  \getxy{#5}{\xC}{\yC}
  
  % ----- Angle bisector at vertex A -----
  % Compute vector from A to B:
  \pgfmathsetmacro{\AxB}{\xB-\xA}%
  \pgfmathsetmacro{\AyB}{\yB-\yA}%
  \pgfmathsetmacro{\lenAB}{sqrt((\AxB)^2+(\AyB)^2)}%
  \pgfmathsetmacro{\uAx}{\AxB/\lenAB}%
  \pgfmathsetmacro{\uAy}{\AyB/\lenAB}%
  
  % Compute vector from A to C:
  \pgfmathsetmacro{\AxC}{\xC-\xA}%
  \pgfmathsetmacro{\AyC}{\yC-\yA}%
  \pgfmathsetmacro{\lenAC}{sqrt((\AxC)^2+(\AyC)^2)}%
  \pgfmathsetmacro{\vAx}{\AxC/\lenAC}%
  \pgfmathsetmacro{\vAy}{\AyC/\lenAC}%
  
  % Sum to get bisector direction at A:
  \pgfmathsetmacro{\bisAx}{\uAx+\vAx}%
  \pgfmathsetmacro{\bisAy}{\uAy+\vAy}%
  % Its slope:
  \pgfmathsetmacro{\slopeA}{\bisAy/\bisAx}%
  
  % ----- Angle bisector at vertex B -----
  % Compute vector from B to A:
  \pgfmathsetmacro{\BxA}{\xA-\xB}%
  \pgfmathsetmacro{\ByA}{\yA-\yB}%
  \pgfmathsetmacro{\lenBA}{sqrt((\BxA)^2+(\ByA)^2)}%
  \pgfmathsetmacro{\uBx}{\BxA/\lenBA}%
  \pgfmathsetmacro{\uBy}{\ByA/\lenBA}%
  
  % Compute vector from B to C:
  \pgfmathsetmacro{\BxC}{\xC-\xB}%
  \pgfmathsetmacro{\ByC}{\yC-\yB}%
  \pgfmathsetmacro{\lenBC}{sqrt((\BxC)^2+(\ByC)^2)}%
  \pgfmathsetmacro{\vBx}{\BxC/\lenBC}%
  \pgfmathsetmacro{\vBy}{\ByC/\lenBC}%
  
  % Sum to get bisector direction at B:
  \pgfmathsetmacro{\bisBx}{\uBx+\vBx}%
  \pgfmathsetmacro{\bisBy}{\uBy+\vBy}%
  % Its slope:
  \pgfmathsetmacro{\slopeB}{\bisBy/\bisBx}%
  
  % ----- Find Incenter as intersection of the two bisectors -----
  % Line at A: y = y_A + slopeA*(x - x_A)
  % Line at B: y = y_B + slopeB*(x - x_B)
  % Solve for x:
  \pgfmathsetmacro{\incenterx}{(\yB-\yA+\slopeA*\xA-\slopeB*\xB)/(\slopeA-\slopeB)}%
  \pgfmathsetmacro{\incentery}{\yA+\slopeA*(\incenterx-\xA)}%
  \coordinate (Incenter) at (\incenterx pt,\incentery pt);%
  
  % ----- Optionally capture the incenter coordinate and radius -----
  % If a name is provided as the first optional argument, assign the coordinate.
  \IfNoValueTF{#1}{}{%
    \coordinate (#1) at (\incenterx pt,\incentery pt);%
  }%
  % Compute incircle radius using the distance from Incenter to side BC.
  % The line through B and C: A*x+B*y+C=0, with:
  \pgfmathsetmacro{\Acoeff}{\yC-\yB}%
  \pgfmathsetmacro{\Bcoeff}{\xB-\xC}%
  \pgfmathsetmacro{\Ccoeff}{\xC*\yB-\xB*\yC}%
  \pgfmathsetmacro{\radius}{abs(\Acoeff*\incenterx+\Bcoeff*\incentery+\Ccoeff)/sqrt((\Acoeff)^2+(\Bcoeff)^2)}
  
  \IfNoValueTF{#2}{}{
    \edef#2{\radius pt}
  }
} 
`