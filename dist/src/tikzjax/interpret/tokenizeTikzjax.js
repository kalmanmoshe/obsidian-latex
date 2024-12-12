// @ts-nocheck
import { findConsecutiveSequences } from "src/mathEngine";
import { arrToRegexString, Axis, Coordinate, Draw, Formatting, toPoint } from "../tikzjax";
import { getAllTikzReferences, searchTizkCommands, searchTizkForOgLatex } from "src/tikzjax/tikzCommands";
import { findModifiedParenIndex, findParenIndex, idParentheses, mapBrackets } from "src/utils/tokenUtensils";
function labelFreeFormTextSeparation(label) {
    const colonIndex = label.findIndex(t => t.name === 'Colon');
    label = label.splice(colonIndex, label.length - colonIndex);
    return label.splice(1);
}
function toOg(tokens) {
    let string = '';
    tokens.forEach(token => {
        const og = searchTizkForOgLatex(token.name || token.value);
        if (og) {
            if (og.latex)
                string += og.latex;
            else if (og.references?.length === 1)
                string += og.references[0];
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
        formattingKeys.push({ key: 'freeFormText', value: toOg(label) });
    }
    const bracketMap = mapBrackets('Curly_brackets_open', formatting);
    bracketMap.reverse();
    bracketMap.forEach(bracket => {
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
    addCommand(tokens) {
    }
    addCommandByInterpretation(tokens) {
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
        return searchTizkForOgLatex(this.name).latex;
    }
}
export class TikzVariable {
}
export class TikzVariables {
    variables = [];
}
function toVariableToken(arr) {
    arr = arr.filter(t => (!t.type.includes('Parentheses')));
    arr = toOg(arr);
    token = new BasicTikzToken(arr);
    token.type = 'variable';
    return token;
}
export class BasicTikzTokens {
    tokens = [];
    tikzCommands = new TikzCommands();
    constructor(source) {
        source = this.tidyTikzSource(source);
        source = this.basicArrayify(source);
        this.basicTikzTokenify(source);
        this.cleanBasicTikzTokenify();
        //console.log('cleanBasicTikzTokenify',this.tokens)
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
                const tikzCommand = searchTizkCommands(value);
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
        const commandsMap = this.tokens.map((t, idx) => t.type === 'Command' ? idx : null)
            .filter(t => t !== null);
        commandsMap.forEach(index => {
            const firstBracketAfterIndex = this.tokens.slice(index).find((item, idx) => item.name === 'Curly_brackets_open');
            const endOfExpression = findModifiedParenIndex(firstBracketAfterIndex.value, undefined, this.tokens, 0, 1, 'Curly_brackets_open');
            const command = this.tokens.splice(index, Math.abs(index - (endOfExpression.close + 1)));
            this.tikzCommands.addCommandByInterpretation(command);
        });
        const commands = this.tikzCommands.commands.map(c => c.getInfo());
        const commandsInTokens = this.tokens.map((item, index) => {
            if (item.type !== 'string') {
                return null;
            }
            const match = commands.find(c => c.trigger === item.value);
            if (match) {
                return { index: index, ...match };
            }
            return null;
        }).filter(t => t !== null);
        const founAndConfirmedCommands = [];
        for (const [index, { trigger, hooks }] of Object.entries(commandsInTokens)) {
            const numericIndex = Number(index); // Ensure index is a number
            const firstBracketAfterIndex = this.tokens
                .slice(numericIndex)
                .find((item) => item.name === 'Curly_brackets_open')?.value;
            if (!firstBracketAfterIndex) {
                throw new Error("Curly_brackets_open not found after index " + index);
            }
            if (typeof hooks !== 'number' || hooks <= 0) {
                throw new Error(`Invalid hooks value at index ${index}`);
            }
            const obj = { index, trigger, hooks, ids: [] };
            for (let i = 0; i < hooks; i++) {
                const parenPairIndex = findModifiedParenIndex(firstBracketAfterIndex, undefined, this.tokens, 0, i, 'Curly_brackets_open');
                if (!parenPairIndex)
                    throw new Error(`Paren pair not found for hook ${i} at index ${index}`);
                if (obj.ids.length > 0) {
                    const lastId = obj.ids[obj.ids.length - 1];
                    if (lastId.close !== parenPairIndex.open - 1) {
                        throw new Error(`Mismatch between last close (${lastId.close}) and next open (${parenPairIndex.open})`);
                    }
                }
                obj.ids.push(parenPairIndex);
            }
            founAndConfirmedCommands.push(obj);
        }
        founAndConfirmedCommands.forEach(command => {
            if (!command.ids || command.ids.length === 0) {
                console.error("Error: Command IDs are empty or undefined.");
                return;
            }
            const opan = command.index;
            const close = command.ids[command.ids.length - 1].close;
            if (close < opan) {
                console.error("Error: Close index is smaller than open index.");
                return;
            }
            const deleteCount = close - opan + 1;
            const removedTokens = this.tokens.slice(opan, close);
            const replacement = this.tikzCommands.replaceCallWithCommand(command.trigger, command.hooks, this.tikzCommands.getHooks(removedTokens, command.ids));
            this.tokens.splice(opan, deleteCount, ...replacement);
        });
    }
    cleanBasicTikzTokenify() {
        this.inferAndInterpretCommands();
        const unitIndices = this.tokens
            .map((token, idx) => (token.type === 'Unit' ? idx : null))
            .filter((idx) => idx !== null);
        unitIndices.forEach((unitIdx) => {
            const prevToken = this.tokens[unitIdx - 1];
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
            .map((token, idx) => (token.type === 'Syntax' && /(Dash|Plus)/.test(token.name) ? idx : null))
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
            .filter((item, idx) => this.tokens[item.close + 1].value !== 'at');
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
            this.tokens.splice(index.open, index.close + 1 - index.open, axis);
        });
        let variableIndexes = mapBrackets('Parentheses_open', this.tokens)
            .filter((item, idx) => this.tokens[item.close + 1].value === 'at');
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
        const og = this.tokens.slice().reverse().find((token) => (token instanceof Coordinate) && token.coordinateName === value);
        return og instanceof Coordinate ? og.clone() : undefined;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxjQUFjO0FBQ2QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBR3BILFNBQVMsMkJBQTJCLENBQUMsS0FBSztJQUN0QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUNELFNBQVMsSUFBSSxDQUFDLE1BQU07SUFDaEIsSUFBSSxNQUFNLEdBQUMsRUFBRSxDQUFBO0lBQ2IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUNuQixNQUFNLEVBQUUsR0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUN0RCxJQUFHLEVBQUUsRUFBQztZQUNG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QUFBO0lBRXZoQixNQUFNLElBQUksR0FBQyxpS0FBaUssQ0FBQTtJQUU1SyxNQUFNLEtBQUssR0FBQyw2V0FBNlcsQ0FBQTtJQUN6WCxNQUFNLElBQUksR0FBQywrRUFBK0UsQ0FBQTtJQUMxRixNQUFNLElBQUksR0FBQyxvRkFBb0YsQ0FBQTtJQUMvRixNQUFNLE9BQU8sR0FBQywwREFBMEQsQ0FBQTtJQUN4RSxNQUFNLE9BQU8sR0FBQyxzS0FBc0ssQ0FBQTtJQUVwTCxNQUFNLE1BQU0sR0FBQyw4dkJBQTh2QixDQUFBO0lBQzN3QixNQUFNLFFBQVEsR0FBQyxtUEFBbVAsQ0FBQTtJQUNsUSxPQUFPLFFBQVEsR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsTUFBTSxHQUFDLElBQUksR0FBQyxLQUFLLEdBQUMsSUFBSSxHQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsT0FBTyxHQUFDLGlFQUFpRSxDQUFBO0FBQ3JKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAdHMtbm9jaGVja1xuaW1wb3J0IHsgZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzIH0gZnJvbSBcInNyYy9tYXRoRW5naW5lXCI7XG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCByZWdFeHAsIFRva2VuLCB0b1BvaW50IH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcbmltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaXprQ29tbWFuZHMsIHNlYXJjaFRpemtGb3JPZ0xhdGV4IH0gZnJvbSBcInNyYy90aWt6amF4L3Rpa3pDb21tYW5kc1wiO1xuaW1wb3J0IHsgZmluZE1vZGlmaWVkUGFyZW5JbmRleCwgZmluZFBhcmVuSW5kZXgsIGlkUGFyZW50aGVzZXMsIG1hcEJyYWNrZXRzLCBQYXJlbiB9IGZyb20gXCJzcmMvdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xuaW1wb3J0IHsgdGV4dCB9IGZyb20gXCJzdHJlYW0vY29uc3VtZXJzXCI7XG5cbmZ1bmN0aW9uIGxhYmVsRnJlZUZvcm1UZXh0U2VwYXJhdGlvbihsYWJlbCl7XG4gICAgY29uc3QgY29sb25JbmRleD1sYWJlbC5maW5kSW5kZXgodD0+dC5uYW1lPT09J0NvbG9uJylcbiAgICAgbGFiZWw9bGFiZWwuc3BsaWNlKGNvbG9uSW5kZXgsbGFiZWwubGVuZ3RoLWNvbG9uSW5kZXgpXG4gICAgcmV0dXJuIGxhYmVsLnNwbGljZSgxKVxufVxuZnVuY3Rpb24gdG9PZyh0b2tlbnMpe1xuICAgIGxldCBzdHJpbmc9JydcbiAgICB0b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XG4gICAgICAgIGNvbnN0IG9nPXNlYXJjaFRpemtGb3JPZ0xhdGV4KHRva2VuLm5hbWV8fHRva2VuLnZhbHVlKVxuICAgICAgICBpZihvZyl7XG4gICAgICAgICAgICBpZihvZy5sYXRleClcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW9nLmxhdGV4XG4gICAgICAgICAgICBlbHNlIGlmKG9nLnJlZmVyZW5jZXM/Lmxlbmd0aD09PTEpXG4gICAgICAgICAgICAgICAgc3RyaW5nKz1vZy5yZWZlcmVuY2VzWzBdXG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgc3RyaW5nKz10b2tlbi52YWx1ZVxuICAgIH0pO1xuICAgIHJldHVybiBzdHJpbmdcbn1cblxuZnVuY3Rpb24gY2xlYW5Gb3JtYXR0aW5nKGZvcm1hdHRpbmc6IGFueVtdLHN1YlR5cGU/OiBzdHJpbmcpOiBhbnlbXVtdIHtcbiAgICBjb25zdCB2YWx1ZXM6IGFueVtdW10gPSBbXTtcbiAgICBsZXQgY3VycmVudEdyb3VwOiBhbnlbXSA9IFtdO1xuICAgIGNvbnN0IGZvcm1hdHRpbmdLZXlzPVtdXG5cbiAgICBpZihzdWJUeXBlPT09J0xhYmVsJyl7XG4gICAgICAgIGNvbnN0IGxhYmVsPWxhYmVsRnJlZUZvcm1UZXh0U2VwYXJhdGlvbihmb3JtYXR0aW5nKVxuICAgICAgICBmb3JtYXR0aW5nS2V5cy5wdXNoKHtrZXk6ICdmcmVlRm9ybVRleHQnLHZhbHVlOiB0b09nKGxhYmVsKX0pXG4gICAgfVxuICAgIFxuXG4gICAgY29uc3QgYnJhY2tldE1hcD1tYXBCcmFja2V0cygnQ3VybHlfYnJhY2tldHNfb3BlbicsZm9ybWF0dGluZyk7XG4gICAgYnJhY2tldE1hcC5yZXZlcnNlKClcbiAgICBicmFja2V0TWFwLmZvckVhY2goYnJhY2tldCA9PiB7XG4gICAgICAgIGlmKGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTFdLm5hbWU9PT0nRXF1YWxzJyl7XG4gICAgICAgICAgICBsZXQgc3ViRm9ybWF0dGluZz1mb3JtYXR0aW5nLnNwbGljZShicmFja2V0Lm9wZW4tMSxicmFja2V0LmNsb3NlLShicmFja2V0Lm9wZW4tMikpXG4gICAgICAgICAgICBzdWJGb3JtYXR0aW5nPXN1YkZvcm1hdHRpbmcuc2xpY2UoMiwtMSlcbiAgICAgICAgICAgIGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLnZhbHVlPWNsZWFuRm9ybWF0dGluZyhzdWJGb3JtYXR0aW5nLGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLm5hbWUpXG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBmb3JtYXR0aW5nKSB7XG4gICAgICAgIGlmIChpdGVtLm5hbWUgPT09ICdDb21tYScpIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50R3JvdXAubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGN1cnJlbnRHcm91cCk7XG4gICAgICAgICAgICAgICAgY3VycmVudEdyb3VwID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjdXJyZW50R3JvdXAucHVzaChpdGVtKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudEdyb3VwKTtcbiAgICB9XG5cbiAgICBcbiAgICB2YWx1ZXMuZm9yRWFjaCgodmFsdWUpID0+IHtcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaChhc3NpZ25Gb3JtYXR0aW5nKHZhbHVlKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGZvcm1hdHRpbmdLZXlzIFxufVxuXG5mdW5jdGlvbiBhc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmcpe1xuXG4gICAgY29uc3QgaXNFcXVhbHM9Zm9ybWF0dGluZy5tYXAoKGYsaWR4KT0+Zi5uYW1lPT09J0VxdWFscyc/aWR4Om51bGwpLmZpbHRlcih0PT50IT09bnVsbCk7XG4gICAgY29uc3Qga2V5PWZvcm1hdHRpbmdbMF0/Lm5hbWVcblxuICAgIGlmKGlzRXF1YWxzLmxlbmd0aD09PTEpXG4gICAgICAgIGZvcm1hdHRpbmc9Zm9ybWF0dGluZy5zbGljZSgoaXNFcXVhbHNbMF0rMSkpXG5cbiAgICBsZXQgdmFsdWU9aW50ZXJwcmV0Rm9ybWF0dGluZ1ZhbHVlKGZvcm1hdHRpbmcpO1xuICAgIHJldHVybiB7a2V5LHZhbHVlfVxufVxuXG5cbmZ1bmN0aW9uIGludGVycHJldEZvcm1hdHRpbmdWYWx1ZShmb3JtYXR0aW5nKXtcbiAgICBpZiAoZm9ybWF0dGluZy5sZW5ndGg9PT0xKXtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRpbmdbMF0udmFsdWV8fHRydWVcbiAgICB9XG4gICAgcmV0dXJuIGZvcm1hdHRpbmdcbn1cblxuY2xhc3MgVGlrekNvbW1hbmR7XG4gICAgdHJpZ2dlcjogc3RyaW5nO1xuICAgIGhvb2tOdW06IG51bWJlcjtcbiAgICBob29rczogYW55O1xuICAgIGNvbnRlbnQ6IEJhc2ljVGlrelRva2VuW11cbiAgICBhZGRDb21tYW5kKHRyaWdnZXIsIGhvb2tOdW0sIGNvbnRlbnQpe1xuICAgICAgICB0aGlzLnRyaWdnZXI9dHJpZ2dlcjtcbiAgICAgICAgdGhpcy5ob29rTnVtPWhvb2tOdW07XG4gICAgICAgIHRoaXMuY29udGVudD1jb250ZW50O1xuICAgICAgICB0aGlzLmZpbmRIb29rcygpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIGZpbmRIb29rcygpe1xuICAgICAgICBjb25zdCBoYXNodGFnTWFwPXRoaXMuY29udGVudC5tYXAoKGl0ZW0saW5kZXgpPT5pdGVtLm5hbWU9PT0nSGFzaHRhZycmJnRoaXMuY29udGVudFtpbmRleCsxXS50eXBlPT09J251bWJlcic/aW5kZXg6bnVsbClcbiAgICAgICAgLmZpbHRlcih0PT50IT09bnVsbClcbiAgICAgICAgaWYoaGFzaHRhZ01hcC5sZW5ndGghPT10aGlzLmhvb2tOdW0pe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBEaXNjcmVwYW5jeSBiZXR3ZWVuIHRoZSBudW1iZXIgb2YgaG9va3MgZGVjbGFyZWQgYW5kIHRoZSBudW1iZXIgb2YgaG9va3MgZm91bmQgaW4gdGhlIGNvbW1hbmQgaG9va051bTogJHt0aGlzLmhvb2tOdW19IGhhc2h0YWdNYXAubGVuZ3RoOiAke2hhc2h0YWdNYXAubGVuZ3RofWApO1xuICAgICAgICB9XG4gICAgICAgIGhhc2h0YWdNYXAuc29ydCgoYSxiKT0+Yi1hKVxuICAgICAgICBoYXNodGFnTWFwLmZvckVhY2goaWR4ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGhhc2h0YWc9dGhpcy5jb250ZW50W2lkeF07XG4gICAgICAgICAgICBoYXNodGFnLnR5cGU9J1N5bnRheCdcbiAgICAgICAgICAgIGhhc2h0YWcubmFtZT0naG9vaydcbiAgICAgICAgICAgIGhhc2h0YWcudmFsdWU9dGhpcy5jb250ZW50W2lkeCsxXT8udmFsdWU7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3BsaWNlKGlkeCsxLDEpXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXRJbmZvKCl7XG4gICAgICAgIHJldHVybiB7dHJpZ2dlcjogdGhpcy50cmlnZ2VyLGhvb2tzOiB0aGlzLmhvb2tOdW19XG4gICAgfVxufVxuXG5cbmNsYXNzIFRpa3pDb21tYW5kc3tcbiAgICBjb21tYW5kczogVGlrekNvbW1hbmRbXT1bXTtcbiAgICBjb25zdHJ1Y3RvcigpO1xuICAgIGFkZENvbW1hbmQodG9rZW5zKXtcbiAgICAgICAgXG4gICAgfVxuICAgIGFkZENvbW1hbmRCeUludGVycHJldGF0aW9uKHRva2Vucykge1xuICAgICAgICBjb25zdCBpZDFUb2tlbiA9IHRva2Vucy5maW5kKChpdGVtKSA9PiBpdGVtLm5hbWUgPT09ICdDdXJseV9icmFja2V0c19vcGVuJyk7XG4gICAgICAgIGlmICghaWQxVG9rZW4pIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjogJ0N1cmx5X2JyYWNrZXRzX29wZW4nIG5vdCBmb3VuZCBpbiB0b2tlbnMuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGxldCBpZDEgPSBpZDFUb2tlbi52YWx1ZTtcbiAgICAgICAgY29uc3QgaWQyID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChpZDEsIHVuZGVmaW5lZCwgdG9rZW5zLCAwLCAxKTtcbiAgICAgICAgY29uc3QgaWQzID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChpZDEsIHVuZGVmaW5lZCwgdG9rZW5zLCAwLCAxLCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xuICAgIFxuICAgICAgICBpZiAoIWlkMiB8fCAhaWQzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6IFVuYWJsZSB0byBmaW5kIG1hdGNoaW5nIGJyYWNrZXRzLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZDE9ZmluZFBhcmVuSW5kZXgoaWQxLCB1bmRlZmluZWQsIHRva2VucylcbiAgICAgICAgbGV0IHRyaWdnZXIsIGhvb2tzLCBjb250ZW50O1xuICAgICAgICBjb250ZW50ID0gdG9rZW5zLnNwbGljZShpZDMub3BlbiArIDEsIGlkMy5jbG9zZSAtIGlkMy5vcGVuIC0gMSk7XG4gICAgICAgIGhvb2tzID0gdG9rZW5zLnNwbGljZShpZDIub3BlbiArIDEsIGlkMi5jbG9zZSAtIGlkMi5vcGVuIC0gMSk7XG4gICAgICAgIHRyaWdnZXIgPSB0b2tlbnMuc3BsaWNlKGlkMS5vcGVuKzEsIGlkMS5jbG9zZSAtIGlkMS5vcGVuIC0gMSk7XG5cbiAgICAgICAgaWYgKGhvb2tzLmxlbmd0aCA9PT0gMSAmJiBob29rc1swXT8udHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIGhvb2tzID0gaG9va3NbMF0udmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGhvb2tzOiBFeHBlY3RlZCBhIHNpbmdsZSBudW1lcmljIHZhbHVlLlwiKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKHRyaWdnZXIubGVuZ3RoID09PSAxICYmIHRyaWdnZXJbMF0/LnR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0cmlnZ2VyID0gdHJpZ2dlclswXS52YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgdHJpZ2dlcjogRXhwZWN0ZWQgYSBzaW5nbGUgc3RyaW5nIHZhbHVlLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvbW1hbmRzLnB1c2gobmV3IFRpa3pDb21tYW5kKCkuYWRkQ29tbWFuZCh0cmlnZ2VyLCBob29rcywgY29udGVudCkpXG4gICAgfVxuXG4gICAgcmVwbGFjZUNhbGxXaXRoQ29tbWFuZCh0cmlnZ2VyOiBzdHJpbmcsaG9va051bWJlcjogbnVtYmVyLGhvb2tzOiBhbnlbXSl7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLmNvbW1hbmRzLmZpbmQoY29tbWFuZCA9PiBcbiAgICAgICAgICAgIGNvbW1hbmQudHJpZ2dlciA9PT0gdHJpZ2dlciAmJiBob29rTnVtYmVyID09PSBjb21tYW5kLmhvb2tOdW1cbiAgICAgICAgKT8uY29udGVudDtcblxuICAgICAgICBjb25zdCBtYXAgPSBjb250ZW50Py5tYXAoKGl0ZW0sIGluZGV4KSA9PiBcbiAgICAgICAgICAgIGl0ZW0ubmFtZSA9PT0gJ2hvb2snID8geyBpbmRleCwgdmFsdWU6IGl0ZW0udmFsdWUgfSA6IG51bGxcbiAgICAgICAgKS5maWx0ZXIodCA9PiB0ICE9PSBudWxsKTtcbiAgICAgICAgbWFwPy5yZXZlcnNlKCk7XG5cbiAgICAgICAgY29uc3QgdW5pcXVlVmFsdWVzID0gbmV3IFNldCgpO1xuICAgICAgICBmb3IgKGNvbnN0IHsgaW5kZXgsIHZhbHVlIH0gb2YgbWFwIHx8IFtdKSB7XG4gICAgICAgICAgICBpZiAoIXVuaXF1ZVZhbHVlcy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdW5pcXVlVmFsdWVzLmFkZCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250ZW50LnNwbGljZShpbmRleCwgMSwgLi4uaG9va3NbdmFsdWUtMV0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb250ZW50XG4gICAgfVxuXG4gICAgZ2V0SG9va3ModG9rZW5zLGlkcyl7XG4gICAgICAgIHRva2Vucy5zcGxpY2UoMCwxKVxuICAgICAgICBjb25zdCBhZGp1c3RtZW50VmFsdWU9aWRzWzBdLm9wZW5cbiAgICAgICAgaWRzLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgaWQub3Blbi09YWRqdXN0bWVudFZhbHVlO1xuICAgICAgICAgICAgaWQuY2xvc2UtPWFkanVzdG1lbnRWYWx1ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlkcy5yZXZlcnNlKCk7XG4gICAgICAgIGNvbnN0IGhvb2tzPVtdXG4gICAgICAgIGlkcy5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQ9dG9rZW5zLnNwbGljZShpZC5vcGVuKzEsaWQuY2xvc2UtKGlkLm9wZW4rMSkpXG4gICAgICAgICAgICBob29rcy5wdXNoKHJlbW92ZWQpXG4gICAgICAgIH0pO1xuICAgICAgICBob29rcy5yZXZlcnNlKCk7XG4gICAgICAgIHJldHVybiBob29rc1xuICAgIH1cbiAgICBcbn1cblxuZXhwb3J0IGNsYXNzIEJhc2ljVGlrelRva2Vue1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmdcbiAgICB2YWx1ZTogc3RyaW5nfG51bWJlcnxQYXJlbnxhbnlcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTogbnVtYmVyfHN0cmluZ3xvYmplY3Qpe1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlPT09J251bWJlcicpe1xuICAgICAgICAgICAgdGhpcy50eXBlPSdudW1iZXInXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xuICAgICAgICAgICAgcmV0dXJuIFxuICAgICAgICB9XG4gICAgICAgIGlmKHR5cGVvZiB2YWx1ZT09PSdzdHJpbmcnKXtcbiAgICAgICAgICAgIHRoaXMudHlwZT0nc3RyaW5nJ1xuICAgICAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0aGlzLnR5cGU9dmFsdWUudHlwZS5yZXBsYWNlKC9CcmFja2V0LywnU3ludGF4JylcbiAgICAgICAgdGhpcy5uYW1lPXZhbHVlLm5hbWVcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZS52YWx1ZVxuICAgICAgICBcbiAgICB9XG4gICAgdG9TdHJpbmcoKXtcbiAgICAgICAgcmV0dXJuIHNlYXJjaFRpemtGb3JPZ0xhdGV4KHRoaXMubmFtZSkubGF0ZXhcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgVGlrelZhcmlhYmxle1xuICAgIC8vdHlwZTogXG5cbn1cbmV4cG9ydCBjbGFzcyBUaWt6VmFyaWFibGVze1xuICAgIHZhcmlhYmxlczogW109W11cblxufVxuXG5mdW5jdGlvbiB0b1ZhcmlhYmxlVG9rZW4oYXJyOiBhbnlbXSkge1xuICAgIGFycj1hcnIuZmlsdGVyKHQ9PighdC50eXBlLmluY2x1ZGVzKCdQYXJlbnRoZXNlcycpKSlcbiAgICBhcnI9dG9PZyhhcnIpXG4gICAgdG9rZW49bmV3IEJhc2ljVGlrelRva2VuKGFycilcbiAgICB0b2tlbi50eXBlPSd2YXJpYWJsZSdcbiAgICByZXR1cm4gdG9rZW5cbn1cblxuXG5cbmV4cG9ydCBjbGFzcyBCYXNpY1Rpa3pUb2tlbnN7XG4gICAgcHJpdmF0ZSB0b2tlbnM6IEFycmF5PEJhc2ljVGlrelRva2VufEZvcm1hdHRpbmc+ID0gW11cbiAgICBwcml2YXRlIHRpa3pDb21tYW5kczogVGlrekNvbW1hbmRzPW5ldyBUaWt6Q29tbWFuZHMoKTtcblxuICAgIGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nKXtcbiAgICAgICAgc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xuICAgICAgICBzb3VyY2U9dGhpcy5iYXNpY0FycmF5aWZ5KHNvdXJjZSlcbiAgICAgICAgdGhpcy5iYXNpY1Rpa3pUb2tlbmlmeShzb3VyY2UpXG4gICAgICAgIHRoaXMuY2xlYW5CYXNpY1Rpa3pUb2tlbmlmeSgpXG4gICAgICAgIC8vY29uc29sZS5sb2coJ2NsZWFuQmFzaWNUaWt6VG9rZW5pZnknLHRoaXMudG9rZW5zKVxuICAgICAgICB0aGlzLnByZXBhcmVGb3JUb2tlbml6ZSgpXG4gICAgfVxuICAgIGdldFRva2Vucygpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcbiAgICB9XG5cbiAgICBwcml2YXRlIHRpZHlUaWt6U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XG4gICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gc291cmNlLnNwbGl0KFwiXFxuXCIpO1xuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpLnJlcGxhY2UoLyg/PD1bXlxcd10pIHwgKD89W15cXHddKS9nLCBcIlwiKS5yZXBsYWNlKC8oPzwhXFxcXCklLiokL2dtLCBcIlwiKS5yZXBsYWNlKC9cXG4vZyxcIlwiKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJhc2ljQXJyYXlpZnkoc291cmNlKXtcbiAgICAgICAgY29uc3QgYmFzaWNBcnJheSA9IFtdO1xuICAgICAgICBjb25zdCBvcGVyYXRvcnNSZWdleCA9IG5ldyBSZWdFeHAoJ14nICsgYXJyVG9SZWdleFN0cmluZyhnZXRBbGxUaWt6UmVmZXJlbmNlcygpKSk7XG4gICAgICAgIGxldCBpID0gMDtcbiAgICAgICAgIFxuICAgICAgICB3aGlsZSAoaSA8IHNvdXJjZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHN1YlNvdXJjZSA9IHNvdXJjZS5zbGljZShpKTtcbiAgICAgICAgICAgIGxldCBtYXRjaDtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBNYXRjaCBUaWtaIG9wZXJhdG9yc1xuICAgICAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2gob3BlcmF0b3JzUmVnZXgpO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IG1hdGNoWzBdIH0pO1xuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIC8vIE1hdGNoIG51bWJlcnNcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eWy0wLTkuXSsvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ251bWJlcicsIHZhbHVlOiBwYXJzZU51bWJlcihtYXRjaFswXSkgfSk7XG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlthLXpBLVpcXFxcXSsvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiBtYXRjaFswXSB9KTtcbiAgICAgICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICBcbiAgICAgICAgICAgIC8vIEluY3JlbWVudCBpbmRleCBpZiBubyBtYXRjaCBmb3VuZFxuICAgICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBiYXNpY0FycmF5XG4gICAgfVxuICAgIHByaXZhdGUgYmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNBcnJheSl7XG4gICAgICAgICAvLyBQcm9jZXNzIHRva2Vuc1xuICAgICAgICBiYXNpY0FycmF5LmZvckVhY2goKHsgdHlwZSwgdmFsdWUgfSkgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGlrekNvbW1hbmQgPSBzZWFyY2hUaXprQ29tbWFuZHModmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmICh0aWt6Q29tbWFuZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY1Rpa3pUb2tlbih0aWt6Q29tbWFuZCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odmFsdWUpKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY1Rpa3pUb2tlbih2YWx1ZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcbiAgICB9XG4gICAgcHJpdmF0ZSBpbmZlckFuZEludGVycHJldENvbW1hbmRzKCl7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBjb21tYW5kc01hcD10aGlzLnRva2Vucy5tYXAoKHQsaWR4KT0+dC50eXBlPT09J0NvbW1hbmQnP2lkeDpudWxsKVxuICAgICAgICAuZmlsdGVyKHQ9PnQhPT1udWxsKTtcbiAgICAgICAgY29tbWFuZHNNYXAuZm9yRWFjaChpbmRleCA9PiB7XG4gICAgICAgICAgICBjb25zdCBmaXJzdEJyYWNrZXRBZnRlckluZGV4PXRoaXMudG9rZW5zLnNsaWNlKGluZGV4KS5maW5kKChpdGVtLGlkeCk9Pml0ZW0ubmFtZT09PSdDdXJseV9icmFja2V0c19vcGVuJyk7XG4gICAgICAgICAgICBjb25zdCBlbmRPZkV4cHJlc3Npb249ZmluZE1vZGlmaWVkUGFyZW5JbmRleChmaXJzdEJyYWNrZXRBZnRlckluZGV4LnZhbHVlLHVuZGVmaW5lZCx0aGlzLnRva2VucywwLDEsJ0N1cmx5X2JyYWNrZXRzX29wZW4nKVxuICAgICAgICAgICAgY29uc3QgY29tbWFuZD10aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsTWF0aC5hYnMoaW5kZXgtKGVuZE9mRXhwcmVzc2lvbi5jbG9zZSsxKSkpXG4gICAgICAgICAgICB0aGlzLnRpa3pDb21tYW5kcy5hZGRDb21tYW5kQnlJbnRlcnByZXRhdGlvbihjb21tYW5kKVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBjb21tYW5kcz10aGlzLnRpa3pDb21tYW5kcy5jb21tYW5kcy5tYXAoYz0+Yy5nZXRJbmZvKCkpO1xuICAgICAgICBjb25zdCBjb21tYW5kc0luVG9rZW5zPXRoaXMudG9rZW5zLm1hcCgoaXRlbSxpbmRleCk9PntcbiAgICAgICAgICAgIGlmKGl0ZW0udHlwZSE9PSdzdHJpbmcnKXtyZXR1cm4gbnVsbH1cbiAgICAgICAgICAgIGNvbnN0IG1hdGNoPWNvbW1hbmRzLmZpbmQoYz0+Yy50cmlnZ2VyPT09aXRlbS52YWx1ZSlcbiAgICAgICAgICAgIGlmKG1hdGNoKXtcbiAgICAgICAgICAgICAgICByZXR1cm4ge2luZGV4OiBpbmRleCwuLi5tYXRjaH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsXG4gICAgICAgIH0pLmZpbHRlcih0PT50IT09bnVsbCk7XG5cbiAgICAgICAgY29uc3QgZm91bkFuZENvbmZpcm1lZENvbW1hbmRzID0gW107XG4gICAgICAgIGZvciAoY29uc3QgW2luZGV4LCB7IHRyaWdnZXIsIGhvb2tzIH1dIG9mIE9iamVjdC5lbnRyaWVzKGNvbW1hbmRzSW5Ub2tlbnMpKSB7XG4gICAgICAgICAgICBjb25zdCBudW1lcmljSW5kZXggPSBOdW1iZXIoaW5kZXgpOyAvLyBFbnN1cmUgaW5kZXggaXMgYSBudW1iZXJcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0QnJhY2tldEFmdGVySW5kZXggPSB0aGlzLnRva2Vuc1xuICAgICAgICAgICAgICAgIC5zbGljZShudW1lcmljSW5kZXgpXG4gICAgICAgICAgICAgICAgLmZpbmQoKGl0ZW0pID0+IGl0ZW0ubmFtZSA9PT0gJ0N1cmx5X2JyYWNrZXRzX29wZW4nKT8udmFsdWU7XG5cbiAgICAgICAgICAgIGlmICghZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkN1cmx5X2JyYWNrZXRzX29wZW4gbm90IGZvdW5kIGFmdGVyIGluZGV4IFwiICsgaW5kZXgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodHlwZW9mIGhvb2tzICE9PSAnbnVtYmVyJyB8fCBob29rcyA8PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGhvb2tzIHZhbHVlIGF0IGluZGV4ICR7aW5kZXh9YCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG9iaiA9IHsgaW5kZXgsIHRyaWdnZXIsIGhvb2tzLCBpZHM6IFtdIH07XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG9va3M7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVuUGFpckluZGV4ID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2VucyxcbiAgICAgICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgICAgICAgJ0N1cmx5X2JyYWNrZXRzX29wZW4nXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXBhcmVuUGFpckluZGV4KSBcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQYXJlbiBwYWlyIG5vdCBmb3VuZCBmb3IgaG9vayAke2l9IGF0IGluZGV4ICR7aW5kZXh9YCk7XG4gICAgICAgICAgICAgICAgaWYgKG9iai5pZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0SWQgPSBvYmouaWRzW29iai5pZHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChsYXN0SWQuY2xvc2UgIT09IHBhcmVuUGFpckluZGV4Lm9wZW4gLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc21hdGNoIGJldHdlZW4gbGFzdCBjbG9zZSAoJHtsYXN0SWQuY2xvc2V9KSBhbmQgbmV4dCBvcGVuICgke3BhcmVuUGFpckluZGV4Lm9wZW59KWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG9iai5pZHMucHVzaChwYXJlblBhaXJJbmRleCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3VuQW5kQ29uZmlybWVkQ29tbWFuZHMucHVzaChvYmopO1xuICAgICAgICB9XG5cbiAgICAgICAgZm91bkFuZENvbmZpcm1lZENvbW1hbmRzLmZvckVhY2goY29tbWFuZCA9PiB7XG4gICAgICAgICAgICBpZiAoIWNvbW1hbmQuaWRzIHx8IGNvbW1hbmQuaWRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjogQ29tbWFuZCBJRHMgYXJlIGVtcHR5IG9yIHVuZGVmaW5lZC5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgb3BhbiA9IGNvbW1hbmQuaW5kZXg7IFxuICAgICAgICAgICAgY29uc3QgY2xvc2UgPSBjb21tYW5kLmlkc1tjb21tYW5kLmlkcy5sZW5ndGggLSAxXS5jbG9zZTtcbiAgICAgICAgICAgIGlmIChjbG9zZSA8IG9wYW4pIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6IENsb3NlIGluZGV4IGlzIHNtYWxsZXIgdGhhbiBvcGVuIGluZGV4LlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBkZWxldGVDb3VudCA9IGNsb3NlIC0gb3BhbiArIDE7XG4gICAgICAgICAgICBjb25zdCByZW1vdmVkVG9rZW5zID0gdGhpcy50b2tlbnMuc2xpY2Uob3BhbiwgY2xvc2UpO1xuICAgICAgICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSB0aGlzLnRpa3pDb21tYW5kcy5yZXBsYWNlQ2FsbFdpdGhDb21tYW5kKFxuICAgICAgICAgICAgICAgIGNvbW1hbmQudHJpZ2dlcixcbiAgICAgICAgICAgICAgICBjb21tYW5kLmhvb2tzLFxuICAgICAgICAgICAgICAgIHRoaXMudGlrekNvbW1hbmRzLmdldEhvb2tzKHJlbW92ZWRUb2tlbnMsY29tbWFuZC5pZHMpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShvcGFuLCBkZWxldGVDb3VudCwgLi4ucmVwbGFjZW1lbnQpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcHJpdmF0ZSBjbGVhbkJhc2ljVGlrelRva2VuaWZ5KCl7XG5cbiAgICAgICAgdGhpcy5pbmZlckFuZEludGVycHJldENvbW1hbmRzKClcblxuXG4gICAgICAgIGNvbnN0IHVuaXRJbmRpY2VzOiBudW1iZXJbXSA9IHRoaXMudG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbi50eXBlID09PSAnVW5pdCcgPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcigoaWR4KTogaWR4IGlzIG51bWJlciA9PiBpZHggIT09IG51bGwpO1xuXG4gICAgICAgIHVuaXRJbmRpY2VzLmZvckVhY2goKHVuaXRJZHgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRoaXMudG9rZW5zW3VuaXRJZHggLSAxXTtcblxuICAgICAgICAgICAgaWYgKCFwcmV2VG9rZW4gfHwgcHJldlRva2VuLnR5cGUgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbml0cyBjYW4gb25seSBiZSB1c2VkIGluIHJlZmVyZW5jZSB0byBudW1iZXJzIGF0IGluZGV4ICR7dW5pdElkeH1gKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHJldlRva2VuLnZhbHVlID0gdG9Qb2ludChwcmV2VG9rZW4udmFsdWUgYXMgbnVtYmVyLCB0aGlzLnRva2Vuc1t1bml0SWR4XS5uYW1lKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICghdW5pdEluZGljZXMuaW5jbHVkZXMoaWR4KSkpO1xuXG4gICAgICAgIC8vdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKCh0KSA9PiB0Lm5hbWUhPT0nQ29tbWEnKTtcbiAgICAgICAgLypcbiAgICAgICAgY29uc3QgaW5kZXhlc1RvUmVtb3ZlOiBudW1iZXJbXT1bXVxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbixpbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYodG9rZW4udHlwZT09PSdGb3JtYXR0aW5nJyl7XG4gICAgICAgICAgICAgICAgaWYodGhpcy50b2tlbnNbaW5kZXgrMV0ubmFtZT09PSdFcXVhbHMnKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXhdLnZhbHVlPXRoaXMudG9rZW5zW2luZGV4KzJdXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ZXNUb1JlbW92ZS5wdXNoKGluZGV4KzEsaW5kZXgrMik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICghaW5kZXhlc1RvUmVtb3ZlLmluY2x1ZGVzKGlkeCkpKTsqL1xuXG5cblxuICAgICAgICBjb25zdCBtYXBTeW50YXggPSB0aGlzLnRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbiwgaWR4KSA9PiAodG9rZW4udHlwZSA9PT0gJ1N5bnRheCcgJiYgLyhEYXNofFBsdXMpLy50ZXN0KHRva2VuLm5hbWUpID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcblxuICAgICAgICBjb25zdCBzeW50YXhTZXF1ZW5jZXMgPSBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwU3ludGF4KTtcblxuXG4gICAgICAgIGNvbnN0IHN5bnRheE9iamVjdHMgPSBzeW50YXhTZXF1ZW5jZXNcbiAgICAgICAgLm1hcCgoc2VxdWVuY2UpID0+IHtcbiAgICAgICAgICAgIGlmIChzZXF1ZW5jZS5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IHNlcXVlbmNlWzBdO1xuICAgICAgICAgICAgY29uc3QgZW5kID0gc2VxdWVuY2Vbc2VxdWVuY2UubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gc2VxdWVuY2VcbiAgICAgICAgICAgICAgICAubWFwKChpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0b2tlbiB8fCAhdG9rZW4ubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBNaXNzaW5nIG9yIGludmFsaWQgdG9rZW4gYXQgaW5kZXggJHtpbmRleH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAnJzsgLy8gUHJvdmlkZSBhIGZhbGxiYWNrXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuLm5hbWVcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9EYXNoLywgJy0nKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1BsdXMvLCAnKycpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmpvaW4oJycpO1xuXG4gICAgICAgICAgICByZXR1cm4geyBzdGFydCwgZW5kLCB2YWx1ZSB9O1xuICAgICAgICB9KVxuXG4gICAgICAgIC5maWx0ZXIoKG9iaikgPT4gb2JqICE9PSBudWxsKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5zdGFydCAtIGEuc3RhcnQpO1xuXG4gICAgICAgIHN5bnRheE9iamVjdHMuZm9yRWFjaCgoeyBzdGFydCwgZW5kLCB2YWx1ZSB9KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb21tYW5kID0gc2VhcmNoVGl6a0NvbW1hbmRzKHZhbHVlKTsgXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBCYXNpY1Rpa3pUb2tlbihjb21tYW5kKVxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBlbmQgKyAxIC0gc3RhcnQsIHRva2VuKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwcmVwYXJlRm9yVG9rZW5pemUoKXtcbiAgICAgICAgY29uc3Qgc3F1YXJlQnJhY2tldEluZGV4ZXMgPSBtYXBCcmFja2V0cygnU3F1YXJlX2JyYWNrZXRzX29wZW4nLHRoaXMudG9rZW5zKVxuICAgICAgICBzcXVhcmVCcmFja2V0SW5kZXhlc1xuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5vcGVuIC0gYS5vcGVuKSAvLyBTb3J0IGluIGRlc2NlbmRpbmcgb3JkZXIgb2YgJ29wZW4nXG4gICAgICAgIC5mb3JFYWNoKChpbmRleCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZyA9IG5ldyBGb3JtYXR0aW5nKFxuICAgICAgICAgICAgICAgIGNsZWFuRm9ybWF0dGluZyh0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCBmb3JtYXR0aW5nKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9sZXQgcHJhbmVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2Vucyk7XG4gICAgICAgIGxldCBjb29yZGluYXRlSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgdGhpcy50b2tlbnMpXG4gICAgICAgIC5maWx0ZXIoKGl0ZW0saWR4KT0+dGhpcy50b2tlbnNbaXRlbS5jbG9zZSsxXS52YWx1ZSE9PSdhdCcpXG4gICAgICAgIC8qXG4gICAgICAgIGNvbnN0IHsgY29vcmRpbmF0ZUluZGV4ZXMsIHZhcmlhYmxlSW5kZXhlcyB9ID0gcHJhbmVJbmRleGVzLnJlZHVjZSgocmVzdWx0LCBpdGVtKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbaXRlbS5jbG9zZSArIDFdPy52YWx1ZSAhPT0gJ2F0Jykge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5jb29yZGluYXRlSW5kZXhlcy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgfSBcbiAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tpdGVtLmNsb3NlICsgMV0/LnZhbHVlID09PSAnYXQnKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnZhcmlhYmxlSW5kZXhlcy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSwgeyBjb29yZGluYXRlSW5kZXhlczogW10sIHZhcmlhYmxlSW5kZXhlczogW10gfSk7Ki9cbiAgICAgICAgY29vcmRpbmF0ZUluZGV4ZXNcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIub3BlbiAtIGEub3BlbikgXG4gICAgICAgIC5mb3JFYWNoKChpbmRleCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXhpcyA9IG5ldyBBeGlzKCkucGFyc2VJbnB1dChcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGF4aXMpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgdmFyaWFibGVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2VucylcbiAgICAgICAgLmZpbHRlcigoaXRlbSxpZHgpPT50aGlzLnRva2Vuc1tpdGVtLmNsb3NlICsgMV0udmFsdWU9PT0nYXQnKVxuXG4gICAgICAgIHZhcmlhYmxlSW5kZXhlc1xuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5vcGVuIC0gYS5vcGVuKSBcbiAgICAgICAgLmZvckVhY2goKGluZGV4KSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpbmRleCx0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSkpXG4gICAgICAgICAgICBjb25zdCB2YXJpYWJsZSA9IHRvVmFyaWFibGVUb2tlbih0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHZhcmlhYmxlKVxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIHZhcmlhYmxlKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5cblxuZXhwb3J0IGNsYXNzIEZvcm1hdFRpa3pqYXgge1xuXHRzb3VyY2U6IHN0cmluZztcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcbiAgICB0aWt6Q29tbWFuZHM6IFRpa3pDb21tYW5kcz1uZXcgVGlrekNvbW1hbmRzKCk7XG4gICAgLy9taWRQb2ludDogQXhpcztcbiAgICBwcml2YXRlIHZpZXdBbmNob3JzOiB7bWF4OiBBeGlzLG1pbjpBeGlzLGF2ZU1pZFBvaW50OiBBeGlzfVxuXHRwcm9jZXNzZWRDb2RlPVwiXCI7XG4gICAgZGVidWdJbmZvID0gXCJcIjtcbiAgICBcblx0Y29uc3RydWN0b3Ioc291cmNlOiBzdHJpbmd8QXJyYXk8VG9rZW4+KSB7XG4gICAgICAgIGlmKCFzb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcblx0XHQvL2NvbnN0IGJhc2ljVGlrelRva2Vucz1uZXcgQmFzaWNUaWt6VG9rZW5zKHNvdXJjZSlcbiAgICAgICAgLy9jb25zb2xlLmxvZygnYmFzaWNUaWt6VG9rZW5zJyxiYXNpY1Rpa3pUb2tlbnMpXG4gICAgICAgIC8vdGhpcy50b2tlbml6ZShiYXNpY1Rpa3pUb2tlbnMuZ2V0VG9rZW5zKCkpXG4gICAgICAgIC8vY29uc29sZS5sb2coJ3Rva2VuaXplJyx0aGlzLnRva2VucylcbiAgICAgICAgLy90aGlzLnByb2Nlc3NlZENvZGUgKz0gdGhpcy50b1N0cmluZygpXG5cbiAgICAgICAgLy90aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXG4gICAgICAgIH1cbiAgICAgICAgLy9lbHNlIHt0aGlzLnByb2Nlc3NlZENvZGU9c291cmNlO31cbiAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlPXRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcblx0fVxuICAgIFxuICAgIHByaXZhdGUgdGlkeVRpa3pTb3VyY2Uoc291cmNlOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcbiAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSBzb3VyY2Uuc3BsaXQoXCJcXG5cIik7XG4gICAgICAgIGxpbmVzID0gbGluZXMubWFwKGxpbmUgPT4gbGluZS50cmltKCkpO1xuICAgICAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJykucmVwbGFjZSgvKD88PVteXFx3XSkgfCAoPz1bXlxcd10pL2csIFwiXCIpLnJlcGxhY2UoLyg/PCFcXFxcKSUuKiQvZ20sIFwiXCIpLnJlcGxhY2UoL1xcbi9nLFwiXCIpO1xuICAgIH1cblxuICAgIHRva2VuaXplKGJhc2ljVGlrelRva2Vucyl7XG4gICAgICAgIGxldCBlbmRJbmRleFxuICAgICAgICBmb3IobGV0IGk9MDtpPGJhc2ljVGlrelRva2Vucy5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdEcmF3Jyl7XG4gICAgICAgICAgICAgICAgZW5kSW5kZXg9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkpLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nU2VtaWNvbG9uJykraVxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcbiAgICAgICAgICAgICAgICBpPWVuZEluZGV4XG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdygnZHJhdycpLmZpbGxDb29yZGluYXRlcyhzZWdtZW50KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdDb29yZGluYXRlJyl7XG4gICAgICAgICAgICAgICAgZW5kSW5kZXg9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkpLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nU2VtaWNvbG9uJykraVxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzZWdtZW50KVxuICAgICAgICAgICAgICAgIGk9ZW5kSW5kZXhcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKCdjb29yZGluYXRlJykuaW50ZXJwcmV0Q29vcmRpbmF0ZShzZWdtZW50KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvKlxuICAgICAgICBUaGV5J3JlIGdvaW5nIHRvIGJlIHRocmVlIHR5cGVzIHN0cmluZ2VkIHN5bnRheCBudW1iZXIuXG4gICAgICAgICBJIHVzZSB0aGVtIHRvIHRva2VuaXplLiB1c2luZyB0aGUgdGlja3MgY29tbWFuZHMuIE9uY2UgdG9rZW5pemVyIHRha2VzIGNvbW1hbmRzLlxuICAgICAgICAgSSBtb3ZlIG9uIHRvIGFjdHVhbCBldmFsdWF0aW9uLlxuICAgICAgICAqL1xuXG4gICAgICAgIFxuICAgICAgICBsZXQgc3ViZGVmaW5lZFRva2Vucz1bXTtcbiAgICAgICAgLypcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YmFzaWNUaWt6VG9rZW5zLmxlbmd0aDtpKyspe1xuXG4gICAgICAgIH0qL1xuICAgIH1cblxuICAgIGdldENvZGUoKXtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnNvdXJjZT09PVwic3RyaW5nXCImJnRoaXMuc291cmNlLm1hdGNoKC8odXNlcGFja2FnZXx1c2V0aWt6bGlicmFyeSkvKSl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wcm9jZXNzZWRDb2RlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xuICAgIH1cbiAgICBcbiAgICBhcHBseVBvc3RQcm9jZXNzaW5nKCl7XG4gICAgICAgIGNvbnN0IGZsYXRBeGVzPWZsYXR0ZW4odGhpcy50b2tlbnMpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcbiAgICAgICAgZmxhdEF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xuICAgICAgICAgICAgYXhpcy5hZGRRdWFkcmFudCh0aGlzLnZpZXdBbmNob3JzLmF2ZU1pZFBvaW50KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgZmxhdERyYXc9ZmxhdHRlbih0aGlzLnRva2VucyxbXSxEcmF3KS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgRHJhdyk7XG4gICAgICAgIGZsYXREcmF3LmZvckVhY2goKGRyYXc6IERyYXcpID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgIFtpbmRleCwgY29vcl0gb2YgZHJhdy5jb29yZGluYXRlcy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29vciBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29vci5mb3JtYXR0aW5nPy5hZGRTcGxvcEFuZFBvc2l0aW9uKGRyYXcuY29vcmRpbmF0ZXMsaW5kZXgpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgfVxuXG4gICAgLypcbiAgICB0b2tlbml6ZSgpIHtcbiAgICAgICAgXG5cbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxccy0sLjp8YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxuICAgICAgICBjb25zdCBjID0gU3RyaW5nLnJhd2BbJChdezAsMn1bJHtjYX1dK1spJF17MCwyfXxcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K10rXFwoWyR7Y2F9XStcXClcXCRgO1xuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgd2l0aCBlc2NhcGVkIGNoYXJhY3RlcnMgZm9yIHNwZWNpZmljIG1hdGNoaW5nXG4gICAgICAgIGNvbnN0IGNuID0gU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gOyAvLyBDb29yZGluYXRlIG5hbWVcbiAgICAgICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXFxcIj9cXCRbXFx3XFxkXFxzXFwtLC46KCEpXFwtXFx7XFx9XFwrXFxcXCBeXSpcXCRcXFwiP3xbXFx3XFxkXFxzXFwtLC46KCEpX1xcLVxcK1xcXFxeXSpgOyAvLyBUZXh0IHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xuICAgICAgICBjb25zdCBmID0gU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7LiYqXFx7XFx9JVxcLTw+XWA7IC8vIEZvcm1hdHRpbmcgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXG5cbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHVzaW5nIGVzY2FwZWQgYnJhY2VzIGFuZCBwYXR0ZXJuc1xuICAgICAgICBjb25zdCBjb29yUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHBpY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxwaWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBub2RlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHNlID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFxzKlxcKCooJHtjbn0pXFwpKlxccyphdFxccypcXCgoJHtjfSlcXClcXHMqXFxbKCR7Zn0qKVxcXVxccypcXHsoJHt0fSlcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHNzID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yZGluYXRlXFxzKihcXFtsYWJlbD1cXHtcXFsoLio/KVxcXTpcXFxcXFx3KlxccyooW1xcd1xcc10qKVxcfVxcXSk/XFxzKlxcKCgke2NufSspXFwpXFxzKmF0XFxzKlxcKCgke2N9KVxcKTtgLCBcImdcIik7XG4gICAgICAgIGNvbnN0IGRyYXdSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZHJhd1xcWygke2Z9KilcXF0oW147XSopO2AsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgeHlheGlzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHh5YXhpc3soJHt0fSl9eygke3R9KX1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZHsoW1xcZC0uXSspfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgY2lyY2xlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNpcmNsZVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceyhbXFx3XFxzXFxkXSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBtYXNzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG1hc3NcXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoLVxcfHxcXHx8Pil7MCwxfVxcfVxceyhbXFxkLl0qKVxcfWAsXCJnXCIpO1xuICAgICAgICAvL1xccGlje2FuYzJ9e2FuYzF9e2FuYzB9ezc1XlxcY2lyYyB9e307XG4gICAgICAgIGNvbnN0IHZlY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx2ZWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW2Nvb3JSZWdleCwgc2UsIHNzLCBub2RlUmVnZXgsIGRyYXdSZWdleCwgY2lyY2xlUmVnZXgsIG1hc3NSZWdleCwgdmVjUmVnZXgscGljUmVnZXhdO1xuICAgICAgICBsZXQgbWF0Y2hlczogYW55W109W107XG4gICAgICAgIHJlZ2V4UGF0dGVybnMuZm9yRWFjaChhYiA9PiB7XG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiAoYS5pbmRleCB8fCAwKSAtIChiLmluZGV4IHx8IDApKTtcblxuICAgICAgICBbeHlheGlzUmVnZXgsZ3JpZFJlZ2V4XS5mb3JFYWNoKGFiID0+IHtcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkICYmIG1hdGNoLmluZGV4ID4gY3VycmVudEluZGV4KSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHRoaXMuc291cmNlLnNsaWNlKGN1cnJlbnRJbmRleCwgbWF0Y2guaW5kZXgpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vclwiKSkge1xuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMl0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfVxuICAgICAgICAgICAgaWYobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yZGluYXRlXCIpKXtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFs1XSxjb29yZGluYXRlTmFtZTogbWF0Y2hbNF0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzJdfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHsgZm9ybWF0dGluZyxvcmlnaW5hbCwgLi4ucmVzdCB9ID0gaTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwiY29vcmRpbmF0ZVwiLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG9yaWdpbmFsLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwiY29vcmRpbmF0ZVwiLCB1bmRlZmluZWQsZm9ybWF0dGluZyksLi4ucmVzdCx9KSk7XG5cbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxccGljXCIpKSB7XG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKVxuICAgICAgICAgICAgY29uc3QgYzI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcylcbiAgICAgICAgICAgIGNvbnN0IGMzPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzNdLHRoaXMpXG5cblxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7bW9kZTogXCJwaWMtYW5nXCIsdG9rZW5zOiB0aGlzLGZvcm1hdHRpbmdTdHJpbmc6IG1hdGNoWzVdLGZvcm1hdHRpbmdPYmo6IHt0aWt6c2V0OiBcImFuZ1wiLGljVGV4dDogbWF0Y2hbNF19LGRyYXdBcnI6IFtjMSxjMixjM119KSk7XG4gICAgICAgICAgfWVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZHJhd1wiKSkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh1bmRlZmluZWQsbWF0Y2hbMV0sbWF0Y2hbMl0sIHRoaXMpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxceHlheGlzXCIpKSB7XG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGdyaWRcIikpIHtcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbm9kZVwiKSkge1xuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbM10sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfVxuICAgICAgICAgICAgaWYgKG1hdGNoWzBdLm1hdGNoKC9cXFxcbm9kZVxccypcXCgvKSl7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbMl0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzFdLGxhYmVsOiBtYXRjaFs0XSxmb3JtYXR0aW5nOiBtYXRjaFszXX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlXCIsYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwob3JpZ2luYWwsdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIsIHVuZGVmaW5lZCxmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7LypcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgICB0eXBlOiBcImNpcmNsZVwiLFxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSxcbiAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzFdLCB0aGlzLnRva2VucyksXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsyXSwgdGhpcy50b2tlbnMpLFxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbM10sIHRoaXMudG9rZW5zKSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pOypcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlXCIsbGFiZWw6IG1hdGNoWzJdLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZVwiLHt0aWt6c2V0OiAnbWFzcycsYW5jaG9yOiBtYXRjaFszXSxyb3RhdGU6IG1hdGNoWzRdfSl9KSlcblxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcbiAgICAgICAgICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpO1xuICAgICAgICAgICAgY29uc3QgYXhpczE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcyk7XG4gICAgICAgICAgICBjb25zdCBub2RlPW5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGUtaW5saW5lXCIsZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoJ25vZGUtaW5saW5lJyx7Y29sb3I6IFwicmVkXCJ9KX0pXG5cbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBDb29yZGluYXRlKFwibm9kZS1pbmxpbmVcIik7XG4gICAgICAgICAgICBjb25zdCBxPVthbmNlciwnLS0rJyxub2RlLGF4aXMxXVxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7Zm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6ICd2ZWMnfSx0b2tlbnM6IHRoaXMsZHJhd0FycjogcX0pKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjdXJyZW50SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4KSk7XG4gICAgICAgIH1cbiAgICB9Ki9cbiAgICBnZXRNaW4oKXtyZXR1cm4gdGhpcy52aWV3QW5jaG9ycy5taW59XG4gICAgZ2V0TWF4KCl7cmV0dXJuIHRoaXMudmlld0FuY2hvcnMubWF4fVxuXG4gICAgZmluZFZpZXdBbmNob3JzKCkge1xuICAgICAgICBjb25zdCBheGVzID0gZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcbiAgICAgICAgXG4gICAgICAgIGxldCBzdW1PZlggPSAwLCBzdW1PZlkgPSAwO1xuICAgICAgICBsZXQgbWF4WCA9IC1JbmZpbml0eSwgbWF4WSA9IC1JbmZpbml0eTtcbiAgICAgICAgbGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5O1xuICAgIFxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzID0ge1xuICAgICAgICAgICAgbWF4OiBuZXcgQXhpcygwLCAwKSxcbiAgICAgICAgICAgIG1pbjogbmV3IEF4aXMoMCwgMCksXG4gICAgICAgICAgICBhdmVNaWRQb2ludDogbmV3IEF4aXMoMCwgMClcbiAgICAgICAgfTtcbiAgICBcbiAgICAgICAgYXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IGNhcnRlc2lhblgsIGNhcnRlc2lhblkgfSA9IGF4aXM7XG4gICAgXG4gICAgICAgICAgICAvLyBVcGRhdGUgc3VtcyBmb3IgYXZlcmFnZSBjYWxjdWxhdGlvblxuICAgICAgICAgICAgc3VtT2ZYICs9IGNhcnRlc2lhblg7XG4gICAgICAgICAgICBzdW1PZlkgKz0gY2FydGVzaWFuWTtcbiAgICBcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBtYXggYW5kIG1pbiBjb29yZGluYXRlc1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblggPiBtYXhYKSBtYXhYID0gY2FydGVzaWFuWDtcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5ZID4gbWF4WSkgbWF4WSA9IGNhcnRlc2lhblk7XG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA8IG1pblgpIG1pblggPSBjYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPCBtaW5ZKSBtaW5ZID0gY2FydGVzaWFuWTtcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIGNvbnN0IGxlbmd0aCA9IGF4ZXMubGVuZ3RoICE9PSAwID8gYXhlcy5sZW5ndGggOiAxO1xuICAgIFxuICAgICAgICAvLyBTZXQgdGhlIHZpZXdBbmNob3JzXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQgPSBuZXcgQXhpcyhzdW1PZlggLyBsZW5ndGgsIHN1bU9mWSAvIGxlbmd0aCk7XG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWF4ID0gbmV3IEF4aXMobWF4WCwgbWF4WSk7XG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWluID0gbmV3IEF4aXMobWluWCwgbWluWSk7XG4gICAgfVxuICAgIFxuXG4gICAgZmluZE9yaWdpbmFsVmFsdWUodmFsdWU6IHN0cmluZykge1xuICAgICAgICBjb25zdCBvZyA9IHRoaXMudG9rZW5zLnNsaWNlKCkucmV2ZXJzZSgpLmZpbmQoXG4gICAgICAgICAgICAodG9rZW46IFRva2VuKSA9PlxuICAgICAgICAgICAgICAgICh0b2tlbiBpbnN0YW5jZW9mIENvb3JkaW5hdGUpICYmIHRva2VuLmNvb3JkaW5hdGVOYW1lID09PSB2YWx1ZVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gb2cgaW5zdGFuY2VvZiBDb29yZGluYXRlID8gb2cuY2xvbmUoKSA6IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgXG5cbiAgICB0b1N0cmluZygpe1xuICAgICAgICBsZXQgY29kZUJsb2NrT3V0cHV0ID0gXCJcIjtcbiAgICAgICAgY29uc29sZS5sb2coJ3RoaXMudG9rZW5zJyx0aGlzLnRva2VucylcbiAgICAgICAgLy9jb25zdCBleHRyZW1lWFk9Z2V0RXh0cmVtZVhZKHRoaXMudG9rZW5zKTtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYodG9rZW4udG9TdHJpbmcoKSl7XG4gICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9dG9rZW4udG9TdHJpbmcoKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBmbGF0dGVuKGRhdGE6IGFueSwgcmVzdWx0czogYW55W10gPSBbXSwgc3RvcENsYXNzPzogYW55KTogYW55W10ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xuICAgICAgICBmbGF0dGVuKGl0ZW0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgZGF0YSAhPT0gbnVsbCkge1xuICAgICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbiBpbnN0YW5jZSBvZiB0aGUgc3RvcENsYXNzLCBhZGQgaXQgdG8gcmVzdWx0cyBhbmQgc3RvcCBmbGF0dGVuaW5nXG4gICAgICBpZiAoc3RvcENsYXNzICYmIGRhdGEgaW5zdGFuY2VvZiBzdG9wQ2xhc3MpIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH1cbiAgXG4gICAgICAvLyBBZGQgdGhlIGN1cnJlbnQgb2JqZWN0IHRvIHJlc3VsdHNcbiAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcbiAgXG4gICAgICAvLyBSZWN1cnNpdmVseSBmbGF0dGVuIHByb3BlcnRpZXMgb2YgdGhlIG9iamVjdFxuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xuICAgICAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgZmxhdHRlbihkYXRhW2tleV0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGdldEV4dHJlbWVYWSh0b2tlbnM6IGFueSkge1xuICAgIGxldCBtYXhYID0gLUluZmluaXR5O1xuICAgIGxldCBtYXhZID0gLUluZmluaXR5O1xuICAgIGxldCBtaW5YID0gSW5maW5pdHk7XG4gICAgbGV0IG1pblkgPSBJbmZpbml0eTtcbiAgICBcbiAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcbiAgICAgICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcbiAgICAgICAgaWYgKHRva2VuLlggPCBtaW5YKSBtaW5YID0gdG9rZW4uWDtcbiAgICBcbiAgICAgICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcbiAgICAgICAgaWYgKHRva2VuLlkgPCBtaW5ZKSBtaW5ZID0gdG9rZW4uWTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICAgIG1heFgsbWF4WSxtaW5YLG1pblksXG4gICAgfTtcbn1cblxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IG51bWJlclZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSk7XG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcbn07XG5cblxuXG5cblxuZnVuY3Rpb24gZ2V0UHJlYW1ibGUoKTpzdHJpbmd7XG4gICAgY29uc3QgYW5nPVwiXFxcXHRpa3pzZXR7YW5nLy5zdHlsZSAyIGFyZ3M9e2ZpbGw9YmxhY2shNTAsb3BhY2l0eT0wLjUsdGV4dCBvcGFjaXR5PTAuOSxkcmF3PW9yYW5nZSw8LT4sYW5nbGUgZWNjZW50cmljaXR5PSMxLGFuZ2xlIHJhZGl1cz0jMmNtLHRleHQ9b3JhbmdlLGZvbnQ9XFxcXGxhcmdlfSxhbmcvLmRlZmF1bHQ9ezEuNn17MC41fX1cIlxuICBcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxuICBcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxuICAgIGNvbnN0IHNwcmluZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxzcHJpbmd9WzRde1xcXFx0aWt6bWF0aHtjb29yZGluYXRlIFxcXFxzdGFydCwgXFxcXGRvbmU7XFxcXHN0YXJ0ID0gKCMxKTtcXFxcZG9uZSA9ICgjMik7fVxcXFxkcmF3W3RoaWNrXSAoJChcXFxcc3RhcnQpICsgKC0xLjUsMCkkKSAtLSsrKDMsMCk7XFxcXGRyYXcgKFxcXFxzdGFydCkgLS0rICgwLC0wLjI1Y20pO1xcXFxkcmF3ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4KzBjbSxcXFxcZG9uZXkrMC4yNWNtKSQpLS0rKDAsLTAuMjUpO1xcXFxkcmF3W2RlY29yYXRpb249e2FzcGVjdD0wLjMsIHNlZ21lbnQgbGVuZ3RoPTMsIGFtcGxpdHVkZT0ybW0sY29pbCx9LGRlY29yYXRlXSAoXFxcXHN0YXJ0eCxcXFxcc3RhcnR5LTAuMjVjbSkgLS0oJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkrMC4yNWNtKSQpbm9kZVttaWR3YXkscmlnaHQ9MC4yNWNtLGJsYWNrXXsjNH07XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSkkKXsjM307fVwiXG4gICAgXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXG4gICAgXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXG4gICAgY29uc3QgbWFzcz1gXFxcXGRlZlxcXFxtYXNzIzEjMntcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCMxKXsjMn07fWBcbiAgICBjb25zdCBtYXNzU2V0PVwiXFxcXHRpa3pzZXR7IG1hc3MvLnN0eWxlPXtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2t9fVwiXG4gICAgY29uc3QgZHZlY3Rvcj1cIlxcXFxuZXdjb21tYW5ke1xcXFxkdmVjdG9yfVsyXXtcXFxcY29vcmRpbmF0ZSAodGVtcDEpIGF0ICgkKDAsMCAtfCAjMSkkKTtcXFxcY29vcmRpbmF0ZSAodGVtcDIpIGF0ICgkKDAsMCB8LSAjMSkkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0wLjdwdCwjMl0gKCMxKS0tKHRlbXAxKSgjMSktLSh0ZW1wMik7fVwiXG4gICAgXG4gICAgY29uc3QgcGljQW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFuZ31bNV17XFxcXGNvb3JkaW5hdGUgKGFuZzEpIGF0ICgjMSk7IFxcXFxjb29yZGluYXRlIChhbmcyKSBhdCAoIzIpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMykgYXQgKCMzKTsgXFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzN9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMX17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0FCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHBhcnNle1xcXFxhbmdDQiAtIFxcXFxhbmdBQn1cXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdDwwcHRcXFxccGdmbWF0aHBhcnNle1xcXFxwZ2ZtYXRocmVzdWx0ICsgMzYwfVxcXFxmaVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PjE4MHB0XFxcXHBnZm1hdGhwYXJzZXszNjAgLSBcXFxccGdmbWF0aHJlc3VsdH1cXFxcZmlcXFxcbGV0XFxcXGFuZ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoc2V0bWFjcm97XFxcXGFuZ2xlQ2hlY2t9e2FicyhcXFxcYW5nQiAtIDkwKX1cXFxcaWZ0aGVuZWxzZXtcXFxcbGVuZ3RodGVzdHtcXFxcYW5nbGVDaGVjayBwdCA8IDAuMXB0fX17XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17cmlnaHQgYW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXthbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9fVwiXG4gICAgY29uc3QgcHJlYW1ibGU9XCJcXFxcdXNlcGFja2FnZXtwZ2ZwbG90cyxpZnRoZW59XFxcXHVzZXRpa3psaWJyYXJ5e2Fycm93cy5tZXRhLGFuZ2xlcyxxdW90ZXMscG9zaXRpb25pbmcsIGNhbGMsIGludGVyc2VjdGlvbnMsZGVjb3JhdGlvbnMubWFya2luZ3MsbWF0aCxzcHksbWF0cml4LHBhdHRlcm5zLHNuYWtlcyxkZWNvcmF0aW9ucy5wYXRocmVwbGFjaW5nLGRlY29yYXRpb25zLnBhdGhtb3JwaGluZyxwYXR0ZXJucyxzaGFkb3dzLHNoYXBlcy5zeW1ib2xzfVwiXG4gICAgcmV0dXJuIHByZWFtYmxlK2FuZyttYXJrK2FycitsZW5lK3NwcmluZyt0cmVlK3RhYmxlK2Nvb3IrZHZlY3RvcitwaWNBbmcrbWFzc1NldCtcIlxcXFxwZ2ZwbG90c3NldHtjb21wYXQ9MS4xNn1cXFxcYmVnaW57ZG9jdW1lbnR9XFxcXGJlZ2lue3Rpa3pwaWN0dXJlfVwiXG59Il19