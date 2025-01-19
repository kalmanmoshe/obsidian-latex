//// @ts-nocheck
import { processTikzString } from "./BasicMathJaxTokenGroup";
import { Axis, Coordinate, Draw } from "../tikzjax";
import { findModifiedParenIndex, findParenIndex, mapBrackets } from "src/utils/ParenUtensils";
function labelFreeFormTextSeparation(label) {
    const colonIndex = label.findIndex(t => t.name === 'Colon');
    label = label.splice(colonIndex, label.length - colonIndex);
    return label.splice(1);
}
function cleanFormatting(formatting, subType) {
    const values = [];
    let currentGroup = [];
    const formattingKeys = [];
    if (subType === 'Label') {
        const label = labelFreeFormTextSeparation(formatting);
        formattingKeys.push({ key: 'freeFormText', value: label.toString() });
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
        const hashtagMap = this.content.map((item, index) => item.getStringValue() === 'Hashtag' && this.content[index + 1].getType() === 'number' ? index : null)
            .filter(t => t !== null);
        if (hashtagMap.length !== this.hookNum) {
            throw new Error(`Discrepancy between the number of hooks declared and the number of hooks found in the command hookNum: ${this.hookNum} hashtagMap.length: ${hashtagMap.length}`);
        }
        hashtagMap.sort((a, b) => b - a); /*
        hashtagMap.forEach(idx => {
            const hashtag=this.content[idx];
            hashtag.type='Syntax'
            hashtag.name='hook'
            hashtag.value=this.content[idx+1]?.value;
            this.content.splice(idx+1,1)
        });*/
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
        const id2 = findModifiedParenIndex(id1, tokens, 0, 1);
        const id3 = findModifiedParenIndex(id1, tokens, 0, 1, 'Curly_brackets_open');
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
        const map = content?.map((item, index) => item.getStringValue() === 'hook' ? { index, value: item.getStringValue() } : null).filter(t => t !== null);
        map?.reverse();
        const uniqueValues = new Set(); /*Remove this disk for the err
        for (const { index, value } of map || []) {
            if (!uniqueValues.has(value)) {
                uniqueValues.add(value);
            }
            content.splice(index, 1, ...hooks[value-1]);
        }
        return content*/
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
export class TikzVariable {
}
export class TikzVariables {
    variables = [];
}
export class FormatTikzjax {
    source;
    tokens = [];
    tikzCommands = new TikzCommands();
    //midPoint: Axis;
    viewAnchors;
    processedCode = "";
    debugInfo = "";
    constructor(source, toEval) {
        if (toEval) {
            console.log(processTikzString(source));
        }
        /*
        if(!source.match(/(usepackage|usetikzlibrary)/)){
            const basicTikzTokens=new BasicTikzTokens(source)
            console.log('basicTikzTokens',basicTikzTokens)
            this.tokenize(basicTikzTokens.getTokens())
            console.log('tokenize',this.tokens)
            this.processedCode += this.toString()

            this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"
        }*/
        else {
            this.processedCode = source;
        }
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
    getCode(app) {
        if (typeof this.source === "string" && this.source.match(/(usepackage|usetikzlibrary)/)) {
            return this.processedCode;
        }
        return getPreamble(app) + this.processedCode + "\n\\end{tikzpicture}\\end{document}";
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
import * as fs from 'fs';
import { FileSystemAdapter } from "obsidian";
function getStyFileContent(filePath) {
    try {
        // Check if the file exists before trying to read
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        else {
            console.error(`File does not exist: ${filePath}`);
            return '';
        }
    }
    catch (error) {
        console.error('Error reading the .sty file:', error instanceof Error ? error.message : error);
        return '';
    }
}
import * as path from 'path';
function getPreamble(app) {
    let styContent = '';
    const adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
        const vaultPath = adapter.getBasePath();
        const preamblePath = path.join(vaultPath, 'obsidian', 'data', 'Files', 'preamble.sty');
        styContent = getStyFileContent(preamblePath);
    }
    styContent = styContent.split('\n').filter(line => !line.match(/(int|frac)/)).join('\n');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxnQkFBZ0I7QUFFaEIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDN0QsT0FBTyxFQUFvQixJQUFJLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBc0MsTUFBTSxZQUFZLENBQUM7QUFDMUcsT0FBTyxFQUErQixzQkFBc0IsRUFBRSxjQUFjLEVBQWlCLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRzFJLFNBQVMsMkJBQTJCLENBQUMsS0FBWTtJQUM3QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLFVBQWlCLEVBQUMsT0FBZ0I7SUFDdkQsTUFBTSxNQUFNLEdBQVksRUFBRSxDQUFDO0lBQzNCLElBQUksWUFBWSxHQUFVLEVBQUUsQ0FBQztJQUM3QixNQUFNLGNBQWMsR0FBQyxFQUFFLENBQUE7SUFFdkIsSUFBRyxPQUFPLEtBQUcsT0FBTyxFQUFDLENBQUM7UUFDbEIsTUFBTSxLQUFLLEdBQUMsMkJBQTJCLENBQUMsVUFBVSxDQUFDLENBQUE7UUFDbkQsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFDLEdBQUcsRUFBRSxjQUFjLEVBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsRUFBQyxDQUFD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YyxDQUFDLENBQUM7UUFDdEYsVUFBVSxHQUFHLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFDRCxVQUFVLEdBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFBLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7SUFFcEYsTUFBTSxHQUFHLEdBQUMsb0xBQW9MLENBQUE7SUFFOUwsTUFBTSxJQUFJLEdBQUMsNkxBQTZMLENBQUE7SUFFeE0sTUFBTSxHQUFHLEdBQUMsb05BQW9OLENBQUE7SUFDOU4sTUFBTSxJQUFJLEdBQUMsd1JBQXdSLENBQUE7SUFDblMsTUFBTSxNQUFNLEdBQUMsMGdCQUEwZ0IsQ0FBQTtJQUV2aEIsTUFBTSxJQUFJLEdBQUMsaUtBQWlLLENBQUE7SUFFNUssTUFBTSxLQUFLLEdBQUMsNldBQTZXLENBQUE7SUFDelgsTUFBTSxJQUFJLEdBQUMsK0VBQStFLENBQUE7SUFDMUYsTUFBTSxJQUFJLEdBQUMsb0ZBQW9GLENBQUE7SUFDL0YsTUFBTSxPQUFPLEdBQUMsMERBQTBELENBQUE7SUFDeEUsTUFBTSxPQUFPLEdBQUMsc0tBQXNLLENBQUE7SUFFcEwsTUFBTSxNQUFNLEdBQUMsOHZCQUE4dkIsQ0FBQTtJQUMzd0IsTUFBTSxRQUFRLEdBQUMsbVBBQW1QLENBQUE7SUFFbFEsT0FBTyxRQUFRLEdBQUMsVUFBVSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxNQUFNLEdBQUMsSUFBSSxHQUFDLEtBQUssR0FBQyxJQUFJLEdBQUMsT0FBTyxHQUFDLE1BQU0sR0FBQyxPQUFPLEdBQUMsaUVBQWlFLENBQUE7QUFDaEssQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vLy8gQHRzLW5vY2hlY2tcclxuXHJcbmltcG9ydCB7IHByb2Nlc3NUaWt6U3RyaW5nIH0gZnJvbSBcIi4vQmFzaWNNYXRoSmF4VG9rZW5Hcm91cFwiO1xyXG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCByZWdFeHAsIFRva2VuLCB0b1BvaW50IH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgZmluZERlZXBlc3RQYXJlbnRoZXNlc1Njb3BlLCBmaW5kTW9kaWZpZWRQYXJlbkluZGV4LCBmaW5kUGFyZW5JbmRleCwgaWRQYXJlbnRoZXNlcywgbWFwQnJhY2tldHMgfSBmcm9tIFwic3JjL3V0aWxzL1BhcmVuVXRlbnNpbHNcIjtcclxuXHJcblxyXG5mdW5jdGlvbiBsYWJlbEZyZWVGb3JtVGV4dFNlcGFyYXRpb24obGFiZWw6IGFueVtdKXtcclxuICAgIGNvbnN0IGNvbG9uSW5kZXg9bGFiZWwuZmluZEluZGV4KHQ9PnQubmFtZT09PSdDb2xvbicpXHJcbiAgICAgbGFiZWw9bGFiZWwuc3BsaWNlKGNvbG9uSW5kZXgsbGFiZWwubGVuZ3RoLWNvbG9uSW5kZXgpXHJcbiAgICByZXR1cm4gbGFiZWwuc3BsaWNlKDEpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsZWFuRm9ybWF0dGluZyhmb3JtYXR0aW5nOiBhbnlbXSxzdWJUeXBlPzogc3RyaW5nKTogYW55W10ge1xyXG4gICAgY29uc3QgdmFsdWVzOiBhbnlbXVtdID0gW107XHJcbiAgICBsZXQgY3VycmVudEdyb3VwOiBhbnlbXSA9IFtdO1xyXG4gICAgY29uc3QgZm9ybWF0dGluZ0tleXM9W11cclxuXHJcbiAgICBpZihzdWJUeXBlPT09J0xhYmVsJyl7XHJcbiAgICAgICAgY29uc3QgbGFiZWw9bGFiZWxGcmVlRm9ybVRleHRTZXBhcmF0aW9uKGZvcm1hdHRpbmcpXHJcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaCh7a2V5OiAnZnJlZUZvcm1UZXh0Jyx2YWx1ZTogbGFiZWwudG9TdHJpbmcoKX0pXHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICBjb25zdCBicmFja2V0TWFwPW1hcEJyYWNrZXRzKCdDdXJseV9icmFja2V0c19vcGVuJyxmb3JtYXR0aW5nKTtcclxuICAgIGJyYWNrZXRNYXAucmV2ZXJzZSgpXHJcbiAgICBicmFja2V0TWFwLmZvckVhY2goKGJyYWNrZXQ6IHsgb3BlbjogbnVtYmVyOyBjbG9zZTogbnVtYmVyOyB9KSA9PiB7XHJcbiAgICAgICAgaWYoZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMV0ubmFtZT09PSdFcXVhbHMnKXtcclxuICAgICAgICAgICAgbGV0IHN1YkZvcm1hdHRpbmc9Zm9ybWF0dGluZy5zcGxpY2UoYnJhY2tldC5vcGVuLTEsYnJhY2tldC5jbG9zZS0oYnJhY2tldC5vcGVuLTIpKVxyXG4gICAgICAgICAgICBzdWJGb3JtYXR0aW5nPXN1YkZvcm1hdHRpbmcuc2xpY2UoMiwtMSlcclxuICAgICAgICAgICAgZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMl0udmFsdWU9Y2xlYW5Gb3JtYXR0aW5nKHN1YkZvcm1hdHRpbmcsZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMl0ubmFtZSlcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZm9ybWF0dGluZykge1xyXG4gICAgICAgIGlmIChpdGVtLm5hbWUgPT09ICdDb21tYScpIHtcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50R3JvdXApO1xyXG4gICAgICAgICAgICAgICAgY3VycmVudEdyb3VwID0gW107XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjdXJyZW50R3JvdXAucHVzaChpdGVtKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA+IDApIHtcclxuICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50R3JvdXApO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG4gICAgdmFsdWVzLmZvckVhY2goKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaChhc3NpZ25Gb3JtYXR0aW5nKHZhbHVlKSk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiBmb3JtYXR0aW5nS2V5cyBcclxufVxyXG5cclxuZnVuY3Rpb24gYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nOiBhbnlbXSk6IGFueXtcclxuXHJcbiAgICBjb25zdCBpc0VxdWFscz1mb3JtYXR0aW5nLm1hcCgoZixpZHgpPT5mLm5hbWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKHQ9PnQhPT1udWxsKTtcclxuICAgIGNvbnN0IGtleT1mb3JtYXR0aW5nWzBdPy5uYW1lXHJcblxyXG4gICAgaWYoaXNFcXVhbHMubGVuZ3RoPT09MSlcclxuICAgICAgICBmb3JtYXR0aW5nPWZvcm1hdHRpbmcuc2xpY2UoKGlzRXF1YWxzWzBdKzEpKVxyXG5cclxuICAgIGxldCB2YWx1ZT1pbnRlcnByZXRGb3JtYXR0aW5nVmFsdWUoZm9ybWF0dGluZyk7XHJcbiAgICByZXR1cm4ge2tleSx2YWx1ZX1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGludGVycHJldEZvcm1hdHRpbmdWYWx1ZShmb3JtYXR0aW5nOiBzdHJpbmcgfCBhbnlbXSl7XHJcbiAgICBpZiAoZm9ybWF0dGluZy5sZW5ndGg9PT0xKXtcclxuICAgICAgICByZXR1cm4gZm9ybWF0dGluZ1swXS52YWx1ZXx8dHJ1ZVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvcm1hdHRpbmdcclxufVxyXG5cclxuY2xhc3MgVGlrekNvbW1hbmR7XHJcbiAgICB0cmlnZ2VyOiBzdHJpbmc7XHJcbiAgICBob29rTnVtOiBudW1iZXI7XHJcbiAgICBob29rczogYW55O1xyXG4gICAgY29udGVudDogQmFzaWNUaWt6VG9rZW5bXVxyXG4gICAgYWRkQ29tbWFuZCh0cmlnZ2VyOiBzdHJpbmcsIGhvb2tOdW06IG51bWJlciwgY29udGVudDogYW55W10pe1xyXG4gICAgICAgIHRoaXMudHJpZ2dlcj10cmlnZ2VyO1xyXG4gICAgICAgIHRoaXMuaG9va051bT1ob29rTnVtO1xyXG4gICAgICAgIHRoaXMuY29udGVudD1jb250ZW50O1xyXG4gICAgICAgIHRoaXMuZmluZEhvb2tzKClcclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgfVxyXG4gICAgZmluZEhvb2tzKCl7XHJcbiAgICAgICAgY29uc3QgaGFzaHRhZ01hcD10aGlzLmNvbnRlbnQubWFwKChpdGVtLGluZGV4KT0+aXRlbS5nZXRTdHJpbmdWYWx1ZSgpPT09J0hhc2h0YWcnJiZ0aGlzLmNvbnRlbnRbaW5kZXgrMV0uZ2V0VHlwZSgpPT09J251bWJlcic/aW5kZXg6bnVsbClcclxuICAgICAgICAuZmlsdGVyKHQ9PnQhPT1udWxsKVxyXG4gICAgICAgIGlmKGhhc2h0YWdNYXAubGVuZ3RoIT09dGhpcy5ob29rTnVtKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBEaXNjcmVwYW5jeSBiZXR3ZWVuIHRoZSBudW1iZXIgb2YgaG9va3MgZGVjbGFyZWQgYW5kIHRoZSBudW1iZXIgb2YgaG9va3MgZm91bmQgaW4gdGhlIGNvbW1hbmQgaG9va051bTogJHt0aGlzLmhvb2tOdW19IGhhc2h0YWdNYXAubGVuZ3RoOiAke2hhc2h0YWdNYXAubGVuZ3RofWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBoYXNodGFnTWFwLnNvcnQoKGEsYik9PmItYSkvKlxyXG4gICAgICAgIGhhc2h0YWdNYXAuZm9yRWFjaChpZHggPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBoYXNodGFnPXRoaXMuY29udGVudFtpZHhdO1xyXG4gICAgICAgICAgICBoYXNodGFnLnR5cGU9J1N5bnRheCdcclxuICAgICAgICAgICAgaGFzaHRhZy5uYW1lPSdob29rJ1xyXG4gICAgICAgICAgICBoYXNodGFnLnZhbHVlPXRoaXMuY29udGVudFtpZHgrMV0/LnZhbHVlO1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3BsaWNlKGlkeCsxLDEpXHJcbiAgICAgICAgfSk7Ki9cclxuICAgIH1cclxuICAgIGdldEluZm8oKXtcclxuICAgICAgICByZXR1cm4ge3RyaWdnZXI6IHRoaXMudHJpZ2dlcixob29rczogdGhpcy5ob29rTnVtfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBUaWt6Q29tbWFuZHN7XHJcbiAgICBjb21tYW5kczogVGlrekNvbW1hbmRbXT1bXTtcclxuICAgIGNvbnN0cnVjdG9yKCl7fTtcclxuICAgIGFkZENvbW1hbmQodG9rZW5zOiBhbnkpe1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgYWRkQ29tbWFuZEJ5SW50ZXJwcmV0YXRpb24odG9rZW5zOiBhbnlbXSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCd0b2tlbnMnLHRva2VucylcclxuICAgICAgICBjb25zdCBpZDFUb2tlbiA9IHRva2Vucy5maW5kKChpdGVtKSA9PiBpdGVtLm5hbWUgPT09ICdDdXJseV9icmFja2V0c19vcGVuJyk7XHJcbiAgICAgICAgaWYgKCFpZDFUb2tlbikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6ICdDdXJseV9icmFja2V0c19vcGVuJyBub3QgZm91bmQgaW4gdG9rZW5zLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBsZXQgaWQxID0gaWQxVG9rZW4udmFsdWU7XHJcbiAgICAgICAgY29uc3QgaWQyID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChpZDEsIHRva2VucywgMCwgMSk7XHJcbiAgICAgICAgY29uc3QgaWQzID0gZmluZE1vZGlmaWVkUGFyZW5JbmRleChpZDEsIHRva2VucywgMCwgMSwgJ0N1cmx5X2JyYWNrZXRzX29wZW4nKTtcclxuICAgIFxyXG4gICAgICAgIGlmICghaWQyIHx8ICFpZDMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOiBVbmFibGUgdG8gZmluZCBtYXRjaGluZyBicmFja2V0cy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWQxPWZpbmRQYXJlbkluZGV4KGlkMSwgdG9rZW5zKVxyXG4gICAgICAgIGxldCB0cmlnZ2VyLCBob29rcywgY29udGVudDtcclxuICAgICAgICBjb250ZW50ID0gdG9rZW5zLnNwbGljZShpZDMub3BlbiArIDEsIGlkMy5jbG9zZSAtIGlkMy5vcGVuIC0gMSk7XHJcbiAgICAgICAgaG9va3MgPSB0b2tlbnMuc3BsaWNlKGlkMi5vcGVuICsgMSwgaWQyLmNsb3NlIC0gaWQyLm9wZW4gLSAxKTtcclxuICAgICAgICB0cmlnZ2VyID0gdG9rZW5zLnNwbGljZShpZDEub3BlbisxLCBpZDEuY2xvc2UgLSBpZDEub3BlbiAtIDEpO1xyXG5cclxuICAgICAgICBpZiAoaG9va3MubGVuZ3RoID09PSAxICYmIGhvb2tzWzBdPy50eXBlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICBob29rcyA9IGhvb2tzWzBdLnZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgaG9va3M6IEV4cGVjdGVkIGEgc2luZ2xlIG51bWVyaWMgdmFsdWUuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAodHJpZ2dlci5sZW5ndGggPT09IDEgJiYgdHJpZ2dlclswXT8udHlwZSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgdHJpZ2dlciA9IHRyaWdnZXJbMF0udmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCB0cmlnZ2VyOiBFeHBlY3RlZCBhIHNpbmdsZSBzdHJpbmcgdmFsdWUuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNvbW1hbmRzLnB1c2gobmV3IFRpa3pDb21tYW5kKCkuYWRkQ29tbWFuZCh0cmlnZ2VyLCBob29rcywgY29udGVudCkpXHJcbiAgICB9XHJcblxyXG4gICAgcmVwbGFjZUNhbGxXaXRoQ29tbWFuZCh0cmlnZ2VyOiBzdHJpbmcsaG9va051bWJlcjogbnVtYmVyLGhvb2tzOiBhbnlbXSl7XHJcbiAgICAgICAgY29uc3QgY29udGVudCA9IHRoaXMuY29tbWFuZHMuZmluZChjb21tYW5kID0+IFxyXG4gICAgICAgICAgICBjb21tYW5kLnRyaWdnZXIgPT09IHRyaWdnZXIgJiYgaG9va051bWJlciA9PT0gY29tbWFuZC5ob29rTnVtXHJcbiAgICAgICAgKT8uY29udGVudDtcclxuICAgICAgICBpZighY29udGVudClyZXR1cm4gbnVsbDtcclxuICAgICAgICBjb25zdCBtYXAgPSBjb250ZW50Py5tYXAoKGl0ZW0sIGluZGV4KSA9PiBcclxuICAgICAgICAgICAgaXRlbS5nZXRTdHJpbmdWYWx1ZSgpID09PSAnaG9vaycgPyB7IGluZGV4LCB2YWx1ZTogaXRlbS5nZXRTdHJpbmdWYWx1ZSgpIH0gOiBudWxsXHJcbiAgICAgICAgKS5maWx0ZXIodCA9PiB0ICE9PSBudWxsKTtcclxuICAgICAgICBtYXA/LnJldmVyc2UoKTtcclxuXHJcbiAgICAgICAgY29uc3QgdW5pcXVlVmFsdWVzID0gbmV3IFNldCgpOy8qUmVtb3ZlIHRoaXMgZGlzayBmb3IgdGhlIGVyclxyXG4gICAgICAgIGZvciAoY29uc3QgeyBpbmRleCwgdmFsdWUgfSBvZiBtYXAgfHwgW10pIHtcclxuICAgICAgICAgICAgaWYgKCF1bmlxdWVWYWx1ZXMuaGFzKHZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgdW5pcXVlVmFsdWVzLmFkZCh2YWx1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29udGVudC5zcGxpY2UoaW5kZXgsIDEsIC4uLmhvb2tzW3ZhbHVlLTFdKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvbnRlbnQqL1xyXG4gICAgfVxyXG5cclxuICAgIGdldEhvb2tzKHRva2VuczogYW55W10saWRzOiBhbnlbXSl7XHJcbiAgICAgICAgdG9rZW5zLnNwbGljZSgwLDEpXHJcbiAgICAgICAgY29uc3QgYWRqdXN0bWVudFZhbHVlPWlkc1swXS5vcGVuXHJcbiAgICAgICAgaWRzLmZvckVhY2goaWQgPT4ge1xyXG4gICAgICAgICAgICBpZC5vcGVuLT1hZGp1c3RtZW50VmFsdWU7XHJcbiAgICAgICAgICAgIGlkLmNsb3NlLT1hZGp1c3RtZW50VmFsdWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWRzLnJldmVyc2UoKTtcclxuICAgICAgICBjb25zdCBob29rczogYW55W11bXT1bXVxyXG4gICAgICAgIGlkcy5mb3JFYWNoKGlkID0+IHtcclxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZD10b2tlbnMuc3BsaWNlKGlkLm9wZW4rMSxpZC5jbG9zZS0oaWQub3BlbisxKSlcclxuICAgICAgICAgICAgaG9va3MucHVzaChyZW1vdmVkKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGhvb2tzLnJldmVyc2UoKTtcclxuICAgICAgICByZXR1cm4gaG9va3NcclxuICAgIH1cclxuICAgIFxyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRpa3pWYXJpYWJsZXtcclxuICAgIC8vdHlwZTogXHJcblxyXG59XHJcbmV4cG9ydCBjbGFzcyBUaWt6VmFyaWFibGVze1xyXG4gICAgdmFyaWFibGVzOiBbXT1bXVxyXG5cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBGb3JtYXRUaWt6amF4IHtcclxuXHRzb3VyY2U6IHN0cmluZztcclxuICAgIHRva2VuczogQXJyYXk8VG9rZW4+PVtdO1xyXG4gICAgdGlrekNvbW1hbmRzOiBUaWt6Q29tbWFuZHM9bmV3IFRpa3pDb21tYW5kcygpO1xyXG4gICAgLy9taWRQb2ludDogQXhpcztcclxuICAgIHByaXZhdGUgdmlld0FuY2hvcnM6IHttYXg6IEF4aXMsbWluOkF4aXMsYXZlTWlkUG9pbnQ6IEF4aXN9XHJcblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xyXG4gICAgZGVidWdJbmZvID0gXCJcIjtcclxuICAgIFxyXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nLHRvRXZhbD86IGJvb2xlYW4pIHtcclxuICAgICAgICBpZih0b0V2YWwpe1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhwcm9jZXNzVGlrelN0cmluZyhzb3VyY2UpKVxyXG4gICAgICAgIH1cclxuICAgICAgICAvKlxyXG4gICAgICAgIGlmKCFzb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcclxuICAgICAgICAgICAgY29uc3QgYmFzaWNUaWt6VG9rZW5zPW5ldyBCYXNpY1Rpa3pUb2tlbnMoc291cmNlKVxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnYmFzaWNUaWt6VG9rZW5zJyxiYXNpY1Rpa3pUb2tlbnMpXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5pemUoYmFzaWNUaWt6VG9rZW5zLmdldFRva2VucygpKVxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygndG9rZW5pemUnLHRoaXMudG9rZW5zKVxyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGUgKz0gdGhpcy50b1N0cmluZygpXHJcblxyXG4gICAgICAgICAgICB0aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXHJcbiAgICAgICAgfSovXHJcbiAgICAgICAgZWxzZSB7dGhpcy5wcm9jZXNzZWRDb2RlPXNvdXJjZTt9XHJcbiAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlPXRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5wcm9jZXNzZWRDb2RlO1xyXG5cdH1cclxuICAgIHRpZHlUaWt6U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcclxuICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XHJcbiAgICB9XHJcbiAgICB0b2tlbml6ZShiYXNpY1Rpa3pUb2tlbnM6IGFueVtdKXtcclxuICAgICAgICBsZXQgZW5kSW5kZXhcclxuICAgICAgICBmb3IobGV0IGk9MDtpPGJhc2ljVGlrelRva2Vucy5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgaWYgKGJhc2ljVGlrelRva2Vuc1tpXS5uYW1lPT09J0RyYXcnKXtcclxuICAgICAgICAgICAgICAgIGVuZEluZGV4PWJhc2ljVGlrelRva2Vucy5zbGljZShpKS5maW5kSW5kZXgodD0+dC5uYW1lPT09J1NlbWljb2xvbicpK2lcclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcclxuICAgICAgICAgICAgICAgIGk9ZW5kSW5kZXhcclxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoJ2RyYXcnKS5maWxsQ29vcmRpbmF0ZXMoc2VnbWVudCkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGJhc2ljVGlrelRva2Vuc1tpXS5uYW1lPT09J0Nvb3JkaW5hdGUnKXtcclxuICAgICAgICAgICAgICAgIGVuZEluZGV4PWJhc2ljVGlrelRva2Vucy5zbGljZShpKS5maW5kSW5kZXgodD0+dC5uYW1lPT09J1NlbWljb2xvbicpK2lcclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHNlZ21lbnQpXHJcbiAgICAgICAgICAgICAgICBpPWVuZEluZGV4XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKCdjb29yZGluYXRlJykuaW50ZXJwcmV0Q29vcmRpbmF0ZShzZWdtZW50KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvKlxyXG4gICAgICAgIFRoZXkncmUgZ29pbmcgdG8gYmUgdGhyZWUgdHlwZXMgc3RyaW5nZWQgc3ludGF4IG51bWJlci5cclxuICAgICAgICAgSSB1c2UgdGhlbSB0byB0b2tlbml6ZS4gdXNpbmcgdGhlIHRpY2tzIGNvbW1hbmRzLiBPbmNlIHRva2VuaXplciB0YWtlcyBjb21tYW5kcy5cclxuICAgICAgICAgSSBtb3ZlIG9uIHRvIGFjdHVhbCBldmFsdWF0aW9uLlxyXG4gICAgICAgICovXHJcblxyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBzdWJkZWZpbmVkVG9rZW5zPVtdO1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YmFzaWNUaWt6VG9rZW5zLmxlbmd0aDtpKyspe1xyXG5cclxuICAgICAgICB9Ki9cclxuICAgIH1cclxuXHJcbiAgICBnZXRDb2RlKGFwcDogQXBwKXtcclxuICAgICAgICBpZiAodHlwZW9mIHRoaXMuc291cmNlPT09XCJzdHJpbmdcIiYmdGhpcy5zb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJvY2Vzc2VkQ29kZVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZ2V0UHJlYW1ibGUoYXBwKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcclxuICAgICAgICBjb25zdCBmbGF0QXhlcz1mbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgZmxhdEF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xyXG4gICAgICAgICAgICBheGlzLmFkZFF1YWRyYW50KHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBmbGF0RHJhdz1mbGF0dGVuKHRoaXMudG9rZW5zLFtdLERyYXcpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBEcmF3KTtcclxuICAgICAgICBmbGF0RHJhdy5mb3JFYWNoKChkcmF3OiBEcmF3KSA9PiB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgIFtpbmRleCwgY29vcl0gb2YgZHJhdy5jb29yZGluYXRlcy5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgICAgIGlmIChjb29yIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3IuZm9ybWF0dGluZz8uYWRkU3Bsb3BBbmRQb3NpdGlvbihkcmF3LmNvb3JkaW5hdGVzLGluZGV4KVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICBmaW5kVmlld0FuY2hvcnMoKSB7XHJcbiAgICAgICAgY29uc3QgYXhlcyA9IGZsYXR0ZW4odGhpcy50b2tlbnMpLmZpbHRlcigoaXRlbTogYW55KSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XHJcbiAgICAgICAgbGV0IG1heFggPSAtSW5maW5pdHksIG1heFkgPSAtSW5maW5pdHk7XHJcbiAgICAgICAgbGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5O1xyXG4gICAgXHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycyA9IHtcclxuICAgICAgICAgICAgbWF4OiBuZXcgQXhpcygwLCAwKSxcclxuICAgICAgICAgICAgbWluOiBuZXcgQXhpcygwLCAwKSxcclxuICAgICAgICAgICAgYXZlTWlkUG9pbnQ6IG5ldyBBeGlzKDAsIDApXHJcbiAgICAgICAgfTtcclxuICAgIFxyXG4gICAgICAgIGF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB7IGNhcnRlc2lhblgsIGNhcnRlc2lhblkgfSA9IGF4aXM7XHJcbiAgICBcclxuICAgICAgICAgICAgLy8gVXBkYXRlIHN1bXMgZm9yIGF2ZXJhZ2UgY2FsY3VsYXRpb25cclxuICAgICAgICAgICAgc3VtT2ZYICs9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIHN1bU9mWSArPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBtYXggYW5kIG1pbiBjb29yZGluYXRlc1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA+IG1heFgpIG1heFggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA+IG1heFkpIG1heFkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA8IG1pblgpIG1pblggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA8IG1pblkpIG1pblkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIH0pO1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgbGVuZ3RoID0gYXhlcy5sZW5ndGggIT09IDAgPyBheGVzLmxlbmd0aCA6IDE7XHJcbiAgICBcclxuICAgICAgICAvLyBTZXQgdGhlIHZpZXdBbmNob3JzXHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCA9IG5ldyBBeGlzKHN1bU9mWCAvIGxlbmd0aCwgc3VtT2ZZIC8gbGVuZ3RoKTtcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLm1heCA9IG5ldyBBeGlzKG1heFgsIG1heFkpO1xyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWluID0gbmV3IEF4aXMobWluWCwgbWluWSk7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XHJcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDsvKlxyXG4gICAgICAgIGNvbnN0IG9nID0gdGhpcy50b2tlbnMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChcclxuICAgICAgICAgICAgKHRva2VuOiBUb2tlbikgPT5cclxuICAgICAgICAgICAgICAgICh0b2tlbiBpbnN0YW5jZW9mIENvb3JkaW5hdGUpICYmIHRva2VuLmNvb3JkaW5hdGVOYW1lID09PSB2YWx1ZVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcmV0dXJuIG9nIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSA/IG9nLmNsb25lKCkgOiB1bmRlZmluZWQ7Ki9cclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCI7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ3RoaXMudG9rZW5zJyx0aGlzLnRva2VucylcclxuICAgICAgICAvL2NvbnN0IGV4dHJlbWVYWT1nZXRFeHRyZW1lWFkodGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYodG9rZW4udG9TdHJpbmcoKSl7XHJcbiAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz10b2tlbi50b1N0cmluZygpXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gZmxhdHRlbihkYXRhOiBhbnksIHJlc3VsdHM6IGFueVtdID0gW10sIHN0b3BDbGFzcz86IGFueSk6IGFueVtdIHtcclxuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XHJcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBkYXRhKSB7XHJcbiAgICAgICAgZmxhdHRlbihpdGVtLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiBkYXRhICE9PSBudWxsKSB7XHJcbiAgICAgIC8vIElmIHRoZSBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgdGhlIHN0b3BDbGFzcywgYWRkIGl0IHRvIHJlc3VsdHMgYW5kIHN0b3AgZmxhdHRlbmluZ1xyXG4gICAgICBpZiAoc3RvcENsYXNzICYmIGRhdGEgaW5zdGFuY2VvZiBzdG9wQ2xhc3MpIHtcclxuICAgICAgICByZXN1bHRzLnB1c2goZGF0YSk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgLy8gQWRkIHRoZSBjdXJyZW50IG9iamVjdCB0byByZXN1bHRzXHJcbiAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcclxuICBcclxuICAgICAgLy8gUmVjdXJzaXZlbHkgZmxhdHRlbiBwcm9wZXJ0aWVzIG9mIHRoZSBvYmplY3RcclxuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xyXG4gICAgICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KGtleSkpIHtcclxuICAgICAgICAgIGZsYXR0ZW4oZGF0YVtrZXldLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEV4dHJlbWVYWSh0b2tlbnM6IGFueSkge1xyXG4gICAgbGV0IG1heFggPSAtSW5maW5pdHk7XHJcbiAgICBsZXQgbWF4WSA9IC1JbmZpbml0eTtcclxuICAgIGxldCBtaW5YID0gSW5maW5pdHk7XHJcbiAgICBsZXQgbWluWSA9IEluZmluaXR5O1xyXG4gICAgXHJcbiAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgIGlmICh0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgICAgIGlmICh0b2tlbi5YID4gbWF4WCkgbWF4WCA9IHRva2VuLlg7XHJcbiAgICAgICAgaWYgKHRva2VuLlggPCBtaW5YKSBtaW5YID0gdG9rZW4uWDtcclxuICAgIFxyXG4gICAgICAgIGlmICh0b2tlbi5ZID4gbWF4WSkgbWF4WSA9IHRva2VuLlk7XHJcbiAgICAgICAgaWYgKHRva2VuLlkgPCBtaW5ZKSBtaW5ZID0gdG9rZW4uWTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBtYXhYLG1heFksbWluWCxtaW5ZLFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcclxuaW1wb3J0IHsgQmFzaWNUaWt6VG9rZW4gfSBmcm9tIFwic3JjL2Jhc2ljVG9rZW5cIjtcclxuaW1wb3J0IHsgQXBwLCBGaWxlU3lzdGVtQWRhcHRlciB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5cclxuXHJcbmZ1bmN0aW9uIGdldFN0eUZpbGVDb250ZW50KGZpbGVQYXRoOiBmcy5QYXRoTGlrZSk6IHN0cmluZyB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBmaWxlIGV4aXN0cyBiZWZvcmUgdHJ5aW5nIHRvIHJlYWRcclxuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhmaWxlUGF0aCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0ZjgnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGaWxlIGRvZXMgbm90IGV4aXN0OiAke2ZpbGVQYXRofWApO1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZWFkaW5nIHRoZSAuc3R5IGZpbGU6JywgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcik7XHJcbiAgICAgICAgcmV0dXJuICcnO1xyXG4gICAgfVxyXG59XHJcblxyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5mdW5jdGlvbiBnZXRQcmVhbWJsZShhcHA6IEFwcCk6c3RyaW5ne1xyXG4gICAgXHJcbiAgICBsZXQgc3R5Q29udGVudCA9ICcnXHJcbiAgICBjb25zdCBhZGFwdGVyID0gYXBwLnZhdWx0LmFkYXB0ZXI7XHJcbiAgICBpZiAoYWRhcHRlciBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1BZGFwdGVyKSB7XHJcbiAgICAgICAgY29uc3QgdmF1bHRQYXRoID0gYWRhcHRlci5nZXRCYXNlUGF0aCgpO1xyXG4gICAgICAgIGNvbnN0IHByZWFtYmxlUGF0aCA9IHBhdGguam9pbih2YXVsdFBhdGgsICdvYnNpZGlhbicsJ2RhdGEnLCAnRmlsZXMnLCAncHJlYW1ibGUuc3R5Jyk7XHJcbiAgICAgICAgc3R5Q29udGVudCA9IGdldFN0eUZpbGVDb250ZW50KHByZWFtYmxlUGF0aCk7XHJcbiAgICB9XHJcbiAgICBzdHlDb250ZW50PXN0eUNvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lPT4hbGluZS5tYXRjaCgvKGludHxmcmFjKS8pKS5qb2luKCdcXG4nKVxyXG5cclxuICAgIGNvbnN0IGFuZz1cIlxcXFx0aWt6c2V0e2FuZy8uc3R5bGUgMiBhcmdzPXtmaWxsPWJsYWNrITUwLG9wYWNpdHk9MC41LHRleHQgb3BhY2l0eT0wLjksZHJhdz1vcmFuZ2UsPC0+LGFuZ2xlIGVjY2VudHJpY2l0eT0jMSxhbmdsZSByYWRpdXM9IzJjbSx0ZXh0PW9yYW5nZSxmb250PVxcXFxsYXJnZX0sYW5nLy5kZWZhdWx0PXsxLjZ9ezAuNX19XCJcclxuICBcclxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXHJcbiAgXHJcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxyXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXHJcbiAgICBjb25zdCBzcHJpbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcc3ByaW5nfVs0XXtcXFxcdGlrem1hdGh7Y29vcmRpbmF0ZSBcXFxcc3RhcnQsIFxcXFxkb25lO1xcXFxzdGFydCA9ICgjMSk7XFxcXGRvbmUgPSAoIzIpO31cXFxcZHJhd1t0aGlja10gKCQoXFxcXHN0YXJ0KSArICgtMS41LDApJCkgLS0rKygzLDApO1xcXFxkcmF3IChcXFxcc3RhcnQpIC0tKyAoMCwtMC4yNWNtKTtcXFxcZHJhdyAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCswY20sXFxcXGRvbmV5KzAuMjVjbSkkKS0tKygwLC0wLjI1KTtcXFxcZHJhd1tkZWNvcmF0aW9uPXthc3BlY3Q9MC4zLCBzZWdtZW50IGxlbmd0aD0zLCBhbXBsaXR1ZGU9Mm1tLGNvaWwsfSxkZWNvcmF0ZV0gKFxcXFxzdGFydHgsXFxcXHN0YXJ0eS0wLjI1Y20pIC0tKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KzAuMjVjbSkkKW5vZGVbbWlkd2F5LHJpZ2h0PTAuMjVjbSxibGFja117IzR9O1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkpJCl7IzN9O31cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcclxuICAgIFxyXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcclxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcclxuICAgIGNvbnN0IG1hc3M9YFxcXFxkZWZcXFxcbWFzcyMxIzJ7XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgjMSl7IzJ9O31gXHJcbiAgICBjb25zdCBtYXNzU2V0PVwiXFxcXHRpa3pzZXR7IG1hc3MvLnN0eWxlPXtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2t9fVwiXHJcbiAgICBjb25zdCBkdmVjdG9yPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGR2ZWN0b3J9WzJde1xcXFxjb29yZGluYXRlICh0ZW1wMSkgYXQgKCQoMCwwIC18ICMxKSQpO1xcXFxjb29yZGluYXRlICh0ZW1wMikgYXQgKCQoMCwwIHwtICMxKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTAuN3B0LCMyXSAoIzEpLS0odGVtcDEpKCMxKS0tKHRlbXAyKTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgcGljQW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFuZ31bNV17XFxcXGNvb3JkaW5hdGUgKGFuZzEpIGF0ICgjMSk7IFxcXFxjb29yZGluYXRlIChhbmcyKSBhdCAoIzIpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMykgYXQgKCMzKTsgXFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzN9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMX17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0FCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHBhcnNle1xcXFxhbmdDQiAtIFxcXFxhbmdBQn1cXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdDwwcHRcXFxccGdmbWF0aHBhcnNle1xcXFxwZ2ZtYXRocmVzdWx0ICsgMzYwfVxcXFxmaVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PjE4MHB0XFxcXHBnZm1hdGhwYXJzZXszNjAgLSBcXFxccGdmbWF0aHJlc3VsdH1cXFxcZmlcXFxcbGV0XFxcXGFuZ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoc2V0bWFjcm97XFxcXGFuZ2xlQ2hlY2t9e2FicyhcXFxcYW5nQiAtIDkwKX1cXFxcaWZ0aGVuZWxzZXtcXFxcbGVuZ3RodGVzdHtcXFxcYW5nbGVDaGVjayBwdCA8IDAuMXB0fX17XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17cmlnaHQgYW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXthbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9fVwiXHJcbiAgICBjb25zdCBwcmVhbWJsZT1cIlxcXFx1c2VwYWNrYWdle3BnZnBsb3RzLGlmdGhlbn1cXFxcdXNldGlremxpYnJhcnl7YXJyb3dzLm1ldGEsYW5nbGVzLHF1b3Rlcyxwb3NpdGlvbmluZywgY2FsYywgaW50ZXJzZWN0aW9ucyxkZWNvcmF0aW9ucy5tYXJraW5ncyxtYXRoLHNweSxtYXRyaXgscGF0dGVybnMsc25ha2VzLGRlY29yYXRpb25zLnBhdGhyZXBsYWNpbmcsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcclxuICAgIFxyXG4gICAgcmV0dXJuIHByZWFtYmxlK3N0eUNvbnRlbnQrYW5nK21hcmsrYXJyK2xlbmUrc3ByaW5nK3RyZWUrdGFibGUrY29vcitkdmVjdG9yK3BpY0FuZyttYXNzU2V0K1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcclxufSJdfQ==