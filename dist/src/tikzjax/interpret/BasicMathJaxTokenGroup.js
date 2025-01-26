import { getAllTikzReferences } from "src/staticData/dataManager";
import { arrToRegexString } from "../tikzjax";
import { findDeepestParenthesesScope, idParentheses } from "src/utils/ParenUtensils";
import { BasicTikzToken } from "src/basicToken";
import { Encasing } from "src/staticData/encasings";
const parseNumber = (value) => {
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};
export function processTikzString(tikzString) {
    tikzString = tidyTikzString(tikzString);
    const basicTikzTokens = basicTikzTokenify(tikzString);
    console.log('basicTikzTokens', tikzString, basicTikzTokens);
    const tikzGroups = defineLatexGroups(basicTikzTokens);
    console.log('tikzGroups', tikzGroups);
}
function tidyTikzString(source) {
    const remove = "&nbsp;";
    source = source.replaceAll(remove, "");
    let lines = source.split("\n");
    lines = lines.map(line => line.trim());
    lines = lines.filter(line => line);
    return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g, "");
}
function basicTikzTokenify(source) {
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
        throw new Error("Expected item to be recognized" + subSource);
    }
    return idParentheses(basicArray);
}
function defineLatexGroups(tokens) {
    let i = 0;
    while (true) {
        i++;
        if (i > 10)
            return tokens;
        const scope = findDeepestParenthesesScope(tokens);
        if (scope.begin === 0 && scope.end === tokens.length) {
            return tokens;
        }
        if (scope.begin < 0 || scope.end <= scope.begin || scope.end > tokens.length) {
            throw new Error("Invalid parentheses scope found");
        }
        const group = BasicTikzTokenGroup.create(tokens.slice(scope.begin, scope.end + 1 /*I want the ending incasing */));
        tokens.splice(scope.begin, (scope.end - scope.begin) + 1, group);
    }
}
var Type;
(function (Type) {
    Type[Type["Formatting"] = 0] = "Formatting";
})(Type || (Type = {}));
function ensureAcceptableFormatForTikzGroupItems(items) {
    if (!Array.isArray(items)) {
        items = [items];
    }
    const formattedItems = items.reduce((acc, item) => {
        if (item instanceof BasicTikzToken || item instanceof BasicTikzTokenGroup) {
            acc.push(item);
        }
        else {
            throw new Error(`Expected item to be BasicTikzToken or BasicTikzTokenGroup, but received: ${item}`);
        }
        return acc;
    }, []);
    return formattedItems;
}
class BasicTikzTokenGroup {
    type;
    encasing;
    items;
    constructor(type, encasing, items) {
        this.type = type;
        this.encasing = encasing;
        this.items = items;
    }
    static create(tokens) {
        const group = tokens.splice(1, tokens.length - 2);
        if (tokens.length !== 2 && !tokens[0].equals(tokens[1]))
            throw new Error("wtf");
        return new BasicTikzTokenGroup(Type.Formatting, Encasing.Brackets, ensureAcceptableFormatForTikzGroupItems(group));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmFzaWNNYXRoSmF4VG9rZW5Hcm91cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy90aWt6amF4L2ludGVycHJldC9CYXNpY01hdGhKYXhUb2tlbkdyb3VwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxvQkFBb0IsRUFBd0IsTUFBTSw0QkFBNEIsQ0FBQztBQUN4RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDOUMsT0FBTyxFQUFFLDJCQUEyQixFQUFFLGFBQWEsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBQzVGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNoRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFcEQsTUFBTSxXQUFXLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtJQUNsQyxNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEMsT0FBTyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDO0FBQ2hELENBQUMsQ0FBQztBQUVGLE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxVQUFrQjtJQUNoRCxVQUFVLEdBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3RDLE1BQU0sZUFBZSxHQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUMsVUFBVSxFQUFDLGVBQWUsQ0FBQyxDQUFBO0lBQ3pELE1BQU0sVUFBVSxHQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFBO0lBQ25ELE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFDLFVBQVUsQ0FBQyxDQUFBO0FBQ3hDLENBQUM7QUFJRCxTQUFTLGNBQWMsQ0FBQyxNQUFjO0lBQ2xDLE1BQU0s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Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTRSRyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaWt6Q29tcG9uZW50cyB9IGZyb20gXCJzcmMvc3RhdGljRGF0YS9kYXRhTWFuYWdlclwiO1xyXG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nIH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgZmluZERlZXBlc3RQYXJlbnRoZXNlc1Njb3BlLCBpZFBhcmVudGhlc2VzLCBQYXJlbiB9IGZyb20gXCJzcmMvdXRpbHMvUGFyZW5VdGVuc2lsc1wiO1xyXG5pbXBvcnQgeyBCYXNpY1Rpa3pUb2tlbiB9IGZyb20gXCJzcmMvYmFzaWNUb2tlblwiO1xyXG5pbXBvcnQgeyBFbmNhc2luZyB9IGZyb20gXCJzcmMvc3RhdGljRGF0YS9lbmNhc2luZ3NcIjtcclxuXHJcbmNvbnN0IHBhcnNlTnVtYmVyID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcclxuICAgIGNvbnN0IG51bWJlclZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtYmVyVmFsdWUpID8gMCA6IG51bWJlclZhbHVlO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHByb2Nlc3NUaWt6U3RyaW5nKHRpa3pTdHJpbmc6IHN0cmluZyl7XHJcbiAgICB0aWt6U3RyaW5nPXRpZHlUaWt6U3RyaW5nKHRpa3pTdHJpbmcpO1xyXG4gICAgY29uc3QgYmFzaWNUaWt6VG9rZW5zPWJhc2ljVGlrelRva2VuaWZ5KHRpa3pTdHJpbmcpO1xyXG4gICAgY29uc29sZS5sb2coJ2Jhc2ljVGlrelRva2VucycsdGlrelN0cmluZyxiYXNpY1Rpa3pUb2tlbnMpXHJcbiAgICBjb25zdCB0aWt6R3JvdXBzPWRlZmluZUxhdGV4R3JvdXBzKGJhc2ljVGlrelRva2VucylcclxuICAgIGNvbnNvbGUubG9nKCd0aWt6R3JvdXBzJyx0aWt6R3JvdXBzKVxyXG59XHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIHRpZHlUaWt6U3RyaW5nKHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xyXG4gICAgc291cmNlID0gc291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSBzb3VyY2Uuc3BsaXQoXCJcXG5cIik7XHJcbiAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XHJcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJykucmVwbGFjZSgvKD88PVteXFx3XSkgfCAoPz1bXlxcd10pL2csIFwiXCIpLnJlcGxhY2UoLyg/PCFcXFxcKSUuKiQvZ20sIFwiXCIpLnJlcGxhY2UoL1xcbi9nLFwiXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBiYXNpY1Rpa3pUb2tlbmlmeShzb3VyY2U6IHN0cmluZyk6KEJhc2ljVGlrelRva2VufFBhcmVuKVtdIHtcclxuICAgIGNvbnN0IGJhc2ljQXJyYXkgPSBbXTtcclxuICAgIGNvbnN0IG9wZXJhdG9yc1JlZ2V4ID0gbmV3IFJlZ0V4cCgnXicgKyBhcnJUb1JlZ2V4U3RyaW5nKGdldEFsbFRpa3pSZWZlcmVuY2VzKCkpKTtcclxuICAgIGxldCBpID0gMDtcclxuICAgICBcclxuICAgIHdoaWxlIChpIDwgc291cmNlLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IHN1YlNvdXJjZSA9IHNvdXJjZS5zbGljZShpKTtcclxuICAgICAgICBsZXQgbWF0Y2g7XHJcbiAgICBcclxuICAgICAgICAvLyBNYXRjaCBUaWtaIG9wZXJhdG9yc1xyXG4gICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKG9wZXJhdG9yc1JlZ2V4KTtcclxuICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKEJhc2ljVGlrelRva2VuLmNyZWF0ZShtYXRjaFswXSkpO1xyXG4gICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eW2EtekEtWlxcXFxdKy8pO1xyXG4gICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goQmFzaWNUaWt6VG9rZW4uY3JlYXRlKG1hdGNoWzBdKSk7XHJcbiAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAvLyBNYXRjaCBudW1iZXJzXHJcbiAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2goL15bLTAtOS5dKy8pO1xyXG4gICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goQmFzaWNUaWt6VG9rZW4uY3JlYXRlKHBhcnNlTnVtYmVyKG1hdGNoWzBdKSkpO1xyXG4gICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGl0ZW0gdG8gYmUgcmVjb2duaXplZFwiK3N1YlNvdXJjZSlcclxuICAgIH1cclxuICAgIHJldHVybiBpZFBhcmVudGhlc2VzKGJhc2ljQXJyYXkpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlZmluZUxhdGV4R3JvdXBzKHRva2VuczogKEJhc2ljVGlrelRva2VuIHwgUGFyZW4gfCBCYXNpY1Rpa3pUb2tlbkdyb3VwKVtdKTogKEJhc2ljVGlrelRva2VuIHwgUGFyZW4gfCBCYXNpY1Rpa3pUb2tlbkdyb3VwKVtdIHtcclxuICAgIGxldCBpPTA7XHJcbiAgICB3aGlsZSAodHJ1ZSkge1xyXG4gICAgICAgIGkrKztcclxuICAgICAgICBpZihpPjEwKVxyXG4gICAgICAgICAgICByZXR1cm4gdG9rZW5zXHJcbiAgICAgICAgY29uc3Qgc2NvcGUgPSBmaW5kRGVlcGVzdFBhcmVudGhlc2VzU2NvcGUodG9rZW5zKTtcclxuICAgICAgICBpZiAoc2NvcGUuYmVnaW4gPT09IDAgJiYgc2NvcGUuZW5kID09PSB0b2tlbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbnM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChzY29wZS5iZWdpbiA8IDAgfHwgc2NvcGUuZW5kIDw9IHNjb3BlLmJlZ2luIHx8IHNjb3BlLmVuZCA+IHRva2Vucy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBwYXJlbnRoZXNlcyBzY29wZSBmb3VuZFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZ3JvdXAgPSBCYXNpY1Rpa3pUb2tlbkdyb3VwLmNyZWF0ZSh0b2tlbnMuc2xpY2Uoc2NvcGUuYmVnaW4sIHNjb3BlLmVuZCsxLypJIHdhbnQgdGhlIGVuZGluZyBpbmNhc2luZyAqLykpO1xyXG4gICAgICAgIHRva2Vucy5zcGxpY2Uoc2NvcGUuYmVnaW4sIChzY29wZS5lbmQgLSBzY29wZS5iZWdpbikrMSwgZ3JvdXApO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5lbnVtIFR5cGV7XHJcbiAgICBGb3JtYXR0aW5nXHJcbn1cclxudHlwZSBCYXNpY1Rpa3pHcm91cEl0ZW09KEJhc2ljVGlrelRva2VufEJhc2ljVGlrelRva2VuR3JvdXApO1xyXG5cclxuZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvclRpa3pHcm91cEl0ZW1zKGl0ZW1zOiBCYXNpY1Rpa3pHcm91cEl0ZW0gfCBCYXNpY1Rpa3pHcm91cEl0ZW1bXSk6IEJhc2ljVGlrekdyb3VwSXRlbVtdIHtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShpdGVtcykpIHtcclxuICAgICAgICBpdGVtcyA9IFtpdGVtc107XHJcbiAgICB9XHJcbiAgICBjb25zdCBmb3JtYXR0ZWRJdGVtczogQmFzaWNUaWt6R3JvdXBJdGVtW10gPSBpdGVtcy5yZWR1Y2UoKGFjYzogQmFzaWNUaWt6R3JvdXBJdGVtW10sIGl0ZW06IEJhc2ljVGlrekdyb3VwSXRlbSkgPT4ge1xyXG4gICAgICAgIGlmIChpdGVtIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gfHwgaXRlbSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuR3JvdXApIHtcclxuICAgICAgICAgICAgYWNjLnB1c2goaXRlbSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBpdGVtIHRvIGJlIEJhc2ljVGlrelRva2VuIG9yIEJhc2ljVGlrelRva2VuR3JvdXAsIGJ1dCByZWNlaXZlZDogJHtpdGVtfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gYWNjO1xyXG4gICAgfSwgW10pO1xyXG5cclxuICAgIHJldHVybiBmb3JtYXR0ZWRJdGVtcztcclxufVxyXG5cclxuY2xhc3MgQmFzaWNUaWt6VG9rZW5Hcm91cHtcclxuICAgIHR5cGU6IFR5cGU7XHJcbiAgICBlbmNhc2luZzogRW5jYXNpbmdcclxuICAgIGl0ZW1zOiBBcnJheTxCYXNpY1Rpa3pHcm91cEl0ZW0+O1xyXG4gICAgY29uc3RydWN0b3IodHlwZTogVHlwZSxlbmNhc2luZzogRW5jYXNpbmcsaXRlbXM6IEJhc2ljVGlrekdyb3VwSXRlbVtdKXtcclxuICAgICAgICB0aGlzLnR5cGU9dHlwZTtcclxuICAgICAgICB0aGlzLmVuY2FzaW5nPWVuY2FzaW5nO1xyXG4gICAgICAgIHRoaXMuaXRlbXM9aXRlbXM7XHJcbiAgICB9XHJcbiAgICBzdGF0aWMgY3JlYXRlKHRva2VuczogYW55W10pe1xyXG4gICAgICAgIGNvbnN0IGdyb3VwPXRva2Vucy5zcGxpY2UoMSx0b2tlbnMubGVuZ3RoLTIpXHJcbiAgICAgICAgaWYodG9rZW5zLmxlbmd0aCE9PTImJiF0b2tlbnNbMF0uZXF1YWxzKHRva2Vuc1sxXSkpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInd0ZlwiKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEJhc2ljVGlrelRva2VuR3JvdXAoVHlwZS5Gb3JtYXR0aW5nLEVuY2FzaW5nLkJyYWNrZXRzLGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JUaWt6R3JvdXBJdGVtcyhncm91cCkpXHJcbiAgICB9XHJcbn1cclxuXHJcbi8qXHJcbmV4cG9ydCBjbGFzcyBCYXNpY1Rpa3pUb2tlbnN7XHJcbiAgICBwcml2YXRlIHRva2VuczogQXJyYXk8QmFzaWNUaWt6VG9rZW58Rm9ybWF0dGluZ3xBeGlzPiA9IFtdXHJcbiAgICBwcml2YXRlIHRpa3pDb21tYW5kczogVGlrekNvbW1hbmRzPW5ldyBUaWt6Q29tbWFuZHMoKTtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZyl7XHJcbiAgICAgICAgdGhpcy5jbGVhbkJhc2ljVGlrelRva2VuaWZ5KClcclxuICAgICAgICBjb25zb2xlLmxvZyh0aGlzLnRva2VucylcclxuICAgICAgICB0aGlzLnByZXBhcmVGb3JUb2tlbml6ZSgpXHJcbiAgICB9XHJcbiAgICBnZXRUb2tlbnMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcclxuICAgIH1cclxuXHJcblxyXG4gICAgcHJpdmF0ZSBpbmZlckFuZEludGVycHJldENvbW1hbmRzKCkge1xyXG4gICAgICAgIC8vIFN0ZXAgMTogRXh0cmFjdCBjb21tYW5kIGluZGljZXNcclxuICAgICAgICBjb25zdCBjb21tYW5kc01hcCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHQsIGlkeCkgPT4gKHQgaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiAmJiB0LnR5cGUgPT09ICdNYWNybycgPyBpZHggOiBudWxsKSlcclxuICAgICAgICAgICAgLmZpbHRlcigodCkgPT4gdCAhPT0gbnVsbCk7XHJcbiAgICAgICAgY29tbWFuZHNNYXAuZm9yRWFjaCgoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCA9IHRoaXMuZmluZEZpcnN0QnJhY2tldEFmdGVyKGluZGV4LCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xyXG4gICAgICAgICAgICBpZiAoIWZpcnN0QnJhY2tldEFmdGVySW5kZXgpIHJldHVybjtcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBlbmRPZkV4cHJlc3Npb24gPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KFxyXG4gICAgICAgICAgICAgICAgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleC52YWx1ZSxcclxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLFxyXG4gICAgICAgICAgICAgICAgMCxcclxuICAgICAgICAgICAgICAgIDEsXHJcbiAgICAgICAgICAgICAgICAnQ3VybHlfYnJhY2tldHNfb3BlbidcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWYgKCFlbmRPZkV4cHJlc3Npb24pIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwcmVzc2lvbiBlbmQgbm90IGZvdW5kIGZvciBjb21tYW5kIGF0IGluZGV4ICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBjb21tYW5kVG9rZW5zID0gdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LCBNYXRoLmFicyhpbmRleCAtIChlbmRPZkV4cHJlc3Npb24uY2xvc2UgKyAxKSkpO1xyXG4gICAgICAgICAgICB0aGlzLnRpa3pDb21tYW5kcy5hZGRDb21tYW5kQnlJbnRlcnByZXRhdGlvbihjb21tYW5kVG9rZW5zKTtcclxuICAgICAgICB9KTtcclxuICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgMzogTWF0Y2ggY29tbWFuZHMgdG8gdG9rZW5zXHJcbiAgICAgICAgY29uc3QgY29tbWFuZHNJblRva2VucyA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKGl0ZW0sIGluZGV4KSA9PiB0aGlzLm1hdGNoQ29tbWFuZFRvVG9rZW4oaXRlbSwgaW5kZXgpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKCh0KSA9PiB0ICE9PSBudWxsKTtcclxuICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgNDogUHJvY2VzcyBjb25maXJtZWQgY29tbWFuZHNcclxuICAgICAgICBjb25zdCBjb25maXJtZWRDb21tYW5kcyA9IHRoaXMucHJvY2Vzc0NvbmZpcm1lZENvbW1hbmRzKGNvbW1hbmRzSW5Ub2tlbnMpO1xyXG4gICAgXHJcbiAgICAgICAgLy8gU3RlcCA1OiBSZXBsYWNlIHRva2VucyB3aXRoIHByb2Nlc3NlZCBjb21tYW5kc1xyXG4gICAgICAgIHRoaXMucmVwbGFjZVRva2Vuc1dpdGhDb21tYW5kcyhjb25maXJtZWRDb21tYW5kcyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciB0byBmaW5kIHRoZSBmaXJzdCBtYXRjaGluZyBicmFja2V0IGFmdGVyIGEgZ2l2ZW4gaW5kZXhcclxuICAgIHByaXZhdGUgZmluZEZpcnN0QnJhY2tldEFmdGVyKHN0YXJ0SW5kZXg6IG51bWJlciwgYnJhY2tldE5hbWU6IHN0cmluZyk6IEJhc2ljVGlrelRva2VuIHwgbnVsbCB7XHJcbiAgICAgICAgY29uc3QgZmlyc3RCcmFja2V0QWZ0ZXI9dGhpcy50b2tlbnNcclxuICAgICAgICAgICAgLnNsaWNlKHN0YXJ0SW5kZXgpXHJcbiAgICAgICAgICAgIC5maW5kKChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgaXRlbS52YWx1ZSA9PT0gYnJhY2tldE5hbWUpXHJcbiAgICAgICAgcmV0dXJuIGZpcnN0QnJhY2tldEFmdGVyIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4/Zmlyc3RCcmFja2V0QWZ0ZXI6bnVsbDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSGVscGVyIHRvIG1hdGNoIGNvbW1hbmRzIHRvIHRva2Vuc1xyXG4gICAgcHJpdmF0ZSBtYXRjaENvbW1hbmRUb1Rva2VuKGl0ZW06IGFueSwgaW5kZXg6IG51bWJlcik6IGFueSB8IG51bGwge1xyXG4gICAgICAgIGlmICghKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbikgfHwgaXRlbS50eXBlICE9PSAnc3RyaW5nJykgcmV0dXJuIG51bGw7XHJcbiAgICBcclxuICAgICAgICBjb25zdCBtYXRjaCA9IHRoaXMudGlrekNvbW1hbmRzLmNvbW1hbmRzLmZpbmQoKGMpID0+IGMudHJpZ2dlciA9PT0gaXRlbS52YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuIG1hdGNoID8geyBpbmRleCwgLi4ubWF0Y2guZ2V0SW5mbygpIH0gOiBudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gcHJvY2VzcyBjb25maXJtZWQgY29tbWFuZHNcclxuICAgIHByaXZhdGUgcHJvY2Vzc0NvbmZpcm1lZENvbW1hbmRzKGNvbW1hbmRzSW5Ub2tlbnM6IGFueVtdKTogeyBpZHM6IFBhcmVuUGFpcltdOyBpbmRleDogbnVtYmVyIH1bXSB7XHJcbiAgICAgICAgY29uc3QgY29uZmlybWVkQ29tbWFuZHMgPSBbXTtcclxuICAgIFxyXG4gICAgICAgIGZvciAoY29uc3QgeyBpbmRleCwgdHJpZ2dlciwgaG9va3MgfSBvZiBjb21tYW5kc0luVG9rZW5zKSB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaG9va3MgIT09ICdudW1iZXInIHx8IGhvb2tzIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBob29rcyB2YWx1ZSBmb3IgY29tbWFuZCBhdCBpbmRleCAke2luZGV4fWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgY29uc3QgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCA9IHRoaXMuZmluZEZpcnN0QnJhY2tldEFmdGVyKGluZGV4LCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xyXG4gICAgICAgICAgICBpZiAoIWZpcnN0QnJhY2tldEFmdGVySW5kZXgpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ3VybHlfYnJhY2tldHNfb3BlbiBub3QgZm91bmQgYWZ0ZXIgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3Qgb2JqOiB7IGlkczogUGFyZW5QYWlyW10gfSA9IHsgaWRzOiBbXSB9O1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGhvb2tzOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVuUGFpckluZGV4ID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChcclxuICAgICAgICAgICAgICAgICAgICBmaXJzdEJyYWNrZXRBZnRlckluZGV4LnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2VucyxcclxuICAgICAgICAgICAgICAgICAgICAwLFxyXG4gICAgICAgICAgICAgICAgICAgIGksXHJcbiAgICAgICAgICAgICAgICAgICAgJ0N1cmx5X2JyYWNrZXRzX29wZW4nXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoIXBhcmVuUGFpckluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQYXJlbiBwYWlyIG5vdCBmb3VuZCBmb3IgaG9vayAke2l9IGF0IGluZGV4ICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgICAgIGlmIChvYmouaWRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0SWQgPSBvYmouaWRzW29iai5pZHMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxhc3RJZC5jbG9zZSAhPT0gcGFyZW5QYWlySW5kZXgub3BlbiAtIDEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYE1pc21hdGNoIGJldHdlZW4gbGFzdCBjbG9zZSAoJHtsYXN0SWQuY2xvc2V9KSBhbmQgbmV4dCBvcGVuICgke3BhcmVuUGFpckluZGV4Lm9wZW59KWBcclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBvYmouaWRzLnB1c2gocGFyZW5QYWlySW5kZXgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbmZpcm1lZENvbW1hbmRzLnB1c2goeyAuLi5vYmosIGluZGV4IH0pO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIHJldHVybiBjb25maXJtZWRDb21tYW5kcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSGVscGVyIHRvIHJlcGxhY2UgdG9rZW5zIHdpdGggcHJvY2Vzc2VkIGNvbW1hbmRzXHJcbiAgICBwcml2YXRlIHJlcGxhY2VUb2tlbnNXaXRoQ29tbWFuZHMoY29uZmlybWVkQ29tbWFuZHM6IGFueVtdKSB7XHJcbiAgICAgICAgY29uZmlybWVkQ29tbWFuZHMuZm9yRWFjaCgoY29tbWFuZCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWNvbW1hbmQuaWRzIHx8IGNvbW1hbmQuaWRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6IENvbW1hbmQgSURzIGFyZSBlbXB0eSBvciB1bmRlZmluZWQuJyk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBvcGVuID0gY29tbWFuZC5pbmRleDtcclxuICAgICAgICAgICAgY29uc3QgY2xvc2UgPSBjb21tYW5kLmlkc1tjb21tYW5kLmlkcy5sZW5ndGggLSAxXS5jbG9zZTtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoY2xvc2UgPCBvcGVuKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogQ2xvc2UgaW5kZXggKCR7Y2xvc2V9KSBpcyBzbWFsbGVyIHRoYW4gb3BlbiBpbmRleCAoJHtvcGVufSkuYCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBkZWxldGVDb3VudCA9IGNsb3NlIC0gb3BlbiArIDE7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWRUb2tlbnMgPSB0aGlzLnRva2Vucy5zbGljZShvcGVuLCBkZWxldGVDb3VudCk7XHJcbiAgICBcclxuICAgICAgICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSB0aGlzLnRpa3pDb21tYW5kcy5yZXBsYWNlQ2FsbFdpdGhDb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgY29tbWFuZC50cmlnZ2VyLFxyXG4gICAgICAgICAgICAgICAgY29tbWFuZC5ob29rcyxcclxuICAgICAgICAgICAgICAgIHRoaXMudGlrekNvbW1hbmRzLmdldEhvb2tzKHJlbW92ZWRUb2tlbnMsIGNvbW1hbmQuaWRzKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGlmICghcmVwbGFjZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgICAgICAgICBgUmVwbGFjZW1lbnQgZ2VuZXJhdGlvbiBmYWlsZWQgZm9yIGNvbW1hbmQgYXQgaW5kZXggJHtjb21tYW5kLmluZGV4fSB3aXRoIHRyaWdnZXIgJHtjb21tYW5kLnRyaWdnZXJ9LmBcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uob3BlbiwgZGVsZXRlQ291bnQsIC4uLnJlcGxhY2VtZW50KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSBjbGVhbkJhc2ljVGlrelRva2VuaWZ5KCl7XHJcblxyXG4gICAgICAgIHRoaXMuaW5mZXJBbmRJbnRlcnByZXRDb21tYW5kcygpXHJcblxyXG5cclxuICAgICAgICBjb25zdCB1bml0SW5kaWNlczogbnVtYmVyW10gPSB0aGlzLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbiBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuJiZ0b2tlbi50eXBlID09PSAnVW5pdCcgPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKChpZHgpOiBpZHggaXMgbnVtYmVyID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgICAgIHVuaXRJbmRpY2VzLmZvckVhY2goKHVuaXRJZHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbdW5pdElkeCAtIDFdO1xyXG4gICAgICAgICAgICBpZiAoIShwcmV2VG9rZW4gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbil8fCEodGhpcy50b2tlbnNbdW5pdElkeF0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbikpcmV0dXJuXHJcbiAgICAgICAgICAgIGlmICghcHJldlRva2VuIHx8IHByZXZUb2tlbi50eXBlICE9PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbml0cyBjYW4gb25seSBiZSB1c2VkIGluIHJlZmVyZW5jZSB0byBudW1iZXJzIGF0IGluZGV4ICR7dW5pdElkeH1gKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcHJldlRva2VuLnZhbHVlID0gdG9Qb2ludChwcmV2VG9rZW4udmFsdWUgYXMgbnVtYmVyLCB0aGlzLnRva2Vuc1t1bml0SWR4XS52YWx1ZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAoIXVuaXRJbmRpY2VzLmluY2x1ZGVzKGlkeCkpKTtcclxuXHJcbiAgICAgICAgLy90aGlzLnRva2Vucz10aGlzLnRva2Vucy5maWx0ZXIoKHQpID0+IHQubmFtZSE9PSdDb21tYScpO1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgY29uc3QgaW5kZXhlc1RvUmVtb3ZlOiBudW1iZXJbXT1bXVxyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuLGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKHRva2VuLnR5cGU9PT0nRm9ybWF0dGluZycpe1xyXG4gICAgICAgICAgICAgICAgaWYodGhpcy50b2tlbnNbaW5kZXgrMV0ubmFtZT09PSdFcXVhbHMnKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4XS52YWx1ZT10aGlzLnRva2Vuc1tpbmRleCsyXVxyXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ZXNUb1JlbW92ZS5wdXNoKGluZGV4KzEsaW5kZXgrMik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnRva2Vucz10aGlzLnRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCFpbmRleGVzVG9SZW1vdmUuaW5jbHVkZXMoaWR4KSkpO1xyXG5cclxuXHJcblxyXG4gICAgICAgIGNvbnN0IG1hcFN5bnRheCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJnRva2VuLnR5cGUgPT09ICdTeW50YXgnICYmIC8oRGFzaHxQbHVzKS8udGVzdCh0b2tlbi5uYW1lKSA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICAgICAgY29uc3Qgc3ludGF4U2VxdWVuY2VzID0gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG1hcFN5bnRheCk7XHJcblxyXG5cclxuICAgICAgICBjb25zdCBzeW50YXhPYmplY3RzID0gc3ludGF4U2VxdWVuY2VzXHJcbiAgICAgICAgLm1hcCgoc2VxdWVuY2UpID0+IHtcclxuICAgICAgICAgICAgaWYgKHNlcXVlbmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IHNlcXVlbmNlWzBdO1xyXG4gICAgICAgICAgICBjb25zdCBlbmQgPSBzZXF1ZW5jZVtzZXF1ZW5jZS5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gc2VxdWVuY2VcclxuICAgICAgICAgICAgICAgIC5tYXAoKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKSlyZXR1cm4gJydcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRva2VuIHx8ICF0b2tlbi5uYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgTWlzc2luZyBvciBpbnZhbGlkIHRva2VuIGF0IGluZGV4ICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAnJzsgLy8gUHJvdmlkZSBhIGZhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbi5uYW1lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9EYXNoLywgJy0nKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvUGx1cy8sICcrJyk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmpvaW4oJycpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhcnQsIGVuZCwgdmFsdWUgfTtcclxuICAgICAgICB9KVxyXG5cclxuICAgICAgICAuZmlsdGVyKChvYmopID0+IG9iaiAhPT0gbnVsbClcclxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5zdGFydCAtIGEuc3RhcnQpO1xyXG5cclxuICAgICAgICBzeW50YXhPYmplY3RzLmZvckVhY2goKHsgc3RhcnQsIGVuZCwgdmFsdWUgfSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb21tYW5kID0gc2VhcmNoVGlrekNvbXBvbmVudHModmFsdWUpOyBcclxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBuZXcgQmFzaWNUaWt6VG9rZW4oY29tbWFuZClcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBlbmQgKyAxIC0gc3RhcnQsIHRva2VuKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHByZXBhcmVGb3JUb2tlbml6ZSgpe1xyXG4gICAgICAgIGZ1bmN0aW9uIGEodG9rZW5zOiBhbnkpe1xyXG4gICAgICAgICAgICBjb25zdCBzY29wZT1maW5kRGVlcGVzdFBhcmVudGhlc2VzU2NvcGUodG9rZW5zKVxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhzY29wZSlcclxuICAgICAgICAgICAgY29uc3Qgc2xpY2U9dG9rZW5zLnNsaWNlKHNjb3BlLmJlZ2luLHNjb3BlLmVuZClcclxuICAgICAgICAgICAgdG9rZW5zLnNwbGljZShzY29wZS5iZWdpbiwoc2NvcGUuZW5kLXNjb3BlLmJlZ2luKSsxLFtzbGljZV0pXHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbnNcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgYj10aGlzLnRva2Vuc1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGEoYikpXHJcblxyXG5cclxuICAgICAgICBjb25zdCBzcXVhcmVCcmFja2V0SW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdTcXVhcmVfYnJhY2tldHNfb3BlbicsdGhpcy50b2tlbnMpXHJcblxyXG4gICAgICAgIHNxdWFyZUJyYWNrZXRJbmRleGVzXHJcbiAgICAgICAgLnNvcnQoKGE6IHsgb3BlbjogbnVtYmVyOyB9LCBiOiB7IG9wZW46IG51bWJlcjsgfSkgPT4gYi5vcGVuIC0gYS5vcGVuKSAvLyBTb3J0IGluIGRlc2NlbmRpbmcgb3JkZXIgb2YgJ29wZW4nXHJcbiAgICAgICAgLmZvckVhY2goKGluZGV4OiB7IG9wZW46IG51bWJlcjsgY2xvc2U6IG51bWJlcjsgfSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nID0gbmV3IEZvcm1hdHRpbmcoXHJcbiAgICAgICAgICAgICAgICBjbGVhbkZvcm1hdHRpbmcodGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGZvcm1hdHRpbmcpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvL2xldCBwcmFuZUluZGV4ZXMgPSBtYXBCcmFja2V0cygnUGFyZW50aGVzZXNfb3BlbicsIHRoaXMudG9rZW5zKTtcclxuICAgICAgICBsZXQgY29vcmRpbmF0ZUluZGV4ZXMgPSBtYXBCcmFja2V0cygnUGFyZW50aGVzZXNfb3BlbicsIHRoaXMudG9rZW5zKVxyXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IHsgY2xvc2U6IG51bWJlcjsgfSxpZHg6IGFueSk9PnRoaXMudG9rZW5zW2l0ZW0uY2xvc2UrMV0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiYmKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UrMV1hcyBCYXNpY1Rpa3pUb2tlbikudmFsdWUhPT0nYXQnKVxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgY29uc3QgeyBjb29yZGluYXRlSW5kZXhlcywgdmFyaWFibGVJbmRleGVzIH0gPSBwcmFuZUluZGV4ZXMucmVkdWNlKChyZXN1bHQsIGl0ZW0pID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UgKyAxXT8udmFsdWUgIT09ICdhdCcpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5jb29yZGluYXRlSW5kZXhlcy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICB9IFxyXG4gICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbaXRlbS5jbG9zZSArIDFdPy52YWx1ZSA9PT0gJ2F0Jykge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnZhcmlhYmxlSW5kZXhlcy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfSwgeyBjb29yZGluYXRlSW5kZXhlczogW10sIHZhcmlhYmxlSW5kZXhlczogW10gfSk7XHJcbiAgICAgICAgY29vcmRpbmF0ZUluZGV4ZXNcclxuICAgICAgICAuc29ydCgoYTogeyBvcGVuOiBudW1iZXI7IH0sIGI6IHsgb3BlbjogbnVtYmVyOyB9KSA9PiBiLm9wZW4gLSBhLm9wZW4pIFxyXG4gICAgICAgIC5mb3JFYWNoKChpbmRleDogeyBvcGVuOiBudW1iZXI7IGNsb3NlOiBudW1iZXIgOyB9KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF4aXMgPSBuZXcgQXhpcygpLnBhcnNlSW5wdXQoXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGlmICghYXhpcylyZXR1cm5cclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGF4aXMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBsZXQgdmFyaWFibGVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2VucylcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IGNsb3NlOiBudW1iZXI7IH0saWR4OiBhbnkpPT50aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJih0aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdYXMgQmFzaWNUaWt6VG9rZW4pLnZhbHVlIT09J2F0JylcclxuXHJcbiAgICAgICAgdmFyaWFibGVJbmRleGVzXHJcbiAgICAgICAgLnNvcnQoKGE6IHsgb3BlbjogbnVtYmVyOyB9LCBiOiB7IG9wZW46IG51bWJlcjsgfSkgPT4gYi5vcGVuIC0gYS5vcGVuKSBcclxuICAgICAgICAuZm9yRWFjaCgoaW5kZXg6IHsgb3BlbjogbnVtYmVyIDsgY2xvc2U6IG51bWJlciA7IH0pID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coaW5kZXgsdGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UpKVxyXG4gICAgICAgICAgICBjb25zdCB2YXJpYWJsZSA9IHRvVmFyaWFibGVUb2tlbih0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2codmFyaWFibGUpXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCB2YXJpYWJsZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn0qLyJdfQ==