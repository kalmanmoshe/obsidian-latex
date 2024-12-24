//// @ts-nocheck

import { findConsecutiveSequences } from "src/mathParser/mathEngine";
import { arrToRegexString, Axis, Coordinate, Draw, Formatting, regExp, Token, toPoint } from "../tikzjax";
import { findModifiedParenIndex, findParenIndex, idParentheses, mapBrackets } from "src/utils/tokenUtensils";
import { getAllTikzReferences, searchTikzComponents } from "src/utils/dataManager";

function labelFreeFormTextSeparation(label: any[]){
    const colonIndex=label.findIndex(t=>t.name==='Colon')
     label=label.splice(colonIndex,label.length-colonIndex)
    return label.splice(1)
}
function getOriginalTikzReferences(tokens: any[]){
    let string=''
    tokens.forEach(token => {
        const component=searchTikzComponents(token.name||token.value)
        if(component&&component.references?.length>0){
            string+=component.references[0]
        }
        else
            string+=token.value
    });
    return string
}

function cleanFormatting(formatting: any[],subType?: string): any[] {
    const values: any[][] = [];
    let currentGroup: any[] = [];
    const formattingKeys=[]

    if(subType==='Label'){
        const label=labelFreeFormTextSeparation(formatting)
        formattingKeys.push({key: 'freeFormText',value: getOriginalTikzReferences(label)})
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
        const hashtagMap=this.content.map((item,index)=>item.name==='Hashtag'&&this.content[index+1].type==='number'?index:null)
        .filter(t=>t!==null)
        if(hashtagMap.length!==this.hookNum){
            throw new Error(`Discrepancy between the number of hooks declared and the number of hooks found in the command hookNum: ${this.hookNum} hashtagMap.length: ${hashtagMap.length}`);
        }
        hashtagMap.sort((a,b)=>b-a)
        hashtagMap.forEach(idx => {
            const hashtag=this.content[idx];
            hashtag.type='Syntax'
            hashtag.name='hook'
            hashtag.value=this.content[idx+1]?.value;
            this.content.splice(idx+1,1)
        });
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
        const id2 = findModifiedParenIndex(id1, undefined, tokens, 0, 1);
        const id3 = findModifiedParenIndex(id1, undefined, tokens, 0, 1, 'Curly_brackets_open');
    
        if (!id2 || !id3) {
            console.error("Error: Unable to find matching brackets.");
            return;
        }
        id1=findParenIndex(id1, undefined, tokens)
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
            item.name === 'hook' ? { index, value: item.value } : null
        ).filter(t => t !== null);
        map?.reverse();

        const uniqueValues = new Set();
        for (const { index, value } of map || []) {
            if (!uniqueValues.has(value)) {
                uniqueValues.add(value);
            }
            content.splice(index, 1, ...hooks[value-1]);
        }
        return content
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

export class BasicTikzToken{
    type: string;
    name: string
    value: any
    constructor(value: any){
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
        return getOriginalTikzReferences([this])
    }
}

export class TikzVariable{
    //type: 

}
export class TikzVariables{
    variables: []=[]

}

function toVariableToken(arr: any[]) {
    arr=arr.filter(t=>(!t.type.includes('Parentheses')))
    const token=new BasicTikzToken(getOriginalTikzReferences(arr))
    token.type='variable'
    return token
}

interface ParenPair{
    open:number,
    close: number
}

export class BasicTikzTokens{
    private tokens: Array<BasicTikzToken|Formatting|Axis> = []
    private tikzCommands: TikzCommands=new TikzCommands();

    constructor(source: string){
        source = this.tidyTikzSource(source);
        this.basicTikzTokenify(this.basicArrayify(source))
        this.cleanBasicTikzTokenify()
        
        this.prepareForTokenize()
    }
    getTokens(){
        return this.tokens
    }

    private tidyTikzSource(source: string) {
        const remove = "&nbsp;";
        source = source.replaceAll(remove, "");let lines = source.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g,"");
    }

    private basicArrayify(source: string){
        const basicArray = [];
        const operatorsRegex = new RegExp('^' + arrToRegexString(getAllTikzReferences()));
        let i = 0;
         
        while (i < source.length) {
            const subSource = source.slice(i);
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
            match = subSource.match(/^[a-zA-Z\\]+/);
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
    private basicTikzTokenify(basicArray: any[]){
         // Process tokens
        basicArray.forEach(({ type, value }) => {
            if (type === 'string') {
                const tikzCommand = searchTikzComponents(value);
                if (tikzCommand) {
                    this.tokens.push(new BasicTikzToken(tikzCommand));
                }
                else
                this.tokens.push(new BasicTikzToken(value));
                
            } else if (type === 'number') {
                this.tokens.push(new BasicTikzToken(value));
            }
        });
        idParentheses(this.tokens)
    }
    private inferAndInterpretCommands() {
        // Step 1: Extract command indices
        const commandsMap = this.tokens
            .map((t, idx) => (t instanceof BasicTikzToken && t.type === 'Macro' ? idx : null))
            .filter((t) => t !== null);
        commandsMap.forEach((index) => {
            const firstBracketAfterIndex = this.findFirstBracketAfter(index, 'Curly_brackets_open');
            if (!firstBracketAfterIndex) return;
    
            const endOfExpression = findModifiedParenIndex(
                firstBracketAfterIndex.value,
                undefined,
                this.tokens,
                0,
                1,
                'Curly_brackets_open'
            );
            if (!endOfExpression) {
                throw new Error(`Expression end not found for command at index ${index}`);
            }
    
            const commandTokens = this.tokens.splice(index, Math.abs(index - (endOfExpression.close + 1)));
            this.tikzCommands.addCommandByInterpretation(commandTokens);
        });
    
        // Step 3: Match commands to tokens
        const commandsInTokens = this.tokens
            .map((item, index) => this.matchCommandToToken(item, index))
            .filter((t) => t !== null);
    
        // Step 4: Process confirmed commands
        const confirmedCommands = this.processConfirmedCommands(commandsInTokens);
    
        // Step 5: Replace tokens with processed commands
        this.replaceTokensWithCommands(confirmedCommands);
    }
    
    // Helper to find the first matching bracket after a given index
    private findFirstBracketAfter(startIndex: number, bracketName: string): BasicTikzToken | null {
        const firstBracketAfter=this.tokens
            .slice(startIndex)
            .find((item) => item instanceof BasicTikzToken && item.name === bracketName)
        return firstBracketAfter instanceof BasicTikzToken?firstBracketAfter:null;
    }
    
    // Helper to match commands to tokens
    private matchCommandToToken(item: any, index: number): any | null {
        if (!(item instanceof BasicTikzToken) || item.type !== 'string') return null;
    
        const match = this.tikzCommands.commands.find((c) => c.trigger === item.value);
        return match ? { index, ...match.getInfo() } : null;
    }
    
    // Helper to process confirmed commands
    private processConfirmedCommands(commandsInTokens: any[]): { ids: ParenPair[]; index: number }[] {
        const confirmedCommands = [];
    
        for (const { index, trigger, hooks } of commandsInTokens) {
            if (typeof hooks !== 'number' || hooks <= 0) {
                throw new Error(`Invalid hooks value for command at index ${index}`);
            }
    
            const firstBracketAfterIndex = this.findFirstBracketAfter(index, 'Curly_brackets_open');
            if (!firstBracketAfterIndex) {
                throw new Error(`Curly_brackets_open not found after index ${index}`);
            }
            
            const obj: { ids: ParenPair[] } = { ids: [] };
            for (let i = 0; i < hooks; i++) {
                const parenPairIndex = findModifiedParenIndex(
                    firstBracketAfterIndex.value,
                    undefined,
                    this.tokens,
                    0,
                    i,
                    'Curly_brackets_open'
                );
    
                if (!parenPairIndex) {
                    throw new Error(`Paren pair not found for hook ${i} at index ${index}`);
                }
    
                if (obj.ids.length > 0) {
                    const lastId = obj.ids[obj.ids.length - 1];
                    if (lastId.close !== parenPairIndex.open - 1) {
                        throw new Error(
                            `Mismatch between last close (${lastId.close}) and next open (${parenPairIndex.open})`
                        );
                    }
                }
                obj.ids.push(parenPairIndex);
            }
            confirmedCommands.push({ ...obj, index });
        }
    
        return confirmedCommands;
    }
    
    // Helper to replace tokens with processed commands
    private replaceTokensWithCommands(confirmedCommands: any[]) {
        confirmedCommands.forEach((command) => {
            if (!command.ids || command.ids.length === 0) {
                console.error('Error: Command IDs are empty or undefined.');
                return;
            }
    
            const open = command.index;
            const close = command.ids[command.ids.length - 1].close;
    
            if (close < open) {
                console.error(`Error: Close index (${close}) is smaller than open index (${open}).`);
                return;
            }
    
            const deleteCount = close - open + 1;
            const removedTokens = this.tokens.slice(open, deleteCount);
    
            const replacement = this.tikzCommands.replaceCallWithCommand(
                command.trigger,
                command.hooks,
                this.tikzCommands.getHooks(removedTokens, command.ids)
            );
    
            if (!replacement) {
                throw new Error(
                    `Replacement generation failed for command at index ${command.index} with trigger ${command.trigger}.`
                );
            }
    
            this.tokens.splice(open, deleteCount, ...replacement);
        });
    }
    
    private cleanBasicTikzTokenify(){

        this.inferAndInterpretCommands()


        const unitIndices: number[] = this.tokens
        .map((token, idx) => (token instanceof BasicTikzToken&&token.type === 'Unit' ? idx : null))
        .filter((idx): idx is number => idx !== null);

        unitIndices.forEach((unitIdx) => {
            const prevToken = this.tokens[unitIdx - 1];
            if (!(prevToken instanceof BasicTikzToken)||!(this.tokens[unitIdx] instanceof BasicTikzToken))return
            if (!prevToken || prevToken.type !== 'number') {
                throw new Error(`Units can only be used in reference to numbers at index ${unitIdx}`);
            }

            prevToken.value = toPoint(prevToken.value as number, this.tokens[unitIdx].name);
        });

        this.tokens=this.tokens.filter((_, idx) => (!unitIndices.includes(idx)));

        //this.tokens=this.tokens.filter((t) => t.name!=='Comma');
        /*
        const indexesToRemove: number[]=[]
        this.tokens.forEach((token,index) => {
            if(token.type==='Formatting'){
                if(this.tokens[index+1].name==='Equals')
                {
                    this.tokens[index].value=this.tokens[index+2]
                    indexesToRemove.push(index+1,index+2);
                }
            }
        });
        this.tokens=this.tokens.filter((_, idx) => (!indexesToRemove.includes(idx)));*/



        const mapSyntax = this.tokens
        .map((token, idx) => (token instanceof BasicTikzToken&&token.type === 'Syntax' && /(Dash|Plus)/.test(token.name) ? idx : null))
        .filter((idx): idx is number => idx !== null);

        const syntaxSequences = findConsecutiveSequences(mapSyntax);


        const syntaxObjects = syntaxSequences
        .map((sequence) => {
            if (sequence.length === 0) return null;

            const start = sequence[0];
            const end = sequence[sequence.length - 1];
            
            const value = sequence
                .map((index: number) => {
                    const token = this.tokens[index];
                    if (!(token instanceof BasicTikzToken))return ''
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
            const command = searchTikzComponents(value); 
            const token = new BasicTikzToken(command)
            this.tokens.splice(start, end + 1 - start, token);
        });
    }

    private prepareForTokenize(){
        const squareBracketIndexes = mapBrackets('Square_brackets_open',this.tokens)
        squareBracketIndexes
        .sort((a: { open: number; }, b: { open: number; }) => b.open - a.open) // Sort in descending order of 'open'
        .forEach((index: { open: number; close: number; }) => {
            const formatting = new Formatting(
                cleanFormatting(this.tokens.slice(index.open + 1, index.close))
            );
            this.tokens.splice(index.open, index.close + 1 - index.open, formatting);
        });

        //let praneIndexes = mapBrackets('Parentheses_open', this.tokens);
        let coordinateIndexes = mapBrackets('Parentheses_open', this.tokens)
        .filter((item: { close: number; },idx: any)=>this.tokens[item.close+1] instanceof BasicTikzToken&&(this.tokens[item.close+1]as BasicTikzToken).value!=='at')
        /*
        const { coordinateIndexes, variableIndexes } = praneIndexes.reduce((result, item) => {
            if (this.tokens[item.close + 1]?.value !== 'at') {
                result.coordinateIndexes.push(item);
            } 
            if (this.tokens[item.close + 1]?.value === 'at') {
                result.variableIndexes.push(item);
            }
            return result;
        }, { coordinateIndexes: [], variableIndexes: [] });*/
        coordinateIndexes
        .sort((a: { open: number; }, b: { open: number; }) => b.open - a.open) 
        .forEach((index: { open: number; close: number ; }) => {
            const axis = new Axis().parseInput(
                this.tokens.slice(index.open + 1, index.close)
            );
            if (!axis)return
            this.tokens.splice(index.open, index.close + 1 - index.open, axis);
        });

        let variableIndexes = mapBrackets('Parentheses_open', this.tokens)
        .filter((item: { close: number; },idx: any)=>this.tokens[item.close+1] instanceof BasicTikzToken&&(this.tokens[item.close+1]as BasicTikzToken).value!=='at')

        variableIndexes
        .sort((a: { open: number; }, b: { open: number; }) => b.open - a.open) 
        .forEach((index: { open: number ; close: number ; }) => {
            console.log(index,this.tokens.slice(index.open, index.close))
            const variable = toVariableToken(this.tokens.slice(index.open + 1, index.close));
            console.log(variable)
            this.tokens.splice(index.open, index.close + 1 - index.open, variable);
        });
    }
}



export class FormatTikzjax {
	source: string;
    tokens: Array<Token>=[];
    tikzCommands: TikzCommands=new TikzCommands();
    //midPoint: Axis;
    private viewAnchors: {max: Axis,min:Axis,aveMidPoint: Axis}
	processedCode="";
    debugInfo = "";
    
	constructor(source: string) {
        if(!source.match(/(usepackage|usetikzlibrary)/)){
		//const basicTikzTokens=new BasicTikzTokens(source)
        //console.log('basicTikzTokens',basicTikzTokens)
        //this.tokenize(basicTikzTokens.getTokens())
        //console.log('tokenize',this.tokens)
        //this.processedCode += this.toString()

        //this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"
        }
        //else {this.processedCode=source;}
        this.processedCode=this.tidyTikzSource(source);
        this.debugInfo+=this.processedCode;
	}

    private tidyTikzSource(source: string) {
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

    getCode(){
        if (typeof this.source==="string"&&this.source.match(/(usepackage|usetikzlibrary)/)){
            return this.processedCode
        }
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

const parseNumber = (value: string) => {
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};



import fs from 'fs';

function getStyFileContent(filePath: fs.PathOrFileDescriptor) {
    try {
        return fs.readFileSync(filePath, 'utf8'); // Read the file synchronously
    } catch (error) {
        console.error('Error reading the .sty file:', error);
        return ''; // Return an empty string on error
    }
}

function getPreamble():string{
    const styContent = getStyFileContent('/Users/moshe/Desktop/school/obsidian/data/Files/preamble.sty');
    
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
    
    return preamble+styContent+ang+mark+arr+lene+spring+tree+table+coor+dvector+picAng+massSet+"\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}"
}