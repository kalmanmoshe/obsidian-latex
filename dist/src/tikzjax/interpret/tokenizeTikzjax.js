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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxjQUFjO0FBQ2QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBR3BILFNBQVMsMkJBQTJCLENBQUMsS0FBSztJQUN0QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUNELFNBQVMsSUFBSSxDQUFDLE1BQU07SUFDaEIsSUFBSSxNQUFNLEdBQUMsRUFBRSxDQUFBO0lBQ2IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUNuQixNQUFNLEVBQUUsR0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUN0RCxJQUFHLEVBQUUsRUFBQyxDQUFD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SUFBSSxHQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsT0FBTyxHQUFDLGlFQUFpRSxDQUFBO0FBQ3JKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAdHMtbm9jaGVja1xuaW1wb3J0IHsgZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzIH0gZnJvbSBcInNyYy9tYXRoRW5naW5lXCI7XG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCByZWdFeHAsIFRva2VuLCB0b1BvaW50IH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcbmltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaXprQ29tbWFuZHMsIHNlYXJjaFRpemtGb3JPZ0xhdGV4IH0gZnJvbSBcInNyYy90aWt6amF4L3Rpa3pDb21tYW5kc1wiO1xuaW1wb3J0IHsgZmluZE1vZGlmaWVkUGFyZW5JbmRleCwgZmluZFBhcmVuSW5kZXgsIGlkUGFyZW50aGVzZXMsIG1hcEJyYWNrZXRzLCBQYXJlbiB9IGZyb20gXCJzcmMvdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xuaW1wb3J0IHsgdGV4dCB9IGZyb20gXCJzdHJlYW0vY29uc3VtZXJzXCI7XG5cbmZ1bmN0aW9uIGxhYmVsRnJlZUZvcm1UZXh0U2VwYXJhdGlvbihsYWJlbCl7XG4gICAgY29uc3QgY29sb25JbmRleD1sYWJlbC5maW5kSW5kZXgodD0+dC5uYW1lPT09J0NvbG9uJylcbiAgICAgbGFiZWw9bGFiZWwuc3BsaWNlKGNvbG9uSW5kZXgsbGFiZWwubGVuZ3RoLWNvbG9uSW5kZXgpXG4gICAgcmV0dXJuIGxhYmVsLnNwbGljZSgxKVxufVxuZnVuY3Rpb24gdG9PZyh0b2tlbnMpe1xuICAgIGxldCBzdHJpbmc9JydcbiAgICB0b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XG4gICAgICAgIGNvbnN0IG9nPXNlYXJjaFRpemtGb3JPZ0xhdGV4KHRva2VuLm5hbWV8fHRva2VuLnZhbHVlKVxuICAgICAgICBpZihvZyl7XG4gICAgICAgICAgICBpZihvZy5sYXRleClcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW9nLmxhdGV4XG4gICAgICAgICAgICBlbHNlIGlmKG9nLnJlZmVyZW5jZXM/Lmxlbmd0aD09PTEpXG4gICAgICAgICAgICAgICAgc3RyaW5nKz1vZy5yZWZlcmVuY2VzWzBdXG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgc3RyaW5nKz10b2tlbi52YWx1ZVxuICAgIH0pO1xuICAgIHJldHVybiBzdHJpbmdcbn1cblxuZnVuY3Rpb24gY2xlYW5Gb3JtYXR0aW5nKGZvcm1hdHRpbmc6IGFueVtdLHN1YlR5cGU/OiBzdHJpbmcpOiBhbnlbXVtdIHtcbiAgICBjb25zdCB2YWx1ZXM6IGFueVtdW10gPSBbXTtcbiAgICBsZXQgY3VycmVudEdyb3VwOiBhbnlbXSA9IFtdO1xuICAgIGNvbnN0IGZvcm1hdHRpbmdLZXlzPVtdXG5cbiAgICBpZihzdWJUeXBlPT09J0xhYmVsJyl7XG4gICAgICAgIGNvbnN0IGxhYmVsPWxhYmVsRnJlZUZvcm1UZXh0U2VwYXJhdGlvbihmb3JtYXR0aW5nKVxuICAgICAgICBmb3JtYXR0aW5nS2V5cy5wdXNoKHtrZXk6ICdmcmVlRm9ybVRleHQnLHZhbHVlOiB0b09nKGxhYmVsKX0pXG4gICAgfVxuICAgIFxuXG4gICAgY29uc3QgYnJhY2tldE1hcD1tYXBCcmFja2V0cygnQ3VybHlfYnJhY2tldHNfb3BlbicsZm9ybWF0dGluZyk7XG4gICAgYnJhY2tldE1hcC5yZXZlcnNlKClcbiAgICBicmFja2V0TWFwLmZvckVhY2goYnJhY2tldCA9PiB7XG4gICAgICAgIGlmKGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTFdLm5hbWU9PT0nRXF1YWxzJyl7XG4gICAgICAgICAgICBsZXQgc3ViRm9ybWF0dGluZz1mb3JtYXR0aW5nLnNwbGljZShicmFja2V0Lm9wZW4tMSxicmFja2V0LmNsb3NlLShicmFja2V0Lm9wZW4tMikpXG4gICAgICAgICAgICBzdWJGb3JtYXR0aW5nPXN1YkZvcm1hdHRpbmcuc2xpY2UoMiwtMSlcbiAgICAgICAgICAgIGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLnZhbHVlPWNsZWFuRm9ybWF0dGluZyhzdWJGb3JtYXR0aW5nLGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLm5hbWUpXG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBmb3JtYXR0aW5nKSB7XG4gICAgICAgIGlmIChpdGVtLm5hbWUgPT09ICdDb21tYScpIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50R3JvdXAubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGN1cnJlbnRHcm91cCk7XG4gICAgICAgICAgICAgICAgY3VycmVudEdyb3VwID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjdXJyZW50R3JvdXAucHVzaChpdGVtKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudEdyb3VwKTtcbiAgICB9XG5cbiAgICBcbiAgICB2YWx1ZXMuZm9yRWFjaCgodmFsdWUpID0+IHtcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaChhc3NpZ25Gb3JtYXR0aW5nKHZhbHVlKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGZvcm1hdHRpbmdLZXlzIFxufVxuXG5mdW5jdGlvbiBhc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmcpe1xuXG4gICAgY29uc3QgaXNFcXVhbHM9Zm9ybWF0dGluZy5tYXAoKGYsaWR4KT0+Zi5uYW1lPT09J0VxdWFscyc/aWR4Om51bGwpLmZpbHRlcih0PT50IT09bnVsbCk7XG4gICAgY29uc3Qga2V5PWZvcm1hdHRpbmdbMF0/Lm5hbWVcblxuICAgIGlmKGlzRXF1YWxzLmxlbmd0aD09PTEpXG4gICAgICAgIGZvcm1hdHRpbmc9Zm9ybWF0dGluZy5zbGljZSgoaXNFcXVhbHNbMF0rMSkpXG5cbiAgICBsZXQgdmFsdWU9aW50ZXJwcmV0Rm9ybWF0dGluZ1ZhbHVlKGZvcm1hdHRpbmcpO1xuICAgIHJldHVybiB7a2V5LHZhbHVlfVxufVxuXG5cbmZ1bmN0aW9uIGludGVycHJldEZvcm1hdHRpbmdWYWx1ZShmb3JtYXR0aW5nKXtcbiAgICBpZiAoZm9ybWF0dGluZy5sZW5ndGg9PT0xKXtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRpbmdbMF0udmFsdWV8fHRydWVcbiAgICB9XG4gICAgcmV0dXJuIGZvcm1hdHRpbmdcbn1cblxuY2xhc3MgVGlrekNvbW1hbmR7XG4gICAgdHJpZ2dlcjogc3RyaW5nO1xuICAgIGhvb2tOdW06IG51bWJlcjtcbiAgICBob29rczogYW55O1xuICAgIGNvbnRlbnQ6IEJhc2ljVGlrelRva2VuW11cbiAgICBhZGRDb21tYW5kKHRyaWdnZXIsIGhvb2tOdW0sIGNvbnRlbnQpe1xuICAgICAgICB0aGlzLnRyaWdnZXI9dHJpZ2dlcjtcbiAgICAgICAgdGhpcy5ob29rTnVtPWhvb2tOdW07XG4gICAgICAgIHRoaXMuY29udGVudD1jb250ZW50O1xuICAgICAgICB0aGlzLmZpbmRIb29rcygpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIGZpbmRIb29rcygpe1xuICAgICAgICBjb25zdCBoYXNodGFnTWFwPXRoaXMuY29udGVudC5tYXAoKGl0ZW0saW5kZXgpPT5pdGVtLm5hbWU9PT0nSGFzaHRhZycmJnRoaXMuY29udGVudFtpbmRleCsxXS50eXBlPT09J251bWJlcic/aW5kZXg6bnVsbClcbiAgICAgICAgLmZpbHRlcih0PT50IT09bnVsbClcbiAgICAgICAgaWYoaGFzaHRhZ01hcC5sZW5ndGghPT10aGlzLmhvb2tOdW0pe1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBEaXNjcmVwYW5jeSBiZXR3ZWVuIHRoZSBudW1iZXIgb2YgaG9va3MgZGVjbGFyZWQgYW5kIHRoZSBudW1iZXIgb2YgaG9va3MgZm91bmQgaW4gdGhlIGNvbW1hbmQgaG9va051bTogJHt0aGlzLmhvb2tOdW19IGhhc2h0YWdNYXAubGVuZ3RoOiAke2hhc2h0YWdNYXAubGVuZ3RofWApO1xuICAgICAgICB9XG4gICAgICAgIGhhc2h0YWdNYXAuc29ydCgoYSxiKT0+Yi1hKVxuICAgICAgICBoYXNodGFnTWFwLmZvckVhY2goaWR4ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGhhc2h0YWc9dGhpcy5jb250ZW50W2lkeF07XG4gICAgICAgICAgICBoYXNodGFnLnR5cGU9J1N5bnRheCdcbiAgICAgICAgICAgIGhhc2h0YWcubmFtZT0naG9vaydcbiAgICAgICAgICAgIGhhc2h0YWcudmFsdWU9dGhpcy5jb250ZW50W2lkeCsxXT8udmFsdWU7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3BsaWNlKGlkeCsxLDEpXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXRJbmZvKCl7XG4gICAgICAgIHJldHVybiB7dHJpZ2dlcjogdGhpcy50cmlnZ2VyLGhvb2tzOiB0aGlzLmhvb2tOdW19XG4gICAgfVxufVxuXG5cbmNsYXNzIFRpa3pDb21tYW5kc3tcbiAgICBjb21tYW5kczogVGlrekNvbW1hbmRbXT1bXTtcbiAgICBjb25zdHJ1Y3RvcigpO1xuICAgIGFkZENvbW1hbmQodG9rZW5zKXtcbiAgICAgICAgXG4gICAgfVxuICAgIGFkZENvbW1hbmRCeUludGVycHJldGF0aW9uKHRva2Vucykge1xuICAgICAgICBjb25zdCBpZDFUb2tlbiA9IHRva2Vucy5maW5kKChpdGVtKSA9PiBpdGVtLm5hbWUgPT09ICdDdXJseV9icmFja2V0c19vcGVuJyk7XG4gICAgICAgIGlmICghaWQxVG9rZW4pIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjogJ0N1cmx5X2JyYWNrZXRzX29wZW4nIG5vdCBmb3VuZCBpbiB0b2tlbnMuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGxldCBpZDEgPSBpZDFUb2tlbi52YWx1ZTtcbiAgICAgICAgY29uc3QgaWQyID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChpZDEsIHVuZGVmaW5lZCwgdG9rZW5zLCAwLCAxKTtcbiAgICAgICAgY29uc3QgaWQzID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChpZDEsIHVuZGVmaW5lZCwgdG9rZW5zLCAwLCAxLCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xuICAgIFxuICAgICAgICBpZiAoIWlkMiB8fCAhaWQzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6IFVuYWJsZSB0byBmaW5kIG1hdGNoaW5nIGJyYWNrZXRzLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZDE9ZmluZFBhcmVuSW5kZXgoaWQxLCB1bmRlZmluZWQsIHRva2VucylcbiAgICAgICAgbGV0IHRyaWdnZXIsIGhvb2tzLCBjb250ZW50O1xuICAgICAgICBjb250ZW50ID0gdG9rZW5zLnNwbGljZShpZDMub3BlbiArIDEsIGlkMy5jbG9zZSAtIGlkMy5vcGVuIC0gMSk7XG4gICAgICAgIGhvb2tzID0gdG9rZW5zLnNwbGljZShpZDIub3BlbiArIDEsIGlkMi5jbG9zZSAtIGlkMi5vcGVuIC0gMSk7XG4gICAgICAgIHRyaWdnZXIgPSB0b2tlbnMuc3BsaWNlKGlkMS5vcGVuKzEsIGlkMS5jbG9zZSAtIGlkMS5vcGVuIC0gMSk7XG5cbiAgICAgICAgaWYgKGhvb2tzLmxlbmd0aCA9PT0gMSAmJiBob29rc1swXT8udHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIGhvb2tzID0gaG9va3NbMF0udmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGhvb2tzOiBFeHBlY3RlZCBhIHNpbmdsZSBudW1lcmljIHZhbHVlLlwiKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKHRyaWdnZXIubGVuZ3RoID09PSAxICYmIHRyaWdnZXJbMF0/LnR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0cmlnZ2VyID0gdHJpZ2dlclswXS52YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgdHJpZ2dlcjogRXhwZWN0ZWQgYSBzaW5nbGUgc3RyaW5nIHZhbHVlLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvbW1hbmRzLnB1c2gobmV3IFRpa3pDb21tYW5kKCkuYWRkQ29tbWFuZCh0cmlnZ2VyLCBob29rcywgY29udGVudCkpXG4gICAgfVxuXG4gICAgcmVwbGFjZUNhbGxXaXRoQ29tbWFuZCh0cmlnZ2VyOiBzdHJpbmcsaG9va051bWJlcjogbnVtYmVyLGhvb2tzOiBhbnlbXSl7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLmNvbW1hbmRzLmZpbmQoY29tbWFuZCA9PiBcbiAgICAgICAgICAgIGNvbW1hbmQudHJpZ2dlciA9PT0gdHJpZ2dlciAmJiBob29rTnVtYmVyID09PSBjb21tYW5kLmhvb2tOdW1cbiAgICAgICAgKT8uY29udGVudDtcblxuICAgICAgICBjb25zdCBtYXAgPSBjb250ZW50Py5tYXAoKGl0ZW0sIGluZGV4KSA9PiBcbiAgICAgICAgICAgIGl0ZW0ubmFtZSA9PT0gJ2hvb2snID8geyBpbmRleCwgdmFsdWU6IGl0ZW0udmFsdWUgfSA6IG51bGxcbiAgICAgICAgKS5maWx0ZXIodCA9PiB0ICE9PSBudWxsKTtcbiAgICAgICAgbWFwPy5yZXZlcnNlKCk7XG5cbiAgICAgICAgY29uc3QgdW5pcXVlVmFsdWVzID0gbmV3IFNldCgpO1xuICAgICAgICBmb3IgKGNvbnN0IHsgaW5kZXgsIHZhbHVlIH0gb2YgbWFwIHx8IFtdKSB7XG4gICAgICAgICAgICBpZiAoIXVuaXF1ZVZhbHVlcy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdW5pcXVlVmFsdWVzLmFkZCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250ZW50LnNwbGljZShpbmRleCwgMSwgLi4uaG9va3NbdmFsdWUtMV0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb250ZW50XG4gICAgfVxuXG4gICAgZ2V0SG9va3ModG9rZW5zLGlkcyl7XG4gICAgICAgIHRva2Vucy5zcGxpY2UoMCwxKVxuICAgICAgICBjb25zdCBhZGp1c3RtZW50VmFsdWU9aWRzWzBdLm9wZW5cbiAgICAgICAgaWRzLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgaWQub3Blbi09YWRqdXN0bWVudFZhbHVlO1xuICAgICAgICAgICAgaWQuY2xvc2UtPWFkanVzdG1lbnRWYWx1ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlkcy5yZXZlcnNlKCk7XG4gICAgICAgIGNvbnN0IGhvb2tzPVtdXG4gICAgICAgIGlkcy5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQ9dG9rZW5zLnNwbGljZShpZC5vcGVuKzEsaWQuY2xvc2UtKGlkLm9wZW4rMSkpXG4gICAgICAgICAgICBob29rcy5wdXNoKHJlbW92ZWQpXG4gICAgICAgIH0pO1xuICAgICAgICBob29rcy5yZXZlcnNlKCk7XG4gICAgICAgIHJldHVybiBob29rc1xuICAgIH1cbiAgICBcbn1cblxuZXhwb3J0IGNsYXNzIEJhc2ljVGlrelRva2Vue1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmdcbiAgICB2YWx1ZTogc3RyaW5nfG51bWJlcnxQYXJlbnxhbnlcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTogbnVtYmVyfHN0cmluZ3xvYmplY3Qpe1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlPT09J251bWJlcicpe1xuICAgICAgICAgICAgdGhpcy50eXBlPSdudW1iZXInXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xuICAgICAgICAgICAgcmV0dXJuIFxuICAgICAgICB9XG4gICAgICAgIGlmKHR5cGVvZiB2YWx1ZT09PSdzdHJpbmcnKXtcbiAgICAgICAgICAgIHRoaXMudHlwZT0nc3RyaW5nJ1xuICAgICAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0aGlzLnR5cGU9dmFsdWUudHlwZS5yZXBsYWNlKC9CcmFja2V0LywnU3ludGF4JylcbiAgICAgICAgdGhpcy5uYW1lPXZhbHVlLm5hbWVcbiAgICAgICAgdGhpcy52YWx1ZT12YWx1ZS52YWx1ZVxuICAgICAgICBcbiAgICB9XG4gICAgdG9TdHJpbmcoKXtcbiAgICAgICAgcmV0dXJuIHNlYXJjaFRpemtGb3JPZ0xhdGV4KHRoaXMubmFtZSkubGF0ZXhcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgVGlrelZhcmlhYmxle1xuICAgIC8vdHlwZTogXG5cbn1cbmV4cG9ydCBjbGFzcyBUaWt6VmFyaWFibGVze1xuICAgIHZhcmlhYmxlczogW109W11cblxufVxuXG5mdW5jdGlvbiB0b1ZhcmlhYmxlVG9rZW4oYXJyOiBhbnlbXSkge1xuICAgIGFycj1hcnIuZmlsdGVyKHQ9PighdC50eXBlLmluY2x1ZGVzKCdQYXJlbnRoZXNlcycpKSlcbiAgICBhcnI9dG9PZyhhcnIpXG4gICAgdG9rZW49bmV3IEJhc2ljVGlrelRva2VuKGFycilcbiAgICB0b2tlbi50eXBlPSd2YXJpYWJsZSdcbiAgICByZXR1cm4gdG9rZW5cbn1cblxuXG5cbmV4cG9ydCBjbGFzcyBCYXNpY1Rpa3pUb2tlbnN7XG4gICAgcHJpdmF0ZSB0b2tlbnM6IEFycmF5PEJhc2ljVGlrelRva2VufEZvcm1hdHRpbmc+ID0gW11cbiAgICBwcml2YXRlIHRpa3pDb21tYW5kczogVGlrekNvbW1hbmRzPW5ldyBUaWt6Q29tbWFuZHMoKTtcblxuICAgIGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nKXtcbiAgICAgICAgc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xuICAgICAgICBzb3VyY2U9dGhpcy5iYXNpY0FycmF5aWZ5KHNvdXJjZSlcbiAgICAgICAgdGhpcy5iYXNpY1Rpa3pUb2tlbmlmeShzb3VyY2UpXG4gICAgICAgIHRoaXMuY2xlYW5CYXNpY1Rpa3pUb2tlbmlmeSgpXG4gICAgICAgIFxuICAgICAgICB0aGlzLnByZXBhcmVGb3JUb2tlbml6ZSgpXG4gICAgfVxuICAgIGdldFRva2Vucygpe1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcbiAgICB9XG5cbiAgICBwcml2YXRlIHRpZHlUaWt6U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XG4gICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gc291cmNlLnNwbGl0KFwiXFxuXCIpO1xuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpLnJlcGxhY2UoLyg/PD1bXlxcd10pIHwgKD89W15cXHddKS9nLCBcIlwiKS5yZXBsYWNlKC8oPzwhXFxcXCklLiokL2dtLCBcIlwiKS5yZXBsYWNlKC9cXG4vZyxcIlwiKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJhc2ljQXJyYXlpZnkoc291cmNlKXtcbiAgICAgICAgY29uc3QgYmFzaWNBcnJheSA9IFtdO1xuICAgICAgICBjb25zdCBvcGVyYXRvcnNSZWdleCA9IG5ldyBSZWdFeHAoJ14nICsgYXJyVG9SZWdleFN0cmluZyhnZXRBbGxUaWt6UmVmZXJlbmNlcygpKSk7XG4gICAgICAgIGxldCBpID0gMDtcbiAgICAgICAgIFxuICAgICAgICB3aGlsZSAoaSA8IHNvdXJjZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHN1YlNvdXJjZSA9IHNvdXJjZS5zbGljZShpKTtcbiAgICAgICAgICAgIGxldCBtYXRjaDtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBNYXRjaCBUaWtaIG9wZXJhdG9yc1xuICAgICAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2gob3BlcmF0b3JzUmVnZXgpO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IG1hdGNoWzBdIH0pO1xuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIC8vIE1hdGNoIG51bWJlcnNcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eWy0wLTkuXSsvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ251bWJlcicsIHZhbHVlOiBwYXJzZU51bWJlcihtYXRjaFswXSkgfSk7XG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlthLXpBLVpcXFxcXSsvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiBtYXRjaFswXSB9KTtcbiAgICAgICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICBcbiAgICAgICAgICAgIC8vIEluY3JlbWVudCBpbmRleCBpZiBubyBtYXRjaCBmb3VuZFxuICAgICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBiYXNpY0FycmF5XG4gICAgfVxuICAgIHByaXZhdGUgYmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNBcnJheSl7XG4gICAgICAgICAvLyBQcm9jZXNzIHRva2Vuc1xuICAgICAgICBiYXNpY0FycmF5LmZvckVhY2goKHsgdHlwZSwgdmFsdWUgfSkgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGlrekNvbW1hbmQgPSBzZWFyY2hUaXprQ29tbWFuZHModmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmICh0aWt6Q29tbWFuZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY1Rpa3pUb2tlbih0aWt6Q29tbWFuZCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odmFsdWUpKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY1Rpa3pUb2tlbih2YWx1ZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcbiAgICB9XG4gICAgcHJpdmF0ZSBpbmZlckFuZEludGVycHJldENvbW1hbmRzKCl7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBjb21tYW5kc01hcD10aGlzLnRva2Vucy5tYXAoKHQsaWR4KT0+dC50eXBlPT09J0NvbW1hbmQnP2lkeDpudWxsKVxuICAgICAgICAuZmlsdGVyKHQ9PnQhPT1udWxsKTtcbiAgICAgICAgY29tbWFuZHNNYXAuZm9yRWFjaChpbmRleCA9PiB7XG4gICAgICAgICAgICBjb25zdCBmaXJzdEJyYWNrZXRBZnRlckluZGV4PXRoaXMudG9rZW5zLnNsaWNlKGluZGV4KS5maW5kKChpdGVtLGlkeCk9Pml0ZW0ubmFtZT09PSdDdXJseV9icmFja2V0c19vcGVuJyk7XG4gICAgICAgICAgICBjb25zdCBlbmRPZkV4cHJlc3Npb249ZmluZE1vZGlmaWVkUGFyZW5JbmRleChmaXJzdEJyYWNrZXRBZnRlckluZGV4LnZhbHVlLHVuZGVmaW5lZCx0aGlzLnRva2VucywwLDEsJ0N1cmx5X2JyYWNrZXRzX29wZW4nKVxuICAgICAgICAgICAgY29uc3QgY29tbWFuZD10aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsTWF0aC5hYnMoaW5kZXgtKGVuZE9mRXhwcmVzc2lvbi5jbG9zZSsxKSkpXG4gICAgICAgICAgICB0aGlzLnRpa3pDb21tYW5kcy5hZGRDb21tYW5kQnlJbnRlcnByZXRhdGlvbihjb21tYW5kKVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBjb21tYW5kcz10aGlzLnRpa3pDb21tYW5kcy5jb21tYW5kcy5tYXAoYz0+Yy5nZXRJbmZvKCkpO1xuICAgICAgICBjb25zdCBjb21tYW5kc0luVG9rZW5zPXRoaXMudG9rZW5zLm1hcCgoaXRlbSxpbmRleCk9PntcbiAgICAgICAgICAgIGlmKGl0ZW0udHlwZSE9PSdzdHJpbmcnKXtyZXR1cm4gbnVsbH1cbiAgICAgICAgICAgIGNvbnN0IG1hdGNoPWNvbW1hbmRzLmZpbmQoYz0+Yy50cmlnZ2VyPT09aXRlbS52YWx1ZSlcbiAgICAgICAgICAgIGlmKG1hdGNoKXtcbiAgICAgICAgICAgICAgICByZXR1cm4ge2luZGV4OiBpbmRleCwuLi5tYXRjaH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsXG4gICAgICAgIH0pLmZpbHRlcih0PT50IT09bnVsbCk7XG5cbiAgICAgICAgY29uc3QgZm91bkFuZENvbmZpcm1lZENvbW1hbmRzID0gW107XG4gICAgICAgIGZvciAoY29uc3QgW2luZGV4LCB7IHRyaWdnZXIsIGhvb2tzIH1dIG9mIE9iamVjdC5lbnRyaWVzKGNvbW1hbmRzSW5Ub2tlbnMpKSB7XG4gICAgICAgICAgICBjb25zdCBudW1lcmljSW5kZXggPSBOdW1iZXIoaW5kZXgpOyAvLyBFbnN1cmUgaW5kZXggaXMgYSBudW1iZXJcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0QnJhY2tldEFmdGVySW5kZXggPSB0aGlzLnRva2Vuc1xuICAgICAgICAgICAgICAgIC5zbGljZShudW1lcmljSW5kZXgpXG4gICAgICAgICAgICAgICAgLmZpbmQoKGl0ZW0pID0+IGl0ZW0ubmFtZSA9PT0gJ0N1cmx5X2JyYWNrZXRzX29wZW4nKT8udmFsdWU7XG5cbiAgICAgICAgICAgIGlmICghZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkN1cmx5X2JyYWNrZXRzX29wZW4gbm90IGZvdW5kIGFmdGVyIGluZGV4IFwiICsgaW5kZXgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodHlwZW9mIGhvb2tzICE9PSAnbnVtYmVyJyB8fCBob29rcyA8PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGhvb2tzIHZhbHVlIGF0IGluZGV4ICR7aW5kZXh9YCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG9iaiA9IHsgaW5kZXgsIHRyaWdnZXIsIGhvb2tzLCBpZHM6IFtdIH07XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG9va3M7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVuUGFpckluZGV4ID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2VucyxcbiAgICAgICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgICAgICAgJ0N1cmx5X2JyYWNrZXRzX29wZW4nXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXBhcmVuUGFpckluZGV4KSBcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQYXJlbiBwYWlyIG5vdCBmb3VuZCBmb3IgaG9vayAke2l9IGF0IGluZGV4ICR7aW5kZXh9YCk7XG4gICAgICAgICAgICAgICAgaWYgKG9iai5pZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0SWQgPSBvYmouaWRzW29iai5pZHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChsYXN0SWQuY2xvc2UgIT09IHBhcmVuUGFpckluZGV4Lm9wZW4gLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc21hdGNoIGJldHdlZW4gbGFzdCBjbG9zZSAoJHtsYXN0SWQuY2xvc2V9KSBhbmQgbmV4dCBvcGVuICgke3BhcmVuUGFpckluZGV4Lm9wZW59KWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG9iai5pZHMucHVzaChwYXJlblBhaXJJbmRleCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3VuQW5kQ29uZmlybWVkQ29tbWFuZHMucHVzaChvYmopO1xuICAgICAgICB9XG5cbiAgICAgICAgZm91bkFuZENvbmZpcm1lZENvbW1hbmRzLmZvckVhY2goY29tbWFuZCA9PiB7XG4gICAgICAgICAgICBpZiAoIWNvbW1hbmQuaWRzIHx8IGNvbW1hbmQuaWRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjogQ29tbWFuZCBJRHMgYXJlIGVtcHR5IG9yIHVuZGVmaW5lZC5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgb3BhbiA9IGNvbW1hbmQuaW5kZXg7IFxuICAgICAgICAgICAgY29uc3QgY2xvc2UgPSBjb21tYW5kLmlkc1tjb21tYW5kLmlkcy5sZW5ndGggLSAxXS5jbG9zZTtcbiAgICAgICAgICAgIGlmIChjbG9zZSA8IG9wYW4pIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6IENsb3NlIGluZGV4IGlzIHNtYWxsZXIgdGhhbiBvcGVuIGluZGV4LlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBkZWxldGVDb3VudCA9IGNsb3NlIC0gb3BhbiArIDE7XG4gICAgICAgICAgICBjb25zdCByZW1vdmVkVG9rZW5zID0gdGhpcy50b2tlbnMuc2xpY2Uob3BhbiwgY2xvc2UpO1xuICAgICAgICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSB0aGlzLnRpa3pDb21tYW5kcy5yZXBsYWNlQ2FsbFdpdGhDb21tYW5kKFxuICAgICAgICAgICAgICAgIGNvbW1hbmQudHJpZ2dlcixcbiAgICAgICAgICAgICAgICBjb21tYW5kLmhvb2tzLFxuICAgICAgICAgICAgICAgIHRoaXMudGlrekNvbW1hbmRzLmdldEhvb2tzKHJlbW92ZWRUb2tlbnMsY29tbWFuZC5pZHMpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShvcGFuLCBkZWxldGVDb3VudCwgLi4ucmVwbGFjZW1lbnQpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcHJpdmF0ZSBjbGVhbkJhc2ljVGlrelRva2VuaWZ5KCl7XG5cbiAgICAgICAgdGhpcy5pbmZlckFuZEludGVycHJldENvbW1hbmRzKClcblxuXG4gICAgICAgIGNvbnN0IHVuaXRJbmRpY2VzOiBudW1iZXJbXSA9IHRoaXMudG9rZW5zXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbi50eXBlID09PSAnVW5pdCcgPyBpZHggOiBudWxsKSlcbiAgICAgICAgLmZpbHRlcigoaWR4KTogaWR4IGlzIG51bWJlciA9PiBpZHggIT09IG51bGwpO1xuXG4gICAgICAgIHVuaXRJbmRpY2VzLmZvckVhY2goKHVuaXRJZHgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRoaXMudG9rZW5zW3VuaXRJZHggLSAxXTtcblxuICAgICAgICAgICAgaWYgKCFwcmV2VG9rZW4gfHwgcHJldlRva2VuLnR5cGUgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbml0cyBjYW4gb25seSBiZSB1c2VkIGluIHJlZmVyZW5jZSB0byBudW1iZXJzIGF0IGluZGV4ICR7dW5pdElkeH1gKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHJldlRva2VuLnZhbHVlID0gdG9Qb2ludChwcmV2VG9rZW4udmFsdWUgYXMgbnVtYmVyLCB0aGlzLnRva2Vuc1t1bml0SWR4XS5uYW1lKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICghdW5pdEluZGljZXMuaW5jbHVkZXMoaWR4KSkpO1xuXG4gICAgICAgIC8vdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKCh0KSA9PiB0Lm5hbWUhPT0nQ29tbWEnKTtcbiAgICAgICAgLypcbiAgICAgICAgY29uc3QgaW5kZXhlc1RvUmVtb3ZlOiBudW1iZXJbXT1bXVxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbixpbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYodG9rZW4udHlwZT09PSdGb3JtYXR0aW5nJyl7XG4gICAgICAgICAgICAgICAgaWYodGhpcy50b2tlbnNbaW5kZXgrMV0ubmFtZT09PSdFcXVhbHMnKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXhdLnZhbHVlPXRoaXMudG9rZW5zW2luZGV4KzJdXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ZXNUb1JlbW92ZS5wdXNoKGluZGV4KzEsaW5kZXgrMik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICghaW5kZXhlc1RvUmVtb3ZlLmluY2x1ZGVzKGlkeCkpKTsqL1xuXG5cblxuICAgICAgICBjb25zdCBtYXBTeW50YXggPSB0aGlzLnRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbiwgaWR4KSA9PiAodG9rZW4udHlwZSA9PT0gJ1N5bnRheCcgJiYgLyhEYXNofFBsdXMpLy50ZXN0KHRva2VuLm5hbWUpID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcblxuICAgICAgICBjb25zdCBzeW50YXhTZXF1ZW5jZXMgPSBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwU3ludGF4KTtcblxuXG4gICAgICAgIGNvbnN0IHN5bnRheE9iamVjdHMgPSBzeW50YXhTZXF1ZW5jZXNcbiAgICAgICAgLm1hcCgoc2VxdWVuY2UpID0+IHtcbiAgICAgICAgICAgIGlmIChzZXF1ZW5jZS5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IHNlcXVlbmNlWzBdO1xuICAgICAgICAgICAgY29uc3QgZW5kID0gc2VxdWVuY2Vbc2VxdWVuY2UubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gc2VxdWVuY2VcbiAgICAgICAgICAgICAgICAubWFwKChpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0b2tlbiB8fCAhdG9rZW4ubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBNaXNzaW5nIG9yIGludmFsaWQgdG9rZW4gYXQgaW5kZXggJHtpbmRleH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAnJzsgLy8gUHJvdmlkZSBhIGZhbGxiYWNrXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuLm5hbWVcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9EYXNoLywgJy0nKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1BsdXMvLCAnKycpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmpvaW4oJycpO1xuXG4gICAgICAgICAgICByZXR1cm4geyBzdGFydCwgZW5kLCB2YWx1ZSB9O1xuICAgICAgICB9KVxuXG4gICAgICAgIC5maWx0ZXIoKG9iaikgPT4gb2JqICE9PSBudWxsKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5zdGFydCAtIGEuc3RhcnQpO1xuXG4gICAgICAgIHN5bnRheE9iamVjdHMuZm9yRWFjaCgoeyBzdGFydCwgZW5kLCB2YWx1ZSB9KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb21tYW5kID0gc2VhcmNoVGl6a0NvbW1hbmRzKHZhbHVlKTsgXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBCYXNpY1Rpa3pUb2tlbihjb21tYW5kKVxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBlbmQgKyAxIC0gc3RhcnQsIHRva2VuKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwcmVwYXJlRm9yVG9rZW5pemUoKXtcbiAgICAgICAgY29uc3Qgc3F1YXJlQnJhY2tldEluZGV4ZXMgPSBtYXBCcmFja2V0cygnU3F1YXJlX2JyYWNrZXRzX29wZW4nLHRoaXMudG9rZW5zKVxuICAgICAgICBzcXVhcmVCcmFja2V0SW5kZXhlc1xuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5vcGVuIC0gYS5vcGVuKSAvLyBTb3J0IGluIGRlc2NlbmRpbmcgb3JkZXIgb2YgJ29wZW4nXG4gICAgICAgIC5mb3JFYWNoKChpbmRleCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZyA9IG5ldyBGb3JtYXR0aW5nKFxuICAgICAgICAgICAgICAgIGNsZWFuRm9ybWF0dGluZyh0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCBmb3JtYXR0aW5nKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9sZXQgcHJhbmVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2Vucyk7XG4gICAgICAgIGxldCBjb29yZGluYXRlSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgdGhpcy50b2tlbnMpXG4gICAgICAgIC5maWx0ZXIoKGl0ZW0saWR4KT0+dGhpcy50b2tlbnNbaXRlbS5jbG9zZSsxXS52YWx1ZSE9PSdhdCcpXG4gICAgICAgIC8qXG4gICAgICAgIGNvbnN0IHsgY29vcmRpbmF0ZUluZGV4ZXMsIHZhcmlhYmxlSW5kZXhlcyB9ID0gcHJhbmVJbmRleGVzLnJlZHVjZSgocmVzdWx0LCBpdGVtKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbaXRlbS5jbG9zZSArIDFdPy52YWx1ZSAhPT0gJ2F0Jykge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5jb29yZGluYXRlSW5kZXhlcy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgfSBcbiAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tpdGVtLmNsb3NlICsgMV0/LnZhbHVlID09PSAnYXQnKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnZhcmlhYmxlSW5kZXhlcy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSwgeyBjb29yZGluYXRlSW5kZXhlczogW10sIHZhcmlhYmxlSW5kZXhlczogW10gfSk7Ki9cbiAgICAgICAgY29vcmRpbmF0ZUluZGV4ZXNcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIub3BlbiAtIGEub3BlbikgXG4gICAgICAgIC5mb3JFYWNoKChpbmRleCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXhpcyA9IG5ldyBBeGlzKCkucGFyc2VJbnB1dChcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGF4aXMpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgdmFyaWFibGVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2VucylcbiAgICAgICAgLmZpbHRlcigoaXRlbSxpZHgpPT50aGlzLnRva2Vuc1tpdGVtLmNsb3NlICsgMV0udmFsdWU9PT0nYXQnKVxuXG4gICAgICAgIHZhcmlhYmxlSW5kZXhlc1xuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5vcGVuIC0gYS5vcGVuKSBcbiAgICAgICAgLmZvckVhY2goKGluZGV4KSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpbmRleCx0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSkpXG4gICAgICAgICAgICBjb25zdCB2YXJpYWJsZSA9IHRvVmFyaWFibGVUb2tlbih0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHZhcmlhYmxlKVxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIHZhcmlhYmxlKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5cblxuZXhwb3J0IGNsYXNzIEZvcm1hdFRpa3pqYXgge1xuXHRzb3VyY2U6IHN0cmluZztcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcbiAgICB0aWt6Q29tbWFuZHM6IFRpa3pDb21tYW5kcz1uZXcgVGlrekNvbW1hbmRzKCk7XG4gICAgLy9taWRQb2ludDogQXhpcztcbiAgICBwcml2YXRlIHZpZXdBbmNob3JzOiB7bWF4OiBBeGlzLG1pbjpBeGlzLGF2ZU1pZFBvaW50OiBBeGlzfVxuXHRwcm9jZXNzZWRDb2RlPVwiXCI7XG4gICAgZGVidWdJbmZvID0gXCJcIjtcbiAgICBcblx0Y29uc3RydWN0b3Ioc291cmNlOiBzdHJpbmd8QXJyYXk8VG9rZW4+KSB7XG4gICAgICAgIGlmKCFzb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcblx0XHQvL2NvbnN0IGJhc2ljVGlrelRva2Vucz1uZXcgQmFzaWNUaWt6VG9rZW5zKHNvdXJjZSlcbiAgICAgICAgLy9jb25zb2xlLmxvZygnYmFzaWNUaWt6VG9rZW5zJyxiYXNpY1Rpa3pUb2tlbnMpXG4gICAgICAgIC8vdGhpcy50b2tlbml6ZShiYXNpY1Rpa3pUb2tlbnMuZ2V0VG9rZW5zKCkpXG4gICAgICAgIC8vY29uc29sZS5sb2coJ3Rva2VuaXplJyx0aGlzLnRva2VucylcbiAgICAgICAgLy90aGlzLnByb2Nlc3NlZENvZGUgKz0gdGhpcy50b1N0cmluZygpXG5cbiAgICAgICAgLy90aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXG4gICAgICAgIH1cbiAgICAgICAgLy9lbHNlIHt0aGlzLnByb2Nlc3NlZENvZGU9c291cmNlO31cbiAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlPXRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcblx0fVxuXG4gICAgcHJpdmF0ZSB0aWR5VGlrelNvdXJjZShzb3VyY2U6IHN0cmluZykge1xuICAgICAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xuICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XG4gICAgICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XG4gICAgfVxuXG4gICAgdG9rZW5pemUoYmFzaWNUaWt6VG9rZW5zKXtcbiAgICAgICAgbGV0IGVuZEluZGV4XG4gICAgICAgIGZvcihsZXQgaT0wO2k8YmFzaWNUaWt6VG9rZW5zLmxlbmd0aDtpKyspe1xuICAgICAgICAgICAgaWYgKGJhc2ljVGlrelRva2Vuc1tpXS5uYW1lPT09J0RyYXcnKXtcbiAgICAgICAgICAgICAgICBlbmRJbmRleD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSkuZmluZEluZGV4KHQ9PnQubmFtZT09PSdTZW1pY29sb24nKStpXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VnbWVudD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSsxLGVuZEluZGV4KVxuICAgICAgICAgICAgICAgIGk9ZW5kSW5kZXhcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KCdkcmF3JykuZmlsbENvb3JkaW5hdGVzKHNlZ21lbnQpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGJhc2ljVGlrelRva2Vuc1tpXS5uYW1lPT09J0Nvb3JkaW5hdGUnKXtcbiAgICAgICAgICAgICAgICBlbmRJbmRleD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSkuZmluZEluZGV4KHQ9PnQubmFtZT09PSdTZW1pY29sb24nKStpXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VnbWVudD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSsxLGVuZEluZGV4KVxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHNlZ21lbnQpXG4gICAgICAgICAgICAgICAgaT1lbmRJbmRleFxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoJ2Nvb3JkaW5hdGUnKS5pbnRlcnByZXRDb29yZGluYXRlKHNlZ21lbnQpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8qXG4gICAgICAgIFRoZXkncmUgZ29pbmcgdG8gYmUgdGhyZWUgdHlwZXMgc3RyaW5nZWQgc3ludGF4IG51bWJlci5cbiAgICAgICAgIEkgdXNlIHRoZW0gdG8gdG9rZW5pemUuIHVzaW5nIHRoZSB0aWNrcyBjb21tYW5kcy4gT25jZSB0b2tlbml6ZXIgdGFrZXMgY29tbWFuZHMuXG4gICAgICAgICBJIG1vdmUgb24gdG8gYWN0dWFsIGV2YWx1YXRpb24uXG4gICAgICAgICovXG5cbiAgICAgICAgXG4gICAgICAgIGxldCBzdWJkZWZpbmVkVG9rZW5zPVtdO1xuICAgICAgICAvKlxuICAgICAgICBmb3IgKGxldCBpPTA7aTxiYXNpY1Rpa3pUb2tlbnMubGVuZ3RoO2krKyl7XG5cbiAgICAgICAgfSovXG4gICAgfVxuXG4gICAgZ2V0Q29kZSgpe1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuc291cmNlPT09XCJzdHJpbmdcIiYmdGhpcy5zb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2Nlc3NlZENvZGVcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZ2V0UHJlYW1ibGUoKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XG4gICAgfVxuICAgIFxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcbiAgICAgICAgY29uc3QgZmxhdEF4ZXM9ZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICBmbGF0QXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XG4gICAgICAgICAgICBheGlzLmFkZFF1YWRyYW50KHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBmbGF0RHJhdz1mbGF0dGVuKHRoaXMudG9rZW5zLFtdLERyYXcpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBEcmF3KTtcbiAgICAgICAgZmxhdERyYXcuZm9yRWFjaCgoZHJhdzogRHJhdykgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCAgW2luZGV4LCBjb29yXSBvZiBkcmF3LmNvb3JkaW5hdGVzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgICAgIGlmIChjb29yIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBjb29yLmZvcm1hdHRpbmc/LmFkZFNwbG9wQW5kUG9zaXRpb24oZHJhdy5jb29yZGluYXRlcyxpbmRleClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICB9XG5cbiAgICAvKlxuICAgIHRva2VuaXplKCkge1xuICAgICAgICBcblxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzLSwuOnxgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXG4gICAgICAgIGNvbnN0IGMgPSBTdHJpbmcucmF3YFskKF17MCwyfVske2NhfV0rWykkXXswLDJ9fFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXStcXChbJHtjYX1dK1xcKVxcJGA7XG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB3aXRoIGVzY2FwZWQgY2hhcmFjdGVycyBmb3Igc3BlY2lmaWMgbWF0Y2hpbmdcbiAgICAgICAgY29uc3QgY24gPSBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWA7IC8vIENvb3JkaW5hdGUgbmFtZVxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcXFwiP1xcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcIF5dKlxcJFxcXCI/fFtcXHdcXGRcXHNcXC0sLjooISlfXFwtXFwrXFxcXF5dKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXG4gICAgICAgIGNvbnN0IGYgPSBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsuJipcXHtcXH0lXFwtPD5dYDsgLy8gRm9ybWF0dGluZyB3aXRoIHNwZWNpZmljIGNoYXJhY3RlcnNcblxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXG4gICAgICAgIGNvbnN0IGNvb3JSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vclxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgcGljUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHBpY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc2UgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHMqXFwoKigke2NufSlcXCkqXFxzKmF0XFxzKlxcKCgke2N9KVxcKVxccypcXFsoJHtmfSopXFxdXFxzKlxceygke3R9KVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqKFxcW2xhYmVsPVxce1xcWyguKj8pXFxdOlxcXFxcXHcqXFxzKihbXFx3XFxzXSopXFx9XFxdKT9cXHMqXFwoKCR7Y259KylcXClcXHMqYXRcXHMqXFwoKCR7Y30pXFwpO2AsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCB4eWF4aXNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxceHlheGlzeygke3R9KX17KCR7dH0pfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZ3JpZFJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxncmlkeyhbXFxkLS5dKyl9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG1hc3NSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbWFzc1xceygke2N9KVxcfVxceygke3R9KVxcfVxceygtXFx8fFxcfHw+KXswLDF9XFx9XFx7KFtcXGQuXSopXFx9YCxcImdcIik7XG4gICAgICAgIC8vXFxwaWN7YW5jMn17YW5jMX17YW5jMH17NzVeXFxjaXJjIH17fTtcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzZSwgc3MsIG5vZGVSZWdleCwgZHJhd1JlZ2V4LCBjaXJjbGVSZWdleCwgbWFzc1JlZ2V4LCB2ZWNSZWdleCxwaWNSZWdleF07XG4gICAgICAgIGxldCBtYXRjaGVzOiBhbnlbXT1bXTtcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IChhLmluZGV4IHx8IDApIC0gKGIuaW5kZXggfHwgMCkpO1xuXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsyXSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbNF19XG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzVdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFs0XSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbMl19KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJjb29yZGluYXRlXCIsYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwob3JpZ2luYWwsdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJjb29yZGluYXRlXCIsIHVuZGVmaW5lZCxmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcblxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxwaWNcIikpIHtcbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpXG4gICAgICAgICAgICBjb25zdCBjMj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKVxuICAgICAgICAgICAgY29uc3QgYzM9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbM10sdGhpcylcblxuXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHttb2RlOiBcInBpYy1hbmdcIix0b2tlbnM6IHRoaXMsZm9ybWF0dGluZ1N0cmluZzogbWF0Y2hbNV0sZm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6IFwiYW5nXCIsaWNUZXh0OiBtYXRjaFs0XX0sZHJhd0FycjogW2MxLGMyLGMzXX0pKTtcbiAgICAgICAgICB9ZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxkcmF3XCIpKSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHVuZGVmaW5lZCxtYXRjaFsxXSxtYXRjaFsyXSwgdGhpcykpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKHt0eXBlOiBcImdyaWRcIiwgcm90YXRlOiBtYXRjaFsxXX0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFszXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119XG4gICAgICAgICAgICBpZiAobWF0Y2hbMF0ubWF0Y2goL1xcXFxub2RlXFxzKlxcKC8pKXtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB7IGZvcm1hdHRpbmcsb3JpZ2luYWwsIC4uLnJlc3QgfSA9IGk7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIiwgdW5kZWZpbmVkLGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjaXJjbGVcIikpIHsvKlxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiY2lyY2xlXCIsXG4gICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG1hdGNoWzRdLFxuICAgICAgICAgICAgICBjb29yZGluYXRlczogW1xuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMV0sIHRoaXMudG9rZW5zKSxcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzJdLCB0aGlzLnRva2VucyksXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFszXSwgdGhpcy50b2tlbnMpLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSk7KlxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxtYXNzXCIpKSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixsYWJlbDogbWF0Y2hbMl0sYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIse3Rpa3pzZXQ6ICdtYXNzJyxhbmNob3I6IG1hdGNoWzNdLHJvdGF0ZTogbWF0Y2hbNF19KX0pKVxuXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHZlY1wiKSkge1xuICAgICAgICAgICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyk7XG4gICAgICAgICAgICBjb25zdCBheGlzMT1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGU9bmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZS1pbmxpbmVcIixmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZygnbm9kZS1pbmxpbmUnLHtjb2xvcjogXCJyZWRcIn0pfSlcblxuICAgICAgICAgICAgY29uc3QgYzE9bmV3IENvb3JkaW5hdGUoXCJub2RlLWlubGluZVwiKTtcbiAgICAgICAgICAgIGNvbnN0IHE9W2FuY2VyLCctLSsnLG5vZGUsYXhpczFdXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHtmb3JtYXR0aW5nT2JqOiB7dGlrenNldDogJ3ZlYyd9LHRva2VuczogdGhpcyxkcmF3QXJyOiBxfSkpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRJbmRleCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA8IHRoaXMuc291cmNlLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcbiAgICAgICAgfVxuICAgIH0qL1xuICAgIGdldE1pbigpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1pbn1cbiAgICBnZXRNYXgoKXtyZXR1cm4gdGhpcy52aWV3QW5jaG9ycy5tYXh9XG5cbiAgICBmaW5kVmlld0FuY2hvcnMoKSB7XG4gICAgICAgIGNvbnN0IGF4ZXMgPSBmbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSkgPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICBcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XG4gICAgICAgIGxldCBtYXhYID0gLUluZmluaXR5LCBtYXhZID0gLUluZmluaXR5O1xuICAgICAgICBsZXQgbWluWCA9IEluZmluaXR5LCBtaW5ZID0gSW5maW5pdHk7XG4gICAgXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMgPSB7XG4gICAgICAgICAgICBtYXg6IG5ldyBBeGlzKDAsIDApLFxuICAgICAgICAgICAgbWluOiBuZXcgQXhpcygwLCAwKSxcbiAgICAgICAgICAgIGF2ZU1pZFBvaW50OiBuZXcgQXhpcygwLCAwKVxuICAgICAgICB9O1xuICAgIFxuICAgICAgICBheGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgY2FydGVzaWFuWCwgY2FydGVzaWFuWSB9ID0gYXhpcztcbiAgICBcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBzdW1zIGZvciBhdmVyYWdlIGNhbGN1bGF0aW9uXG4gICAgICAgICAgICBzdW1PZlggKz0gY2FydGVzaWFuWDtcbiAgICAgICAgICAgIHN1bU9mWSArPSBjYXJ0ZXNpYW5ZO1xuICAgIFxuICAgICAgICAgICAgLy8gVXBkYXRlIG1heCBhbmQgbWluIGNvb3JkaW5hdGVzXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA+IG1heFgpIG1heFggPSBjYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPiBtYXhZKSBtYXhZID0gY2FydGVzaWFuWTtcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5YIDwgbWluWCkgbWluWCA9IGNhcnRlc2lhblg7XG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA8IG1pblkpIG1pblkgPSBjYXJ0ZXNpYW5ZO1xuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgY29uc3QgbGVuZ3RoID0gYXhlcy5sZW5ndGggIT09IDAgPyBheGVzLmxlbmd0aCA6IDE7XG4gICAgXG4gICAgICAgIC8vIFNldCB0aGUgdmlld0FuY2hvcnNcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCA9IG5ldyBBeGlzKHN1bU9mWCAvIGxlbmd0aCwgc3VtT2ZZIC8gbGVuZ3RoKTtcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5tYXggPSBuZXcgQXhpcyhtYXhYLCBtYXhZKTtcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5taW4gPSBuZXcgQXhpcyhtaW5YLCBtaW5ZKTtcbiAgICB9XG4gICAgXG5cbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IG9nID0gdGhpcy50b2tlbnMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkO1xuICAgIH1cbiAgICBcblxuICAgIHRvU3RyaW5nKCl7XG4gICAgICAgIGxldCBjb2RlQmxvY2tPdXRwdXQgPSBcIlwiO1xuICAgICAgICBjb25zb2xlLmxvZygndGhpcy50b2tlbnMnLHRoaXMudG9rZW5zKVxuICAgICAgICAvL2NvbnN0IGV4dHJlbWVYWT1nZXRFeHRyZW1lWFkodGhpcy50b2tlbnMpO1xuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XG4gICAgICAgICAgICBpZih0b2tlbi50b1N0cmluZygpKXtcbiAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz10b2tlbi50b1N0cmluZygpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IHRva2VuO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjb2RlQmxvY2tPdXRwdXQ7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIGZsYXR0ZW4oZGF0YTogYW55LCByZXN1bHRzOiBhbnlbXSA9IFtdLCBzdG9wQ2xhc3M/OiBhbnkpOiBhbnlbXSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBkYXRhKSB7XG4gICAgICAgIGZsYXR0ZW4oaXRlbSwgcmVzdWx0cywgc3RvcENsYXNzKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiBkYXRhICE9PSBudWxsKSB7XG4gICAgICAvLyBJZiB0aGUgb2JqZWN0IGlzIGFuIGluc3RhbmNlIG9mIHRoZSBzdG9wQ2xhc3MsIGFkZCBpdCB0byByZXN1bHRzIGFuZCBzdG9wIGZsYXR0ZW5pbmdcbiAgICAgIGlmIChzdG9wQ2xhc3MgJiYgZGF0YSBpbnN0YW5jZW9mIHN0b3BDbGFzcykge1xuICAgICAgICByZXN1bHRzLnB1c2goZGF0YSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgfVxuICBcbiAgICAgIC8vIEFkZCB0aGUgY3VycmVudCBvYmplY3QgdG8gcmVzdWx0c1xuICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xuICBcbiAgICAgIC8vIFJlY3Vyc2l2ZWx5IGZsYXR0ZW4gcHJvcGVydGllcyBvZiB0aGUgb2JqZWN0XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBkYXRhKSB7XG4gICAgICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICBmbGF0dGVuKGRhdGFba2V5XSwgcmVzdWx0cywgc3RvcENsYXNzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gZ2V0RXh0cmVtZVhZKHRva2VuczogYW55KSB7XG4gICAgbGV0IG1heFggPSAtSW5maW5pdHk7XG4gICAgbGV0IG1heFkgPSAtSW5maW5pdHk7XG4gICAgbGV0IG1pblggPSBJbmZpbml0eTtcbiAgICBsZXQgbWluWSA9IEluZmluaXR5O1xuICAgIFxuICAgIHRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XG4gICAgICAgIGlmICh0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xuICAgICAgICBpZiAodG9rZW4uWCA+IG1heFgpIG1heFggPSB0b2tlbi5YO1xuICAgICAgICBpZiAodG9rZW4uWCA8IG1pblgpIG1pblggPSB0b2tlbi5YO1xuICAgIFxuICAgICAgICBpZiAodG9rZW4uWSA+IG1heFkpIG1heFkgPSB0b2tlbi5ZO1xuICAgICAgICBpZiAodG9rZW4uWSA8IG1pblkpIG1pblkgPSB0b2tlbi5ZO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbWF4WCxtYXhZLG1pblgsbWluWSxcbiAgICB9O1xufVxuXG5jb25zdCBwYXJzZU51bWJlciA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgbnVtYmVyVmFsdWUgPSBwYXJzZUZsb2F0KHZhbHVlKTtcbiAgICByZXR1cm4gaXNOYU4obnVtYmVyVmFsdWUpID8gMCA6IG51bWJlclZhbHVlO1xufTtcblxuXG5cblxuXG5mdW5jdGlvbiBnZXRQcmVhbWJsZSgpOnN0cmluZ3tcbiAgICBjb25zdCBhbmc9XCJcXFxcdGlrenNldHthbmcvLnN0eWxlIDIgYXJncz17ZmlsbD1ibGFjayE1MCxvcGFjaXR5PTAuNSx0ZXh0IG9wYWNpdHk9MC45LGRyYXc9b3JhbmdlLDwtPixhbmdsZSBlY2NlbnRyaWNpdHk9IzEsYW5nbGUgcmFkaXVzPSMyY20sdGV4dD1vcmFuZ2UsZm9udD1cXFxcbGFyZ2V9LGFuZy8uZGVmYXVsdD17MS42fXswLjV9fVwiXG4gIFxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXG4gIFxuICAgIGNvbnN0IGFycj1cIlxcXFxuZXdjb21tYW5ke1xcXFxhcnJ9Wzhde1xcXFxjb29yZGluYXRlICgyKSBhdCAoJCgjMikhIzchKCMzKSQpO1xcXFxjb29yZGluYXRlICgxKSBhdCAoJCgyKSEjNW1tITkwOigjMykkKTtcXFxcY29vcmRpbmF0ZSAoMykgYXQgKCQoMikhIzVtbSsjNGNtISM4OigjMykkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0xcHQsPC1dICgxKS0tKDMpbm9kZSBbcG9zPSM2XSB7XFxcXGxhcmdlICMxfTt9XCIgXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXG4gICAgY29uc3Qgc3ByaW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXHNwcmluZ31bNF17XFxcXHRpa3ptYXRoe2Nvb3JkaW5hdGUgXFxcXHN0YXJ0LCBcXFxcZG9uZTtcXFxcc3RhcnQgPSAoIzEpO1xcXFxkb25lID0gKCMyKTt9XFxcXGRyYXdbdGhpY2tdICgkKFxcXFxzdGFydCkgKyAoLTEuNSwwKSQpIC0tKysoMywwKTtcXFxcZHJhdyAoXFxcXHN0YXJ0KSAtLSsgKDAsLTAuMjVjbSk7XFxcXGRyYXcgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgrMGNtLFxcXFxkb25leSswLjI1Y20pJCktLSsoMCwtMC4yNSk7XFxcXGRyYXdbZGVjb3JhdGlvbj17YXNwZWN0PTAuMywgc2VnbWVudCBsZW5ndGg9MywgYW1wbGl0dWRlPTJtbSxjb2lsLH0sZGVjb3JhdGVdIChcXFxcc3RhcnR4LFxcXFxzdGFydHktMC4yNWNtKSAtLSgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSswLjI1Y20pJClub2RlW21pZHdheSxyaWdodD0wLjI1Y20sYmxhY2tdeyM0fTtcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KSQpeyMzfTt9XCJcbiAgICBcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcbiAgICBcbiAgICBjb25zdCB0YWJsZT1cIlxcXFx0aWt6c2V0eyB0YWJsZS8uc3R5bGU9e21hdHJpeCBvZiBub2Rlcyxyb3cgc2VwPS1cXFxccGdmbGluZXdpZHRoLGNvbHVtbiBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsbm9kZXM9e3JlY3RhbmdsZSxkcmF3PWJsYWNrLGFsaWduPWNlbnRlcn0sbWluaW11bSBoZWlnaHQ9MS41ZW0sdGV4dCBkZXB0aD0wLjVleCx0ZXh0IGhlaWdodD0yZXgsbm9kZXMgaW4gZW1wdHkgY2VsbHMsZXZlcnkgZXZlbiByb3cvLnN0eWxlPXtub2Rlcz17ZmlsbD1ncmF5ITYwLHRleHQ9YmxhY2ssfX0sY29sdW1uIDEvLnN0eWxlPXtub2Rlcz17dGV4dCB3aWR0aD01ZW0sZm9udD1cXFxcYmZzZXJpZXN9fSxyb3cgMS8uc3R5bGU9e25vZGVzPXtmb250PVxcXFxiZnNlcmllc319fX1cIlxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcbiAgICBjb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxuICAgIGNvbnN0IG1hc3NTZXQ9XCJcXFxcdGlrenNldHsgbWFzcy8uc3R5bGU9e2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFja319XCJcbiAgICBjb25zdCBkdmVjdG9yPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGR2ZWN0b3J9WzJde1xcXFxjb29yZGluYXRlICh0ZW1wMSkgYXQgKCQoMCwwIC18ICMxKSQpO1xcXFxjb29yZGluYXRlICh0ZW1wMikgYXQgKCQoMCwwIHwtICMxKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTAuN3B0LCMyXSAoIzEpLS0odGVtcDEpKCMxKS0tKHRlbXAyKTt9XCJcbiAgICBcbiAgICBjb25zdCBwaWNBbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYW5nfVs1XXtcXFxcY29vcmRpbmF0ZSAoYW5nMSkgYXQgKCMxKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzIpIGF0ICgjMik7IFxcXFxjb29yZGluYXRlIChhbmczKSBhdCAoIzMpOyBcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nM317Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdDQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcxfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQUJcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXGFuZ0NCIC0gXFxcXGFuZ0FCfVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PDBwdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXHBnZm1hdGhyZXN1bHQgKyAzNjB9XFxcXGZpXFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ+MTgwcHRcXFxccGdmbWF0aHBhcnNlezM2MCAtIFxcXFxwZ2ZtYXRocmVzdWx0fVxcXFxmaVxcXFxsZXRcXFxcYW5nQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhzZXRtYWNyb3tcXFxcYW5nbGVDaGVja317YWJzKFxcXFxhbmdCIC0gOTApfVxcXFxpZnRoZW5lbHNle1xcXFxsZW5ndGh0ZXN0e1xcXFxhbmdsZUNoZWNrIHB0IDwgMC4xcHR9fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXtyaWdodCBhbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde2FuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O319XCJcbiAgICBjb25zdCBwcmVhbWJsZT1cIlxcXFx1c2VwYWNrYWdle3BnZnBsb3RzLGlmdGhlbn1cXFxcdXNldGlremxpYnJhcnl7YXJyb3dzLm1ldGEsYW5nbGVzLHF1b3Rlcyxwb3NpdGlvbmluZywgY2FsYywgaW50ZXJzZWN0aW9ucyxkZWNvcmF0aW9ucy5tYXJraW5ncyxtYXRoLHNweSxtYXRyaXgscGF0dGVybnMsc25ha2VzLGRlY29yYXRpb25zLnBhdGhyZXBsYWNpbmcsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcbiAgICByZXR1cm4gcHJlYW1ibGUrYW5nK21hcmsrYXJyK2xlbmUrc3ByaW5nK3RyZWUrdGFibGUrY29vcitkdmVjdG9yK3BpY0FuZyttYXNzU2V0K1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcbn0iXX0=