//// @ts-nocheck
import { findConsecutiveSequences } from "src/mathParser/mathEngine";
import { arrToRegexString, Axis, Coordinate, Draw, Formatting, toPoint } from "../tikzjax";
import { findModifiedParenIndex, findParenIndex, idParentheses, mapBrackets } from "src/utils/tokenUtensils";
import { getAllTikzReferences, searchTikzComponents } from "src/utils/dataManager";
function labelFreeFormTextSeparation(label) {
    const colonIndex = label.findIndex(t => t.name === 'Colon');
    label = label.splice(colonIndex, label.length - colonIndex);
    return label.splice(1);
}
function getOriginalTikzReferences(tokens) {
    let string = '';
    tokens.forEach(token => {
        const component = searchTikzComponents(token.name || token.value);
        if (component && component.references?.length > 0) {
            string += component.references[0];
        }
        else
            string += token.value;
    });
    return string;
}
function cleanFormatting(formatting, subType) {
    const values = [];
    let currentGroup = [];
    const formattingKeys = [];
    if (subType === 'Label') {
        const label = labelFreeFormTextSeparation(formatting);
        formattingKeys.push({ key: 'freeFormText', value: getOriginalTikzReferences(label) });
    }
    const bracketMap = mapBrackets('Curly_brackets_open', formatting);
    bracketMap.reverse();
    bracketMap.forEach((bracket) => {
        if (formatting[bracket.open - 1].name === 'Equals') {
            let subFormatting = formatting.splice(bracket.open - 1, bracket.close - (bracket.open - 2));
            subFormatting = subFormatting.slice(2, -1);
            formatting[bracket.open - 2].value = cleanFormatting(subFormatting, formatting[bracket.open - 2].name);
        }
    });
    for (const item of formatting) {
        if (item.name === 'Comma') {
            if (currentGroup.length > 0) {
                values.push(currentGroup);
                currentGroup = [];
            }
        }
        else {
            currentGroup.push(item);
        }
    }
    if (currentGroup.length > 0) {
        values.push(currentGroup);
    }
    values.forEach((value) => {
        formattingKeys.push(assignFormatting(value));
    });
    return formattingKeys;
}
function assignFormatting(formatting) {
    const isEquals = formatting.map((f, idx) => f.name === 'Equals' ? idx : null).filter(t => t !== null);
    const key = formatting[0]?.name;
    if (isEquals.length === 1)
        formatting = formatting.slice((isEquals[0] + 1));
    let value = interpretFormattingValue(formatting);
    return { key, value };
}
function interpretFormattingValue(formatting) {
    if (formatting.length === 1) {
        return formatting[0].value || true;
    }
    return formatting;
}
class TikzCommand {
    trigger;
    hookNum;
    hooks;
    content;
    addCommand(trigger, hookNum, content) {
        this.trigger = trigger;
        this.hookNum = hookNum;
        this.content = content;
        this.findHooks();
        return this;
    }
    findHooks() {
        const hashtagMap = this.content.map((item, index) => item.name === 'Hashtag' && this.content[index + 1].type === 'number' ? index : null)
            .filter(t => t !== null);
        if (hashtagMap.length !== this.hookNum) {
            throw new Error(`Discrepancy between the number of hooks declared and the number of hooks found in the command hookNum: ${this.hookNum} hashtagMap.length: ${hashtagMap.length}`);
        }
        hashtagMap.sort((a, b) => b - a);
        hashtagMap.forEach(idx => {
            const hashtag = this.content[idx];
            hashtag.type = 'Syntax';
            hashtag.name = 'hook';
            hashtag.value = this.content[idx + 1]?.value;
            this.content.splice(idx + 1, 1);
        });
    }
    getInfo() {
        return { trigger: this.trigger, hooks: this.hookNum };
    }
}
class TikzCommands {
    commands = [];
    constructor() { }
    ;
    addCommand(tokens) {
    }
    addCommandByInterpretation(tokens) {
        console.log('tokens', tokens);
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
        id1 = findParenIndex(id1, undefined, tokens);
        let trigger, hooks, content;
        content = tokens.splice(id3.open + 1, id3.close - id3.open - 1);
        hooks = tokens.splice(id2.open + 1, id2.close - id2.open - 1);
        trigger = tokens.splice(id1.open + 1, id1.close - id1.open - 1);
        if (hooks.length === 1 && hooks[0]?.type === 'number') {
            hooks = hooks[0].value;
        }
        else {
            throw new Error("Invalid hooks: Expected a single numeric value.");
        }
        if (trigger.length === 1 && trigger[0]?.type === 'string') {
            trigger = trigger[0].value;
        }
        else {
            throw new Error("Invalid trigger: Expected a single string value.");
        }
        this.commands.push(new TikzCommand().addCommand(trigger, hooks, content));
    }
    replaceCallWithCommand(trigger, hookNumber, hooks) {
        const content = this.commands.find(command => command.trigger === trigger && hookNumber === command.hookNum)?.content;
        if (!content)
            return null;
        const map = content?.map((item, index) => item.name === 'hook' ? { index, value: item.value } : null).filter(t => t !== null);
        map?.reverse();
        const uniqueValues = new Set();
        for (const { index, value } of map || []) {
            if (!uniqueValues.has(value)) {
                uniqueValues.add(value);
            }
            content.splice(index, 1, ...hooks[value - 1]);
        }
        return content;
    }
    getHooks(tokens, ids) {
        tokens.splice(0, 1);
        const adjustmentValue = ids[0].open;
        ids.forEach(id => {
            id.open -= adjustmentValue;
            id.close -= adjustmentValue;
        });
        ids.reverse();
        const hooks = [];
        ids.forEach(id => {
            const removed = tokens.splice(id.open + 1, id.close - (id.open + 1));
            hooks.push(removed);
        });
        hooks.reverse();
        return hooks;
    }
}
export class BasicTikzToken {
    type;
    name;
    value;
    constructor(value) {
        if (typeof value === 'number') {
            this.type = 'number';
            this.value = value;
            return;
        }
        if (typeof value === 'string') {
            this.type = 'string';
            this.value = value;
            return;
        }
        this.type = value.type.replace(/Bracket/, 'Syntax');
        this.name = value.name;
        this.value = value.value;
    }
    toString() {
        return getOriginalTikzReferences([this]);
    }
}
export class TikzVariable {
}
export class TikzVariables {
    variables = [];
}
function toVariableToken(arr) {
    arr = arr.filter(t => (!t.type.includes('Parentheses')));
    const token = new BasicTikzToken(getOriginalTikzReferences(arr));
    token.type = 'variable';
    return token;
}
export class BasicTikzTokens {
    tokens = [];
    tikzCommands = new TikzCommands();
    constructor(source) {
        source = this.tidyTikzSource(source);
        this.basicTikzTokenify(this.basicArrayify(source));
        this.cleanBasicTikzTokenify();
        this.prepareForTokenize();
    }
    getTokens() {
        return this.tokens;
    }
    tidyTikzSource(source) {
        const remove = "&nbsp;";
        source = source.replaceAll(remove, "");
        let lines = source.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g, "");
    }
    basicArrayify(source) {
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
        return basicArray;
    }
    basicTikzTokenify(basicArray) {
        // Process tokens
        basicArray.forEach(({ type, value }) => {
            if (type === 'string') {
                const tikzCommand = searchTikzComponents(value);
                if (tikzCommand) {
                    this.tokens.push(new BasicTikzToken(tikzCommand));
                }
                else
                    this.tokens.push(new BasicTikzToken(value));
            }
            else if (type === 'number') {
                this.tokens.push(new BasicTikzToken(value));
            }
        });
        idParentheses(this.tokens);
    }
    inferAndInterpretCommands() {
        // Step 1: Extract command indices
        const commandsMap = this.tokens
            .map((t, idx) => (t instanceof BasicTikzToken && t.type === 'Macro' ? idx : null))
            .filter((t) => t !== null);
        commandsMap.forEach((index) => {
            const firstBracketAfterIndex = this.findFirstBracketAfter(index, 'Curly_brackets_open');
            if (!firstBracketAfterIndex)
                return;
            const endOfExpression = findModifiedParenIndex(firstBracketAfterIndex.value, undefined, this.tokens, 0, 1, 'Curly_brackets_open');
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
    findFirstBracketAfter(startIndex, bracketName) {
        const firstBracketAfter = this.tokens
            .slice(startIndex)
            .find((item) => item instanceof BasicTikzToken && item.name === bracketName);
        return firstBracketAfter instanceof BasicTikzToken ? firstBracketAfter : null;
    }
    // Helper to match commands to tokens
    matchCommandToToken(item, index) {
        if (!(item instanceof BasicTikzToken) || item.type !== 'string')
            return null;
        const match = this.tikzCommands.commands.find((c) => c.trigger === item.value);
        return match ? { index, ...match.getInfo() } : null;
    }
    // Helper to process confirmed commands
    processConfirmedCommands(commandsInTokens) {
        const confirmedCommands = [];
        for (const { index, trigger, hooks } of commandsInTokens) {
            if (typeof hooks !== 'number' || hooks <= 0) {
                throw new Error(`Invalid hooks value for command at index ${index}`);
            }
            const firstBracketAfterIndex = this.findFirstBracketAfter(index, 'Curly_brackets_open');
            if (!firstBracketAfterIndex) {
                throw new Error(`Curly_brackets_open not found after index ${index}`);
            }
            const obj = { ids: [] };
            for (let i = 0; i < hooks; i++) {
                const parenPairIndex = findModifiedParenIndex(firstBracketAfterIndex.value, undefined, this.tokens, 0, i, 'Curly_brackets_open');
                if (!parenPairIndex) {
                    throw new Error(`Paren pair not found for hook ${i} at index ${index}`);
                }
                if (obj.ids.length > 0) {
                    const lastId = obj.ids[obj.ids.length - 1];
                    if (lastId.close !== parenPairIndex.open - 1) {
                        throw new Error(`Mismatch between last close (${lastId.close}) and next open (${parenPairIndex.open})`);
                    }
                }
                obj.ids.push(parenPairIndex);
            }
            confirmedCommands.push({ ...obj, index });
        }
        return confirmedCommands;
    }
    // Helper to replace tokens with processed commands
    replaceTokensWithCommands(confirmedCommands) {
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
            const replacement = this.tikzCommands.replaceCallWithCommand(command.trigger, command.hooks, this.tikzCommands.getHooks(removedTokens, command.ids));
            if (!replacement) {
                throw new Error(`Replacement generation failed for command at index ${command.index} with trigger ${command.trigger}.`);
            }
            this.tokens.splice(open, deleteCount, ...replacement);
        });
    }
    cleanBasicTikzTokenify() {
        this.inferAndInterpretCommands();
        const unitIndices = this.tokens
            .map((token, idx) => (token instanceof BasicTikzToken && token.type === 'Unit' ? idx : null))
            .filter((idx) => idx !== null);
        unitIndices.forEach((unitIdx) => {
            const prevToken = this.tokens[unitIdx - 1];
            if (!(prevToken instanceof BasicTikzToken) || !(this.tokens[unitIdx] instanceof BasicTikzToken))
                return;
            if (!prevToken || prevToken.type !== 'number') {
                throw new Error(`Units can only be used in reference to numbers at index ${unitIdx}`);
            }
            prevToken.value = toPoint(prevToken.value, this.tokens[unitIdx].name);
        });
        this.tokens = this.tokens.filter((_, idx) => (!unitIndices.includes(idx)));
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
            .map((token, idx) => (token instanceof BasicTikzToken && token.type === 'Syntax' && /(Dash|Plus)/.test(token.name) ? idx : null))
            .filter((idx) => idx !== null);
        const syntaxSequences = findConsecutiveSequences(mapSyntax);
        const syntaxObjects = syntaxSequences
            .map((sequence) => {
            if (sequence.length === 0)
                return null;
            const start = sequence[0];
            const end = sequence[sequence.length - 1];
            const value = sequence
                .map((index) => {
                const token = this.tokens[index];
                if (!(token instanceof BasicTikzToken))
                    return '';
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
            const token = new BasicTikzToken(command);
            this.tokens.splice(start, end + 1 - start, token);
        });
    }
    prepareForTokenize() {
        const squareBracketIndexes = mapBrackets('Square_brackets_open', this.tokens);
        squareBracketIndexes
            .sort((a, b) => b.open - a.open) // Sort in descending order of 'open'
            .forEach((index) => {
            const formatting = new Formatting(cleanFormatting(this.tokens.slice(index.open + 1, index.close)));
            this.tokens.splice(index.open, index.close + 1 - index.open, formatting);
        });
        //let praneIndexes = mapBrackets('Parentheses_open', this.tokens);
        let coordinateIndexes = mapBrackets('Parentheses_open', this.tokens)
            .filter((item, idx) => this.tokens[item.close + 1] instanceof BasicTikzToken && this.tokens[item.close + 1].value !== 'at');
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
            .sort((a, b) => b.open - a.open)
            .forEach((index) => {
            const axis = new Axis().parseInput(this.tokens.slice(index.open + 1, index.close));
            if (!axis)
                return;
            this.tokens.splice(index.open, index.close + 1 - index.open, axis);
        });
        let variableIndexes = mapBrackets('Parentheses_open', this.tokens)
            .filter((item, idx) => this.tokens[item.close + 1] instanceof BasicTikzToken && this.tokens[item.close + 1].value !== 'at');
        variableIndexes
            .sort((a, b) => b.open - a.open)
            .forEach((index) => {
            console.log(index, this.tokens.slice(index.open, index.close));
            const variable = toVariableToken(this.tokens.slice(index.open + 1, index.close));
            console.log(variable);
            this.tokens.splice(index.open, index.close + 1 - index.open, variable);
        });
    }
}
export class FormatTikzjax {
    source;
    tokens = [];
    tikzCommands = new TikzCommands();
    //midPoint: Axis;
    viewAnchors;
    processedCode = "";
    debugInfo = "";
    constructor(source) {
        if (!source.match(/(usepackage|usetikzlibrary)/)) {
            //const basicTikzTokens=new BasicTikzTokens(source)
            //console.log('basicTikzTokens',basicTikzTokens)
            //this.tokenize(basicTikzTokens.getTokens())
            //console.log('tokenize',this.tokens)
            //this.processedCode += this.toString()
            //this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"
        }
        //else {this.processedCode=source;}
        this.processedCode = this.tidyTikzSource(source);
        this.debugInfo += this.processedCode;
    }
    tidyTikzSource(source) {
        const remove = "&nbsp;";
        source = source.replaceAll(remove, "");
        let lines = source.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g, "");
    }
    tokenize(basicTikzTokens) {
        let endIndex;
        for (let i = 0; i < basicTikzTokens.length; i++) {
            if (basicTikzTokens[i].name === 'Draw') {
                endIndex = basicTikzTokens.slice(i).findIndex(t => t.name === 'Semicolon') + i;
                const segment = basicTikzTokens.slice(i + 1, endIndex);
                i = endIndex;
                this.tokens.push(new Draw('draw').fillCoordinates(segment));
            }
            if (basicTikzTokens[i].name === 'Coordinate') {
                endIndex = basicTikzTokens.slice(i).findIndex(t => t.name === 'Semicolon') + i;
                const segment = basicTikzTokens.slice(i + 1, endIndex);
                console.log(segment);
                i = endIndex;
                this.tokens.push(new Coordinate('coordinate').interpretCoordinate(segment));
            }
        }
        /*
        They're going to be three types stringed syntax number.
         I use them to tokenize. using the ticks commands. Once tokenizer takes commands.
         I move on to actual evaluation.
        */
        let subdefinedTokens = [];
        /*
        for (let i=0;i<basicTikzTokens.length;i++){

        }*/
    }
    getCode() {
        if (typeof this.source === "string" && this.source.match(/(usepackage|usetikzlibrary)/)) {
            return this.processedCode;
        }
        return getPreamble() + this.processedCode + "\n\\end{tikzpicture}\\end{document}";
    }
    applyPostProcessing() {
        const flatAxes = flatten(this.tokens).filter((item) => item instanceof Axis);
        flatAxes.forEach((axis) => {
            axis.addQuadrant(this.viewAnchors.aveMidPoint);
        });
        const flatDraw = flatten(this.tokens, [], Draw).filter((item) => item instanceof Draw);
        flatDraw.forEach((draw) => {
            for (const [index, coor] of draw.coordinates.entries()) {
                if (coor instanceof Coordinate) {
                    coor.formatting?.addSplopAndPosition(draw.coordinates, index);
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
    getMin() { return this.viewAnchors.min; }
    getMax() { return this.viewAnchors.max; }
    findViewAnchors() {
        const axes = flatten(this.tokens).filter((item) => item instanceof Axis);
        let sumOfX = 0, sumOfY = 0;
        let maxX = -Infinity, maxY = -Infinity;
        let minX = Infinity, minY = Infinity;
        this.viewAnchors = {
            max: new Axis(0, 0),
            min: new Axis(0, 0),
            aveMidPoint: new Axis(0, 0)
        };
        axes.forEach((axis) => {
            const { cartesianX, cartesianY } = axis;
            // Update sums for average calculation
            sumOfX += cartesianX;
            sumOfY += cartesianY;
            // Update max and min coordinates
            if (cartesianX > maxX)
                maxX = cartesianX;
            if (cartesianY > maxY)
                maxY = cartesianY;
            if (cartesianX < minX)
                minX = cartesianX;
            if (cartesianY < minY)
                minY = cartesianY;
        });
        const length = axes.length !== 0 ? axes.length : 1;
        // Set the viewAnchors
        this.viewAnchors.aveMidPoint = new Axis(sumOfX / length, sumOfY / length);
        this.viewAnchors.max = new Axis(maxX, maxY);
        this.viewAnchors.min = new Axis(minX, minY);
    }
    findOriginalValue(value) {
        return undefined; /*
        const og = this.tokens.slice().reverse().find(
            (token: Token) =>
                (token instanceof Coordinate) && token.coordinateName === value
        );
        return og instanceof Coordinate ? og.clone() : undefined;*/
    }
    toString() {
        let codeBlockOutput = "";
        console.log('this.tokens', this.tokens);
        //const extremeXY=getExtremeXY(this.tokens);
        this.tokens.forEach((token) => {
            if (token.toString()) {
                codeBlockOutput += token.toString();
            }
            else {
                codeBlockOutput += token;
            }
        });
        return codeBlockOutput;
    }
}
function flatten(data, results = [], stopClass) {
    if (Array.isArray(data)) {
        for (const item of data) {
            flatten(item, results, stopClass);
        }
    }
    else if (typeof data === 'object' && data !== null) {
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
function getExtremeXY(tokens) {
    let maxX = -Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let minY = Infinity;
    tokens.forEach((token) => {
        if (token.type === "coordinate") {
            if (token.X > maxX)
                maxX = token.X;
            if (token.X < minX)
                minX = token.X;
            if (token.Y > maxY)
                maxY = token.Y;
            if (token.Y < minY)
                minY = token.Y;
        }
    });
    return {
        maxX, maxY, minX, minY,
    };
}
const parseNumber = (value) => {
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};
function getPreamble() {
    const ang = "\\tikzset{ang/.style 2 args={fill=black!50,opacity=0.5,text opacity=0.9,draw=orange,<->,angle eccentricity=#1,angle radius=#2cm,text=orange,font=\\large},ang/.default={1.6}{0.5}}";
    const mark = "\\def\\mark#1#2#3{\\path [decoration={markings, mark=at position 0.5 with {\\foreach \\x in {#1} { \\draw[line width=1pt] (\\x,-3pt) -- (\\x,3pt); }}}, postaction=decorate] (#2) -- (#3);}";
    const arr = "\\newcommand{\\arr}[8]{\\coordinate (2) at ($(#2)!#7!(#3)$);\\coordinate (1) at ($(2)!#5mm!90:(#3)$);\\coordinate (3) at ($(2)!#5mm+#4cm!#8:(#3)$);\\draw [line width=1pt,<-] (1)--(3)node [pos=#6] {\\large #1};}";
    const lene = "\\def\\cor#1#2#3#4#5{\\coordinate (#1) at($(#2)!#3!#4:(#5)$);}\\def\\dr#1#2{\\draw [line width=#1,]#2;}\\newcommand{\\len}[6]{\\cor{1}{#2}{#3}{90}{#4}\\cor{3}{#4}{#3}{-90}{#2}\\node (2) at ($(1)!0.5!(3)$) [rotate=#6]{\\large #1};\\dr{#5pt,|<-}{(1)--(2)}\\dr{#5pt,->|}{(2)--(3)}}";
    const spring = "\\newcommand{\\spring}[4]{\\tikzmath{coordinate \\start, \\done;\\start = (#1);\\done = (#2);}\\draw[thick] ($(\\start) + (-1.5,0)$) --++(3,0);\\draw (\\start) --+ (0,-0.25cm);\\draw ($(\\start) + (\\donex+0cm,\\doney+0.25cm)$)--+(0,-0.25);\\draw[decoration={aspect=0.3, segment length=3, amplitude=2mm,coil,},decorate] (\\startx,\\starty-0.25cm) --($(\\start) + (\\donex,\\doney+0.25cm)$)node[midway,right=0.25cm,black]{#4};\\node[fill=yellow!60,draw,text=black,anchor= north] at ($(\\start) + (\\donex,\\doney)$){#3};}";
    const tree = "\\newcommand{\\lenu}[3]{\\tikzset{level distance=20mm,level #1/.style={sibling distance=#2mm, nodes={fill=red!#3,circle,inner sep=1pt,draw=none,text=black,}}}}";
    const table = "\\tikzset{ table/.style={matrix of nodes,row sep=-\\pgflinewidth,column sep=-\\pgflinewidth,nodes={rectangle,draw=black,align=center},minimum height=1.5em,text depth=0.5ex,text height=2ex,nodes in empty cells,every even row/.style={nodes={fill=gray!60,text=black,}},column 1/.style={nodes={text width=5em,font=\\bfseries}},row 1/.style={nodes={font=\\bfseries}}}}";
    const coor = "\\def\\coor#1#2#3#4{\\coordinate [label={[#4]:\\Large #3}] (#2) at ($(#1)$);}";
    const mass = `\\def\\mass#1#2{\\node[fill=yellow!60,draw,text=black,anchor= north] at (#1){#2};}`;
    const massSet = "\\tikzset{ mass/.style={fill=yellow!60,draw,text=black}}";
    const dvector = "\\newcommand{\\dvector}[2]{\\coordinate (temp1) at ($(0,0 -| #1)$);\\coordinate (temp2) at ($(0,0 |- #1)$);\\draw [line width=0.7pt,#2] (#1)--(temp1)(#1)--(temp2);}";
    const picAng = "\\newcommand{\\ang}[5]{\\coordinate (ang1) at (#1); \\coordinate (ang2) at (#2); \\coordinate (ang3) at (#3); \\pgfmathanglebetweenpoints{\\pgfpointanchor{ang3}{center}}{\\pgfpointanchor{ang2}{center}}\\let\\angCB\\pgfmathresult\\pgfmathanglebetweenpoints{\\pgfpointanchor{ang2}{center}}{\\pgfpointanchor{ang1}{center}}\\let\\angAB\\pgfmathresult\\pgfmathparse{\\angCB - \\angAB}\\ifdim\\pgfmathresult pt<0pt\\pgfmathparse{\\pgfmathresult + 360}\\fi\\ifdim\\pgfmathresult pt>180pt\\pgfmathparse{360 - \\pgfmathresult}\\fi\\let\\angB\\pgfmathresult\\pgfmathsetmacro{\\angleCheck}{abs(\\angB - 90)}\\ifthenelse{\\lengthtest{\\angleCheck pt < 0.1pt}}{\\pic [ang#5,\"{${#4}\$}\",]{right angle=ang1--ang2--ang3};}{\\pic [ang#5,\"{${#4}\$}\",]{angle=ang1--ang2--ang3};}}";
    const preamble = "\\usepackage{pgfplots,ifthen}\\usetikzlibrary{arrows.meta,angles,quotes,positioning, calc, intersections,decorations.markings,math,spy,matrix,patterns,snakes,decorations.pathreplacing,decorations.pathmorphing,patterns,shadows,shapes.symbols}";
    return preamble + ang + mark + arr + lene + spring + tree + table + coor + dvector + picAng + massSet + "\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxnQkFBZ0I7QUFFaEIsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzdHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRW5GLFNBQVMsMkJBQTJCLENBQUMsS0FBWTtJQUM3QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUNELFNBQVMseUJBQXlCLENBQUMsTUFBYTtJQUM1QyxJQUFJLE1BQU0sR0FBQyxFQUFFLENBQUE7SUFDYixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ25CLE1BQU0sU0FBUyxHQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQzdELElBQUcsU0FBUyxJQUFFLFNBQVMsQ0FBQyxV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aUVBQWlFLENBQUE7QUFDckosQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vLy8gQHRzLW5vY2hlY2tcblxuaW1wb3J0IHsgZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzIH0gZnJvbSBcInNyYy9tYXRoUGFyc2VyL21hdGhFbmdpbmVcIjtcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIENvb3JkaW5hdGUsIERyYXcsIEZvcm1hdHRpbmcsIHJlZ0V4cCwgVG9rZW4sIHRvUG9pbnQgfSBmcm9tIFwiLi4vdGlrempheFwiO1xuaW1wb3J0IHsgZmluZE1vZGlmaWVkUGFyZW5JbmRleCwgZmluZFBhcmVuSW5kZXgsIGlkUGFyZW50aGVzZXMsIG1hcEJyYWNrZXRzIH0gZnJvbSBcInNyYy91dGlscy90b2tlblV0ZW5zaWxzXCI7XG5pbXBvcnQgeyBnZXRBbGxUaWt6UmVmZXJlbmNlcywgc2VhcmNoVGlrekNvbXBvbmVudHMgfSBmcm9tIFwic3JjL3V0aWxzL2RhdGFNYW5hZ2VyXCI7XG5cbmZ1bmN0aW9uIGxhYmVsRnJlZUZvcm1UZXh0U2VwYXJhdGlvbihsYWJlbDogYW55W10pe1xuICAgIGNvbnN0IGNvbG9uSW5kZXg9bGFiZWwuZmluZEluZGV4KHQ9PnQubmFtZT09PSdDb2xvbicpXG4gICAgIGxhYmVsPWxhYmVsLnNwbGljZShjb2xvbkluZGV4LGxhYmVsLmxlbmd0aC1jb2xvbkluZGV4KVxuICAgIHJldHVybiBsYWJlbC5zcGxpY2UoMSlcbn1cbmZ1bmN0aW9uIGdldE9yaWdpbmFsVGlrelJlZmVyZW5jZXModG9rZW5zOiBhbnlbXSl7XG4gICAgbGV0IHN0cmluZz0nJ1xuICAgIHRva2Vucy5mb3JFYWNoKHRva2VuID0+IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50PXNlYXJjaFRpa3pDb21wb25lbnRzKHRva2VuLm5hbWV8fHRva2VuLnZhbHVlKVxuICAgICAgICBpZihjb21wb25lbnQmJmNvbXBvbmVudC5yZWZlcmVuY2VzPy5sZW5ndGg+MCl7XG4gICAgICAgICAgICBzdHJpbmcrPWNvbXBvbmVudC5yZWZlcmVuY2VzWzBdXG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgc3RyaW5nKz10b2tlbi52YWx1ZVxuICAgIH0pO1xuICAgIHJldHVybiBzdHJpbmdcbn1cblxuZnVuY3Rpb24gY2xlYW5Gb3JtYXR0aW5nKGZvcm1hdHRpbmc6IGFueVtdLHN1YlR5cGU/OiBzdHJpbmcpOiBhbnlbXSB7XG4gICAgY29uc3QgdmFsdWVzOiBhbnlbXVtdID0gW107XG4gICAgbGV0IGN1cnJlbnRHcm91cDogYW55W10gPSBbXTtcbiAgICBjb25zdCBmb3JtYXR0aW5nS2V5cz1bXVxuXG4gICAgaWYoc3ViVHlwZT09PSdMYWJlbCcpe1xuICAgICAgICBjb25zdCBsYWJlbD1sYWJlbEZyZWVGb3JtVGV4dFNlcGFyYXRpb24oZm9ybWF0dGluZylcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaCh7a2V5OiAnZnJlZUZvcm1UZXh0Jyx2YWx1ZTogZ2V0T3JpZ2luYWxUaWt6UmVmZXJlbmNlcyhsYWJlbCl9KVxuICAgIH1cbiAgICBcblxuICAgIGNvbnN0IGJyYWNrZXRNYXA9bWFwQnJhY2tldHMoJ0N1cmx5X2JyYWNrZXRzX29wZW4nLGZvcm1hdHRpbmcpO1xuICAgIGJyYWNrZXRNYXAucmV2ZXJzZSgpXG4gICAgYnJhY2tldE1hcC5mb3JFYWNoKChicmFja2V0OiB7IG9wZW46IG51bWJlcjsgY2xvc2U6IG51bWJlcjsgfSkgPT4ge1xuICAgICAgICBpZihmb3JtYXR0aW5nW2JyYWNrZXQub3Blbi0xXS5uYW1lPT09J0VxdWFscycpe1xuICAgICAgICAgICAgbGV0IHN1YkZvcm1hdHRpbmc9Zm9ybWF0dGluZy5zcGxpY2UoYnJhY2tldC5vcGVuLTEsYnJhY2tldC5jbG9zZS0oYnJhY2tldC5vcGVuLTIpKVxuICAgICAgICAgICAgc3ViRm9ybWF0dGluZz1zdWJGb3JtYXR0aW5nLnNsaWNlKDIsLTEpXG4gICAgICAgICAgICBmb3JtYXR0aW5nW2JyYWNrZXQub3Blbi0yXS52YWx1ZT1jbGVhbkZvcm1hdHRpbmcoc3ViRm9ybWF0dGluZyxmb3JtYXR0aW5nW2JyYWNrZXQub3Blbi0yXS5uYW1lKVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZm9ybWF0dGluZykge1xuICAgICAgICBpZiAoaXRlbS5uYW1lID09PSAnQ29tbWEnKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50R3JvdXApO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRHcm91cCA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY3VycmVudEdyb3VwLnB1c2goaXRlbSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhbHVlcy5wdXNoKGN1cnJlbnRHcm91cCk7XG4gICAgfVxuXG4gICAgXG4gICAgdmFsdWVzLmZvckVhY2goKHZhbHVlKSA9PiB7XG4gICAgICAgIGZvcm1hdHRpbmdLZXlzLnB1c2goYXNzaWduRm9ybWF0dGluZyh2YWx1ZSkpO1xuICAgIH0pO1xuICAgIHJldHVybiBmb3JtYXR0aW5nS2V5cyBcbn1cblxuZnVuY3Rpb24gYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nOiBhbnlbXSk6IGFueXtcblxuICAgIGNvbnN0IGlzRXF1YWxzPWZvcm1hdHRpbmcubWFwKChmLGlkeCk9PmYubmFtZT09PSdFcXVhbHMnP2lkeDpudWxsKS5maWx0ZXIodD0+dCE9PW51bGwpO1xuICAgIGNvbnN0IGtleT1mb3JtYXR0aW5nWzBdPy5uYW1lXG5cbiAgICBpZihpc0VxdWFscy5sZW5ndGg9PT0xKVxuICAgICAgICBmb3JtYXR0aW5nPWZvcm1hdHRpbmcuc2xpY2UoKGlzRXF1YWxzWzBdKzEpKVxuXG4gICAgbGV0IHZhbHVlPWludGVycHJldEZvcm1hdHRpbmdWYWx1ZShmb3JtYXR0aW5nKTtcbiAgICByZXR1cm4ge2tleSx2YWx1ZX1cbn1cblxuXG5mdW5jdGlvbiBpbnRlcnByZXRGb3JtYXR0aW5nVmFsdWUoZm9ybWF0dGluZzogc3RyaW5nIHwgYW55W10pe1xuICAgIGlmIChmb3JtYXR0aW5nLmxlbmd0aD09PTEpe1xuICAgICAgICByZXR1cm4gZm9ybWF0dGluZ1swXS52YWx1ZXx8dHJ1ZVxuICAgIH1cbiAgICByZXR1cm4gZm9ybWF0dGluZ1xufVxuXG5jbGFzcyBUaWt6Q29tbWFuZHtcbiAgICB0cmlnZ2VyOiBzdHJpbmc7XG4gICAgaG9va051bTogbnVtYmVyO1xuICAgIGhvb2tzOiBhbnk7XG4gICAgY29udGVudDogQmFzaWNUaWt6VG9rZW5bXVxuICAgIGFkZENvbW1hbmQodHJpZ2dlcjogc3RyaW5nLCBob29rTnVtOiBudW1iZXIsIGNvbnRlbnQ6IGFueVtdKXtcbiAgICAgICAgdGhpcy50cmlnZ2VyPXRyaWdnZXI7XG4gICAgICAgIHRoaXMuaG9va051bT1ob29rTnVtO1xuICAgICAgICB0aGlzLmNvbnRlbnQ9Y29udGVudDtcbiAgICAgICAgdGhpcy5maW5kSG9va3MoKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH1cbiAgICBmaW5kSG9va3MoKXtcbiAgICAgICAgY29uc3QgaGFzaHRhZ01hcD10aGlzLmNvbnRlbnQubWFwKChpdGVtLGluZGV4KT0+aXRlbS5uYW1lPT09J0hhc2h0YWcnJiZ0aGlzLmNvbnRlbnRbaW5kZXgrMV0udHlwZT09PSdudW1iZXInP2luZGV4Om51bGwpXG4gICAgICAgIC5maWx0ZXIodD0+dCE9PW51bGwpXG4gICAgICAgIGlmKGhhc2h0YWdNYXAubGVuZ3RoIT09dGhpcy5ob29rTnVtKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRGlzY3JlcGFuY3kgYmV0d2VlbiB0aGUgbnVtYmVyIG9mIGhvb2tzIGRlY2xhcmVkIGFuZCB0aGUgbnVtYmVyIG9mIGhvb2tzIGZvdW5kIGluIHRoZSBjb21tYW5kIGhvb2tOdW06ICR7dGhpcy5ob29rTnVtfSBoYXNodGFnTWFwLmxlbmd0aDogJHtoYXNodGFnTWFwLmxlbmd0aH1gKTtcbiAgICAgICAgfVxuICAgICAgICBoYXNodGFnTWFwLnNvcnQoKGEsYik9PmItYSlcbiAgICAgICAgaGFzaHRhZ01hcC5mb3JFYWNoKGlkeCA9PiB7XG4gICAgICAgICAgICBjb25zdCBoYXNodGFnPXRoaXMuY29udGVudFtpZHhdO1xuICAgICAgICAgICAgaGFzaHRhZy50eXBlPSdTeW50YXgnXG4gICAgICAgICAgICBoYXNodGFnLm5hbWU9J2hvb2snXG4gICAgICAgICAgICBoYXNodGFnLnZhbHVlPXRoaXMuY29udGVudFtpZHgrMV0/LnZhbHVlO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50LnNwbGljZShpZHgrMSwxKVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZ2V0SW5mbygpe1xuICAgICAgICByZXR1cm4ge3RyaWdnZXI6IHRoaXMudHJpZ2dlcixob29rczogdGhpcy5ob29rTnVtfVxuICAgIH1cbn1cblxuXG5jbGFzcyBUaWt6Q29tbWFuZHN7XG4gICAgY29tbWFuZHM6IFRpa3pDb21tYW5kW109W107XG4gICAgY29uc3RydWN0b3IoKXt9O1xuICAgIGFkZENvbW1hbmQodG9rZW5zOiBhbnkpe1xuICAgICAgICBcbiAgICB9XG4gICAgYWRkQ29tbWFuZEJ5SW50ZXJwcmV0YXRpb24odG9rZW5zOiBhbnlbXSkge1xuICAgICAgICBjb25zb2xlLmxvZygndG9rZW5zJyx0b2tlbnMpXG4gICAgICAgIGNvbnN0IGlkMVRva2VuID0gdG9rZW5zLmZpbmQoKGl0ZW0pID0+IGl0ZW0ubmFtZSA9PT0gJ0N1cmx5X2JyYWNrZXRzX29wZW4nKTtcbiAgICAgICAgaWYgKCFpZDFUb2tlbikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOiAnQ3VybHlfYnJhY2tldHNfb3Blbicgbm90IGZvdW5kIGluIHRva2Vucy5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGlkMSA9IGlkMVRva2VuLnZhbHVlO1xuICAgICAgICBjb25zdCBpZDIgPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KGlkMSwgdW5kZWZpbmVkLCB0b2tlbnMsIDAsIDEpO1xuICAgICAgICBjb25zdCBpZDMgPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KGlkMSwgdW5kZWZpbmVkLCB0b2tlbnMsIDAsIDEsICdDdXJseV9icmFja2V0c19vcGVuJyk7XG4gICAgXG4gICAgICAgIGlmICghaWQyIHx8ICFpZDMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjogVW5hYmxlIHRvIGZpbmQgbWF0Y2hpbmcgYnJhY2tldHMuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlkMT1maW5kUGFyZW5JbmRleChpZDEsIHVuZGVmaW5lZCwgdG9rZW5zKVxuICAgICAgICBsZXQgdHJpZ2dlciwgaG9va3MsIGNvbnRlbnQ7XG4gICAgICAgIGNvbnRlbnQgPSB0b2tlbnMuc3BsaWNlKGlkMy5vcGVuICsgMSwgaWQzLmNsb3NlIC0gaWQzLm9wZW4gLSAxKTtcbiAgICAgICAgaG9va3MgPSB0b2tlbnMuc3BsaWNlKGlkMi5vcGVuICsgMSwgaWQyLmNsb3NlIC0gaWQyLm9wZW4gLSAxKTtcbiAgICAgICAgdHJpZ2dlciA9IHRva2Vucy5zcGxpY2UoaWQxLm9wZW4rMSwgaWQxLmNsb3NlIC0gaWQxLm9wZW4gLSAxKTtcblxuICAgICAgICBpZiAoaG9va3MubGVuZ3RoID09PSAxICYmIGhvb2tzWzBdPy50eXBlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgaG9va3MgPSBob29rc1swXS52YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgaG9va3M6IEV4cGVjdGVkIGEgc2luZ2xlIG51bWVyaWMgdmFsdWUuXCIpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAodHJpZ2dlci5sZW5ndGggPT09IDEgJiYgdHJpZ2dlclswXT8udHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRyaWdnZXIgPSB0cmlnZ2VyWzBdLnZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCB0cmlnZ2VyOiBFeHBlY3RlZCBhIHNpbmdsZSBzdHJpbmcgdmFsdWUuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY29tbWFuZHMucHVzaChuZXcgVGlrekNvbW1hbmQoKS5hZGRDb21tYW5kKHRyaWdnZXIsIGhvb2tzLCBjb250ZW50KSlcbiAgICB9XG5cbiAgICByZXBsYWNlQ2FsbFdpdGhDb21tYW5kKHRyaWdnZXI6IHN0cmluZyxob29rTnVtYmVyOiBudW1iZXIsaG9va3M6IGFueVtdKXtcbiAgICAgICAgY29uc3QgY29udGVudCA9IHRoaXMuY29tbWFuZHMuZmluZChjb21tYW5kID0+IFxuICAgICAgICAgICAgY29tbWFuZC50cmlnZ2VyID09PSB0cmlnZ2VyICYmIGhvb2tOdW1iZXIgPT09IGNvbW1hbmQuaG9va051bVxuICAgICAgICApPy5jb250ZW50O1xuICAgICAgICBpZighY29udGVudClyZXR1cm4gbnVsbDtcbiAgICAgICAgY29uc3QgbWFwID0gY29udGVudD8ubWFwKChpdGVtLCBpbmRleCkgPT4gXG4gICAgICAgICAgICBpdGVtLm5hbWUgPT09ICdob29rJyA/IHsgaW5kZXgsIHZhbHVlOiBpdGVtLnZhbHVlIH0gOiBudWxsXG4gICAgICAgICkuZmlsdGVyKHQgPT4gdCAhPT0gbnVsbCk7XG4gICAgICAgIG1hcD8ucmV2ZXJzZSgpO1xuXG4gICAgICAgIGNvbnN0IHVuaXF1ZVZhbHVlcyA9IG5ldyBTZXQoKTtcbiAgICAgICAgZm9yIChjb25zdCB7IGluZGV4LCB2YWx1ZSB9IG9mIG1hcCB8fCBbXSkge1xuICAgICAgICAgICAgaWYgKCF1bmlxdWVWYWx1ZXMuaGFzKHZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHVuaXF1ZVZhbHVlcy5hZGQodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGVudC5zcGxpY2UoaW5kZXgsIDEsIC4uLmhvb2tzW3ZhbHVlLTFdKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29udGVudFxuICAgIH1cblxuICAgIGdldEhvb2tzKHRva2VuczogYW55W10saWRzOiBhbnlbXSl7XG4gICAgICAgIHRva2Vucy5zcGxpY2UoMCwxKVxuICAgICAgICBjb25zdCBhZGp1c3RtZW50VmFsdWU9aWRzWzBdLm9wZW5cbiAgICAgICAgaWRzLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgaWQub3Blbi09YWRqdXN0bWVudFZhbHVlO1xuICAgICAgICAgICAgaWQuY2xvc2UtPWFkanVzdG1lbnRWYWx1ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlkcy5yZXZlcnNlKCk7XG4gICAgICAgIGNvbnN0IGhvb2tzOiBhbnlbXVtdPVtdXG4gICAgICAgIGlkcy5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQ9dG9rZW5zLnNwbGljZShpZC5vcGVuKzEsaWQuY2xvc2UtKGlkLm9wZW4rMSkpXG4gICAgICAgICAgICBob29rcy5wdXNoKHJlbW92ZWQpXG4gICAgICAgIH0pO1xuICAgICAgICBob29rcy5yZXZlcnNlKCk7XG4gICAgICAgIHJldHVybiBob29rc1xuICAgIH1cbiAgICBcbn1cblxuZXhwb3J0IGNsYXNzIEJhc2ljVGlrelRva2Vue1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmdcbiAgICB2YWx1ZTogYW55XG4gICAgY29uc3RydWN0b3IodmFsdWU6IGFueSl7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWU9PT0nbnVtYmVyJyl7XG4gICAgICAgICAgICB0aGlzLnR5cGU9J251bWJlcidcbiAgICAgICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XG4gICAgICAgICAgICByZXR1cm4gXG4gICAgICAgIH1cbiAgICAgICAgaWYodHlwZW9mIHZhbHVlPT09J3N0cmluZycpe1xuICAgICAgICAgICAgdGhpcy50eXBlPSdzdHJpbmcnXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMudHlwZT12YWx1ZS50eXBlLnJlcGxhY2UoL0JyYWNrZXQvLCdTeW50YXgnKVxuICAgICAgICB0aGlzLm5hbWU9dmFsdWUubmFtZVxuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlLnZhbHVlXG4gICAgICAgIFxuICAgIH1cbiAgICB0b1N0cmluZygpe1xuICAgICAgICByZXR1cm4gZ2V0T3JpZ2luYWxUaWt6UmVmZXJlbmNlcyhbdGhpc10pXG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgVGlrelZhcmlhYmxle1xuICAgIC8vdHlwZTogXG5cbn1cbmV4cG9ydCBjbGFzcyBUaWt6VmFyaWFibGVze1xuICAgIHZhcmlhYmxlczogW109W11cblxufVxuXG5mdW5jdGlvbiB0b1ZhcmlhYmxlVG9rZW4oYXJyOiBhbnlbXSkge1xuICAgIGFycj1hcnIuZmlsdGVyKHQ9PighdC50eXBlLmluY2x1ZGVzKCdQYXJlbnRoZXNlcycpKSlcbiAgICBjb25zdCB0b2tlbj1uZXcgQmFzaWNUaWt6VG9rZW4oZ2V0T3JpZ2luYWxUaWt6UmVmZXJlbmNlcyhhcnIpKVxuICAgIHRva2VuLnR5cGU9J3ZhcmlhYmxlJ1xuICAgIHJldHVybiB0b2tlblxufVxuXG5pbnRlcmZhY2UgUGFyZW5QYWlye1xuICAgIG9wZW46bnVtYmVyLFxuICAgIGNsb3NlOiBudW1iZXJcbn1cblxuZXhwb3J0IGNsYXNzIEJhc2ljVGlrelRva2Vuc3tcbiAgICBwcml2YXRlIHRva2VuczogQXJyYXk8QmFzaWNUaWt6VG9rZW58Rm9ybWF0dGluZ3xBeGlzPiA9IFtdXG4gICAgcHJpdmF0ZSB0aWt6Q29tbWFuZHM6IFRpa3pDb21tYW5kcz1uZXcgVGlrekNvbW1hbmRzKCk7XG5cbiAgICBjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZyl7XG4gICAgICAgIHNvdXJjZSA9IHRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcbiAgICAgICAgdGhpcy5iYXNpY1Rpa3pUb2tlbmlmeSh0aGlzLmJhc2ljQXJyYXlpZnkoc291cmNlKSlcbiAgICAgICAgdGhpcy5jbGVhbkJhc2ljVGlrelRva2VuaWZ5KClcbiAgICAgICAgXG4gICAgICAgIHRoaXMucHJlcGFyZUZvclRva2VuaXplKClcbiAgICB9XG4gICAgZ2V0VG9rZW5zKCl7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2Vuc1xuICAgIH1cblxuICAgIHByaXZhdGUgdGlkeVRpa3pTb3VyY2Uoc291cmNlOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcbiAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSBzb3VyY2Uuc3BsaXQoXCJcXG5cIik7XG4gICAgICAgIGxpbmVzID0gbGluZXMubWFwKGxpbmUgPT4gbGluZS50cmltKCkpO1xuICAgICAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJykucmVwbGFjZSgvKD88PVteXFx3XSkgfCAoPz1bXlxcd10pL2csIFwiXCIpLnJlcGxhY2UoLyg/PCFcXFxcKSUuKiQvZ20sIFwiXCIpLnJlcGxhY2UoL1xcbi9nLFwiXCIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYmFzaWNBcnJheWlmeShzb3VyY2U6IHN0cmluZyl7XG4gICAgICAgIGNvbnN0IGJhc2ljQXJyYXkgPSBbXTtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JzUmVnZXggPSBuZXcgUmVnRXhwKCdeJyArIGFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsVGlrelJlZmVyZW5jZXMoKSkpO1xuICAgICAgICBsZXQgaSA9IDA7XG4gICAgICAgICBcbiAgICAgICAgd2hpbGUgKGkgPCBzb3VyY2UubGVuZ3RoKSB7XG4gICAgICAgICAgICBjb25zdCBzdWJTb3VyY2UgPSBzb3VyY2Uuc2xpY2UoaSk7XG4gICAgICAgICAgICBsZXQgbWF0Y2g7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gTWF0Y2ggVGlrWiBvcGVyYXRvcnNcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKG9wZXJhdG9yc1JlZ2V4KTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiBtYXRjaFswXSB9KTtcbiAgICAgICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAvLyBNYXRjaCBudW1iZXJzXG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlstMC05Ll0rLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaCh7IHR5cGU6ICdudW1iZXInLCB2YWx1ZTogcGFyc2VOdW1iZXIobWF0Y2hbMF0pIH0pO1xuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2goL15bYS16QS1aXFxcXF0rLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaCh7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogbWF0Y2hbMF0gfSk7XG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgXG4gICAgICAgICAgICAvLyBJbmNyZW1lbnQgaW5kZXggaWYgbm8gbWF0Y2ggZm91bmRcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYmFzaWNBcnJheVxuICAgIH1cbiAgICBwcml2YXRlIGJhc2ljVGlrelRva2VuaWZ5KGJhc2ljQXJyYXk6IGFueVtdKXtcbiAgICAgICAgIC8vIFByb2Nlc3MgdG9rZW5zXG4gICAgICAgIGJhc2ljQXJyYXkuZm9yRWFjaCgoeyB0eXBlLCB2YWx1ZSB9KSA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0aWt6Q29tbWFuZCA9IHNlYXJjaFRpa3pDb21wb25lbnRzKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAodGlrekNvbW1hbmQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odGlrekNvbW1hbmQpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljVGlrelRva2VuKHZhbHVlKSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odmFsdWUpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXG4gICAgfVxuICAgIHByaXZhdGUgaW5mZXJBbmRJbnRlcnByZXRDb21tYW5kcygpIHtcbiAgICAgICAgLy8gU3RlcCAxOiBFeHRyYWN0IGNvbW1hbmQgaW5kaWNlc1xuICAgICAgICBjb25zdCBjb21tYW5kc01hcCA9IHRoaXMudG9rZW5zXG4gICAgICAgICAgICAubWFwKCh0LCBpZHgpID0+ICh0IGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgdC50eXBlID09PSAnTWFjcm8nID8gaWR4IDogbnVsbCkpXG4gICAgICAgICAgICAuZmlsdGVyKCh0KSA9PiB0ICE9PSBudWxsKTtcbiAgICAgICAgY29tbWFuZHNNYXAuZm9yRWFjaCgoaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0QnJhY2tldEFmdGVySW5kZXggPSB0aGlzLmZpbmRGaXJzdEJyYWNrZXRBZnRlcihpbmRleCwgJ0N1cmx5X2JyYWNrZXRzX29wZW4nKTtcbiAgICAgICAgICAgIGlmICghZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCkgcmV0dXJuO1xuICAgIFxuICAgICAgICAgICAgY29uc3QgZW5kT2ZFeHByZXNzaW9uID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChcbiAgICAgICAgICAgICAgICBmaXJzdEJyYWNrZXRBZnRlckluZGV4LnZhbHVlLFxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB0aGlzLnRva2VucyxcbiAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgIDEsXG4gICAgICAgICAgICAgICAgJ0N1cmx5X2JyYWNrZXRzX29wZW4nXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFlbmRPZkV4cHJlc3Npb24pIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cHJlc3Npb24gZW5kIG5vdCBmb3VuZCBmb3IgY29tbWFuZCBhdCBpbmRleCAke2luZGV4fWApO1xuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgY29uc3QgY29tbWFuZFRva2VucyA9IHRoaXMudG9rZW5zLnNwbGljZShpbmRleCwgTWF0aC5hYnMoaW5kZXggLSAoZW5kT2ZFeHByZXNzaW9uLmNsb3NlICsgMSkpKTtcbiAgICAgICAgICAgIHRoaXMudGlrekNvbW1hbmRzLmFkZENvbW1hbmRCeUludGVycHJldGF0aW9uKGNvbW1hbmRUb2tlbnMpO1xuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgLy8gU3RlcCAzOiBNYXRjaCBjb21tYW5kcyB0byB0b2tlbnNcbiAgICAgICAgY29uc3QgY29tbWFuZHNJblRva2VucyA9IHRoaXMudG9rZW5zXG4gICAgICAgICAgICAubWFwKChpdGVtLCBpbmRleCkgPT4gdGhpcy5tYXRjaENvbW1hbmRUb1Rva2VuKGl0ZW0sIGluZGV4KSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpID0+IHQgIT09IG51bGwpO1xuICAgIFxuICAgICAgICAvLyBTdGVwIDQ6IFByb2Nlc3MgY29uZmlybWVkIGNvbW1hbmRzXG4gICAgICAgIGNvbnN0IGNvbmZpcm1lZENvbW1hbmRzID0gdGhpcy5wcm9jZXNzQ29uZmlybWVkQ29tbWFuZHMoY29tbWFuZHNJblRva2Vucyk7XG4gICAgXG4gICAgICAgIC8vIFN0ZXAgNTogUmVwbGFjZSB0b2tlbnMgd2l0aCBwcm9jZXNzZWQgY29tbWFuZHNcbiAgICAgICAgdGhpcy5yZXBsYWNlVG9rZW5zV2l0aENvbW1hbmRzKGNvbmZpcm1lZENvbW1hbmRzKTtcbiAgICB9XG4gICAgXG4gICAgLy8gSGVscGVyIHRvIGZpbmQgdGhlIGZpcnN0IG1hdGNoaW5nIGJyYWNrZXQgYWZ0ZXIgYSBnaXZlbiBpbmRleFxuICAgIHByaXZhdGUgZmluZEZpcnN0QnJhY2tldEFmdGVyKHN0YXJ0SW5kZXg6IG51bWJlciwgYnJhY2tldE5hbWU6IHN0cmluZyk6IEJhc2ljVGlrelRva2VuIHwgbnVsbCB7XG4gICAgICAgIGNvbnN0IGZpcnN0QnJhY2tldEFmdGVyPXRoaXMudG9rZW5zXG4gICAgICAgICAgICAuc2xpY2Uoc3RhcnRJbmRleClcbiAgICAgICAgICAgIC5maW5kKChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgaXRlbS5uYW1lID09PSBicmFja2V0TmFtZSlcbiAgICAgICAgcmV0dXJuIGZpcnN0QnJhY2tldEFmdGVyIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4/Zmlyc3RCcmFja2V0QWZ0ZXI6bnVsbDtcbiAgICB9XG4gICAgXG4gICAgLy8gSGVscGVyIHRvIG1hdGNoIGNvbW1hbmRzIHRvIHRva2Vuc1xuICAgIHByaXZhdGUgbWF0Y2hDb21tYW5kVG9Ub2tlbihpdGVtOiBhbnksIGluZGV4OiBudW1iZXIpOiBhbnkgfCBudWxsIHtcbiAgICAgICAgaWYgKCEoaXRlbSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKSB8fCBpdGVtLnR5cGUgIT09ICdzdHJpbmcnKSByZXR1cm4gbnVsbDtcbiAgICBcbiAgICAgICAgY29uc3QgbWF0Y2ggPSB0aGlzLnRpa3pDb21tYW5kcy5jb21tYW5kcy5maW5kKChjKSA9PiBjLnRyaWdnZXIgPT09IGl0ZW0udmFsdWUpO1xuICAgICAgICByZXR1cm4gbWF0Y2ggPyB7IGluZGV4LCAuLi5tYXRjaC5nZXRJbmZvKCkgfSA6IG51bGw7XG4gICAgfVxuICAgIFxuICAgIC8vIEhlbHBlciB0byBwcm9jZXNzIGNvbmZpcm1lZCBjb21tYW5kc1xuICAgIHByaXZhdGUgcHJvY2Vzc0NvbmZpcm1lZENvbW1hbmRzKGNvbW1hbmRzSW5Ub2tlbnM6IGFueVtdKTogeyBpZHM6IFBhcmVuUGFpcltdOyBpbmRleDogbnVtYmVyIH1bXSB7XG4gICAgICAgIGNvbnN0IGNvbmZpcm1lZENvbW1hbmRzID0gW107XG4gICAgXG4gICAgICAgIGZvciAoY29uc3QgeyBpbmRleCwgdHJpZ2dlciwgaG9va3MgfSBvZiBjb21tYW5kc0luVG9rZW5zKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGhvb2tzICE9PSAnbnVtYmVyJyB8fCBob29rcyA8PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGhvb2tzIHZhbHVlIGZvciBjb21tYW5kIGF0IGluZGV4ICR7aW5kZXh9YCk7XG4gICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICBjb25zdCBmaXJzdEJyYWNrZXRBZnRlckluZGV4ID0gdGhpcy5maW5kRmlyc3RCcmFja2V0QWZ0ZXIoaW5kZXgsICdDdXJseV9icmFja2V0c19vcGVuJyk7XG4gICAgICAgICAgICBpZiAoIWZpcnN0QnJhY2tldEFmdGVySW5kZXgpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEN1cmx5X2JyYWNrZXRzX29wZW4gbm90IGZvdW5kIGFmdGVyIGluZGV4ICR7aW5kZXh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IG9iajogeyBpZHM6IFBhcmVuUGFpcltdIH0gPSB7IGlkczogW10gfTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG9va3M7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVuUGFpckluZGV4ID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2VucyxcbiAgICAgICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgICAgICAgJ0N1cmx5X2JyYWNrZXRzX29wZW4nXG4gICAgICAgICAgICAgICAgKTtcbiAgICBcbiAgICAgICAgICAgICAgICBpZiAoIXBhcmVuUGFpckluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgUGFyZW4gcGFpciBub3QgZm91bmQgZm9yIGhvb2sgJHtpfSBhdCBpbmRleCAke2luZGV4fWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgICAgICBpZiAob2JqLmlkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhc3RJZCA9IG9iai5pZHNbb2JqLmlkcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxhc3RJZC5jbG9zZSAhPT0gcGFyZW5QYWlySW5kZXgub3BlbiAtIDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgTWlzbWF0Y2ggYmV0d2VlbiBsYXN0IGNsb3NlICgke2xhc3RJZC5jbG9zZX0pIGFuZCBuZXh0IG9wZW4gKCR7cGFyZW5QYWlySW5kZXgub3Blbn0pYFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBvYmouaWRzLnB1c2gocGFyZW5QYWlySW5kZXgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uZmlybWVkQ29tbWFuZHMucHVzaCh7IC4uLm9iaiwgaW5kZXggfSk7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgcmV0dXJuIGNvbmZpcm1lZENvbW1hbmRzO1xuICAgIH1cbiAgICBcbiAgICAvLyBIZWxwZXIgdG8gcmVwbGFjZSB0b2tlbnMgd2l0aCBwcm9jZXNzZWQgY29tbWFuZHNcbiAgICBwcml2YXRlIHJlcGxhY2VUb2tlbnNXaXRoQ29tbWFuZHMoY29uZmlybWVkQ29tbWFuZHM6IGFueVtdKSB7XG4gICAgICAgIGNvbmZpcm1lZENvbW1hbmRzLmZvckVhY2goKGNvbW1hbmQpID0+IHtcbiAgICAgICAgICAgIGlmICghY29tbWFuZC5pZHMgfHwgY29tbWFuZC5pZHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6IENvbW1hbmQgSURzIGFyZSBlbXB0eSBvciB1bmRlZmluZWQuJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgY29uc3Qgb3BlbiA9IGNvbW1hbmQuaW5kZXg7XG4gICAgICAgICAgICBjb25zdCBjbG9zZSA9IGNvbW1hbmQuaWRzW2NvbW1hbmQuaWRzLmxlbmd0aCAtIDFdLmNsb3NlO1xuICAgIFxuICAgICAgICAgICAgaWYgKGNsb3NlIDwgb3Blbikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBDbG9zZSBpbmRleCAoJHtjbG9zZX0pIGlzIHNtYWxsZXIgdGhhbiBvcGVuIGluZGV4ICgke29wZW59KS5gKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICBjb25zdCBkZWxldGVDb3VudCA9IGNsb3NlIC0gb3BlbiArIDE7XG4gICAgICAgICAgICBjb25zdCByZW1vdmVkVG9rZW5zID0gdGhpcy50b2tlbnMuc2xpY2Uob3BlbiwgZGVsZXRlQ291bnQpO1xuICAgIFxuICAgICAgICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSB0aGlzLnRpa3pDb21tYW5kcy5yZXBsYWNlQ2FsbFdpdGhDb21tYW5kKFxuICAgICAgICAgICAgICAgIGNvbW1hbmQudHJpZ2dlcixcbiAgICAgICAgICAgICAgICBjb21tYW5kLmhvb2tzLFxuICAgICAgICAgICAgICAgIHRoaXMudGlrekNvbW1hbmRzLmdldEhvb2tzKHJlbW92ZWRUb2tlbnMsIGNvbW1hbmQuaWRzKVxuICAgICAgICAgICAgKTtcbiAgICBcbiAgICAgICAgICAgIGlmICghcmVwbGFjZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIGBSZXBsYWNlbWVudCBnZW5lcmF0aW9uIGZhaWxlZCBmb3IgY29tbWFuZCBhdCBpbmRleCAke2NvbW1hbmQuaW5kZXh9IHdpdGggdHJpZ2dlciAke2NvbW1hbmQudHJpZ2dlcn0uYFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uob3BlbiwgZGVsZXRlQ291bnQsIC4uLnJlcGxhY2VtZW50KTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgY2xlYW5CYXNpY1Rpa3pUb2tlbmlmeSgpe1xuXG4gICAgICAgIHRoaXMuaW5mZXJBbmRJbnRlcnByZXRDb21tYW5kcygpXG5cblxuICAgICAgICBjb25zdCB1bml0SW5kaWNlczogbnVtYmVyW10gPSB0aGlzLnRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbiwgaWR4KSA9PiAodG9rZW4gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiYmdG9rZW4udHlwZSA9PT0gJ1VuaXQnID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcblxuICAgICAgICB1bml0SW5kaWNlcy5mb3JFYWNoKCh1bml0SWR4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSB0aGlzLnRva2Vuc1t1bml0SWR4IC0gMV07XG4gICAgICAgICAgICBpZiAoIShwcmV2VG9rZW4gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbil8fCEodGhpcy50b2tlbnNbdW5pdElkeF0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbikpcmV0dXJuXG4gICAgICAgICAgICBpZiAoIXByZXZUb2tlbiB8fCBwcmV2VG9rZW4udHlwZSAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuaXRzIGNhbiBvbmx5IGJlIHVzZWQgaW4gcmVmZXJlbmNlIHRvIG51bWJlcnMgYXQgaW5kZXggJHt1bml0SWR4fWApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwcmV2VG9rZW4udmFsdWUgPSB0b1BvaW50KHByZXZUb2tlbi52YWx1ZSBhcyBudW1iZXIsIHRoaXMudG9rZW5zW3VuaXRJZHhdLm5hbWUpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnRva2Vucz10aGlzLnRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCF1bml0SW5kaWNlcy5pbmNsdWRlcyhpZHgpKSk7XG5cbiAgICAgICAgLy90aGlzLnRva2Vucz10aGlzLnRva2Vucy5maWx0ZXIoKHQpID0+IHQubmFtZSE9PSdDb21tYScpO1xuICAgICAgICAvKlxuICAgICAgICBjb25zdCBpbmRleGVzVG9SZW1vdmU6IG51bWJlcltdPVtdXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuLGluZGV4KSA9PiB7XG4gICAgICAgICAgICBpZih0b2tlbi50eXBlPT09J0Zvcm1hdHRpbmcnKXtcbiAgICAgICAgICAgICAgICBpZih0aGlzLnRva2Vuc1tpbmRleCsxXS5uYW1lPT09J0VxdWFscycpXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleF0udmFsdWU9dGhpcy50b2tlbnNbaW5kZXgrMl1cbiAgICAgICAgICAgICAgICAgICAgaW5kZXhlc1RvUmVtb3ZlLnB1c2goaW5kZXgrMSxpbmRleCsyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnRva2Vucz10aGlzLnRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCFpbmRleGVzVG9SZW1vdmUuaW5jbHVkZXMoaWR4KSkpOyovXG5cblxuXG4gICAgICAgIGNvbnN0IG1hcFN5bnRheCA9IHRoaXMudG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbiBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuJiZ0b2tlbi50eXBlID09PSAnU3ludGF4JyAmJiAvKERhc2h8UGx1cykvLnRlc3QodG9rZW4ubmFtZSkgPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcigoaWR4KTogaWR4IGlzIG51bWJlciA9PiBpZHggIT09IG51bGwpO1xuXG4gICAgICAgIGNvbnN0IHN5bnRheFNlcXVlbmNlcyA9IGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhtYXBTeW50YXgpO1xuXG5cbiAgICAgICAgY29uc3Qgc3ludGF4T2JqZWN0cyA9IHN5bnRheFNlcXVlbmNlc1xuICAgICAgICAubWFwKChzZXF1ZW5jZSkgPT4ge1xuICAgICAgICAgICAgaWYgKHNlcXVlbmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gc2VxdWVuY2VbMF07XG4gICAgICAgICAgICBjb25zdCBlbmQgPSBzZXF1ZW5jZVtzZXF1ZW5jZS5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBzZXF1ZW5jZVxuICAgICAgICAgICAgICAgIC5tYXAoKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG9rZW4gPSB0aGlzLnRva2Vuc1tpbmRleF07XG4gICAgICAgICAgICAgICAgICAgIGlmICghKHRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4pKXJldHVybiAnJ1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRva2VuIHx8ICF0b2tlbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYE1pc3Npbmcgb3IgaW52YWxpZCB0b2tlbiBhdCBpbmRleCAke2luZGV4fWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICcnOyAvLyBQcm92aWRlIGEgZmFsbGJhY2tcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG9rZW4ubmFtZVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL0Rhc2gvLCAnLScpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvUGx1cy8sICcrJyk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuam9pbignJyk7XG5cbiAgICAgICAgICAgIHJldHVybiB7IHN0YXJ0LCBlbmQsIHZhbHVlIH07XG4gICAgICAgIH0pXG5cbiAgICAgICAgLmZpbHRlcigob2JqKSA9PiBvYmogIT09IG51bGwpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLnN0YXJ0IC0gYS5zdGFydCk7XG5cbiAgICAgICAgc3ludGF4T2JqZWN0cy5mb3JFYWNoKCh7IHN0YXJ0LCBlbmQsIHZhbHVlIH0pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbW1hbmQgPSBzZWFyY2hUaWt6Q29tcG9uZW50cyh2YWx1ZSk7IFxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBuZXcgQmFzaWNUaWt6VG9rZW4oY29tbWFuZClcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgZW5kICsgMSAtIHN0YXJ0LCB0b2tlbik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcHJlcGFyZUZvclRva2VuaXplKCl7XG4gICAgICAgIGNvbnN0IHNxdWFyZUJyYWNrZXRJbmRleGVzID0gbWFwQnJhY2tldHMoJ1NxdWFyZV9icmFja2V0c19vcGVuJyx0aGlzLnRva2VucylcbiAgICAgICAgc3F1YXJlQnJhY2tldEluZGV4ZXNcbiAgICAgICAgLnNvcnQoKGE6IHsgb3BlbjogbnVtYmVyOyB9LCBiOiB7IG9wZW46IG51bWJlcjsgfSkgPT4gYi5vcGVuIC0gYS5vcGVuKSAvLyBTb3J0IGluIGRlc2NlbmRpbmcgb3JkZXIgb2YgJ29wZW4nXG4gICAgICAgIC5mb3JFYWNoKChpbmRleDogeyBvcGVuOiBudW1iZXI7IGNsb3NlOiBudW1iZXI7IH0pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmcgPSBuZXcgRm9ybWF0dGluZyhcbiAgICAgICAgICAgICAgICBjbGVhbkZvcm1hdHRpbmcodGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgZm9ybWF0dGluZyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vbGV0IHByYW5lSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgdGhpcy50b2tlbnMpO1xuICAgICAgICBsZXQgY29vcmRpbmF0ZUluZGV4ZXMgPSBtYXBCcmFja2V0cygnUGFyZW50aGVzZXNfb3BlbicsIHRoaXMudG9rZW5zKVxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IGNsb3NlOiBudW1iZXI7IH0saWR4OiBhbnkpPT50aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJih0aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdYXMgQmFzaWNUaWt6VG9rZW4pLnZhbHVlIT09J2F0JylcbiAgICAgICAgLypcbiAgICAgICAgY29uc3QgeyBjb29yZGluYXRlSW5kZXhlcywgdmFyaWFibGVJbmRleGVzIH0gPSBwcmFuZUluZGV4ZXMucmVkdWNlKChyZXN1bHQsIGl0ZW0pID0+IHtcbiAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tpdGVtLmNsb3NlICsgMV0/LnZhbHVlICE9PSAnYXQnKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LmNvb3JkaW5hdGVJbmRleGVzLnB1c2goaXRlbSk7XG4gICAgICAgICAgICB9IFxuICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UgKyAxXT8udmFsdWUgPT09ICdhdCcpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQudmFyaWFibGVJbmRleGVzLnB1c2goaXRlbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9LCB7IGNvb3JkaW5hdGVJbmRleGVzOiBbXSwgdmFyaWFibGVJbmRleGVzOiBbXSB9KTsqL1xuICAgICAgICBjb29yZGluYXRlSW5kZXhlc1xuICAgICAgICAuc29ydCgoYTogeyBvcGVuOiBudW1iZXI7IH0sIGI6IHsgb3BlbjogbnVtYmVyOyB9KSA9PiBiLm9wZW4gLSBhLm9wZW4pIFxuICAgICAgICAuZm9yRWFjaCgoaW5kZXg6IHsgb3BlbjogbnVtYmVyOyBjbG9zZTogbnVtYmVyIDsgfSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXhpcyA9IG5ldyBBeGlzKCkucGFyc2VJbnB1dChcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFheGlzKXJldHVyblxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGF4aXMpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgdmFyaWFibGVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2VucylcbiAgICAgICAgLmZpbHRlcigoaXRlbTogeyBjbG9zZTogbnVtYmVyOyB9LGlkeDogYW55KT0+dGhpcy50b2tlbnNbaXRlbS5jbG9zZSsxXSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuJiYodGhpcy50b2tlbnNbaXRlbS5jbG9zZSsxXWFzIEJhc2ljVGlrelRva2VuKS52YWx1ZSE9PSdhdCcpXG5cbiAgICAgICAgdmFyaWFibGVJbmRleGVzXG4gICAgICAgIC5zb3J0KChhOiB7IG9wZW46IG51bWJlcjsgfSwgYjogeyBvcGVuOiBudW1iZXI7IH0pID0+IGIub3BlbiAtIGEub3BlbikgXG4gICAgICAgIC5mb3JFYWNoKChpbmRleDogeyBvcGVuOiBudW1iZXIgOyBjbG9zZTogbnVtYmVyIDsgfSkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coaW5kZXgsdGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UpKVxuICAgICAgICAgICAgY29uc3QgdmFyaWFibGUgPSB0b1ZhcmlhYmxlVG9rZW4odGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyh2YXJpYWJsZSlcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCB2YXJpYWJsZSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuXG5cbmV4cG9ydCBjbGFzcyBGb3JtYXRUaWt6amF4IHtcblx0c291cmNlOiBzdHJpbmc7XG4gICAgdG9rZW5zOiBBcnJheTxUb2tlbj49W107XG4gICAgdGlrekNvbW1hbmRzOiBUaWt6Q29tbWFuZHM9bmV3IFRpa3pDb21tYW5kcygpO1xuICAgIC8vbWlkUG9pbnQ6IEF4aXM7XG4gICAgcHJpdmF0ZSB2aWV3QW5jaG9yczoge21heDogQXhpcyxtaW46QXhpcyxhdmVNaWRQb2ludDogQXhpc31cblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xuICAgIGRlYnVnSW5mbyA9IFwiXCI7XG4gICAgXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nKSB7XG4gICAgICAgIGlmKCFzb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcblx0XHQvL2NvbnN0IGJhc2ljVGlrelRva2Vucz1uZXcgQmFzaWNUaWt6VG9rZW5zKHNvdXJjZSlcbiAgICAgICAgLy9jb25zb2xlLmxvZygnYmFzaWNUaWt6VG9rZW5zJyxiYXNpY1Rpa3pUb2tlbnMpXG4gICAgICAgIC8vdGhpcy50b2tlbml6ZShiYXNpY1Rpa3pUb2tlbnMuZ2V0VG9rZW5zKCkpXG4gICAgICAgIC8vY29uc29sZS5sb2coJ3Rva2VuaXplJyx0aGlzLnRva2VucylcbiAgICAgICAgLy90aGlzLnByb2Nlc3NlZENvZGUgKz0gdGhpcy50b1N0cmluZygpXG5cbiAgICAgICAgLy90aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXG4gICAgICAgIH1cbiAgICAgICAgLy9lbHNlIHt0aGlzLnByb2Nlc3NlZENvZGU9c291cmNlO31cbiAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlPXRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcblx0fVxuXG4gICAgcHJpdmF0ZSB0aWR5VGlrelNvdXJjZShzb3VyY2U6IHN0cmluZykge1xuICAgICAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xuICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XG4gICAgICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XG4gICAgfVxuXG4gICAgdG9rZW5pemUoYmFzaWNUaWt6VG9rZW5zOiBhbnlbXSl7XG4gICAgICAgIGxldCBlbmRJbmRleFxuICAgICAgICBmb3IobGV0IGk9MDtpPGJhc2ljVGlrelRva2Vucy5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdEcmF3Jyl7XG4gICAgICAgICAgICAgICAgZW5kSW5kZXg9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkpLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nU2VtaWNvbG9uJykraVxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcbiAgICAgICAgICAgICAgICBpPWVuZEluZGV4XG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdygnZHJhdycpLmZpbGxDb29yZGluYXRlcyhzZWdtZW50KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdDb29yZGluYXRlJyl7XG4gICAgICAgICAgICAgICAgZW5kSW5kZXg9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkpLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nU2VtaWNvbG9uJykraVxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzZWdtZW50KVxuICAgICAgICAgICAgICAgIGk9ZW5kSW5kZXhcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKCdjb29yZGluYXRlJykuaW50ZXJwcmV0Q29vcmRpbmF0ZShzZWdtZW50KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvKlxuICAgICAgICBUaGV5J3JlIGdvaW5nIHRvIGJlIHRocmVlIHR5cGVzIHN0cmluZ2VkIHN5bnRheCBudW1iZXIuXG4gICAgICAgICBJIHVzZSB0aGVtIHRvIHRva2VuaXplLiB1c2luZyB0aGUgdGlja3MgY29tbWFuZHMuIE9uY2UgdG9rZW5pemVyIHRha2VzIGNvbW1hbmRzLlxuICAgICAgICAgSSBtb3ZlIG9uIHRvIGFjdHVhbCBldmFsdWF0aW9uLlxuICAgICAgICAqL1xuXG4gICAgICAgIFxuICAgICAgICBsZXQgc3ViZGVmaW5lZFRva2Vucz1bXTtcbiAgICAgICAgLypcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YmFzaWNUaWt6VG9rZW5zLmxlbmd0aDtpKyspe1xuXG4gICAgICAgIH0qL1xuICAgIH1cblxuICAgIGdldENvZGUoKXtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnNvdXJjZT09PVwic3RyaW5nXCImJnRoaXMuc291cmNlLm1hdGNoKC8odXNlcGFja2FnZXx1c2V0aWt6bGlicmFyeSkvKSl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wcm9jZXNzZWRDb2RlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xuICAgIH1cbiAgICBcbiAgICBhcHBseVBvc3RQcm9jZXNzaW5nKCl7XG4gICAgICAgIGNvbnN0IGZsYXRBeGVzPWZsYXR0ZW4odGhpcy50b2tlbnMpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcbiAgICAgICAgZmxhdEF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xuICAgICAgICAgICAgYXhpcy5hZGRRdWFkcmFudCh0aGlzLnZpZXdBbmNob3JzLmF2ZU1pZFBvaW50KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgZmxhdERyYXc9ZmxhdHRlbih0aGlzLnRva2VucyxbXSxEcmF3KS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgRHJhdyk7XG4gICAgICAgIGZsYXREcmF3LmZvckVhY2goKGRyYXc6IERyYXcpID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgIFtpbmRleCwgY29vcl0gb2YgZHJhdy5jb29yZGluYXRlcy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29vciBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29vci5mb3JtYXR0aW5nPy5hZGRTcGxvcEFuZFBvc2l0aW9uKGRyYXcuY29vcmRpbmF0ZXMsaW5kZXgpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgfVxuXG4gICAgLypcbiAgICB0b2tlbml6ZSgpIHtcbiAgICAgICAgXG5cbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxccy0sLjp8YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxuICAgICAgICBjb25zdCBjID0gU3RyaW5nLnJhd2BbJChdezAsMn1bJHtjYX1dK1spJF17MCwyfXxcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K10rXFwoWyR7Y2F9XStcXClcXCRgO1xuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgd2l0aCBlc2NhcGVkIGNoYXJhY3RlcnMgZm9yIHNwZWNpZmljIG1hdGNoaW5nXG4gICAgICAgIGNvbnN0IGNuID0gU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gOyAvLyBDb29yZGluYXRlIG5hbWVcbiAgICAgICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXFxcIj9cXCRbXFx3XFxkXFxzXFwtLC46KCEpXFwtXFx7XFx9XFwrXFxcXCBeXSpcXCRcXFwiP3xbXFx3XFxkXFxzXFwtLC46KCEpX1xcLVxcK1xcXFxeXSpgOyAvLyBUZXh0IHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xuICAgICAgICBjb25zdCBmID0gU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7LiYqXFx7XFx9JVxcLTw+XWA7IC8vIEZvcm1hdHRpbmcgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXG5cbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHVzaW5nIGVzY2FwZWQgYnJhY2VzIGFuZCBwYXR0ZXJuc1xuICAgICAgICBjb25zdCBjb29yUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHBpY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxwaWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBub2RlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHNlID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFxzKlxcKCooJHtjbn0pXFwpKlxccyphdFxccypcXCgoJHtjfSlcXClcXHMqXFxbKCR7Zn0qKVxcXVxccypcXHsoJHt0fSlcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHNzID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yZGluYXRlXFxzKihcXFtsYWJlbD1cXHtcXFsoLio/KVxcXTpcXFxcXFx3KlxccyooW1xcd1xcc10qKVxcfVxcXSk/XFxzKlxcKCgke2NufSspXFwpXFxzKmF0XFxzKlxcKCgke2N9KVxcKTtgLCBcImdcIik7XG4gICAgICAgIGNvbnN0IGRyYXdSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZHJhd1xcWygke2Z9KilcXF0oW147XSopO2AsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgeHlheGlzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHh5YXhpc3soJHt0fSl9eygke3R9KX1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZHsoW1xcZC0uXSspfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgY2lyY2xlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNpcmNsZVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceyhbXFx3XFxzXFxkXSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBtYXNzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG1hc3NcXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoLVxcfHxcXHx8Pil7MCwxfVxcfVxceyhbXFxkLl0qKVxcfWAsXCJnXCIpO1xuICAgICAgICAvL1xccGlje2FuYzJ9e2FuYzF9e2FuYzB9ezc1XlxcY2lyYyB9e307XG4gICAgICAgIGNvbnN0IHZlY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx2ZWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW2Nvb3JSZWdleCwgc2UsIHNzLCBub2RlUmVnZXgsIGRyYXdSZWdleCwgY2lyY2xlUmVnZXgsIG1hc3NSZWdleCwgdmVjUmVnZXgscGljUmVnZXhdO1xuICAgICAgICBsZXQgbWF0Y2hlczogYW55W109W107XG4gICAgICAgIHJlZ2V4UGF0dGVybnMuZm9yRWFjaChhYiA9PiB7XG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiAoYS5pbmRleCB8fCAwKSAtIChiLmluZGV4IHx8IDApKTtcblxuICAgICAgICBbeHlheGlzUmVnZXgsZ3JpZFJlZ2V4XS5mb3JFYWNoKGFiID0+IHtcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkICYmIG1hdGNoLmluZGV4ID4gY3VycmVudEluZGV4KSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHRoaXMuc291cmNlLnNsaWNlKGN1cnJlbnRJbmRleCwgbWF0Y2guaW5kZXgpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vclwiKSkge1xuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMl0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfVxuICAgICAgICAgICAgaWYobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yZGluYXRlXCIpKXtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFs1XSxjb29yZGluYXRlTmFtZTogbWF0Y2hbNF0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzJdfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHsgZm9ybWF0dGluZyxvcmlnaW5hbCwgLi4ucmVzdCB9ID0gaTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwiY29vcmRpbmF0ZVwiLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG9yaWdpbmFsLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwiY29vcmRpbmF0ZVwiLCB1bmRlZmluZWQsZm9ybWF0dGluZyksLi4ucmVzdCx9KSk7XG5cbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxccGljXCIpKSB7XG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKVxuICAgICAgICAgICAgY29uc3QgYzI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcylcbiAgICAgICAgICAgIGNvbnN0IGMzPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzNdLHRoaXMpXG5cblxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7bW9kZTogXCJwaWMtYW5nXCIsdG9rZW5zOiB0aGlzLGZvcm1hdHRpbmdTdHJpbmc6IG1hdGNoWzVdLGZvcm1hdHRpbmdPYmo6IHt0aWt6c2V0OiBcImFuZ1wiLGljVGV4dDogbWF0Y2hbNF19LGRyYXdBcnI6IFtjMSxjMixjM119KSk7XG4gICAgICAgICAgfWVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZHJhd1wiKSkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh1bmRlZmluZWQsbWF0Y2hbMV0sbWF0Y2hbMl0sIHRoaXMpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxceHlheGlzXCIpKSB7XG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGdyaWRcIikpIHtcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbm9kZVwiKSkge1xuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbM10sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfVxuICAgICAgICAgICAgaWYgKG1hdGNoWzBdLm1hdGNoKC9cXFxcbm9kZVxccypcXCgvKSl7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbMl0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzFdLGxhYmVsOiBtYXRjaFs0XSxmb3JtYXR0aW5nOiBtYXRjaFszXX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlXCIsYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwob3JpZ2luYWwsdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIsIHVuZGVmaW5lZCxmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7LypcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgICB0eXBlOiBcImNpcmNsZVwiLFxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSxcbiAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzFdLCB0aGlzLnRva2VucyksXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsyXSwgdGhpcy50b2tlbnMpLFxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbM10sIHRoaXMudG9rZW5zKSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pOypcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlXCIsbGFiZWw6IG1hdGNoWzJdLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZVwiLHt0aWt6c2V0OiAnbWFzcycsYW5jaG9yOiBtYXRjaFszXSxyb3RhdGU6IG1hdGNoWzRdfSl9KSlcblxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcbiAgICAgICAgICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpO1xuICAgICAgICAgICAgY29uc3QgYXhpczE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcyk7XG4gICAgICAgICAgICBjb25zdCBub2RlPW5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGUtaW5saW5lXCIsZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoJ25vZGUtaW5saW5lJyx7Y29sb3I6IFwicmVkXCJ9KX0pXG5cbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBDb29yZGluYXRlKFwibm9kZS1pbmxpbmVcIik7XG4gICAgICAgICAgICBjb25zdCBxPVthbmNlciwnLS0rJyxub2RlLGF4aXMxXVxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7Zm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6ICd2ZWMnfSx0b2tlbnM6IHRoaXMsZHJhd0FycjogcX0pKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjdXJyZW50SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4KSk7XG4gICAgICAgIH1cbiAgICB9Ki9cbiAgICBnZXRNaW4oKXtyZXR1cm4gdGhpcy52aWV3QW5jaG9ycy5taW59XG4gICAgZ2V0TWF4KCl7cmV0dXJuIHRoaXMudmlld0FuY2hvcnMubWF4fVxuXG4gICAgZmluZFZpZXdBbmNob3JzKCkge1xuICAgICAgICBjb25zdCBheGVzID0gZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcbiAgICAgICAgXG4gICAgICAgIGxldCBzdW1PZlggPSAwLCBzdW1PZlkgPSAwO1xuICAgICAgICBsZXQgbWF4WCA9IC1JbmZpbml0eSwgbWF4WSA9IC1JbmZpbml0eTtcbiAgICAgICAgbGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5O1xuICAgIFxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzID0ge1xuICAgICAgICAgICAgbWF4OiBuZXcgQXhpcygwLCAwKSxcbiAgICAgICAgICAgIG1pbjogbmV3IEF4aXMoMCwgMCksXG4gICAgICAgICAgICBhdmVNaWRQb2ludDogbmV3IEF4aXMoMCwgMClcbiAgICAgICAgfTtcbiAgICBcbiAgICAgICAgYXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IGNhcnRlc2lhblgsIGNhcnRlc2lhblkgfSA9IGF4aXM7XG4gICAgXG4gICAgICAgICAgICAvLyBVcGRhdGUgc3VtcyBmb3IgYXZlcmFnZSBjYWxjdWxhdGlvblxuICAgICAgICAgICAgc3VtT2ZYICs9IGNhcnRlc2lhblg7XG4gICAgICAgICAgICBzdW1PZlkgKz0gY2FydGVzaWFuWTtcbiAgICBcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBtYXggYW5kIG1pbiBjb29yZGluYXRlc1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblggPiBtYXhYKSBtYXhYID0gY2FydGVzaWFuWDtcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5ZID4gbWF4WSkgbWF4WSA9IGNhcnRlc2lhblk7XG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA8IG1pblgpIG1pblggPSBjYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPCBtaW5ZKSBtaW5ZID0gY2FydGVzaWFuWTtcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIGNvbnN0IGxlbmd0aCA9IGF4ZXMubGVuZ3RoICE9PSAwID8gYXhlcy5sZW5ndGggOiAxO1xuICAgIFxuICAgICAgICAvLyBTZXQgdGhlIHZpZXdBbmNob3JzXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQgPSBuZXcgQXhpcyhzdW1PZlggLyBsZW5ndGgsIHN1bU9mWSAvIGxlbmd0aCk7XG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWF4ID0gbmV3IEF4aXMobWF4WCwgbWF4WSk7XG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWluID0gbmV3IEF4aXMobWluWCwgbWluWSk7XG4gICAgfVxuICAgIFxuXG4gICAgZmluZE9yaWdpbmFsVmFsdWUodmFsdWU6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkOy8qXG4gICAgICAgIGNvbnN0IG9nID0gdGhpcy50b2tlbnMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkOyovXG4gICAgfVxuICAgIFxuXG4gICAgdG9TdHJpbmcoKXtcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCI7XG4gICAgICAgIGNvbnNvbGUubG9nKCd0aGlzLnRva2VucycsdGhpcy50b2tlbnMpXG4gICAgICAgIC8vY29uc3QgZXh0cmVtZVhZPWdldEV4dHJlbWVYWSh0aGlzLnRva2Vucyk7XG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmKHRva2VuLnRvU3RyaW5nKCkpe1xuICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPXRva2VuLnRvU3RyaW5nKClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gdG9rZW47XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNvZGVCbG9ja091dHB1dDtcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gZmxhdHRlbihkYXRhOiBhbnksIHJlc3VsdHM6IGFueVtdID0gW10sIHN0b3BDbGFzcz86IGFueSk6IGFueVtdIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGRhdGEpIHtcbiAgICAgICAgZmxhdHRlbihpdGVtLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnICYmIGRhdGEgIT09IG51bGwpIHtcbiAgICAgIC8vIElmIHRoZSBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgdGhlIHN0b3BDbGFzcywgYWRkIGl0IHRvIHJlc3VsdHMgYW5kIHN0b3AgZmxhdHRlbmluZ1xuICAgICAgaWYgKHN0b3BDbGFzcyAmJiBkYXRhIGluc3RhbmNlb2Ygc3RvcENsYXNzKSB7XG4gICAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9XG4gIFxuICAgICAgLy8gQWRkIHRoZSBjdXJyZW50IG9iamVjdCB0byByZXN1bHRzXG4gICAgICByZXN1bHRzLnB1c2goZGF0YSk7XG4gIFxuICAgICAgLy8gUmVjdXJzaXZlbHkgZmxhdHRlbiBwcm9wZXJ0aWVzIG9mIHRoZSBvYmplY3RcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIGRhdGEpIHtcbiAgICAgICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIGZsYXR0ZW4oZGF0YVtrZXldLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBnZXRFeHRyZW1lWFkodG9rZW5zOiBhbnkpIHtcbiAgICBsZXQgbWF4WCA9IC1JbmZpbml0eTtcbiAgICBsZXQgbWF4WSA9IC1JbmZpbml0eTtcbiAgICBsZXQgbWluWCA9IEluZmluaXR5O1xuICAgIGxldCBtaW5ZID0gSW5maW5pdHk7XG4gICAgXG4gICAgdG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcbiAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XG4gICAgICAgIGlmICh0b2tlbi5YID4gbWF4WCkgbWF4WCA9IHRva2VuLlg7XG4gICAgICAgIGlmICh0b2tlbi5YIDwgbWluWCkgbWluWCA9IHRva2VuLlg7XG4gICAgXG4gICAgICAgIGlmICh0b2tlbi5ZID4gbWF4WSkgbWF4WSA9IHRva2VuLlk7XG4gICAgICAgIGlmICh0b2tlbi5ZIDwgbWluWSkgbWluWSA9IHRva2VuLlk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgICBtYXhYLG1heFksbWluWCxtaW5ZLFxuICAgIH07XG59XG5cbmNvbnN0IHBhcnNlTnVtYmVyID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xuICAgIHJldHVybiBpc05hTihudW1iZXJWYWx1ZSkgPyAwIDogbnVtYmVyVmFsdWU7XG59O1xuXG5cblxuXG5cbmZ1bmN0aW9uIGdldFByZWFtYmxlKCk6c3RyaW5ne1xuICAgIGNvbnN0IGFuZz1cIlxcXFx0aWt6c2V0e2FuZy8uc3R5bGUgMiBhcmdzPXtmaWxsPWJsYWNrITUwLG9wYWNpdHk9MC41LHRleHQgb3BhY2l0eT0wLjksZHJhdz1vcmFuZ2UsPC0+LGFuZ2xlIGVjY2VudHJpY2l0eT0jMSxhbmdsZSByYWRpdXM9IzJjbSx0ZXh0PW9yYW5nZSxmb250PVxcXFxsYXJnZX0sYW5nLy5kZWZhdWx0PXsxLjZ9ezAuNX19XCJcbiAgXG4gICAgY29uc3QgbWFyaz1cIlxcXFxkZWZcXFxcbWFyayMxIzIjM3tcXFxccGF0aCBbZGVjb3JhdGlvbj17bWFya2luZ3MsIG1hcms9YXQgcG9zaXRpb24gMC41IHdpdGgge1xcXFxmb3JlYWNoIFxcXFx4IGluIHsjMX0geyBcXFxcZHJhd1tsaW5lIHdpZHRoPTFwdF0gKFxcXFx4LC0zcHQpIC0tIChcXFxceCwzcHQpOyB9fX0sIHBvc3RhY3Rpb249ZGVjb3JhdGVdICgjMikgLS0gKCMzKTt9XCJcbiAgXG4gICAgY29uc3QgYXJyPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFycn1bOF17XFxcXGNvb3JkaW5hdGUgKDIpIGF0ICgkKCMyKSEjNyEoIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDEpIGF0ICgkKDIpISM1bW0hOTA6KCMzKSQpO1xcXFxjb29yZGluYXRlICgzKSBhdCAoJCgyKSEjNW1tKyM0Y20hIzg6KCMzKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTFwdCw8LV0gKDEpLS0oMylub2RlIFtwb3M9IzZdIHtcXFxcbGFyZ2UgIzF9O31cIiBcbiAgICBjb25zdCBsZW5lPVwiXFxcXGRlZlxcXFxjb3IjMSMyIzMjNCM1e1xcXFxjb29yZGluYXRlICgjMSkgYXQoJCgjMikhIzMhIzQ6KCM1KSQpO31cXFxcZGVmXFxcXGRyIzEjMntcXFxcZHJhdyBbbGluZSB3aWR0aD0jMSxdIzI7fVxcXFxuZXdjb21tYW5ke1xcXFxsZW59WzZde1xcXFxjb3J7MX17IzJ9eyMzfXs5MH17IzR9XFxcXGNvcnszfXsjNH17IzN9ey05MH17IzJ9XFxcXG5vZGUgKDIpIGF0ICgkKDEpITAuNSEoMykkKSBbcm90YXRlPSM2XXtcXFxcbGFyZ2UgIzF9O1xcXFxkcnsjNXB0LHw8LX17KDEpLS0oMil9XFxcXGRyeyM1cHQsLT58fXsoMiktLSgzKX19XCJcbiAgICBjb25zdCBzcHJpbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcc3ByaW5nfVs0XXtcXFxcdGlrem1hdGh7Y29vcmRpbmF0ZSBcXFxcc3RhcnQsIFxcXFxkb25lO1xcXFxzdGFydCA9ICgjMSk7XFxcXGRvbmUgPSAoIzIpO31cXFxcZHJhd1t0aGlja10gKCQoXFxcXHN0YXJ0KSArICgtMS41LDApJCkgLS0rKygzLDApO1xcXFxkcmF3IChcXFxcc3RhcnQpIC0tKyAoMCwtMC4yNWNtKTtcXFxcZHJhdyAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCswY20sXFxcXGRvbmV5KzAuMjVjbSkkKS0tKygwLC0wLjI1KTtcXFxcZHJhd1tkZWNvcmF0aW9uPXthc3BlY3Q9MC4zLCBzZWdtZW50IGxlbmd0aD0zLCBhbXBsaXR1ZGU9Mm1tLGNvaWwsfSxkZWNvcmF0ZV0gKFxcXFxzdGFydHgsXFxcXHN0YXJ0eS0wLjI1Y20pIC0tKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KzAuMjVjbSkkKW5vZGVbbWlkd2F5LHJpZ2h0PTAuMjVjbSxibGFja117IzR9O1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkpJCl7IzN9O31cIlxuICAgIFxuICAgIGNvbnN0IHRyZWU9XCJcXFxcbmV3Y29tbWFuZHtcXFxcbGVudX1bM117XFxcXHRpa3pzZXR7bGV2ZWwgZGlzdGFuY2U9MjBtbSxsZXZlbCAjMS8uc3R5bGU9e3NpYmxpbmcgZGlzdGFuY2U9IzJtbSwgbm9kZXM9e2ZpbGw9cmVkISMzLGNpcmNsZSxpbm5lciBzZXA9MXB0LGRyYXc9bm9uZSx0ZXh0PWJsYWNrLH19fX1cIlxuICAgIFxuICAgIGNvbnN0IHRhYmxlPVwiXFxcXHRpa3pzZXR7IHRhYmxlLy5zdHlsZT17bWF0cml4IG9mIG5vZGVzLHJvdyBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsY29sdW1uIHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxub2Rlcz17cmVjdGFuZ2xlLGRyYXc9YmxhY2ssYWxpZ249Y2VudGVyfSxtaW5pbXVtIGhlaWdodD0xLjVlbSx0ZXh0IGRlcHRoPTAuNWV4LHRleHQgaGVpZ2h0PTJleCxub2RlcyBpbiBlbXB0eSBjZWxscyxldmVyeSBldmVuIHJvdy8uc3R5bGU9e25vZGVzPXtmaWxsPWdyYXkhNjAsdGV4dD1ibGFjayx9fSxjb2x1bW4gMS8uc3R5bGU9e25vZGVzPXt0ZXh0IHdpZHRoPTVlbSxmb250PVxcXFxiZnNlcmllc319LHJvdyAxLy5zdHlsZT17bm9kZXM9e2ZvbnQ9XFxcXGJmc2VyaWVzfX19fVwiXG4gICAgY29uc3QgY29vcj1cIlxcXFxkZWZcXFxcY29vciMxIzIjMyM0e1xcXFxjb29yZGluYXRlIFtsYWJlbD17WyM0XTpcXFxcTGFyZ2UgIzN9XSAoIzIpIGF0ICgkKCMxKSQpO31cIlxuICAgIGNvbnN0IG1hc3M9YFxcXFxkZWZcXFxcbWFzcyMxIzJ7XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgjMSl7IzJ9O31gXG4gICAgY29uc3QgbWFzc1NldD1cIlxcXFx0aWt6c2V0eyBtYXNzLy5zdHlsZT17ZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrfX1cIlxuICAgIGNvbnN0IGR2ZWN0b3I9XCJcXFxcbmV3Y29tbWFuZHtcXFxcZHZlY3Rvcn1bMl17XFxcXGNvb3JkaW5hdGUgKHRlbXAxKSBhdCAoJCgwLDAgLXwgIzEpJCk7XFxcXGNvb3JkaW5hdGUgKHRlbXAyKSBhdCAoJCgwLDAgfC0gIzEpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MC43cHQsIzJdICgjMSktLSh0ZW1wMSkoIzEpLS0odGVtcDIpO31cIlxuICAgIFxuICAgIGNvbnN0IHBpY0FuZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxhbmd9WzVde1xcXFxjb29yZGluYXRlIChhbmcxKSBhdCAoIzEpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMikgYXQgKCMyKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzMpIGF0ICgjMyk7IFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmczfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0NCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzF9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdBQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhwYXJzZXtcXFxcYW5nQ0IgLSBcXFxcYW5nQUJ9XFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ8MHB0XFxcXHBnZm1hdGhwYXJzZXtcXFxccGdmbWF0aHJlc3VsdCArIDM2MH1cXFxcZmlcXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdD4xODBwdFxcXFxwZ2ZtYXRocGFyc2V7MzYwIC0gXFxcXHBnZm1hdGhyZXN1bHR9XFxcXGZpXFxcXGxldFxcXFxhbmdCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHNldG1hY3Jve1xcXFxhbmdsZUNoZWNrfXthYnMoXFxcXGFuZ0IgLSA5MCl9XFxcXGlmdGhlbmVsc2V7XFxcXGxlbmd0aHRlc3R7XFxcXGFuZ2xlQ2hlY2sgcHQgPCAwLjFwdH19e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde3JpZ2h0IGFuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O317XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17YW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fX1cIlxuICAgIGNvbnN0IHByZWFtYmxlPVwiXFxcXHVzZXBhY2thZ2V7cGdmcGxvdHMsaWZ0aGVufVxcXFx1c2V0aWt6bGlicmFyeXthcnJvd3MubWV0YSxhbmdsZXMscXVvdGVzLHBvc2l0aW9uaW5nLCBjYWxjLCBpbnRlcnNlY3Rpb25zLGRlY29yYXRpb25zLm1hcmtpbmdzLG1hdGgsc3B5LG1hdHJpeCxwYXR0ZXJucyxzbmFrZXMsZGVjb3JhdGlvbnMucGF0aHJlcGxhY2luZyxkZWNvcmF0aW9ucy5wYXRobW9ycGhpbmcscGF0dGVybnMsc2hhZG93cyxzaGFwZXMuc3ltYm9sc31cIlxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK21hc3NTZXQrXCJcXFxccGdmcGxvdHNzZXR7Y29tcGF0PTEuMTZ9XFxcXGJlZ2lue2RvY3VtZW50fVxcXFxiZWdpbnt0aWt6cGljdHVyZX1cIlxufSJdfQ==