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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxjQUFjO0FBQ2QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBR3BILFNBQVMsMkJBQTJCLENBQUMsS0FBSztJQUN0QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUNELFNBQVMsSUFBSSxDQUFDLE1BQU07SUFDaEIsSUFBSSxNQUFNLEdBQUMsRUFBRSxDQUFBO0lBQ2IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUNuQixNQUFNLEVBQUUsR0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUN0RCxJQUFHLEVBQUUsRUFBQyxDQUFD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SUFBSSxHQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsT0FBTyxHQUFDLGlFQUFpRSxDQUFBO0FBQ3JKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAdHMtbm9jaGVja1xyXG5pbXBvcnQgeyBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMgfSBmcm9tIFwic3JjL21hdGhFbmdpbmVcIjtcclxuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgQ29vcmRpbmF0ZSwgRHJhdywgRm9ybWF0dGluZywgcmVnRXhwLCBUb2tlbiwgdG9Qb2ludCB9IGZyb20gXCIuLi90aWt6amF4XCI7XHJcbmltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaXprQ29tbWFuZHMsIHNlYXJjaFRpemtGb3JPZ0xhdGV4IH0gZnJvbSBcInNyYy90aWt6amF4L3Rpa3pDb21tYW5kc1wiO1xyXG5pbXBvcnQgeyBmaW5kTW9kaWZpZWRQYXJlbkluZGV4LCBmaW5kUGFyZW5JbmRleCwgaWRQYXJlbnRoZXNlcywgbWFwQnJhY2tldHMsIFBhcmVuIH0gZnJvbSBcInNyYy91dGlscy90b2tlblV0ZW5zaWxzXCI7XHJcbmltcG9ydCB7IHRleHQgfSBmcm9tIFwic3RyZWFtL2NvbnN1bWVyc1wiO1xyXG5cclxuZnVuY3Rpb24gbGFiZWxGcmVlRm9ybVRleHRTZXBhcmF0aW9uKGxhYmVsKXtcclxuICAgIGNvbnN0IGNvbG9uSW5kZXg9bGFiZWwuZmluZEluZGV4KHQ9PnQubmFtZT09PSdDb2xvbicpXHJcbiAgICAgbGFiZWw9bGFiZWwuc3BsaWNlKGNvbG9uSW5kZXgsbGFiZWwubGVuZ3RoLWNvbG9uSW5kZXgpXHJcbiAgICByZXR1cm4gbGFiZWwuc3BsaWNlKDEpXHJcbn1cclxuZnVuY3Rpb24gdG9PZyh0b2tlbnMpe1xyXG4gICAgbGV0IHN0cmluZz0nJ1xyXG4gICAgdG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xyXG4gICAgICAgIGNvbnN0IG9nPXNlYXJjaFRpemtGb3JPZ0xhdGV4KHRva2VuLm5hbWV8fHRva2VuLnZhbHVlKVxyXG4gICAgICAgIGlmKG9nKXtcclxuICAgICAgICAgICAgaWYob2cubGF0ZXgpXHJcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW9nLmxhdGV4XHJcbiAgICAgICAgICAgIGVsc2UgaWYob2cucmVmZXJlbmNlcz8ubGVuZ3RoPT09MSlcclxuICAgICAgICAgICAgICAgIHN0cmluZys9b2cucmVmZXJlbmNlc1swXVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHN0cmluZys9dG9rZW4udmFsdWVcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHN0cmluZ1xyXG59XHJcblxyXG5mdW5jdGlvbiBjbGVhbkZvcm1hdHRpbmcoZm9ybWF0dGluZzogYW55W10sc3ViVHlwZT86IHN0cmluZyk6IGFueVtdW10ge1xyXG4gICAgY29uc3QgdmFsdWVzOiBhbnlbXVtdID0gW107XHJcbiAgICBsZXQgY3VycmVudEdyb3VwOiBhbnlbXSA9IFtdO1xyXG4gICAgY29uc3QgZm9ybWF0dGluZ0tleXM9W11cclxuXHJcbiAgICBpZihzdWJUeXBlPT09J0xhYmVsJyl7XHJcbiAgICAgICAgY29uc3QgbGFiZWw9bGFiZWxGcmVlRm9ybVRleHRTZXBhcmF0aW9uKGZvcm1hdHRpbmcpXHJcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaCh7a2V5OiAnZnJlZUZvcm1UZXh0Jyx2YWx1ZTogdG9PZyhsYWJlbCl9KVxyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgY29uc3QgYnJhY2tldE1hcD1tYXBCcmFja2V0cygnQ3VybHlfYnJhY2tldHNfb3BlbicsZm9ybWF0dGluZyk7XHJcbiAgICBicmFja2V0TWFwLnJldmVyc2UoKVxyXG4gICAgYnJhY2tldE1hcC5mb3JFYWNoKGJyYWNrZXQgPT4ge1xyXG4gICAgICAgIGlmKGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTFdLm5hbWU9PT0nRXF1YWxzJyl7XHJcbiAgICAgICAgICAgIGxldCBzdWJGb3JtYXR0aW5nPWZvcm1hdHRpbmcuc3BsaWNlKGJyYWNrZXQub3Blbi0xLGJyYWNrZXQuY2xvc2UtKGJyYWNrZXQub3Blbi0yKSlcclxuICAgICAgICAgICAgc3ViRm9ybWF0dGluZz1zdWJGb3JtYXR0aW5nLnNsaWNlKDIsLTEpXHJcbiAgICAgICAgICAgIGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLnZhbHVlPWNsZWFuRm9ybWF0dGluZyhzdWJGb3JtYXR0aW5nLGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLm5hbWUpXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGZvcm1hdHRpbmcpIHtcclxuICAgICAgICBpZiAoaXRlbS5uYW1lID09PSAnQ29tbWEnKSB7XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50R3JvdXAubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudEdyb3VwKTtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRHcm91cCA9IFtdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY3VycmVudEdyb3VwLnB1c2goaXRlbSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudEdyb3VwKTtcclxuICAgIH1cclxuXHJcbiAgICBcclxuICAgIHZhbHVlcy5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xyXG4gICAgICAgIGZvcm1hdHRpbmdLZXlzLnB1c2goYXNzaWduRm9ybWF0dGluZyh2YWx1ZSkpO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gZm9ybWF0dGluZ0tleXMgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFzc2lnbkZvcm1hdHRpbmcoZm9ybWF0dGluZyl7XHJcblxyXG4gICAgY29uc3QgaXNFcXVhbHM9Zm9ybWF0dGluZy5tYXAoKGYsaWR4KT0+Zi5uYW1lPT09J0VxdWFscyc/aWR4Om51bGwpLmZpbHRlcih0PT50IT09bnVsbCk7XHJcbiAgICBjb25zdCBrZXk9Zm9ybWF0dGluZ1swXT8ubmFtZVxyXG5cclxuICAgIGlmKGlzRXF1YWxzLmxlbmd0aD09PTEpXHJcbiAgICAgICAgZm9ybWF0dGluZz1mb3JtYXR0aW5nLnNsaWNlKChpc0VxdWFsc1swXSsxKSlcclxuXHJcbiAgICBsZXQgdmFsdWU9aW50ZXJwcmV0Rm9ybWF0dGluZ1ZhbHVlKGZvcm1hdHRpbmcpO1xyXG4gICAgcmV0dXJuIHtrZXksdmFsdWV9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBpbnRlcnByZXRGb3JtYXR0aW5nVmFsdWUoZm9ybWF0dGluZyl7XHJcbiAgICBpZiAoZm9ybWF0dGluZy5sZW5ndGg9PT0xKXtcclxuICAgICAgICByZXR1cm4gZm9ybWF0dGluZ1swXS52YWx1ZXx8dHJ1ZVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvcm1hdHRpbmdcclxufVxyXG5cclxuY2xhc3MgVGlrekNvbW1hbmR7XHJcbiAgICB0cmlnZ2VyOiBzdHJpbmc7XHJcbiAgICBob29rTnVtOiBudW1iZXI7XHJcbiAgICBob29rczogYW55O1xyXG4gICAgY29udGVudDogQmFzaWNUaWt6VG9rZW5bXVxyXG4gICAgYWRkQ29tbWFuZCh0cmlnZ2VyLCBob29rTnVtLCBjb250ZW50KXtcclxuICAgICAgICB0aGlzLnRyaWdnZXI9dHJpZ2dlcjtcclxuICAgICAgICB0aGlzLmhvb2tOdW09aG9va051bTtcclxuICAgICAgICB0aGlzLmNvbnRlbnQ9Y29udGVudDtcclxuICAgICAgICB0aGlzLmZpbmRIb29rcygpXHJcbiAgICAgICAgcmV0dXJuIHRoaXNcclxuICAgIH1cclxuICAgIGZpbmRIb29rcygpe1xyXG4gICAgICAgIGNvbnN0IGhhc2h0YWdNYXA9dGhpcy5jb250ZW50Lm1hcCgoaXRlbSxpbmRleCk9Pml0ZW0ubmFtZT09PSdIYXNodGFnJyYmdGhpcy5jb250ZW50W2luZGV4KzFdLnR5cGU9PT0nbnVtYmVyJz9pbmRleDpudWxsKVxyXG4gICAgICAgIC5maWx0ZXIodD0+dCE9PW51bGwpXHJcbiAgICAgICAgaWYoaGFzaHRhZ01hcC5sZW5ndGghPT10aGlzLmhvb2tOdW0pe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERpc2NyZXBhbmN5IGJldHdlZW4gdGhlIG51bWJlciBvZiBob29rcyBkZWNsYXJlZCBhbmQgdGhlIG51bWJlciBvZiBob29rcyBmb3VuZCBpbiB0aGUgY29tbWFuZCBob29rTnVtOiAke3RoaXMuaG9va051bX0gaGFzaHRhZ01hcC5sZW5ndGg6ICR7aGFzaHRhZ01hcC5sZW5ndGh9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGhhc2h0YWdNYXAuc29ydCgoYSxiKT0+Yi1hKVxyXG4gICAgICAgIGhhc2h0YWdNYXAuZm9yRWFjaChpZHggPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBoYXNodGFnPXRoaXMuY29udGVudFtpZHhdO1xyXG4gICAgICAgICAgICBoYXNodGFnLnR5cGU9J1N5bnRheCdcclxuICAgICAgICAgICAgaGFzaHRhZy5uYW1lPSdob29rJ1xyXG4gICAgICAgICAgICBoYXNodGFnLnZhbHVlPXRoaXMuY29udGVudFtpZHgrMV0/LnZhbHVlO1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3BsaWNlKGlkeCsxLDEpXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBnZXRJbmZvKCl7XHJcbiAgICAgICAgcmV0dXJuIHt0cmlnZ2VyOiB0aGlzLnRyaWdnZXIsaG9va3M6IHRoaXMuaG9va051bX1cclxuICAgIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIFRpa3pDb21tYW5kc3tcclxuICAgIGNvbW1hbmRzOiBUaWt6Q29tbWFuZFtdPVtdO1xyXG4gICAgY29uc3RydWN0b3IoKTtcclxuICAgIGFkZENvbW1hbmQodG9rZW5zKXtcclxuICAgICAgICBcclxuICAgIH1cclxuICAgIGFkZENvbW1hbmRCeUludGVycHJldGF0aW9uKHRva2Vucykge1xyXG4gICAgICAgIGNvbnN0IGlkMVRva2VuID0gdG9rZW5zLmZpbmQoKGl0ZW0pID0+IGl0ZW0ubmFtZSA9PT0gJ0N1cmx5X2JyYWNrZXRzX29wZW4nKTtcclxuICAgICAgICBpZiAoIWlkMVRva2VuKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjogJ0N1cmx5X2JyYWNrZXRzX29wZW4nIG5vdCBmb3VuZCBpbiB0b2tlbnMuXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCBpZDEgPSBpZDFUb2tlbi52YWx1ZTtcclxuICAgICAgICBjb25zdCBpZDIgPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KGlkMSwgdW5kZWZpbmVkLCB0b2tlbnMsIDAsIDEpO1xyXG4gICAgICAgIGNvbnN0IGlkMyA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoaWQxLCB1bmRlZmluZWQsIHRva2VucywgMCwgMSwgJ0N1cmx5X2JyYWNrZXRzX29wZW4nKTtcclxuICAgIFxyXG4gICAgICAgIGlmICghaWQyIHx8ICFpZDMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOiBVbmFibGUgdG8gZmluZCBtYXRjaGluZyBicmFja2V0cy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWQxPWZpbmRQYXJlbkluZGV4KGlkMSwgdW5kZWZpbmVkLCB0b2tlbnMpXHJcbiAgICAgICAgbGV0IHRyaWdnZXIsIGhvb2tzLCBjb250ZW50O1xyXG4gICAgICAgIGNvbnRlbnQgPSB0b2tlbnMuc3BsaWNlKGlkMy5vcGVuICsgMSwgaWQzLmNsb3NlIC0gaWQzLm9wZW4gLSAxKTtcclxuICAgICAgICBob29rcyA9IHRva2Vucy5zcGxpY2UoaWQyLm9wZW4gKyAxLCBpZDIuY2xvc2UgLSBpZDIub3BlbiAtIDEpO1xyXG4gICAgICAgIHRyaWdnZXIgPSB0b2tlbnMuc3BsaWNlKGlkMS5vcGVuKzEsIGlkMS5jbG9zZSAtIGlkMS5vcGVuIC0gMSk7XHJcblxyXG4gICAgICAgIGlmIChob29rcy5sZW5ndGggPT09IDEgJiYgaG9va3NbMF0/LnR5cGUgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgIGhvb2tzID0gaG9va3NbMF0udmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBob29rczogRXhwZWN0ZWQgYSBzaW5nbGUgbnVtZXJpYyB2YWx1ZS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0cmlnZ2VyLmxlbmd0aCA9PT0gMSAmJiB0cmlnZ2VyWzBdPy50eXBlID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICB0cmlnZ2VyID0gdHJpZ2dlclswXS52YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHRyaWdnZXI6IEV4cGVjdGVkIGEgc2luZ2xlIHN0cmluZyB2YWx1ZS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY29tbWFuZHMucHVzaChuZXcgVGlrekNvbW1hbmQoKS5hZGRDb21tYW5kKHRyaWdnZXIsIGhvb2tzLCBjb250ZW50KSlcclxuICAgIH1cclxuXHJcbiAgICByZXBsYWNlQ2FsbFdpdGhDb21tYW5kKHRyaWdnZXI6IHN0cmluZyxob29rTnVtYmVyOiBudW1iZXIsaG9va3M6IGFueVtdKXtcclxuICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5jb21tYW5kcy5maW5kKGNvbW1hbmQgPT4gXHJcbiAgICAgICAgICAgIGNvbW1hbmQudHJpZ2dlciA9PT0gdHJpZ2dlciAmJiBob29rTnVtYmVyID09PSBjb21tYW5kLmhvb2tOdW1cclxuICAgICAgICApPy5jb250ZW50O1xyXG5cclxuICAgICAgICBjb25zdCBtYXAgPSBjb250ZW50Py5tYXAoKGl0ZW0sIGluZGV4KSA9PiBcclxuICAgICAgICAgICAgaXRlbS5uYW1lID09PSAnaG9vaycgPyB7IGluZGV4LCB2YWx1ZTogaXRlbS52YWx1ZSB9IDogbnVsbFxyXG4gICAgICAgICkuZmlsdGVyKHQgPT4gdCAhPT0gbnVsbCk7XHJcbiAgICAgICAgbWFwPy5yZXZlcnNlKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHVuaXF1ZVZhbHVlcyA9IG5ldyBTZXQoKTtcclxuICAgICAgICBmb3IgKGNvbnN0IHsgaW5kZXgsIHZhbHVlIH0gb2YgbWFwIHx8IFtdKSB7XHJcbiAgICAgICAgICAgIGlmICghdW5pcXVlVmFsdWVzLmhhcyh2YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgIHVuaXF1ZVZhbHVlcy5hZGQodmFsdWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnRlbnQuc3BsaWNlKGluZGV4LCAxLCAuLi5ob29rc1t2YWx1ZS0xXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb250ZW50XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0SG9va3ModG9rZW5zLGlkcyl7XHJcbiAgICAgICAgdG9rZW5zLnNwbGljZSgwLDEpXHJcbiAgICAgICAgY29uc3QgYWRqdXN0bWVudFZhbHVlPWlkc1swXS5vcGVuXHJcbiAgICAgICAgaWRzLmZvckVhY2goaWQgPT4ge1xyXG4gICAgICAgICAgICBpZC5vcGVuLT1hZGp1c3RtZW50VmFsdWU7XHJcbiAgICAgICAgICAgIGlkLmNsb3NlLT1hZGp1c3RtZW50VmFsdWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWRzLnJldmVyc2UoKTtcclxuICAgICAgICBjb25zdCBob29rcz1bXVxyXG4gICAgICAgIGlkcy5mb3JFYWNoKGlkID0+IHtcclxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZD10b2tlbnMuc3BsaWNlKGlkLm9wZW4rMSxpZC5jbG9zZS0oaWQub3BlbisxKSlcclxuICAgICAgICAgICAgaG9va3MucHVzaChyZW1vdmVkKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGhvb2tzLnJldmVyc2UoKTtcclxuICAgICAgICByZXR1cm4gaG9va3NcclxuICAgIH1cclxuICAgIFxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNUaWt6VG9rZW57XHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmdcclxuICAgIHZhbHVlOiBzdHJpbmd8bnVtYmVyfFBhcmVufGFueVxyXG4gICAgY29uc3RydWN0b3IodmFsdWU6IG51bWJlcnxzdHJpbmd8b2JqZWN0KXtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlPT09J251bWJlcicpe1xyXG4gICAgICAgICAgICB0aGlzLnR5cGU9J251bWJlcidcclxuICAgICAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcclxuICAgICAgICAgICAgcmV0dXJuIFxyXG4gICAgICAgIH1cclxuICAgICAgICBpZih0eXBlb2YgdmFsdWU9PT0nc3RyaW5nJyl7XHJcbiAgICAgICAgICAgIHRoaXMudHlwZT0nc3RyaW5nJ1xyXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgICAgICAgICByZXR1cm5cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50eXBlPXZhbHVlLnR5cGUucmVwbGFjZSgvQnJhY2tldC8sJ1N5bnRheCcpXHJcbiAgICAgICAgdGhpcy5uYW1lPXZhbHVlLm5hbWVcclxuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlLnZhbHVlXHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIHJldHVybiBzZWFyY2hUaXprRm9yT2dMYXRleCh0aGlzLm5hbWUpLmxhdGV4XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBUaWt6VmFyaWFibGV7XHJcbiAgICAvL3R5cGU6IFxyXG5cclxufVxyXG5leHBvcnQgY2xhc3MgVGlrelZhcmlhYmxlc3tcclxuICAgIHZhcmlhYmxlczogW109W11cclxuXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRvVmFyaWFibGVUb2tlbihhcnI6IGFueVtdKSB7XHJcbiAgICBhcnI9YXJyLmZpbHRlcih0PT4oIXQudHlwZS5pbmNsdWRlcygnUGFyZW50aGVzZXMnKSkpXHJcbiAgICBhcnI9dG9PZyhhcnIpXHJcbiAgICB0b2tlbj1uZXcgQmFzaWNUaWt6VG9rZW4oYXJyKVxyXG4gICAgdG9rZW4udHlwZT0ndmFyaWFibGUnXHJcbiAgICByZXR1cm4gdG9rZW5cclxufVxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNUaWt6VG9rZW5ze1xyXG4gICAgcHJpdmF0ZSB0b2tlbnM6IEFycmF5PEJhc2ljVGlrelRva2VufEZvcm1hdHRpbmc+ID0gW11cclxuICAgIHByaXZhdGUgdGlrekNvbW1hbmRzOiBUaWt6Q29tbWFuZHM9bmV3IFRpa3pDb21tYW5kcygpO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nKXtcclxuICAgICAgICBzb3VyY2UgPSB0aGlzLnRpZHlUaWt6U291cmNlKHNvdXJjZSk7XHJcbiAgICAgICAgc291cmNlPXRoaXMuYmFzaWNBcnJheWlmeShzb3VyY2UpXHJcbiAgICAgICAgdGhpcy5iYXNpY1Rpa3pUb2tlbmlmeShzb3VyY2UpXHJcbiAgICAgICAgdGhpcy5jbGVhbkJhc2ljVGlrelRva2VuaWZ5KClcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnByZXBhcmVGb3JUb2tlbml6ZSgpXHJcbiAgICB9XHJcbiAgICBnZXRUb2tlbnMoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy50b2tlbnNcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHRpZHlUaWt6U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcclxuICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBiYXNpY0FycmF5aWZ5KHNvdXJjZSl7XHJcbiAgICAgICAgY29uc3QgYmFzaWNBcnJheSA9IFtdO1xyXG4gICAgICAgIGNvbnN0IG9wZXJhdG9yc1JlZ2V4ID0gbmV3IFJlZ0V4cCgnXicgKyBhcnJUb1JlZ2V4U3RyaW5nKGdldEFsbFRpa3pSZWZlcmVuY2VzKCkpKTtcclxuICAgICAgICBsZXQgaSA9IDA7XHJcbiAgICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChpIDwgc291cmNlLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBjb25zdCBzdWJTb3VyY2UgPSBzb3VyY2Uuc2xpY2UoaSk7XHJcbiAgICAgICAgICAgIGxldCBtYXRjaDtcclxuICAgICAgICBcclxuICAgICAgICAgICAgLy8gTWF0Y2ggVGlrWiBvcGVyYXRvcnNcclxuICAgICAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2gob3BlcmF0b3JzUmVnZXgpO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiBtYXRjaFswXSB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAgICAgLy8gTWF0Y2ggbnVtYmVyc1xyXG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlstMC05Ll0rLyk7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnbnVtYmVyJywgdmFsdWU6IHBhcnNlTnVtYmVyKG1hdGNoWzBdKSB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2goL15bYS16QS1aXFxcXF0rLyk7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IG1hdGNoWzBdIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICBcclxuICAgICAgICAgICAgLy8gSW5jcmVtZW50IGluZGV4IGlmIG5vIG1hdGNoIGZvdW5kXHJcbiAgICAgICAgICAgIGkrKztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGJhc2ljQXJyYXlcclxuICAgIH1cclxuICAgIHByaXZhdGUgYmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNBcnJheSl7XHJcbiAgICAgICAgIC8vIFByb2Nlc3MgdG9rZW5zXHJcbiAgICAgICAgYmFzaWNBcnJheS5mb3JFYWNoKCh7IHR5cGUsIHZhbHVlIH0pID0+IHtcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aWt6Q29tbWFuZCA9IHNlYXJjaFRpemtDb21tYW5kcyh2YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGlrekNvbW1hbmQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY1Rpa3pUb2tlbih0aWt6Q29tbWFuZCkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odmFsdWUpKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBCYXNpY1Rpa3pUb2tlbih2YWx1ZSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWRQYXJlbnRoZXNlcyh0aGlzLnRva2VucylcclxuICAgIH1cclxuICAgIHByaXZhdGUgaW5mZXJBbmRJbnRlcnByZXRDb21tYW5kcygpe1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGNvbW1hbmRzTWFwPXRoaXMudG9rZW5zLm1hcCgodCxpZHgpPT50LnR5cGU9PT0nQ29tbWFuZCc/aWR4Om51bGwpXHJcbiAgICAgICAgLmZpbHRlcih0PT50IT09bnVsbCk7XHJcbiAgICAgICAgY29tbWFuZHNNYXAuZm9yRWFjaChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0QnJhY2tldEFmdGVySW5kZXg9dGhpcy50b2tlbnMuc2xpY2UoaW5kZXgpLmZpbmQoKGl0ZW0saWR4KT0+aXRlbS5uYW1lPT09J0N1cmx5X2JyYWNrZXRzX29wZW4nKTtcclxuICAgICAgICAgICAgY29uc3QgZW5kT2ZFeHByZXNzaW9uPWZpbmRNb2RpZmllZFBhcmVuSW5kZXgoZmlyc3RCcmFja2V0QWZ0ZXJJbmRleC52YWx1ZSx1bmRlZmluZWQsdGhpcy50b2tlbnMsMCwxLCdDdXJseV9icmFja2V0c19vcGVuJylcclxuICAgICAgICAgICAgY29uc3QgY29tbWFuZD10aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgsTWF0aC5hYnMoaW5kZXgtKGVuZE9mRXhwcmVzc2lvbi5jbG9zZSsxKSkpXHJcbiAgICAgICAgICAgIHRoaXMudGlrekNvbW1hbmRzLmFkZENvbW1hbmRCeUludGVycHJldGF0aW9uKGNvbW1hbmQpXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbW1hbmRzPXRoaXMudGlrekNvbW1hbmRzLmNvbW1hbmRzLm1hcChjPT5jLmdldEluZm8oKSk7XHJcbiAgICAgICAgY29uc3QgY29tbWFuZHNJblRva2Vucz10aGlzLnRva2Vucy5tYXAoKGl0ZW0saW5kZXgpPT57XHJcbiAgICAgICAgICAgIGlmKGl0ZW0udHlwZSE9PSdzdHJpbmcnKXtyZXR1cm4gbnVsbH1cclxuICAgICAgICAgICAgY29uc3QgbWF0Y2g9Y29tbWFuZHMuZmluZChjPT5jLnRyaWdnZXI9PT1pdGVtLnZhbHVlKVxyXG4gICAgICAgICAgICBpZihtYXRjaCl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4ge2luZGV4OiBpbmRleCwuLi5tYXRjaH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbFxyXG4gICAgICAgIH0pLmZpbHRlcih0PT50IT09bnVsbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZvdW5BbmRDb25maXJtZWRDb21tYW5kcyA9IFtdO1xyXG4gICAgICAgIGZvciAoY29uc3QgW2luZGV4LCB7IHRyaWdnZXIsIGhvb2tzIH1dIG9mIE9iamVjdC5lbnRyaWVzKGNvbW1hbmRzSW5Ub2tlbnMpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG51bWVyaWNJbmRleCA9IE51bWJlcihpbmRleCk7IC8vIEVuc3VyZSBpbmRleCBpcyBhIG51bWJlclxyXG4gICAgICAgICAgICBjb25zdCBmaXJzdEJyYWNrZXRBZnRlckluZGV4ID0gdGhpcy50b2tlbnNcclxuICAgICAgICAgICAgICAgIC5zbGljZShudW1lcmljSW5kZXgpXHJcbiAgICAgICAgICAgICAgICAuZmluZCgoaXRlbSkgPT4gaXRlbS5uYW1lID09PSAnQ3VybHlfYnJhY2tldHNfb3BlbicpPy52YWx1ZTtcclxuXHJcbiAgICAgICAgICAgIGlmICghZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ3VybHlfYnJhY2tldHNfb3BlbiBub3QgZm91bmQgYWZ0ZXIgaW5kZXggXCIgKyBpbmRleCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaG9va3MgIT09ICdudW1iZXInIHx8IGhvb2tzIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBob29rcyB2YWx1ZSBhdCBpbmRleCAke2luZGV4fWApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBvYmogPSB7IGluZGV4LCB0cmlnZ2VyLCBob29rcywgaWRzOiBbXSB9O1xyXG5cclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBob29rczsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlblBhaXJJbmRleCA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoXHJcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RCcmFja2V0QWZ0ZXJJbmRleCxcclxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbnMsXHJcbiAgICAgICAgICAgICAgICAgICAgMCxcclxuICAgICAgICAgICAgICAgICAgICBpLFxyXG4gICAgICAgICAgICAgICAgICAgICdDdXJseV9icmFja2V0c19vcGVuJ1xyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIGlmICghcGFyZW5QYWlySW5kZXgpIFxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgUGFyZW4gcGFpciBub3QgZm91bmQgZm9yIGhvb2sgJHtpfSBhdCBpbmRleCAke2luZGV4fWApO1xyXG4gICAgICAgICAgICAgICAgaWYgKG9iai5pZHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhc3RJZCA9IG9iai5pZHNbb2JqLmlkcy5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobGFzdElkLmNsb3NlICE9PSBwYXJlblBhaXJJbmRleC5vcGVuIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc21hdGNoIGJldHdlZW4gbGFzdCBjbG9zZSAoJHtsYXN0SWQuY2xvc2V9KSBhbmQgbmV4dCBvcGVuICgke3BhcmVuUGFpckluZGV4Lm9wZW59KWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIG9iai5pZHMucHVzaChwYXJlblBhaXJJbmRleCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZm91bkFuZENvbmZpcm1lZENvbW1hbmRzLnB1c2gob2JqKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvdW5BbmRDb25maXJtZWRDb21tYW5kcy5mb3JFYWNoKGNvbW1hbmQgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWNvbW1hbmQuaWRzIHx8IGNvbW1hbmQuaWRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOiBDb21tYW5kIElEcyBhcmUgZW1wdHkgb3IgdW5kZWZpbmVkLlwiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCBvcGFuID0gY29tbWFuZC5pbmRleDsgXHJcbiAgICAgICAgICAgIGNvbnN0IGNsb3NlID0gY29tbWFuZC5pZHNbY29tbWFuZC5pZHMubGVuZ3RoIC0gMV0uY2xvc2U7XHJcbiAgICAgICAgICAgIGlmIChjbG9zZSA8IG9wYW4pIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjogQ2xvc2UgaW5kZXggaXMgc21hbGxlciB0aGFuIG9wZW4gaW5kZXguXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IGRlbGV0ZUNvdW50ID0gY2xvc2UgLSBvcGFuICsgMTtcclxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZFRva2VucyA9IHRoaXMudG9rZW5zLnNsaWNlKG9wYW4sIGNsb3NlKTtcclxuICAgICAgICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSB0aGlzLnRpa3pDb21tYW5kcy5yZXBsYWNlQ2FsbFdpdGhDb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgY29tbWFuZC50cmlnZ2VyLFxyXG4gICAgICAgICAgICAgICAgY29tbWFuZC5ob29rcyxcclxuICAgICAgICAgICAgICAgIHRoaXMudGlrekNvbW1hbmRzLmdldEhvb2tzKHJlbW92ZWRUb2tlbnMsY29tbWFuZC5pZHMpLFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2Uob3BhbiwgZGVsZXRlQ291bnQsIC4uLnJlcGxhY2VtZW50KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHByaXZhdGUgY2xlYW5CYXNpY1Rpa3pUb2tlbmlmeSgpe1xyXG5cclxuICAgICAgICB0aGlzLmluZmVyQW5kSW50ZXJwcmV0Q29tbWFuZHMoKVxyXG5cclxuXHJcbiAgICAgICAgY29uc3QgdW5pdEluZGljZXM6IG51bWJlcltdID0gdGhpcy50b2tlbnNcclxuICAgICAgICAubWFwKCh0b2tlbiwgaWR4KSA9PiAodG9rZW4udHlwZSA9PT0gJ1VuaXQnID8gaWR4IDogbnVsbCkpXHJcbiAgICAgICAgLmZpbHRlcigoaWR4KTogaWR4IGlzIG51bWJlciA9PiBpZHggIT09IG51bGwpO1xyXG5cclxuICAgICAgICB1bml0SW5kaWNlcy5mb3JFYWNoKCh1bml0SWR4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZXZUb2tlbiA9IHRoaXMudG9rZW5zW3VuaXRJZHggLSAxXTtcclxuXHJcbiAgICAgICAgICAgIGlmICghcHJldlRva2VuIHx8IHByZXZUb2tlbi50eXBlICE9PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbml0cyBjYW4gb25seSBiZSB1c2VkIGluIHJlZmVyZW5jZSB0byBudW1iZXJzIGF0IGluZGV4ICR7dW5pdElkeH1gKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcHJldlRva2VuLnZhbHVlID0gdG9Qb2ludChwcmV2VG9rZW4udmFsdWUgYXMgbnVtYmVyLCB0aGlzLnRva2Vuc1t1bml0SWR4XS5uYW1lKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy50b2tlbnM9dGhpcy50b2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICghdW5pdEluZGljZXMuaW5jbHVkZXMoaWR4KSkpO1xyXG5cclxuICAgICAgICAvL3RoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigodCkgPT4gdC5uYW1lIT09J0NvbW1hJyk7XHJcbiAgICAgICAgLypcclxuICAgICAgICBjb25zdCBpbmRleGVzVG9SZW1vdmU6IG51bWJlcltdPVtdXHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW4saW5kZXgpID0+IHtcclxuICAgICAgICAgICAgaWYodG9rZW4udHlwZT09PSdGb3JtYXR0aW5nJyl7XHJcbiAgICAgICAgICAgICAgICBpZih0aGlzLnRva2Vuc1tpbmRleCsxXS5uYW1lPT09J0VxdWFscycpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbnNbaW5kZXhdLnZhbHVlPXRoaXMudG9rZW5zW2luZGV4KzJdXHJcbiAgICAgICAgICAgICAgICAgICAgaW5kZXhlc1RvUmVtb3ZlLnB1c2goaW5kZXgrMSxpbmRleCsyKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMudG9rZW5zPXRoaXMudG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAoIWluZGV4ZXNUb1JlbW92ZS5pbmNsdWRlcyhpZHgpKSk7Ki9cclxuXHJcblxyXG5cclxuICAgICAgICBjb25zdCBtYXBTeW50YXggPSB0aGlzLnRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbi50eXBlID09PSAnU3ludGF4JyAmJiAvKERhc2h8UGx1cykvLnRlc3QodG9rZW4ubmFtZSkgPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKChpZHgpOiBpZHggaXMgbnVtYmVyID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHN5bnRheFNlcXVlbmNlcyA9IGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhtYXBTeW50YXgpO1xyXG5cclxuXHJcbiAgICAgICAgY29uc3Qgc3ludGF4T2JqZWN0cyA9IHN5bnRheFNlcXVlbmNlc1xyXG4gICAgICAgIC5tYXAoKHNlcXVlbmNlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChzZXF1ZW5jZS5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBzZXF1ZW5jZVswXTtcclxuICAgICAgICAgICAgY29uc3QgZW5kID0gc2VxdWVuY2Vbc2VxdWVuY2UubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHNlcXVlbmNlXHJcbiAgICAgICAgICAgICAgICAubWFwKChpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy50b2tlbnNbaW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdG9rZW4gfHwgIXRva2VuLm5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBNaXNzaW5nIG9yIGludmFsaWQgdG9rZW4gYXQgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICcnOyAvLyBQcm92aWRlIGEgZmFsbGJhY2tcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuLm5hbWVcclxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL0Rhc2gvLCAnLScpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9QbHVzLywgJysnKTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuam9pbignJyk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4geyBzdGFydCwgZW5kLCB2YWx1ZSB9O1xyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIC5maWx0ZXIoKG9iaikgPT4gb2JqICE9PSBudWxsKVxyXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLnN0YXJ0IC0gYS5zdGFydCk7XHJcblxyXG4gICAgICAgIHN5bnRheE9iamVjdHMuZm9yRWFjaCgoeyBzdGFydCwgZW5kLCB2YWx1ZSB9KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbW1hbmQgPSBzZWFyY2hUaXprQ29tbWFuZHModmFsdWUpOyBcclxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBuZXcgQmFzaWNUaWt6VG9rZW4oY29tbWFuZClcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMuc3BsaWNlKHN0YXJ0LCBlbmQgKyAxIC0gc3RhcnQsIHRva2VuKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHByZXBhcmVGb3JUb2tlbml6ZSgpe1xyXG4gICAgICAgIGNvbnN0IHNxdWFyZUJyYWNrZXRJbmRleGVzID0gbWFwQnJhY2tldHMoJ1NxdWFyZV9icmFja2V0c19vcGVuJyx0aGlzLnRva2VucylcclxuICAgICAgICBzcXVhcmVCcmFja2V0SW5kZXhlc1xyXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLm9wZW4gLSBhLm9wZW4pIC8vIFNvcnQgaW4gZGVzY2VuZGluZyBvcmRlciBvZiAnb3BlbidcclxuICAgICAgICAuZm9yRWFjaCgoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZyA9IG5ldyBGb3JtYXR0aW5nKFxyXG4gICAgICAgICAgICAgICAgY2xlYW5Gb3JtYXR0aW5nKHRoaXMudG9rZW5zLnNsaWNlKGluZGV4Lm9wZW4gKyAxLCBpbmRleC5jbG9zZSkpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCBmb3JtYXR0aW5nKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy9sZXQgcHJhbmVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgbGV0IGNvb3JkaW5hdGVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCB0aGlzLnRva2VucylcclxuICAgICAgICAuZmlsdGVyKChpdGVtLGlkeCk9PnRoaXMudG9rZW5zW2l0ZW0uY2xvc2UrMV0udmFsdWUhPT0nYXQnKVxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgY29uc3QgeyBjb29yZGluYXRlSW5kZXhlcywgdmFyaWFibGVJbmRleGVzIH0gPSBwcmFuZUluZGV4ZXMucmVkdWNlKChyZXN1bHQsIGl0ZW0pID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMudG9rZW5zW2l0ZW0uY2xvc2UgKyAxXT8udmFsdWUgIT09ICdhdCcpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5jb29yZGluYXRlSW5kZXhlcy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICB9IFxyXG4gICAgICAgICAgICBpZiAodGhpcy50b2tlbnNbaXRlbS5jbG9zZSArIDFdPy52YWx1ZSA9PT0gJ2F0Jykge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnZhcmlhYmxlSW5kZXhlcy5wdXNoKGl0ZW0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfSwgeyBjb29yZGluYXRlSW5kZXhlczogW10sIHZhcmlhYmxlSW5kZXhlczogW10gfSk7Ki9cclxuICAgICAgICBjb29yZGluYXRlSW5kZXhlc1xyXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLm9wZW4gLSBhLm9wZW4pIFxyXG4gICAgICAgIC5mb3JFYWNoKChpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBheGlzID0gbmV3IEF4aXMoKS5wYXJzZUlucHV0KFxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgYXhpcyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCB2YXJpYWJsZUluZGV4ZXMgPSBtYXBCcmFja2V0cygnUGFyZW50aGVzZXNfb3BlbicsIHRoaXMudG9rZW5zKVxyXG4gICAgICAgIC5maWx0ZXIoKGl0ZW0saWR4KT0+dGhpcy50b2tlbnNbaXRlbS5jbG9zZSArIDFdLnZhbHVlPT09J2F0JylcclxuXHJcbiAgICAgICAgdmFyaWFibGVJbmRleGVzXHJcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIub3BlbiAtIGEub3BlbikgXHJcbiAgICAgICAgLmZvckVhY2goKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGluZGV4LHRoaXMudG9rZW5zLnNsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlKSlcclxuICAgICAgICAgICAgY29uc3QgdmFyaWFibGUgPSB0b1ZhcmlhYmxlVG9rZW4odGhpcy50b2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKSk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHZhcmlhYmxlKVxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgdmFyaWFibGUpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBGb3JtYXRUaWt6amF4IHtcclxuXHRzb3VyY2U6IHN0cmluZztcclxuICAgIHRva2VuczogQXJyYXk8VG9rZW4+PVtdO1xyXG4gICAgdGlrekNvbW1hbmRzOiBUaWt6Q29tbWFuZHM9bmV3IFRpa3pDb21tYW5kcygpO1xyXG4gICAgLy9taWRQb2ludDogQXhpcztcclxuICAgIHByaXZhdGUgdmlld0FuY2hvcnM6IHttYXg6IEF4aXMsbWluOkF4aXMsYXZlTWlkUG9pbnQ6IEF4aXN9XHJcblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xyXG4gICAgZGVidWdJbmZvID0gXCJcIjtcclxuICAgIFxyXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nfEFycmF5PFRva2VuPikge1xyXG4gICAgICAgIGlmKCFzb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcclxuXHRcdC8vY29uc3QgYmFzaWNUaWt6VG9rZW5zPW5ldyBCYXNpY1Rpa3pUb2tlbnMoc291cmNlKVxyXG4gICAgICAgIC8vY29uc29sZS5sb2coJ2Jhc2ljVGlrelRva2VucycsYmFzaWNUaWt6VG9rZW5zKVxyXG4gICAgICAgIC8vdGhpcy50b2tlbml6ZShiYXNpY1Rpa3pUb2tlbnMuZ2V0VG9rZW5zKCkpXHJcbiAgICAgICAgLy9jb25zb2xlLmxvZygndG9rZW5pemUnLHRoaXMudG9rZW5zKVxyXG4gICAgICAgIC8vdGhpcy5wcm9jZXNzZWRDb2RlICs9IHRoaXMudG9TdHJpbmcoKVxyXG5cclxuICAgICAgICAvL3RoaXMuZGVidWdJbmZvKz1KU09OLnN0cmluZ2lmeSh0aGlzLnRva2VucyxudWxsLDEpK1wiXFxuXFxuXCJcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9lbHNlIHt0aGlzLnByb2Nlc3NlZENvZGU9c291cmNlO31cclxuICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGU9dGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnByb2Nlc3NlZENvZGU7XHJcblx0fVxyXG5cclxuICAgIHByaXZhdGUgdGlkeVRpa3pTb3VyY2Uoc291cmNlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xyXG4gICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gc291cmNlLnNwbGl0KFwiXFxuXCIpO1xyXG4gICAgICAgIGxpbmVzID0gbGluZXMubWFwKGxpbmUgPT4gbGluZS50cmltKCkpO1xyXG4gICAgICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XHJcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpLnJlcGxhY2UoLyg/PD1bXlxcd10pIHwgKD89W15cXHddKS9nLCBcIlwiKS5yZXBsYWNlKC8oPzwhXFxcXCklLiokL2dtLCBcIlwiKS5yZXBsYWNlKC9cXG4vZyxcIlwiKTtcclxuICAgIH1cclxuXHJcbiAgICB0b2tlbml6ZShiYXNpY1Rpa3pUb2tlbnMpe1xyXG4gICAgICAgIGxldCBlbmRJbmRleFxyXG4gICAgICAgIGZvcihsZXQgaT0wO2k8YmFzaWNUaWt6VG9rZW5zLmxlbmd0aDtpKyspe1xyXG4gICAgICAgICAgICBpZiAoYmFzaWNUaWt6VG9rZW5zW2ldLm5hbWU9PT0nRHJhdycpe1xyXG4gICAgICAgICAgICAgICAgZW5kSW5kZXg9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkpLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nU2VtaWNvbG9uJykraVxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VnbWVudD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSsxLGVuZEluZGV4KVxyXG4gICAgICAgICAgICAgICAgaT1lbmRJbmRleFxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdygnZHJhdycpLmZpbGxDb29yZGluYXRlcyhzZWdtZW50KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoYmFzaWNUaWt6VG9rZW5zW2ldLm5hbWU9PT0nQ29vcmRpbmF0ZScpe1xyXG4gICAgICAgICAgICAgICAgZW5kSW5kZXg9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkpLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nU2VtaWNvbG9uJykraVxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VnbWVudD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSsxLGVuZEluZGV4KVxyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coc2VnbWVudClcclxuICAgICAgICAgICAgICAgIGk9ZW5kSW5kZXhcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoJ2Nvb3JkaW5hdGUnKS5pbnRlcnByZXRDb29yZGluYXRlKHNlZ21lbnQpKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgVGhleSdyZSBnb2luZyB0byBiZSB0aHJlZSB0eXBlcyBzdHJpbmdlZCBzeW50YXggbnVtYmVyLlxyXG4gICAgICAgICBJIHVzZSB0aGVtIHRvIHRva2VuaXplLiB1c2luZyB0aGUgdGlja3MgY29tbWFuZHMuIE9uY2UgdG9rZW5pemVyIHRha2VzIGNvbW1hbmRzLlxyXG4gICAgICAgICBJIG1vdmUgb24gdG8gYWN0dWFsIGV2YWx1YXRpb24uXHJcbiAgICAgICAgKi9cclxuXHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IHN1YmRlZmluZWRUb2tlbnM9W107XHJcbiAgICAgICAgLypcclxuICAgICAgICBmb3IgKGxldCBpPTA7aTxiYXNpY1Rpa3pUb2tlbnMubGVuZ3RoO2krKyl7XHJcblxyXG4gICAgICAgIH0qL1xyXG4gICAgfVxyXG5cclxuICAgIGdldENvZGUoKXtcclxuICAgICAgICBpZiAodHlwZW9mIHRoaXMuc291cmNlPT09XCJzdHJpbmdcIiYmdGhpcy5zb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJvY2Vzc2VkQ29kZVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZ2V0UHJlYW1ibGUoKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcclxuICAgICAgICBjb25zdCBmbGF0QXhlcz1mbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgZmxhdEF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xyXG4gICAgICAgICAgICBheGlzLmFkZFF1YWRyYW50KHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBmbGF0RHJhdz1mbGF0dGVuKHRoaXMudG9rZW5zLFtdLERyYXcpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBEcmF3KTtcclxuICAgICAgICBmbGF0RHJhdy5mb3JFYWNoKChkcmF3OiBEcmF3KSA9PiB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgIFtpbmRleCwgY29vcl0gb2YgZHJhdy5jb29yZGluYXRlcy5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgICAgIGlmIChjb29yIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3IuZm9ybWF0dGluZz8uYWRkU3Bsb3BBbmRQb3NpdGlvbihkcmF3LmNvb3JkaW5hdGVzLGluZGV4KVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcblxyXG4gICAgLypcclxuICAgIHRva2VuaXplKCkge1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzLSwuOnxgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXHJcbiAgICAgICAgY29uc3QgYyA9IFN0cmluZy5yYXdgWyQoXXswLDJ9WyR7Y2F9XStbKSRdezAsMn18XFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitdK1xcKFske2NhfV0rXFwpXFwkYDtcclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgd2l0aCBlc2NhcGVkIGNoYXJhY3RlcnMgZm9yIHNwZWNpZmljIG1hdGNoaW5nXHJcbiAgICAgICAgY29uc3QgY24gPSBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWA7IC8vIENvb3JkaW5hdGUgbmFtZVxyXG4gICAgICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxcXCI/XFwkW1xcd1xcZFxcc1xcLSwuOighKVxcLVxce1xcfVxcK1xcXFwgXl0qXFwkXFxcIj98W1xcd1xcZFxcc1xcLSwuOighKV9cXC1cXCtcXFxcXl0qYDsgLy8gVGV4dCB3aXRoIHNwZWNpZmljIGNoYXJhY3RlcnNcclxuICAgICAgICBjb25zdCBmID0gU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7LiYqXFx7XFx9JVxcLTw+XWA7IC8vIEZvcm1hdHRpbmcgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcblxyXG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB1c2luZyBlc2NhcGVkIGJyYWNlcyBhbmQgcGF0dGVybnNcclxuICAgICAgICBjb25zdCBjb29yUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgcGljUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHBpY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFx7KCR7Y30pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHNlID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFxzKlxcKCooJHtjbn0pXFwpKlxccyphdFxccypcXCgoJHtjfSlcXClcXHMqXFxbKCR7Zn0qKVxcXVxccypcXHsoJHt0fSlcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqKFxcW2xhYmVsPVxce1xcWyguKj8pXFxdOlxcXFxcXHcqXFxzKihbXFx3XFxzXSopXFx9XFxdKT9cXHMqXFwoKCR7Y259KylcXClcXHMqYXRcXHMqXFwoKCR7Y30pXFwpO2AsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBkcmF3UmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGRyYXdcXFsoJHtmfSopXFxdKFteO10qKTtgLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgeHlheGlzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHh5YXhpc3soJHt0fSl9eygke3R9KX1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgZ3JpZFJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxncmlkeyhbXFxkLS5dKyl9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGNpcmNsZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjaXJjbGVcXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoW1xcd1xcc1xcZF0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBtYXNzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG1hc3NcXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoLVxcfHxcXHx8Pil7MCwxfVxcfVxceyhbXFxkLl0qKVxcfWAsXCJnXCIpO1xyXG4gICAgICAgIC8vXFxwaWN7YW5jMn17YW5jMX17YW5jMH17NzVeXFxjaXJjIH17fTtcclxuICAgICAgICBjb25zdCB2ZWNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcdmVjXFx7KCR7Y30pXFx9XFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW2Nvb3JSZWdleCwgc2UsIHNzLCBub2RlUmVnZXgsIGRyYXdSZWdleCwgY2lyY2xlUmVnZXgsIG1hc3NSZWdleCwgdmVjUmVnZXgscGljUmVnZXhdO1xyXG4gICAgICAgIGxldCBtYXRjaGVzOiBhbnlbXT1bXTtcclxuICAgICAgICByZWdleFBhdHRlcm5zLmZvckVhY2goYWIgPT4ge1xyXG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiAoYS5pbmRleCB8fCAwKSAtIChiLmluZGV4IHx8IDApKTtcclxuXHJcbiAgICAgICAgW3h5YXhpc1JlZ2V4LGdyaWRSZWdleF0uZm9yRWFjaChhYiA9PiB7XHJcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XHJcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcbiAgICAgICAgICBpZiAobWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCAmJiBtYXRjaC5pbmRleCA+IGN1cnJlbnRJbmRleCkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHRoaXMuc291cmNlLnNsaWNlKGN1cnJlbnRJbmRleCwgbWF0Y2guaW5kZXgpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vclwiKSkge1xyXG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsyXSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbNF19XHJcbiAgICAgICAgICAgIGlmKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vcmRpbmF0ZVwiKSl7XHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFs1XSxjb29yZGluYXRlTmFtZTogbWF0Y2hbNF0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzJdfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCB7IGZvcm1hdHRpbmcsb3JpZ2luYWwsIC4uLnJlc3QgfSA9IGk7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwiY29vcmRpbmF0ZVwiLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG9yaWdpbmFsLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwiY29vcmRpbmF0ZVwiLCB1bmRlZmluZWQsZm9ybWF0dGluZyksLi4ucmVzdCx9KSk7XHJcblxyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHBpY1wiKSkge1xyXG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKVxyXG4gICAgICAgICAgICBjb25zdCBjMj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKVxyXG4gICAgICAgICAgICBjb25zdCBjMz1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFszXSx0aGlzKVxyXG5cclxuXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoe21vZGU6IFwicGljLWFuZ1wiLHRva2VuczogdGhpcyxmb3JtYXR0aW5nU3RyaW5nOiBtYXRjaFs1XSxmb3JtYXR0aW5nT2JqOiB7dGlrenNldDogXCJhbmdcIixpY1RleHQ6IG1hdGNoWzRdfSxkcmF3QXJyOiBbYzEsYzIsYzNdfSkpO1xyXG4gICAgICAgICAgfWVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZHJhd1wiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHVuZGVmaW5lZCxtYXRjaFsxXSxtYXRjaFsyXSwgdGhpcykpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHh5YXhpc1wiKSkge1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGdyaWRcIikpIHtcclxuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKHt0eXBlOiBcImdyaWRcIiwgcm90YXRlOiBtYXRjaFsxXX0pO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXG5vZGVcIikpIHtcclxuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbM10sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfVxyXG4gICAgICAgICAgICBpZiAobWF0Y2hbMF0ubWF0Y2goL1xcXFxub2RlXFxzKlxcKC8pKXtcclxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzJdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsxXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCB7IGZvcm1hdHRpbmcsb3JpZ2luYWwsIC4uLnJlc3QgfSA9IGk7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZVwiLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG9yaWdpbmFsLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZVwiLCB1bmRlZmluZWQsZm9ybWF0dGluZyksLi4ucmVzdCx9KSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7LypcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgdHlwZTogXCJjaXJjbGVcIixcclxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSxcclxuICAgICAgICAgICAgICBjb29yZGluYXRlczogW1xyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsxXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsyXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFszXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIH0pOypcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxtYXNzXCIpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZVwiLGxhYmVsOiBtYXRjaFsyXSxheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIix7dGlrenNldDogJ21hc3MnLGFuY2hvcjogbWF0Y2hbM10scm90YXRlOiBtYXRjaFs0XX0pfSkpXHJcblxyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHZlY1wiKSkge1xyXG4gICAgICAgICAgICBjb25zdCBhbmNlcj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKTtcclxuICAgICAgICAgICAgY29uc3QgYXhpczE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcyk7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vZGU9bmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZS1pbmxpbmVcIixmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZygnbm9kZS1pbmxpbmUnLHtjb2xvcjogXCJyZWRcIn0pfSlcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBDb29yZGluYXRlKFwibm9kZS1pbmxpbmVcIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHE9W2FuY2VyLCctLSsnLG5vZGUsYXhpczFdXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoe2Zvcm1hdHRpbmdPYmo6IHt0aWt6c2V0OiAndmVjJ30sdG9rZW5zOiB0aGlzLGRyYXdBcnI6IHF9KSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAobWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBjdXJyZW50SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA8IHRoaXMuc291cmNlLmxlbmd0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHRoaXMuc291cmNlLnNsaWNlKGN1cnJlbnRJbmRleCkpO1xyXG4gICAgICAgIH1cclxuICAgIH0qL1xyXG4gICAgZ2V0TWluKCl7cmV0dXJuIHRoaXMudmlld0FuY2hvcnMubWlufVxyXG4gICAgZ2V0TWF4KCl7cmV0dXJuIHRoaXMudmlld0FuY2hvcnMubWF4fVxyXG5cclxuICAgIGZpbmRWaWV3QW5jaG9ycygpIHtcclxuICAgICAgICBjb25zdCBheGVzID0gZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgc3VtT2ZYID0gMCwgc3VtT2ZZID0gMDtcclxuICAgICAgICBsZXQgbWF4WCA9IC1JbmZpbml0eSwgbWF4WSA9IC1JbmZpbml0eTtcclxuICAgICAgICBsZXQgbWluWCA9IEluZmluaXR5LCBtaW5ZID0gSW5maW5pdHk7XHJcbiAgICBcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzID0ge1xyXG4gICAgICAgICAgICBtYXg6IG5ldyBBeGlzKDAsIDApLFxyXG4gICAgICAgICAgICBtaW46IG5ldyBBeGlzKDAsIDApLFxyXG4gICAgICAgICAgICBhdmVNaWRQb2ludDogbmV3IEF4aXMoMCwgMClcclxuICAgICAgICB9O1xyXG4gICAgXHJcbiAgICAgICAgYXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgY2FydGVzaWFuWCwgY2FydGVzaWFuWSB9ID0gYXhpcztcclxuICAgIFxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgc3VtcyBmb3IgYXZlcmFnZSBjYWxjdWxhdGlvblxyXG4gICAgICAgICAgICBzdW1PZlggKz0gY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgc3VtT2ZZICs9IGNhcnRlc2lhblk7XHJcbiAgICBcclxuICAgICAgICAgICAgLy8gVXBkYXRlIG1heCBhbmQgbWluIGNvb3JkaW5hdGVzXHJcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5YID4gbWF4WCkgbWF4WCA9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5ZID4gbWF4WSkgbWF4WSA9IGNhcnRlc2lhblk7XHJcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5YIDwgbWluWCkgbWluWCA9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5ZIDwgbWluWSkgbWluWSA9IGNhcnRlc2lhblk7XHJcbiAgICAgICAgfSk7XHJcbiAgICBcclxuICAgICAgICBjb25zdCBsZW5ndGggPSBheGVzLmxlbmd0aCAhPT0gMCA/IGF4ZXMubGVuZ3RoIDogMTtcclxuICAgIFxyXG4gICAgICAgIC8vIFNldCB0aGUgdmlld0FuY2hvcnNcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLmF2ZU1pZFBvaW50ID0gbmV3IEF4aXMoc3VtT2ZYIC8gbGVuZ3RoLCBzdW1PZlkgLyBsZW5ndGgpO1xyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWF4ID0gbmV3IEF4aXMobWF4WCwgbWF4WSk7XHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5taW4gPSBuZXcgQXhpcyhtaW5YLCBtaW5ZKTtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIGZpbmRPcmlnaW5hbFZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBvZyA9IHRoaXMudG9rZW5zLnNsaWNlKCkucmV2ZXJzZSgpLmZpbmQoXHJcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XHJcbiAgICAgICAgICAgICAgICAodG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKSAmJiB0b2tlbi5jb29yZGluYXRlTmFtZSA9PT0gdmFsdWVcclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgdG9TdHJpbmcoKXtcclxuICAgICAgICBsZXQgY29kZUJsb2NrT3V0cHV0ID0gXCJcIjtcclxuICAgICAgICBjb25zb2xlLmxvZygndGhpcy50b2tlbnMnLHRoaXMudG9rZW5zKVxyXG4gICAgICAgIC8vY29uc3QgZXh0cmVtZVhZPWdldEV4dHJlbWVYWSh0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZih0b2tlbi50b1N0cmluZygpKXtcclxuICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPXRva2VuLnRvU3RyaW5nKClcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IHRva2VuO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBjb2RlQmxvY2tPdXRwdXQ7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBmbGF0dGVuKGRhdGE6IGFueSwgcmVzdWx0czogYW55W10gPSBbXSwgc3RvcENsYXNzPzogYW55KTogYW55W10ge1xyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcclxuICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGRhdGEpIHtcclxuICAgICAgICBmbGF0dGVuKGl0ZW0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnICYmIGRhdGEgIT09IG51bGwpIHtcclxuICAgICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbiBpbnN0YW5jZSBvZiB0aGUgc3RvcENsYXNzLCBhZGQgaXQgdG8gcmVzdWx0cyBhbmQgc3RvcCBmbGF0dGVuaW5nXHJcbiAgICAgIGlmIChzdG9wQ2xhc3MgJiYgZGF0YSBpbnN0YW5jZW9mIHN0b3BDbGFzcykge1xyXG4gICAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0cztcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICAvLyBBZGQgdGhlIGN1cnJlbnQgb2JqZWN0IHRvIHJlc3VsdHNcclxuICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xyXG4gIFxyXG4gICAgICAvLyBSZWN1cnNpdmVseSBmbGF0dGVuIHByb3BlcnRpZXMgb2YgdGhlIG9iamVjdFxyXG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBkYXRhKSB7XHJcbiAgICAgICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoa2V5KSkge1xyXG4gICAgICAgICAgZmxhdHRlbihkYXRhW2tleV0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0cztcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0RXh0cmVtZVhZKHRva2VuczogYW55KSB7XHJcbiAgICBsZXQgbWF4WCA9IC1JbmZpbml0eTtcclxuICAgIGxldCBtYXhZID0gLUluZmluaXR5O1xyXG4gICAgbGV0IG1pblggPSBJbmZpbml0eTtcclxuICAgIGxldCBtaW5ZID0gSW5maW5pdHk7XHJcbiAgICBcclxuICAgIHRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICAgICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcclxuICAgICAgICBpZiAodG9rZW4uWCA8IG1pblgpIG1pblggPSB0b2tlbi5YO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcclxuICAgICAgICBpZiAodG9rZW4uWSA8IG1pblkpIG1pblkgPSB0b2tlbi5ZO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIG1heFgsbWF4WSxtaW5YLG1pblksXHJcbiAgICB9O1xyXG59XHJcblxyXG5jb25zdCBwYXJzZU51bWJlciA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcclxufTtcclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRQcmVhbWJsZSgpOnN0cmluZ3tcclxuICAgIGNvbnN0IGFuZz1cIlxcXFx0aWt6c2V0e2FuZy8uc3R5bGUgMiBhcmdzPXtmaWxsPWJsYWNrITUwLG9wYWNpdHk9MC41LHRleHQgb3BhY2l0eT0wLjksZHJhdz1vcmFuZ2UsPC0+LGFuZ2xlIGVjY2VudHJpY2l0eT0jMSxhbmdsZSByYWRpdXM9IzJjbSx0ZXh0PW9yYW5nZSxmb250PVxcXFxsYXJnZX0sYW5nLy5kZWZhdWx0PXsxLjZ9ezAuNX19XCJcclxuICBcclxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXHJcbiAgXHJcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxyXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXHJcbiAgICBjb25zdCBzcHJpbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcc3ByaW5nfVs0XXtcXFxcdGlrem1hdGh7Y29vcmRpbmF0ZSBcXFxcc3RhcnQsIFxcXFxkb25lO1xcXFxzdGFydCA9ICgjMSk7XFxcXGRvbmUgPSAoIzIpO31cXFxcZHJhd1t0aGlja10gKCQoXFxcXHN0YXJ0KSArICgtMS41LDApJCkgLS0rKygzLDApO1xcXFxkcmF3IChcXFxcc3RhcnQpIC0tKyAoMCwtMC4yNWNtKTtcXFxcZHJhdyAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCswY20sXFxcXGRvbmV5KzAuMjVjbSkkKS0tKygwLC0wLjI1KTtcXFxcZHJhd1tkZWNvcmF0aW9uPXthc3BlY3Q9MC4zLCBzZWdtZW50IGxlbmd0aD0zLCBhbXBsaXR1ZGU9Mm1tLGNvaWwsfSxkZWNvcmF0ZV0gKFxcXFxzdGFydHgsXFxcXHN0YXJ0eS0wLjI1Y20pIC0tKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KzAuMjVjbSkkKW5vZGVbbWlkd2F5LHJpZ2h0PTAuMjVjbSxibGFja117IzR9O1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkpJCl7IzN9O31cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcclxuICAgIFxyXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcclxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcclxuICAgIGNvbnN0IG1hc3M9YFxcXFxkZWZcXFxcbWFzcyMxIzJ7XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgjMSl7IzJ9O31gXHJcbiAgICBjb25zdCBtYXNzU2V0PVwiXFxcXHRpa3pzZXR7IG1hc3MvLnN0eWxlPXtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2t9fVwiXHJcbiAgICBjb25zdCBkdmVjdG9yPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGR2ZWN0b3J9WzJde1xcXFxjb29yZGluYXRlICh0ZW1wMSkgYXQgKCQoMCwwIC18ICMxKSQpO1xcXFxjb29yZGluYXRlICh0ZW1wMikgYXQgKCQoMCwwIHwtICMxKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTAuN3B0LCMyXSAoIzEpLS0odGVtcDEpKCMxKS0tKHRlbXAyKTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgcGljQW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFuZ31bNV17XFxcXGNvb3JkaW5hdGUgKGFuZzEpIGF0ICgjMSk7IFxcXFxjb29yZGluYXRlIChhbmcyKSBhdCAoIzIpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMykgYXQgKCMzKTsgXFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzN9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMX17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0FCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHBhcnNle1xcXFxhbmdDQiAtIFxcXFxhbmdBQn1cXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdDwwcHRcXFxccGdmbWF0aHBhcnNle1xcXFxwZ2ZtYXRocmVzdWx0ICsgMzYwfVxcXFxmaVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PjE4MHB0XFxcXHBnZm1hdGhwYXJzZXszNjAgLSBcXFxccGdmbWF0aHJlc3VsdH1cXFxcZmlcXFxcbGV0XFxcXGFuZ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoc2V0bWFjcm97XFxcXGFuZ2xlQ2hlY2t9e2FicyhcXFxcYW5nQiAtIDkwKX1cXFxcaWZ0aGVuZWxzZXtcXFxcbGVuZ3RodGVzdHtcXFxcYW5nbGVDaGVjayBwdCA8IDAuMXB0fX17XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17cmlnaHQgYW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXthbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9fVwiXHJcbiAgICBjb25zdCBwcmVhbWJsZT1cIlxcXFx1c2VwYWNrYWdle3BnZnBsb3RzLGlmdGhlbn1cXFxcdXNldGlremxpYnJhcnl7YXJyb3dzLm1ldGEsYW5nbGVzLHF1b3Rlcyxwb3NpdGlvbmluZywgY2FsYywgaW50ZXJzZWN0aW9ucyxkZWNvcmF0aW9ucy5tYXJraW5ncyxtYXRoLHNweSxtYXRyaXgscGF0dGVybnMsc25ha2VzLGRlY29yYXRpb25zLnBhdGhyZXBsYWNpbmcsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcclxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK21hc3NTZXQrXCJcXFxccGdmcGxvdHNzZXR7Y29tcGF0PTEuMTZ9XFxcXGJlZ2lue2RvY3VtZW50fVxcXFxiZWdpbnt0aWt6cGljdHVyZX1cIlxyXG59Il19