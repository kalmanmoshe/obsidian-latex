// @ts-nocheck
import { findConsecutiveSequences } from "src/mathEngine";
import { arrToRegexString, Axis, Coordinate, Draw, Formatting, regExp, Token, toPoint } from "../tikzjax";
import { getAllTikzReferences, searchTizkCommands, searchTizkForOgLatex } from "src/tikzjax/tikzCommands";
import { findParenIndex, idParentheses, mapBrackets, Paren } from "src/utils/tokenUtensils";

function cleanFormatting(formatting: any[]): any[][] {
    const values: any[][] = [];
    let currentGroup: any[] = [];

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
    const formattingKeys=[]
    values.forEach((value) => {
        formattingKeys.push(assignFormatting(value));
    });

    return formattingKeys 
}

function assignFormatting(formatting){
    const isEquals=formatting.map((f,idx)=>f.name==='Equals'?idx:null).filter(t=>t!==null);
    const key=formatting[0]?.name
    if(isEquals.length===1)
        formatting=formatting.slice((isEquals[0]+1))
    let value=interpretFormattingValue(formatting);
    return {key,value}
}

function interpretFormattingValue(formatting){
    if (formatting.length===1){
        return formatting[0].value||true
    }
    return formatting
}
class TikzCommand{
    trigger: string;
    entryPoints: number;

}
class TikzCommands{
    commands: TikzCommand[];
    constructor();
    addCommand(tokens){

    }
}
export class BasicTikzToken{
    type: string;
    name: string
    value: string|number|Paren|any
    constructor(value: number|string|object){
        if (typeof value==='number'){
            this.type='number'
            this.value=value;
            return 
        }
        if(typeof value==='string'){
            this.type='string'
            this.value=value;
            return
        }
        
        this.type=value.type.replace(/Bracket/,'Syntax')
        this.name=value.name
        this.value=value.value
        
    }
    toString(){
        return searchTizkForOgLatex(this.name).latex
    }
}


export class FormatTikzjax {
	source: string;
    tokens: Array<Token>=[];

    //midPoint: Axis;
    private viewAnchors: {max: Axis,min:Axis,aveMidPoint: Axis}
	processedCode="";
    debugInfo = "";
    
