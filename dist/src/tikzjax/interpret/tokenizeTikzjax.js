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
        id1 = findParenIndex(id1, tokens);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxnQkFBZ0I7QUFFaEIsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzdHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRW5GLFNBQVMsMkJBQTJCLENBQUMsS0FBWTtJQUM3QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUNELFNBQVMseUJBQXlCLENBQUMsTUFBYTtJQUM1QyxJQUFJLE1BQU0sR0FBQyxFQUFFLENBQUE7SUFDYixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ25CLE1BQU0sU0FBUyxHQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQzdELElBQUcsU0FBUyxJQUFFLFNBQVMsQ0FBQyxV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QU0sSUFBSSxHQUFDLCtFQUErRSxDQUFBO0lBQzFGLE1BQU0sSUFBSSxHQUFDLG9GQUFvRixDQUFBO0lBQy9GLE1BQU0sT0FBTyxHQUFDLDBEQUEwRCxDQUFBO0lBQ3hFLE1BQU0sT0FBTyxHQUFDLHNLQUFzSyxDQUFBO0lBRXBMLE1BQU0sTUFBTSxHQUFDLDh2QkFBOHZCLENBQUE7SUFDM3dCLE1BQU0sUUFBUSxHQUFDLG1QQUFtUCxDQUFBO0lBRWxRLE9BQU8sUUFBUSxHQUFDLFVBQVUsR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsTUFBTSxHQUFDLElBQUksR0FBQyxLQUFLLEdBQUMsSUFBSSxHQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsT0FBTyxHQUFDLGlFQUFpRSxDQUFBO0FBQ2hLLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLy8vIEB0cy1ub2NoZWNrXHJcblxyXG5pbXBvcnQgeyBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMgfSBmcm9tIFwic3JjL21hdGhQYXJzZXIvbWF0aEVuZ2luZVwiO1xyXG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCByZWdFeHAsIFRva2VuLCB0b1BvaW50IH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgZmluZE1vZGlmaWVkUGFyZW5JbmRleCwgZmluZFBhcmVuSW5kZXgsIGlkUGFyZW50aGVzZXMsIG1hcEJyYWNrZXRzIH0gZnJvbSBcInNyYy91dGlscy90b2tlblV0ZW5zaWxzXCI7XHJcbmltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaWt6Q29tcG9uZW50cyB9IGZyb20gXCJzcmMvdXRpbHMvZGF0YU1hbmFnZXJcIjtcclxuXHJcbmZ1bmN0aW9uIGxhYmVsRnJlZUZvcm1UZXh0U2VwYXJhdGlvbihsYWJlbDogYW55W10pe1xyXG4gICAgY29uc3QgY29sb25JbmRleD1sYWJlbC5maW5kSW5kZXgodD0+dC5uYW1lPT09J0NvbG9uJylcclxuICAgICBsYWJlbD1sYWJlbC5zcGxpY2UoY29sb25JbmRleCxsYWJlbC5sZW5ndGgtY29sb25JbmRleClcclxuICAgIHJldHVybiBsYWJlbC5zcGxpY2UoMSlcclxufVxyXG5mdW5jdGlvbiBnZXRPcmlnaW5hbFRpa3pSZWZlcmVuY2VzKHRva2VuczogYW55W10pe1xyXG4gICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgdG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xyXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudD1zZWFyY2hUaWt6Q29tcG9uZW50cyh0b2tlbi5uYW1lfHx0b2tlbi52YWx1ZSlcclxuICAgICAgICBpZihjb21wb25lbnQmJmNvbXBvbmVudC5yZWZlcmVuY2VzPy5sZW5ndGg+MCl7XHJcbiAgICAgICAgICAgIHN0cmluZys9Y29tcG9uZW50LnJlZmVyZW5jZXNbMF1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICBzdHJpbmcrPXRva2VuLnZhbHVlXHJcbiAgICB9KTtcclxuICAgIHJldHVybiBzdHJpbmdcclxufVxyXG5cclxuZnVuY3Rpb24gY2xlYW5Gb3JtYXR0aW5nKGZvcm1hdHRpbmc6IGFueVtdLHN1YlR5cGU/OiBzdHJpbmcpOiBhbnlbXSB7XHJcbiAgICBjb25zdCB2YWx1ZXM6IGFueVtdW10gPSBbXTtcclxuICAgIGxldCBjdXJyZW50R3JvdXA6IGFueVtdID0gW107XHJcbiAgICBjb25zdCBmb3JtYXR0aW5nS2V5cz1bXVxyXG5cclxuICAgIGlmKHN1YlR5cGU9PT0nTGFiZWwnKXtcclxuICAgICAgICBjb25zdCBsYWJlbD1sYWJlbEZyZWVGb3JtVGV4dFNlcGFyYXRpb24oZm9ybWF0dGluZylcclxuICAgICAgICBmb3JtYXR0aW5nS2V5cy5wdXNoKHtrZXk6ICdmcmVlRm9ybVRleHQnLHZhbHVlOiBnZXRPcmlnaW5hbFRpa3pSZWZlcmVuY2VzKGxhYmVsKX0pXHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICBjb25zdCBicmFja2V0TWFwPW1hcEJyYWNrZXRzKCdDdXJseV9icmFja2V0c19vcGVuJyxmb3JtYXR0aW5nKTtcclxuICAgIGJyYWNrZXRNYXAucmV2ZXJzZSgpXHJcbiAgICBicmFja2V0TWFwLmZvckVhY2goKGJyYWNrZXQ6IHsgb3BlbjogbnVtYmVyOyBjbG9zZTogbnVtYmVyOyB9KSA9PiB7XHJcbiAgICAgICAgaWYoZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMV0ubmFtZT09PSdFcXVhbHMnKXtcclxuICAgICAgICAgICAgbGV0IHN1YkZvcm1hdHRpbmc9Zm9ybWF0dGluZy5zcGxpY2UoYnJhY2tldC5vcGVuLTEsYnJhY2tldC5jbG9zZS0oYnJhY2tldC5vcGVuLTIpKVxyXG4gICAgICAgICAgICBzdWJGb3JtYXR0aW5nPXN1YkZvcm1hdHRpbmcuc2xpY2UoMiwtMSlcclxuICAgICAgICAgICAgZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMl0udmFsdWU9Y2xlYW5Gb3JtYXR0aW5nKHN1YkZvcm1hdHRpbmcsZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMl0ubmFtZSlcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZm9ybWF0dGluZykge1xyXG4gICAgICAgIGlmIChpdGVtLm5hbWUgPT09ICdDb21tYScpIHtcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50R3JvdXApO1xyXG4gICAgICAgICAgICAgICAgY3VycmVudEdyb3VwID0gW107XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjdXJyZW50R3JvdXAucHVzaChpdGVtKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA+IDApIHtcclxuICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50R3JvdXApO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG4gICAgdmFsdWVzLmZvckVhY2goKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaChhc3NpZ25Gb3JtYXR0aW5nKHZhbHVlKSk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiBmb3JtYXR0aW5nS2V5cyBcclxufVxyXG5cclxuZnVuY3Rpb24gYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nOiBhbnlbXSk6IGFueXtcclxuXHJcbiAgICBjb25zdCBpc0VxdWFscz1mb3JtYXR0aW5nLm1hcCgoZixpZHgpPT5mLm5hbWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKHQ9PnQhPT1udWxsKTtcclxuICAgIGNvbnN0IGtleT1mb3JtYXR0aW5nWzBdPy5uYW1lXHJcblxyXG4gICAgaWYoaXNFcXVhbHMubGVuZ3RoPT09MSlcclxuICAgICAgICBmb3JtYXR0aW5nPWZvcm1hdHRpbmcuc2xpY2UoKGlzRXF1YWxzWzBdKzEpKVxyXG5cclxuICAgIGxldCB2YWx1ZT1pbnRlcnByZXRGb3JtYXR0aW5nVmFsdWUoZm9ybWF0dGluZyk7XHJcbiAgICByZXR1cm4ge2tleSx2YWx1ZX1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGludGVycHJldEZvcm1hdHRpbmdWYWx1ZShmb3JtYXR0aW5nOiBzdHJpbmcgfCBhbnlbXSl7XHJcbiAgICBpZiAoZm9ybWF0dGluZy5sZW5ndGg9PT0xKXtcclxuICAgICAgICByZXR1cm4gZm9ybWF0dGluZ1swXS52YWx1ZXx8dHJ1ZVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvcm1hdHRpbmdcclxufVxyXG5cclxuY2xhc3MgVGlrekNvbW1hbmR7XHJcbiAgICB0cmlnZ2VyOiBzdHJpbmc7XHJcbiAgICBob29rTnVtOiBudW1iZXI7XHJcbiAgICBob29rczogYW55O1xyXG4gICAgY29udGVudDogQmFzaWNUaWt6VG9rZW5bXVxyXG4gICAgYWRkQ29tbWFuZCh0cmlnZ2VyOiBzdHJpbmcsIGhvb2tOdW06IG51bWJlciwgY29udGVudDogYW55W10pe1xyXG4gICAgICAgIHRoaXMudHJpZ2dlcj10cmlnZ2VyO1xyXG4gICAgICAgIHRoaXMuaG9va051bT1ob29rTnVtO1xyXG4gICAgICAgIHRoaXMuY29udGVudD1jb250ZW50O1xyXG4gICAgICAgIHRoaXMuZmluZEhvb2tzKClcclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgfVxyXG4gICAgZmluZEhvb2tzKCl7XHJcbiAgICAgICAgY29uc3QgaGFzaHRhZ01hcD10aGlzLmNvbnRlbnQubWFwKChpdGVtLGluZGV4KT0+aXRlbS5uYW1lPT09J0hhc2h0YWcnJiZ0aGlzLmNvbnRlbnRbaW5kZXgrMV0udHlwZT09PSdudW1iZXInP2luZGV4Om51bGwpXHJcbiAgICAgICAgLmZpbHRlcih0PT50IT09bnVsbClcclxuICAgICAgICBpZihoYXNodGFnTWFwLmxlbmd0aCE9PXRoaXMuaG9va051bSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRGlzY3JlcGFuY3kgYmV0d2VlbiB0aGUgbnVtYmVyIG9mIGhvb2tzIGRlY2xhcmVkIGFuZCB0aGUgbnVtYmVyIG9mIGhvb2tzIGZvdW5kIGluIHRoZSBjb21tYW5kIGhvb2tOdW06ICR7dGhpcy5ob29rTnVtfSBoYXNodGFnTWFwLmxlbmd0aDogJHtoYXNodGFnTWFwLmxlbmd0aH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaGFzaHRhZ01hcC5zb3J0KChhLGIpPT5iLWEpXHJcbiAgICAgICAgaGFzaHRhZ01hcC5mb3JFYWNoKGlkeCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhhc2h0YWc9dGhpcy5jb250ZW50W2lkeF07XHJcbiAgICAgICAgICAgIGhhc2h0YWcudHlwZT0nU3ludGF4J1xyXG4gICAgICAgICAgICBoYXNodGFnLm5hbWU9J2hvb2snXHJcbiAgICAgICAgICAgIGhhc2h0YWcudmFsdWU9dGhpcy5jb250ZW50W2lkeCsxXT8udmFsdWU7XHJcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zcGxpY2UoaWR4KzEsMSlcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIGdldEluZm8oKXtcclxuICAgICAgICByZXR1cm4ge3RyaWdnZXI6IHRoaXMudHJpZ2dlcixob29rczogdGhpcy5ob29rTnVtfVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuY2xhc3MgVGlrekNvbW1hbmRze1xyXG4gICAgY29tbWFuZHM6IFRpa3pDb21tYW5kW109W107XHJcbiAgICBjb25zdHJ1Y3Rvcigpe307XHJcbiAgICBhZGRDb21tYW5kKHRva2VuczogYW55KXtcclxuICAgICAgICBcclxuICAgIH1cclxuICAgIGFkZENvbW1hbmRCeUludGVycHJldGF0aW9uKHRva2VuczogYW55W10pIHtcclxuICAgICAgICBjb25zb2xlLmxvZygndG9rZW5zJyx0b2tlbnMpXHJcbiAgICAgICAgY29uc3QgaWQxVG9rZW4gPSB0b2tlbnMuZmluZCgoaXRlbSkgPT4gaXRlbS5uYW1lID09PSAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xyXG4gICAgICAgIGlmICghaWQxVG9rZW4pIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOiAnQ3VybHlfYnJhY2tldHNfb3Blbicgbm90IGZvdW5kIGluIHRva2Vucy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IGlkMSA9IGlkMVRva2VuLnZhbHVlO1xyXG4gICAgICAgIGNvbnN0IGlkMiA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoaWQxLCB1bmRlZmluZWQsIHRva2VucywgMCwgMSk7XHJcbiAgICAgICAgY29uc3QgaWQzID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChpZDEsIHVuZGVmaW5lZCwgdG9rZW5zLCAwLCAxLCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKCFpZDIgfHwgIWlkMykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6IFVuYWJsZSB0byBmaW5kIG1hdGNoaW5nIGJyYWNrZXRzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZDE9ZmluZFBhcmVuSW5kZXgoaWQxLCB0b2tlbnMpXHJcbiAgICAgICAgbGV0IHRyaWdnZXIsIGhvb2tzLCBjb250ZW50O1xyXG4gICAgICAgIGNvbnRlbnQgPSB0b2tlbnMuc3BsaWNlKGlkMy5vcGVuICsgMSwgaWQzLmNsb3NlIC0gaWQzLm9wZW4gLSAxKTtcclxuICAgICAgICBob29rcyA9IHRva2Vucy5zcGxpY2UoaWQyLm9wZW4gKyAxLCBpZDIuY2xvc2UgLSBpZDIub3BlbiAtIDEpO1xyXG4gICAgICAgIHRyaWdnZXIgPSB0b2tlbnMuc3BsaWNlKGlkMS5vcGVuKzEsIGlkMS5jbG9zZSAtIGlkMS5vcGVuIC0gMSk7XHJcblxyXG4gICAgICAgIGlmIChob29rcy5sZW5ndGggPT09IDEgJiYgaG9va3NbMF0/LnR5cGUgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgIGhvb2tzID0gaG9va3NbMF0udmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBob29rczogRXhwZWN0ZWQgYSBzaW5nbGUgbnVtZXJpYyB2YWx1ZS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0cmlnZ2VyLmxlbmd0aCA9PT0gMSAmJiB0cmlnZ2VyWzBdPy50eXBlID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICB0cmlnZ2VyID0gdHJpZ2dlclswXS52YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHRyaWdnZXI6IEV4cGVjdGVkIGEgc2luZ2xlIHN0cmluZyB2YWx1ZS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY29tbWFuZHMucHVzaChuZXcgVGlrekNvbW1hbmQoKS5hZGRDb21tYW5kKHRyaWdnZXIsIGhvb2tzLCBjb250ZW50KSlcclxuICAgIH1cclxuXHJcbiAgICByZXBsYWNlQ2FsbFdpdGhDb21tYW5kKHRyaWdnZXI6IHN0cmluZyxob29rTnVtYmVyOiBudW1iZXIsaG9va3M6IGFueVtdKXtcclxuICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5jb21tYW5kcy5maW5kKGNvbW1hbmQgPT4gXHJcbiAgICAgICAgICAgIGNvbW1hbmQudHJpZ2dlciA9PT0gdHJpZ2dlciAmJiBob29rTnVtYmVyID09PSBjb21tYW5kLmhvb2tOdW1cclxuICAgICAgICApPy5jb250ZW50O1xyXG4gICAgICAgIGlmKCFjb250ZW50KXJldHVybiBudWxsO1xyXG4gICAgICAgIGNvbnN0IG1hcCA9IGNvbnRlbnQ/Lm1hcCgoaXRlbSwgaW5kZXgpID0+IFxyXG4gICAgICAgICAgICBpdGVtLm5hbWUgPT09ICdob29rJyA/IHsgaW5kZXgsIHZhbHVlOiBpdGVtLnZhbHVlIH0gOiBudWxsXHJcbiAgICAgICAgKS5maWx0ZXIodCA9PiB0ICE9PSBudWxsKTtcclxuICAgICAgICBtYXA/LnJldmVyc2UoKTtcclxuXHJcbiAgICAgICAgY29uc3QgdW5pcXVlVmFsdWVzID0gbmV3IFNldCgpO1xyXG4gICAgICAgIGZvciAoY29uc3QgeyBpbmRleCwgdmFsdWUgfSBvZiBtYXAgfHwgW10pIHtcclxuICAgICAgICAgICAgaWYgKCF1bmlxdWVWYWx1ZXMuaGFzKHZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgdW5pcXVlVmFsdWVzLmFkZCh2YWx1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29udGVudC5zcGxpY2UoaW5kZXgsIDEsIC4uLmhvb2tzW3ZhbHVlLTFdKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvbnRlbnRcclxuICAgIH1cclxuXHJcbiAgICBnZXRIb29rcyh0b2tlbnM6IGFueVtdLGlkczogYW55W10pe1xyXG4gICAgICAgIHRva2Vucy5zcGxpY2UoMCwxKVxyXG4gICAgICAgIGNvbnN0IGFkanVzdG1lbnRWYWx1ZT1pZHNbMF0ub3BlblxyXG4gICAgICAgIGlkcy5mb3JFYWNoKGlkID0+IHtcclxuICAgICAgICAgICAgaWQub3Blbi09YWRqdXN0bWVudFZhbHVlO1xyXG4gICAgICAgICAgICBpZC5jbG9zZS09YWRqdXN0bWVudFZhbHVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlkcy5yZXZlcnNlKCk7XHJcbiAgICAgICAgY29uc3QgaG9va3M6IGFueVtdW109W11cclxuICAgICAgICBpZHMuZm9yRWFjaChpZCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQ9dG9rZW5zLnNwbGljZShpZC5vcGVuKzEsaWQuY2xvc2UtKGlkLm9wZW4rMSkpXHJcbiAgICAgICAgICAgIGhvb2tzLnB1c2gocmVtb3ZlZClcclxuICAgICAgICB9KTtcclxuICAgICAgICBob29rcy5yZXZlcnNlKCk7XHJcbiAgICAgICAgcmV0dXJuIGhvb2tzXHJcbiAgICB9XHJcbiAgICBcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEJhc2ljVGlrelRva2Vue1xyXG4gICAgdHlwZTogc3RyaW5nO1xyXG4gICAgbmFtZTogc3RyaW5nXHJcbiAgICB2YWx1ZTogYW55XHJcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTogYW55KXtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlPT09J251bWJlcicpe1xyXG4gICAgICAgICAgICB0aGlzLnR5cGU9J251bWJlcidcclxuICAgICAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcclxuICAgICAgICAgICAgcmV0dXJuIFxyXG4gICAgICAgIH1cclxuICAgICAgICBpZih0eXBlb2YgdmFsdWU9PT0nc3RyaW5nJyl7XHJcbiAgICAgICAgICAgIHRoaXMudHlwZT0nc3RyaW5nJ1xyXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgICAgICAgICByZXR1cm5cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50eXBlPXZhbHVlLnR5cGUucmVwbGFjZSgvQnJhY2tldC8sJ1N5bnRheCcpXHJcbiAgICAgICAgdGhpcy5uYW1lPXZhbHVlLm5hbWVcclxuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlLnZhbHVlXHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIHJldHVybiBnZXRPcmlnaW5hbFRpa3pSZWZlcmVuY2VzKFt0aGlzXSlcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFRpa3pWYXJpYWJsZXtcclxuICAgIC8vdHlwZTogXHJcblxyXG59XHJcbmV4cG9ydCBjbGFzcyBUaWt6VmFyaWFibGVze1xyXG4gICAgdmFyaWFibGVzOiBbXT1bXVxyXG5cclxufVxyXG5cclxuZnVuY3Rpb24gdG9WYXJpYWJsZVRva2VuKGFycjogYW55W10pIHtcclxuICAgIGFycj1hcnIuZmlsdGVyKHQ9PighdC50eXBlLmluY2x1ZGVzKCdQYXJlbnRoZXNlcycpKSlcclxuICAgIGNvbnN0IHRva2VuPW5ldyBCYXNpY1Rpa3pUb2tlbihnZXRPcmlnaW5hbFRpa3pSZWZlcmVuY2VzKGFycikpXHJcbiAgICB0b2tlbi50eXBlPSd2YXJpYWJsZSdcclxuICAgIHJldHVybiB0b2tlblxyXG59XHJcblxyXG5pbnRlcmZhY2UgUGFyZW5QYWlye1xyXG4gICAgb3BlbjpudW1iZXIsXHJcbiAgICBjbG9zZTogbnVtYmVyXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY1Rpa3pUb2tlbnN7XHJcbiAgICBwcml2YXRlIHRva2VuczogQXJyYXk8QmFzaWNUaWt6VG9rZW58Rm9ybWF0dGluZ3xBeGlzPiA9IFtdXHJcbiAgICBwcml2YXRlIHRpa3pDb21tYW5kczogVGlrekNvbW1hbmRzPW5ldyBUaWt6Q29tbWFuZHMoKTtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZyl7XHJcbiAgICAgICAgc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xyXG4gICAgICAgIHRoaXMuYmFzaWNUaWt6VG9rZW5pZnkodGhpcy5iYXNpY0FycmF5aWZ5KHNvdXJjZSkpXHJcbiAgICAgICAgdGhpcy5jbGVhbkJhc2ljVGlrelRva2VuaWZ5KClcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnByZXBhcmVGb3JUb2tlbml6ZSgpXHJcbiAgICB9XHJcbiAgICBnZXRUb2tlbnMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHRpZHlUaWt6U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcclxuICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBiYXNpY0FycmF5aWZ5KHNvdXJjZTogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCBiYXNpY0FycmF5ID0gW107XHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JzUmVnZXggPSBuZXcgUmVnRXhwKCdeJyArIGFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsVGlrelJlZmVyZW5jZXMoKSkpO1xyXG4gICAgICAgIGxldCBpID0gMDtcclxuICAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGkgPCBzb3VyY2UubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN1YlNvdXJjZSA9IHNvdXJjZS5zbGljZShpKTtcclxuICAgICAgICAgICAgbGV0IG1hdGNoO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBNYXRjaCBUaWtaIG9wZXJhdG9yc1xyXG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaChvcGVyYXRvcnNSZWdleCk7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IG1hdGNoWzBdIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBNYXRjaCBudW1iZXJzXHJcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eWy0wLTkuXSsvKTtcclxuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaCh7IHR5cGU6ICdudW1iZXInLCB2YWx1ZTogcGFyc2VOdW1iZXIobWF0Y2hbMF0pIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlthLXpBLVpcXFxcXSsvKTtcclxuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaCh7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogbWF0Y2hbMF0gfSk7XHJcbiAgICAgICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBJbmNyZW1lbnQgaW5kZXggaWYgbm8gbWF0Y2ggZm91bmRcclxuICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gYmFzaWNBcnJheVxyXG4gICAgfVxyXG4gICAgcHJpdmF0ZSBiYXNpY1Rpa3pUb2tlbmlmeShiYXNpY0FycmF5OiBhbnlbXSl7XHJcbiAgICAgICAgIC8vIFByb2Nlc3MgdG9rZW5zXHJcbiAgICAgICAgYmFzaWNBcnJheS5mb3JFYWNoKCh7IHR5cGUsIHZhbHVlIH0pID0+IHtcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aWt6Q29tbWFuZCA9IHNlYXJjaFRpa3pDb21wb25lbnRzKHZhbHVlKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aWt6Q29tbWFuZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljVGlrelRva2VuKHRpa3pDb21tYW5kKSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY1Rpa3pUb2tlbih2YWx1ZSkpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljVGlrelRva2VuKHZhbHVlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBpZFBhcmVudGhlc2VzKHRoaXMudG9rZW5zKVxyXG4gICAgfVxyXG4gICAgcHJpdmF0ZSBpbmZlckFuZEludGVycHJldENvbW1hbmRzKCkge1xyXG4gICAgICAgIC8vIFN0ZXAgMTogRXh0cmFjdCBjb21tYW5kIGluZGljZXNcclxuICAgICAgICBjb25zdCBjb21tYW5kc01hcCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKHQsIGlkeCkgPT4gKHQgaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiAmJiB0LnR5cGUgPT09ICdNYWNybycgPyBpZHggOiBudWxsKSlcclxuICAgICAgICAgICAgLmZpbHRlcigodCkgPT4gdCAhPT0gbnVsbCk7XHJcbiAgICAgICAgY29tbWFuZHNNYXAuZm9yRWFjaCgoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCA9IHRoaXMuZmluZEZpcnN0QnJhY2tldEFmdGVyKGluZGV4LCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xyXG4gICAgICAgICAgICBpZiAoIWZpcnN0QnJhY2tldEFmdGVySW5kZXgpIHJldHVybjtcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBlbmRPZkV4cHJlc3Npb24gPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KFxyXG4gICAgICAgICAgICAgICAgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleC52YWx1ZSxcclxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLFxyXG4gICAgICAgICAgICAgICAgMCxcclxuICAgICAgICAgICAgICAgIDEsXHJcbiAgICAgICAgICAgICAgICAnQ3VybHlfYnJhY2tldHNfb3BlbidcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWYgKCFlbmRPZkV4cHJlc3Npb24pIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwcmVzc2lvbiBlbmQgbm90IGZvdW5kIGZvciBjb21tYW5kIGF0IGluZGV4ICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBjb21tYW5kVG9rZW5zID0gdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LCBNYXRoLmFicyhpbmRleCAtIChlbmRPZkV4cHJlc3Npb24uY2xvc2UgKyAxKSkpO1xyXG4gICAgICAgICAgICB0aGlzLnRpa3pDb21tYW5kcy5hZGRDb21tYW5kQnlJbnRlcnByZXRhdGlvbihjb21tYW5kVG9rZW5zKTtcclxuICAgICAgICB9KTtcclxuICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgMzogTWF0Y2ggY29tbWFuZHMgdG8gdG9rZW5zXHJcbiAgICAgICAgY29uc3QgY29tbWFuZHNJblRva2VucyA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgIC5tYXAoKGl0ZW0sIGluZGV4KSA9PiB0aGlzLm1hdGNoQ29tbWFuZFRvVG9rZW4oaXRlbSwgaW5kZXgpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKCh0KSA9PiB0ICE9PSBudWxsKTtcclxuICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgNDogUHJvY2VzcyBjb25maXJtZWQgY29tbWFuZHNcclxuICAgICAgICBjb25zdCBjb25maXJtZWRDb21tYW5kcyA9IHRoaXMucHJvY2Vzc0NvbmZpcm1lZENvbW1hbmRzKGNvbW1hbmRzSW5Ub2tlbnMpO1xyXG4gICAgXHJcbiAgICAgICAgLy8gU3RlcCA1OiBSZXBsYWNlIHRva2VucyB3aXRoIHByb2Nlc3NlZCBjb21tYW5kc1xyXG4gICAgICAgIHRoaXMucmVwbGFjZVRva2Vuc1dpdGhDb21tYW5kcyhjb25maXJtZWRDb21tYW5kcyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciB0byBmaW5kIHRoZSBmaXJzdCBtYXRjaGluZyBicmFja2V0IGFmdGVyIGEgZ2l2ZW4gaW5kZXhcclxuICAgIHByaXZhdGUgZmluZEZpcnN0QnJhY2tldEFmdGVyKHN0YXJ0SW5kZXg6IG51bWJlciwgYnJhY2tldE5hbWU6IHN0cmluZyk6IEJhc2ljVGlrelRva2VuIHwgbnVsbCB7XHJcbiAgICAgICAgY29uc3QgZmlyc3RCcmFja2V0QWZ0ZXI9dGhpcy50b2tlbnNcclxuICAgICAgICAgICAgLnNsaWNlKHN0YXJ0SW5kZXgpXHJcbiAgICAgICAgICAgIC5maW5kKChpdGVtKSA9PiBpdGVtIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgaXRlbS5uYW1lID09PSBicmFja2V0TmFtZSlcclxuICAgICAgICByZXR1cm4gZmlyc3RCcmFja2V0QWZ0ZXIgaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbj9maXJzdEJyYWNrZXRBZnRlcjpudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gbWF0Y2ggY29tbWFuZHMgdG8gdG9rZW5zXHJcbiAgICBwcml2YXRlIG1hdGNoQ29tbWFuZFRvVG9rZW4oaXRlbTogYW55LCBpbmRleDogbnVtYmVyKTogYW55IHwgbnVsbCB7XHJcbiAgICAgICAgaWYgKCEoaXRlbSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKSB8fCBpdGVtLnR5cGUgIT09ICdzdHJpbmcnKSByZXR1cm4gbnVsbDtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IG1hdGNoID0gdGhpcy50aWt6Q29tbWFuZHMuY29tbWFuZHMuZmluZCgoYykgPT4gYy50cmlnZ2VyID09PSBpdGVtLnZhbHVlKTtcclxuICAgICAgICByZXR1cm4gbWF0Y2ggPyB7IGluZGV4LCAuLi5tYXRjaC5nZXRJbmZvKCkgfSA6IG51bGw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciB0byBwcm9jZXNzIGNvbmZpcm1lZCBjb21tYW5kc1xyXG4gICAgcHJpdmF0ZSBwcm9jZXNzQ29uZmlybWVkQ29tbWFuZHMoY29tbWFuZHNJblRva2VuczogYW55W10pOiB7IGlkczogUGFyZW5QYWlyW107IGluZGV4OiBudW1iZXIgfVtdIHtcclxuICAgICAgICBjb25zdCBjb25maXJtZWRDb21tYW5kcyA9IFtdO1xyXG4gICAgXHJcbiAgICAgICAgZm9yIChjb25zdCB7IGluZGV4LCB0cmlnZ2VyLCBob29rcyB9IG9mIGNvbW1hbmRzSW5Ub2tlbnMpIHtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBob29rcyAhPT0gJ251bWJlcicgfHwgaG9va3MgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGhvb2tzIHZhbHVlIGZvciBjb21tYW5kIGF0IGluZGV4ICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCBmaXJzdEJyYWNrZXRBZnRlckluZGV4ID0gdGhpcy5maW5kRmlyc3RCcmFja2V0QWZ0ZXIoaW5kZXgsICdDdXJseV9icmFja2V0c19vcGVuJyk7XHJcbiAgICAgICAgICAgIGlmICghZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDdXJseV9icmFja2V0c19vcGVuIG5vdCBmb3VuZCBhZnRlciBpbmRleCAke2luZGV4fWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBvYmo6IHsgaWRzOiBQYXJlblBhaXJbXSB9ID0geyBpZHM6IFtdIH07XHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG9va3M7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW5QYWlySW5kZXggPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KFxyXG4gICAgICAgICAgICAgICAgICAgIGZpcnN0QnJhY2tldEFmdGVySW5kZXgudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLFxyXG4gICAgICAgICAgICAgICAgICAgIDAsXHJcbiAgICAgICAgICAgICAgICAgICAgaSxcclxuICAgICAgICAgICAgICAgICAgICAnQ3VybHlfYnJhY2tldHNfb3BlbidcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICBcclxuICAgICAgICAgICAgICAgIGlmICghcGFyZW5QYWlySW5kZXgpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBhcmVuIHBhaXIgbm90IGZvdW5kIGZvciBob29rICR7aX0gYXQgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKG9iai5pZHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhc3RJZCA9IG9iai5pZHNbb2JqLmlkcy5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobGFzdElkLmNsb3NlICE9PSBwYXJlblBhaXJJbmRleC5vcGVuIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgTWlzbWF0Y2ggYmV0d2VlbiBsYXN0IGNsb3NlICgke2xhc3RJZC5jbG9zZX0pIGFuZCBuZXh0IG9wZW4gKCR7cGFyZW5QYWlySW5kZXgub3Blbn0pYFxyXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIG9iai5pZHMucHVzaChwYXJlblBhaXJJbmRleCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uZmlybWVkQ29tbWFuZHMucHVzaCh7IC4uLm9iaiwgaW5kZXggfSk7XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgcmV0dXJuIGNvbmZpcm1lZENvbW1hbmRzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gcmVwbGFjZSB0b2tlbnMgd2l0aCBwcm9jZXNzZWQgY29tbWFuZHNcclxuICAgIHByaXZhdGUgcmVwbGFjZVRva2Vuc1dpdGhDb21tYW5kcyhjb25maXJtZWRDb21tYW5kczogYW55W10pIHtcclxuICAgICAgICBjb25maXJtZWRDb21tYW5kcy5mb3JFYWNoKChjb21tYW5kKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghY29tbWFuZC5pZHMgfHwgY29tbWFuZC5pZHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjogQ29tbWFuZCBJRHMgYXJlIGVtcHR5IG9yIHVuZGVmaW5lZC4nKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IG9wZW4gPSBjb21tYW5kLmluZGV4O1xyXG4gICAgICAgICAgICBjb25zdCBjbG9zZSA9IGNvbW1hbmQuaWRzW2NvbW1hbmQuaWRzLmxlbmd0aCAtIDFdLmNsb3NlO1xyXG4gICAgXHJcbiAgICAgICAgICAgIGlmIChjbG9zZSA8IG9wZW4pIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBDbG9zZSBpbmRleCAoJHtjbG9zZX0pIGlzIHNtYWxsZXIgdGhhbiBvcGVuIGluZGV4ICgke29wZW59KS5gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRlbGV0ZUNvdW50ID0gY2xvc2UgLSBvcGVuICsgMTtcclxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZFRva2VucyA9IHRoaXMudG9rZW5zLnNsaWNlKG9wZW4sIGRlbGV0ZUNvdW50KTtcclxuICAgIFxyXG4gICAgICAgICAgICBjb25zdCByZXBsYWNlbWVudCA9IHRoaXMudGlrekNvbW1hbmRzLnJlcGxhY2VDYWxsV2l0aENvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICBjb21tYW5kLnRyaWdnZXIsXHJcbiAgICAgICAgICAgICAgICBjb21tYW5kLmhvb2tzLFxyXG4gICAgICAgICAgICAgICAgdGhpcy50aWt6Q29tbWFuZHMuZ2V0SG9va3MocmVtb3ZlZFRva2VucywgY29tbWFuZC5pZHMpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKCFyZXBsYWNlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAgICAgICAgIGBSZXBsYWNlbWVudCBnZW5lcmF0aW9uIGZhaWxlZCBmb3IgY29tbWFuZCBhdCBpbmRleCAke2NvbW1hbmQuaW5kZXh9IHdpdGggdHJpZ2dlciAke2NvbW1hbmQudHJpZ2dlcn0uYFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShvcGVuLCBkZWxldGVDb3VudCwgLi4ucmVwbGFjZW1lbnQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcml2YXRlIGNsZWFuQmFzaWNUaWt6VG9rZW5pZnkoKXtcclxuXHJcbiAgICAgICAgdGhpcy5pbmZlckFuZEludGVycHJldENvbW1hbmRzKClcclxuXHJcblxyXG4gICAgICAgIGNvbnN0IHVuaXRJbmRpY2VzOiBudW1iZXJbXSA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJnRva2VuLnR5cGUgPT09ICdVbml0JyA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICAgICAgdW5pdEluZGljZXMuZm9yRWFjaCgodW5pdElkeCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSB0aGlzLnRva2Vuc1t1bml0SWR4IC0gMV07XHJcbiAgICAgICAgICAgIGlmICghKHByZXZUb2tlbiBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKXx8ISh0aGlzLnRva2Vuc1t1bml0SWR4XSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKSlyZXR1cm5cclxuICAgICAgICAgICAgaWYgKCFwcmV2VG9rZW4gfHwgcHJldlRva2VuLnR5cGUgIT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuaXRzIGNhbiBvbmx5IGJlIHVzZWQgaW4gcmVmZXJlbmNlIHRvIG51bWJlcnMgYXQgaW5kZXggJHt1bml0SWR4fWApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBwcmV2VG9rZW4udmFsdWUgPSB0b1BvaW50KHByZXZUb2tlbi52YWx1ZSBhcyBudW1iZXIsIHRoaXMudG9rZW5zW3VuaXRJZHhdLm5hbWUpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLnRva2Vucz10aGlzLnRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCF1bml0SW5kaWNlcy5pbmNsdWRlcyhpZHgpKSk7XHJcblxyXG4gICAgICAgIC8vdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKCh0KSA9PiB0Lm5hbWUhPT0nQ29tbWEnKTtcclxuICAgICAgICAvKlxyXG4gICAgICAgIGNvbnN0IGluZGV4ZXNUb1JlbW92ZTogbnVtYmVyW109W11cclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbixpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBpZih0b2tlbi50eXBlPT09J0Zvcm1hdHRpbmcnKXtcclxuICAgICAgICAgICAgICAgIGlmKHRoaXMudG9rZW5zW2luZGV4KzFdLm5hbWU9PT0nRXF1YWxzJylcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2Vuc1tpbmRleF0udmFsdWU9dGhpcy50b2tlbnNbaW5kZXgrMl1cclxuICAgICAgICAgICAgICAgICAgICBpbmRleGVzVG9SZW1vdmUucHVzaChpbmRleCsxLGluZGV4KzIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICghaW5kZXhlc1RvUmVtb3ZlLmluY2x1ZGVzKGlkeCkpKTsqL1xyXG5cclxuXHJcblxyXG4gICAgICAgIGNvbnN0IG1hcFN5bnRheCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJnRva2VuLnR5cGUgPT09ICdTeW50YXgnICYmIC8oRGFzaHxQbHVzKS8udGVzdCh0b2tlbi5uYW1lKSA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICAgICAgY29uc3Qgc3ludGF4U2VxdWVuY2VzID0gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG1hcFN5bnRheCk7XHJcblxyXG5cclxuICAgICAgICBjb25zdCBzeW50YXhPYmplY3RzID0gc3ludGF4U2VxdWVuY2VzXHJcbiAgICAgICAgLm1hcCgoc2VxdWVuY2UpID0+IHtcclxuICAgICAgICAgICAgaWYgKHNlcXVlbmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IHNlcXVlbmNlWzBdO1xyXG4gICAgICAgICAgICBjb25zdCBlbmQgPSBzZXF1ZW5jZVtzZXF1ZW5jZS5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gc2VxdWVuY2VcclxuICAgICAgICAgICAgICAgIC5tYXAoKGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoISh0b2tlbiBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuKSlyZXR1cm4gJydcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRva2VuIHx8ICF0b2tlbi5uYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgTWlzc2luZyBvciBpbnZhbGlkIHRva2VuIGF0IGluZGV4ICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAnJzsgLy8gUHJvdmlkZSBhIGZhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbi5uYW1lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9EYXNoLywgJy0nKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvUGx1cy8sICcrJyk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmpvaW4oJycpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhcnQsIGVuZCwgdmFsdWUgfTtcclxuICAgICAgICB9KVxyXG5cclxuICAgICAgICAuZmlsdGVyKChvYmopID0+IG9iaiAhPT0gbnVsbClcclxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5zdGFydCAtIGEuc3RhcnQpO1xyXG5cclxuICAgICAgICBzeW50YXhPYmplY3RzLmZvckVhY2goKHsgc3RhcnQsIGVuZCwgdmFsdWUgfSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb21tYW5kID0gc2VhcmNoVGlrekNvbXBvbmVudHModmFsdWUpOyBcclxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBuZXcgQmFzaWNUaWt6VG9rZW4oY29tbWFuZClcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBlbmQgKyAxIC0gc3RhcnQsIHRva2VuKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHByZXBhcmVGb3JUb2tlbml6ZSgpe1xyXG4gICAgICAgIGNvbnN0IHNxdWFyZUJyYWNrZXRJbmRleGVzID0gbWFwQnJhY2tldHMoJ1NxdWFyZV9icmFja2V0c19vcGVuJyx0aGlzLnRva2VucylcclxuICAgICAgICBzcXVhcmVCcmFja2V0SW5kZXhlc1xyXG4gICAgICAgIC5zb3J0KChhOiB7IG9wZW46IG51bWJlcjsgfSwgYjogeyBvcGVuOiBudW1iZXI7IH0pID0+IGIub3BlbiAtIGEub3BlbikgLy8gU29ydCBpbiBkZXNjZW5kaW5nIG9yZGVyIG9mICdvcGVuJ1xyXG4gICAgICAgIC5mb3JFYWNoKChpbmRleDogeyBvcGVuOiBudW1iZXI7IGNsb3NlOiBudW1iZXI7IH0pID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZyA9IG5ldyBGb3JtYXR0aW5nKFxyXG4gICAgICAgICAgICAgICAgY2xlYW5Gb3JtYXR0aW5nKHRoaXMudG9rZW5zLnNsaWNlKGluZGV4Lm9wZW4gKyAxLCBpbmRleC5jbG9zZSkpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCBmb3JtYXR0aW5nKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy9sZXQgcHJhbmVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgbGV0IGNvb3JkaW5hdGVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2VucylcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IGNsb3NlOiBudW1iZXI7IH0saWR4OiBhbnkpPT50aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJih0aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdYXMgQmFzaWNUaWt6VG9rZW4pLnZhbHVlIT09J2F0JylcclxuICAgICAgICAvKlxyXG4gICAgICAgIGNvbnN0IHsgY29vcmRpbmF0ZUluZGV4ZXMsIHZhcmlhYmxlSW5kZXhlcyB9ID0gcHJhbmVJbmRleGVzLnJlZHVjZSgocmVzdWx0LCBpdGVtKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tpdGVtLmNsb3NlICsgMV0/LnZhbHVlICE9PSAnYXQnKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQuY29vcmRpbmF0ZUluZGV4ZXMucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgfSBcclxuICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UgKyAxXT8udmFsdWUgPT09ICdhdCcpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC52YXJpYWJsZUluZGV4ZXMucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH0sIHsgY29vcmRpbmF0ZUluZGV4ZXM6IFtdLCB2YXJpYWJsZUluZGV4ZXM6IFtdIH0pOyovXHJcbiAgICAgICAgY29vcmRpbmF0ZUluZGV4ZXNcclxuICAgICAgICAuc29ydCgoYTogeyBvcGVuOiBudW1iZXI7IH0sIGI6IHsgb3BlbjogbnVtYmVyOyB9KSA9PiBiLm9wZW4gLSBhLm9wZW4pIFxyXG4gICAgICAgIC5mb3JFYWNoKChpbmRleDogeyBvcGVuOiBudW1iZXI7IGNsb3NlOiBudW1iZXIgOyB9KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF4aXMgPSBuZXcgQXhpcygpLnBhcnNlSW5wdXQoXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGlmICghYXhpcylyZXR1cm5cclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGF4aXMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBsZXQgdmFyaWFibGVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2VucylcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiB7IGNsb3NlOiBudW1iZXI7IH0saWR4OiBhbnkpPT50aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4mJih0aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdYXMgQmFzaWNUaWt6VG9rZW4pLnZhbHVlIT09J2F0JylcclxuXHJcbiAgICAgICAgdmFyaWFibGVJbmRleGVzXHJcbiAgICAgICAgLnNvcnQoKGE6IHsgb3BlbjogbnVtYmVyOyB9LCBiOiB7IG9wZW46IG51bWJlcjsgfSkgPT4gYi5vcGVuIC0gYS5vcGVuKSBcclxuICAgICAgICAuZm9yRWFjaCgoaW5kZXg6IHsgb3BlbjogbnVtYmVyIDsgY2xvc2U6IG51bWJlciA7IH0pID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coaW5kZXgsdGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UpKVxyXG4gICAgICAgICAgICBjb25zdCB2YXJpYWJsZSA9IHRvVmFyaWFibGVUb2tlbih0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2codmFyaWFibGUpXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCB2YXJpYWJsZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIEZvcm1hdFRpa3pqYXgge1xyXG5cdHNvdXJjZTogc3RyaW5nO1xyXG4gICAgdG9rZW5zOiBBcnJheTxUb2tlbj49W107XHJcbiAgICB0aWt6Q29tbWFuZHM6IFRpa3pDb21tYW5kcz1uZXcgVGlrekNvbW1hbmRzKCk7XHJcbiAgICAvL21pZFBvaW50OiBBeGlzO1xyXG4gICAgcHJpdmF0ZSB2aWV3QW5jaG9yczoge21heDogQXhpcyxtaW46QXhpcyxhdmVNaWRQb2ludDogQXhpc31cclxuXHRwcm9jZXNzZWRDb2RlPVwiXCI7XHJcbiAgICBkZWJ1Z0luZm8gPSBcIlwiO1xyXG4gICAgXHJcblx0Y29uc3RydWN0b3Ioc291cmNlOiBzdHJpbmcpIHtcclxuICAgICAgICBpZighc291cmNlLm1hdGNoKC8odXNlcGFja2FnZXx1c2V0aWt6bGlicmFyeSkvKSl7XHJcblx0XHQvL2NvbnN0IGJhc2ljVGlrelRva2Vucz1uZXcgQmFzaWNUaWt6VG9rZW5zKHNvdXJjZSlcclxuICAgICAgICAvL2NvbnNvbGUubG9nKCdiYXNpY1Rpa3pUb2tlbnMnLGJhc2ljVGlrelRva2VucylcclxuICAgICAgICAvL3RoaXMudG9rZW5pemUoYmFzaWNUaWt6VG9rZW5zLmdldFRva2VucygpKVxyXG4gICAgICAgIC8vY29uc29sZS5sb2coJ3Rva2VuaXplJyx0aGlzLnRva2VucylcclxuICAgICAgICAvL3RoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnRvU3RyaW5nKClcclxuXHJcbiAgICAgICAgLy90aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vZWxzZSB7dGhpcy5wcm9jZXNzZWRDb2RlPXNvdXJjZTt9XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlPXRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5wcm9jZXNzZWRDb2RlO1xyXG5cdH1cclxuXHJcbiAgICBwcml2YXRlIHRpZHlUaWt6U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcclxuICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgdG9rZW5pemUoYmFzaWNUaWt6VG9rZW5zOiBhbnlbXSl7XHJcbiAgICAgICAgbGV0IGVuZEluZGV4XHJcbiAgICAgICAgZm9yKGxldCBpPTA7aTxiYXNpY1Rpa3pUb2tlbnMubGVuZ3RoO2krKyl7XHJcbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdEcmF3Jyl7XHJcbiAgICAgICAgICAgICAgICBlbmRJbmRleD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSkuZmluZEluZGV4KHQ9PnQubmFtZT09PSdTZW1pY29sb24nKStpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzZWdtZW50PWJhc2ljVGlrelRva2Vucy5zbGljZShpKzEsZW5kSW5kZXgpXHJcbiAgICAgICAgICAgICAgICBpPWVuZEluZGV4XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KCdkcmF3JykuZmlsbENvb3JkaW5hdGVzKHNlZ21lbnQpKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdDb29yZGluYXRlJyl7XHJcbiAgICAgICAgICAgICAgICBlbmRJbmRleD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSkuZmluZEluZGV4KHQ9PnQubmFtZT09PSdTZW1pY29sb24nKStpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzZWdtZW50PWJhc2ljVGlrelRva2Vucy5zbGljZShpKzEsZW5kSW5kZXgpXHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzZWdtZW50KVxyXG4gICAgICAgICAgICAgICAgaT1lbmRJbmRleFxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSgnY29vcmRpbmF0ZScpLmludGVycHJldENvb3JkaW5hdGUoc2VnbWVudCkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLypcclxuICAgICAgICBUaGV5J3JlIGdvaW5nIHRvIGJlIHRocmVlIHR5cGVzIHN0cmluZ2VkIHN5bnRheCBudW1iZXIuXHJcbiAgICAgICAgIEkgdXNlIHRoZW0gdG8gdG9rZW5pemUuIHVzaW5nIHRoZSB0aWNrcyBjb21tYW5kcy4gT25jZSB0b2tlbml6ZXIgdGFrZXMgY29tbWFuZHMuXHJcbiAgICAgICAgIEkgbW92ZSBvbiB0byBhY3R1YWwgZXZhbHVhdGlvbi5cclxuICAgICAgICAqL1xyXG5cclxuICAgICAgICBcclxuICAgICAgICBsZXQgc3ViZGVmaW5lZFRva2Vucz1bXTtcclxuICAgICAgICAvKlxyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPGJhc2ljVGlrelRva2Vucy5sZW5ndGg7aSsrKXtcclxuXHJcbiAgICAgICAgfSovXHJcbiAgICB9XHJcblxyXG4gICAgZ2V0Q29kZSgpe1xyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5zb3VyY2U9PT1cInN0cmluZ1wiJiZ0aGlzLnNvdXJjZS5tYXRjaCgvKHVzZXBhY2thZ2V8dXNldGlremxpYnJhcnkpLykpe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wcm9jZXNzZWRDb2RlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBnZXRQcmVhbWJsZSgpK3RoaXMucHJvY2Vzc2VkQ29kZStcIlxcblxcXFxlbmR7dGlrenBpY3R1cmV9XFxcXGVuZHtkb2N1bWVudH1cIjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgYXBwbHlQb3N0UHJvY2Vzc2luZygpe1xyXG4gICAgICAgIGNvbnN0IGZsYXRBeGVzPWZsYXR0ZW4odGhpcy50b2tlbnMpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgICAgICBmbGF0QXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XHJcbiAgICAgICAgICAgIGF4aXMuYWRkUXVhZHJhbnQodGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZsYXREcmF3PWZsYXR0ZW4odGhpcy50b2tlbnMsW10sRHJhdykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIERyYXcpO1xyXG4gICAgICAgIGZsYXREcmF3LmZvckVhY2goKGRyYXc6IERyYXcpID0+IHtcclxuICAgICAgICAgICAgZm9yIChjb25zdCAgW2luZGV4LCBjb29yXSBvZiBkcmF3LmNvb3JkaW5hdGVzLmVudHJpZXMoKSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGNvb3IgaW5zdGFuY2VvZiBDb29yZGluYXRlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29vci5mb3JtYXR0aW5nPy5hZGRTcGxvcEFuZFBvc2l0aW9uKGRyYXcuY29vcmRpbmF0ZXMsaW5kZXgpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgIH1cclxuXHJcbiAgICAvKlxyXG4gICAgdG9rZW5pemUoKSB7XHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHMtLC46fGA7IC8vIERlZmluZSBhbGxvd2VkIGNoYXJhY3RlcnMgZm9yIGBjYWBcclxuICAgICAgICBjb25zdCBjID0gU3RyaW5nLnJhd2BbJChdezAsMn1bJHtjYX1dK1spJF17MCwyfXxcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K10rXFwoWyR7Y2F9XStcXClcXCRgO1xyXG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB3aXRoIGVzY2FwZWQgY2hhcmFjdGVycyBmb3Igc3BlY2lmaWMgbWF0Y2hpbmdcclxuICAgICAgICBjb25zdCBjbiA9IFN0cmluZy5yYXdgW1xcd19cXGRcXHNdYDsgLy8gQ29vcmRpbmF0ZSBuYW1lXHJcbiAgICAgICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXFxcIj9cXCRbXFx3XFxkXFxzXFwtLC46KCEpXFwtXFx7XFx9XFwrXFxcXCBeXSpcXCRcXFwiP3xbXFx3XFxkXFxzXFwtLC46KCEpX1xcLVxcK1xcXFxeXSpgOyAvLyBUZXh0IHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xyXG4gICAgICAgIGNvbnN0IGYgPSBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsuJipcXHtcXH0lXFwtPD5dYDsgLy8gRm9ybWF0dGluZyB3aXRoIHNwZWNpZmljIGNoYXJhY3RlcnNcclxuXHJcbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHVzaW5nIGVzY2FwZWQgYnJhY2VzIGFuZCBwYXR0ZXJuc1xyXG4gICAgICAgIGNvbnN0IGNvb3JSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vclxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBwaWNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxccGljXFx7KCR7Y30pXFx9XFx7KCR7Y30pXFx9XFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBub2RlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgc2UgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHMqXFwoKigke2NufSlcXCkqXFxzKmF0XFxzKlxcKCgke2N9KVxcKVxccypcXFsoJHtmfSopXFxdXFxzKlxceygke3R9KVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBzcyA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vcmRpbmF0ZVxccyooXFxbbGFiZWw9XFx7XFxbKC4qPylcXF06XFxcXFxcdypcXHMqKFtcXHdcXHNdKilcXH1cXF0pP1xccypcXCgoJHtjbn0rKVxcKVxccyphdFxccypcXCgoJHtjfSlcXCk7YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGRyYXdSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZHJhd1xcWygke2Z9KilcXF0oW147XSopO2AsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCB4eWF4aXNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxceHlheGlzeygke3R9KX17KCR7dH0pfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBncmlkUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGdyaWR7KFtcXGQtLl0rKX1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgY2lyY2xlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNpcmNsZVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceyhbXFx3XFxzXFxkXSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IG1hc3NSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbWFzc1xceygke2N9KVxcfVxceygke3R9KVxcfVxceygtXFx8fFxcfHw+KXswLDF9XFx9XFx7KFtcXGQuXSopXFx9YCxcImdcIik7XHJcbiAgICAgICAgLy9cXHBpY3thbmMyfXthbmMxfXthbmMwfXs3NV5cXGNpcmMgfXt9O1xyXG4gICAgICAgIGNvbnN0IHZlY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx2ZWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzZSwgc3MsIG5vZGVSZWdleCwgZHJhd1JlZ2V4LCBjaXJjbGVSZWdleCwgbWFzc1JlZ2V4LCB2ZWNSZWdleCxwaWNSZWdleF07XHJcbiAgICAgICAgbGV0IG1hdGNoZXM6IGFueVtdPVtdO1xyXG4gICAgICAgIHJlZ2V4UGF0dGVybnMuZm9yRWFjaChhYiA9PiB7XHJcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IChhLmluZGV4IHx8IDApIC0gKGIuaW5kZXggfHwgMCkpO1xyXG5cclxuICAgICAgICBbeHlheGlzUmVnZXgsZ3JpZFJlZ2V4XS5mb3JFYWNoKGFiID0+IHtcclxuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcclxuICAgICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcclxuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkICYmIG1hdGNoLmluZGV4ID4gY3VycmVudEluZGV4KSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4LCBtYXRjaC5pbmRleCkpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yXCIpKSB7XHJcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzJdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFs0XX1cclxuICAgICAgICAgICAgaWYobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yZGluYXRlXCIpKXtcclxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzVdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFs0XSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbMl19KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IHsgZm9ybWF0dGluZyxvcmlnaW5hbCwgLi4ucmVzdCB9ID0gaTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJjb29yZGluYXRlXCIsYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwob3JpZ2luYWwsdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJjb29yZGluYXRlXCIsIHVuZGVmaW5lZCxmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcclxuXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxccGljXCIpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpXHJcbiAgICAgICAgICAgIGNvbnN0IGMyPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzJdLHRoaXMpXHJcbiAgICAgICAgICAgIGNvbnN0IGMzPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzNdLHRoaXMpXHJcblxyXG5cclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7bW9kZTogXCJwaWMtYW5nXCIsdG9rZW5zOiB0aGlzLGZvcm1hdHRpbmdTdHJpbmc6IG1hdGNoWzVdLGZvcm1hdHRpbmdPYmo6IHt0aWt6c2V0OiBcImFuZ1wiLGljVGV4dDogbWF0Y2hbNF19LGRyYXdBcnI6IFtjMSxjMixjM119KSk7XHJcbiAgICAgICAgICB9ZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxkcmF3XCIpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcodW5kZWZpbmVkLG1hdGNoWzFdLG1hdGNoWzJdLCB0aGlzKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxceHlheGlzXCIpKSB7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xyXG4gICAgICAgICAgICAvL3RoaXMudG9rZW5zLnB1c2goe3R5cGU6IFwiZ3JpZFwiLCByb3RhdGU6IG1hdGNoWzFdfSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbm9kZVwiKSkge1xyXG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFszXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119XHJcbiAgICAgICAgICAgIGlmIChtYXRjaFswXS5tYXRjaCgvXFxcXG5vZGVcXHMqXFwoLykpe1xyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbMl0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzFdLGxhYmVsOiBtYXRjaFs0XSxmb3JtYXR0aW5nOiBtYXRjaFszXX0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IHsgZm9ybWF0dGluZyxvcmlnaW5hbCwgLi4ucmVzdCB9ID0gaTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlXCIsYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwob3JpZ2luYWwsdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIsIHVuZGVmaW5lZCxmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjaXJjbGVcIikpIHsvKlxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHtcclxuICAgICAgICAgICAgICB0eXBlOiBcImNpcmNsZVwiLFxyXG4gICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG1hdGNoWzRdLFxyXG4gICAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBbXHJcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzFdLCB0aGlzLnRva2VucyksXHJcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzJdLCB0aGlzLnRva2VucyksXHJcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzNdLCB0aGlzLnRva2VucyksXHJcbiAgICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgfSk7KlxyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXG1hc3NcIikpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlXCIsbGFiZWw6IG1hdGNoWzJdLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZVwiLHt0aWt6c2V0OiAnbWFzcycsYW5jaG9yOiBtYXRjaFszXSxyb3RhdGU6IG1hdGNoWzRdfSl9KSlcclxuXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcdmVjXCIpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpO1xyXG4gICAgICAgICAgICBjb25zdCBheGlzMT1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKTtcclxuICAgICAgICAgICAgY29uc3Qgbm9kZT1uZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlLWlubGluZVwiLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKCdub2RlLWlubGluZScse2NvbG9yOiBcInJlZFwifSl9KVxyXG5cclxuICAgICAgICAgICAgY29uc3QgYzE9bmV3IENvb3JkaW5hdGUoXCJub2RlLWlubGluZVwiKTtcclxuICAgICAgICAgICAgY29uc3QgcT1bYW5jZXIsJy0tKycsbm9kZSxheGlzMV1cclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7Zm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6ICd2ZWMnfSx0b2tlbnM6IHRoaXMsZHJhd0FycjogcX0pKVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRJbmRleCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY3VycmVudEluZGV4IDwgdGhpcy5zb3VyY2UubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSovXHJcbiAgICBnZXRNaW4oKXtyZXR1cm4gdGhpcy52aWV3QW5jaG9ycy5taW59XHJcbiAgICBnZXRNYXgoKXtyZXR1cm4gdGhpcy52aWV3QW5jaG9ycy5tYXh9XHJcblxyXG4gICAgZmluZFZpZXdBbmNob3JzKCkge1xyXG4gICAgICAgIGNvbnN0IGF4ZXMgPSBmbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSkgPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBzdW1PZlggPSAwLCBzdW1PZlkgPSAwO1xyXG4gICAgICAgIGxldCBtYXhYID0gLUluZmluaXR5LCBtYXhZID0gLUluZmluaXR5O1xyXG4gICAgICAgIGxldCBtaW5YID0gSW5maW5pdHksIG1pblkgPSBJbmZpbml0eTtcclxuICAgIFxyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMgPSB7XHJcbiAgICAgICAgICAgIG1heDogbmV3IEF4aXMoMCwgMCksXHJcbiAgICAgICAgICAgIG1pbjogbmV3IEF4aXMoMCwgMCksXHJcbiAgICAgICAgICAgIGF2ZU1pZFBvaW50OiBuZXcgQXhpcygwLCAwKVxyXG4gICAgICAgIH07XHJcbiAgICBcclxuICAgICAgICBheGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeyBjYXJ0ZXNpYW5YLCBjYXJ0ZXNpYW5ZIH0gPSBheGlzO1xyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBzdW1zIGZvciBhdmVyYWdlIGNhbGN1bGF0aW9uXHJcbiAgICAgICAgICAgIHN1bU9mWCArPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBzdW1PZlkgKz0gY2FydGVzaWFuWTtcclxuICAgIFxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgbWF4IGFuZCBtaW4gY29vcmRpbmF0ZXNcclxuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblggPiBtYXhYKSBtYXhYID0gY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPiBtYXhZKSBtYXhZID0gY2FydGVzaWFuWTtcclxuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblggPCBtaW5YKSBtaW5YID0gY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPCBtaW5ZKSBtaW5ZID0gY2FydGVzaWFuWTtcclxuICAgICAgICB9KTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGxlbmd0aCA9IGF4ZXMubGVuZ3RoICE9PSAwID8gYXhlcy5sZW5ndGggOiAxO1xyXG4gICAgXHJcbiAgICAgICAgLy8gU2V0IHRoZSB2aWV3QW5jaG9yc1xyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQgPSBuZXcgQXhpcyhzdW1PZlggLyBsZW5ndGgsIHN1bU9mWSAvIGxlbmd0aCk7XHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5tYXggPSBuZXcgQXhpcyhtYXhYLCBtYXhZKTtcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLm1pbiA9IG5ldyBBeGlzKG1pblgsIG1pblkpO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgZmluZE9yaWdpbmFsVmFsdWUodmFsdWU6IHN0cmluZykge1xyXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7LypcclxuICAgICAgICBjb25zdCBvZyA9IHRoaXMudG9rZW5zLnNsaWNlKCkucmV2ZXJzZSgpLmZpbmQoXHJcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XHJcbiAgICAgICAgICAgICAgICAodG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKSAmJiB0b2tlbi5jb29yZGluYXRlTmFtZSA9PT0gdmFsdWVcclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkOyovXHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIGxldCBjb2RlQmxvY2tPdXRwdXQgPSBcIlwiO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCd0aGlzLnRva2VucycsdGhpcy50b2tlbnMpXHJcbiAgICAgICAgLy9jb25zdCBleHRyZW1lWFk9Z2V0RXh0cmVtZVhZKHRoaXMudG9rZW5zKTtcclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKHRva2VuLnRvU3RyaW5nKCkpe1xyXG4gICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9dG9rZW4udG9TdHJpbmcoKVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gdG9rZW47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGNvZGVCbG9ja091dHB1dDtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGZsYXR0ZW4oZGF0YTogYW55LCByZXN1bHRzOiBhbnlbXSA9IFtdLCBzdG9wQ2xhc3M/OiBhbnkpOiBhbnlbXSB7XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xyXG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xyXG4gICAgICAgIGZsYXR0ZW4oaXRlbSwgcmVzdWx0cywgc3RvcENsYXNzKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgZGF0YSAhPT0gbnVsbCkge1xyXG4gICAgICAvLyBJZiB0aGUgb2JqZWN0IGlzIGFuIGluc3RhbmNlIG9mIHRoZSBzdG9wQ2xhc3MsIGFkZCBpdCB0byByZXN1bHRzIGFuZCBzdG9wIGZsYXR0ZW5pbmdcclxuICAgICAgaWYgKHN0b3BDbGFzcyAmJiBkYXRhIGluc3RhbmNlb2Ygc3RvcENsYXNzKSB7XHJcbiAgICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHRzO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIC8vIEFkZCB0aGUgY3VycmVudCBvYmplY3QgdG8gcmVzdWx0c1xyXG4gICAgICByZXN1bHRzLnB1c2goZGF0YSk7XHJcbiAgXHJcbiAgICAgIC8vIFJlY3Vyc2l2ZWx5IGZsYXR0ZW4gcHJvcGVydGllcyBvZiB0aGUgb2JqZWN0XHJcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIGRhdGEpIHtcclxuICAgICAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcbiAgICAgICAgICBmbGF0dGVuKGRhdGFba2V5XSwgcmVzdWx0cywgc3RvcENsYXNzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHRzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRFeHRyZW1lWFkodG9rZW5zOiBhbnkpIHtcclxuICAgIGxldCBtYXhYID0gLUluZmluaXR5O1xyXG4gICAgbGV0IG1heFkgPSAtSW5maW5pdHk7XHJcbiAgICBsZXQgbWluWCA9IEluZmluaXR5O1xyXG4gICAgbGV0IG1pblkgPSBJbmZpbml0eTtcclxuICAgIFxyXG4gICAgdG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcclxuICAgICAgICBpZiAodG9rZW4uWCA+IG1heFgpIG1heFggPSB0b2tlbi5YO1xyXG4gICAgICAgIGlmICh0b2tlbi5YIDwgbWluWCkgbWluWCA9IHRva2VuLlg7XHJcbiAgICBcclxuICAgICAgICBpZiAodG9rZW4uWSA+IG1heFkpIG1heFkgPSB0b2tlbi5ZO1xyXG4gICAgICAgIGlmICh0b2tlbi5ZIDwgbWluWSkgbWluWSA9IHRva2VuLlk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgbWF4WCxtYXhZLG1pblgsbWluWSxcclxuICAgIH07XHJcbn1cclxuXHJcbmNvbnN0IHBhcnNlTnVtYmVyID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcclxuICAgIGNvbnN0IG51bWJlclZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtYmVyVmFsdWUpID8gMCA6IG51bWJlclZhbHVlO1xyXG59O1xyXG5cclxuXHJcblxyXG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xyXG5cclxuZnVuY3Rpb24gZ2V0U3R5RmlsZUNvbnRlbnQoZmlsZVBhdGg6IGZzLlBhdGhPckZpbGVEZXNjcmlwdG9yKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIHJldHVybiBmcy5yZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGY4Jyk7IC8vIFJlYWQgdGhlIGZpbGUgc3luY2hyb25vdXNseVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZWFkaW5nIHRoZSAuc3R5IGZpbGU6JywgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybiAnJzsgLy8gUmV0dXJuIGFuIGVtcHR5IHN0cmluZyBvbiBlcnJvclxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRQcmVhbWJsZSgpOnN0cmluZ3tcclxuICAgIGNvbnN0IHN0eUNvbnRlbnQgPSBnZXRTdHlGaWxlQ29udGVudCgnL1VzZXJzL21vc2hlL0Rlc2t0b3Avc2Nob29sL29ic2lkaWFuL2RhdGEvRmlsZXMvcHJlYW1ibGUuc3R5Jyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGFuZz1cIlxcXFx0aWt6c2V0e2FuZy8uc3R5bGUgMiBhcmdzPXtmaWxsPWJsYWNrITUwLG9wYWNpdHk9MC41LHRleHQgb3BhY2l0eT0wLjksZHJhdz1vcmFuZ2UsPC0+LGFuZ2xlIGVjY2VudHJpY2l0eT0jMSxhbmdsZSByYWRpdXM9IzJjbSx0ZXh0PW9yYW5nZSxmb250PVxcXFxsYXJnZX0sYW5nLy5kZWZhdWx0PXsxLjZ9ezAuNX19XCJcclxuICBcclxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXHJcbiAgXHJcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxyXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXHJcbiAgICBjb25zdCBzcHJpbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcc3ByaW5nfVs0XXtcXFxcdGlrem1hdGh7Y29vcmRpbmF0ZSBcXFxcc3RhcnQsIFxcXFxkb25lO1xcXFxzdGFydCA9ICgjMSk7XFxcXGRvbmUgPSAoIzIpO31cXFxcZHJhd1t0aGlja10gKCQoXFxcXHN0YXJ0KSArICgtMS41LDApJCkgLS0rKygzLDApO1xcXFxkcmF3IChcXFxcc3RhcnQpIC0tKyAoMCwtMC4yNWNtKTtcXFxcZHJhdyAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCswY20sXFxcXGRvbmV5KzAuMjVjbSkkKS0tKygwLC0wLjI1KTtcXFxcZHJhd1tkZWNvcmF0aW9uPXthc3BlY3Q9MC4zLCBzZWdtZW50IGxlbmd0aD0zLCBhbXBsaXR1ZGU9Mm1tLGNvaWwsfSxkZWNvcmF0ZV0gKFxcXFxzdGFydHgsXFxcXHN0YXJ0eS0wLjI1Y20pIC0tKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KzAuMjVjbSkkKW5vZGVbbWlkd2F5LHJpZ2h0PTAuMjVjbSxibGFja117IzR9O1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkpJCl7IzN9O31cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcclxuICAgIFxyXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcclxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcclxuICAgIGNvbnN0IG1hc3M9YFxcXFxkZWZcXFxcbWFzcyMxIzJ7XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgjMSl7IzJ9O31gXHJcbiAgICBjb25zdCBtYXNzU2V0PVwiXFxcXHRpa3pzZXR7IG1hc3MvLnN0eWxlPXtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2t9fVwiXHJcbiAgICBjb25zdCBkdmVjdG9yPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGR2ZWN0b3J9WzJde1xcXFxjb29yZGluYXRlICh0ZW1wMSkgYXQgKCQoMCwwIC18ICMxKSQpO1xcXFxjb29yZGluYXRlICh0ZW1wMikgYXQgKCQoMCwwIHwtICMxKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTAuN3B0LCMyXSAoIzEpLS0odGVtcDEpKCMxKS0tKHRlbXAyKTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgcGljQW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFuZ31bNV17XFxcXGNvb3JkaW5hdGUgKGFuZzEpIGF0ICgjMSk7IFxcXFxjb29yZGluYXRlIChhbmcyKSBhdCAoIzIpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMykgYXQgKCMzKTsgXFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzN9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMX17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0FCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHBhcnNle1xcXFxhbmdDQiAtIFxcXFxhbmdBQn1cXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdDwwcHRcXFxccGdmbWF0aHBhcnNle1xcXFxwZ2ZtYXRocmVzdWx0ICsgMzYwfVxcXFxmaVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PjE4MHB0XFxcXHBnZm1hdGhwYXJzZXszNjAgLSBcXFxccGdmbWF0aHJlc3VsdH1cXFxcZmlcXFxcbGV0XFxcXGFuZ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoc2V0bWFjcm97XFxcXGFuZ2xlQ2hlY2t9e2FicyhcXFxcYW5nQiAtIDkwKX1cXFxcaWZ0aGVuZWxzZXtcXFxcbGVuZ3RodGVzdHtcXFxcYW5nbGVDaGVjayBwdCA8IDAuMXB0fX17XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17cmlnaHQgYW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXthbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9fVwiXHJcbiAgICBjb25zdCBwcmVhbWJsZT1cIlxcXFx1c2VwYWNrYWdle3BnZnBsb3RzLGlmdGhlbn1cXFxcdXNldGlremxpYnJhcnl7YXJyb3dzLm1ldGEsYW5nbGVzLHF1b3Rlcyxwb3NpdGlvbmluZywgY2FsYywgaW50ZXJzZWN0aW9ucyxkZWNvcmF0aW9ucy5tYXJraW5ncyxtYXRoLHNweSxtYXRyaXgscGF0dGVybnMsc25ha2VzLGRlY29yYXRpb25zLnBhdGhyZXBsYWNpbmcsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcclxuICAgIFxyXG4gICAgcmV0dXJuIHByZWFtYmxlK3N0eUNvbnRlbnQrYW5nK21hcmsrYXJyK2xlbmUrc3ByaW5nK3RyZWUrdGFibGUrY29vcitkdmVjdG9yK3BpY0FuZyttYXNzU2V0K1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcclxufSJdfQ==