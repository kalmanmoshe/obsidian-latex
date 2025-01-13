import { getAllTikzReferences } from "src/staticData/dataManager";
import { arrToRegexString } from "../tikzjax";
import { findDeepestParenthesesScope, idParentheses } from "src/utils/ParenUtensils";
import { BasicTikzToken } from "src/basicToken";
import { Encasing } from "src/staticData/latexStaticData";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmFzaWNNYXRoSmF4VG9rZW5Hcm91cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy90aWt6amF4L2ludGVycHJldC9CYXNpY01hdGhKYXhUb2tlbkdyb3VwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxvQkFBb0IsRUFBd0IsTUFBTSw0QkFBNEIsQ0FBQztBQUN4RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDOUMsT0FBTyxFQUFFLDJCQUEyQixFQUFFLGFBQWEsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBQzVGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNoRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFMUQsTUFBTSxXQUFXLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtJQUNsQyxNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEMsT0FBTyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDO0FBQ2hELENBQUMsQ0FBQztBQUVGLE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxVQUFrQjtJQUNoRCxVQUFVLEdBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3RDLE1BQU0sZUFBZSxHQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUMsVUFBVSxFQUFDLGVBQWUsQ0FBQyxDQUFBO0lBQ3pELE1BQU0sVUFBVSxHQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFBO0lBQ25ELE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFDLFVBQVUsQ0FBQyxDQUFBO0FBQ3hDLENBQUM7QUFJRCxTQUFTLGNBQWMsQ0FBQyxNQUFjO0lBQ2xDLE1BQU0s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Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTRSRyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaWt6Q29tcG9uZW50cyB9IGZyb20gXCJzcmMvc3RhdGljRGF0YS9kYXRhTWFuYWdlclwiO1xuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZyB9IGZyb20gXCIuLi90aWt6amF4XCI7XG5pbXBvcnQgeyBmaW5kRGVlcGVzdFBhcmVudGhlc2VzU2NvcGUsIGlkUGFyZW50aGVzZXMsIFBhcmVuIH0gZnJvbSBcInNyYy91dGlscy9QYXJlblV0ZW5zaWxzXCI7XG5pbXBvcnQgeyBCYXNpY1Rpa3pUb2tlbiB9IGZyb20gXCJzcmMvYmFzaWNUb2tlblwiO1xuaW1wb3J0IHsgRW5jYXNpbmcgfSBmcm9tIFwic3JjL3N0YXRpY0RhdGEvbGF0ZXhTdGF0aWNEYXRhXCI7XG5cbmNvbnN0IHBhcnNlTnVtYmVyID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xuICAgIHJldHVybiBpc05hTihudW1iZXJWYWx1ZSkgPyAwIDogbnVtYmVyVmFsdWU7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcHJvY2Vzc1Rpa3pTdHJpbmcodGlrelN0cmluZzogc3RyaW5nKXtcbiAgICB0aWt6U3RyaW5nPXRpZHlUaWt6U3RyaW5nKHRpa3pTdHJpbmcpO1xuICAgIGNvbnN0IGJhc2ljVGlrelRva2Vucz1iYXNpY1Rpa3pUb2tlbmlmeSh0aWt6U3RyaW5nKTtcbiAgICBjb25zb2xlLmxvZygnYmFzaWNUaWt6VG9rZW5zJyx0aWt6U3RyaW5nLGJhc2ljVGlrelRva2VucylcbiAgICBjb25zdCB0aWt6R3JvdXBzPWRlZmluZUxhdGV4R3JvdXBzKGJhc2ljVGlrelRva2VucylcbiAgICBjb25zb2xlLmxvZygndGlrekdyb3VwcycsdGlrekdyb3Vwcylcbn1cblxuXG5cbmZ1bmN0aW9uIHRpZHlUaWt6U3RyaW5nKHNvdXJjZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcbiAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcbiAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcbiAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xuICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XG59XG5cbmZ1bmN0aW9uIGJhc2ljVGlrelRva2VuaWZ5KHNvdXJjZTogc3RyaW5nKTooQmFzaWNUaWt6VG9rZW58UGFyZW4pW10ge1xuICAgIGNvbnN0IGJhc2ljQXJyYXkgPSBbXTtcbiAgICBjb25zdCBvcGVyYXRvcnNSZWdleCA9IG5ldyBSZWdFeHAoJ14nICsgYXJyVG9SZWdleFN0cmluZyhnZXRBbGxUaWt6UmVmZXJlbmNlcygpKSk7XG4gICAgbGV0IGkgPSAwO1xuICAgICBcbiAgICB3aGlsZSAoaSA8IHNvdXJjZS5sZW5ndGgpIHtcbiAgICAgICAgY29uc3Qgc3ViU291cmNlID0gc291cmNlLnNsaWNlKGkpO1xuICAgICAgICBsZXQgbWF0Y2g7XG4gICAgXG4gICAgICAgIC8vIE1hdGNoIFRpa1ogb3BlcmF0b3JzXG4gICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKG9wZXJhdG9yc1JlZ2V4KTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goQmFzaWNUaWt6VG9rZW4uY3JlYXRlKG1hdGNoWzBdKSk7XG4gICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eW2EtekEtWlxcXFxdKy8pO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaChCYXNpY1Rpa3pUb2tlbi5jcmVhdGUobWF0Y2hbMF0pKTtcbiAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgLy8gTWF0Y2ggbnVtYmVyc1xuICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlstMC05Ll0rLyk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKEJhc2ljVGlrelRva2VuLmNyZWF0ZShwYXJzZU51bWJlcihtYXRjaFswXSkpKTtcbiAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbSB0byBiZSByZWNvZ25pemVkXCIrc3ViU291cmNlKVxuICAgIH1cbiAgICByZXR1cm4gaWRQYXJlbnRoZXNlcyhiYXNpY0FycmF5KVxufVxuXG5mdW5jdGlvbiBkZWZpbmVMYXRleEdyb3Vwcyh0b2tlbnM6IChCYXNpY1Rpa3pUb2tlbiB8IFBhcmVuIHwgQmFzaWNUaWt6VG9rZW5Hcm91cClbXSk6IChCYXNpY1Rpa3pUb2tlbiB8IFBhcmVuIHwgQmFzaWNUaWt6VG9rZW5Hcm91cClbXSB7XG4gICAgbGV0IGk9MDtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICBpKys7XG4gICAgICAgIGlmKGk+MTApXG4gICAgICAgICAgICByZXR1cm4gdG9rZW5zXG4gICAgICAgIGNvbnN0IHNjb3BlID0gZmluZERlZXBlc3RQYXJlbnRoZXNlc1Njb3BlKHRva2Vucyk7XG4gICAgICAgIGlmIChzY29wZS5iZWdpbiA9PT0gMCAmJiBzY29wZS5lbmQgPT09IHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiB0b2tlbnM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjb3BlLmJlZ2luIDwgMCB8fCBzY29wZS5lbmQgPD0gc2NvcGUuYmVnaW4gfHwgc2NvcGUuZW5kID4gdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBwYXJlbnRoZXNlcyBzY29wZSBmb3VuZFwiKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBncm91cCA9IEJhc2ljVGlrelRva2VuR3JvdXAuY3JlYXRlKHRva2Vucy5zbGljZShzY29wZS5iZWdpbiwgc2NvcGUuZW5kKzEvKkkgd2FudCB0aGUgZW5kaW5nIGluY2FzaW5nICovKSk7XG4gICAgICAgIHRva2Vucy5zcGxpY2Uoc2NvcGUuYmVnaW4sIChzY29wZS5lbmQgLSBzY29wZS5iZWdpbikrMSwgZ3JvdXApO1xuICAgIH1cbn1cblxuXG5cblxuZW51bSBUeXBle1xuICAgIEZvcm1hdHRpbmdcbn1cbnR5cGUgQmFzaWNUaWt6R3JvdXBJdGVtPShCYXNpY1Rpa3pUb2tlbnxCYXNpY1Rpa3pUb2tlbkdyb3VwKTtcblxuZnVuY3Rpb24gZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvclRpa3pHcm91cEl0ZW1zKGl0ZW1zOiBCYXNpY1Rpa3pHcm91cEl0ZW0gfCBCYXNpY1Rpa3pHcm91cEl0ZW1bXSk6IEJhc2ljVGlrekdyb3VwSXRlbVtdIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XG4gICAgICAgIGl0ZW1zID0gW2l0ZW1zXTtcbiAgICB9XG4gICAgY29uc3QgZm9ybWF0dGVkSXRlbXM6IEJhc2ljVGlrekdyb3VwSXRlbVtdID0gaXRlbXMucmVkdWNlKChhY2M6IEJhc2ljVGlrekdyb3VwSXRlbVtdLCBpdGVtOiBCYXNpY1Rpa3pHcm91cEl0ZW0pID0+IHtcbiAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW5Hcm91cCkge1xuICAgICAgICAgICAgYWNjLnB1c2goaXRlbSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGl0ZW0gdG8gYmUgQmFzaWNUaWt6VG9rZW4gb3IgQmFzaWNUaWt6VG9rZW5Hcm91cCwgYnV0IHJlY2VpdmVkOiAke2l0ZW19YCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICByZXR1cm4gZm9ybWF0dGVkSXRlbXM7XG59XG5cbmNsYXNzIEJhc2ljVGlrelRva2VuR3JvdXB7XG4gICAgdHlwZTogVHlwZTtcbiAgICBlbmNhc2luZzogRW5jYXNpbmdcbiAgICBpdGVtczogQXJyYXk8QmFzaWNUaWt6R3JvdXBJdGVtPjtcbiAgICBjb25zdHJ1Y3Rvcih0eXBlOiBUeXBlLGVuY2FzaW5nOiBFbmNhc2luZyxpdGVtczogQmFzaWNUaWt6R3JvdXBJdGVtW10pe1xuICAgICAgICB0aGlzLnR5cGU9dHlwZTtcbiAgICAgICAgdGhpcy5lbmNhc2luZz1lbmNhc2luZztcbiAgICAgICAgdGhpcy5pdGVtcz1pdGVtcztcbiAgICB9XG4gICAgc3RhdGljIGNyZWF0ZSh0b2tlbnM6IGFueVtdKXtcbiAgICAgICAgY29uc3QgZ3JvdXA9dG9rZW5zLnNwbGljZSgxLHRva2Vucy5sZW5ndGgtMilcbiAgICAgICAgaWYodG9rZW5zLmxlbmd0aCE9PTImJiF0b2tlbnNbMF0uZXF1YWxzKHRva2Vuc1sxXSkpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ3dGZcIik7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gbmV3IEJhc2ljVGlrelRva2VuR3JvdXAoVHlwZS5Gb3JtYXR0aW5nLEVuY2FzaW5nLkJyYWNrZXRzLGVuc3VyZUFjY2VwdGFibGVGb3JtYXRGb3JUaWt6R3JvdXBJdGVtcyhncm91cCkpXG4gICAgfVxufVxuXG4vKlxuZXhwb3J0IGNsYXNzIEJhc2ljVGlrelRva2Vuc3tcbiAgICBwcml2YXRlIHRva2VuczogQXJyYXk8QmFzaWNUaWt6VG9rZW58Rm9ybWF0dGluZ3xBeGlzPiA9IFtdXG4gICAgcHJpdmF0ZSB0aWt6Q29tbWFuZHM6IFRpa3pDb21tYW5kcz1uZXcgVGlrekNvbW1hbmRzKCk7XG5cbiAgICBjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZyl7XG4gICAgICAgIHRoaXMuY2xlYW5CYXNpY1Rpa3pUb2tlbmlmeSgpXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMudG9rZW5zKVxuICAgICAgICB0aGlzLnByZXBhcmVGb3JUb2tlbml6ZSgpXG4gICAgfVxuICAgIGdldFRva2Vucygpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcbiAgICB9XG5cblxuICAgIHByaXZhdGUgaW5mZXJBbmRJbnRlcnByZXRDb21tYW5kcygpIHtcbiAgICAgICAgLy8gU3RlcCAxOiBFeHRyYWN0IGNvbW1hbmQgaW5kaWNlc1xuICAgICAgICBjb25zdCBjb21tYW5kc01hcCA9IHRoaXMudG9rZW5zXG4gICAgICAgICAgICAubWFwKCh0LCBpZHgpID0+ICh0IGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgdC50eXBlID09PSAnTWFjcm8nID8gaWR4IDogbnVsbCkpXG4gICAgICAgICAgICAuZmlsdGVyKCh0KSA9PiB0ICE9PSBudWxsKTtcbiAgICAgICAgY29tbWFuZHNNYXAuZm9yRWFjaCgoaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0QnJhY2tldEFmdGVySW5kZXggPSB0aGlzLmZpbmRGaXJzdEJyYWNrZXRBZnRlcihpbmRleCwgJ0N1cmx5X2JyYWNrZXRzX29wZW4nKTtcbiAgICAgICAgICAgIGlmICghZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCkgcmV0dXJuO1xuICAgIFxuICAgICAgICAgICAgY29uc3QgZW5kT2ZFeHByZXNzaW9uID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChcbiAgICAgICAgICAgICAgICBmaXJzdEJyYWNrZXRBZnRlckluZGV4LnZhbHVlLFxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB0aGlzLnRva2VucyxcbiAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgIDEsXG4gICAgICAgICAgICAgICAgJ0N1cmx5X2JyYWNrZXRzX29wZW4nXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFlbmRPZkV4cHJlc3Npb24pIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cHJlc3Npb24gZW5kIG5vdCBmb3VuZCBmb3IgY29tbWFuZCBhdCBpbmRleCAke2luZGV4fWApO1xuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgY29uc3QgY29tbWFuZFRva2VucyA9IHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwgTWF0aC5hYnMoaW5kZXggLSAoZW5kT2ZFeHByZXNzaW9uLmNsb3NlICsgMSkpKTtcbiAgICAgICAgICAgIHRoaXMudGlrekNvbW1hbmRzLmFkZENvbW1hbmRCeUludGVycHJldGF0aW9uKGNvbW1hbmRUb2tlbnMpO1xuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgLy8gU3RlcCAzOiBNYXRjaCBjb21tYW5kcyB0byB0b2tlbnNcbiAgICAgICAgY29uc3QgY29tbWFuZHNJblRva2VucyA9IHRoaXMudG9rZW5zXG4gICAgICAgICAgICAubWFwKChpdGVtLCBpbmRleCkgPT4gdGhpcy5tYXRjaENvbW1hbmRUb1Rva2VuKGl0ZW0sIGluZGV4KSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpID0+IHQgIT09IG51bGwpO1xuICAgIFxuICAgICAgICAvLyBTdGVwIDQ6IFByb2Nlc3MgY29uZmlybWVkIGNvbW1hbmRzXG4gICAgICAgIGNvbnN0IGNvbmZpcm1lZENvbW1hbmRzID0gdGhpcy5wcm9jZXNzQ29uZmlybWVkQ29tbWFuZHMoY29tbWFuZHNJblRva2Vucyk7XG4gICAgXG4gICAgICAgIC8vIFN0ZXAgNTogUmVwbGFjZSB0b2tlbnMgd2l0aCBwcm9jZXNzZWQgY29tbWFuZHNcbiAgICAgICAgdGhpcy5yZXBsYWNlVG9rZW5zV2l0aENvbW1hbmRzKGNvbmZpcm1lZENvbW1hbmRzKTtcbiAgICB9XG4gICAgXG4gICAgLy8gSGVscGVyIHRvIGZpbmQgdGhlIGZpcnN0IG1hdGNoaW5nIGJyYWNrZXQgYWZ0ZXIgYSBnaXZlbiBpbmRleFxuICAgIHByaXZhdGUgZmluZEZpcnN0QnJhY2tldEFmdGVyKHN0YXJ0SW5kZXg6IG51bWJlciwgYnJhY2tldE5hbWU6IHN0cmluZyk6IEJhc2ljVGlrelRva2VuIHwgbnVsbCB7XG4gICAgICAgIGNvbnN0IGZpcnN0QnJhY2tldEFmdGVyPXRoaXMudG9rZW5zXG4gICAgICAgICAgICAuc2xpY2Uoc3RhcnRJbmRleClcbiAgICAgICAgICAgIC5maW5kKChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgaXRlbS52YWx1ZSA9PT0gYnJhY2tldE5hbWUpXG4gICAgICAgIHJldHVybiBmaXJzdEJyYWNrZXRBZnRlciBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuP2ZpcnN0QnJhY2tldEFmdGVyOm51bGw7XG4gICAgfVxuICAgIFxuICAgIC8vIEhlbHBlciB0byBtYXRjaCBjb21tYW5kcyB0byB0b2tlbnNcbiAgICBwcml2YXRlIG1hdGNoQ29tbWFuZFRvVG9rZW4oaXRlbTogYW55LCBpbmRleDogbnVtYmVyKTogYW55IHwgbnVsbCB7XG4gICAgICAgIGlmICghKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbikgfHwgaXRlbS50eXBlICE9PSAnc3RyaW5nJykgcmV0dXJuIG51bGw7XG4gICAgXG4gICAgICAgIGNvbnN0IG1hdGNoID0gdGhpcy50aWt6Q29tbWFuZHMuY29tbWFuZHMuZmluZCgoYykgPT4gYy50cmlnZ2VyID09PSBpdGVtLnZhbHVlKTtcbiAgICAgICAgcmV0dXJuIG1hdGNoID8geyBpbmRleCwgLi4ubWF0Y2guZ2V0SW5mbygpIH0gOiBudWxsO1xuICAgIH1cbiAgICBcbiAgICAvLyBIZWxwZXIgdG8gcHJvY2VzcyBjb25maXJtZWQgY29tbWFuZHNcbiAgICBwcml2YXRlIHByb2Nlc3NDb25maXJtZWRDb21tYW5kcyhjb21tYW5kc0luVG9rZW5zOiBhbnlbXSk6IHsgaWRzOiBQYXJlblBhaXJbXTsgaW5kZXg6IG51bWJlciB9W10ge1xuICAgICAgICBjb25zdCBjb25maXJtZWRDb21tYW5kcyA9IFtdO1xuICAgIFxuICAgICAgICBmb3IgKGNvbnN0IHsgaW5kZXgsIHRyaWdnZXIsIGhvb2tzIH0gb2YgY29tbWFuZHNJblRva2Vucykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBob29rcyAhPT0gJ251bWJlcicgfHwgaG9va3MgPD0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBob29rcyB2YWx1ZSBmb3IgY29tbWFuZCBhdCBpbmRleCAke2luZGV4fWApO1xuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgY29uc3QgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCA9IHRoaXMuZmluZEZpcnN0QnJhY2tldEFmdGVyKGluZGV4LCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xuICAgICAgICAgICAgaWYgKCFmaXJzdEJyYWNrZXRBZnRlckluZGV4KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDdXJseV9icmFja2V0c19vcGVuIG5vdCBmb3VuZCBhZnRlciBpbmRleCAke2luZGV4fWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBvYmo6IHsgaWRzOiBQYXJlblBhaXJbXSB9ID0geyBpZHM6IFtdIH07XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGhvb2tzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlblBhaXJJbmRleCA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoXG4gICAgICAgICAgICAgICAgICAgIGZpcnN0QnJhY2tldEFmdGVySW5kZXgudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbnMsXG4gICAgICAgICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgICAgICAgIGksXG4gICAgICAgICAgICAgICAgICAgICdDdXJseV9icmFja2V0c19vcGVuJ1xuICAgICAgICAgICAgICAgICk7XG4gICAgXG4gICAgICAgICAgICAgICAgaWYgKCFwYXJlblBhaXJJbmRleCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBhcmVuIHBhaXIgbm90IGZvdW5kIGZvciBob29rICR7aX0gYXQgaW5kZXggJHtpbmRleH1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICAgICAgaWYgKG9iai5pZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0SWQgPSBvYmouaWRzW29iai5pZHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChsYXN0SWQuY2xvc2UgIT09IHBhcmVuUGFpckluZGV4Lm9wZW4gLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYE1pc21hdGNoIGJldHdlZW4gbGFzdCBjbG9zZSAoJHtsYXN0SWQuY2xvc2V9KSBhbmQgbmV4dCBvcGVuICgke3BhcmVuUGFpckluZGV4Lm9wZW59KWBcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb2JqLmlkcy5wdXNoKHBhcmVuUGFpckluZGV4KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbmZpcm1lZENvbW1hbmRzLnB1c2goeyAuLi5vYmosIGluZGV4IH0pO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIHJldHVybiBjb25maXJtZWRDb21tYW5kcztcbiAgICB9XG4gICAgXG4gICAgLy8gSGVscGVyIHRvIHJlcGxhY2UgdG9rZW5zIHdpdGggcHJvY2Vzc2VkIGNvbW1hbmRzXG4gICAgcHJpdmF0ZSByZXBsYWNlVG9rZW5zV2l0aENvbW1hbmRzKGNvbmZpcm1lZENvbW1hbmRzOiBhbnlbXSkge1xuICAgICAgICBjb25maXJtZWRDb21tYW5kcy5mb3JFYWNoKChjb21tYW5kKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWNvbW1hbmQuaWRzIHx8IGNvbW1hbmQuaWRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiBDb21tYW5kIElEcyBhcmUgZW1wdHkgb3IgdW5kZWZpbmVkLicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgIGNvbnN0IG9wZW4gPSBjb21tYW5kLmluZGV4O1xuICAgICAgICAgICAgY29uc3QgY2xvc2UgPSBjb21tYW5kLmlkc1tjb21tYW5kLmlkcy5sZW5ndGggLSAxXS5jbG9zZTtcbiAgICBcbiAgICAgICAgICAgIGlmIChjbG9zZSA8IG9wZW4pIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogQ2xvc2UgaW5kZXggKCR7Y2xvc2V9KSBpcyBzbWFsbGVyIHRoYW4gb3BlbiBpbmRleCAoJHtvcGVufSkuYCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgY29uc3QgZGVsZXRlQ291bnQgPSBjbG9zZSAtIG9wZW4gKyAxO1xuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZFRva2VucyA9IHRoaXMudG9rZW5zLnNsaWNlKG9wZW4sIGRlbGV0ZUNvdW50KTtcbiAgICBcbiAgICAgICAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gdGhpcy50aWt6Q29tbWFuZHMucmVwbGFjZUNhbGxXaXRoQ29tbWFuZChcbiAgICAgICAgICAgICAgICBjb21tYW5kLnRyaWdnZXIsXG4gICAgICAgICAgICAgICAgY29tbWFuZC5ob29rcyxcbiAgICAgICAgICAgICAgICB0aGlzLnRpa3pDb21tYW5kcy5nZXRIb29rcyhyZW1vdmVkVG9rZW5zLCBjb21tYW5kLmlkcylcbiAgICAgICAgICAgICk7XG4gICAgXG4gICAgICAgICAgICBpZiAoIXJlcGxhY2VtZW50KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgICBgUmVwbGFjZW1lbnQgZ2VuZXJhdGlvbiBmYWlsZWQgZm9yIGNvbW1hbmQgYXQgaW5kZXggJHtjb21tYW5kLmluZGV4fSB3aXRoIHRyaWdnZXIgJHtjb21tYW5kLnRyaWdnZXJ9LmBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKG9wZW4sIGRlbGV0ZUNvdW50LCAuLi5yZXBsYWNlbWVudCk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIGNsZWFuQmFzaWNUaWt6VG9rZW5pZnkoKXtcblxuICAgICAgICB0aGlzLmluZmVyQW5kSW50ZXJwcmV0Q29tbWFuZHMoKVxuXG5cbiAgICAgICAgY29uc3QgdW5pdEluZGljZXM6IG51bWJlcltdID0gdGhpcy50b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJnRva2VuLnR5cGUgPT09ICdVbml0JyA/IGlkeCA6IG51bGwpKVxuICAgICAgICAuZmlsdGVyKChpZHgpOiBpZHggaXMgbnVtYmVyID0+IGlkeCAhPT0gbnVsbCk7XG5cbiAgICAgICAgdW5pdEluZGljZXMuZm9yRWFjaCgodW5pdElkeCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gdGhpcy50b2tlbnNbdW5pdElkeCAtIDFdO1xuICAgICAgICAgICAgaWYgKCEocHJldlRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4pfHwhKHRoaXMudG9rZW5zW3VuaXRJZHhdIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4pKXJldHVyblxuICAgICAgICAgICAgaWYgKCFwcmV2VG9rZW4gfHwgcHJldlRva2VuLnR5cGUgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbml0cyBjYW4gb25seSBiZSB1c2VkIGluIHJlZmVyZW5jZSB0byBudW1iZXJzIGF0IGluZGV4ICR7dW5pdElkeH1gKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHJldlRva2VuLnZhbHVlID0gdG9Qb2ludChwcmV2VG9rZW4udmFsdWUgYXMgbnVtYmVyLCB0aGlzLnRva2Vuc1t1bml0SWR4XS52YWx1ZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAoIXVuaXRJbmRpY2VzLmluY2x1ZGVzKGlkeCkpKTtcblxuICAgICAgICAvL3RoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigodCkgPT4gdC5uYW1lIT09J0NvbW1hJyk7XG4gICAgICAgIC8qXG4gICAgICAgIGNvbnN0IGluZGV4ZXNUb1JlbW92ZTogbnVtYmVyW109W11cbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW4saW5kZXgpID0+IHtcbiAgICAgICAgICAgIGlmKHRva2VuLnR5cGU9PT0nRm9ybWF0dGluZycpe1xuICAgICAgICAgICAgICAgIGlmKHRoaXMudG9rZW5zW2luZGV4KzFdLm5hbWU9PT0nRXF1YWxzJylcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4XS52YWx1ZT10aGlzLnRva2Vuc1tpbmRleCsyXVxuICAgICAgICAgICAgICAgICAgICBpbmRleGVzVG9SZW1vdmUucHVzaChpbmRleCsxLGluZGV4KzIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAoIWluZGV4ZXNUb1JlbW92ZS5pbmNsdWRlcyhpZHgpKSk7XG5cblxuXG4gICAgICAgIGNvbnN0IG1hcFN5bnRheCA9IHRoaXMudG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbiBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuJiZ0b2tlbi50eXBlID09PSAnU3ludGF4JyAmJiAvKERhc2h8UGx1cykvLnRlc3QodG9rZW4ubmFtZSkgPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcigoaWR4KTogaWR4IGlzIG51bWJlciA9PiBpZHggIT09IG51bGwpO1xuXG4gICAgICAgIGNvbnN0IHN5bnRheFNlcXVlbmNlcyA9IGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhtYXBTeW50YXgpO1xuXG5cbiAgICAgICAgY29uc3Qgc3ludGF4T2JqZWN0cyA9IHN5bnRheFNlcXVlbmNlc1xuICAgICAgICAubWFwKChzZXF1ZW5jZSkgPT4ge1xuICAgICAgICAgICAgaWYgKHNlcXVlbmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gc2VxdWVuY2VbMF07XG4gICAgICAgICAgICBjb25zdCBlbmQgPSBzZXF1ZW5jZVtzZXF1ZW5jZS5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBzZXF1ZW5jZVxuICAgICAgICAgICAgICAgIC5tYXAoKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleF07XG4gICAgICAgICAgICAgICAgICAgIGlmICghKHRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4pKXJldHVybiAnJ1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRva2VuIHx8ICF0b2tlbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYE1pc3Npbmcgb3IgaW52YWxpZCB0b2tlbiBhdCBpbmRleCAke2luZGV4fWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICcnOyAvLyBQcm92aWRlIGEgZmFsbGJhY2tcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG9rZW4ubmFtZVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL0Rhc2gvLCAnLScpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvUGx1cy8sICcrJyk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuam9pbignJyk7XG5cbiAgICAgICAgICAgIHJldHVybiB7IHN0YXJ0LCBlbmQsIHZhbHVlIH07XG4gICAgICAgIH0pXG5cbiAgICAgICAgLmZpbHRlcigob2JqKSA9PiBvYmogIT09IG51bGwpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLnN0YXJ0IC0gYS5zdGFydCk7XG5cbiAgICAgICAgc3ludGF4T2JqZWN0cy5mb3JFYWNoKCh7IHN0YXJ0LCBlbmQsIHZhbHVlIH0pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbW1hbmQgPSBzZWFyY2hUaWt6Q29tcG9uZW50cyh2YWx1ZSk7IFxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBuZXcgQmFzaWNUaWt6VG9rZW4oY29tbWFuZClcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgZW5kICsgMSAtIHN0YXJ0LCB0b2tlbik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcHJlcGFyZUZvclRva2VuaXplKCl7XG4gICAgICAgIGZ1bmN0aW9uIGEodG9rZW5zOiBhbnkpe1xuICAgICAgICAgICAgY29uc3Qgc2NvcGU9ZmluZERlZXBlc3RQYXJlbnRoZXNlc1Njb3BlKHRva2VucylcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHNjb3BlKVxuICAgICAgICAgICAgY29uc3Qgc2xpY2U9dG9rZW5zLnNsaWNlKHNjb3BlLmJlZ2luLHNjb3BlLmVuZClcbiAgICAgICAgICAgIHRva2Vucy5zcGxpY2Uoc2NvcGUuYmVnaW4sKHNjb3BlLmVuZC1zY29wZS5iZWdpbikrMSxbc2xpY2VdKVxuICAgICAgICAgICAgcmV0dXJuIHRva2Vuc1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGI9dGhpcy50b2tlbnNcbiAgICAgICAgY29uc29sZS5sb2coYShiKSlcblxuXG4gICAgICAgIGNvbnN0IHNxdWFyZUJyYWNrZXRJbmRleGVzID0gbWFwQnJhY2tldHMoJ1NxdWFyZV9icmFja2V0c19vcGVuJyx0aGlzLnRva2VucylcblxuICAgICAgICBzcXVhcmVCcmFja2V0SW5kZXhlc1xuICAgICAgICAuc29ydCgoYTogeyBvcGVuOiBudW1iZXI7IH0sIGI6IHsgb3BlbjogbnVtYmVyOyB9KSA9PiBiLm9wZW4gLSBhLm9wZW4pIC8vIFNvcnQgaW4gZGVzY2VuZGluZyBvcmRlciBvZiAnb3BlbidcbiAgICAgICAgLmZvckVhY2goKGluZGV4OiB7IG9wZW46IG51bWJlcjsgY2xvc2U6IG51bWJlcjsgfSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZyA9IG5ldyBGb3JtYXR0aW5nKFxuICAgICAgICAgICAgICAgIGNsZWFuRm9ybWF0dGluZyh0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCBmb3JtYXR0aW5nKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9sZXQgcHJhbmVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2Vucyk7XG4gICAgICAgIGxldCBjb29yZGluYXRlSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgdGhpcy50b2tlbnMpXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IHsgY2xvc2U6IG51bWJlcjsgfSxpZHg6IGFueSk9PnRoaXMudG9rZW5zW2l0ZW0uY2xvc2UrMV0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiYmKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UrMV1hcyBCYXNpY1Rpa3pUb2tlbikudmFsdWUhPT0nYXQnKVxuICAgICAgICAvKlxuICAgICAgICBjb25zdCB7IGNvb3JkaW5hdGVJbmRleGVzLCB2YXJpYWJsZUluZGV4ZXMgfSA9IHByYW5lSW5kZXhlcy5yZWR1Y2UoKHJlc3VsdCwgaXRlbSkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UgKyAxXT8udmFsdWUgIT09ICdhdCcpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQuY29vcmRpbmF0ZUluZGV4ZXMucHVzaChpdGVtKTtcbiAgICAgICAgICAgIH0gXG4gICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbaXRlbS5jbG9zZSArIDFdPy52YWx1ZSA9PT0gJ2F0Jykge1xuICAgICAgICAgICAgICAgIHJlc3VsdC52YXJpYWJsZUluZGV4ZXMucHVzaChpdGVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0sIHsgY29vcmRpbmF0ZUluZGV4ZXM6IFtdLCB2YXJpYWJsZUluZGV4ZXM6IFtdIH0pO1xuICAgICAgICBjb29yZGluYXRlSW5kZXhlc1xuICAgICAgICAuc29ydCgoYTogeyBvcGVuOiBudW1iZXI7IH0sIGI6IHsgb3BlbjogbnVtYmVyOyB9KSA9PiBiLm9wZW4gLSBhLm9wZW4pIFxuICAgICAgICAuZm9yRWFjaCgoaW5kZXg6IHsgb3BlbjogbnVtYmVyOyBjbG9zZTogbnVtYmVyIDsgfSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXhpcyA9IG5ldyBBeGlzKCkucGFyc2VJbnB1dChcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFheGlzKXJldHVyblxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGF4aXMpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgdmFyaWFibGVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2VucylcbiAgICAgICAgLmZpbHRlcigoaXRlbTogeyBjbG9zZTogbnVtYmVyOyB9LGlkeDogYW55KT0+dGhpcy50b2tlbnNbaXRlbS5jbG9zZSsxXSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuJiYodGhpcy50b2tlbnNbaXRlbS5jbG9zZSsxXWFzIEJhc2ljVGlrelRva2VuKS52YWx1ZSE9PSdhdCcpXG5cbiAgICAgICAgdmFyaWFibGVJbmRleGVzXG4gICAgICAgIC5zb3J0KChhOiB7IG9wZW46IG51bWJlcjsgfSwgYjogeyBvcGVuOiBudW1iZXI7IH0pID0+IGIub3BlbiAtIGEub3BlbikgXG4gICAgICAgIC5mb3JFYWNoKChpbmRleDogeyBvcGVuOiBudW1iZXIgOyBjbG9zZTogbnVtYmVyIDsgfSkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coaW5kZXgsdGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UpKVxuICAgICAgICAgICAgY29uc3QgdmFyaWFibGUgPSB0b1ZhcmlhYmxlVG9rZW4odGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyh2YXJpYWJsZSlcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCB2YXJpYWJsZSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn0qLyJdfQ==