	constructor(source: string|Array<Token>) {
        if(typeof source==="string"){
		this.source = this.tidyTikzSource(source);
        const basicArray=this.basicArrayify()
        let basicTikzTokens=this.basicTikzTokenify(basicArray)
        
        let a=this.cleanBasicTikzTokenify(basicTikzTokens)
        console.log(a)
        this.PrepareForTokenize(a)
        this.tokenize(a)
        this.processedCode += this.toString()
        this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"
        this.debugInfo+=this.processedCode;
        }
        else {this.tokens=source}

        if (typeof source==="string"&&source.match(/(usepackage|usetikzlibrary)/)){
            this.processedCode=source;
        }
        else{/*
            this.debugInfo+=this.source;
            this.findViewAnchors();
            this.applyPostProcessing();

            this.debugInfo+="\n\nthis.midPoint:\n"+JSON.stringify(this.viewAnchors,null,1)+"\n"
            this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"

            this.processedCode += this.toString();
            this.debugInfo+=this.processedCode;*/
        }
	}
    basicArrayify(){
        const basicArray = [];
        const operatorsRegex = new RegExp('^' + arrToRegexString(getAllTikzReferences()));
        let i = 0;
         
        while (i < this.source.length) {
            const subSource = this.source.slice(i);
            let match;
        
            // Match TikZ operators
            match = subSource.match(operatorsRegex);
            if (match) {
            basicArray.push({ type: 'string', value: match[0] });
                i += match[0].length;
                continue;
            }
        
            // Match numbers
            match = subSource.match(/^[-0-9.]+/);
            if (match) {
            basicArray.push({ type: 'number', value: parseNumber(match[0]) });
                i += match[0].length;
                continue;
            }
            match = subSource.match(/^[a-zA-Z\\#]+/);
            if (match) {
            basicArray.push({ type: 'string', value: match[0] });
                i += match[0].length;
                continue;
            }

        
            // Increment index if no match found
            i++;
        }
        return basicArray
    }
    basicTikzTokenify(basicArray){
        let basicTikzTokens: Array<BasicTikzToken|Formatting> = [];
         // Process tokens
        basicArray.forEach(({ type, value }) => {
            if (type === 'string') {
                const tikzCommand = searchTizkCommands(value);
                if (tikzCommand) {
                basicTikzTokens.push(new BasicTikzToken(tikzCommand));
                }
                else
                    basicTikzTokens.push(new BasicTikzToken(value));
                
            } else if (type === 'number') {
            basicTikzTokens.push(new BasicTikzToken(value));
            }
        });
        idParentheses(basicTikzTokens)
        return basicTikzTokens;
    }
    cleanBasicTikzTokenify(basicTikzTokens){
        const commandsMap=basicTikzTokens.map((t,idx)=>t.type==='Command'?idx:null)
        .filter(t=>t!==null);
        




        const unitIndices: number[] = basicTikzTokens
        .map((token, idx) => (token.type === 'Unit' ? idx : null))
        .filter((idx): idx is number => idx !== null);

        unitIndices.forEach((unitIdx) => {
            const prevToken = basicTikzTokens[unitIdx - 1];

            if (!prevToken || prevToken.type !== 'number') {
                throw new Error(`Units can only be used in reference to numbers at index ${unitIdx}`);
            }

            prevToken.value = toPoint(prevToken.value as number, basicTikzTokens[unitIdx].name);
        });

        basicTikzTokens=basicTikzTokens.filter((_, idx) => (!unitIndices.includes(idx)));
        //basicTikzTokens=basicTikzTokens.filter((t) => t.name!=='Comma');
        /*
        const indexesToRemove: number[]=[]
        basicTikzTokens.forEach((token,index) => {
            if(token.type==='Formatting'){
                if(basicTikzTokens[index+1].name==='Equals')
                {
                    basicTikzTokens[index].value=basicTikzTokens[index+2]
                    indexesToRemove.push(index+1,index+2);
                }
            }
        });
        basicTikzTokens=basicTikzTokens.filter((_, idx) => (!indexesToRemove.includes(idx)));*/



        const mapSyntax = basicTikzTokens
        .map((token, idx) => (token.type === 'Syntax' && /(Dash|Plus)/.test(token.name) ? idx : null))
        .filter((idx): idx is number => idx !== null);

        const syntaxSequences = findConsecutiveSequences(mapSyntax);


        const syntaxObjects = syntaxSequences
        .map((sequence) => {
            if (sequence.length === 0) return null; // Handle empty sequences

            const start = sequence[0];
            const end = sequence[sequence.length - 1];
            
            
            const value = sequence
                .map((index) => {
                    const token = basicTikzTokens[index];
                    if (!token || !token.name) {
                        console.warn(`Missing or invalid token at index ${index}`);
                        return ''; // Provide a fallback
                    }
                    return token.name
                        .replace(/Dash/, '-')
                        .replace(/Plus/, '+');
                })
                .join('');

            return { start, end, value };
        })
        .filter((obj) => obj !== null)
        .sort((a, b) => b.start - a.start);

        syntaxObjects.forEach(({ start, end, value }) => {
            const command = searchTizkCommands(value); 
            const token = new BasicTikzToken(command)
            basicTikzTokens.splice(start, end + 1 - start, token);
        });
        return basicTikzTokens
    }

    PrepareForTokenize(basicTikzTokens){

        const squareBracketIndexes = mapBrackets('Square_brackets_open',basicTikzTokens)
        
        squareBracketIndexes
        .sort((a, b) => b.open - a.open) // Sort in descending order of 'open'
        .forEach((index) => {
            const formatting = new Formatting(
                cleanFormatting(basicTikzTokens.slice(index.open + 1, index.close))
            );
            basicTikzTokens.splice(index.open, index.close + 1 - index.open, formatting);
        });

        const praneIndexes = mapBrackets('Parentheses_open' ,basicTikzTokens)
        praneIndexes
        .sort((a, b) => b.open - a.open) 
        .forEach((index) => {
            const axis = new Axis().parseInput(
                basicTikzTokens.slice(index.open + 1, index.close)
            );
            basicTikzTokens.splice(index.open, index.close + 1 - index.open, axis);
        });
        return basicTikzTokens
    }
    tokenize(basicTikzTokens){
        let endIndex
        for(let i=0;i<basicTikzTokens.length;i++){
            if (basicTikzTokens[i].name==='Draw'){
                endIndex=basicTikzTokens.slice(i).findIndex(t=>t.name==='Semicolon')+i
                const drawSegment=basicTikzTokens.slice(i+1,endIndex)
                i=endIndex
                this.tokens.push(new Draw('draw').fillCoordinates(drawSegment))
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
        console.log(basicTikzTokens);
    }
    
    tidyTikzSource(tikzSource: string) {
        const remove = "&nbsp;";
        tikzSource = tikzSource.replaceAll(remove, "");let lines = tikzSource.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g,"");
    }

    getCode(){
        if (typeof this.source==="string"&&this.source.match(/(usepackage|usetikzlibrary)/))
            return this.processedCode
        return getPreamble()+this.processedCode+"\n\\end{tikzpicture}\\end{document}";
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

    /*
    tokenize() {
        

        const ca = String.raw`\w\d\s-,.:|`; // Define allowed characters for `ca`
        const c = String.raw`[$(]{0,2}[${ca}]+[)$]{0,2}|\$\([${ca}]+\)[${ca}!:+]+\([${ca}]+\)\$`;
        // Define `coorRegex` with escaped characters for specific matching
        const cn = String.raw`[\w_\d\s]`; // Coordinate name
        const t = String.raw`\"?\$[\w\d\s\-,.:(!)\-\{\}\+\\ ^]*\$\"?|[\w\d\s\-,.:(!)_\-\+\\^]*`; // Text with specific characters
        const f = String.raw`[\w\s\d=:,!';.&*\{\}%\-<>]`; // Formatting with specific characters

        // Define `coorRegex` using escaped braces and patterns
        const coorRegex = new RegExp(String.raw`\\coor\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const picRegex = new RegExp(String.raw`\\pic\{(${c})\}\{(${c})\}\{(${c})\}\{(${t})\}\{(${f}*)\}`, "g");
        const nodeRegex = new RegExp(String.raw`\\node\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const se = new RegExp(String.raw`\\node\s*\(*(${cn})\)*\s*at\s*\((${c})\)\s*\[(${f}*)\]\s*\{(${t})\}`, "g");
        const ss = new RegExp(String.raw`\\coordinate\s*(\[label=\{\[(.*?)\]:\\\w*\s*([\w\s]*)\}\])?\s*\((${cn}+)\)\s*at\s*\((${c})\);`, "g");
        const drawRegex = new RegExp(String.raw`\\draw\[(${f}*)\]([^;]*);`, "g");
        const xyaxisRegex = new RegExp(String.raw`\\xyaxis{(${t})}{(${t})}`, "g");
        const gridRegex = new RegExp(String.raw`\\grid{([\d-.]+)}`, "g");
        const circleRegex = new RegExp(String.raw`\\circle\{(${c}+)\}\{(${c}+)\}\{(${c}+)\}\{([\w\s\d]*)\}`, "g");
        const massRegex = new RegExp(String.raw`\\mass\{(${c})\}\{(${t})\}\{(-\||\||>){0,1}\}\{([\d.]*)\}`,"g");
        //\pic{anc2}{anc1}{anc0}{75^\circ }{};
        const vecRegex = new RegExp(String.raw`\\vec\{(${c})\}\{(${c})\}\{(${t})\}\{(${f}*)\}`, "g");
        const regexPatterns = [coorRegex, se, ss, nodeRegex, drawRegex, circleRegex, massRegex, vecRegex,picRegex];
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
            const { formatting,original, ...rest } = i;
            this.tokens.push(new Coordinate({mode: "coordinate",axis: new Axis().universal(original,this),formatting: new Formatting("coordinate", undefined,formatting),...rest,}));

          } else if (match[0].startsWith("\\pic")) {
            const c1=new Axis().universal(match[1],this)
            const c2=new Axis().universal(match[2],this)
            const c3=new Axis().universal(match[3],this)


            this.tokens.push(new Draw({mode: "pic-ang",tokens: this,formattingString: match[5],formattingObj: {tikzset: "ang",icText: match[4]},drawArr: [c1,c2,c3]}));
          }else if (match[0].startsWith("\\draw")) {
            this.tokens.push(new Draw(undefined,match[1],match[2], this));
          } else if (match[0].startsWith("\\xyaxis")) {
          } else if (match[0].startsWith("\\grid")) {
            //this.tokens.push({type: "grid", rotate: match[1]});
          } else if (match[0].startsWith("\\node")) {
            let i={original: match[1],coordinateName: match[3],label: match[4],formatting: match[3]}
            if (match[0].match(/\\node\s*\(/)){
                Object.assign(i,{original: match[2],coordinateName: match[1],label: match[4],formatting: match[3]});
            }
            const { formatting,original, ...rest } = i;
            this.tokens.push(new Coordinate({mode: "node",axis: new Axis().universal(original,this),formatting: new Formatting("node", undefined,formatting),...rest,}));
          } else if (match[0].startsWith("\\circle")) {/*
            this.tokens.push({
              type: "circle",
              formatting: match[4],
              coordinates: [
                new Coordinate().simpleXY(match[1], this.tokens),
                new Coordinate().simpleXY(match[2], this.tokens),
                new Coordinate().simpleXY(match[3], this.tokens),
              ],
            });*
          } else if (match[0].startsWith("\\mass")) {
            this.tokens.push(new Coordinate({mode: "node",label: match[2],axis: new Axis().universal(match[1],this),formatting: new Formatting("node",{tikzset: 'mass',anchor: match[3],rotate: match[4]})}))

          } else if (match[0].startsWith("\\vec")) {
            const ancer=new Axis().universal(match[1],this);
            const axis1=new Axis().universal(match[2],this);
            const node=new Coordinate({mode: "node-inline",formatting: new Formatting('node-inline',{color: "red"})})

            const c1=new Coordinate("node-inline");
            const q=[ancer,'--+',node,axis1]
            this.tokens.push(new Draw({formattingObj: {tikzset: 'vec'},tokens: this,drawArr: q}))
          }

          if (match.index !== undefined) {
            currentIndex = match.index + match[0].length;
          }
        }
        
        if (currentIndex < this.source.length) {
            this.tokens.push(this.source.slice(currentIndex));
        }
    }*/
    getMin(){return this.viewAnchors.min}
    getMax(){return this.viewAnchors.max}

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
        const og = this.tokens.slice().reverse().find(
            (token: Token) =>
                (token instanceof Coordinate) && token.coordinateName === value
        );
        return og instanceof Coordinate ? og.clone() : undefined;
    }
    

    toString(){
        let codeBlockOutput = "";
        const extremeXY=getExtremeXY(this.tokens);
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
class TikzVariables{

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

const parseNumber = (value: string) => {
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};





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