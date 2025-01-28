import { getAllTikzReferences } from "src/staticData/dataManager";
import { arrToRegexString } from "../tikzjax";
import { findDeepestParenthesesScope, idParentheses } from "src/utils/ParenUtensils";
import { BasicTikzToken } from "src/mathParser/basicToken";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmFzaWNNYXRoSmF4VG9rZW5Hcm91cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy90aWt6amF4L2ludGVycHJldC9CYXNpY01hdGhKYXhUb2tlbkdyb3VwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxvQkFBb0IsRUFBd0IsTUFBTSw0QkFBNEIsQ0FBQztBQUN4RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDOUMsT0FBTyxFQUFFLDJCQUEyQixFQUFFLGFBQWEsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBQzVGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFcEQsTUFBTSxXQUFXLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtJQUNsQyxNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEMsT0FBTyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDO0FBQ2hELENBQUMsQ0FBQztBQUVGLE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxVQUFrQjtJQUNoRCxVQUFVLEdBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3RDLE1BQU0sZUFBZSxHQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUMsVUFBVSxFQUFDLGVBQWUsQ0FBQyxDQUFBO0lBQ3pELE1BQU0sVUFBVSxHQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFBO0lBQ25ELE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFDLFVBQVUsQ0FBQyxDQUFBO0FBQ3hDLENBQUM7QUFJRCxTQUFTLGNBQWMsQ0FBQyxNQUFjO0lBQ2xDLE1BQU0s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Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTRSRyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaWt6Q29tcG9uZW50cyB9IGZyb20gXCJzcmMvc3RhdGljRGF0YS9kYXRhTWFuYWdlclwiO1xyXG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nIH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgZmluZERlZXBlc3RQYXJlbnRoZXNlc1Njb3BlLCBpZFBhcmVudGhlc2VzLCBQYXJlbiB9IGZyb20gXCJzcmMvdXRpbHMvUGFyZW5VdGVuc2lsc1wiO1xyXG5pbXBvcnQgeyBCYXNpY1Rpa3pUb2tlbiB9IGZyb20gXCJzcmMvbWF0aFBhcnNlci9iYXNpY1Rva2VuXCI7XHJcbmltcG9ydCB7IEVuY2FzaW5nIH0gZnJvbSBcInNyYy9zdGF0aWNEYXRhL2VuY2FzaW5nc1wiO1xyXG5cclxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xyXG4gICAgY29uc3QgbnVtYmVyVmFsdWUgPSBwYXJzZUZsb2F0KHZhbHVlKTtcclxuICAgIHJldHVybiBpc05hTihudW1iZXJWYWx1ZSkgPyAwIDogbnVtYmVyVmFsdWU7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcHJvY2Vzc1Rpa3pTdHJpbmcodGlrelN0cmluZzogc3RyaW5nKXtcclxuICAgIHRpa3pTdHJpbmc9dGlkeVRpa3pTdHJpbmcodGlrelN0cmluZyk7XHJcbiAgICBjb25zdCBiYXNpY1Rpa3pUb2tlbnM9YmFzaWNUaWt6VG9rZW5pZnkodGlrelN0cmluZyk7XHJcbiAgICBjb25zb2xlLmxvZygnYmFzaWNUaWt6VG9rZW5zJyx0aWt6U3RyaW5nLGJhc2ljVGlrelRva2VucylcclxuICAgIGNvbnN0IHRpa3pHcm91cHM9ZGVmaW5lTGF0ZXhHcm91cHMoYmFzaWNUaWt6VG9rZW5zKVxyXG4gICAgY29uc29sZS5sb2coJ3Rpa3pHcm91cHMnLHRpa3pHcm91cHMpXHJcbn1cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gdGlkeVRpa3pTdHJpbmcoc291cmNlOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XHJcbiAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcclxuICAgIGxpbmVzID0gbGluZXMubWFwKGxpbmUgPT4gbGluZS50cmltKCkpO1xyXG4gICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcclxuICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGJhc2ljVGlrelRva2VuaWZ5KHNvdXJjZTogc3RyaW5nKTooQmFzaWNUaWt6VG9rZW58UGFyZW4pW10ge1xyXG4gICAgY29uc3QgYmFzaWNBcnJheSA9IFtdO1xyXG4gICAgY29uc3Qgb3BlcmF0b3JzUmVnZXggPSBuZXcgUmVnRXhwKCdeJyArIGFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsVGlrelJlZmVyZW5jZXMoKSkpO1xyXG4gICAgbGV0IGkgPSAwO1xyXG4gICAgIFxyXG4gICAgd2hpbGUgKGkgPCBzb3VyY2UubGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3Qgc3ViU291cmNlID0gc291cmNlLnNsaWNlKGkpO1xyXG4gICAgICAgIGxldCBtYXRjaDtcclxuICAgIFxyXG4gICAgICAgIC8vIE1hdGNoIFRpa1ogb3BlcmF0b3JzXHJcbiAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2gob3BlcmF0b3JzUmVnZXgpO1xyXG4gICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goQmFzaWNUaWt6VG9rZW4uY3JlYXRlKG1hdGNoWzBdKSk7XHJcbiAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2goL15bYS16QS1aXFxcXF0rLyk7XHJcbiAgICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaChCYXNpY1Rpa3pUb2tlbi5jcmVhdGUobWF0Y2hbMF0pKTtcclxuICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIC8vIE1hdGNoIG51bWJlcnNcclxuICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlstMC05Ll0rLyk7XHJcbiAgICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaChCYXNpY1Rpa3pUb2tlbi5jcmVhdGUocGFyc2VOdW1iZXIobWF0Y2hbMF0pKSk7XHJcbiAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgaXRlbSB0byBiZSByZWNvZ25pemVkXCIrc3ViU291cmNlKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGlkUGFyZW50aGVzZXMoYmFzaWNBcnJheSlcclxufVxyXG5cclxuZnVuY3Rpb24gZGVmaW5lTGF0ZXhHcm91cHModG9rZW5zOiAoQmFzaWNUaWt6VG9rZW4gfCBQYXJlbiB8IEJhc2ljVGlrelRva2VuR3JvdXApW10pOiAoQmFzaWNUaWt6VG9rZW4gfCBQYXJlbiB8IEJhc2ljVGlrelRva2VuR3JvdXApW10ge1xyXG4gICAgbGV0IGk9MDtcclxuICAgIHdoaWxlICh0cnVlKSB7XHJcbiAgICAgICAgaSsrO1xyXG4gICAgICAgIGlmKGk+MTApXHJcbiAgICAgICAgICAgIHJldHVybiB0b2tlbnNcclxuICAgICAgICBjb25zdCBzY29wZSA9IGZpbmREZWVwZXN0UGFyZW50aGVzZXNTY29wZSh0b2tlbnMpO1xyXG4gICAgICAgIGlmIChzY29wZS5iZWdpbiA9PT0gMCAmJiBzY29wZS5lbmQgPT09IHRva2Vucy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRva2VucztcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHNjb3BlLmJlZ2luIDwgMCB8fCBzY29wZS5lbmQgPD0gc2NvcGUuYmVnaW4gfHwgc2NvcGUuZW5kID4gdG9rZW5zLmxlbmd0aCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHBhcmVudGhlc2VzIHNjb3BlIGZvdW5kXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBncm91cCA9IEJhc2ljVGlrelRva2VuR3JvdXAuY3JlYXRlKHRva2Vucy5zbGljZShzY29wZS5iZWdpbiwgc2NvcGUuZW5kKzEvKkkgd2FudCB0aGUgZW5kaW5nIGluY2FzaW5nICovKSk7XHJcbiAgICAgICAgdG9rZW5zLnNwbGljZShzY29wZS5iZWdpbiwgKHNjb3BlLmVuZCAtIHNjb3BlLmJlZ2luKSsxLCBncm91cCk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmVudW0gVHlwZXtcclxuICAgIEZvcm1hdHRpbmdcclxufVxyXG50eXBlIEJhc2ljVGlrekdyb3VwSXRlbT0oQmFzaWNUaWt6VG9rZW58QmFzaWNUaWt6VG9rZW5Hcm91cCk7XHJcblxyXG5mdW5jdGlvbiBlbnN1cmVBY2NlcHRhYmxlRm9ybWF0Rm9yVGlrekdyb3VwSXRlbXMoaXRlbXM6IEJhc2ljVGlrekdyb3VwSXRlbSB8IEJhc2ljVGlrekdyb3VwSXRlbVtdKTogQmFzaWNUaWt6R3JvdXBJdGVtW10ge1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xyXG4gICAgICAgIGl0ZW1zID0gW2l0ZW1zXTtcclxuICAgIH1cclxuICAgIGNvbnN0IGZvcm1hdHRlZEl0ZW1zOiBCYXNpY1Rpa3pHcm91cEl0ZW1bXSA9IGl0ZW1zLnJlZHVjZSgoYWNjOiBCYXNpY1Rpa3pHcm91cEl0ZW1bXSwgaXRlbTogQmFzaWNUaWt6R3JvdXBJdGVtKSA9PiB7XHJcbiAgICAgICAgaWYgKGl0ZW0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiB8fCBpdGVtIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW5Hcm91cCkge1xyXG4gICAgICAgICAgICBhY2MucHVzaChpdGVtKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGl0ZW0gdG8gYmUgQmFzaWNUaWt6VG9rZW4gb3IgQmFzaWNUaWt6VG9rZW5Hcm91cCwgYnV0IHJlY2VpdmVkOiAke2l0ZW19YCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBhY2M7XHJcbiAgICB9LCBbXSk7XHJcblxyXG4gICAgcmV0dXJuIGZvcm1hdHRlZEl0ZW1zO1xyXG59XHJcblxyXG5jbGFzcyBCYXNpY1Rpa3pUb2tlbkdyb3Vwe1xyXG4gICAgdHlwZTogVHlwZTtcclxuICAgIGVuY2FzaW5nOiBFbmNhc2luZ1xyXG4gICAgaXRlbXM6IEFycmF5PEJhc2ljVGlrekdyb3VwSXRlbT47XHJcbiAgICBjb25zdHJ1Y3Rvcih0eXBlOiBUeXBlLGVuY2FzaW5nOiBFbmNhc2luZyxpdGVtczogQmFzaWNUaWt6R3JvdXBJdGVtW10pe1xyXG4gICAgICAgIHRoaXMudHlwZT10eXBlO1xyXG4gICAgICAgIHRoaXMuZW5jYXNpbmc9ZW5jYXNpbmc7XHJcbiAgICAgICAgdGhpcy5pdGVtcz1pdGVtcztcclxuICAgIH1cclxuICAgIHN0YXRpYyBjcmVhdGUodG9rZW5zOiBhbnlbXSl7XHJcbiAgICAgICAgY29uc3QgZ3JvdXA9dG9rZW5zLnNwbGljZSgxLHRva2Vucy5sZW5ndGgtMilcclxuICAgICAgICBpZih0b2tlbnMubGVuZ3RoIT09MiYmIXRva2Vuc1swXS5lcXVhbHModG9rZW5zWzFdKSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwid3RmXCIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgQmFzaWNUaWt6VG9rZW5Hcm91cChUeXBlLkZvcm1hdHRpbmcsRW5jYXNpbmcuQnJhY2tldHMsZW5zdXJlQWNjZXB0YWJsZUZvcm1hdEZvclRpa3pHcm91cEl0ZW1zKGdyb3VwKSlcclxuICAgIH1cclxufVxyXG5cclxuLypcclxuZXhwb3J0IGNsYXNzIEJhc2ljVGlrelRva2Vuc3tcclxuICAgIHByaXZhdGUgdG9rZW5zOiBBcnJheTxCYXNpY1Rpa3pUb2tlbnxGb3JtYXR0aW5nfEF4aXM+ID0gW11cclxuICAgIHByaXZhdGUgdGlrekNvbW1hbmRzOiBUaWt6Q29tbWFuZHM9bmV3IFRpa3pDb21tYW5kcygpO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nKXtcclxuICAgICAgICB0aGlzLmNsZWFuQmFzaWNUaWt6VG9rZW5pZnkoKVxyXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMudG9rZW5zKVxyXG4gICAgICAgIHRoaXMucHJlcGFyZUZvclRva2VuaXplKClcclxuICAgIH1cclxuICAgIGdldFRva2Vucygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBwcml2YXRlIGluZmVyQW5kSW50ZXJwcmV0Q29tbWFuZHMoKSB7XHJcbiAgICAgICAgLy8gU3RlcCAxOiBFeHRyYWN0IGNvbW1hbmQgaW5kaWNlc1xyXG4gICAgICAgIGNvbnN0IGNvbW1hbmRzTWFwID0gdGhpcy50b2tlbnNcclxuICAgICAgICAgICAgLm1hcCgodCwgaWR4KSA9PiAodCBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuICYmIHQudHlwZSA9PT0gJ01hY3JvJyA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKCh0KSA9PiB0ICE9PSBudWxsKTtcclxuICAgICAgICBjb21tYW5kc01hcC5mb3JFYWNoKChpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBmaXJzdEJyYWNrZXRBZnRlckluZGV4ID0gdGhpcy5maW5kRmlyc3RCcmFja2V0QWZ0ZXIoaW5kZXgsICdDdXJseV9icmFja2V0c19vcGVuJyk7XHJcbiAgICAgICAgICAgIGlmICghZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCkgcmV0dXJuO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGVuZE9mRXhwcmVzc2lvbiA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoXHJcbiAgICAgICAgICAgICAgICBmaXJzdEJyYWNrZXRBZnRlckluZGV4LnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMsXHJcbiAgICAgICAgICAgICAgICAwLFxyXG4gICAgICAgICAgICAgICAgMSxcclxuICAgICAgICAgICAgICAgICdDdXJseV9icmFja2V0c19vcGVuJ1xyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBpZiAoIWVuZE9mRXhwcmVzc2lvbikge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHByZXNzaW9uIGVuZCBub3QgZm91bmQgZm9yIGNvbW1hbmQgYXQgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGNvbW1hbmRUb2tlbnMgPSB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsIE1hdGguYWJzKGluZGV4IC0gKGVuZE9mRXhwcmVzc2lvbi5jbG9zZSArIDEpKSk7XHJcbiAgICAgICAgICAgIHRoaXMudGlrekNvbW1hbmRzLmFkZENvbW1hbmRCeUludGVycHJldGF0aW9uKGNvbW1hbmRUb2tlbnMpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgXHJcbiAgICAgICAgLy8gU3RlcCAzOiBNYXRjaCBjb21tYW5kcyB0byB0b2tlbnNcclxuICAgICAgICBjb25zdCBjb21tYW5kc0luVG9rZW5zID0gdGhpcy50b2tlbnNcclxuICAgICAgICAgICAgLm1hcCgoaXRlbSwgaW5kZXgpID0+IHRoaXMubWF0Y2hDb21tYW5kVG9Ub2tlbihpdGVtLCBpbmRleCkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpID0+IHQgIT09IG51bGwpO1xyXG4gICAgXHJcbiAgICAgICAgLy8gU3RlcCA0OiBQcm9jZXNzIGNvbmZpcm1lZCBjb21tYW5kc1xyXG4gICAgICAgIGNvbnN0IGNvbmZpcm1lZENvbW1hbmRzID0gdGhpcy5wcm9jZXNzQ29uZmlybWVkQ29tbWFuZHMoY29tbWFuZHNJblRva2Vucyk7XHJcbiAgICBcclxuICAgICAgICAvLyBTdGVwIDU6IFJlcGxhY2UgdG9rZW5zIHdpdGggcHJvY2Vzc2VkIGNvbW1hbmRzXHJcbiAgICAgICAgdGhpcy5yZXBsYWNlVG9rZW5zV2l0aENvbW1hbmRzKGNvbmZpcm1lZENvbW1hbmRzKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSGVscGVyIHRvIGZpbmQgdGhlIGZpcnN0IG1hdGNoaW5nIGJyYWNrZXQgYWZ0ZXIgYSBnaXZlbiBpbmRleFxyXG4gICAgcHJpdmF0ZSBmaW5kRmlyc3RCcmFja2V0QWZ0ZXIoc3RhcnRJbmRleDogbnVtYmVyLCBicmFja2V0TmFtZTogc3RyaW5nKTogQmFzaWNUaWt6VG9rZW4gfCBudWxsIHtcclxuICAgICAgICBjb25zdCBmaXJzdEJyYWNrZXRBZnRlcj10aGlzLnRva2Vuc1xyXG4gICAgICAgICAgICAuc2xpY2Uoc3RhcnRJbmRleClcclxuICAgICAgICAgICAgLmZpbmQoKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiAmJiBpdGVtLnZhbHVlID09PSBicmFja2V0TmFtZSlcclxuICAgICAgICByZXR1cm4gZmlyc3RCcmFja2V0QWZ0ZXIgaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbj9maXJzdEJyYWNrZXRBZnRlcjpudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gbWF0Y2ggY29tbWFuZHMgdG8gdG9rZW5zXHJcbiAgICBwcml2YXRlIG1hdGNoQ29tbWFuZFRvVG9rZW4oaXRlbTogYW55LCBpbmRleDogbnVtYmVyKTogYW55IHwgbnVsbCB7XHJcbiAgICAgICAgaWYgKCEoaXRlbSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKSB8fCBpdGVtLnR5cGUgIT09ICdzdHJpbmcnKSByZXR1cm4gbnVsbDtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IG1hdGNoID0gdGhpcy50aWt6Q29tbWFuZHMuY29tbWFuZHMuZmluZCgoYykgPT4gYy50cmlnZ2VyID09PSBpdGVtLnZhbHVlKTtcclxuICAgICAgICByZXR1cm4gbWF0Y2ggPyB7IGluZGV4LCAuLi5tYXRjaC5nZXRJbmZvKCkgfSA6IG51bGw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciB0byBwcm9jZXNzIGNvbmZpcm1lZCBjb21tYW5kc1xyXG4gICAgcHJpdmF0ZSBwcm9jZXNzQ29uZmlybWVkQ29tbWFuZHMoY29tbWFuZHNJblRva2VuczogYW55W10pOiB7IGlkczogUGFyZW5QYWlyW107IGluZGV4OiBudW1iZXIgfVtdIHtcclxuICAgICAgICBjb25zdCBjb25maXJtZWRDb21tYW5kcyA9IFtdO1xyXG4gICAgXHJcbiAgICAgICAgZm9yIChjb25zdCB7IGluZGV4LCB0cmlnZ2VyLCBob29rcyB9IG9mIGNvbW1hbmRzSW5Ub2tlbnMpIHtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBob29rcyAhPT0gJ251bWJlcicgfHwgaG9va3MgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGhvb2tzIHZhbHVlIGZvciBjb21tYW5kIGF0IGluZGV4ICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBmaXJzdEJyYWNrZXRBZnRlckluZGV4ID0gdGhpcy5maW5kRmlyc3RCcmFja2V0QWZ0ZXIoaW5kZXgsICdDdXJseV9icmFja2V0c19vcGVuJyk7XHJcbiAgICAgICAgICAgIGlmICghZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDdXJseV9icmFja2V0c19vcGVuIG5vdCBmb3VuZCBhZnRlciBpbmRleCAke2luZGV4fWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBvYmo6IHsgaWRzOiBQYXJlblBhaXJbXSB9ID0geyBpZHM6IFtdIH07XHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG9va3M7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW5QYWlySW5kZXggPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KFxyXG4gICAgICAgICAgICAgICAgICAgIGZpcnN0QnJhY2tldEFmdGVySW5kZXgudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLFxyXG4gICAgICAgICAgICAgICAgICAgIDAsXHJcbiAgICAgICAgICAgICAgICAgICAgaSxcclxuICAgICAgICAgICAgICAgICAgICAnQ3VybHlfYnJhY2tldHNfb3BlbidcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICBcclxuICAgICAgICAgICAgICAgIGlmICghcGFyZW5QYWlySW5kZXgpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBhcmVuIHBhaXIgbm90IGZvdW5kIGZvciBob29rICR7aX0gYXQgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKG9iai5pZHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhc3RJZCA9IG9iai5pZHNbb2JqLmlkcy5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobGFzdElkLmNsb3NlICE9PSBwYXJlblBhaXJJbmRleC5vcGVuIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgTWlzbWF0Y2ggYmV0d2VlbiBsYXN0IGNsb3NlICgke2xhc3RJZC5jbG9zZX0pIGFuZCBuZXh0IG9wZW4gKCR7cGFyZW5QYWlySW5kZXgub3Blbn0pYFxyXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIG9iai5pZHMucHVzaChwYXJlblBhaXJJbmRleCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uZmlybWVkQ29tbWFuZHMucHVzaCh7IC4uLm9iaiwgaW5kZXggfSk7XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgcmV0dXJuIGNvbmZpcm1lZENvbW1hbmRzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gcmVwbGFjZSB0b2tlbnMgd2l0aCBwcm9jZXNzZWQgY29tbWFuZHNcclxuICAgIHByaXZhdGUgcmVwbGFjZVRva2Vuc1dpdGhDb21tYW5kcyhjb25maXJtZWRDb21tYW5kczogYW55W10pIHtcclxuICAgICAgICBjb25maXJtZWRDb21tYW5kcy5mb3JFYWNoKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghY29tbWFuZC5pZHMgfHwgY29tbWFuZC5pZHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjogQ29tbWFuZCBJRHMgYXJlIGVtcHR5IG9yIHVuZGVmaW5lZC4nKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IG9wZW4gPSBjb21tYW5kLmluZGV4O1xyXG4gICAgICAgICAgICBjb25zdCBjbG9zZSA9IGNvbW1hbmQuaWRzW2NvbW1hbmQuaWRzLmxlbmd0aCAtIDFdLmNsb3NlO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGlmIChjbG9zZSA8IG9wZW4pIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBDbG9zZSBpbmRleCAoJHtjbG9zZX0pIGlzIHNtYWxsZXIgdGhhbiBvcGVuIGluZGV4ICgke29wZW59KS5gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRlbGV0ZUNvdW50ID0gY2xvc2UgLSBvcGVuICsgMTtcclxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZFRva2VucyA9IHRoaXMudG9rZW5zLnNsaWNlKG9wZW4sIGRlbGV0ZUNvdW50KTtcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCByZXBsYWNlbWVudCA9IHRoaXMudGlrekNvbW1hbmRzLnJlcGxhY2VDYWxsV2l0aENvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICBjb21tYW5kLnRyaWdnZXIsXHJcbiAgICAgICAgICAgICAgICBjb21tYW5kLmhvb2tzLFxyXG4gICAgICAgICAgICAgICAgdGhpcy50aWt6Q29tbWFuZHMuZ2V0SG9va3MocmVtb3ZlZFRva2VucywgY29tbWFuZC5pZHMpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKCFyZXBsYWNlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAgICAgICAgIGBSZXBsYWNlbWVudCBnZW5lcmF0aW9uIGZhaWxlZCBmb3IgY29tbWFuZCBhdCBpbmRleCAke2NvbW1hbmQuaW5kZXh9IHdpdGggdHJpZ2dlciAke2NvbW1hbmQudHJpZ2dlcn0uYFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShvcGVuLCBkZWxldGVDb3VudCwgLi4ucmVwbGFjZW1lbnQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcml2YXRlIGNsZWFuQmFzaWNUaWt6VG9rZW5pZnkoKXtcclxuXHJcbiAgICAgICAgdGhpcy5pbmZlckFuZEludGVycHJldENvbW1hbmRzKClcclxuXHJcblxyXG4gICAgICAgIGNvbnN0IHVuaXRJbmRpY2VzOiBudW1iZXJbXSA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJnRva2VuLnR5cGUgPT09ICdVbml0JyA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICAgICAgdW5pdEluZGljZXMuZm9yRWFjaCgodW5pdElkeCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSB0aGlzLnRva2Vuc1t1bml0SWR4IC0gMV07XHJcbiAgICAgICAgICAgIGlmICghKHByZXZUb2tlbiBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKXx8ISh0aGlzLnRva2Vuc1t1bml0SWR4XSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKSlyZXR1cm5cclxuICAgICAgICAgICAgaWYgKCFwcmV2VG9rZW4gfHwgcHJldlRva2VuLnR5cGUgIT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuaXRzIGNhbiBvbmx5IGJlIHVzZWQgaW4gcmVmZXJlbmNlIHRvIG51bWJlcnMgYXQgaW5kZXggJHt1bml0SWR4fWApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBwcmV2VG9rZW4udmFsdWUgPSB0b1BvaW50KHByZXZUb2tlbi52YWx1ZSBhcyBudW1iZXIsIHRoaXMudG9rZW5zW3VuaXRJZHhdLnZhbHVlKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICghdW5pdEluZGljZXMuaW5jbHVkZXMoaWR4KSkpO1xyXG5cclxuICAgICAgICAvL3RoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigodCkgPT4gdC5uYW1lIT09J0NvbW1hJyk7XHJcbiAgICAgICAgLypcclxuICAgICAgICBjb25zdCBpbmRleGVzVG9SZW1vdmU6IG51bWJlcltdPVtdXHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW4saW5kZXgpID0+IHtcclxuICAgICAgICAgICAgaWYodG9rZW4udHlwZT09PSdGb3JtYXR0aW5nJyl7XHJcbiAgICAgICAgICAgICAgICBpZih0aGlzLnRva2Vuc1tpbmRleCsxXS5uYW1lPT09J0VxdWFscycpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXhdLnZhbHVlPXRoaXMudG9rZW5zW2luZGV4KzJdXHJcbiAgICAgICAgICAgICAgICAgICAgaW5kZXhlc1RvUmVtb3ZlLnB1c2goaW5kZXgrMSxpbmRleCsyKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAoIWluZGV4ZXNUb1JlbW92ZS5pbmNsdWRlcyhpZHgpKSk7XHJcblxyXG5cclxuXHJcbiAgICAgICAgY29uc3QgbWFwU3ludGF4ID0gdGhpcy50b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbiwgaWR4KSA9PiAodG9rZW4gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiYmdG9rZW4udHlwZSA9PT0gJ1N5bnRheCcgJiYgLyhEYXNofFBsdXMpLy50ZXN0KHRva2VuLm5hbWUpID8gaWR4IDogbnVsbCkpXHJcbiAgICAgICAgLmZpbHRlcigoaWR4KTogaWR4IGlzIG51bWJlciA9PiBpZHggIT09IG51bGwpO1xyXG5cclxuICAgICAgICBjb25zdCBzeW50YXhTZXF1ZW5jZXMgPSBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwU3ludGF4KTtcclxuXHJcblxyXG4gICAgICAgIGNvbnN0IHN5bnRheE9iamVjdHMgPSBzeW50YXhTZXF1ZW5jZXNcclxuICAgICAgICAubWFwKChzZXF1ZW5jZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoc2VxdWVuY2UubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gc2VxdWVuY2VbMF07XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZCA9IHNlcXVlbmNlW3NlcXVlbmNlLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBzZXF1ZW5jZVxyXG4gICAgICAgICAgICAgICAgLm1hcCgoaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy50b2tlbnNbaW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghKHRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4pKXJldHVybiAnJ1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdG9rZW4gfHwgIXRva2VuLm5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBNaXNzaW5nIG9yIGludmFsaWQgdG9rZW4gYXQgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICcnOyAvLyBQcm92aWRlIGEgZmFsbGJhY2tcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuLm5hbWVcclxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL0Rhc2gvLCAnLScpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9QbHVzLywgJysnKTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuam9pbignJyk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4geyBzdGFydCwgZW5kLCB2YWx1ZSB9O1xyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIC5maWx0ZXIoKG9iaikgPT4gb2JqICE9PSBudWxsKVxyXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLnN0YXJ0IC0gYS5zdGFydCk7XHJcblxyXG4gICAgICAgIHN5bnRheE9iamVjdHMuZm9yRWFjaCgoeyBzdGFydCwgZW5kLCB2YWx1ZSB9KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbW1hbmQgPSBzZWFyY2hUaWt6Q29tcG9uZW50cyh2YWx1ZSk7IFxyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBCYXNpY1Rpa3pUb2tlbihjb21tYW5kKVxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uoc3RhcnQsIGVuZCArIDEgLSBzdGFydCwgdG9rZW4pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcHJlcGFyZUZvclRva2VuaXplKCl7XHJcbiAgICAgICAgZnVuY3Rpb24gYSh0b2tlbnM6IGFueSl7XHJcbiAgICAgICAgICAgIGNvbnN0IHNjb3BlPWZpbmREZWVwZXN0UGFyZW50aGVzZXNTY29wZSh0b2tlbnMpXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHNjb3BlKVxyXG4gICAgICAgICAgICBjb25zdCBzbGljZT10b2tlbnMuc2xpY2Uoc2NvcGUuYmVnaW4sc2NvcGUuZW5kKVxyXG4gICAgICAgICAgICB0b2tlbnMuc3BsaWNlKHNjb3BlLmJlZ2luLChzY29wZS5lbmQtc2NvcGUuYmVnaW4pKzEsW3NsaWNlXSlcclxuICAgICAgICAgICAgcmV0dXJuIHRva2Vuc1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBiPXRoaXMudG9rZW5zXHJcbiAgICAgICAgY29uc29sZS5sb2coYShiKSlcclxuXHJcblxyXG4gICAgICAgIGNvbnN0IHNxdWFyZUJyYWNrZXRJbmRleGVzID0gbWFwQnJhY2tldHMoJ1NxdWFyZV9icmFja2V0c19vcGVuJyx0aGlzLnRva2VucylcclxuXHJcbiAgICAgICAgc3F1YXJlQnJhY2tldEluZGV4ZXNcclxuICAgICAgICAuc29ydCgoYTogeyBvcGVuOiBudW1iZXI7IH0sIGI6IHsgb3BlbjogbnVtYmVyOyB9KSA9PiBiLm9wZW4gLSBhLm9wZW4pIC8vIFNvcnQgaW4gZGVzY2VuZGluZyBvcmRlciBvZiAnb3BlbidcclxuICAgICAgICAuZm9yRWFjaCgoaW5kZXg6IHsgb3BlbjogbnVtYmVyOyBjbG9zZTogbnVtYmVyOyB9KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmcgPSBuZXcgRm9ybWF0dGluZyhcclxuICAgICAgICAgICAgICAgIGNsZWFuRm9ybWF0dGluZyh0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgZm9ybWF0dGluZyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vbGV0IHByYW5lSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgdGhpcy50b2tlbnMpO1xyXG4gICAgICAgIGxldCBjb29yZGluYXRlSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgdGhpcy50b2tlbnMpXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogeyBjbG9zZTogbnVtYmVyOyB9LGlkeDogYW55KT0+dGhpcy50b2tlbnNbaXRlbS5jbG9zZSsxXSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuJiYodGhpcy50b2tlbnNbaXRlbS5jbG9zZSsxXWFzIEJhc2ljVGlrelRva2VuKS52YWx1ZSE9PSdhdCcpXHJcbiAgICAgICAgLypcclxuICAgICAgICBjb25zdCB7IGNvb3JkaW5hdGVJbmRleGVzLCB2YXJpYWJsZUluZGV4ZXMgfSA9IHByYW5lSW5kZXhlcy5yZWR1Y2UoKHJlc3VsdCwgaXRlbSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbaXRlbS5jbG9zZSArIDFdPy52YWx1ZSAhPT0gJ2F0Jykge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0LmNvb3JkaW5hdGVJbmRleGVzLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgIH0gXHJcbiAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tpdGVtLmNsb3NlICsgMV0/LnZhbHVlID09PSAnYXQnKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQudmFyaWFibGVJbmRleGVzLnB1c2goaXRlbSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9LCB7IGNvb3JkaW5hdGVJbmRleGVzOiBbXSwgdmFyaWFibGVJbmRleGVzOiBbXSB9KTtcclxuICAgICAgICBjb29yZGluYXRlSW5kZXhlc1xyXG4gICAgICAgIC5zb3J0KChhOiB7IG9wZW46IG51bWJlcjsgfSwgYjogeyBvcGVuOiBudW1iZXI7IH0pID0+IGIub3BlbiAtIGEub3BlbikgXHJcbiAgICAgICAgLmZvckVhY2goKGluZGV4OiB7IG9wZW46IG51bWJlcjsgY2xvc2U6IG51bWJlciA7IH0pID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXhpcyA9IG5ldyBBeGlzKCkucGFyc2VJbnB1dChcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNsaWNlKGluZGV4Lm9wZW4gKyAxLCBpbmRleC5jbG9zZSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWYgKCFheGlzKXJldHVyblxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgYXhpcyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCB2YXJpYWJsZUluZGV4ZXMgPSBtYXBCcmFja2V0cygnUGFyZW50aGVzZXNfb3BlbicsIHRoaXMudG9rZW5zKVxyXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IHsgY2xvc2U6IG51bWJlcjsgfSxpZHg6IGFueSk9PnRoaXMudG9rZW5zW2l0ZW0uY2xvc2UrMV0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiYmKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UrMV1hcyBCYXNpY1Rpa3pUb2tlbikudmFsdWUhPT0nYXQnKVxyXG5cclxuICAgICAgICB2YXJpYWJsZUluZGV4ZXNcclxuICAgICAgICAuc29ydCgoYTogeyBvcGVuOiBudW1iZXI7IH0sIGI6IHsgb3BlbjogbnVtYmVyOyB9KSA9PiBiLm9wZW4gLSBhLm9wZW4pIFxyXG4gICAgICAgIC5mb3JFYWNoKChpbmRleDogeyBvcGVuOiBudW1iZXIgOyBjbG9zZTogbnVtYmVyIDsgfSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpbmRleCx0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSkpXHJcbiAgICAgICAgICAgIGNvbnN0IHZhcmlhYmxlID0gdG9WYXJpYWJsZVRva2VuKHRoaXMudG9rZW5zLnNsaWNlKGluZGV4Lm9wZW4gKyAxLCBpbmRleC5jbG9zZSkpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyh2YXJpYWJsZSlcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIHZhcmlhYmxlKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufSovIl19