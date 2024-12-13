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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxjQUFjO0FBQ2QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBR3BILFNBQVMsMkJBQTJCLENBQUMsS0FBSztJQUN0QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUNELFNBQVMsSUFBSSxDQUFDLE1BQU07SUFDaEIsSUFBSSxNQUFNLEdBQUMsRUFBRSxDQUFBO0lBQ2IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUNuQixNQUFNLEVBQUUsR0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUN0RCxJQUFHLEVBQUUsRUFBQztZQUNG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QU0sSUFBSSxHQUFDLGlLQUFpSyxDQUFBO0lBRTVLLE1BQU0sS0FBSyxHQUFDLDZXQUE2VyxDQUFBO0lBQ3pYLE1BQU0sSUFBSSxHQUFDLCtFQUErRSxDQUFBO0lBQzFGLE1BQU0sSUFBSSxHQUFDLG9GQUFvRixDQUFBO0lBQy9GLE1BQU0sT0FBTyxHQUFDLDBEQUEwRCxDQUFBO0lBQ3hFLE1BQU0sT0FBTyxHQUFDLHNLQUFzSyxDQUFBO0lBRXBMLE1BQU0sTUFBTSxHQUFDLDh2QkFBOHZCLENBQUE7SUFDM3dCLE1BQU0sUUFBUSxHQUFDLG1QQUFtUCxDQUFBO0lBQ2xRLE9BQU8sUUFBUSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxNQUFNLEdBQUMsSUFBSSxHQUFDLEtBQUssR0FBQyxJQUFJLEdBQUMsT0FBTyxHQUFDLE1BQU0sR0FBQyxPQUFPLEdBQUMsaUVBQWlFLENBQUE7QUFDckosQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEB0cy1ub2NoZWNrXHJcbmltcG9ydCB7IGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyB9IGZyb20gXCJzcmMvbWF0aEVuZ2luZVwiO1xyXG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCByZWdFeHAsIFRva2VuLCB0b1BvaW50IH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgZ2V0QWxsVGlrelJlZmVyZW5jZXMsIHNlYXJjaFRpemtDb21tYW5kcywgc2VhcmNoVGl6a0Zvck9nTGF0ZXggfSBmcm9tIFwic3JjL3Rpa3pqYXgvdGlrekNvbW1hbmRzXCI7XHJcbmltcG9ydCB7IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgsIGZpbmRQYXJlbkluZGV4LCBpZFBhcmVudGhlc2VzLCBtYXBCcmFja2V0cywgUGFyZW4gfSBmcm9tIFwic3JjL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcclxuaW1wb3J0IHsgdGV4dCB9IGZyb20gXCJzdHJlYW0vY29uc3VtZXJzXCI7XHJcblxyXG5mdW5jdGlvbiBsYWJlbEZyZWVGb3JtVGV4dFNlcGFyYXRpb24obGFiZWwpe1xyXG4gICAgY29uc3QgY29sb25JbmRleD1sYWJlbC5maW5kSW5kZXgodD0+dC5uYW1lPT09J0NvbG9uJylcclxuICAgICBsYWJlbD1sYWJlbC5zcGxpY2UoY29sb25JbmRleCxsYWJlbC5sZW5ndGgtY29sb25JbmRleClcclxuICAgIHJldHVybiBsYWJlbC5zcGxpY2UoMSlcclxufVxyXG5mdW5jdGlvbiB0b09nKHRva2Vucyl7XHJcbiAgICBsZXQgc3RyaW5nPScnXHJcbiAgICB0b2tlbnMuZm9yRWFjaCh0b2tlbiA9PiB7XHJcbiAgICAgICAgY29uc3Qgb2c9c2VhcmNoVGl6a0Zvck9nTGF0ZXgodG9rZW4ubmFtZXx8dG9rZW4udmFsdWUpXHJcbiAgICAgICAgaWYob2cpe1xyXG4gICAgICAgICAgICBpZihvZy5sYXRleClcclxuICAgICAgICAgICAgICAgIHN0cmluZys9b2cubGF0ZXhcclxuICAgICAgICAgICAgZWxzZSBpZihvZy5yZWZlcmVuY2VzPy5sZW5ndGg9PT0xKVxyXG4gICAgICAgICAgICAgICAgc3RyaW5nKz1vZy5yZWZlcmVuY2VzWzBdXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgICAgc3RyaW5nKz10b2tlbi52YWx1ZVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gc3RyaW5nXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsZWFuRm9ybWF0dGluZyhmb3JtYXR0aW5nOiBhbnlbXSxzdWJUeXBlPzogc3RyaW5nKTogYW55W11bXSB7XHJcbiAgICBjb25zdCB2YWx1ZXM6IGFueVtdW10gPSBbXTtcclxuICAgIGxldCBjdXJyZW50R3JvdXA6IGFueVtdID0gW107XHJcbiAgICBjb25zdCBmb3JtYXR0aW5nS2V5cz1bXVxyXG5cclxuICAgIGlmKHN1YlR5cGU9PT0nTGFiZWwnKXtcclxuICAgICAgICBjb25zdCBsYWJlbD1sYWJlbEZyZWVGb3JtVGV4dFNlcGFyYXRpb24oZm9ybWF0dGluZylcclxuICAgICAgICBmb3JtYXR0aW5nS2V5cy5wdXNoKHtrZXk6ICdmcmVlRm9ybVRleHQnLHZhbHVlOiB0b09nKGxhYmVsKX0pXHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICBjb25zdCBicmFja2V0TWFwPW1hcEJyYWNrZXRzKCdDdXJseV9icmFja2V0c19vcGVuJyxmb3JtYXR0aW5nKTtcclxuICAgIGJyYWNrZXRNYXAucmV2ZXJzZSgpXHJcbiAgICBicmFja2V0TWFwLmZvckVhY2goYnJhY2tldCA9PiB7XHJcbiAgICAgICAgaWYoZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMV0ubmFtZT09PSdFcXVhbHMnKXtcclxuICAgICAgICAgICAgbGV0IHN1YkZvcm1hdHRpbmc9Zm9ybWF0dGluZy5zcGxpY2UoYnJhY2tldC5vcGVuLTEsYnJhY2tldC5jbG9zZS0oYnJhY2tldC5vcGVuLTIpKVxyXG4gICAgICAgICAgICBzdWJGb3JtYXR0aW5nPXN1YkZvcm1hdHRpbmcuc2xpY2UoMiwtMSlcclxuICAgICAgICAgICAgZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMl0udmFsdWU9Y2xlYW5Gb3JtYXR0aW5nKHN1YkZvcm1hdHRpbmcsZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMl0ubmFtZSlcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZm9ybWF0dGluZykge1xyXG4gICAgICAgIGlmIChpdGVtLm5hbWUgPT09ICdDb21tYScpIHtcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50R3JvdXApO1xyXG4gICAgICAgICAgICAgICAgY3VycmVudEdyb3VwID0gW107XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjdXJyZW50R3JvdXAucHVzaChpdGVtKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA+IDApIHtcclxuICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50R3JvdXApO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG4gICAgdmFsdWVzLmZvckVhY2goKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaChhc3NpZ25Gb3JtYXR0aW5nKHZhbHVlKSk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiBmb3JtYXR0aW5nS2V5cyBcclxufVxyXG5cclxuZnVuY3Rpb24gYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nKXtcclxuXHJcbiAgICBjb25zdCBpc0VxdWFscz1mb3JtYXR0aW5nLm1hcCgoZixpZHgpPT5mLm5hbWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKHQ9PnQhPT1udWxsKTtcclxuICAgIGNvbnN0IGtleT1mb3JtYXR0aW5nWzBdPy5uYW1lXHJcblxyXG4gICAgaWYoaXNFcXVhbHMubGVuZ3RoPT09MSlcclxuICAgICAgICBmb3JtYXR0aW5nPWZvcm1hdHRpbmcuc2xpY2UoKGlzRXF1YWxzWzBdKzEpKVxyXG5cclxuICAgIGxldCB2YWx1ZT1pbnRlcnByZXRGb3JtYXR0aW5nVmFsdWUoZm9ybWF0dGluZyk7XHJcbiAgICByZXR1cm4ge2tleSx2YWx1ZX1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGludGVycHJldEZvcm1hdHRpbmdWYWx1ZShmb3JtYXR0aW5nKXtcclxuICAgIGlmIChmb3JtYXR0aW5nLmxlbmd0aD09PTEpe1xyXG4gICAgICAgIHJldHVybiBmb3JtYXR0aW5nWzBdLnZhbHVlfHx0cnVlXHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm9ybWF0dGluZ1xyXG59XHJcblxyXG5jbGFzcyBUaWt6Q29tbWFuZHtcclxuICAgIHRyaWdnZXI6IHN0cmluZztcclxuICAgIGhvb2tOdW06IG51bWJlcjtcclxuICAgIGhvb2tzOiBhbnk7XHJcbiAgICBjb250ZW50OiBCYXNpY1Rpa3pUb2tlbltdXHJcbiAgICBhZGRDb21tYW5kKHRyaWdnZXIsIGhvb2tOdW0sIGNvbnRlbnQpe1xyXG4gICAgICAgIHRoaXMudHJpZ2dlcj10cmlnZ2VyO1xyXG4gICAgICAgIHRoaXMuaG9va051bT1ob29rTnVtO1xyXG4gICAgICAgIHRoaXMuY29udGVudD1jb250ZW50O1xyXG4gICAgICAgIHRoaXMuZmluZEhvb2tzKClcclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgfVxyXG4gICAgZmluZEhvb2tzKCl7XHJcbiAgICAgICAgY29uc3QgaGFzaHRhZ01hcD10aGlzLmNvbnRlbnQubWFwKChpdGVtLGluZGV4KT0+aXRlbS5uYW1lPT09J0hhc2h0YWcnJiZ0aGlzLmNvbnRlbnRbaW5kZXgrMV0udHlwZT09PSdudW1iZXInP2luZGV4Om51bGwpXHJcbiAgICAgICAgLmZpbHRlcih0PT50IT09bnVsbClcclxuICAgICAgICBpZihoYXNodGFnTWFwLmxlbmd0aCE9PXRoaXMuaG9va051bSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRGlzY3JlcGFuY3kgYmV0d2VlbiB0aGUgbnVtYmVyIG9mIGhvb2tzIGRlY2xhcmVkIGFuZCB0aGUgbnVtYmVyIG9mIGhvb2tzIGZvdW5kIGluIHRoZSBjb21tYW5kIGhvb2tOdW06ICR7dGhpcy5ob29rTnVtfSBoYXNodGFnTWFwLmxlbmd0aDogJHtoYXNodGFnTWFwLmxlbmd0aH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaGFzaHRhZ01hcC5zb3J0KChhLGIpPT5iLWEpXHJcbiAgICAgICAgaGFzaHRhZ01hcC5mb3JFYWNoKGlkeCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhhc2h0YWc9dGhpcy5jb250ZW50W2lkeF07XHJcbiAgICAgICAgICAgIGhhc2h0YWcudHlwZT0nU3ludGF4J1xyXG4gICAgICAgICAgICBoYXNodGFnLm5hbWU9J2hvb2snXHJcbiAgICAgICAgICAgIGhhc2h0YWcudmFsdWU9dGhpcy5jb250ZW50W2lkeCsxXT8udmFsdWU7XHJcbiAgICAgICAgICAgIHRoaXMuY29udGVudC5zcGxpY2UoaWR4KzEsMSlcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIGdldEluZm8oKXtcclxuICAgICAgICByZXR1cm4ge3RyaWdnZXI6IHRoaXMudHJpZ2dlcixob29rczogdGhpcy5ob29rTnVtfVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuY2xhc3MgVGlrekNvbW1hbmRze1xyXG4gICAgY29tbWFuZHM6IFRpa3pDb21tYW5kW109W107XHJcbiAgICBjb25zdHJ1Y3RvcigpO1xyXG4gICAgYWRkQ29tbWFuZCh0b2tlbnMpe1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgYWRkQ29tbWFuZEJ5SW50ZXJwcmV0YXRpb24odG9rZW5zKSB7XHJcbiAgICAgICAgY29uc3QgaWQxVG9rZW4gPSB0b2tlbnMuZmluZCgoaXRlbSkgPT4gaXRlbS5uYW1lID09PSAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xyXG4gICAgICAgIGlmICghaWQxVG9rZW4pIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOiAnQ3VybHlfYnJhY2tldHNfb3Blbicgbm90IGZvdW5kIGluIHRva2Vucy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IGlkMSA9IGlkMVRva2VuLnZhbHVlO1xyXG4gICAgICAgIGNvbnN0IGlkMiA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoaWQxLCB1bmRlZmluZWQsIHRva2VucywgMCwgMSk7XHJcbiAgICAgICAgY29uc3QgaWQzID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChpZDEsIHVuZGVmaW5lZCwgdG9rZW5zLCAwLCAxLCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKCFpZDIgfHwgIWlkMykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6IFVuYWJsZSB0byBmaW5kIG1hdGNoaW5nIGJyYWNrZXRzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZDE9ZmluZFBhcmVuSW5kZXgoaWQxLCB1bmRlZmluZWQsIHRva2VucylcclxuICAgICAgICBsZXQgdHJpZ2dlciwgaG9va3MsIGNvbnRlbnQ7XHJcbiAgICAgICAgY29udGVudCA9IHRva2Vucy5zcGxpY2UoaWQzLm9wZW4gKyAxLCBpZDMuY2xvc2UgLSBpZDMub3BlbiAtIDEpO1xyXG4gICAgICAgIGhvb2tzID0gdG9rZW5zLnNwbGljZShpZDIub3BlbiArIDEsIGlkMi5jbG9zZSAtIGlkMi5vcGVuIC0gMSk7XHJcbiAgICAgICAgdHJpZ2dlciA9IHRva2Vucy5zcGxpY2UoaWQxLm9wZW4rMSwgaWQxLmNsb3NlIC0gaWQxLm9wZW4gLSAxKTtcclxuXHJcbiAgICAgICAgaWYgKGhvb2tzLmxlbmd0aCA9PT0gMSAmJiBob29rc1swXT8udHlwZSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgaG9va3MgPSBob29rc1swXS52YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGhvb2tzOiBFeHBlY3RlZCBhIHNpbmdsZSBudW1lcmljIHZhbHVlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRyaWdnZXIubGVuZ3RoID09PSAxICYmIHRyaWdnZXJbMF0/LnR5cGUgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIHRyaWdnZXIgPSB0cmlnZ2VyWzBdLnZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgdHJpZ2dlcjogRXhwZWN0ZWQgYSBzaW5nbGUgc3RyaW5nIHZhbHVlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jb21tYW5kcy5wdXNoKG5ldyBUaWt6Q29tbWFuZCgpLmFkZENvbW1hbmQodHJpZ2dlciwgaG9va3MsIGNvbnRlbnQpKVxyXG4gICAgfVxyXG5cclxuICAgIHJlcGxhY2VDYWxsV2l0aENvbW1hbmQodHJpZ2dlcjogc3RyaW5nLGhvb2tOdW1iZXI6IG51bWJlcixob29rczogYW55W10pe1xyXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLmNvbW1hbmRzLmZpbmQoY29tbWFuZCA9PiBcclxuICAgICAgICAgICAgY29tbWFuZC50cmlnZ2VyID09PSB0cmlnZ2VyICYmIGhvb2tOdW1iZXIgPT09IGNvbW1hbmQuaG9va051bVxyXG4gICAgICAgICk/LmNvbnRlbnQ7XHJcblxyXG4gICAgICAgIGNvbnN0IG1hcCA9IGNvbnRlbnQ/Lm1hcCgoaXRlbSwgaW5kZXgpID0+IFxyXG4gICAgICAgICAgICBpdGVtLm5hbWUgPT09ICdob29rJyA/IHsgaW5kZXgsIHZhbHVlOiBpdGVtLnZhbHVlIH0gOiBudWxsXHJcbiAgICAgICAgKS5maWx0ZXIodCA9PiB0ICE9PSBudWxsKTtcclxuICAgICAgICBtYXA/LnJldmVyc2UoKTtcclxuXHJcbiAgICAgICAgY29uc3QgdW5pcXVlVmFsdWVzID0gbmV3IFNldCgpO1xyXG4gICAgICAgIGZvciAoY29uc3QgeyBpbmRleCwgdmFsdWUgfSBvZiBtYXAgfHwgW10pIHtcclxuICAgICAgICAgICAgaWYgKCF1bmlxdWVWYWx1ZXMuaGFzKHZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgdW5pcXVlVmFsdWVzLmFkZCh2YWx1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29udGVudC5zcGxpY2UoaW5kZXgsIDEsIC4uLmhvb2tzW3ZhbHVlLTFdKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvbnRlbnRcclxuICAgIH1cclxuXHJcbiAgICBnZXRIb29rcyh0b2tlbnMsaWRzKXtcclxuICAgICAgICB0b2tlbnMuc3BsaWNlKDAsMSlcclxuICAgICAgICBjb25zdCBhZGp1c3RtZW50VmFsdWU9aWRzWzBdLm9wZW5cclxuICAgICAgICBpZHMuZm9yRWFjaChpZCA9PiB7XHJcbiAgICAgICAgICAgIGlkLm9wZW4tPWFkanVzdG1lbnRWYWx1ZTtcclxuICAgICAgICAgICAgaWQuY2xvc2UtPWFkanVzdG1lbnRWYWx1ZTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBpZHMucmV2ZXJzZSgpO1xyXG4gICAgICAgIGNvbnN0IGhvb2tzPVtdXHJcbiAgICAgICAgaWRzLmZvckVhY2goaWQgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCByZW1vdmVkPXRva2Vucy5zcGxpY2UoaWQub3BlbisxLGlkLmNsb3NlLShpZC5vcGVuKzEpKVxyXG4gICAgICAgICAgICBob29rcy5wdXNoKHJlbW92ZWQpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaG9va3MucmV2ZXJzZSgpO1xyXG4gICAgICAgIHJldHVybiBob29rc1xyXG4gICAgfVxyXG4gICAgXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCYXNpY1Rpa3pUb2tlbntcclxuICAgIHR5cGU6IHN0cmluZztcclxuICAgIG5hbWU6IHN0cmluZ1xyXG4gICAgdmFsdWU6IHN0cmluZ3xudW1iZXJ8UGFyZW58YW55XHJcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZTogbnVtYmVyfHN0cmluZ3xvYmplY3Qpe1xyXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWU9PT0nbnVtYmVyJyl7XHJcbiAgICAgICAgICAgIHRoaXMudHlwZT0nbnVtYmVyJ1xyXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgICAgICAgICByZXR1cm4gXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKHR5cGVvZiB2YWx1ZT09PSdzdHJpbmcnKXtcclxuICAgICAgICAgICAgdGhpcy50eXBlPSdzdHJpbmcnXHJcbiAgICAgICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XHJcbiAgICAgICAgICAgIHJldHVyblxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnR5cGU9dmFsdWUudHlwZS5yZXBsYWNlKC9CcmFja2V0LywnU3ludGF4JylcclxuICAgICAgICB0aGlzLm5hbWU9dmFsdWUubmFtZVxyXG4gICAgICAgIHRoaXMudmFsdWU9dmFsdWUudmFsdWVcclxuICAgICAgICBcclxuICAgIH1cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgcmV0dXJuIHNlYXJjaFRpemtGb3JPZ0xhdGV4KHRoaXMubmFtZSkubGF0ZXhcclxuICAgIH1cclxufVxyXG5leHBvcnQgY2xhc3MgVGlrelZhcmlhYmxle1xyXG4gICAgLy90eXBlOiBcclxuXHJcbn1cclxuZXhwb3J0IGNsYXNzIFRpa3pWYXJpYWJsZXN7XHJcbiAgICB2YXJpYWJsZXM6IFtdPVtdXHJcblxyXG59XHJcblxyXG5mdW5jdGlvbiB0b1ZhcmlhYmxlVG9rZW4oYXJyOiBhbnlbXSkge1xyXG4gICAgYXJyPWFyci5maWx0ZXIodD0+KCF0LnR5cGUuaW5jbHVkZXMoJ1BhcmVudGhlc2VzJykpKVxyXG4gICAgYXJyPXRvT2coYXJyKVxyXG4gICAgdG9rZW49bmV3IEJhc2ljVGlrelRva2VuKGFycilcclxuICAgIHRva2VuLnR5cGU9J3ZhcmlhYmxlJ1xyXG4gICAgcmV0dXJuIHRva2VuXHJcbn1cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIEJhc2ljVGlrelRva2Vuc3tcclxuICAgIHByaXZhdGUgdG9rZW5zOiBBcnJheTxCYXNpY1Rpa3pUb2tlbnxGb3JtYXR0aW5nPiA9IFtdXHJcbiAgICBwcml2YXRlIHRpa3pDb21tYW5kczogVGlrekNvbW1hbmRzPW5ldyBUaWt6Q29tbWFuZHMoKTtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZyl7XHJcbiAgICAgICAgc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xyXG4gICAgICAgIHNvdXJjZT10aGlzLmJhc2ljQXJyYXlpZnkoc291cmNlKVxyXG4gICAgICAgIHRoaXMuYmFzaWNUaWt6VG9rZW5pZnkoc291cmNlKVxyXG4gICAgICAgIHRoaXMuY2xlYW5CYXNpY1Rpa3pUb2tlbmlmeSgpXHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5wcmVwYXJlRm9yVG9rZW5pemUoKVxyXG4gICAgfVxyXG4gICAgZ2V0VG9rZW5zKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zXHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB0aWR5VGlrelNvdXJjZShzb3VyY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XHJcbiAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSBzb3VyY2Uuc3BsaXQoXCJcXG5cIik7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcclxuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJykucmVwbGFjZSgvKD88PVteXFx3XSkgfCAoPz1bXlxcd10pL2csIFwiXCIpLnJlcGxhY2UoLyg/PCFcXFxcKSUuKiQvZ20sIFwiXCIpLnJlcGxhY2UoL1xcbi9nLFwiXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYmFzaWNBcnJheWlmeShzb3VyY2Upe1xyXG4gICAgICAgIGNvbnN0IGJhc2ljQXJyYXkgPSBbXTtcclxuICAgICAgICBjb25zdCBvcGVyYXRvcnNSZWdleCA9IG5ldyBSZWdFeHAoJ14nICsgYXJyVG9SZWdleFN0cmluZyhnZXRBbGxUaWt6UmVmZXJlbmNlcygpKSk7XHJcbiAgICAgICAgbGV0IGkgPSAwO1xyXG4gICAgICAgICBcclxuICAgICAgICB3aGlsZSAoaSA8IHNvdXJjZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc3Qgc3ViU291cmNlID0gc291cmNlLnNsaWNlKGkpO1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2g7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIE1hdGNoIFRpa1ogb3BlcmF0b3JzXHJcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKG9wZXJhdG9yc1JlZ2V4KTtcclxuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaCh7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogbWF0Y2hbMF0gfSk7XHJcbiAgICAgICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIE1hdGNoIG51bWJlcnNcclxuICAgICAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2goL15bLTAtOS5dKy8pO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ251bWJlcicsIHZhbHVlOiBwYXJzZU51bWJlcihtYXRjaFswXSkgfSk7XHJcbiAgICAgICAgICAgICAgICBpICs9IG1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eW2EtekEtWlxcXFxdKy8pO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiBtYXRjaFswXSB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEluY3JlbWVudCBpbmRleCBpZiBubyBtYXRjaCBmb3VuZFxyXG4gICAgICAgICAgICBpKys7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBiYXNpY0FycmF5XHJcbiAgICB9XHJcbiAgICBwcml2YXRlIGJhc2ljVGlrelRva2VuaWZ5KGJhc2ljQXJyYXkpe1xyXG4gICAgICAgICAvLyBQcm9jZXNzIHRva2Vuc1xyXG4gICAgICAgIGJhc2ljQXJyYXkuZm9yRWFjaCgoeyB0eXBlLCB2YWx1ZSB9KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGlrekNvbW1hbmQgPSBzZWFyY2hUaXprQ29tbWFuZHModmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRpa3pDb21tYW5kKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odGlrekNvbW1hbmQpKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IEJhc2ljVGlrelRva2VuKHZhbHVlKSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odmFsdWUpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlkUGFyZW50aGVzZXModGhpcy50b2tlbnMpXHJcbiAgICB9XHJcbiAgICBwcml2YXRlIGluZmVyQW5kSW50ZXJwcmV0Q29tbWFuZHMoKXtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBjb21tYW5kc01hcD10aGlzLnRva2Vucy5tYXAoKHQsaWR4KT0+dC50eXBlPT09J0NvbW1hbmQnP2lkeDpudWxsKVxyXG4gICAgICAgIC5maWx0ZXIodD0+dCE9PW51bGwpO1xyXG4gICAgICAgIGNvbW1hbmRzTWFwLmZvckVhY2goaW5kZXggPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBmaXJzdEJyYWNrZXRBZnRlckluZGV4PXRoaXMudG9rZW5zLnNsaWNlKGluZGV4KS5maW5kKChpdGVtLGlkeCk9Pml0ZW0ubmFtZT09PSdDdXJseV9icmFja2V0c19vcGVuJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZE9mRXhwcmVzc2lvbj1maW5kTW9kaWZpZWRQYXJlbkluZGV4KGZpcnN0QnJhY2tldEFmdGVySW5kZXgudmFsdWUsdW5kZWZpbmVkLHRoaXMudG9rZW5zLDAsMSwnQ3VybHlfYnJhY2tldHNfb3BlbicpXHJcbiAgICAgICAgICAgIGNvbnN0IGNvbW1hbmQ9dGhpcy50b2tlbnMuc3BsaWNlKGluZGV4LE1hdGguYWJzKGluZGV4LShlbmRPZkV4cHJlc3Npb24uY2xvc2UrMSkpKVxyXG4gICAgICAgICAgICB0aGlzLnRpa3pDb21tYW5kcy5hZGRDb21tYW5kQnlJbnRlcnByZXRhdGlvbihjb21tYW5kKVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBjb21tYW5kcz10aGlzLnRpa3pDb21tYW5kcy5jb21tYW5kcy5tYXAoYz0+Yy5nZXRJbmZvKCkpO1xyXG4gICAgICAgIGNvbnN0IGNvbW1hbmRzSW5Ub2tlbnM9dGhpcy50b2tlbnMubWFwKChpdGVtLGluZGV4KT0+e1xyXG4gICAgICAgICAgICBpZihpdGVtLnR5cGUhPT0nc3RyaW5nJyl7cmV0dXJuIG51bGx9XHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoPWNvbW1hbmRzLmZpbmQoYz0+Yy50cmlnZ2VyPT09aXRlbS52YWx1ZSlcclxuICAgICAgICAgICAgaWYobWF0Y2gpe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtpbmRleDogaW5kZXgsLi4ubWF0Y2h9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIG51bGxcclxuICAgICAgICB9KS5maWx0ZXIodD0+dCE9PW51bGwpO1xyXG5cclxuICAgICAgICBjb25zdCBmb3VuQW5kQ29uZmlybWVkQ29tbWFuZHMgPSBbXTtcclxuICAgICAgICBmb3IgKGNvbnN0IFtpbmRleCwgeyB0cmlnZ2VyLCBob29rcyB9XSBvZiBPYmplY3QuZW50cmllcyhjb21tYW5kc0luVG9rZW5zKSkge1xyXG4gICAgICAgICAgICBjb25zdCBudW1lcmljSW5kZXggPSBOdW1iZXIoaW5kZXgpOyAvLyBFbnN1cmUgaW5kZXggaXMgYSBudW1iZXJcclxuICAgICAgICAgICAgY29uc3QgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgICAgICAgICAuc2xpY2UobnVtZXJpY0luZGV4KVxyXG4gICAgICAgICAgICAgICAgLmZpbmQoKGl0ZW0pID0+IGl0ZW0ubmFtZSA9PT0gJ0N1cmx5X2JyYWNrZXRzX29wZW4nKT8udmFsdWU7XHJcblxyXG4gICAgICAgICAgICBpZiAoIWZpcnN0QnJhY2tldEFmdGVySW5kZXgpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkN1cmx5X2JyYWNrZXRzX29wZW4gbm90IGZvdW5kIGFmdGVyIGluZGV4IFwiICsgaW5kZXgpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGhvb2tzICE9PSAnbnVtYmVyJyB8fCBob29rcyA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgaG9va3MgdmFsdWUgYXQgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3Qgb2JqID0geyBpbmRleCwgdHJpZ2dlciwgaG9va3MsIGlkczogW10gfTtcclxuXHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG9va3M7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW5QYWlySW5kZXggPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KFxyXG4gICAgICAgICAgICAgICAgICAgIGZpcnN0QnJhY2tldEFmdGVySW5kZXgsXHJcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLFxyXG4gICAgICAgICAgICAgICAgICAgIDAsXHJcbiAgICAgICAgICAgICAgICAgICAgaSxcclxuICAgICAgICAgICAgICAgICAgICAnQ3VybHlfYnJhY2tldHNfb3BlbidcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXBhcmVuUGFpckluZGV4KSBcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBhcmVuIHBhaXIgbm90IGZvdW5kIGZvciBob29rICR7aX0gYXQgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgICAgIGlmIChvYmouaWRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0SWQgPSBvYmouaWRzW29iai5pZHMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxhc3RJZC5jbG9zZSAhPT0gcGFyZW5QYWlySW5kZXgub3BlbiAtIDEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNaXNtYXRjaCBiZXR3ZWVuIGxhc3QgY2xvc2UgKCR7bGFzdElkLmNsb3NlfSkgYW5kIG5leHQgb3BlbiAoJHtwYXJlblBhaXJJbmRleC5vcGVufSlgKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBvYmouaWRzLnB1c2gocGFyZW5QYWlySW5kZXgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZvdW5BbmRDb25maXJtZWRDb21tYW5kcy5wdXNoKG9iaik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3VuQW5kQ29uZmlybWVkQ29tbWFuZHMuZm9yRWFjaChjb21tYW5kID0+IHtcclxuICAgICAgICAgICAgaWYgKCFjb21tYW5kLmlkcyB8fCBjb21tYW5kLmlkcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjogQ29tbWFuZCBJRHMgYXJlIGVtcHR5IG9yIHVuZGVmaW5lZC5cIik7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3Qgb3BhbiA9IGNvbW1hbmQuaW5kZXg7IFxyXG4gICAgICAgICAgICBjb25zdCBjbG9zZSA9IGNvbW1hbmQuaWRzW2NvbW1hbmQuaWRzLmxlbmd0aCAtIDFdLmNsb3NlO1xyXG4gICAgICAgICAgICBpZiAoY2xvc2UgPCBvcGFuKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6IENsb3NlIGluZGV4IGlzIHNtYWxsZXIgdGhhbiBvcGVuIGluZGV4LlwiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCBkZWxldGVDb3VudCA9IGNsb3NlIC0gb3BhbiArIDE7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWRUb2tlbnMgPSB0aGlzLnRva2Vucy5zbGljZShvcGFuLCBjbG9zZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gdGhpcy50aWt6Q29tbWFuZHMucmVwbGFjZUNhbGxXaXRoQ29tbWFuZChcclxuICAgICAgICAgICAgICAgIGNvbW1hbmQudHJpZ2dlcixcclxuICAgICAgICAgICAgICAgIGNvbW1hbmQuaG9va3MsXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRpa3pDb21tYW5kcy5nZXRIb29rcyhyZW1vdmVkVG9rZW5zLGNvbW1hbmQuaWRzKSxcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKG9wYW4sIGRlbGV0ZUNvdW50LCAuLi5yZXBsYWNlbWVudCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBwcml2YXRlIGNsZWFuQmFzaWNUaWt6VG9rZW5pZnkoKXtcclxuXHJcbiAgICAgICAgdGhpcy5pbmZlckFuZEludGVycHJldENvbW1hbmRzKClcclxuXHJcblxyXG4gICAgICAgIGNvbnN0IHVuaXRJbmRpY2VzOiBudW1iZXJbXSA9IHRoaXMudG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuLnR5cGUgPT09ICdVbml0JyA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICAgICAgdW5pdEluZGljZXMuZm9yRWFjaCgodW5pdElkeCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSB0aGlzLnRva2Vuc1t1bml0SWR4IC0gMV07XHJcblxyXG4gICAgICAgICAgICBpZiAoIXByZXZUb2tlbiB8fCBwcmV2VG9rZW4udHlwZSAhPT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5pdHMgY2FuIG9ubHkgYmUgdXNlZCBpbiByZWZlcmVuY2UgdG8gbnVtYmVycyBhdCBpbmRleCAke3VuaXRJZHh9YCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHByZXZUb2tlbi52YWx1ZSA9IHRvUG9pbnQocHJldlRva2VuLnZhbHVlIGFzIG51bWJlciwgdGhpcy50b2tlbnNbdW5pdElkeF0ubmFtZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAoIXVuaXRJbmRpY2VzLmluY2x1ZGVzKGlkeCkpKTtcclxuXHJcbiAgICAgICAgLy90aGlzLnRva2Vucz10aGlzLnRva2Vucy5maWx0ZXIoKHQpID0+IHQubmFtZSE9PSdDb21tYScpO1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgY29uc3QgaW5kZXhlc1RvUmVtb3ZlOiBudW1iZXJbXT1bXVxyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuLGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKHRva2VuLnR5cGU9PT0nRm9ybWF0dGluZycpe1xyXG4gICAgICAgICAgICAgICAgaWYodGhpcy50b2tlbnNbaW5kZXgrMV0ubmFtZT09PSdFcXVhbHMnKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zW2luZGV4XS52YWx1ZT10aGlzLnRva2Vuc1tpbmRleCsyXVxyXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ZXNUb1JlbW92ZS5wdXNoKGluZGV4KzEsaW5kZXgrMik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnRva2Vucz10aGlzLnRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCFpbmRleGVzVG9SZW1vdmUuaW5jbHVkZXMoaWR4KSkpOyovXHJcblxyXG5cclxuXHJcbiAgICAgICAgY29uc3QgbWFwU3ludGF4ID0gdGhpcy50b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbiwgaWR4KSA9PiAodG9rZW4udHlwZSA9PT0gJ1N5bnRheCcgJiYgLyhEYXNofFBsdXMpLy50ZXN0KHRva2VuLm5hbWUpID8gaWR4IDogbnVsbCkpXHJcbiAgICAgICAgLmZpbHRlcigoaWR4KTogaWR4IGlzIG51bWJlciA9PiBpZHggIT09IG51bGwpO1xyXG5cclxuICAgICAgICBjb25zdCBzeW50YXhTZXF1ZW5jZXMgPSBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwU3ludGF4KTtcclxuXHJcblxyXG4gICAgICAgIGNvbnN0IHN5bnRheE9iamVjdHMgPSBzeW50YXhTZXF1ZW5jZXNcclxuICAgICAgICAubWFwKChzZXF1ZW5jZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoc2VxdWVuY2UubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gc2VxdWVuY2VbMF07XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZCA9IHNlcXVlbmNlW3NlcXVlbmNlLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBzZXF1ZW5jZVxyXG4gICAgICAgICAgICAgICAgLm1hcCgoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMudG9rZW5zW2luZGV4XTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRva2VuIHx8ICF0b2tlbi5uYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgTWlzc2luZyBvciBpbnZhbGlkIHRva2VuIGF0IGluZGV4ICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAnJzsgLy8gUHJvdmlkZSBhIGZhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbi5uYW1lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9EYXNoLywgJy0nKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvUGx1cy8sICcrJyk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmpvaW4oJycpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhcnQsIGVuZCwgdmFsdWUgfTtcclxuICAgICAgICB9KVxyXG5cclxuICAgICAgICAuZmlsdGVyKChvYmopID0+IG9iaiAhPT0gbnVsbClcclxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5zdGFydCAtIGEuc3RhcnQpO1xyXG5cclxuICAgICAgICBzeW50YXhPYmplY3RzLmZvckVhY2goKHsgc3RhcnQsIGVuZCwgdmFsdWUgfSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb21tYW5kID0gc2VhcmNoVGl6a0NvbW1hbmRzKHZhbHVlKTsgXHJcbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gbmV3IEJhc2ljVGlrelRva2VuKGNvbW1hbmQpXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShzdGFydCwgZW5kICsgMSAtIHN0YXJ0LCB0b2tlbik7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwcmVwYXJlRm9yVG9rZW5pemUoKXtcclxuICAgICAgICBjb25zdCBzcXVhcmVCcmFja2V0SW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdTcXVhcmVfYnJhY2tldHNfb3BlbicsdGhpcy50b2tlbnMpXHJcbiAgICAgICAgc3F1YXJlQnJhY2tldEluZGV4ZXNcclxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5vcGVuIC0gYS5vcGVuKSAvLyBTb3J0IGluIGRlc2NlbmRpbmcgb3JkZXIgb2YgJ29wZW4nXHJcbiAgICAgICAgLmZvckVhY2goKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmcgPSBuZXcgRm9ybWF0dGluZyhcclxuICAgICAgICAgICAgICAgIGNsZWFuRm9ybWF0dGluZyh0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgZm9ybWF0dGluZyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vbGV0IHByYW5lSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgdGhpcy50b2tlbnMpO1xyXG4gICAgICAgIGxldCBjb29yZGluYXRlSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgdGhpcy50b2tlbnMpXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbSxpZHgpPT50aGlzLnRva2Vuc1tpdGVtLmNsb3NlKzFdLnZhbHVlIT09J2F0JylcclxuICAgICAgICAvKlxyXG4gICAgICAgIGNvbnN0IHsgY29vcmRpbmF0ZUluZGV4ZXMsIHZhcmlhYmxlSW5kZXhlcyB9ID0gcHJhbmVJbmRleGVzLnJlZHVjZSgocmVzdWx0LCBpdGVtKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnRva2Vuc1tpdGVtLmNsb3NlICsgMV0/LnZhbHVlICE9PSAnYXQnKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQuY29vcmRpbmF0ZUluZGV4ZXMucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgfSBcclxuICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UgKyAxXT8udmFsdWUgPT09ICdhdCcpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC52YXJpYWJsZUluZGV4ZXMucHVzaChpdGVtKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH0sIHsgY29vcmRpbmF0ZUluZGV4ZXM6IFtdLCB2YXJpYWJsZUluZGV4ZXM6IFtdIH0pOyovXHJcbiAgICAgICAgY29vcmRpbmF0ZUluZGV4ZXNcclxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5vcGVuIC0gYS5vcGVuKSBcclxuICAgICAgICAuZm9yRWFjaCgoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXhpcyA9IG5ldyBBeGlzKCkucGFyc2VJbnB1dChcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnNsaWNlKGluZGV4Lm9wZW4gKyAxLCBpbmRleC5jbG9zZSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGF4aXMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBsZXQgdmFyaWFibGVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2VucylcclxuICAgICAgICAuZmlsdGVyKChpdGVtLGlkeCk9PnRoaXMudG9rZW5zW2l0ZW0uY2xvc2UgKyAxXS52YWx1ZT09PSdhdCcpXHJcblxyXG4gICAgICAgIHZhcmlhYmxlSW5kZXhlc1xyXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLm9wZW4gLSBhLm9wZW4pIFxyXG4gICAgICAgIC5mb3JFYWNoKChpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpbmRleCx0aGlzLnRva2Vucy5zbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSkpXHJcbiAgICAgICAgICAgIGNvbnN0IHZhcmlhYmxlID0gdG9WYXJpYWJsZVRva2VuKHRoaXMudG9rZW5zLnNsaWNlKGluZGV4Lm9wZW4gKyAxLCBpbmRleC5jbG9zZSkpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyh2YXJpYWJsZSlcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIHZhcmlhYmxlKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgRm9ybWF0VGlrempheCB7XHJcblx0c291cmNlOiBzdHJpbmc7XHJcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcclxuICAgIHRpa3pDb21tYW5kczogVGlrekNvbW1hbmRzPW5ldyBUaWt6Q29tbWFuZHMoKTtcclxuICAgIC8vbWlkUG9pbnQ6IEF4aXM7XHJcbiAgICBwcml2YXRlIHZpZXdBbmNob3JzOiB7bWF4OiBBeGlzLG1pbjpBeGlzLGF2ZU1pZFBvaW50OiBBeGlzfVxyXG5cdHByb2Nlc3NlZENvZGU9XCJcIjtcclxuICAgIGRlYnVnSW5mbyA9IFwiXCI7XHJcbiAgICBcclxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZ3xBcnJheTxUb2tlbj4pIHtcclxuICAgICAgICBpZighc291cmNlLm1hdGNoKC8odXNlcGFja2FnZXx1c2V0aWt6bGlicmFyeSkvKSl7XHJcblx0XHQvL2NvbnN0IGJhc2ljVGlrelRva2Vucz1uZXcgQmFzaWNUaWt6VG9rZW5zKHNvdXJjZSlcclxuICAgICAgICAvL2NvbnNvbGUubG9nKCdiYXNpY1Rpa3pUb2tlbnMnLGJhc2ljVGlrelRva2VucylcclxuICAgICAgICAvL3RoaXMudG9rZW5pemUoYmFzaWNUaWt6VG9rZW5zLmdldFRva2VucygpKVxyXG4gICAgICAgIC8vY29uc29sZS5sb2coJ3Rva2VuaXplJyx0aGlzLnRva2VucylcclxuICAgICAgICAvL3RoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnRvU3RyaW5nKClcclxuXHJcbiAgICAgICAgLy90aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vZWxzZSB7dGhpcy5wcm9jZXNzZWRDb2RlPXNvdXJjZTt9XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlPXRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5wcm9jZXNzZWRDb2RlO1xyXG5cdH1cclxuXHJcbiAgICBwcml2YXRlIHRpZHlUaWt6U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcclxuICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgdG9rZW5pemUoYmFzaWNUaWt6VG9rZW5zKXtcclxuICAgICAgICBsZXQgZW5kSW5kZXhcclxuICAgICAgICBmb3IobGV0IGk9MDtpPGJhc2ljVGlrelRva2Vucy5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgaWYgKGJhc2ljVGlrelRva2Vuc1tpXS5uYW1lPT09J0RyYXcnKXtcclxuICAgICAgICAgICAgICAgIGVuZEluZGV4PWJhc2ljVGlrelRva2Vucy5zbGljZShpKS5maW5kSW5kZXgodD0+dC5uYW1lPT09J1NlbWljb2xvbicpK2lcclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcclxuICAgICAgICAgICAgICAgIGk9ZW5kSW5kZXhcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoJ2RyYXcnKS5maWxsQ29vcmRpbmF0ZXMoc2VnbWVudCkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGJhc2ljVGlrelRva2Vuc1tpXS5uYW1lPT09J0Nvb3JkaW5hdGUnKXtcclxuICAgICAgICAgICAgICAgIGVuZEluZGV4PWJhc2ljVGlrelRva2Vucy5zbGljZShpKS5maW5kSW5kZXgodD0+dC5uYW1lPT09J1NlbWljb2xvbicpK2lcclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHNlZ21lbnQpXHJcbiAgICAgICAgICAgICAgICBpPWVuZEluZGV4XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKCdjb29yZGluYXRlJykuaW50ZXJwcmV0Q29vcmRpbmF0ZShzZWdtZW50KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvKlxyXG4gICAgICAgIFRoZXkncmUgZ29pbmcgdG8gYmUgdGhyZWUgdHlwZXMgc3RyaW5nZWQgc3ludGF4IG51bWJlci5cclxuICAgICAgICAgSSB1c2UgdGhlbSB0byB0b2tlbml6ZS4gdXNpbmcgdGhlIHRpY2tzIGNvbW1hbmRzLiBPbmNlIHRva2VuaXplciB0YWtlcyBjb21tYW5kcy5cclxuICAgICAgICAgSSBtb3ZlIG9uIHRvIGFjdHVhbCBldmFsdWF0aW9uLlxyXG4gICAgICAgICovXHJcblxyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBzdWJkZWZpbmVkVG9rZW5zPVtdO1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YmFzaWNUaWt6VG9rZW5zLmxlbmd0aDtpKyspe1xyXG5cclxuICAgICAgICB9Ki9cclxuICAgIH1cclxuXHJcbiAgICBnZXRDb2RlKCl7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnNvdXJjZT09PVwic3RyaW5nXCImJnRoaXMuc291cmNlLm1hdGNoKC8odXNlcGFja2FnZXx1c2V0aWt6bGlicmFyeSkvKSl7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2Nlc3NlZENvZGVcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhcHBseVBvc3RQcm9jZXNzaW5nKCl7XHJcbiAgICAgICAgY29uc3QgZmxhdEF4ZXM9ZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgICAgIGZsYXRBeGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcclxuICAgICAgICAgICAgYXhpcy5hZGRRdWFkcmFudCh0aGlzLnZpZXdBbmNob3JzLmF2ZU1pZFBvaW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgZmxhdERyYXc9ZmxhdHRlbih0aGlzLnRva2VucyxbXSxEcmF3KS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgRHJhdyk7XHJcbiAgICAgICAgZmxhdERyYXcuZm9yRWFjaCgoZHJhdzogRHJhdykgPT4ge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0ICBbaW5kZXgsIGNvb3JdIG9mIGRyYXcuY29vcmRpbmF0ZXMuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoY29vciBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb29yLmZvcm1hdHRpbmc/LmFkZFNwbG9wQW5kUG9zaXRpb24oZHJhdy5jb29yZGluYXRlcyxpbmRleClcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG5cclxuICAgIC8qXHJcbiAgICB0b2tlbml6ZSgpIHtcclxuICAgICAgICBcclxuXHJcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxccy0sLjp8YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxyXG4gICAgICAgIGNvbnN0IGMgPSBTdHJpbmcucmF3YFskKF17MCwyfVske2NhfV0rWykkXXswLDJ9fFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXStcXChbJHtjYX1dK1xcKVxcJGA7XHJcbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHdpdGggZXNjYXBlZCBjaGFyYWN0ZXJzIGZvciBzcGVjaWZpYyBtYXRjaGluZ1xyXG4gICAgICAgIGNvbnN0IGNuID0gU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gOyAvLyBDb29yZGluYXRlIG5hbWVcclxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcXFwiP1xcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcIF5dKlxcJFxcXCI/fFtcXHdcXGRcXHNcXC0sLjooISlfXFwtXFwrXFxcXF5dKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcbiAgICAgICAgY29uc3QgZiA9IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOy4mKlxce1xcfSVcXC08Pl1gOyAvLyBGb3JtYXR0aW5nIHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xyXG5cclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgY29vclJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yXFx7KCR7Y30pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHBpY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxwaWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBzZSA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxccypcXCgqKCR7Y259KVxcKSpcXHMqYXRcXHMqXFwoKCR7Y30pXFwpXFxzKlxcWygke2Z9KilcXF1cXHMqXFx7KCR7dH0pXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHNzID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yZGluYXRlXFxzKihcXFtsYWJlbD1cXHtcXFsoLio/KVxcXTpcXFxcXFx3KlxccyooW1xcd1xcc10qKVxcfVxcXSk/XFxzKlxcKCgke2NufSspXFwpXFxzKmF0XFxzKlxcKCgke2N9KVxcKTtgLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHh5YXhpc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx4eWF4aXN7KCR7dH0pfXsoJHt0fSl9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZHsoW1xcZC0uXSspfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgbWFzc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxtYXNzXFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KC1cXHx8XFx8fD4pezAsMX1cXH1cXHsoW1xcZC5dKilcXH1gLFwiZ1wiKTtcclxuICAgICAgICAvL1xccGlje2FuYzJ9e2FuYzF9e2FuYzB9ezc1XlxcY2lyYyB9e307XHJcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtjb29yUmVnZXgsIHNlLCBzcywgbm9kZVJlZ2V4LCBkcmF3UmVnZXgsIGNpcmNsZVJlZ2V4LCBtYXNzUmVnZXgsIHZlY1JlZ2V4LHBpY1JlZ2V4XTtcclxuICAgICAgICBsZXQgbWF0Y2hlczogYW55W109W107XHJcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcclxuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gKGEuaW5kZXggfHwgMCkgLSAoYi5pbmRleCB8fCAwKSk7XHJcblxyXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xyXG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JcIikpIHtcclxuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMl0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfVxyXG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbNV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzRdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFsyXX0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcImNvb3JkaW5hdGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcImNvb3JkaW5hdGVcIiwgdW5kZWZpbmVkLGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xyXG5cclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxwaWNcIikpIHtcclxuICAgICAgICAgICAgY29uc3QgYzE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcylcclxuICAgICAgICAgICAgY29uc3QgYzI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcylcclxuICAgICAgICAgICAgY29uc3QgYzM9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbM10sdGhpcylcclxuXHJcblxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHttb2RlOiBcInBpYy1hbmdcIix0b2tlbnM6IHRoaXMsZm9ybWF0dGluZ1N0cmluZzogbWF0Y2hbNV0sZm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6IFwiYW5nXCIsaWNUZXh0OiBtYXRjaFs0XX0sZHJhd0FycjogW2MxLGMyLGMzXX0pKTtcclxuICAgICAgICAgIH1lbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGRyYXdcIikpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh1bmRlZmluZWQsbWF0Y2hbMV0sbWF0Y2hbMl0sIHRoaXMpKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxncmlkXCIpKSB7XHJcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XHJcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzNdLGxhYmVsOiBtYXRjaFs0XSxmb3JtYXR0aW5nOiBtYXRjaFszXX1cclxuICAgICAgICAgICAgaWYgKG1hdGNoWzBdLm1hdGNoKC9cXFxcbm9kZVxccypcXCgvKSl7XHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIiwgdW5kZWZpbmVkLGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNpcmNsZVwiKSkgey8qXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAgIHR5cGU6IFwiY2lyY2xlXCIsXHJcbiAgICAgICAgICAgICAgZm9ybWF0dGluZzogbWF0Y2hbNF0sXHJcbiAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMV0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMl0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbM10sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICB9KTsqXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixsYWJlbDogbWF0Y2hbMl0sYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIse3Rpa3pzZXQ6ICdtYXNzJyxhbmNob3I6IG1hdGNoWzNdLHJvdGF0ZTogbWF0Y2hbNF19KX0pKVxyXG5cclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcclxuICAgICAgICAgICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGF4aXMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzJdLHRoaXMpO1xyXG4gICAgICAgICAgICBjb25zdCBub2RlPW5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGUtaW5saW5lXCIsZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoJ25vZGUtaW5saW5lJyx7Y29sb3I6IFwicmVkXCJ9KX0pXHJcblxyXG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQ29vcmRpbmF0ZShcIm5vZGUtaW5saW5lXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBxPVthbmNlciwnLS0rJyxub2RlLGF4aXMxXVxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHtmb3JtYXR0aW5nT2JqOiB7dGlrenNldDogJ3ZlYyd9LHRva2VuczogdGhpcyxkcmF3QXJyOiBxfSkpXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcclxuICAgICAgICB9XHJcbiAgICB9Ki9cclxuICAgIGdldE1pbigpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1pbn1cclxuICAgIGdldE1heCgpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1heH1cclxuXHJcbiAgICBmaW5kVmlld0FuY2hvcnMoKSB7XHJcbiAgICAgICAgY29uc3QgYXhlcyA9IGZsYXR0ZW4odGhpcy50b2tlbnMpLmZpbHRlcigoaXRlbTogYW55KSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XHJcbiAgICAgICAgbGV0IG1heFggPSAtSW5maW5pdHksIG1heFkgPSAtSW5maW5pdHk7XHJcbiAgICAgICAgbGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5O1xyXG4gICAgXHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycyA9IHtcclxuICAgICAgICAgICAgbWF4OiBuZXcgQXhpcygwLCAwKSxcclxuICAgICAgICAgICAgbWluOiBuZXcgQXhpcygwLCAwKSxcclxuICAgICAgICAgICAgYXZlTWlkUG9pbnQ6IG5ldyBBeGlzKDAsIDApXHJcbiAgICAgICAgfTtcclxuICAgIFxyXG4gICAgICAgIGF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB7IGNhcnRlc2lhblgsIGNhcnRlc2lhblkgfSA9IGF4aXM7XHJcbiAgICBcclxuICAgICAgICAgICAgLy8gVXBkYXRlIHN1bXMgZm9yIGF2ZXJhZ2UgY2FsY3VsYXRpb25cclxuICAgICAgICAgICAgc3VtT2ZYICs9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIHN1bU9mWSArPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBtYXggYW5kIG1pbiBjb29yZGluYXRlc1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA+IG1heFgpIG1heFggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA+IG1heFkpIG1heFkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA8IG1pblgpIG1pblggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA8IG1pblkpIG1pblkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIH0pO1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgbGVuZ3RoID0gYXhlcy5sZW5ndGggIT09IDAgPyBheGVzLmxlbmd0aCA6IDE7XHJcbiAgICBcclxuICAgICAgICAvLyBTZXQgdGhlIHZpZXdBbmNob3JzXHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCA9IG5ldyBBeGlzKHN1bU9mWCAvIGxlbmd0aCwgc3VtT2ZZIC8gbGVuZ3RoKTtcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLm1heCA9IG5ldyBBeGlzKG1heFgsIG1heFkpO1xyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWluID0gbmV3IEF4aXMobWluWCwgbWluWSk7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3Qgb2cgPSB0aGlzLnRva2Vucy5zbGljZSgpLnJldmVyc2UoKS5maW5kKFxyXG4gICAgICAgICAgICAodG9rZW46IFRva2VuKSA9PlxyXG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4gb2cgaW5zdGFuY2VvZiBDb29yZGluYXRlID8gb2cuY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCI7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ3RoaXMudG9rZW5zJyx0aGlzLnRva2VucylcclxuICAgICAgICAvL2NvbnN0IGV4dHJlbWVYWT1nZXRFeHRyZW1lWFkodGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYodG9rZW4udG9TdHJpbmcoKSl7XHJcbiAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz10b2tlbi50b1N0cmluZygpXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gZmxhdHRlbihkYXRhOiBhbnksIHJlc3VsdHM6IGFueVtdID0gW10sIHN0b3BDbGFzcz86IGFueSk6IGFueVtdIHtcclxuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XHJcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBkYXRhKSB7XHJcbiAgICAgICAgZmxhdHRlbihpdGVtLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiBkYXRhICE9PSBudWxsKSB7XHJcbiAgICAgIC8vIElmIHRoZSBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgdGhlIHN0b3BDbGFzcywgYWRkIGl0IHRvIHJlc3VsdHMgYW5kIHN0b3AgZmxhdHRlbmluZ1xyXG4gICAgICBpZiAoc3RvcENsYXNzICYmIGRhdGEgaW5zdGFuY2VvZiBzdG9wQ2xhc3MpIHtcclxuICAgICAgICByZXN1bHRzLnB1c2goZGF0YSk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgLy8gQWRkIHRoZSBjdXJyZW50IG9iamVjdCB0byByZXN1bHRzXHJcbiAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcclxuICBcclxuICAgICAgLy8gUmVjdXJzaXZlbHkgZmxhdHRlbiBwcm9wZXJ0aWVzIG9mIHRoZSBvYmplY3RcclxuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xyXG4gICAgICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KGtleSkpIHtcclxuICAgICAgICAgIGZsYXR0ZW4oZGF0YVtrZXldLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEV4dHJlbWVYWSh0b2tlbnM6IGFueSkge1xyXG4gICAgbGV0IG1heFggPSAtSW5maW5pdHk7XHJcbiAgICBsZXQgbWF4WSA9IC1JbmZpbml0eTtcclxuICAgIGxldCBtaW5YID0gSW5maW5pdHk7XHJcbiAgICBsZXQgbWluWSA9IEluZmluaXR5O1xyXG4gICAgXHJcbiAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgIGlmICh0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgICAgIGlmICh0b2tlbi5YID4gbWF4WCkgbWF4WCA9IHRva2VuLlg7XHJcbiAgICAgICAgaWYgKHRva2VuLlggPCBtaW5YKSBtaW5YID0gdG9rZW4uWDtcclxuICAgIFxyXG4gICAgICAgIGlmICh0b2tlbi5ZID4gbWF4WSkgbWF4WSA9IHRva2VuLlk7XHJcbiAgICAgICAgaWYgKHRva2VuLlkgPCBtaW5ZKSBtaW5ZID0gdG9rZW4uWTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBtYXhYLG1heFksbWluWCxtaW5ZLFxyXG4gICAgfTtcclxufVxyXG5cclxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xyXG4gICAgY29uc3QgbnVtYmVyVmFsdWUgPSBwYXJzZUZsb2F0KHZhbHVlKTtcclxuICAgIHJldHVybiBpc05hTihudW1iZXJWYWx1ZSkgPyAwIDogbnVtYmVyVmFsdWU7XHJcbn07XHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gZ2V0UHJlYW1ibGUoKTpzdHJpbmd7XHJcbiAgICBjb25zdCBhbmc9XCJcXFxcdGlrenNldHthbmcvLnN0eWxlIDIgYXJncz17ZmlsbD1ibGFjayE1MCxvcGFjaXR5PTAuNSx0ZXh0IG9wYWNpdHk9MC45LGRyYXc9b3JhbmdlLDwtPixhbmdsZSBlY2NlbnRyaWNpdHk9IzEsYW5nbGUgcmFkaXVzPSMyY20sdGV4dD1vcmFuZ2UsZm9udD1cXFxcbGFyZ2V9LGFuZy8uZGVmYXVsdD17MS42fXswLjV9fVwiXHJcbiAgXHJcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxyXG4gIFxyXG4gICAgY29uc3QgYXJyPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFycn1bOF17XFxcXGNvb3JkaW5hdGUgKDIpIGF0ICgkKCMyKSEjNyEoIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDEpIGF0ICgkKDIpISM1bW0hOTA6KCMzKSQpO1xcXFxjb29yZGluYXRlICgzKSBhdCAoJCgyKSEjNW1tKyM0Y20hIzg6KCMzKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTFwdCw8LV0gKDEpLS0oMylub2RlIFtwb3M9IzZdIHtcXFxcbGFyZ2UgIzF9O31cIiBcclxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxyXG4gICAgY29uc3Qgc3ByaW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXHNwcmluZ31bNF17XFxcXHRpa3ptYXRoe2Nvb3JkaW5hdGUgXFxcXHN0YXJ0LCBcXFxcZG9uZTtcXFxcc3RhcnQgPSAoIzEpO1xcXFxkb25lID0gKCMyKTt9XFxcXGRyYXdbdGhpY2tdICgkKFxcXFxzdGFydCkgKyAoLTEuNSwwKSQpIC0tKysoMywwKTtcXFxcZHJhdyAoXFxcXHN0YXJ0KSAtLSsgKDAsLTAuMjVjbSk7XFxcXGRyYXcgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgrMGNtLFxcXFxkb25leSswLjI1Y20pJCktLSsoMCwtMC4yNSk7XFxcXGRyYXdbZGVjb3JhdGlvbj17YXNwZWN0PTAuMywgc2VnbWVudCBsZW5ndGg9MywgYW1wbGl0dWRlPTJtbSxjb2lsLH0sZGVjb3JhdGVdIChcXFxcc3RhcnR4LFxcXFxzdGFydHktMC4yNWNtKSAtLSgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSswLjI1Y20pJClub2RlW21pZHdheSxyaWdodD0wLjI1Y20sYmxhY2tdeyM0fTtcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KSQpeyMzfTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHRhYmxlPVwiXFxcXHRpa3pzZXR7IHRhYmxlLy5zdHlsZT17bWF0cml4IG9mIG5vZGVzLHJvdyBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsY29sdW1uIHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxub2Rlcz17cmVjdGFuZ2xlLGRyYXc9YmxhY2ssYWxpZ249Y2VudGVyfSxtaW5pbXVtIGhlaWdodD0xLjVlbSx0ZXh0IGRlcHRoPTAuNWV4LHRleHQgaGVpZ2h0PTJleCxub2RlcyBpbiBlbXB0eSBjZWxscyxldmVyeSBldmVuIHJvdy8uc3R5bGU9e25vZGVzPXtmaWxsPWdyYXkhNjAsdGV4dD1ibGFjayx9fSxjb2x1bW4gMS8uc3R5bGU9e25vZGVzPXt0ZXh0IHdpZHRoPTVlbSxmb250PVxcXFxiZnNlcmllc319LHJvdyAxLy5zdHlsZT17bm9kZXM9e2ZvbnQ9XFxcXGJmc2VyaWVzfX19fVwiXHJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXHJcbiAgICBjb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxyXG4gICAgY29uc3QgbWFzc1NldD1cIlxcXFx0aWt6c2V0eyBtYXNzLy5zdHlsZT17ZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrfX1cIlxyXG4gICAgY29uc3QgZHZlY3Rvcj1cIlxcXFxuZXdjb21tYW5ke1xcXFxkdmVjdG9yfVsyXXtcXFxcY29vcmRpbmF0ZSAodGVtcDEpIGF0ICgkKDAsMCAtfCAjMSkkKTtcXFxcY29vcmRpbmF0ZSAodGVtcDIpIGF0ICgkKDAsMCB8LSAjMSkkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0wLjdwdCwjMl0gKCMxKS0tKHRlbXAxKSgjMSktLSh0ZW1wMik7fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHBpY0FuZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxhbmd9WzVde1xcXFxjb29yZGluYXRlIChhbmcxKSBhdCAoIzEpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMikgYXQgKCMyKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzMpIGF0ICgjMyk7IFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmczfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0NCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzF9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdBQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhwYXJzZXtcXFxcYW5nQ0IgLSBcXFxcYW5nQUJ9XFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ8MHB0XFxcXHBnZm1hdGhwYXJzZXtcXFxccGdmbWF0aHJlc3VsdCArIDM2MH1cXFxcZmlcXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdD4xODBwdFxcXFxwZ2ZtYXRocGFyc2V7MzYwIC0gXFxcXHBnZm1hdGhyZXN1bHR9XFxcXGZpXFxcXGxldFxcXFxhbmdCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHNldG1hY3Jve1xcXFxhbmdsZUNoZWNrfXthYnMoXFxcXGFuZ0IgLSA5MCl9XFxcXGlmdGhlbmVsc2V7XFxcXGxlbmd0aHRlc3R7XFxcXGFuZ2xlQ2hlY2sgcHQgPCAwLjFwdH19e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde3JpZ2h0IGFuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O317XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17YW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fX1cIlxyXG4gICAgY29uc3QgcHJlYW1ibGU9XCJcXFxcdXNlcGFja2FnZXtwZ2ZwbG90cyxpZnRoZW59XFxcXHVzZXRpa3psaWJyYXJ5e2Fycm93cy5tZXRhLGFuZ2xlcyxxdW90ZXMscG9zaXRpb25pbmcsIGNhbGMsIGludGVyc2VjdGlvbnMsZGVjb3JhdGlvbnMubWFya2luZ3MsbWF0aCxzcHksbWF0cml4LHBhdHRlcm5zLHNuYWtlcyxkZWNvcmF0aW9ucy5wYXRocmVwbGFjaW5nLGRlY29yYXRpb25zLnBhdGhtb3JwaGluZyxwYXR0ZXJucyxzaGFkb3dzLHNoYXBlcy5zeW1ib2xzfVwiXHJcbiAgICByZXR1cm4gcHJlYW1ibGUrYW5nK21hcmsrYXJyK2xlbmUrc3ByaW5nK3RyZWUrdGFibGUrY29vcitkdmVjdG9yK3BpY0FuZyttYXNzU2V0K1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcclxufSJdfQ==