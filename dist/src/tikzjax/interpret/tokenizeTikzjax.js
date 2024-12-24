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
import fs from 'fs';
function getStyFileContent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8'); // Read the file synchronously
    }
    catch (error) {
        console.error('Error reading the .sty file:', error);
        return ''; // Return an empty string on error
    }
}
function getPreamble() {
    const styContent = getStyFileContent('/Users/moshe/Desktop/school/obsidian/data/Files/preamble.sty');
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
    return preamble + styContent + ang + mark + arr + lene + spring + tree + table + coor + dvector + picAng + massSet + "\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxnQkFBZ0I7QUFFaEIsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzdHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRW5GLFNBQVMsMkJBQTJCLENBQUMsS0FBWTtJQUM3QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUNELFNBQVMseUJBQXlCLENBQUMsTUFBYTtJQUM1QyxJQUFJLE1BQU0sR0FBQyxFQUFFLENBQUE7SUFDYixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ25CLE1BQU0sU0FBUyxHQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQzdELElBQUcsU0FBUyxJQUFFLFNBQVMsQ0FBQyxVQUFVLEVBQUUsTUFBTSxHQUFDLENBQUMsRUFBQyxDQUFDO1lBQzFDLE1BQU0sSUFBRSxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ25DLENBQUM7O1lBRUcsTUFBTSxJQUFFLEtBQUssQ0FBQyxLQUFLLENBQUE7SUFDM0IsQ0FBQyxDQUFDLENBQUM7SUFDSCxPQUFPLE1BQU0sQ0FBQTtBQUNqQixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsVUFBaUIsRUFBQyxPQUFnQjtJQUN2RCxNQUFNLE1BQU0sR0FBWSxFQUFFLENBQUM7SUFDM0IsSUFBSSxZQUFZLEdBQVUsRUFBRSxDQUFDO0lBQzdCLE1BQU0sY0FBYyxHQUFDLEVBQUUsQ0FBQTtJQUV2QixJQUFHLE9BQU8sS0FBRyxPQUFPLEVBQUMsQ0FBQztRQUNsQixNQUFNLEtBQUssR0FBQywyQkFBMkIsQ0FBQyxVQUFVLENBQUMsQ0FBQTtRQUNuRCxjQUFjLENBQUMsSUFBSSxDQUFDLEVBQUMsR0FBRyxFQUFFLGNBQWMsRUFBQyxLQUFLLEVBQUUseUJBQXlCLENBQUMsS0FBSyxDQUFDLEVBQUMsQ0FBQyxDQUFBO0lBQ3RGLENBQUM7SUFHRCxNQUFNLFVBQVUsR0FBQyxXQUFXLENBQUMscUJBQXFCLEVBQUMsVUFBVSxDQUFDLENBQUM7SUFDL0QsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFBO0lBQ3BCLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUF5QyxFQUFFLEVBQUU7UUFDN0QsSUFBRyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksR0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUcsUUFBUSxFQUFDLENBQUM7WUFDM0MsSUFBSSxhQUFhLEdBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFDLENBQUMsRUFBQyxPQUFPLENBQUMsS0FBSyxHQUFDLENBQUMsT0FBTyxDQUFDLElBQUksR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBQ2xGLGFBQWEsR0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBQ3ZDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBQyxlQUFlLENBQUMsYUFBYSxFQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ25HLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssTUFBTSxJQUFJLElBQUksVUFBVSxFQUFFLENBQUM7UUFDNUIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ3hCLElBQUksWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDMUIsWUFBWSxHQUFHLEVBQUUsQ0FBQztZQUN0QixDQUFDO1FBQ0wsQ0FBQzthQUFNLENBQUM7WUFDSixZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVCLENBQUM7SUFDTCxDQUFDO0lBQ0QsSUFBSSxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzFCLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUdELE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtRQUNyQixjQUFjLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDakQsQ0FBQyxDQUFDLENBQUM7SUFDSCxPQUFPLGNBQWMsQ0FBQTtBQUN6QixDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxVQUFpQjtJQUV2QyxNQUFNLFFBQVEsR0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFDLEdBQUcsRUFBQyxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxRQUFRLENBQUEsQ0FBQyxDQUFBLEdBQUcsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxLQUFHLElBQUksQ0FBQyxDQUFDO0lBQ3ZGLE1BQU0sR0FBRyxHQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUE7SUFFN0IsSUFBRyxRQUFRLENBQUMsTUFBTSxLQUFHLENBQUM7UUFDbEIsVUFBVSxHQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUVoRCxJQUFJLEtBQUssR0FBQyx3QkFBd0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUMvQyxPQUFPLEVBQUMsR0FBRyxFQUFDLEtBQUssRUFBQyxDQUFBO0FBQ3RCLENBQUM7QUFHRCxTQUFTLHdCQUF3QixDQUFDLFVBQTBCO0lBQ3hELElBQUksVUFBVSxDQUFDLE1BQU0sS0FBRyxDQUFDLEVBQUMsQ0FBQztRQUN2QixPQUFPLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUUsSUFBSSxDQUFBO0lBQ3BDLENBQUM7SUFDRCxPQUFPLFVBQVUsQ0FBQTtBQUNyQixDQUFDO0FBRUQsTUFBTSxXQUFXO0lBQ2IsT0FBTyxDQUFTO0lBQ2hCLE9BQU8sQ0FBUztJQUNoQixLQUFLLENBQU07SUFDWCxPQUFPLENBQWtCO0lBQ3pCLFVBQVUsQ0FBQyxPQUFlLEVBQUUsT0FBZSxFQUFFLE9BQWM7UUFDdkQsSUFBSSxDQUFDLE9BQU8sR0FBQyxPQUFPLENBQUM7UUFDckIsSUFBSSxDQUFDLE9BQU8sR0FBQyxPQUFPLENBQUM7UUFDckIsSUFBSSxDQUFDLE9BQU8sR0FBQyxPQUFPLENBQUM7UUFDckIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFBO1FBQ2hCLE9BQU8sSUFBSSxDQUFBO0lBQ2YsQ0FBQztJQUNELFNBQVM7UUFDTCxNQUFNLFVBQVUsR0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBQyxLQUFLLEVBQUMsRUFBRSxDQUFBLElBQUksQ0FBQyxJQUFJLEtBQUcsU0FBUyxJQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBRyxRQUFRLENBQUEsQ0FBQyxDQUFBLEtBQUssQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDO2FBQ3ZILE1BQU0sQ0FBQyxDQUFDLENBQUEsRUFBRSxDQUFBLENBQUMsS0FBRyxJQUFJLENBQUMsQ0FBQTtRQUNwQixJQUFHLFVBQVUsQ0FBQyxNQUFNLEtBQUcsSUFBSSxDQUFDLE9BQU8sRUFBQyxDQUFDO1lBQ2pDLE1BQU0sSUFBSSxLQUFLLENBQUMsMEdBQTBHLElBQUksQ0FBQyxPQUFPLHVCQUF1QixVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN0TCxDQUFDO1FBQ0QsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsRUFBRSxDQUFBLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQTtRQUMzQixVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ3JCLE1BQU0sT0FBTyxHQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEMsT0FBTyxDQUFDLElBQUksR0FBQyxRQUFRLENBQUE7WUFDckIsT0FBTyxDQUFDLElBQUksR0FBQyxNQUFNLENBQUE7WUFDbkIsT0FBTyxDQUFDLEtBQUssR0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsR0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUM7WUFDekMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQTtRQUNoQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRCxPQUFPO1FBQ0gsT0FBTyxFQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFDLENBQUE7SUFDdEQsQ0FBQztDQUNKO0FBR0QsTUFBTSxZQUFZO0lBQ2QsUUFBUSxHQUFnQixFQUFFLENBQUM7SUFDM0IsZ0JBQWMsQ0FBQztJQUFBLENBQUM7SUFDaEIsVUFBVSxDQUFDLE1BQVc7SUFFdEIsQ0FBQztJQUNELDBCQUEwQixDQUFDLE1BQWE7UUFDcEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUMsTUFBTSxDQUFDLENBQUE7UUFDNUIsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxxQkFBcUIsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNaLE9BQU8sQ0FBQyxLQUFLLENBQUMsbURBQW1ELENBQUMsQ0FBQztZQUNuRSxPQUFPO1FBQ1gsQ0FBQztRQUNELElBQUksR0FBRyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7UUFDekIsTUFBTSxHQUFHLEdBQUcsc0JBQXNCLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sR0FBRyxHQUFHLHNCQUFzQixDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztRQUV4RixJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7WUFDMUQsT0FBTztRQUNYLENBQUM7UUFDRCxHQUFHLEdBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUE7UUFDMUMsSUFBSSxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQztRQUM1QixPQUFPLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDaEUsS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzlELE9BQU8sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQztRQUU5RCxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDcEQsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFDM0IsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLElBQUksS0FBSyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7UUFDdkUsQ0FBQztRQUVELElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN4RCxPQUFPLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUMvQixDQUFDO2FBQU0sQ0FBQztZQUNKLE1BQU0sSUFBSSxLQUFLLENBQUMsa0RBQWtELENBQUMsQ0FBQztRQUN4RSxDQUFDO1FBQ0QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxXQUFXLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFBO0lBQzdFLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxPQUFlLEVBQUMsVUFBa0IsRUFBQyxLQUFZO1FBQ2xFLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQ3pDLE9BQU8sQ0FBQyxPQUFPLEtBQUssT0FBTyxJQUFJLFVBQVUsS0FBSyxPQUFPLENBQUMsT0FBTyxDQUNoRSxFQUFFLE9BQU8sQ0FBQztRQUNYLElBQUcsQ0FBQyxPQUFPO1lBQUMsT0FBTyxJQUFJLENBQUM7UUFDeEIsTUFBTSxHQUFHLEdBQUcsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUNyQyxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUM3RCxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUMxQixHQUFHLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFFZixNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQy9CLEtBQUssTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxHQUFHLElBQUksRUFBRSxFQUFFLENBQUM7WUFDdkMsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDM0IsWUFBWSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM1QixDQUFDO1lBQ0QsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQTtJQUNsQixDQUFDO0lBRUQsUUFBUSxDQUFDLE1BQWEsRUFBQyxHQUFVO1FBQzdCLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ2xCLE1BQU0sZUFBZSxHQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUE7UUFDakMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUNiLEVBQUUsQ0FBQyxJQUFJLElBQUUsZUFBZSxDQUFDO1lBQ3pCLEVBQUUsQ0FBQyxLQUFLLElBQUUsZUFBZSxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2QsTUFBTSxLQUFLLEdBQVUsRUFBRSxDQUFBO1FBQ3ZCLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDYixNQUFNLE9BQU8sR0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxLQUFLLEdBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7WUFDM0QsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUN2QixDQUFDLENBQUMsQ0FBQztRQUNILEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQixPQUFPLEtBQUssQ0FBQTtJQUNoQixDQUFDO0NBRUo7QUFFRCxNQUFNLE9BQU8sY0FBYztJQUN2QixJQUFJLENBQVM7SUFDYixJQUFJLENBQVE7SUFDWixLQUFLLENBQUs7SUFDVixZQUFZLEtBQVU7UUFDbEIsSUFBSSxPQUFPLEtBQUssS0FBRyxRQUFRLEVBQUMsQ0FBQztZQUN6QixJQUFJLENBQUMsSUFBSSxHQUFDLFFBQVEsQ0FBQTtZQUNsQixJQUFJLENBQUMsS0FBSyxHQUFDLEtBQUssQ0FBQztZQUNqQixPQUFNO1FBQ1YsQ0FBQztRQUNELElBQUcsT0FBTyxLQUFLLEtBQUcsUUFBUSxFQUFDLENBQUM7WUFDeEIsSUFBSSxDQUFDLElBQUksR0FBQyxRQUFRLENBQUE7WUFDbEIsSUFBSSxDQUFDLEtBQUssR0FBQyxLQUFLLENBQUM7WUFDakIsT0FBTTtRQUNWLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxHQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBQyxRQUFRLENBQUMsQ0FBQTtRQUNoRCxJQUFJLENBQUMsSUFBSSxHQUFDLEtBQUssQ0FBQyxJQUFJLENBQUE7UUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBQyxLQUFLLENBQUMsS0FBSyxDQUFBO0lBRTFCLENBQUM7SUFDRCxRQUFRO1FBQ0osT0FBTyx5QkFBeUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUE7SUFDNUMsQ0FBQztDQUNKO0FBRUQsTUFBTSxPQUFPLFlBQVk7Q0FHeEI7QUFDRCxNQUFNLE9BQU8sYUFBYTtJQUN0QixTQUFTLEdBQUssRUFBRSxDQUFBO0NBRW5CO0FBRUQsU0FBUyxlQUFlLENBQUMsR0FBVTtJQUMvQixHQUFHLEdBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUEsRUFBRSxDQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDcEQsTUFBTSxLQUFLLEdBQUMsSUFBSSxjQUFjLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtJQUM5RCxLQUFLLENBQUMsSUFBSSxHQUFDLFVBQVUsQ0FBQTtJQUNyQixPQUFPLEtBQUssQ0FBQTtBQUNoQixDQUFDO0FBT0QsTUFBTSxPQUFPLGVBQWU7SUFDaEIsTUFBTSxHQUEwQyxFQUFFLENBQUE7SUFDbEQsWUFBWSxHQUFlLElBQUksWUFBWSxFQUFFLENBQUM7SUFFdEQsWUFBWSxNQUFjO1FBQ3RCLE1BQU0sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUE7UUFDbEQsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUE7UUFFN0IsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUE7SUFDN0IsQ0FBQztJQUNELFNBQVM7UUFDTCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUE7SUFDdEIsQ0FBQztJQUVPLGNBQWMsQ0FBQyxNQUFjO1FBQ2pDLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQztRQUN4QixNQUFNLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFBQSxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RFLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDdkMsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuQyxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLHlCQUF5QixFQUFFLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsQ0FBQztJQUNsSCxDQUFDO0lBRU8sYUFBYSxDQUFDLE1BQWM7UUFDaEMsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sY0FBYyxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsR0FBRyxnQkFBZ0IsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFVixPQUFPLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDdkIsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxJQUFJLEtBQUssQ0FBQztZQUVWLHVCQUF1QjtZQUN2QixLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUN4QyxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNaLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNqRCxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztnQkFDckIsU0FBUztZQUNiLENBQUM7WUFFRCxnQkFBZ0I7WUFDaEIsS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDckMsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDWixVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDOUQsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7Z0JBQ3JCLFNBQVM7WUFDYixDQUFDO1lBQ0QsS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDeEMsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDWixVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDakQsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7Z0JBQ3JCLFNBQVM7WUFDYixDQUFDO1lBR0Qsb0NBQW9DO1lBQ3BDLENBQUMsRUFBRSxDQUFDO1FBQ1IsQ0FBQztRQUNELE9BQU8sVUFBVSxDQUFBO0lBQ3JCLENBQUM7SUFDTyxpQkFBaUIsQ0FBQyxVQUFpQjtRQUN0QyxpQkFBaUI7UUFDbEIsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDbkMsSUFBSSxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ3BCLE1BQU0sV0FBVyxHQUFHLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNoRCxJQUFJLFdBQVcsRUFBRSxDQUFDO29CQUNkLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksY0FBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RELENBQUM7O29CQUVELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFFaEQsQ0FBQztpQkFBTSxJQUFJLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDM0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDSCxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQzlCLENBQUM7SUFDTyx5QkFBeUI7UUFDN0Isa0NBQWtDO1FBQ2xDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNO2FBQzFCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLGNBQWMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNqRixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUMvQixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDMUIsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsS0FBSyxFQUFFLHFCQUFxQixDQUFDLENBQUM7WUFDeEYsSUFBSSxDQUFDLHNCQUFzQjtnQkFBRSxPQUFPO1lBRXBDLE1BQU0sZUFBZSxHQUFHLHNCQUFzQixDQUMxQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQzVCLFNBQVMsRUFDVCxJQUFJLENBQUMsTUFBTSxFQUNYLENBQUMsRUFDRCxDQUFDLEVBQ0QscUJBQXFCLENBQ3hCLENBQUM7WUFDRixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQ25CLE1BQU0sSUFBSSxLQUFLLENBQUMsaURBQWlELEtBQUssRUFBRSxDQUFDLENBQUM7WUFDOUUsQ0FBQztZQUVELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLGVBQWUsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9GLElBQUksQ0FBQyxZQUFZLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDaEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxtQ0FBbUM7UUFDbkMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsTUFBTTthQUMvQixHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO2FBQzNELE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDO1FBRS9CLHFDQUFxQztRQUNyQyxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTFFLGlEQUFpRDtRQUNqRCxJQUFJLENBQUMseUJBQXlCLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQsZ0VBQWdFO0lBQ3hELHFCQUFxQixDQUFDLFVBQWtCLEVBQUUsV0FBbUI7UUFDakUsTUFBTSxpQkFBaUIsR0FBQyxJQUFJLENBQUMsTUFBTTthQUM5QixLQUFLLENBQUMsVUFBVSxDQUFDO2FBQ2pCLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxZQUFZLGNBQWMsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFBO1FBQ2hGLE9BQU8saUJBQWlCLFlBQVksY0FBYyxDQUFBLENBQUMsQ0FBQSxpQkFBaUIsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDO0lBQzlFLENBQUM7SUFFRCxxQ0FBcUM7SUFDN0IsbUJBQW1CLENBQUMsSUFBUyxFQUFFLEtBQWE7UUFDaEQsSUFBSSxDQUFDLENBQUMsSUFBSSxZQUFZLGNBQWMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUTtZQUFFLE9BQU8sSUFBSSxDQUFDO1FBRTdFLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDL0UsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsS0FBSyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUN4RCxDQUFDO0lBRUQsdUNBQXVDO0lBQy9CLHdCQUF3QixDQUFDLGdCQUF1QjtRQUNwRCxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztRQUU3QixLQUFLLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDdkQsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUMxQyxNQUFNLElBQUksS0FBSyxDQUFDLDRDQUE0QyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBQ3pFLENBQUM7WUFFRCxNQUFNLHNCQUFzQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUscUJBQXFCLENBQUMsQ0FBQztZQUN4RixJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUMxRSxDQUFDO1lBRUQsTUFBTSxHQUFHLEdBQXlCLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQzlDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDN0IsTUFBTSxjQUFjLEdBQUcsc0JBQXNCLENBQ3pDLHNCQUFzQixDQUFDLEtBQUssRUFDNUIsU0FBUyxFQUNULElBQUksQ0FBQyxNQUFNLEVBQ1gsQ0FBQyxFQUNELENBQUMsRUFDRCxxQkFBcUIsQ0FDeEIsQ0FBQztnQkFFRixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7b0JBQ2xCLE1BQU0sSUFBSSxLQUFLLENBQUMsaUNBQWlDLENBQUMsYUFBYSxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUM1RSxDQUFDO2dCQUVELElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3JCLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzNDLElBQUksTUFBTSxDQUFDLEtBQUssS0FBSyxjQUFjLENBQUMsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDO3dCQUMzQyxNQUFNLElBQUksS0FBSyxDQUNYLGdDQUFnQyxNQUFNLENBQUMsS0FBSyxvQkFBb0IsY0FBYyxDQUFDLElBQUksR0FBRyxDQUN6RixDQUFDO29CQUNOLENBQUM7Z0JBQ0wsQ0FBQztnQkFDRCxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNqQyxDQUFDO1lBQ0QsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBRUQsT0FBTyxpQkFBaUIsQ0FBQztJQUM3QixDQUFDO0lBRUQsbURBQW1EO0lBQzNDLHlCQUF5QixDQUFDLGlCQUF3QjtRQUN0RCxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUNsQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDM0MsT0FBTyxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO2dCQUM1RCxPQUFPO1lBQ1gsQ0FBQztZQUVELE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7WUFDM0IsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFFeEQsSUFBSSxLQUFLLEdBQUcsSUFBSSxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsS0FBSyxpQ0FBaUMsSUFBSSxJQUFJLENBQUMsQ0FBQztnQkFDckYsT0FBTztZQUNYLENBQUM7WUFFRCxNQUFNLFdBQVcsR0FBRyxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQztZQUNyQyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFFM0QsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxzQkFBc0IsQ0FDeEQsT0FBTyxDQUFDLE9BQU8sRUFDZixPQUFPLENBQUMsS0FBSyxFQUNiLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQ3pELENBQUM7WUFFRixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2YsTUFBTSxJQUFJLEtBQUssQ0FDWCxzREFBc0QsT0FBTyxDQUFDLEtBQUssaUJBQWlCLE9BQU8sQ0FBQyxPQUFPLEdBQUcsQ0FDekcsQ0FBQztZQUNOLENBQUM7WUFFRCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFLEdBQUcsV0FBVyxDQUFDLENBQUM7UUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sc0JBQXNCO1FBRTFCLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFBO1FBR2hDLE1BQU0sV0FBVyxHQUFhLElBQUksQ0FBQyxNQUFNO2FBQ3hDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxZQUFZLGNBQWMsSUFBRSxLQUFLLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUMxRixNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQWlCLEVBQUUsQ0FBQyxHQUFHLEtBQUssSUFBSSxDQUFDLENBQUM7UUFFOUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzVCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzNDLElBQUksQ0FBQyxDQUFDLFNBQVMsWUFBWSxjQUFjLENBQUMsSUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsWUFBWSxjQUFjLENBQUM7Z0JBQUMsT0FBTTtZQUNwRyxJQUFJLENBQUMsU0FBUyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sSUFBSSxLQUFLLENBQUMsMkRBQTJELE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDMUYsQ0FBQztZQUVELFNBQVMsQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxLQUFlLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxNQUFNLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFekUsMERBQTBEO1FBQzFEOzs7Ozs7Ozs7Ozt1RkFXK0U7UUFJL0UsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU07YUFDNUIsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLFlBQVksY0FBYyxJQUFFLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQzlILE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBaUIsRUFBRSxDQUFDLEdBQUcsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUU5QyxNQUFNLGVBQWUsR0FBRyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUc1RCxNQUFNLGFBQWEsR0FBRyxlQUFlO2FBQ3BDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFO1lBQ2QsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUM7Z0JBQUUsT0FBTyxJQUFJLENBQUM7WUFFdkMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFCLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRTFDLE1BQU0sS0FBSyxHQUFHLFFBQVE7aUJBQ2pCLEdBQUcsQ0FBQyxDQUFDLEtBQWEsRUFBRSxFQUFFO2dCQUNuQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNqQyxJQUFJLENBQUMsQ0FBQyxLQUFLLFlBQVksY0FBYyxDQUFDO29CQUFDLE9BQU8sRUFBRSxDQUFBO2dCQUNoRCxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO29CQUN4QixPQUFPLENBQUMsSUFBSSxDQUFDLHFDQUFxQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO29CQUMzRCxPQUFPLEVBQUUsQ0FBQyxDQUFDLHFCQUFxQjtnQkFDcEMsQ0FBQztnQkFDRCxPQUFPLEtBQUssQ0FBQyxJQUFJO3FCQUNaLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDO3FCQUNwQixPQUFPLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzlCLENBQUMsQ0FBQztpQkFDRCxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFZCxPQUFPLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQztRQUNqQyxDQUFDLENBQUM7YUFFRCxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSyxJQUFJLENBQUM7YUFDN0IsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFbkMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQzVDLE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzVDLE1BQU0sS0FBSyxHQUFHLElBQUksY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1lBQ3pDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxHQUFHLEdBQUcsQ0FBQyxHQUFHLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxrQkFBa0I7UUFDdEIsTUFBTSxvQkFBb0IsR0FBRyxXQUFXLENBQUMsc0JBQXNCLEVBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQzVFLG9CQUFvQjthQUNuQixJQUFJLENBQUMsQ0FBQyxDQUFvQixFQUFFLENBQW9CLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLHFDQUFxQzthQUMzRyxPQUFPLENBQUMsQ0FBQyxLQUF1QyxFQUFFLEVBQUU7WUFDakQsTUFBTSxVQUFVLEdBQUcsSUFBSSxVQUFVLENBQzdCLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FDbEUsQ0FBQztZQUNGLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM3RSxDQUFDLENBQUMsQ0FBQztRQUVILGtFQUFrRTtRQUNsRSxJQUFJLGlCQUFpQixHQUFHLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDO2FBQ25FLE1BQU0sQ0FBQyxDQUFDLElBQXdCLEVBQUMsR0FBUSxFQUFDLEVBQUUsQ0FBQSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUMsQ0FBQyxDQUFDLFlBQVksY0FBYyxJQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBQyxDQUFDLENBQW1CLENBQUMsS0FBSyxLQUFHLElBQUksQ0FBQyxDQUFBO1FBQzVKOzs7Ozs7Ozs7NkRBU3FEO1FBQ3JELGlCQUFpQjthQUNoQixJQUFJLENBQUMsQ0FBQyxDQUFvQixFQUFFLENBQW9CLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQzthQUNyRSxPQUFPLENBQUMsQ0FBQyxLQUF3QyxFQUFFLEVBQUU7WUFDbEQsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQzlCLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FDakQsQ0FBQztZQUNGLElBQUksQ0FBQyxJQUFJO2dCQUFDLE9BQU07WUFDaEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3ZFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxlQUFlLEdBQUcsV0FBVyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxNQUFNLENBQUM7YUFDakUsTUFBTSxDQUFDLENBQUMsSUFBd0IsRUFBQyxHQUFRLEVBQUMsRUFBRSxDQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBQyxDQUFDLENBQUMsWUFBWSxjQUFjLElBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBbUIsQ0FBQyxLQUFLLEtBQUcsSUFBSSxDQUFDLENBQUE7UUFFNUosZUFBZTthQUNkLElBQUksQ0FBQyxDQUFDLENBQW9CLEVBQUUsQ0FBb0IsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2FBQ3JFLE9BQU8sQ0FBQyxDQUFDLEtBQXlDLEVBQUUsRUFBRTtZQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBO1lBQzdELE1BQU0sUUFBUSxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNqRixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1lBQ3JCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztRQUMzRSxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSjtBQUlELE1BQU0sT0FBTyxhQUFhO0lBQ3pCLE1BQU0sQ0FBUztJQUNaLE1BQU0sR0FBZSxFQUFFLENBQUM7SUFDeEIsWUFBWSxHQUFlLElBQUksWUFBWSxFQUFFLENBQUM7SUFDOUMsaUJBQWlCO0lBQ1QsV0FBVyxDQUF3QztJQUM5RCxhQUFhLEdBQUMsRUFBRSxDQUFDO0lBQ2QsU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUVsQixZQUFZLE1BQWM7UUFDbkIsSUFBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLENBQUMsRUFBQyxDQUFDO1lBQ3ZELG1EQUFtRDtZQUM3QyxnREFBZ0Q7WUFDaEQsNENBQTRDO1lBQzVDLHFDQUFxQztZQUNyQyx1Q0FBdUM7WUFFdkMsMkRBQTJEO1FBQzNELENBQUM7UUFDRCxtQ0FBbUM7UUFDbkMsSUFBSSxDQUFDLGFBQWEsR0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxTQUFTLElBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUMxQyxDQUFDO0lBRVUsY0FBYyxDQUFDLE1BQWM7UUFDakMsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDO1FBQ3hCLE1BQU0sR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUFBLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEUsS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN2QyxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ25DLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMseUJBQXlCLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2xILENBQUM7SUFFRCxRQUFRLENBQUMsZUFBc0I7UUFDM0IsSUFBSSxRQUFRLENBQUE7UUFDWixLQUFJLElBQUksQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsZUFBZSxDQUFDLE1BQU0sRUFBQyxDQUFDLEVBQUUsRUFBQyxDQUFDO1lBQ3RDLElBQUksZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBRyxNQUFNLEVBQUMsQ0FBQztnQkFDbEMsUUFBUSxHQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxXQUFXLENBQUMsR0FBQyxDQUFDLENBQUE7Z0JBQ3RFLE1BQU0sT0FBTyxHQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxRQUFRLENBQUMsQ0FBQTtnQkFDakQsQ0FBQyxHQUFDLFFBQVEsQ0FBQTtnQkFDVixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQTtZQUMvRCxDQUFDO1lBQ0QsSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFHLFlBQVksRUFBQyxDQUFDO2dCQUN4QyxRQUFRLEdBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFBLEVBQUUsQ0FBQSxDQUFDLENBQUMsSUFBSSxLQUFHLFdBQVcsQ0FBQyxHQUFDLENBQUMsQ0FBQTtnQkFDdEUsTUFBTSxPQUFPLEdBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLFFBQVEsQ0FBQyxDQUFBO2dCQUNqRCxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFBO2dCQUNwQixDQUFDLEdBQUMsUUFBUSxDQUFBO2dCQUNWLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUE7WUFDL0UsQ0FBQztRQUNMLENBQUM7UUFDRDs7OztVQUlFO1FBR0YsSUFBSSxnQkFBZ0IsR0FBQyxFQUFFLENBQUM7UUFDeEI7OztXQUdHO0lBQ1AsQ0FBQztJQUVELE9BQU87UUFDSCxJQUFJLE9BQU8sSUFBSSxDQUFDLE1BQU0sS0FBRyxRQUFRLElBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLENBQUMsRUFBQyxDQUFDO1lBQ2pGLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQTtRQUM3QixDQUFDO1FBQ0QsT0FBTyxXQUFXLEVBQUUsR0FBQyxJQUFJLENBQUMsYUFBYSxHQUFDLHFDQUFxQyxDQUFDO0lBQ2xGLENBQUM7SUFFRCxtQkFBbUI7UUFDZixNQUFNLFFBQVEsR0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQVMsRUFBQyxFQUFFLENBQUMsSUFBSSxZQUFZLElBQUksQ0FBQyxDQUFDO1FBQy9FLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFVLEVBQUUsRUFBRTtZQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDbkQsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLFFBQVEsR0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBQyxFQUFFLEVBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBUyxFQUFDLEVBQUUsQ0FBQyxJQUFJLFlBQVksSUFBSSxDQUFDLENBQUM7UUFDdkYsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQVUsRUFBRSxFQUFFO1lBQzVCLEtBQUssTUFBTyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7Z0JBQ3RELElBQUksSUFBSSxZQUFZLFVBQVUsRUFBRSxDQUFDO29CQUM3QixJQUFJLENBQUMsVUFBVSxFQUFFLG1CQUFtQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUMsS0FBSyxDQUFDLENBQUE7Z0JBQ2hFLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFUCxDQUFDO0lBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FvR0c7SUFDSCxNQUFNLEtBQUcsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQSxDQUFBLENBQUM7SUFDckMsTUFBTSxLQUFHLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUEsQ0FBQSxDQUFDO0lBRXJDLGVBQWU7UUFDWCxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQVMsRUFBRSxFQUFFLENBQUMsSUFBSSxZQUFZLElBQUksQ0FBQyxDQUFDO1FBRTlFLElBQUksTUFBTSxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQzNCLElBQUksSUFBSSxHQUFHLENBQUMsUUFBUSxFQUFFLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQztRQUN2QyxJQUFJLElBQUksR0FBRyxRQUFRLEVBQUUsSUFBSSxHQUFHLFFBQVEsQ0FBQztRQUVyQyxJQUFJLENBQUMsV0FBVyxHQUFHO1lBQ2YsR0FBRyxFQUFFLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkIsR0FBRyxFQUFFLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkIsV0FBVyxFQUFFLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDOUIsQ0FBQztRQUVGLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFVLEVBQUUsRUFBRTtZQUN4QixNQUFNLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQztZQUV4QyxzQ0FBc0M7WUFDdEMsTUFBTSxJQUFJLFVBQVUsQ0FBQztZQUNyQixNQUFNLElBQUksVUFBVSxDQUFDO1lBRXJCLGlDQUFpQztZQUNqQyxJQUFJLFVBQVUsR0FBRyxJQUFJO2dCQUFFLElBQUksR0FBRyxVQUFVLENBQUM7WUFDekMsSUFBSSxVQUFVLEdBQUcsSUFBSTtnQkFBRSxJQUFJLEdBQUcsVUFBVSxDQUFDO1lBQ3pDLElBQUksVUFBVSxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLFVBQVUsQ0FBQztZQUN6QyxJQUFJLFVBQVUsR0FBRyxJQUFJO2dCQUFFLElBQUksR0FBRyxVQUFVLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRW5ELHNCQUFzQjtRQUN0QixJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsR0FBRyxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxFQUFFLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQztRQUMxRSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFHRCxpQkFBaUIsQ0FBQyxLQUFhO1FBQzNCLE9BQU8sU0FBUyxDQUFDLENBQUE7Ozs7O21FQUswQztJQUMvRCxDQUFDO0lBR0QsUUFBUTtRQUNKLElBQUksZUFBZSxHQUFHLEVBQUUsQ0FBQztRQUN6QixPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDdEMsNENBQTRDO1FBQzVDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7WUFDL0IsSUFBRyxLQUFLLENBQUMsUUFBUSxFQUFFLEVBQUMsQ0FBQztnQkFDakIsZUFBZSxJQUFHLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQTtZQUN0QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1IsZUFBZSxJQUFJLEtBQUssQ0FBQztZQUMzQixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLGVBQWUsQ0FBQztJQUMzQixDQUFDO0NBQ0o7QUFHRCxTQUFTLE9BQU8sQ0FBQyxJQUFTLEVBQUUsVUFBaUIsRUFBRSxFQUFFLFNBQWU7SUFDNUQsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDeEIsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUN4QixPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNwQyxDQUFDO0lBQ0gsQ0FBQztTQUFNLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxJQUFJLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNyRCx1RkFBdUY7UUFDdkYsSUFBSSxTQUFTLElBQUksSUFBSSxZQUFZLFNBQVMsRUFBRSxDQUFDO1lBQzNDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkIsT0FBTyxPQUFPLENBQUM7UUFDakIsQ0FBQztRQUVELG9DQUFvQztRQUNwQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRW5CLCtDQUErQztRQUMvQyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ3ZCLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM3QixPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6QyxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFDRCxPQUFPLE9BQU8sQ0FBQztBQUNuQixDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsTUFBVztJQUM3QixJQUFJLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQztJQUNyQixJQUFJLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQztJQUNyQixJQUFJLElBQUksR0FBRyxRQUFRLENBQUM7SUFDcEIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDO0lBRXBCLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTtRQUMxQixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLENBQUM7WUFDbEMsSUFBSSxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbkMsSUFBSSxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFFbkMsSUFBSSxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbkMsSUFBSSxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDbkMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTztRQUNILElBQUksRUFBQyxJQUFJLEVBQUMsSUFBSSxFQUFDLElBQUk7S0FDdEIsQ0FBQztBQUNOLENBQUM7QUFFRCxNQUFNLFdBQVcsR0FBRyxDQUFDLEtBQWEsRUFBRSxFQUFFO0lBQ2xDLE1BQU0sV0FBVyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN0QyxPQUFPLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUM7QUFDaEQsQ0FBQyxDQUFDO0FBSUYsT0FBTyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBRXBCLFNBQVMsaUJBQWlCLENBQUMsUUFBaUM7SUFDeEQsSUFBSSxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLDhCQUE4QjtJQUM1RSxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMsOEJBQThCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckQsT0FBTyxFQUFFLENBQUMsQ0FBQyxrQ0FBa0M7SUFDakQsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFTLFdBQVc7SUFDaEIsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUMsOERBQThELENBQUMsQ0FBQztJQUVyRyxNQUFNLEdBQUcsR0FBQyxvTEFBb0wsQ0FBQTtJQUU5TCxNQUFNLElBQUksR0FBQyw2TEFBNkwsQ0FBQTtJQUV4TSxNQUFNLEdBQUcsR0FBQyxvTkFBb04sQ0FBQTtJQUM5TixNQUFNLElBQUksR0FBQyx3UkFBd1IsQ0FBQTtJQUNuUyxNQUFNLE1BQU0sR0FBQywwZ0JBQTBnQixDQUFBO0lBRXZoQixNQUFNLElBQUksR0FBQyxpS0FBaUssQ0FBQTtJQUU1SyxNQUFNLEtBQUssR0FBQyw2V0FBNlcsQ0FBQTtJQUN6WCxNQUFNLElBQUksR0FBQywrRUFBK0UsQ0FBQTtJQUMxRixNQUFNLElBQUksR0FBQyxvRkFBb0YsQ0FBQTtJQUMvRixNQUFNLE9BQU8sR0FBQywwREFBMEQsQ0FBQTtJQUN4RSxNQUFNLE9BQU8sR0FBQyxzS0FBc0ssQ0FBQTtJQUVwTCxNQUFNLE1BQU0sR0FBQyw4dkJBQTh2QixDQUFBO0lBQzN3QixNQUFNLFFBQVEsR0FBQyxtUEFBbVAsQ0FBQTtJQUVsUSxPQUFPLFFBQVEsR0FBQyxVQUFVLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLE1BQU0sR0FBQyxJQUFJLEdBQUMsS0FBSyxHQUFDLElBQUksR0FBQyxPQUFPLEdBQUMsTUFBTSxHQUFDLE9BQU8sR0FBQyxpRUFBaUUsQ0FBQTtBQUNoSyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8vLyBAdHMtbm9jaGVja1xuXG5pbXBvcnQgeyBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMgfSBmcm9tIFwic3JjL21hdGhQYXJzZXIvbWF0aEVuZ2luZVwiO1xuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgQ29vcmRpbmF0ZSwgRHJhdywgRm9ybWF0dGluZywgcmVnRXhwLCBUb2tlbiwgdG9Qb2ludCB9IGZyb20gXCIuLi90aWt6amF4XCI7XG5pbXBvcnQgeyBmaW5kTW9kaWZpZWRQYXJlbkluZGV4LCBmaW5kUGFyZW5JbmRleCwgaWRQYXJlbnRoZXNlcywgbWFwQnJhY2tldHMgfSBmcm9tIFwic3JjL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcbmltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaWt6Q29tcG9uZW50cyB9IGZyb20gXCJzcmMvdXRpbHMvZGF0YU1hbmFnZXJcIjtcblxuZnVuY3Rpb24gbGFiZWxGcmVlRm9ybVRleHRTZXBhcmF0aW9uKGxhYmVsOiBhbnlbXSl7XG4gICAgY29uc3QgY29sb25JbmRleD1sYWJlbC5maW5kSW5kZXgodD0+dC5uYW1lPT09J0NvbG9uJylcbiAgICAgbGFiZWw9bGFiZWwuc3BsaWNlKGNvbG9uSW5kZXgsbGFiZWwubGVuZ3RoLWNvbG9uSW5kZXgpXG4gICAgcmV0dXJuIGxhYmVsLnNwbGljZSgxKVxufVxuZnVuY3Rpb24gZ2V0T3JpZ2luYWxUaWt6UmVmZXJlbmNlcyh0b2tlbnM6IGFueVtdKXtcbiAgICBsZXQgc3RyaW5nPScnXG4gICAgdG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xuICAgICAgICBjb25zdCBjb21wb25lbnQ9c2VhcmNoVGlrekNvbXBvbmVudHModG9rZW4ubmFtZXx8dG9rZW4udmFsdWUpXG4gICAgICAgIGlmKGNvbXBvbmVudCYmY29tcG9uZW50LnJlZmVyZW5jZXM/Lmxlbmd0aD4wKXtcbiAgICAgICAgICAgIHN0cmluZys9Y29tcG9uZW50LnJlZmVyZW5jZXNbMF1cbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBzdHJpbmcrPXRva2VuLnZhbHVlXG4gICAgfSk7XG4gICAgcmV0dXJuIHN0cmluZ1xufVxuXG5mdW5jdGlvbiBjbGVhbkZvcm1hdHRpbmcoZm9ybWF0dGluZzogYW55W10sc3ViVHlwZT86IHN0cmluZyk6IGFueVtdIHtcbiAgICBjb25zdCB2YWx1ZXM6IGFueVtdW10gPSBbXTtcbiAgICBsZXQgY3VycmVudEdyb3VwOiBhbnlbXSA9IFtdO1xuICAgIGNvbnN0IGZvcm1hdHRpbmdLZXlzPVtdXG5cbiAgICBpZihzdWJUeXBlPT09J0xhYmVsJyl7XG4gICAgICAgIGNvbnN0IGxhYmVsPWxhYmVsRnJlZUZvcm1UZXh0U2VwYXJhdGlvbihmb3JtYXR0aW5nKVxuICAgICAgICBmb3JtYXR0aW5nS2V5cy5wdXNoKHtrZXk6ICdmcmVlRm9ybVRleHQnLHZhbHVlOiBnZXRPcmlnaW5hbFRpa3pSZWZlcmVuY2VzKGxhYmVsKX0pXG4gICAgfVxuICAgIFxuXG4gICAgY29uc3QgYnJhY2tldE1hcD1tYXBCcmFja2V0cygnQ3VybHlfYnJhY2tldHNfb3BlbicsZm9ybWF0dGluZyk7XG4gICAgYnJhY2tldE1hcC5yZXZlcnNlKClcbiAgICBicmFja2V0TWFwLmZvckVhY2goKGJyYWNrZXQ6IHsgb3BlbjogbnVtYmVyOyBjbG9zZTogbnVtYmVyOyB9KSA9PiB7XG4gICAgICAgIGlmKGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTFdLm5hbWU9PT0nRXF1YWxzJyl7XG4gICAgICAgICAgICBsZXQgc3ViRm9ybWF0dGluZz1mb3JtYXR0aW5nLnNwbGljZShicmFja2V0Lm9wZW4tMSxicmFja2V0LmNsb3NlLShicmFja2V0Lm9wZW4tMikpXG4gICAgICAgICAgICBzdWJGb3JtYXR0aW5nPXN1YkZvcm1hdHRpbmcuc2xpY2UoMiwtMSlcbiAgICAgICAgICAgIGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLnZhbHVlPWNsZWFuRm9ybWF0dGluZyhzdWJGb3JtYXR0aW5nLGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLm5hbWUpXG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBmb3JtYXR0aW5nKSB7XG4gICAgICAgIGlmIChpdGVtLm5hbWUgPT09ICdDb21tYScpIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50R3JvdXAubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGN1cnJlbnRHcm91cCk7XG4gICAgICAgICAgICAgICAgY3VycmVudEdyb3VwID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjdXJyZW50R3JvdXAucHVzaChpdGVtKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudEdyb3VwKTtcbiAgICB9XG5cbiAgICBcbiAgICB2YWx1ZXMuZm9yRWFjaCgodmFsdWUpID0+IHtcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaChhc3NpZ25Gb3JtYXR0aW5nKHZhbHVlKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGZvcm1hdHRpbmdLZXlzIFxufVxuXG5mdW5jdGlvbiBhc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmc6IGFueVtdKTogYW55e1xuXG4gICAgY29uc3QgaXNFcXVhbHM9Zm9ybWF0dGluZy5tYXAoKGYsaWR4KT0+Zi5uYW1lPT09J0VxdWFscyc/aWR4Om51bGwpLmZpbHRlcih0PT50IT09bnVsbCk7XG4gICAgY29uc3Qga2V5PWZvcm1hdHRpbmdbMF0/Lm5hbWVcblxuICAgIGlmKGlzRXF1YWxzLmxlbmd0aD09PTEpXG4gICAgICAgIGZvcm1hdHRpbmc9Zm9ybWF0dGluZy5zbGljZSgoaXNFcXVhbHNbMF0rMSkpXG5cbiAgICBsZXQgdmFsdWU9aW50ZXJwcmV0Rm9ybWF0dGluZ1ZhbHVlKGZvcm1hdHRpbmcpO1xuICAgIHJldHVybiB7a2V5LHZhbHVlfVxufVxuXG5cbmZ1bmN0aW9uIGludGVycHJldEZvcm1hdHRpbmdWYWx1ZShmb3JtYXR0aW5nOiBzdHJpbmcgfCBhbnlbXSl7XG4gICAgaWYgKGZvcm1hdHRpbmcubGVuZ3RoPT09MSl7XG4gICAgICAgIHJldHVybiBmb3JtYXR0aW5nWzBdLnZhbHVlfHx0cnVlXG4gICAgfVxuICAgIHJldHVybiBmb3JtYXR0aW5nXG59XG5cbmNsYXNzIFRpa3pDb21tYW5ke1xuICAgIHRyaWdnZXI6IHN0cmluZztcbiAgICBob29rTnVtOiBudW1iZXI7XG4gICAgaG9va3M6IGFueTtcbiAgICBjb250ZW50OiBCYXNpY1Rpa3pUb2tlbltdXG4gICAgYWRkQ29tbWFuZCh0cmlnZ2VyOiBzdHJpbmcsIGhvb2tOdW06IG51bWJlciwgY29udGVudDogYW55W10pe1xuICAgICAgICB0aGlzLnRyaWdnZXI9dHJpZ2dlcjtcbiAgICAgICAgdGhpcy5ob29rTnVtPWhvb2tOdW07XG4gICAgICAgIHRoaXMuY29udGVudD1jb250ZW50O1xuICAgICAgICB0aGlzLmZpbmRIb29rcygpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIGZpbmRIb29rcygpe1xuICAgICAgICBjb25zdCBoYXNodGFnTWFwPXRoaXMuY29udGVudC5tYXAoKGl0ZW0saW5kZXgpPT5pdGVtLm5hbWU9PT0nSGFzaHRhZycmJnRoaXMuY29udGVudFtpbmRleCsxXS50eXBlPT09J251bWJlcic/aW5kZXg6bnVsbClcbiAgICAgICAgLmZpbHRlcih0PT50IT09bnVsbClcbiAgICAgICAgaWYoaGFzaHRhZ01hcC5sZW5ndGghPT10aGlzLmhvb2tOdW0pe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBEaXNjcmVwYW5jeSBiZXR3ZWVuIHRoZSBudW1iZXIgb2YgaG9va3MgZGVjbGFyZWQgYW5kIHRoZSBudW1iZXIgb2YgaG9va3MgZm91bmQgaW4gdGhlIGNvbW1hbmQgaG9va051bTogJHt0aGlzLmhvb2tOdW19IGhhc2h0YWdNYXAubGVuZ3RoOiAke2hhc2h0YWdNYXAubGVuZ3RofWApO1xuICAgICAgICB9XG4gICAgICAgIGhhc2h0YWdNYXAuc29ydCgoYSxiKT0+Yi1hKVxuICAgICAgICBoYXNodGFnTWFwLmZvckVhY2goaWR4ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGhhc2h0YWc9dGhpcy5jb250ZW50W2lkeF07XG4gICAgICAgICAgICBoYXNodGFnLnR5cGU9J1N5bnRheCdcbiAgICAgICAgICAgIGhhc2h0YWcubmFtZT0naG9vaydcbiAgICAgICAgICAgIGhhc2h0YWcudmFsdWU9dGhpcy5jb250ZW50W2lkeCsxXT8udmFsdWU7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3BsaWNlKGlkeCsxLDEpXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXRJbmZvKCl7XG4gICAgICAgIHJldHVybiB7dHJpZ2dlcjogdGhpcy50cmlnZ2VyLGhvb2tzOiB0aGlzLmhvb2tOdW19XG4gICAgfVxufVxuXG5cbmNsYXNzIFRpa3pDb21tYW5kc3tcbiAgICBjb21tYW5kczogVGlrekNvbW1hbmRbXT1bXTtcbiAgICBjb25zdHJ1Y3Rvcigpe307XG4gICAgYWRkQ29tbWFuZCh0b2tlbnM6IGFueSl7XG4gICAgICAgIFxuICAgIH1cbiAgICBhZGRDb21tYW5kQnlJbnRlcnByZXRhdGlvbih0b2tlbnM6IGFueVtdKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCd0b2tlbnMnLHRva2VucylcbiAgICAgICAgY29uc3QgaWQxVG9rZW4gPSB0b2tlbnMuZmluZCgoaXRlbSkgPT4gaXRlbS5uYW1lID09PSAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xuICAgICAgICBpZiAoIWlkMVRva2VuKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6ICdDdXJseV9icmFja2V0c19vcGVuJyBub3QgZm91bmQgaW4gdG9rZW5zLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBsZXQgaWQxID0gaWQxVG9rZW4udmFsdWU7XG4gICAgICAgIGNvbnN0IGlkMiA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoaWQxLCB1bmRlZmluZWQsIHRva2VucywgMCwgMSk7XG4gICAgICAgIGNvbnN0IGlkMyA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoaWQxLCB1bmRlZmluZWQsIHRva2VucywgMCwgMSwgJ0N1cmx5X2JyYWNrZXRzX29wZW4nKTtcbiAgICBcbiAgICAgICAgaWYgKCFpZDIgfHwgIWlkMykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOiBVbmFibGUgdG8gZmluZCBtYXRjaGluZyBicmFja2V0cy5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWQxPWZpbmRQYXJlbkluZGV4KGlkMSwgdW5kZWZpbmVkLCB0b2tlbnMpXG4gICAgICAgIGxldCB0cmlnZ2VyLCBob29rcywgY29udGVudDtcbiAgICAgICAgY29udGVudCA9IHRva2Vucy5zcGxpY2UoaWQzLm9wZW4gKyAxLCBpZDMuY2xvc2UgLSBpZDMub3BlbiAtIDEpO1xuICAgICAgICBob29rcyA9IHRva2Vucy5zcGxpY2UoaWQyLm9wZW4gKyAxLCBpZDIuY2xvc2UgLSBpZDIub3BlbiAtIDEpO1xuICAgICAgICB0cmlnZ2VyID0gdG9rZW5zLnNwbGljZShpZDEub3BlbisxLCBpZDEuY2xvc2UgLSBpZDEub3BlbiAtIDEpO1xuXG4gICAgICAgIGlmIChob29rcy5sZW5ndGggPT09IDEgJiYgaG9va3NbMF0/LnR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICBob29rcyA9IGhvb2tzWzBdLnZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBob29rczogRXhwZWN0ZWQgYSBzaW5nbGUgbnVtZXJpYyB2YWx1ZS5cIik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICh0cmlnZ2VyLmxlbmd0aCA9PT0gMSAmJiB0cmlnZ2VyWzBdPy50eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdHJpZ2dlciA9IHRyaWdnZXJbMF0udmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHRyaWdnZXI6IEV4cGVjdGVkIGEgc2luZ2xlIHN0cmluZyB2YWx1ZS5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jb21tYW5kcy5wdXNoKG5ldyBUaWt6Q29tbWFuZCgpLmFkZENvbW1hbmQodHJpZ2dlciwgaG9va3MsIGNvbnRlbnQpKVxuICAgIH1cblxuICAgIHJlcGxhY2VDYWxsV2l0aENvbW1hbmQodHJpZ2dlcjogc3RyaW5nLGhvb2tOdW1iZXI6IG51bWJlcixob29rczogYW55W10pe1xuICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5jb21tYW5kcy5maW5kKGNvbW1hbmQgPT4gXG4gICAgICAgICAgICBjb21tYW5kLnRyaWdnZXIgPT09IHRyaWdnZXIgJiYgaG9va051bWJlciA9PT0gY29tbWFuZC5ob29rTnVtXG4gICAgICAgICk/LmNvbnRlbnQ7XG4gICAgICAgIGlmKCFjb250ZW50KXJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBtYXAgPSBjb250ZW50Py5tYXAoKGl0ZW0sIGluZGV4KSA9PiBcbiAgICAgICAgICAgIGl0ZW0ubmFtZSA9PT0gJ2hvb2snID8geyBpbmRleCwgdmFsdWU6IGl0ZW0udmFsdWUgfSA6IG51bGxcbiAgICAgICAgKS5maWx0ZXIodCA9PiB0ICE9PSBudWxsKTtcbiAgICAgICAgbWFwPy5yZXZlcnNlKCk7XG5cbiAgICAgICAgY29uc3QgdW5pcXVlVmFsdWVzID0gbmV3IFNldCgpO1xuICAgICAgICBmb3IgKGNvbnN0IHsgaW5kZXgsIHZhbHVlIH0gb2YgbWFwIHx8IFtdKSB7XG4gICAgICAgICAgICBpZiAoIXVuaXF1ZVZhbHVlcy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdW5pcXVlVmFsdWVzLmFkZCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250ZW50LnNwbGljZShpbmRleCwgMSwgLi4uaG9va3NbdmFsdWUtMV0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb250ZW50XG4gICAgfVxuXG4gICAgZ2V0SG9va3ModG9rZW5zOiBhbnlbXSxpZHM6IGFueVtdKXtcbiAgICAgICAgdG9rZW5zLnNwbGljZSgwLDEpXG4gICAgICAgIGNvbnN0IGFkanVzdG1lbnRWYWx1ZT1pZHNbMF0ub3BlblxuICAgICAgICBpZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICBpZC5vcGVuLT1hZGp1c3RtZW50VmFsdWU7XG4gICAgICAgICAgICBpZC5jbG9zZS09YWRqdXN0bWVudFZhbHVlO1xuICAgICAgICB9KTtcbiAgICAgICAgaWRzLnJldmVyc2UoKTtcbiAgICAgICAgY29uc3QgaG9va3M6IGFueVtdW109W11cbiAgICAgICAgaWRzLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZD10b2tlbnMuc3BsaWNlKGlkLm9wZW4rMSxpZC5jbG9zZS0oaWQub3BlbisxKSlcbiAgICAgICAgICAgIGhvb2tzLnB1c2gocmVtb3ZlZClcbiAgICAgICAgfSk7XG4gICAgICAgIGhvb2tzLnJldmVyc2UoKTtcbiAgICAgICAgcmV0dXJuIGhvb2tzXG4gICAgfVxuICAgIFxufVxuXG5leHBvcnQgY2xhc3MgQmFzaWNUaWt6VG9rZW57XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZ1xuICAgIHZhbHVlOiBhbnlcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTogYW55KXtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZT09PSdudW1iZXInKXtcbiAgICAgICAgICAgIHRoaXMudHlwZT0nbnVtYmVyJ1xuICAgICAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICAgICAgICAgIHJldHVybiBcbiAgICAgICAgfVxuICAgICAgICBpZih0eXBlb2YgdmFsdWU9PT0nc3RyaW5nJyl7XG4gICAgICAgICAgICB0aGlzLnR5cGU9J3N0cmluZydcbiAgICAgICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy50eXBlPXZhbHVlLnR5cGUucmVwbGFjZSgvQnJhY2tldC8sJ1N5bnRheCcpXG4gICAgICAgIHRoaXMubmFtZT12YWx1ZS5uYW1lXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWUudmFsdWVcbiAgICAgICAgXG4gICAgfVxuICAgIHRvU3RyaW5nKCl7XG4gICAgICAgIHJldHVybiBnZXRPcmlnaW5hbFRpa3pSZWZlcmVuY2VzKFt0aGlzXSlcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBUaWt6VmFyaWFibGV7XG4gICAgLy90eXBlOiBcblxufVxuZXhwb3J0IGNsYXNzIFRpa3pWYXJpYWJsZXN7XG4gICAgdmFyaWFibGVzOiBbXT1bXVxuXG59XG5cbmZ1bmN0aW9uIHRvVmFyaWFibGVUb2tlbihhcnI6IGFueVtdKSB7XG4gICAgYXJyPWFyci5maWx0ZXIodD0+KCF0LnR5cGUuaW5jbHVkZXMoJ1BhcmVudGhlc2VzJykpKVxuICAgIGNvbnN0IHRva2VuPW5ldyBCYXNpY1Rpa3pUb2tlbihnZXRPcmlnaW5hbFRpa3pSZWZlcmVuY2VzKGFycikpXG4gICAgdG9rZW4udHlwZT0ndmFyaWFibGUnXG4gICAgcmV0dXJuIHRva2VuXG59XG5cbmludGVyZmFjZSBQYXJlblBhaXJ7XG4gICAgb3BlbjpudW1iZXIsXG4gICAgY2xvc2U6IG51bWJlclxufVxuXG5leHBvcnQgY2xhc3MgQmFzaWNUaWt6VG9rZW5ze1xuICAgIHByaXZhdGUgdG9rZW5zOiBBcnJheTxCYXNpY1Rpa3pUb2tlbnxGb3JtYXR0aW5nfEF4aXM+ID0gW11cbiAgICBwcml2YXRlIHRpa3pDb21tYW5kczogVGlrekNvbW1hbmRzPW5ldyBUaWt6Q29tbWFuZHMoKTtcblxuICAgIGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nKXtcbiAgICAgICAgc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xuICAgICAgICB0aGlzLmJhc2ljVGlrelRva2VuaWZ5KHRoaXMuYmFzaWNBcnJheWlmeShzb3VyY2UpKVxuICAgICAgICB0aGlzLmNsZWFuQmFzaWNUaWt6VG9rZW5pZnkoKVxuICAgICAgICBcbiAgICAgICAgdGhpcy5wcmVwYXJlRm9yVG9rZW5pemUoKVxuICAgIH1cbiAgICBnZXRUb2tlbnMoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zXG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0aWR5VGlrelNvdXJjZShzb3VyY2U6IHN0cmluZykge1xuICAgICAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xuICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XG4gICAgICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBiYXNpY0FycmF5aWZ5KHNvdXJjZTogc3RyaW5nKXtcbiAgICAgICAgY29uc3QgYmFzaWNBcnJheSA9IFtdO1xuICAgICAgICBjb25zdCBvcGVyYXRvcnNSZWdleCA9IG5ldyBSZWdFeHAoJ14nICsgYXJyVG9SZWdleFN0cmluZyhnZXRBbGxUaWt6UmVmZXJlbmNlcygpKSk7XG4gICAgICAgIGxldCBpID0gMDtcbiAgICAgICAgIFxuICAgICAgICB3aGlsZSAoaSA8IHNvdXJjZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHN1YlNvdXJjZSA9IHNvdXJjZS5zbGljZShpKTtcbiAgICAgICAgICAgIGxldCBtYXRjaDtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBNYXRjaCBUaWtaIG9wZXJhdG9yc1xuICAgICAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2gob3BlcmF0b3JzUmVnZXgpO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IG1hdGNoWzBdIH0pO1xuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIC8vIE1hdGNoIG51bWJlcnNcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eWy0wLTkuXSsvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ251bWJlcicsIHZhbHVlOiBwYXJzZU51bWJlcihtYXRjaFswXSkgfSk7XG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlthLXpBLVpcXFxcXSsvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiBtYXRjaFswXSB9KTtcbiAgICAgICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICBcbiAgICAgICAgICAgIC8vIEluY3JlbWVudCBpbmRleCBpZiBubyBtYXRjaCBmb3VuZFxuICAgICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBiYXNpY0FycmF5XG4gICAgfVxuICAgIHByaXZhdGUgYmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNBcnJheTogYW55W10pe1xuICAgICAgICAgLy8gUHJvY2VzcyB0b2tlbnNcbiAgICAgICAgYmFzaWNBcnJheS5mb3JFYWNoKCh7IHR5cGUsIHZhbHVlIH0pID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRpa3pDb21tYW5kID0gc2VhcmNoVGlrekNvbXBvbmVudHModmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmICh0aWt6Q29tbWFuZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY1Rpa3pUb2tlbih0aWt6Q29tbWFuZCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odmFsdWUpKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY1Rpa3pUb2tlbih2YWx1ZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcbiAgICB9XG4gICAgcHJpdmF0ZSBpbmZlckFuZEludGVycHJldENvbW1hbmRzKCkge1xuICAgICAgICAvLyBTdGVwIDE6IEV4dHJhY3QgY29tbWFuZCBpbmRpY2VzXG4gICAgICAgIGNvbnN0IGNvbW1hbmRzTWFwID0gdGhpcy50b2tlbnNcbiAgICAgICAgICAgIC5tYXAoKHQsIGlkeCkgPT4gKHQgaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiAmJiB0LnR5cGUgPT09ICdNYWNybycgPyBpZHggOiBudWxsKSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpID0+IHQgIT09IG51bGwpO1xuICAgICAgICBjb21tYW5kc01hcC5mb3JFYWNoKChpbmRleCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCA9IHRoaXMuZmluZEZpcnN0QnJhY2tldEFmdGVyKGluZGV4LCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xuICAgICAgICAgICAgaWYgKCFmaXJzdEJyYWNrZXRBZnRlckluZGV4KSByZXR1cm47XG4gICAgXG4gICAgICAgICAgICBjb25zdCBlbmRPZkV4cHJlc3Npb24gPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KFxuICAgICAgICAgICAgICAgIGZpcnN0QnJhY2tldEFmdGVySW5kZXgudmFsdWUsXG4gICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLFxuICAgICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgICAgMSxcbiAgICAgICAgICAgICAgICAnQ3VybHlfYnJhY2tldHNfb3BlbidcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIWVuZE9mRXhwcmVzc2lvbikge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwcmVzc2lvbiBlbmQgbm90IGZvdW5kIGZvciBjb21tYW5kIGF0IGluZGV4ICR7aW5kZXh9YCk7XG4gICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICBjb25zdCBjb21tYW5kVG9rZW5zID0gdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LCBNYXRoLmFicyhpbmRleCAtIChlbmRPZkV4cHJlc3Npb24uY2xvc2UgKyAxKSkpO1xuICAgICAgICAgICAgdGhpcy50aWt6Q29tbWFuZHMuYWRkQ29tbWFuZEJ5SW50ZXJwcmV0YXRpb24oY29tbWFuZFRva2Vucyk7XG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICAvLyBTdGVwIDM6IE1hdGNoIGNvbW1hbmRzIHRvIHRva2Vuc1xuICAgICAgICBjb25zdCBjb21tYW5kc0luVG9rZW5zID0gdGhpcy50b2tlbnNcbiAgICAgICAgICAgIC5tYXAoKGl0ZW0sIGluZGV4KSA9PiB0aGlzLm1hdGNoQ29tbWFuZFRvVG9rZW4oaXRlbSwgaW5kZXgpKVxuICAgICAgICAgICAgLmZpbHRlcigodCkgPT4gdCAhPT0gbnVsbCk7XG4gICAgXG4gICAgICAgIC8vIFN0ZXAgNDogUHJvY2VzcyBjb25maXJtZWQgY29tbWFuZHNcbiAgICAgICAgY29uc3QgY29uZmlybWVkQ29tbWFuZHMgPSB0aGlzLnByb2Nlc3NDb25maXJtZWRDb21tYW5kcyhjb21tYW5kc0luVG9rZW5zKTtcbiAgICBcbiAgICAgICAgLy8gU3RlcCA1OiBSZXBsYWNlIHRva2VucyB3aXRoIHByb2Nlc3NlZCBjb21tYW5kc1xuICAgICAgICB0aGlzLnJlcGxhY2VUb2tlbnNXaXRoQ29tbWFuZHMoY29uZmlybWVkQ29tbWFuZHMpO1xuICAgIH1cbiAgICBcbiAgICAvLyBIZWxwZXIgdG8gZmluZCB0aGUgZmlyc3QgbWF0Y2hpbmcgYnJhY2tldCBhZnRlciBhIGdpdmVuIGluZGV4XG4gICAgcHJpdmF0ZSBmaW5kRmlyc3RCcmFja2V0QWZ0ZXIoc3RhcnRJbmRleDogbnVtYmVyLCBicmFja2V0TmFtZTogc3RyaW5nKTogQmFzaWNUaWt6VG9rZW4gfCBudWxsIHtcbiAgICAgICAgY29uc3QgZmlyc3RCcmFja2V0QWZ0ZXI9dGhpcy50b2tlbnNcbiAgICAgICAgICAgIC5zbGljZShzdGFydEluZGV4KVxuICAgICAgICAgICAgLmZpbmQoKGl0ZW0pID0+IGl0ZW0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiAmJiBpdGVtLm5hbWUgPT09IGJyYWNrZXROYW1lKVxuICAgICAgICByZXR1cm4gZmlyc3RCcmFja2V0QWZ0ZXIgaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbj9maXJzdEJyYWNrZXRBZnRlcjpudWxsO1xuICAgIH1cbiAgICBcbiAgICAvLyBIZWxwZXIgdG8gbWF0Y2ggY29tbWFuZHMgdG8gdG9rZW5zXG4gICAgcHJpdmF0ZSBtYXRjaENvbW1hbmRUb1Rva2VuKGl0ZW06IGFueSwgaW5kZXg6IG51bWJlcik6IGFueSB8IG51bGwge1xuICAgICAgICBpZiAoIShpdGVtIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4pIHx8IGl0ZW0udHlwZSAhPT0gJ3N0cmluZycpIHJldHVybiBudWxsO1xuICAgIFxuICAgICAgICBjb25zdCBtYXRjaCA9IHRoaXMudGlrekNvbW1hbmRzLmNvbW1hbmRzLmZpbmQoKGMpID0+IGMudHJpZ2dlciA9PT0gaXRlbS52YWx1ZSk7XG4gICAgICAgIHJldHVybiBtYXRjaCA/IHsgaW5kZXgsIC4uLm1hdGNoLmdldEluZm8oKSB9IDogbnVsbDtcbiAgICB9XG4gICAgXG4gICAgLy8gSGVscGVyIHRvIHByb2Nlc3MgY29uZmlybWVkIGNvbW1hbmRzXG4gICAgcHJpdmF0ZSBwcm9jZXNzQ29uZmlybWVkQ29tbWFuZHMoY29tbWFuZHNJblRva2VuczogYW55W10pOiB7IGlkczogUGFyZW5QYWlyW107IGluZGV4OiBudW1iZXIgfVtdIHtcbiAgICAgICAgY29uc3QgY29uZmlybWVkQ29tbWFuZHMgPSBbXTtcbiAgICBcbiAgICAgICAgZm9yIChjb25zdCB7IGluZGV4LCB0cmlnZ2VyLCBob29rcyB9IG9mIGNvbW1hbmRzSW5Ub2tlbnMpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaG9va3MgIT09ICdudW1iZXInIHx8IGhvb2tzIDw9IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgaG9va3MgdmFsdWUgZm9yIGNvbW1hbmQgYXQgaW5kZXggJHtpbmRleH1gKTtcbiAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0QnJhY2tldEFmdGVySW5kZXggPSB0aGlzLmZpbmRGaXJzdEJyYWNrZXRBZnRlcihpbmRleCwgJ0N1cmx5X2JyYWNrZXRzX29wZW4nKTtcbiAgICAgICAgICAgIGlmICghZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ3VybHlfYnJhY2tldHNfb3BlbiBub3QgZm91bmQgYWZ0ZXIgaW5kZXggJHtpbmRleH1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3Qgb2JqOiB7IGlkczogUGFyZW5QYWlyW10gfSA9IHsgaWRzOiBbXSB9O1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBob29rczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW5QYWlySW5kZXggPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KFxuICAgICAgICAgICAgICAgICAgICBmaXJzdEJyYWNrZXRBZnRlckluZGV4LnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLFxuICAgICAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgICAgICBpLFxuICAgICAgICAgICAgICAgICAgICAnQ3VybHlfYnJhY2tldHNfb3BlbidcbiAgICAgICAgICAgICAgICApO1xuICAgIFxuICAgICAgICAgICAgICAgIGlmICghcGFyZW5QYWlySW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQYXJlbiBwYWlyIG5vdCBmb3VuZCBmb3IgaG9vayAke2l9IGF0IGluZGV4ICR7aW5kZXh9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgICAgIGlmIChvYmouaWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGFzdElkID0gb2JqLmlkc1tvYmouaWRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBpZiAobGFzdElkLmNsb3NlICE9PSBwYXJlblBhaXJJbmRleC5vcGVuIC0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGBNaXNtYXRjaCBiZXR3ZWVuIGxhc3QgY2xvc2UgKCR7bGFzdElkLmNsb3NlfSkgYW5kIG5leHQgb3BlbiAoJHtwYXJlblBhaXJJbmRleC5vcGVufSlgXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG9iai5pZHMucHVzaChwYXJlblBhaXJJbmRleCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25maXJtZWRDb21tYW5kcy5wdXNoKHsgLi4ub2JqLCBpbmRleCB9KTtcbiAgICAgICAgfVxuICAgIFxuICAgICAgICByZXR1cm4gY29uZmlybWVkQ29tbWFuZHM7XG4gICAgfVxuICAgIFxuICAgIC8vIEhlbHBlciB0byByZXBsYWNlIHRva2VucyB3aXRoIHByb2Nlc3NlZCBjb21tYW5kc1xuICAgIHByaXZhdGUgcmVwbGFjZVRva2Vuc1dpdGhDb21tYW5kcyhjb25maXJtZWRDb21tYW5kczogYW55W10pIHtcbiAgICAgICAgY29uZmlybWVkQ29tbWFuZHMuZm9yRWFjaCgoY29tbWFuZCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFjb21tYW5kLmlkcyB8fCBjb21tYW5kLmlkcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjogQ29tbWFuZCBJRHMgYXJlIGVtcHR5IG9yIHVuZGVmaW5lZC4nKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICBjb25zdCBvcGVuID0gY29tbWFuZC5pbmRleDtcbiAgICAgICAgICAgIGNvbnN0IGNsb3NlID0gY29tbWFuZC5pZHNbY29tbWFuZC5pZHMubGVuZ3RoIC0gMV0uY2xvc2U7XG4gICAgXG4gICAgICAgICAgICBpZiAoY2xvc2UgPCBvcGVuKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IENsb3NlIGluZGV4ICgke2Nsb3NlfSkgaXMgc21hbGxlciB0aGFuIG9wZW4gaW5kZXggKCR7b3Blbn0pLmApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgIGNvbnN0IGRlbGV0ZUNvdW50ID0gY2xvc2UgLSBvcGVuICsgMTtcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWRUb2tlbnMgPSB0aGlzLnRva2Vucy5zbGljZShvcGVuLCBkZWxldGVDb3VudCk7XG4gICAgXG4gICAgICAgICAgICBjb25zdCByZXBsYWNlbWVudCA9IHRoaXMudGlrekNvbW1hbmRzLnJlcGxhY2VDYWxsV2l0aENvbW1hbmQoXG4gICAgICAgICAgICAgICAgY29tbWFuZC50cmlnZ2VyLFxuICAgICAgICAgICAgICAgIGNvbW1hbmQuaG9va3MsXG4gICAgICAgICAgICAgICAgdGhpcy50aWt6Q29tbWFuZHMuZ2V0SG9va3MocmVtb3ZlZFRva2VucywgY29tbWFuZC5pZHMpXG4gICAgICAgICAgICApO1xuICAgIFxuICAgICAgICAgICAgaWYgKCFyZXBsYWNlbWVudCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgYFJlcGxhY2VtZW50IGdlbmVyYXRpb24gZmFpbGVkIGZvciBjb21tYW5kIGF0IGluZGV4ICR7Y29tbWFuZC5pbmRleH0gd2l0aCB0cmlnZ2VyICR7Y29tbWFuZC50cmlnZ2VyfS5gXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShvcGVuLCBkZWxldGVDb3VudCwgLi4ucmVwbGFjZW1lbnQpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgcHJpdmF0ZSBjbGVhbkJhc2ljVGlrelRva2VuaWZ5KCl7XG5cbiAgICAgICAgdGhpcy5pbmZlckFuZEludGVycHJldENvbW1hbmRzKClcblxuXG4gICAgICAgIGNvbnN0IHVuaXRJbmRpY2VzOiBudW1iZXJbXSA9IHRoaXMudG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbiBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuJiZ0b2tlbi50eXBlID09PSAnVW5pdCcgPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcigoaWR4KTogaWR4IGlzIG51bWJlciA9PiBpZHggIT09IG51bGwpO1xuXG4gICAgICAgIHVuaXRJbmRpY2VzLmZvckVhY2goKHVuaXRJZHgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRoaXMudG9rZW5zW3VuaXRJZHggLSAxXTtcbiAgICAgICAgICAgIGlmICghKHByZXZUb2tlbiBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKXx8ISh0aGlzLnRva2Vuc1t1bml0SWR4XSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKSlyZXR1cm5cbiAgICAgICAgICAgIGlmICghcHJldlRva2VuIHx8IHByZXZUb2tlbi50eXBlICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5pdHMgY2FuIG9ubHkgYmUgdXNlZCBpbiByZWZlcmVuY2UgdG8gbnVtYmVycyBhdCBpbmRleCAke3VuaXRJZHh9YCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHByZXZUb2tlbi52YWx1ZSA9IHRvUG9pbnQocHJldlRva2VuLnZhbHVlIGFzIG51bWJlciwgdGhpcy50b2tlbnNbdW5pdElkeF0ubmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAoIXVuaXRJbmRpY2VzLmluY2x1ZGVzKGlkeCkpKTtcblxuICAgICAgICAvL3RoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigodCkgPT4gdC5uYW1lIT09J0NvbW1hJyk7XG4gICAgICAgIC8qXG4gICAgICAgIGNvbnN0IGluZGV4ZXNUb1JlbW92ZTogbnVtYmVyW109W11cbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW4saW5kZXgpID0+IHtcbiAgICAgICAgICAgIGlmKHRva2VuLnR5cGU9PT0nRm9ybWF0dGluZycpe1xuICAgICAgICAgICAgICAgIGlmKHRoaXMudG9rZW5zW2luZGV4KzFdLm5hbWU9PT0nRXF1YWxzJylcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4XS52YWx1ZT10aGlzLnRva2Vuc1tpbmRleCsyXVxuICAgICAgICAgICAgICAgICAgICBpbmRleGVzVG9SZW1vdmUucHVzaChpbmRleCsxLGluZGV4KzIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAoIWluZGV4ZXNUb1JlbW92ZS5pbmNsdWRlcyhpZHgpKSk7Ki9cblxuXG5cbiAgICAgICAgY29uc3QgbWFwU3ludGF4ID0gdGhpcy50b2tlbnNcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJnRva2VuLnR5cGUgPT09ICdTeW50YXgnICYmIC8oRGFzaHxQbHVzKS8udGVzdCh0b2tlbi5uYW1lKSA/IGlkeCA6IG51bGwpKVxuICAgICAgICAuZmlsdGVyKChpZHgpOiBpZHggaXMgbnVtYmVyID0+IGlkeCAhPT0gbnVsbCk7XG5cbiAgICAgICAgY29uc3Qgc3ludGF4U2VxdWVuY2VzID0gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG1hcFN5bnRheCk7XG5cblxuICAgICAgICBjb25zdCBzeW50YXhPYmplY3RzID0gc3ludGF4U2VxdWVuY2VzXG4gICAgICAgIC5tYXAoKHNlcXVlbmNlKSA9PiB7XG4gICAgICAgICAgICBpZiAoc2VxdWVuY2UubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBzZXF1ZW5jZVswXTtcbiAgICAgICAgICAgIGNvbnN0IGVuZCA9IHNlcXVlbmNlW3NlcXVlbmNlLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHNlcXVlbmNlXG4gICAgICAgICAgICAgICAgLm1hcCgoaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCEodG9rZW4gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbikpcmV0dXJuICcnXG4gICAgICAgICAgICAgICAgICAgIGlmICghdG9rZW4gfHwgIXRva2VuLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgTWlzc2luZyBvciBpbnZhbGlkIHRva2VuIGF0IGluZGV4ICR7aW5kZXh9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gJyc7IC8vIFByb3ZpZGUgYSBmYWxsYmFja1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbi5uYW1lXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvRGFzaC8sICctJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9QbHVzLywgJysnKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5qb2luKCcnKTtcblxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhcnQsIGVuZCwgdmFsdWUgfTtcbiAgICAgICAgfSlcblxuICAgICAgICAuZmlsdGVyKChvYmopID0+IG9iaiAhPT0gbnVsbClcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIuc3RhcnQgLSBhLnN0YXJ0KTtcblxuICAgICAgICBzeW50YXhPYmplY3RzLmZvckVhY2goKHsgc3RhcnQsIGVuZCwgdmFsdWUgfSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29tbWFuZCA9IHNlYXJjaFRpa3pDb21wb25lbnRzKHZhbHVlKTsgXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBCYXNpY1Rpa3pUb2tlbihjb21tYW5kKVxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBlbmQgKyAxIC0gc3RhcnQsIHRva2VuKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwcmVwYXJlRm9yVG9rZW5pemUoKXtcbiAgICAgICAgY29uc3Qgc3F1YXJlQnJhY2tldEluZGV4ZXMgPSBtYXBCcmFja2V0cygnU3F1YXJlX2JyYWNrZXRzX29wZW4nLHRoaXMudG9rZW5zKVxuICAgICAgICBzcXVhcmVCcmFja2V0SW5kZXhlc1xuICAgICAgICAuc29ydCgoYTogeyBvcGVuOiBudW1iZXI7IH0sIGI6IHsgb3BlbjogbnVtYmVyOyB9KSA9PiBiLm9wZW4gLSBhLm9wZW4pIC8vIFNvcnQgaW4gZGVzY2VuZGluZyBvcmRlciBvZiAnb3BlbidcbiAgICAgICAgLmZvckVhY2goKGluZGV4OiB7IG9wZW46IG51bWJlcjsgY2xvc2U6IG51bWJlcjsgfSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZyA9IG5ldyBGb3JtYXR0aW5nKFxuICAgICAgICAgICAgICAgIGNsZWFuRm9ybWF0dGluZyh0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCBmb3JtYXR0aW5nKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9sZXQgcHJhbmVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2Vucyk7XG4gICAgICAgIGxldCBjb29yZGluYXRlSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgdGhpcy50b2tlbnMpXG4gICAgICAgIC5maWx0ZXIoKGl0ZW06IHsgY2xvc2U6IG51bWJlcjsgfSxpZHg6IGFueSk9PnRoaXMudG9rZW5zW2l0ZW0uY2xvc2UrMV0gaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiYmKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UrMV1hcyBCYXNpY1Rpa3pUb2tlbikudmFsdWUhPT0nYXQnKVxuICAgICAgICAvKlxuICAgICAgICBjb25zdCB7IGNvb3JkaW5hdGVJbmRleGVzLCB2YXJpYWJsZUluZGV4ZXMgfSA9IHByYW5lSW5kZXhlcy5yZWR1Y2UoKHJlc3VsdCwgaXRlbSkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UgKyAxXT8udmFsdWUgIT09ICdhdCcpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQuY29vcmRpbmF0ZUluZGV4ZXMucHVzaChpdGVtKTtcbiAgICAgICAgICAgIH0gXG4gICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbaXRlbS5jbG9zZSArIDFdPy52YWx1ZSA9PT0gJ2F0Jykge1xuICAgICAgICAgICAgICAgIHJlc3VsdC52YXJpYWJsZUluZGV4ZXMucHVzaChpdGVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0sIHsgY29vcmRpbmF0ZUluZGV4ZXM6IFtdLCB2YXJpYWJsZUluZGV4ZXM6IFtdIH0pOyovXG4gICAgICAgIGNvb3JkaW5hdGVJbmRleGVzXG4gICAgICAgIC5zb3J0KChhOiB7IG9wZW46IG51bWJlcjsgfSwgYjogeyBvcGVuOiBudW1iZXI7IH0pID0+IGIub3BlbiAtIGEub3BlbikgXG4gICAgICAgIC5mb3JFYWNoKChpbmRleDogeyBvcGVuOiBudW1iZXI7IGNsb3NlOiBudW1iZXIgOyB9KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBheGlzID0gbmV3IEF4aXMoKS5wYXJzZUlucHV0KFxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNsaWNlKGluZGV4Lm9wZW4gKyAxLCBpbmRleC5jbG9zZSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIWF4aXMpcmV0dXJuXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgYXhpcyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCB2YXJpYWJsZUluZGV4ZXMgPSBtYXBCcmFja2V0cygnUGFyZW50aGVzZXNfb3BlbicsIHRoaXMudG9rZW5zKVxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IGNsb3NlOiBudW1iZXI7IH0saWR4OiBhbnkpPT50aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJih0aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdYXMgQmFzaWNUaWt6VG9rZW4pLnZhbHVlIT09J2F0JylcblxuICAgICAgICB2YXJpYWJsZUluZGV4ZXNcbiAgICAgICAgLnNvcnQoKGE6IHsgb3BlbjogbnVtYmVyOyB9LCBiOiB7IG9wZW46IG51bWJlcjsgfSkgPT4gYi5vcGVuIC0gYS5vcGVuKSBcbiAgICAgICAgLmZvckVhY2goKGluZGV4OiB7IG9wZW46IG51bWJlciA7IGNsb3NlOiBudW1iZXIgOyB9KSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpbmRleCx0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSkpXG4gICAgICAgICAgICBjb25zdCB2YXJpYWJsZSA9IHRvVmFyaWFibGVUb2tlbih0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHZhcmlhYmxlKVxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIHZhcmlhYmxlKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5cblxuZXhwb3J0IGNsYXNzIEZvcm1hdFRpa3pqYXgge1xuXHRzb3VyY2U6IHN0cmluZztcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcbiAgICB0aWt6Q29tbWFuZHM6IFRpa3pDb21tYW5kcz1uZXcgVGlrekNvbW1hbmRzKCk7XG4gICAgLy9taWRQb2ludDogQXhpcztcbiAgICBwcml2YXRlIHZpZXdBbmNob3JzOiB7bWF4OiBBeGlzLG1pbjpBeGlzLGF2ZU1pZFBvaW50OiBBeGlzfVxuXHRwcm9jZXNzZWRDb2RlPVwiXCI7XG4gICAgZGVidWdJbmZvID0gXCJcIjtcbiAgICBcblx0Y29uc3RydWN0b3Ioc291cmNlOiBzdHJpbmcpIHtcbiAgICAgICAgaWYoIXNvdXJjZS5tYXRjaCgvKHVzZXBhY2thZ2V8dXNldGlremxpYnJhcnkpLykpe1xuXHRcdC8vY29uc3QgYmFzaWNUaWt6VG9rZW5zPW5ldyBCYXNpY1Rpa3pUb2tlbnMoc291cmNlKVxuICAgICAgICAvL2NvbnNvbGUubG9nKCdiYXNpY1Rpa3pUb2tlbnMnLGJhc2ljVGlrelRva2VucylcbiAgICAgICAgLy90aGlzLnRva2VuaXplKGJhc2ljVGlrelRva2Vucy5nZXRUb2tlbnMoKSlcbiAgICAgICAgLy9jb25zb2xlLmxvZygndG9rZW5pemUnLHRoaXMudG9rZW5zKVxuICAgICAgICAvL3RoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnRvU3RyaW5nKClcblxuICAgICAgICAvL3RoaXMuZGVidWdJbmZvKz1KU09OLnN0cmluZ2lmeSh0aGlzLnRva2VucyxudWxsLDEpK1wiXFxuXFxuXCJcbiAgICAgICAgfVxuICAgICAgICAvL2Vsc2Uge3RoaXMucHJvY2Vzc2VkQ29kZT1zb3VyY2U7fVxuICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGU9dGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5wcm9jZXNzZWRDb2RlO1xuXHR9XG5cbiAgICBwcml2YXRlIHRpZHlUaWt6U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XG4gICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gc291cmNlLnNwbGl0KFwiXFxuXCIpO1xuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpLnJlcGxhY2UoLyg/PD1bXlxcd10pIHwgKD89W15cXHddKS9nLCBcIlwiKS5yZXBsYWNlKC8oPzwhXFxcXCklLiokL2dtLCBcIlwiKS5yZXBsYWNlKC9cXG4vZyxcIlwiKTtcbiAgICB9XG5cbiAgICB0b2tlbml6ZShiYXNpY1Rpa3pUb2tlbnM6IGFueVtdKXtcbiAgICAgICAgbGV0IGVuZEluZGV4XG4gICAgICAgIGZvcihsZXQgaT0wO2k8YmFzaWNUaWt6VG9rZW5zLmxlbmd0aDtpKyspe1xuICAgICAgICAgICAgaWYgKGJhc2ljVGlrelRva2Vuc1tpXS5uYW1lPT09J0RyYXcnKXtcbiAgICAgICAgICAgICAgICBlbmRJbmRleD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSkuZmluZEluZGV4KHQ9PnQubmFtZT09PSdTZW1pY29sb24nKStpXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VnbWVudD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSsxLGVuZEluZGV4KVxuICAgICAgICAgICAgICAgIGk9ZW5kSW5kZXhcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KCdkcmF3JykuZmlsbENvb3JkaW5hdGVzKHNlZ21lbnQpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGJhc2ljVGlrelRva2Vuc1tpXS5uYW1lPT09J0Nvb3JkaW5hdGUnKXtcbiAgICAgICAgICAgICAgICBlbmRJbmRleD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSkuZmluZEluZGV4KHQ9PnQubmFtZT09PSdTZW1pY29sb24nKStpXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VnbWVudD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSsxLGVuZEluZGV4KVxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHNlZ21lbnQpXG4gICAgICAgICAgICAgICAgaT1lbmRJbmRleFxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoJ2Nvb3JkaW5hdGUnKS5pbnRlcnByZXRDb29yZGluYXRlKHNlZ21lbnQpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8qXG4gICAgICAgIFRoZXkncmUgZ29pbmcgdG8gYmUgdGhyZWUgdHlwZXMgc3RyaW5nZWQgc3ludGF4IG51bWJlci5cbiAgICAgICAgIEkgdXNlIHRoZW0gdG8gdG9rZW5pemUuIHVzaW5nIHRoZSB0aWNrcyBjb21tYW5kcy4gT25jZSB0b2tlbml6ZXIgdGFrZXMgY29tbWFuZHMuXG4gICAgICAgICBJIG1vdmUgb24gdG8gYWN0dWFsIGV2YWx1YXRpb24uXG4gICAgICAgICovXG5cbiAgICAgICAgXG4gICAgICAgIGxldCBzdWJkZWZpbmVkVG9rZW5zPVtdO1xuICAgICAgICAvKlxuICAgICAgICBmb3IgKGxldCBpPTA7aTxiYXNpY1Rpa3pUb2tlbnMubGVuZ3RoO2krKyl7XG5cbiAgICAgICAgfSovXG4gICAgfVxuXG4gICAgZ2V0Q29kZSgpe1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuc291cmNlPT09XCJzdHJpbmdcIiYmdGhpcy5zb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2Nlc3NlZENvZGVcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZ2V0UHJlYW1ibGUoKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XG4gICAgfVxuICAgIFxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcbiAgICAgICAgY29uc3QgZmxhdEF4ZXM9ZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICBmbGF0QXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XG4gICAgICAgICAgICBheGlzLmFkZFF1YWRyYW50KHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBmbGF0RHJhdz1mbGF0dGVuKHRoaXMudG9rZW5zLFtdLERyYXcpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBEcmF3KTtcbiAgICAgICAgZmxhdERyYXcuZm9yRWFjaCgoZHJhdzogRHJhdykgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCAgW2luZGV4LCBjb29yXSBvZiBkcmF3LmNvb3JkaW5hdGVzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgICAgIGlmIChjb29yIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBjb29yLmZvcm1hdHRpbmc/LmFkZFNwbG9wQW5kUG9zaXRpb24oZHJhdy5jb29yZGluYXRlcyxpbmRleClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICB9XG5cbiAgICAvKlxuICAgIHRva2VuaXplKCkge1xuICAgICAgICBcblxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzLSwuOnxgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXG4gICAgICAgIGNvbnN0IGMgPSBTdHJpbmcucmF3YFskKF17MCwyfVske2NhfV0rWykkXXswLDJ9fFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXStcXChbJHtjYX1dK1xcKVxcJGA7XG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB3aXRoIGVzY2FwZWQgY2hhcmFjdGVycyBmb3Igc3BlY2lmaWMgbWF0Y2hpbmdcbiAgICAgICAgY29uc3QgY24gPSBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWA7IC8vIENvb3JkaW5hdGUgbmFtZVxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcXFwiP1xcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcIF5dKlxcJFxcXCI/fFtcXHdcXGRcXHNcXC0sLjooISlfXFwtXFwrXFxcXF5dKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXG4gICAgICAgIGNvbnN0IGYgPSBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsuJipcXHtcXH0lXFwtPD5dYDsgLy8gRm9ybWF0dGluZyB3aXRoIHNwZWNpZmljIGNoYXJhY3RlcnNcblxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXG4gICAgICAgIGNvbnN0IGNvb3JSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vclxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgcGljUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHBpY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc2UgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHMqXFwoKigke2NufSlcXCkqXFxzKmF0XFxzKlxcKCgke2N9KVxcKVxccypcXFsoJHtmfSopXFxdXFxzKlxceygke3R9KVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqKFxcW2xhYmVsPVxce1xcWyguKj8pXFxdOlxcXFxcXHcqXFxzKihbXFx3XFxzXSopXFx9XFxdKT9cXHMqXFwoKCR7Y259KylcXClcXHMqYXRcXHMqXFwoKCR7Y30pXFwpO2AsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCB4eWF4aXNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxceHlheGlzeygke3R9KX17KCR7dH0pfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZ3JpZFJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxncmlkeyhbXFxkLS5dKyl9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG1hc3NSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbWFzc1xceygke2N9KVxcfVxceygke3R9KVxcfVxceygtXFx8fFxcfHw+KXswLDF9XFx9XFx7KFtcXGQuXSopXFx9YCxcImdcIik7XG4gICAgICAgIC8vXFxwaWN7YW5jMn17YW5jMX17YW5jMH17NzVeXFxjaXJjIH17fTtcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzZSwgc3MsIG5vZGVSZWdleCwgZHJhd1JlZ2V4LCBjaXJjbGVSZWdleCwgbWFzc1JlZ2V4LCB2ZWNSZWdleCxwaWNSZWdleF07XG4gICAgICAgIGxldCBtYXRjaGVzOiBhbnlbXT1bXTtcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IChhLmluZGV4IHx8IDApIC0gKGIuaW5kZXggfHwgMCkpO1xuXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsyXSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbNF19XG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzVdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFs0XSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbMl19KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJjb29yZGluYXRlXCIsYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwob3JpZ2luYWwsdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJjb29yZGluYXRlXCIsIHVuZGVmaW5lZCxmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcblxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxwaWNcIikpIHtcbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpXG4gICAgICAgICAgICBjb25zdCBjMj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKVxuICAgICAgICAgICAgY29uc3QgYzM9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbM10sdGhpcylcblxuXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHttb2RlOiBcInBpYy1hbmdcIix0b2tlbnM6IHRoaXMsZm9ybWF0dGluZ1N0cmluZzogbWF0Y2hbNV0sZm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6IFwiYW5nXCIsaWNUZXh0OiBtYXRjaFs0XX0sZHJhd0FycjogW2MxLGMyLGMzXX0pKTtcbiAgICAgICAgICB9ZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxkcmF3XCIpKSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHVuZGVmaW5lZCxtYXRjaFsxXSxtYXRjaFsyXSwgdGhpcykpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKHt0eXBlOiBcImdyaWRcIiwgcm90YXRlOiBtYXRjaFsxXX0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFszXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119XG4gICAgICAgICAgICBpZiAobWF0Y2hbMF0ubWF0Y2goL1xcXFxub2RlXFxzKlxcKC8pKXtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB7IGZvcm1hdHRpbmcsb3JpZ2luYWwsIC4uLnJlc3QgfSA9IGk7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIiwgdW5kZWZpbmVkLGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjaXJjbGVcIikpIHsvKlxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiY2lyY2xlXCIsXG4gICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG1hdGNoWzRdLFxuICAgICAgICAgICAgICBjb29yZGluYXRlczogW1xuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMV0sIHRoaXMudG9rZW5zKSxcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzJdLCB0aGlzLnRva2VucyksXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFszXSwgdGhpcy50b2tlbnMpLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSk7KlxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxtYXNzXCIpKSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixsYWJlbDogbWF0Y2hbMl0sYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIse3Rpa3pzZXQ6ICdtYXNzJyxhbmNob3I6IG1hdGNoWzNdLHJvdGF0ZTogbWF0Y2hbNF19KX0pKVxuXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHZlY1wiKSkge1xuICAgICAgICAgICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyk7XG4gICAgICAgICAgICBjb25zdCBheGlzMT1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGU9bmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZS1pbmxpbmVcIixmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZygnbm9kZS1pbmxpbmUnLHtjb2xvcjogXCJyZWRcIn0pfSlcblxuICAgICAgICAgICAgY29uc3QgYzE9bmV3IENvb3JkaW5hdGUoXCJub2RlLWlubGluZVwiKTtcbiAgICAgICAgICAgIGNvbnN0IHE9W2FuY2VyLCctLSsnLG5vZGUsYXhpczFdXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHtmb3JtYXR0aW5nT2JqOiB7dGlrenNldDogJ3ZlYyd9LHRva2VuczogdGhpcyxkcmF3QXJyOiBxfSkpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRJbmRleCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA8IHRoaXMuc291cmNlLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcbiAgICAgICAgfVxuICAgIH0qL1xuICAgIGdldE1pbigpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1pbn1cbiAgICBnZXRNYXgoKXtyZXR1cm4gdGhpcy52aWV3QW5jaG9ycy5tYXh9XG5cbiAgICBmaW5kVmlld0FuY2hvcnMoKSB7XG4gICAgICAgIGNvbnN0IGF4ZXMgPSBmbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSkgPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICBcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XG4gICAgICAgIGxldCBtYXhYID0gLUluZmluaXR5LCBtYXhZID0gLUluZmluaXR5O1xuICAgICAgICBsZXQgbWluWCA9IEluZmluaXR5LCBtaW5ZID0gSW5maW5pdHk7XG4gICAgXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMgPSB7XG4gICAgICAgICAgICBtYXg6IG5ldyBBeGlzKDAsIDApLFxuICAgICAgICAgICAgbWluOiBuZXcgQXhpcygwLCAwKSxcbiAgICAgICAgICAgIGF2ZU1pZFBvaW50OiBuZXcgQXhpcygwLCAwKVxuICAgICAgICB9O1xuICAgIFxuICAgICAgICBheGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgY2FydGVzaWFuWCwgY2FydGVzaWFuWSB9ID0gYXhpcztcbiAgICBcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBzdW1zIGZvciBhdmVyYWdlIGNhbGN1bGF0aW9uXG4gICAgICAgICAgICBzdW1PZlggKz0gY2FydGVzaWFuWDtcbiAgICAgICAgICAgIHN1bU9mWSArPSBjYXJ0ZXNpYW5ZO1xuICAgIFxuICAgICAgICAgICAgLy8gVXBkYXRlIG1heCBhbmQgbWluIGNvb3JkaW5hdGVzXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA+IG1heFgpIG1heFggPSBjYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPiBtYXhZKSBtYXhZID0gY2FydGVzaWFuWTtcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5YIDwgbWluWCkgbWluWCA9IGNhcnRlc2lhblg7XG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA8IG1pblkpIG1pblkgPSBjYXJ0ZXNpYW5ZO1xuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgY29uc3QgbGVuZ3RoID0gYXhlcy5sZW5ndGggIT09IDAgPyBheGVzLmxlbmd0aCA6IDE7XG4gICAgXG4gICAgICAgIC8vIFNldCB0aGUgdmlld0FuY2hvcnNcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCA9IG5ldyBBeGlzKHN1bU9mWCAvIGxlbmd0aCwgc3VtT2ZZIC8gbGVuZ3RoKTtcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5tYXggPSBuZXcgQXhpcyhtYXhYLCBtYXhZKTtcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5taW4gPSBuZXcgQXhpcyhtaW5YLCBtaW5ZKTtcbiAgICB9XG4gICAgXG5cbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7LypcbiAgICAgICAgY29uc3Qgb2cgPSB0aGlzLnRva2Vucy5zbGljZSgpLnJldmVyc2UoKS5maW5kKFxuICAgICAgICAgICAgKHRva2VuOiBUb2tlbikgPT5cbiAgICAgICAgICAgICAgICAodG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKSAmJiB0b2tlbi5jb29yZGluYXRlTmFtZSA9PT0gdmFsdWVcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIG9nIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSA/IG9nLmNsb25lKCkgOiB1bmRlZmluZWQ7Ki9cbiAgICB9XG4gICAgXG5cbiAgICB0b1N0cmluZygpe1xuICAgICAgICBsZXQgY29kZUJsb2NrT3V0cHV0ID0gXCJcIjtcbiAgICAgICAgY29uc29sZS5sb2coJ3RoaXMudG9rZW5zJyx0aGlzLnRva2VucylcbiAgICAgICAgLy9jb25zdCBleHRyZW1lWFk9Z2V0RXh0cmVtZVhZKHRoaXMudG9rZW5zKTtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYodG9rZW4udG9TdHJpbmcoKSl7XG4gICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9dG9rZW4udG9TdHJpbmcoKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBmbGF0dGVuKGRhdGE6IGFueSwgcmVzdWx0czogYW55W10gPSBbXSwgc3RvcENsYXNzPzogYW55KTogYW55W10ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xuICAgICAgICBmbGF0dGVuKGl0ZW0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgZGF0YSAhPT0gbnVsbCkge1xuICAgICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbiBpbnN0YW5jZSBvZiB0aGUgc3RvcENsYXNzLCBhZGQgaXQgdG8gcmVzdWx0cyBhbmQgc3RvcCBmbGF0dGVuaW5nXG4gICAgICBpZiAoc3RvcENsYXNzICYmIGRhdGEgaW5zdGFuY2VvZiBzdG9wQ2xhc3MpIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH1cbiAgXG4gICAgICAvLyBBZGQgdGhlIGN1cnJlbnQgb2JqZWN0IHRvIHJlc3VsdHNcbiAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcbiAgXG4gICAgICAvLyBSZWN1cnNpdmVseSBmbGF0dGVuIHByb3BlcnRpZXMgb2YgdGhlIG9iamVjdFxuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xuICAgICAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgZmxhdHRlbihkYXRhW2tleV0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGdldEV4dHJlbWVYWSh0b2tlbnM6IGFueSkge1xuICAgIGxldCBtYXhYID0gLUluZmluaXR5O1xuICAgIGxldCBtYXhZID0gLUluZmluaXR5O1xuICAgIGxldCBtaW5YID0gSW5maW5pdHk7XG4gICAgbGV0IG1pblkgPSBJbmZpbml0eTtcbiAgICBcbiAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcbiAgICAgICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcbiAgICAgICAgaWYgKHRva2VuLlggPCBtaW5YKSBtaW5YID0gdG9rZW4uWDtcbiAgICBcbiAgICAgICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcbiAgICAgICAgaWYgKHRva2VuLlkgPCBtaW5ZKSBtaW5ZID0gdG9rZW4uWTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICAgIG1heFgsbWF4WSxtaW5YLG1pblksXG4gICAgfTtcbn1cblxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IG51bWJlclZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSk7XG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcbn07XG5cblxuXG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuXG5mdW5jdGlvbiBnZXRTdHlGaWxlQ29udGVudChmaWxlUGF0aDogZnMuUGF0aE9yRmlsZURlc2NyaXB0b3IpIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gZnMucmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmOCcpOyAvLyBSZWFkIHRoZSBmaWxlIHN5bmNocm9ub3VzbHlcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZWFkaW5nIHRoZSAuc3R5IGZpbGU6JywgZXJyb3IpO1xuICAgICAgICByZXR1cm4gJyc7IC8vIFJldHVybiBhbiBlbXB0eSBzdHJpbmcgb24gZXJyb3JcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldFByZWFtYmxlKCk6c3RyaW5ne1xuICAgIGNvbnN0IHN0eUNvbnRlbnQgPSBnZXRTdHlGaWxlQ29udGVudCgnL1VzZXJzL21vc2hlL0Rlc2t0b3Avc2Nob29sL29ic2lkaWFuL2RhdGEvRmlsZXMvcHJlYW1ibGUuc3R5Jyk7XG4gICAgXG4gICAgY29uc3QgYW5nPVwiXFxcXHRpa3pzZXR7YW5nLy5zdHlsZSAyIGFyZ3M9e2ZpbGw9YmxhY2shNTAsb3BhY2l0eT0wLjUsdGV4dCBvcGFjaXR5PTAuOSxkcmF3PW9yYW5nZSw8LT4sYW5nbGUgZWNjZW50cmljaXR5PSMxLGFuZ2xlIHJhZGl1cz0jMmNtLHRleHQ9b3JhbmdlLGZvbnQ9XFxcXGxhcmdlfSxhbmcvLmRlZmF1bHQ9ezEuNn17MC41fX1cIlxuICBcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxuICBcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxuICAgIGNvbnN0IHNwcmluZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxzcHJpbmd9WzRde1xcXFx0aWt6bWF0aHtjb29yZGluYXRlIFxcXFxzdGFydCwgXFxcXGRvbmU7XFxcXHN0YXJ0ID0gKCMxKTtcXFxcZG9uZSA9ICgjMik7fVxcXFxkcmF3W3RoaWNrXSAoJChcXFxcc3RhcnQpICsgKC0xLjUsMCkkKSAtLSsrKDMsMCk7XFxcXGRyYXcgKFxcXFxzdGFydCkgLS0rICgwLC0wLjI1Y20pO1xcXFxkcmF3ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4KzBjbSxcXFxcZG9uZXkrMC4yNWNtKSQpLS0rKDAsLTAuMjUpO1xcXFxkcmF3W2RlY29yYXRpb249e2FzcGVjdD0wLjMsIHNlZ21lbnQgbGVuZ3RoPTMsIGFtcGxpdHVkZT0ybW0sY29pbCx9LGRlY29yYXRlXSAoXFxcXHN0YXJ0eCxcXFxcc3RhcnR5LTAuMjVjbSkgLS0oJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkrMC4yNWNtKSQpbm9kZVttaWR3YXkscmlnaHQ9MC4yNWNtLGJsYWNrXXsjNH07XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSkkKXsjM307fVwiXG4gICAgXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXG4gICAgXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXG4gICAgY29uc3QgbWFzcz1gXFxcXGRlZlxcXFxtYXNzIzEjMntcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCMxKXsjMn07fWBcbiAgICBjb25zdCBtYXNzU2V0PVwiXFxcXHRpa3pzZXR7IG1hc3MvLnN0eWxlPXtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2t9fVwiXG4gICAgY29uc3QgZHZlY3Rvcj1cIlxcXFxuZXdjb21tYW5ke1xcXFxkdmVjdG9yfVsyXXtcXFxcY29vcmRpbmF0ZSAodGVtcDEpIGF0ICgkKDAsMCAtfCAjMSkkKTtcXFxcY29vcmRpbmF0ZSAodGVtcDIpIGF0ICgkKDAsMCB8LSAjMSkkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0wLjdwdCwjMl0gKCMxKS0tKHRlbXAxKSgjMSktLSh0ZW1wMik7fVwiXG4gICAgXG4gICAgY29uc3QgcGljQW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFuZ31bNV17XFxcXGNvb3JkaW5hdGUgKGFuZzEpIGF0ICgjMSk7IFxcXFxjb29yZGluYXRlIChhbmcyKSBhdCAoIzIpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMykgYXQgKCMzKTsgXFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzN9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMX17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0FCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHBhcnNle1xcXFxhbmdDQiAtIFxcXFxhbmdBQn1cXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdDwwcHRcXFxccGdmbWF0aHBhcnNle1xcXFxwZ2ZtYXRocmVzdWx0ICsgMzYwfVxcXFxmaVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PjE4MHB0XFxcXHBnZm1hdGhwYXJzZXszNjAgLSBcXFxccGdmbWF0aHJlc3VsdH1cXFxcZmlcXFxcbGV0XFxcXGFuZ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoc2V0bWFjcm97XFxcXGFuZ2xlQ2hlY2t9e2FicyhcXFxcYW5nQiAtIDkwKX1cXFxcaWZ0aGVuZWxzZXtcXFxcbGVuZ3RodGVzdHtcXFxcYW5nbGVDaGVjayBwdCA8IDAuMXB0fX17XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17cmlnaHQgYW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXthbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9fVwiXG4gICAgY29uc3QgcHJlYW1ibGU9XCJcXFxcdXNlcGFja2FnZXtwZ2ZwbG90cyxpZnRoZW59XFxcXHVzZXRpa3psaWJyYXJ5e2Fycm93cy5tZXRhLGFuZ2xlcyxxdW90ZXMscG9zaXRpb25pbmcsIGNhbGMsIGludGVyc2VjdGlvbnMsZGVjb3JhdGlvbnMubWFya2luZ3MsbWF0aCxzcHksbWF0cml4LHBhdHRlcm5zLHNuYWtlcyxkZWNvcmF0aW9ucy5wYXRocmVwbGFjaW5nLGRlY29yYXRpb25zLnBhdGhtb3JwaGluZyxwYXR0ZXJucyxzaGFkb3dzLHNoYXBlcy5zeW1ib2xzfVwiXG4gICAgXG4gICAgcmV0dXJuIHByZWFtYmxlK3N0eUNvbnRlbnQrYW5nK21hcmsrYXJyK2xlbmUrc3ByaW5nK3RyZWUrdGFibGUrY29vcitkdmVjdG9yK3BpY0FuZyttYXNzU2V0K1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcbn0iXX0=