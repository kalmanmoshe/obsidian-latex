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
        return fs.readFileSync(filePath, 'utf8');
    }
    catch (error) {
        console.error('Error reading the .sty file:', error);
        return '';
    }
}
function getPreamble(app) {
    let styContent = '';
    const adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
        const vaultPath = adapter.getBasePath();
        const preamblePath = `${vaultPath}/data/Files/preamble.sty`;
        styContent = getStyFileContent(preamblePath);
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxnQkFBZ0I7QUFFaEIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDN0QsT0FBTyxFQUFvQixJQUFJLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBc0MsTUFBTSxZQUFZLENBQUM7QUFDMUcsT0FBTyxFQUErQixzQkFBc0IsRUFBRSxjQUFjLEVBQWlCLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRzFJLFNBQVMsMkJBQTJCLENBQUMsS0FBWTtJQUM3QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLFVBQWlCLEVBQUMsT0FBZ0I7SUFDdkQsTUFBTSxNQUFNLEdBQVksRUFBRSxDQUFDO0lBQzNCLElBQUksWUFBWSxHQUFVLEVBQUUsQ0FBQztJQUM3QixNQUFNLGNBQWMsR0FBQyxFQUFFLENBQUE7SUFFdkIsSUFBRyxPQUFPLEtBQUcsT0FBTyxFQUFDLENBQUM7UUFDbEIsTUFBTSxLQUFLLEdBQUMsMkJBQTJCLENBQUMsVUFBVSxDQUFDLENBQUE7UUFDbkQsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFDLEdBQUcsRUFBRSxjQUFjLEVBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsRUFBQyxDQUFD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QUFDLCtFQUErRSxDQUFBO0lBQzFGLE1BQU0sSUFBSSxHQUFDLG9GQUFvRixDQUFBO0lBQy9GLE1BQU0sT0FBTyxHQUFDLDBEQUEwRCxDQUFBO0lBQ3hFLE1BQU0sT0FBTyxHQUFDLHNLQUFzSyxDQUFBO0lBRXBMLE1BQU0sTUFBTSxHQUFDLDh2QkFBOHZCLENBQUE7SUFDM3dCLE1BQU0sUUFBUSxHQUFDLG1QQUFtUCxDQUFBO0lBRWxRLE9BQU8sUUFBUSxHQUFDLFVBQVUsR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsTUFBTSxHQUFDLElBQUksR0FBQyxLQUFLLEdBQUMsSUFBSSxHQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsT0FBTyxHQUFDLGlFQUFpRSxDQUFBO0FBQ2hLLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLy8vIEB0cy1ub2NoZWNrXHJcblxyXG5pbXBvcnQgeyBwcm9jZXNzVGlrelN0cmluZyB9IGZyb20gXCIuL0Jhc2ljTWF0aEpheFRva2VuR3JvdXBcIjtcclxuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgQ29vcmRpbmF0ZSwgRHJhdywgRm9ybWF0dGluZywgcmVnRXhwLCBUb2tlbiwgdG9Qb2ludCB9IGZyb20gXCIuLi90aWt6amF4XCI7XHJcbmltcG9ydCB7IGZpbmREZWVwZXN0UGFyZW50aGVzZXNTY29wZSwgZmluZE1vZGlmaWVkUGFyZW5JbmRleCwgZmluZFBhcmVuSW5kZXgsIGlkUGFyZW50aGVzZXMsIG1hcEJyYWNrZXRzIH0gZnJvbSBcInNyYy91dGlscy9QYXJlblV0ZW5zaWxzXCI7XHJcblxyXG5cclxuZnVuY3Rpb24gbGFiZWxGcmVlRm9ybVRleHRTZXBhcmF0aW9uKGxhYmVsOiBhbnlbXSl7XHJcbiAgICBjb25zdCBjb2xvbkluZGV4PWxhYmVsLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nQ29sb24nKVxyXG4gICAgIGxhYmVsPWxhYmVsLnNwbGljZShjb2xvbkluZGV4LGxhYmVsLmxlbmd0aC1jb2xvbkluZGV4KVxyXG4gICAgcmV0dXJuIGxhYmVsLnNwbGljZSgxKVxyXG59XHJcblxyXG5mdW5jdGlvbiBjbGVhbkZvcm1hdHRpbmcoZm9ybWF0dGluZzogYW55W10sc3ViVHlwZT86IHN0cmluZyk6IGFueVtdIHtcclxuICAgIGNvbnN0IHZhbHVlczogYW55W11bXSA9IFtdO1xyXG4gICAgbGV0IGN1cnJlbnRHcm91cDogYW55W10gPSBbXTtcclxuICAgIGNvbnN0IGZvcm1hdHRpbmdLZXlzPVtdXHJcblxyXG4gICAgaWYoc3ViVHlwZT09PSdMYWJlbCcpe1xyXG4gICAgICAgIGNvbnN0IGxhYmVsPWxhYmVsRnJlZUZvcm1UZXh0U2VwYXJhdGlvbihmb3JtYXR0aW5nKVxyXG4gICAgICAgIGZvcm1hdHRpbmdLZXlzLnB1c2goe2tleTogJ2ZyZWVGb3JtVGV4dCcsdmFsdWU6IGxhYmVsLnRvU3RyaW5nKCl9KVxyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgY29uc3QgYnJhY2tldE1hcD1tYXBCcmFja2V0cygnQ3VybHlfYnJhY2tldHNfb3BlbicsZm9ybWF0dGluZyk7XHJcbiAgICBicmFja2V0TWFwLnJldmVyc2UoKVxyXG4gICAgYnJhY2tldE1hcC5mb3JFYWNoKChicmFja2V0OiB7IG9wZW46IG51bWJlcjsgY2xvc2U6IG51bWJlcjsgfSkgPT4ge1xyXG4gICAgICAgIGlmKGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTFdLm5hbWU9PT0nRXF1YWxzJyl7XHJcbiAgICAgICAgICAgIGxldCBzdWJGb3JtYXR0aW5nPWZvcm1hdHRpbmcuc3BsaWNlKGJyYWNrZXQub3Blbi0xLGJyYWNrZXQuY2xvc2UtKGJyYWNrZXQub3Blbi0yKSlcclxuICAgICAgICAgICAgc3ViRm9ybWF0dGluZz1zdWJGb3JtYXR0aW5nLnNsaWNlKDIsLTEpXHJcbiAgICAgICAgICAgIGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLnZhbHVlPWNsZWFuRm9ybWF0dGluZyhzdWJGb3JtYXR0aW5nLGZvcm1hdHRpbmdbYnJhY2tldC5vcGVuLTJdLm5hbWUpXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGZvcm1hdHRpbmcpIHtcclxuICAgICAgICBpZiAoaXRlbS5uYW1lID09PSAnQ29tbWEnKSB7XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50R3JvdXAubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudEdyb3VwKTtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRHcm91cCA9IFtdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY3VycmVudEdyb3VwLnB1c2goaXRlbSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudEdyb3VwKTtcclxuICAgIH1cclxuXHJcbiAgICBcclxuICAgIHZhbHVlcy5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xyXG4gICAgICAgIGZvcm1hdHRpbmdLZXlzLnB1c2goYXNzaWduRm9ybWF0dGluZyh2YWx1ZSkpO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gZm9ybWF0dGluZ0tleXMgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFzc2lnbkZvcm1hdHRpbmcoZm9ybWF0dGluZzogYW55W10pOiBhbnl7XHJcblxyXG4gICAgY29uc3QgaXNFcXVhbHM9Zm9ybWF0dGluZy5tYXAoKGYsaWR4KT0+Zi5uYW1lPT09J0VxdWFscyc/aWR4Om51bGwpLmZpbHRlcih0PT50IT09bnVsbCk7XHJcbiAgICBjb25zdCBrZXk9Zm9ybWF0dGluZ1swXT8ubmFtZVxyXG5cclxuICAgIGlmKGlzRXF1YWxzLmxlbmd0aD09PTEpXHJcbiAgICAgICAgZm9ybWF0dGluZz1mb3JtYXR0aW5nLnNsaWNlKChpc0VxdWFsc1swXSsxKSlcclxuXHJcbiAgICBsZXQgdmFsdWU9aW50ZXJwcmV0Rm9ybWF0dGluZ1ZhbHVlKGZvcm1hdHRpbmcpO1xyXG4gICAgcmV0dXJuIHtrZXksdmFsdWV9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBpbnRlcnByZXRGb3JtYXR0aW5nVmFsdWUoZm9ybWF0dGluZzogc3RyaW5nIHwgYW55W10pe1xyXG4gICAgaWYgKGZvcm1hdHRpbmcubGVuZ3RoPT09MSl7XHJcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRpbmdbMF0udmFsdWV8fHRydWVcclxuICAgIH1cclxuICAgIHJldHVybiBmb3JtYXR0aW5nXHJcbn1cclxuXHJcbmNsYXNzIFRpa3pDb21tYW5ke1xyXG4gICAgdHJpZ2dlcjogc3RyaW5nO1xyXG4gICAgaG9va051bTogbnVtYmVyO1xyXG4gICAgaG9va3M6IGFueTtcclxuICAgIGNvbnRlbnQ6IEJhc2ljVGlrelRva2VuW11cclxuICAgIGFkZENvbW1hbmQodHJpZ2dlcjogc3RyaW5nLCBob29rTnVtOiBudW1iZXIsIGNvbnRlbnQ6IGFueVtdKXtcclxuICAgICAgICB0aGlzLnRyaWdnZXI9dHJpZ2dlcjtcclxuICAgICAgICB0aGlzLmhvb2tOdW09aG9va051bTtcclxuICAgICAgICB0aGlzLmNvbnRlbnQ9Y29udGVudDtcclxuICAgICAgICB0aGlzLmZpbmRIb29rcygpXHJcbiAgICAgICAgcmV0dXJuIHRoaXNcclxuICAgIH1cclxuICAgIGZpbmRIb29rcygpe1xyXG4gICAgICAgIGNvbnN0IGhhc2h0YWdNYXA9dGhpcy5jb250ZW50Lm1hcCgoaXRlbSxpbmRleCk9Pml0ZW0uZ2V0U3RyaW5nVmFsdWUoKT09PSdIYXNodGFnJyYmdGhpcy5jb250ZW50W2luZGV4KzFdLmdldFR5cGUoKT09PSdudW1iZXInP2luZGV4Om51bGwpXHJcbiAgICAgICAgLmZpbHRlcih0PT50IT09bnVsbClcclxuICAgICAgICBpZihoYXNodGFnTWFwLmxlbmd0aCE9PXRoaXMuaG9va051bSl7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRGlzY3JlcGFuY3kgYmV0d2VlbiB0aGUgbnVtYmVyIG9mIGhvb2tzIGRlY2xhcmVkIGFuZCB0aGUgbnVtYmVyIG9mIGhvb2tzIGZvdW5kIGluIHRoZSBjb21tYW5kIGhvb2tOdW06ICR7dGhpcy5ob29rTnVtfSBoYXNodGFnTWFwLmxlbmd0aDogJHtoYXNodGFnTWFwLmxlbmd0aH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaGFzaHRhZ01hcC5zb3J0KChhLGIpPT5iLWEpLypcclxuICAgICAgICBoYXNodGFnTWFwLmZvckVhY2goaWR4ID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaGFzaHRhZz10aGlzLmNvbnRlbnRbaWR4XTtcclxuICAgICAgICAgICAgaGFzaHRhZy50eXBlPSdTeW50YXgnXHJcbiAgICAgICAgICAgIGhhc2h0YWcubmFtZT0naG9vaydcclxuICAgICAgICAgICAgaGFzaHRhZy52YWx1ZT10aGlzLmNvbnRlbnRbaWR4KzFdPy52YWx1ZTtcclxuICAgICAgICAgICAgdGhpcy5jb250ZW50LnNwbGljZShpZHgrMSwxKVxyXG4gICAgICAgIH0pOyovXHJcbiAgICB9XHJcbiAgICBnZXRJbmZvKCl7XHJcbiAgICAgICAgcmV0dXJuIHt0cmlnZ2VyOiB0aGlzLnRyaWdnZXIsaG9va3M6IHRoaXMuaG9va051bX1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgVGlrekNvbW1hbmRze1xyXG4gICAgY29tbWFuZHM6IFRpa3pDb21tYW5kW109W107XHJcbiAgICBjb25zdHJ1Y3Rvcigpe307XHJcbiAgICBhZGRDb21tYW5kKHRva2VuczogYW55KXtcclxuICAgICAgICBcclxuICAgIH1cclxuICAgIGFkZENvbW1hbmRCeUludGVycHJldGF0aW9uKHRva2VuczogYW55W10pIHtcclxuICAgICAgICBjb25zb2xlLmxvZygndG9rZW5zJyx0b2tlbnMpXHJcbiAgICAgICAgY29uc3QgaWQxVG9rZW4gPSB0b2tlbnMuZmluZCgoaXRlbSkgPT4gaXRlbS5uYW1lID09PSAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xyXG4gICAgICAgIGlmICghaWQxVG9rZW4pIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOiAnQ3VybHlfYnJhY2tldHNfb3Blbicgbm90IGZvdW5kIGluIHRva2Vucy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IGlkMSA9IGlkMVRva2VuLnZhbHVlO1xyXG4gICAgICAgIGNvbnN0IGlkMiA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoaWQxLCB0b2tlbnMsIDAsIDEpO1xyXG4gICAgICAgIGNvbnN0IGlkMyA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoaWQxLCB0b2tlbnMsIDAsIDEsICdDdXJseV9icmFja2V0c19vcGVuJyk7XHJcbiAgICBcclxuICAgICAgICBpZiAoIWlkMiB8fCAhaWQzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjogVW5hYmxlIHRvIGZpbmQgbWF0Y2hpbmcgYnJhY2tldHMuXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlkMT1maW5kUGFyZW5JbmRleChpZDEsIHRva2VucylcclxuICAgICAgICBsZXQgdHJpZ2dlciwgaG9va3MsIGNvbnRlbnQ7XHJcbiAgICAgICAgY29udGVudCA9IHRva2Vucy5zcGxpY2UoaWQzLm9wZW4gKyAxLCBpZDMuY2xvc2UgLSBpZDMub3BlbiAtIDEpO1xyXG4gICAgICAgIGhvb2tzID0gdG9rZW5zLnNwbGljZShpZDIub3BlbiArIDEsIGlkMi5jbG9zZSAtIGlkMi5vcGVuIC0gMSk7XHJcbiAgICAgICAgdHJpZ2dlciA9IHRva2Vucy5zcGxpY2UoaWQxLm9wZW4rMSwgaWQxLmNsb3NlIC0gaWQxLm9wZW4gLSAxKTtcclxuXHJcbiAgICAgICAgaWYgKGhvb2tzLmxlbmd0aCA9PT0gMSAmJiBob29rc1swXT8udHlwZSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgaG9va3MgPSBob29rc1swXS52YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGhvb2tzOiBFeHBlY3RlZCBhIHNpbmdsZSBudW1lcmljIHZhbHVlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRyaWdnZXIubGVuZ3RoID09PSAxICYmIHRyaWdnZXJbMF0/LnR5cGUgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIHRyaWdnZXIgPSB0cmlnZ2VyWzBdLnZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgdHJpZ2dlcjogRXhwZWN0ZWQgYSBzaW5nbGUgc3RyaW5nIHZhbHVlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jb21tYW5kcy5wdXNoKG5ldyBUaWt6Q29tbWFuZCgpLmFkZENvbW1hbmQodHJpZ2dlciwgaG9va3MsIGNvbnRlbnQpKVxyXG4gICAgfVxyXG5cclxuICAgIHJlcGxhY2VDYWxsV2l0aENvbW1hbmQodHJpZ2dlcjogc3RyaW5nLGhvb2tOdW1iZXI6IG51bWJlcixob29rczogYW55W10pe1xyXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLmNvbW1hbmRzLmZpbmQoY29tbWFuZCA9PiBcclxuICAgICAgICAgICAgY29tbWFuZC50cmlnZ2VyID09PSB0cmlnZ2VyICYmIGhvb2tOdW1iZXIgPT09IGNvbW1hbmQuaG9va051bVxyXG4gICAgICAgICk/LmNvbnRlbnQ7XHJcbiAgICAgICAgaWYoIWNvbnRlbnQpcmV0dXJuIG51bGw7XHJcbiAgICAgICAgY29uc3QgbWFwID0gY29udGVudD8ubWFwKChpdGVtLCBpbmRleCkgPT4gXHJcbiAgICAgICAgICAgIGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSA9PT0gJ2hvb2snID8geyBpbmRleCwgdmFsdWU6IGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSB9IDogbnVsbFxyXG4gICAgICAgICkuZmlsdGVyKHQgPT4gdCAhPT0gbnVsbCk7XHJcbiAgICAgICAgbWFwPy5yZXZlcnNlKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHVuaXF1ZVZhbHVlcyA9IG5ldyBTZXQoKTsvKlJlbW92ZSB0aGlzIGRpc2sgZm9yIHRoZSBlcnJcclxuICAgICAgICBmb3IgKGNvbnN0IHsgaW5kZXgsIHZhbHVlIH0gb2YgbWFwIHx8IFtdKSB7XHJcbiAgICAgICAgICAgIGlmICghdW5pcXVlVmFsdWVzLmhhcyh2YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgIHVuaXF1ZVZhbHVlcy5hZGQodmFsdWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnRlbnQuc3BsaWNlKGluZGV4LCAxLCAuLi5ob29rc1t2YWx1ZS0xXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb250ZW50Ki9cclxuICAgIH1cclxuXHJcbiAgICBnZXRIb29rcyh0b2tlbnM6IGFueVtdLGlkczogYW55W10pe1xyXG4gICAgICAgIHRva2Vucy5zcGxpY2UoMCwxKVxyXG4gICAgICAgIGNvbnN0IGFkanVzdG1lbnRWYWx1ZT1pZHNbMF0ub3BlblxyXG4gICAgICAgIGlkcy5mb3JFYWNoKGlkID0+IHtcclxuICAgICAgICAgICAgaWQub3Blbi09YWRqdXN0bWVudFZhbHVlO1xyXG4gICAgICAgICAgICBpZC5jbG9zZS09YWRqdXN0bWVudFZhbHVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlkcy5yZXZlcnNlKCk7XHJcbiAgICAgICAgY29uc3QgaG9va3M6IGFueVtdW109W11cclxuICAgICAgICBpZHMuZm9yRWFjaChpZCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQ9dG9rZW5zLnNwbGljZShpZC5vcGVuKzEsaWQuY2xvc2UtKGlkLm9wZW4rMSkpXHJcbiAgICAgICAgICAgIGhvb2tzLnB1c2gocmVtb3ZlZClcclxuICAgICAgICB9KTtcclxuICAgICAgICBob29rcy5yZXZlcnNlKCk7XHJcbiAgICAgICAgcmV0dXJuIGhvb2tzXHJcbiAgICB9XHJcbiAgICBcclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBUaWt6VmFyaWFibGV7XHJcbiAgICAvL3R5cGU6IFxyXG5cclxufVxyXG5leHBvcnQgY2xhc3MgVGlrelZhcmlhYmxlc3tcclxuICAgIHZhcmlhYmxlczogW109W11cclxuXHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgRm9ybWF0VGlrempheCB7XHJcblx0c291cmNlOiBzdHJpbmc7XHJcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcclxuICAgIHRpa3pDb21tYW5kczogVGlrekNvbW1hbmRzPW5ldyBUaWt6Q29tbWFuZHMoKTtcclxuICAgIC8vbWlkUG9pbnQ6IEF4aXM7XHJcbiAgICBwcml2YXRlIHZpZXdBbmNob3JzOiB7bWF4OiBBeGlzLG1pbjpBeGlzLGF2ZU1pZFBvaW50OiBBeGlzfVxyXG5cdHByb2Nlc3NlZENvZGU9XCJcIjtcclxuICAgIGRlYnVnSW5mbyA9IFwiXCI7XHJcbiAgICBcclxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZyx0b0V2YWw/OiBib29sZWFuKSB7XHJcbiAgICAgICAgaWYodG9FdmFsKXtcclxuICAgICAgICAgICAgY29uc29sZS5sb2cocHJvY2Vzc1Rpa3pTdHJpbmcoc291cmNlKSlcclxuICAgICAgICB9XHJcbiAgICAgICAgLypcclxuICAgICAgICBpZighc291cmNlLm1hdGNoKC8odXNlcGFja2FnZXx1c2V0aWt6bGlicmFyeSkvKSl7XHJcbiAgICAgICAgICAgIGNvbnN0IGJhc2ljVGlrelRva2Vucz1uZXcgQmFzaWNUaWt6VG9rZW5zKHNvdXJjZSlcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ2Jhc2ljVGlrelRva2VucycsYmFzaWNUaWt6VG9rZW5zKVxyXG4gICAgICAgICAgICB0aGlzLnRva2VuaXplKGJhc2ljVGlrelRva2Vucy5nZXRUb2tlbnMoKSlcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ3Rva2VuaXplJyx0aGlzLnRva2VucylcclxuICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlICs9IHRoaXMudG9TdHJpbmcoKVxyXG5cclxuICAgICAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPUpTT04uc3RyaW5naWZ5KHRoaXMudG9rZW5zLG51bGwsMSkrXCJcXG5cXG5cIlxyXG4gICAgICAgIH0qL1xyXG4gICAgICAgIGVsc2Uge3RoaXMucHJvY2Vzc2VkQ29kZT1zb3VyY2U7fVxyXG4gICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZT10aGlzLnRpZHlUaWt6U291cmNlKHNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcclxuXHR9XHJcbiAgICB0aWR5VGlrelNvdXJjZShzb3VyY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XHJcbiAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSBzb3VyY2Uuc3BsaXQoXCJcXG5cIik7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcclxuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJykucmVwbGFjZSgvKD88PVteXFx3XSkgfCAoPz1bXlxcd10pL2csIFwiXCIpLnJlcGxhY2UoLyg/PCFcXFxcKSUuKiQvZ20sIFwiXCIpLnJlcGxhY2UoL1xcbi9nLFwiXCIpO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUoYmFzaWNUaWt6VG9rZW5zOiBhbnlbXSl7XHJcbiAgICAgICAgbGV0IGVuZEluZGV4XHJcbiAgICAgICAgZm9yKGxldCBpPTA7aTxiYXNpY1Rpa3pUb2tlbnMubGVuZ3RoO2krKyl7XHJcbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdEcmF3Jyl7XHJcbiAgICAgICAgICAgICAgICBlbmRJbmRleD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSkuZmluZEluZGV4KHQ9PnQubmFtZT09PSdTZW1pY29sb24nKStpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzZWdtZW50PWJhc2ljVGlrelRva2Vucy5zbGljZShpKzEsZW5kSW5kZXgpXHJcbiAgICAgICAgICAgICAgICBpPWVuZEluZGV4XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KCdkcmF3JykuZmlsbENvb3JkaW5hdGVzKHNlZ21lbnQpKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdDb29yZGluYXRlJyl7XHJcbiAgICAgICAgICAgICAgICBlbmRJbmRleD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSkuZmluZEluZGV4KHQ9PnQubmFtZT09PSdTZW1pY29sb24nKStpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzZWdtZW50PWJhc2ljVGlrelRva2Vucy5zbGljZShpKzEsZW5kSW5kZXgpXHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzZWdtZW50KVxyXG4gICAgICAgICAgICAgICAgaT1lbmRJbmRleFxyXG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSgnY29vcmRpbmF0ZScpLmludGVycHJldENvb3JkaW5hdGUoc2VnbWVudCkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLypcclxuICAgICAgICBUaGV5J3JlIGdvaW5nIHRvIGJlIHRocmVlIHR5cGVzIHN0cmluZ2VkIHN5bnRheCBudW1iZXIuXHJcbiAgICAgICAgIEkgdXNlIHRoZW0gdG8gdG9rZW5pemUuIHVzaW5nIHRoZSB0aWNrcyBjb21tYW5kcy4gT25jZSB0b2tlbml6ZXIgdGFrZXMgY29tbWFuZHMuXHJcbiAgICAgICAgIEkgbW92ZSBvbiB0byBhY3R1YWwgZXZhbHVhdGlvbi5cclxuICAgICAgICAqL1xyXG5cclxuICAgICAgICBcclxuICAgICAgICBsZXQgc3ViZGVmaW5lZFRva2Vucz1bXTtcclxuICAgICAgICAvKlxyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPGJhc2ljVGlrelRva2Vucy5sZW5ndGg7aSsrKXtcclxuXHJcbiAgICAgICAgfSovXHJcbiAgICB9XHJcblxyXG4gICAgZ2V0Q29kZShhcHA6IEFwcCl7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnNvdXJjZT09PVwic3RyaW5nXCImJnRoaXMuc291cmNlLm1hdGNoKC8odXNlcGFja2FnZXx1c2V0aWt6bGlicmFyeSkvKSl7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2Nlc3NlZENvZGVcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKGFwcCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhcHBseVBvc3RQcm9jZXNzaW5nKCl7XHJcbiAgICAgICAgY29uc3QgZmxhdEF4ZXM9ZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgICAgIGZsYXRBeGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcclxuICAgICAgICAgICAgYXhpcy5hZGRRdWFkcmFudCh0aGlzLnZpZXdBbmNob3JzLmF2ZU1pZFBvaW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgZmxhdERyYXc9ZmxhdHRlbih0aGlzLnRva2VucyxbXSxEcmF3KS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgRHJhdyk7XHJcbiAgICAgICAgZmxhdERyYXcuZm9yRWFjaCgoZHJhdzogRHJhdykgPT4ge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0ICBbaW5kZXgsIGNvb3JdIG9mIGRyYXcuY29vcmRpbmF0ZXMuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoY29vciBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb29yLmZvcm1hdHRpbmc/LmFkZFNwbG9wQW5kUG9zaXRpb24oZHJhdy5jb29yZGluYXRlcyxpbmRleClcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgZmluZFZpZXdBbmNob3JzKCkge1xyXG4gICAgICAgIGNvbnN0IGF4ZXMgPSBmbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSkgPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBzdW1PZlggPSAwLCBzdW1PZlkgPSAwO1xyXG4gICAgICAgIGxldCBtYXhYID0gLUluZmluaXR5LCBtYXhZID0gLUluZmluaXR5O1xyXG4gICAgICAgIGxldCBtaW5YID0gSW5maW5pdHksIG1pblkgPSBJbmZpbml0eTtcclxuICAgIFxyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMgPSB7XHJcbiAgICAgICAgICAgIG1heDogbmV3IEF4aXMoMCwgMCksXHJcbiAgICAgICAgICAgIG1pbjogbmV3IEF4aXMoMCwgMCksXHJcbiAgICAgICAgICAgIGF2ZU1pZFBvaW50OiBuZXcgQXhpcygwLCAwKVxyXG4gICAgICAgIH07XHJcbiAgICBcclxuICAgICAgICBheGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeyBjYXJ0ZXNpYW5YLCBjYXJ0ZXNpYW5ZIH0gPSBheGlzO1xyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBzdW1zIGZvciBhdmVyYWdlIGNhbGN1bGF0aW9uXHJcbiAgICAgICAgICAgIHN1bU9mWCArPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBzdW1PZlkgKz0gY2FydGVzaWFuWTtcclxuICAgIFxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgbWF4IGFuZCBtaW4gY29vcmRpbmF0ZXNcclxuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblggPiBtYXhYKSBtYXhYID0gY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPiBtYXhZKSBtYXhZID0gY2FydGVzaWFuWTtcclxuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblggPCBtaW5YKSBtaW5YID0gY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPCBtaW5ZKSBtaW5ZID0gY2FydGVzaWFuWTtcclxuICAgICAgICB9KTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGxlbmd0aCA9IGF4ZXMubGVuZ3RoICE9PSAwID8gYXhlcy5sZW5ndGggOiAxO1xyXG4gICAgXHJcbiAgICAgICAgLy8gU2V0IHRoZSB2aWV3QW5jaG9yc1xyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQgPSBuZXcgQXhpcyhzdW1PZlggLyBsZW5ndGgsIHN1bU9mWSAvIGxlbmd0aCk7XHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5tYXggPSBuZXcgQXhpcyhtYXhYLCBtYXhZKTtcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLm1pbiA9IG5ldyBBeGlzKG1pblgsIG1pblkpO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgZmluZE9yaWdpbmFsVmFsdWUodmFsdWU6IHN0cmluZykge1xyXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7LypcclxuICAgICAgICBjb25zdCBvZyA9IHRoaXMudG9rZW5zLnNsaWNlKCkucmV2ZXJzZSgpLmZpbmQoXHJcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XHJcbiAgICAgICAgICAgICAgICAodG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKSAmJiB0b2tlbi5jb29yZGluYXRlTmFtZSA9PT0gdmFsdWVcclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkOyovXHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIGxldCBjb2RlQmxvY2tPdXRwdXQgPSBcIlwiO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCd0aGlzLnRva2VucycsdGhpcy50b2tlbnMpXHJcbiAgICAgICAgLy9jb25zdCBleHRyZW1lWFk9Z2V0RXh0cmVtZVhZKHRoaXMudG9rZW5zKTtcclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKHRva2VuLnRvU3RyaW5nKCkpe1xyXG4gICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9dG9rZW4udG9TdHJpbmcoKVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gdG9rZW47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGNvZGVCbG9ja091dHB1dDtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGZsYXR0ZW4oZGF0YTogYW55LCByZXN1bHRzOiBhbnlbXSA9IFtdLCBzdG9wQ2xhc3M/OiBhbnkpOiBhbnlbXSB7XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xyXG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xyXG4gICAgICAgIGZsYXR0ZW4oaXRlbSwgcmVzdWx0cywgc3RvcENsYXNzKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgZGF0YSAhPT0gbnVsbCkge1xyXG4gICAgICAvLyBJZiB0aGUgb2JqZWN0IGlzIGFuIGluc3RhbmNlIG9mIHRoZSBzdG9wQ2xhc3MsIGFkZCBpdCB0byByZXN1bHRzIGFuZCBzdG9wIGZsYXR0ZW5pbmdcclxuICAgICAgaWYgKHN0b3BDbGFzcyAmJiBkYXRhIGluc3RhbmNlb2Ygc3RvcENsYXNzKSB7XHJcbiAgICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHRzO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIC8vIEFkZCB0aGUgY3VycmVudCBvYmplY3QgdG8gcmVzdWx0c1xyXG4gICAgICByZXN1bHRzLnB1c2goZGF0YSk7XHJcbiAgXHJcbiAgICAgIC8vIFJlY3Vyc2l2ZWx5IGZsYXR0ZW4gcHJvcGVydGllcyBvZiB0aGUgb2JqZWN0XHJcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIGRhdGEpIHtcclxuICAgICAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcbiAgICAgICAgICBmbGF0dGVuKGRhdGFba2V5XSwgcmVzdWx0cywgc3RvcENsYXNzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHRzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRFeHRyZW1lWFkodG9rZW5zOiBhbnkpIHtcclxuICAgIGxldCBtYXhYID0gLUluZmluaXR5O1xyXG4gICAgbGV0IG1heFkgPSAtSW5maW5pdHk7XHJcbiAgICBsZXQgbWluWCA9IEluZmluaXR5O1xyXG4gICAgbGV0IG1pblkgPSBJbmZpbml0eTtcclxuICAgIFxyXG4gICAgdG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcclxuICAgICAgICBpZiAodG9rZW4uWCA+IG1heFgpIG1heFggPSB0b2tlbi5YO1xyXG4gICAgICAgIGlmICh0b2tlbi5YIDwgbWluWCkgbWluWCA9IHRva2VuLlg7XHJcbiAgICBcclxuICAgICAgICBpZiAodG9rZW4uWSA+IG1heFkpIG1heFkgPSB0b2tlbi5ZO1xyXG4gICAgICAgIGlmICh0b2tlbi5ZIDwgbWluWSkgbWluWSA9IHRva2VuLlk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgbWF4WCxtYXhZLG1pblgsbWluWSxcclxuICAgIH07XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCB7IEJhc2ljVGlrelRva2VuIH0gZnJvbSBcInNyYy9iYXNpY1Rva2VuXCI7XHJcbmltcG9ydCB7IEFwcCwgRmlsZVN5c3RlbUFkYXB0ZXIgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuXHJcbmZ1bmN0aW9uIGdldFN0eUZpbGVDb250ZW50KGZpbGVQYXRoOiBmcy5QYXRoT3JGaWxlRGVzY3JpcHRvcikge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICByZXR1cm4gZnMucmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmOCcpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZWFkaW5nIHRoZSAuc3R5IGZpbGU6JywgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybiAnJztcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0UHJlYW1ibGUoYXBwOiBBcHApOnN0cmluZ3tcclxuICAgIFxyXG4gICAgbGV0IHN0eUNvbnRlbnQgPSAnJ1xyXG4gICAgY29uc3QgYWRhcHRlciA9IGFwcC52YXVsdC5hZGFwdGVyO1xyXG4gICAgaWYgKGFkYXB0ZXIgaW5zdGFuY2VvZiBGaWxlU3lzdGVtQWRhcHRlcikge1xyXG4gICAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IGFkYXB0ZXIuZ2V0QmFzZVBhdGgoKTtcclxuICAgICAgICBjb25zdCBwcmVhbWJsZVBhdGggPSBgJHt2YXVsdFBhdGh9L2RhdGEvRmlsZXMvcHJlYW1ibGUuc3R5YDtcclxuICAgICAgICBzdHlDb250ZW50ID0gZ2V0U3R5RmlsZUNvbnRlbnQocHJlYW1ibGVQYXRoKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBhbmc9XCJcXFxcdGlrenNldHthbmcvLnN0eWxlIDIgYXJncz17ZmlsbD1ibGFjayE1MCxvcGFjaXR5PTAuNSx0ZXh0IG9wYWNpdHk9MC45LGRyYXc9b3JhbmdlLDwtPixhbmdsZSBlY2NlbnRyaWNpdHk9IzEsYW5nbGUgcmFkaXVzPSMyY20sdGV4dD1vcmFuZ2UsZm9udD1cXFxcbGFyZ2V9LGFuZy8uZGVmYXVsdD17MS42fXswLjV9fVwiXHJcbiAgXHJcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxyXG4gIFxyXG4gICAgY29uc3QgYXJyPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFycn1bOF17XFxcXGNvb3JkaW5hdGUgKDIpIGF0ICgkKCMyKSEjNyEoIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDEpIGF0ICgkKDIpISM1bW0hOTA6KCMzKSQpO1xcXFxjb29yZGluYXRlICgzKSBhdCAoJCgyKSEjNW1tKyM0Y20hIzg6KCMzKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTFwdCw8LV0gKDEpLS0oMylub2RlIFtwb3M9IzZdIHtcXFxcbGFyZ2UgIzF9O31cIiBcclxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxyXG4gICAgY29uc3Qgc3ByaW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXHNwcmluZ31bNF17XFxcXHRpa3ptYXRoe2Nvb3JkaW5hdGUgXFxcXHN0YXJ0LCBcXFxcZG9uZTtcXFxcc3RhcnQgPSAoIzEpO1xcXFxkb25lID0gKCMyKTt9XFxcXGRyYXdbdGhpY2tdICgkKFxcXFxzdGFydCkgKyAoLTEuNSwwKSQpIC0tKysoMywwKTtcXFxcZHJhdyAoXFxcXHN0YXJ0KSAtLSsgKDAsLTAuMjVjbSk7XFxcXGRyYXcgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgrMGNtLFxcXFxkb25leSswLjI1Y20pJCktLSsoMCwtMC4yNSk7XFxcXGRyYXdbZGVjb3JhdGlvbj17YXNwZWN0PTAuMywgc2VnbWVudCBsZW5ndGg9MywgYW1wbGl0dWRlPTJtbSxjb2lsLH0sZGVjb3JhdGVdIChcXFxcc3RhcnR4LFxcXFxzdGFydHktMC4yNWNtKSAtLSgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSswLjI1Y20pJClub2RlW21pZHdheSxyaWdodD0wLjI1Y20sYmxhY2tdeyM0fTtcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KSQpeyMzfTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHRhYmxlPVwiXFxcXHRpa3pzZXR7IHRhYmxlLy5zdHlsZT17bWF0cml4IG9mIG5vZGVzLHJvdyBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsY29sdW1uIHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxub2Rlcz17cmVjdGFuZ2xlLGRyYXc9YmxhY2ssYWxpZ249Y2VudGVyfSxtaW5pbXVtIGhlaWdodD0xLjVlbSx0ZXh0IGRlcHRoPTAuNWV4LHRleHQgaGVpZ2h0PTJleCxub2RlcyBpbiBlbXB0eSBjZWxscyxldmVyeSBldmVuIHJvdy8uc3R5bGU9e25vZGVzPXtmaWxsPWdyYXkhNjAsdGV4dD1ibGFjayx9fSxjb2x1bW4gMS8uc3R5bGU9e25vZGVzPXt0ZXh0IHdpZHRoPTVlbSxmb250PVxcXFxiZnNlcmllc319LHJvdyAxLy5zdHlsZT17bm9kZXM9e2ZvbnQ9XFxcXGJmc2VyaWVzfX19fVwiXHJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXHJcbiAgICBjb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxyXG4gICAgY29uc3QgbWFzc1NldD1cIlxcXFx0aWt6c2V0eyBtYXNzLy5zdHlsZT17ZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrfX1cIlxyXG4gICAgY29uc3QgZHZlY3Rvcj1cIlxcXFxuZXdjb21tYW5ke1xcXFxkdmVjdG9yfVsyXXtcXFxcY29vcmRpbmF0ZSAodGVtcDEpIGF0ICgkKDAsMCAtfCAjMSkkKTtcXFxcY29vcmRpbmF0ZSAodGVtcDIpIGF0ICgkKDAsMCB8LSAjMSkkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0wLjdwdCwjMl0gKCMxKS0tKHRlbXAxKSgjMSktLSh0ZW1wMik7fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHBpY0FuZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxhbmd9WzVde1xcXFxjb29yZGluYXRlIChhbmcxKSBhdCAoIzEpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMikgYXQgKCMyKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzMpIGF0ICgjMyk7IFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmczfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0NCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzF9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdBQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhwYXJzZXtcXFxcYW5nQ0IgLSBcXFxcYW5nQUJ9XFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ8MHB0XFxcXHBnZm1hdGhwYXJzZXtcXFxccGdmbWF0aHJlc3VsdCArIDM2MH1cXFxcZmlcXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdD4xODBwdFxcXFxwZ2ZtYXRocGFyc2V7MzYwIC0gXFxcXHBnZm1hdGhyZXN1bHR9XFxcXGZpXFxcXGxldFxcXFxhbmdCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHNldG1hY3Jve1xcXFxhbmdsZUNoZWNrfXthYnMoXFxcXGFuZ0IgLSA5MCl9XFxcXGlmdGhlbmVsc2V7XFxcXGxlbmd0aHRlc3R7XFxcXGFuZ2xlQ2hlY2sgcHQgPCAwLjFwdH19e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde3JpZ2h0IGFuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O317XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17YW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fX1cIlxyXG4gICAgY29uc3QgcHJlYW1ibGU9XCJcXFxcdXNlcGFja2FnZXtwZ2ZwbG90cyxpZnRoZW59XFxcXHVzZXRpa3psaWJyYXJ5e2Fycm93cy5tZXRhLGFuZ2xlcyxxdW90ZXMscG9zaXRpb25pbmcsIGNhbGMsIGludGVyc2VjdGlvbnMsZGVjb3JhdGlvbnMubWFya2luZ3MsbWF0aCxzcHksbWF0cml4LHBhdHRlcm5zLHNuYWtlcyxkZWNvcmF0aW9ucy5wYXRocmVwbGFjaW5nLGRlY29yYXRpb25zLnBhdGhtb3JwaGluZyxwYXR0ZXJucyxzaGFkb3dzLHNoYXBlcy5zeW1ib2xzfVwiXHJcbiAgICBcclxuICAgIHJldHVybiBwcmVhbWJsZStzdHlDb250ZW50K2FuZyttYXJrK2FycitsZW5lK3NwcmluZyt0cmVlK3RhYmxlK2Nvb3IrZHZlY3RvcitwaWNBbmcrbWFzc1NldCtcIlxcXFxwZ2ZwbG90c3NldHtjb21wYXQ9MS4xNn1cXFxcYmVnaW57ZG9jdW1lbnR9XFxcXGJlZ2lue3Rpa3pwaWN0dXJlfVwiXHJcbn0iXX0=