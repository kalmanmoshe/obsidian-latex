import { getAllTikzReferences, searchTikzComponents } from "src/staticData/dataManager";
import { arrToRegexString } from "../tikzjax";
import { findDeepestParenthesesScope, idParentheses, Paren } from "src/utils/ParenUtensils";
import { BasicTikzToken } from "src/basicToken";
import { Encasing } from "src/staticData/latexStaticData";

const parseNumber = (value: string) => {
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};

export function processTikzString(tikzString: string){
    tikzString=tidyTikzString(tikzString);
    const basicTikzTokens=basicTikzTokenify(tikzString);
    console.log('basicTikzTokens',tikzString,basicTikzTokens)
    const tikzGroups=defineLatexGroups(basicTikzTokens)
    console.log('tikzGroups',tikzGroups)
}



function tidyTikzString(source: string) {
    const remove = "&nbsp;";
    source = source.replaceAll(remove, "");let lines = source.split("\n");
    lines = lines.map(line => line.trim());
    lines = lines.filter(line => line);
    return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g,"");
}

function basicTikzTokenify(source: string):(BasicTikzToken|Paren)[] {
    const basicArray = [];
    const operatorsRegex = new RegExp('^' + arrToRegexString(getAllTikzReferences()));
    let i = 0;
     
    while (i < source.length) {
        const subSource = source.slice(i);
        let match;
    
        // Match TikZ operators
        match = subSource.match(operatorsRegex);
        if (match) {
            basicArray.push(BasicTikzToken.create(match[0]));
            i += match[0].length;
            continue;
        }
        match = subSource.match(/^[a-zA-Z\\]+/);
        if (match) {
            basicArray.push(BasicTikzToken.create(match[0]));
            i += match[0].length;
            continue;
        }
    
        // Match numbers
        match = subSource.match(/^[-0-9.]+/);
        if (match) {
            basicArray.push(BasicTikzToken.create(parseNumber(match[0])));
            i += match[0].length;
            continue;
        }
        throw new Error("Expected item to be recognized"+subSource)
    }
    return idParentheses(basicArray)
}

function defineLatexGroups(tokens: (BasicTikzToken | Paren | BasicTikzTokenGroup)[]): (BasicTikzToken | Paren | BasicTikzTokenGroup)[] {
    let i=0;
    while (true) {
        i++;
        if(i>10)
            return tokens
        const scope = findDeepestParenthesesScope(tokens);
        if (scope.begin === 0 && scope.end === tokens.length) {
            return tokens;
        }
        if (scope.begin < 0 || scope.end <= scope.begin || scope.end > tokens.length) {
            throw new Error("Invalid parentheses scope found");
        }
        const group = BasicTikzTokenGroup.create(tokens.slice(scope.begin, scope.end+1/*I want the ending incasing */));
        tokens.splice(scope.begin, (scope.end - scope.begin)+1, group);
    }
}




enum Type{
    Formatting
}
type BasicTikzGroupItem=(BasicTikzToken|BasicTikzTokenGroup);

function ensureAcceptableFormatForTikzGroupItems(items: BasicTikzGroupItem | BasicTikzGroupItem[]): BasicTikzGroupItem[] {
    if (!Array.isArray(items)) {
        items = [items];
    }
    const formattedItems: BasicTikzGroupItem[] = items.reduce((acc: BasicTikzGroupItem[], item: BasicTikzGroupItem) => {
        if (item instanceof BasicTikzToken || item instanceof BasicTikzTokenGroup) {
            acc.push(item);
        } else {
            throw new Error(`Expected item to be BasicTikzToken or BasicTikzTokenGroup, but received: ${item}`);
        }
        return acc;
    }, []);

    return formattedItems;
}

class BasicTikzTokenGroup{
    type: Type;
    encasing: Encasing
    items: Array<BasicTikzGroupItem>;
    constructor(type: Type,encasing: Encasing,items: BasicTikzGroupItem[]){
        this.type=type;
        this.encasing=encasing;
        this.items=items;
    }
    static create(tokens: any[]){
        const group=tokens.splice(1,tokens.length-2)
        if(tokens.length!==2&&!tokens[0].equals(tokens[1]))
            throw new Error("wtf");
        
        return new BasicTikzTokenGroup(Type.Formatting,Encasing.Brackets,ensureAcceptableFormatForTikzGroupItems(group))
    }
}

/*
export class BasicTikzTokens{
    private tokens: Array<BasicTikzToken|Formatting|Axis> = []
    private tikzCommands: TikzCommands=new TikzCommands();

    constructor(source: string){
        this.cleanBasicTikzTokenify()
        console.log(this.tokens)
        this.prepareForTokenize()
    }
    getTokens(){
        return this.tokens
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
            .find((item) => item instanceof BasicTikzToken && item.value === bracketName)
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

            prevToken.value = toPoint(prevToken.value as number, this.tokens[unitIdx].value);
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
        this.tokens=this.tokens.filter((_, idx) => (!indexesToRemove.includes(idx)));



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
        function a(tokens: any){
            const scope=findDeepestParenthesesScope(tokens)
            console.log(scope)
            const slice=tokens.slice(scope.begin,scope.end)
            tokens.splice(scope.begin,(scope.end-scope.begin)+1,[slice])
            return tokens
        }
        const b=this.tokens
        console.log(a(b))


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
        }, { coordinateIndexes: [], variableIndexes: [] });
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
}*/