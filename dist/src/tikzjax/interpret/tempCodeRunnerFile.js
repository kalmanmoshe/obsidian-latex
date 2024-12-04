// @ts-nocheck
import { findConsecutiveSequences } from "src/mathEngine";
import { arrToRegexString, Axis, Coordinate, Draw, Formatting, toPoint } from "../tikzjax";
import { getAllTikzReferences, searchTizkCommands } from "src/tikzjax/tikzCommands";
import { idParentheses, mapBrackets } from "src/utils/tokenUtensils";
class BasicTikzToken {
    type;
    name;
    value;
    constructor(value) {
        if (typeof value === 'number') {
            this.type = 'number';
            this.value = value;
        }
        else {
            this.type = value.type.replace(/Bracket/, 'Syntax');
            this.name = value.name;
        }
    }
}
export class FormatTikzjax {
    source;
    tokens = [];
    //midPoint: Axis;
    viewAnchors;
    processedCode = "";
    debugInfo = "";
    constructor(source) {
        if (typeof source === "string") {
            this.source = this.tidyTikzSource(source);
            const basicArray = this.basicArrayify();
            let basicTikzTokens = this.basicTikzTokenify(basicArray);
            const a = this.prepareForSubdefy(basicTikzTokens);
            this.subdefy(a);
            console.log(a);
        }
        else {
            this.tokens = source;
        }
        if (typeof source === "string" && source.match(/(usepackage|usetikzlibrary)/)) {
            this.processedCode = source;
        }
        else { /*
            this.debugInfo+=this.source;
            this.findViewAnchors();
            this.applyPostProcessing();

            this.debugInfo+="\n\nthis.midPoint:\n"+JSON.stringify(this.viewAnchors,null,1)+"\n"
            this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"

            this.processedCode += this.toString();
            this.debugInfo+=this.processedCode;*/
        }
    }
    basicArrayify() {
        const basicArray = [];
        const operatorsRegex = new RegExp('^' + arrToRegexString(getAllTikzReferences()));
        let i = 0;
        while (i < this.source.length) {
            const subSource = this.source.slice(i);
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
            // Increment index if no match found
            i++;
        }
        return basicArray;
    }
    basicTikzTokenify(basicArray) {
        let basicTikzTokens = [];
        // Process tokens
        basicArray.forEach(({ type, value }) => {
            if (type === 'string') {
                const tikzCommand = searchTizkCommands(value);
                if (tikzCommand) {
                    basicTikzTokens.push(new BasicTikzToken(tikzCommand));
                }
            }
            else if (type === 'number') {
                basicTikzTokens.push(new BasicTikzToken(value));
            }
        });
        idParentheses(basicTikzTokens);
        return basicTikzTokens;
    }
    prepareForSubdefy(basicTikzTokens) {
        const unitIndices = basicTikzTokens
            .map((token, idx) => (token.type === 'Unit' ? idx : null))
            .filter((idx) => idx !== null);
        unitIndices.forEach((unitIdx) => {
            const prevToken = basicTikzTokens[unitIdx - 1];
            if (!prevToken || prevToken.type !== 'number') {
                throw new Error(`Units can only be used in reference to numbers at index ${unitIdx}`);
            }
            prevToken.value = toPoint(prevToken.value, basicTikzTokens[unitIdx].name);
        });
        basicTikzTokens = basicTikzTokens.filter((_, idx) => (!unitIndices.includes(idx)));
        basicTikzTokens = basicTikzTokens.filter((t) => t.name !== 'Comma');
        const indexesToRemove = [];
        basicTikzTokens.forEach((token, index) => {
            if (token.type === 'Formatting') {
                if (basicTikzTokens[index + 1].name === 'Equals') {
                    basicTikzTokens[index].value = basicTikzTokens[index + 2];
                    indexesToRemove.push(index + 1, index + 2);
                }
            }
        });
        basicTikzTokens = basicTikzTokens.filter((_, idx) => (!indexesToRemove.includes(idx)));
        const mapSyntax = basicTikzTokens
            .map((token, idx) => (token.type === 'Syntax' && /(Dash|Plus)/.test(token.name) ? idx : null))
            .filter((idx) => idx !== null);
        const syntaxSequences = findConsecutiveSequences(mapSyntax);
        const syntaxObjects = syntaxSequences
            .map((sequence) => {
            if (sequence.length === 0)
                return null; // Handle empty sequences
            const start = sequence[0];
            const end = sequence[sequence.length - 1];
            const value = sequence
                .map((index) => {
                const token = basicTikzTokens[index];
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
            basicTikzTokens.splice(start, end + 1 - start, token);
        });
        return basicTikzTokens;
    }
    subdefy(basicTikzTokens) {
        const squareBracketIndexes = mapBrackets('Square_brackets_open', basicTikzTokens);
        squareBracketIndexes
            .sort((a, b) => b.open - a.open) // Sort in descending order of 'open'
            .forEach((index) => {
            const formatting = new Formatting(basicTikzTokens.slice(index.open + 1, index.close));
            basicTikzTokens.splice(index.open, index.close + 1 - index.open, formatting);
        });
        const praneIndexes = mapBrackets('Parentheses_open', basicTikzTokens);
        praneIndexes
            .sort((a, b) => b.open - a.open)
            .forEach((index) => {
            const formatting = new Coordinate(basicTikzTokens.slice(index.open + 1, index.close));
            basicTikzTokens.splice(index.open, index.close + 1 - index.open, formatting);
        });
    }
    tokenize() {
        /*
        They're going to be three types stringed syntax number.
         I use them to tokenize. using the ticks commands. Once tokenizer takes commands.
         I move on to actual evaluation.
        */
        let subdefinedTokens = [];
        /*
        for (let i=0;i<basicTikzTokens.length;i++){

        }*/
        console.log(basicTikzTokens);
    }
    tidyTikzSource(tikzSource) {
        const remove = "&nbsp;";
        tikzSource = tikzSource.replaceAll(remove, "");
        let lines = tikzSource.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g, "");
    }
    getCode() {
        if (typeof this.source === "string" && this.source.match(/(usepackage|usetikzlibrary)/))
            return this.processedCode;
        return ''; //getPreamble()+this.processedCode+"\n\\end{tikzpicture}\\end{document}";
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
        const extremeXY = getExtremeXY(this.tokens);
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
    //const mass=`\\def\\mass#1#2{\\node[fill=yellow!60,draw,text=black,anchor= north] at (#1){#2};}`
    const dvector = "\\newcommand{\\dvector}[2]{\\coordinate (temp1) at ($(0,0 -| #1)$);\\coordinate (temp2) at ($(0,0 |- #1)$);\\draw [line width=0.7pt,#2] (#1)--(temp1)(#1)--(temp2);}";
    const picAng = "\\newcommand{\\ang}[5]{\\coordinate (ang1) at (#1); \\coordinate (ang2) at (#2); \\coordinate (ang3) at (#3); \\pgfmathanglebetweenpoints{\\pgfpointanchor{ang3}{center}}{\\pgfpointanchor{ang2}{center}}\\let\\angCB\\pgfmathresult\\pgfmathanglebetweenpoints{\\pgfpointanchor{ang2}{center}}{\\pgfpointanchor{ang1}{center}}\\let\\angAB\\pgfmathresult\\pgfmathparse{\\angCB - \\angAB}\\ifdim\\pgfmathresult pt<0pt\\pgfmathparse{\\pgfmathresult + 360}\\fi\\ifdim\\pgfmathresult pt>180pt\\pgfmathparse{360 - \\pgfmathresult}\\fi\\let\\angB\\pgfmathresult\\pgfmathsetmacro{\\angleCheck}{abs(\\angB - 90)}\\ifthenelse{\\lengthtest{\\angleCheck pt < 0.1pt}}{\\pic [ang#5,\"{${#4}\$}\",]{right angle=ang1--ang2--ang3};}{\\pic [ang#5,\"{${#4}\$}\",]{angle=ang1--ang2--ang3};}}";
    const preamble = "\\usepackage{pgfplots,ifthen}\\usetikzlibrary{arrows.meta,angles,quotes,positioning, calc, intersections,decorations.markings,math,spy,matrix,patterns,snakes,decorations.pathreplacing,decorations.pathmorphing,patterns,shadows,shapes.symbols}";
    return preamble + ang + mark + arr + lene + spring + tree + table + coor + dvector + picAng + "\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3RlbXBDb2RlUnVubmVyRmlsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxjQUFjO0FBQ2QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BGLE9BQU8sRUFBa0IsYUFBYSxFQUFFLFdBQVcsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBQzVGLE1BQU0sY0FBYztJQUNoQixJQUFJLENBQVM7SUFDYixJQUFJLENBQVE7SUFDWixLQUFLLENBQXlCO0lBQzlCLFlBQVksS0FBaUI7UUFDekIsSUFBSSxPQUFPLEtBQUssS0FBRyxRQUFRLEVBQUM7WUFDeEIsSUFBSSxDQUFDLElBQUksR0FBQyxRQUFRLENBQUE7WUFDbEIsSUFBSSxDQUFDLEtBQUssR0FBQyxLQUFLLENBQUM7U0FDcEI7YUFDRztZQUNBLElBQUksQ0FBQyxJQUFJLEdBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFDLFFBQVEsQ0FBQyxDQUFBO1lBQ2hELElBQUksQ0FBQyxJQUFJLEdBQUMsS0FBSyxDQUFDLElBQUksQ0FBQTtTQUN2QjtJQUNMLENBQUM7Q0FDSjtBQUVELE1BQU0sT0FBTyxhQUFhO0lBQ3pCLE1BQU0sQ0FBUztJQUNaLE1BQU0sR0FBZSxFQUFFLENBQUM7SUFDeEIsaUJBQWlCO0lBQ1QsV0FBVyxDQUF3QztJQUM5RCxhQUFhLEdBQUMsRUFBRSxDQUFDO0lBQ2QsU0FBUyxHQUFHLEVBQUUsQ0FBQztJ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blMsTUFBTSxNQUFNLEdBQUMsMGdCQUEwZ0IsQ0FBQTtJQUV2aEIsTUFBTSxJQUFJLEdBQUMsaUtBQWlLLENBQUE7SUFFNUssTUFBTSxLQUFLLEdBQUMsNldBQTZXLENBQUE7SUFDelgsTUFBTSxJQUFJLEdBQUMsK0VBQStFLENBQUE7SUFDMUYsaUdBQWlHO0lBQ2pHLE1BQU0sT0FBTyxHQUFDLHNLQUFzSyxDQUFBO0lBRXBMLE1BQU0sTUFBTSxHQUFDLDh2QkFBOHZCLENBQUE7SUFDM3dCLE1BQU0sUUFBUSxHQUFDLG1QQUFtUCxDQUFBO0lBQ2xRLE9BQU8sUUFBUSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxNQUFNLEdBQUMsSUFBSSxHQUFDLEtBQUssR0FBQyxJQUFJLEdBQUMsT0FBTyxHQUFDLE1BQU0sR0FBQyxpRUFBaUUsQ0FBQTtBQUM3SSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQHRzLW5vY2hlY2tcclxuaW1wb3J0IHsgZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzIH0gZnJvbSBcInNyYy9tYXRoRW5naW5lXCI7XHJcbmltcG9ydCB7IGFyclRvUmVnZXhTdHJpbmcsIEF4aXMsIENvb3JkaW5hdGUsIERyYXcsIEZvcm1hdHRpbmcsIHJlZ0V4cCwgVG9rZW4sIHRvUG9pbnQgfSBmcm9tIFwiLi4vdGlrempheFwiO1xyXG5pbXBvcnQgeyBnZXRBbGxUaWt6UmVmZXJlbmNlcywgc2VhcmNoVGl6a0NvbW1hbmRzIH0gZnJvbSBcInNyYy90aWt6amF4L3Rpa3pDb21tYW5kc1wiO1xyXG5pbXBvcnQgeyBmaW5kUGFyZW5JbmRleCwgaWRQYXJlbnRoZXNlcywgbWFwQnJhY2tldHMsIFBhcmVuIH0gZnJvbSBcInNyYy91dGlscy90b2tlblV0ZW5zaWxzXCI7XHJcbmNsYXNzIEJhc2ljVGlrelRva2Vue1xyXG4gICAgdHlwZTogc3RyaW5nO1xyXG4gICAgbmFtZTogc3RyaW5nXHJcbiAgICB2YWx1ZTogc3RyaW5nfG51bWJlcnxQYXJlbnxhbnlcclxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOiBudW1iZXJ8YW55KXtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlPT09J251bWJlcicpe1xyXG4gICAgICAgICAgICB0aGlzLnR5cGU9J251bWJlcidcclxuICAgICAgICAgICAgdGhpcy52YWx1ZT12YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgdGhpcy50eXBlPXZhbHVlLnR5cGUucmVwbGFjZSgvQnJhY2tldC8sJ1N5bnRheCcpXHJcbiAgICAgICAgICAgIHRoaXMubmFtZT12YWx1ZS5uYW1lXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRm9ybWF0VGlrempheCB7XHJcblx0c291cmNlOiBzdHJpbmc7XHJcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcclxuICAgIC8vbWlkUG9pbnQ6IEF4aXM7XHJcbiAgICBwcml2YXRlIHZpZXdBbmNob3JzOiB7bWF4OiBBeGlzLG1pbjpBeGlzLGF2ZU1pZFBvaW50OiBBeGlzfVxyXG5cdHByb2Nlc3NlZENvZGU9XCJcIjtcclxuICAgIGRlYnVnSW5mbyA9IFwiXCI7XHJcbiAgICBcclxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZ3xBcnJheTxUb2tlbj4pIHtcclxuICAgICAgICBpZih0eXBlb2Ygc291cmNlPT09XCJzdHJpbmdcIil7XHJcblx0XHR0aGlzLnNvdXJjZSA9IHRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcclxuICAgICAgICBjb25zdCBiYXNpY0FycmF5PXRoaXMuYmFzaWNBcnJheWlmeSgpXHJcbiAgICAgICAgbGV0IGJhc2ljVGlrelRva2Vucz10aGlzLmJhc2ljVGlrelRva2VuaWZ5KGJhc2ljQXJyYXkpXHJcblxyXG4gICAgICAgIGNvbnN0IGE9dGhpcy5wcmVwYXJlRm9yU3ViZGVmeShiYXNpY1Rpa3pUb2tlbnMpXHJcbiAgICAgICAgdGhpcy5zdWJkZWZ5KGEpXHJcbiAgICAgICAgY29uc29sZS5sb2coYSlcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7dGhpcy50b2tlbnM9c291cmNlfVxyXG5cclxuICAgICAgICBpZiAodHlwZW9mIHNvdXJjZT09PVwic3RyaW5nXCImJnNvdXJjZS5tYXRjaCgvKHVzZXBhY2thZ2V8dXNldGlremxpYnJhcnkpLykpe1xyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGU9c291cmNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNley8qXHJcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnNvdXJjZTtcclxuICAgICAgICAgICAgdGhpcy5maW5kVmlld0FuY2hvcnMoKTtcclxuICAgICAgICAgICAgdGhpcy5hcHBseVBvc3RQcm9jZXNzaW5nKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmRlYnVnSW5mbys9XCJcXG5cXG50aGlzLm1pZFBvaW50OlxcblwiK0pTT04uc3RyaW5naWZ5KHRoaXMudmlld0FuY2hvcnMsbnVsbCwxKStcIlxcblwiXHJcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz1KU09OLnN0cmluZ2lmeSh0aGlzLnRva2VucyxudWxsLDEpK1wiXFxuXFxuXCJcclxuXHJcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnByb2Nlc3NlZENvZGU7Ki9cclxuICAgICAgICB9XHJcblx0fVxyXG4gICAgYmFzaWNBcnJheWlmeSgpe1xyXG4gICAgICAgIGNvbnN0IGJhc2ljQXJyYXkgPSBbXTtcclxuICAgICAgICBjb25zdCBvcGVyYXRvcnNSZWdleCA9IG5ldyBSZWdFeHAoJ14nICsgYXJyVG9SZWdleFN0cmluZyhnZXRBbGxUaWt6UmVmZXJlbmNlcygpKSk7XHJcbiAgICAgICAgbGV0IGkgPSAwO1xyXG4gICAgICAgICBcclxuICAgICAgICB3aGlsZSAoaSA8IHRoaXMuc291cmNlLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBjb25zdCBzdWJTb3VyY2UgPSB0aGlzLnNvdXJjZS5zbGljZShpKTtcclxuICAgICAgICAgICAgbGV0IG1hdGNoO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBNYXRjaCBUaWtaIG9wZXJhdG9yc1xyXG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaChvcGVyYXRvcnNSZWdleCk7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IG1hdGNoWzBdIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBNYXRjaCBudW1iZXJzXHJcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eWy0wLTkuXSsvKTtcclxuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaCh7IHR5cGU6ICdudW1iZXInLCB2YWx1ZTogcGFyc2VOdW1iZXIobWF0Y2hbMF0pIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBJbmNyZW1lbnQgaW5kZXggaWYgbm8gbWF0Y2ggZm91bmRcclxuICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gYmFzaWNBcnJheVxyXG4gICAgfVxyXG4gICAgYmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNBcnJheSl7XHJcbiAgICAgICAgbGV0IGJhc2ljVGlrelRva2VuczogQXJyYXk8QmFzaWNUaWt6VG9rZW58Rm9ybWF0dGluZz4gPSBbXTtcclxuICAgICAgICAgLy8gUHJvY2VzcyB0b2tlbnNcclxuICAgICAgICBiYXNpY0FycmF5LmZvckVhY2goKHsgdHlwZSwgdmFsdWUgfSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRpa3pDb21tYW5kID0gc2VhcmNoVGl6a0NvbW1hbmRzKHZhbHVlKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKHRpa3pDb21tYW5kKSB7XHJcbiAgICAgICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odGlrekNvbW1hbmQpKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odmFsdWUpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlkUGFyZW50aGVzZXMoYmFzaWNUaWt6VG9rZW5zKVxyXG4gICAgICAgIHJldHVybiBiYXNpY1Rpa3pUb2tlbnM7XHJcbiAgICB9XHJcbiAgICBwcmVwYXJlRm9yU3ViZGVmeShiYXNpY1Rpa3pUb2tlbnMpe1xyXG4gICAgICAgIGNvbnN0IHVuaXRJbmRpY2VzOiBudW1iZXJbXSA9IGJhc2ljVGlrelRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbi50eXBlID09PSAnVW5pdCcgPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKChpZHgpOiBpZHggaXMgbnVtYmVyID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgICAgIHVuaXRJbmRpY2VzLmZvckVhY2goKHVuaXRJZHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gYmFzaWNUaWt6VG9rZW5zW3VuaXRJZHggLSAxXTtcclxuXHJcbiAgICAgICAgICAgIGlmICghcHJldlRva2VuIHx8IHByZXZUb2tlbi50eXBlICE9PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbml0cyBjYW4gb25seSBiZSB1c2VkIGluIHJlZmVyZW5jZSB0byBudW1iZXJzIGF0IGluZGV4ICR7dW5pdElkeH1gKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcHJldlRva2VuLnZhbHVlID0gdG9Qb2ludChwcmV2VG9rZW4udmFsdWUgYXMgbnVtYmVyLCBiYXNpY1Rpa3pUb2tlbnNbdW5pdElkeF0ubmFtZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGJhc2ljVGlrelRva2Vucz1iYXNpY1Rpa3pUb2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICghdW5pdEluZGljZXMuaW5jbHVkZXMoaWR4KSkpO1xyXG4gICAgICAgIGJhc2ljVGlrelRva2Vucz1iYXNpY1Rpa3pUb2tlbnMuZmlsdGVyKCh0KSA9PiB0Lm5hbWUhPT0nQ29tbWEnKTtcclxuXHJcbiAgICAgICAgY29uc3QgaW5kZXhlc1RvUmVtb3ZlOiBudW1iZXJbXT1bXVxyXG4gICAgICAgIGJhc2ljVGlrelRva2Vucy5mb3JFYWNoKCh0b2tlbixpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBpZih0b2tlbi50eXBlPT09J0Zvcm1hdHRpbmcnKXtcclxuICAgICAgICAgICAgICAgIGlmKGJhc2ljVGlrelRva2Vuc1tpbmRleCsxXS5uYW1lPT09J0VxdWFscycpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zW2luZGV4XS52YWx1ZT1iYXNpY1Rpa3pUb2tlbnNbaW5kZXgrMl1cclxuICAgICAgICAgICAgICAgICAgICBpbmRleGVzVG9SZW1vdmUucHVzaChpbmRleCsxLGluZGV4KzIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgYmFzaWNUaWt6VG9rZW5zPWJhc2ljVGlrelRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCFpbmRleGVzVG9SZW1vdmUuaW5jbHVkZXMoaWR4KSkpO1xyXG5cclxuXHJcblxyXG4gICAgICAgIGNvbnN0IG1hcFN5bnRheCA9IGJhc2ljVGlrelRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbi50eXBlID09PSAnU3ludGF4JyAmJiAvKERhc2h8UGx1cykvLnRlc3QodG9rZW4ubmFtZSkgPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKChpZHgpOiBpZHggaXMgbnVtYmVyID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHN5bnRheFNlcXVlbmNlcyA9IGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyhtYXBTeW50YXgpO1xyXG5cclxuXHJcbiAgICAgICAgY29uc3Qgc3ludGF4T2JqZWN0cyA9IHN5bnRheFNlcXVlbmNlc1xyXG4gICAgICAgIC5tYXAoKHNlcXVlbmNlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChzZXF1ZW5jZS5sZW5ndGggPT09IDApIHJldHVybiBudWxsOyAvLyBIYW5kbGUgZW1wdHkgc2VxdWVuY2VzXHJcblxyXG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IHNlcXVlbmNlWzBdO1xyXG4gICAgICAgICAgICBjb25zdCBlbmQgPSBzZXF1ZW5jZVtzZXF1ZW5jZS5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHNlcXVlbmNlXHJcbiAgICAgICAgICAgICAgICAubWFwKChpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRva2VuID0gYmFzaWNUaWt6VG9rZW5zW2luZGV4XTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRva2VuIHx8ICF0b2tlbi5uYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgTWlzc2luZyBvciBpbnZhbGlkIHRva2VuIGF0IGluZGV4ICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAnJzsgLy8gUHJvdmlkZSBhIGZhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbi5uYW1lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9EYXNoLywgJy0nKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvUGx1cy8sICcrJyk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmpvaW4oJycpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhcnQsIGVuZCwgdmFsdWUgfTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5maWx0ZXIoKG9iaikgPT4gb2JqICE9PSBudWxsKVxyXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLnN0YXJ0IC0gYS5zdGFydCk7XHJcblxyXG4gICAgICAgIHN5bnRheE9iamVjdHMuZm9yRWFjaCgoeyBzdGFydCwgZW5kLCB2YWx1ZSB9KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbW1hbmQgPSBzZWFyY2hUaXprQ29tbWFuZHModmFsdWUpOyBcclxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBuZXcgQmFzaWNUaWt6VG9rZW4oY29tbWFuZClcclxuICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zLnNwbGljZShzdGFydCwgZW5kICsgMSAtIHN0YXJ0LCB0b2tlbik7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGJhc2ljVGlrelRva2Vuc1xyXG4gICAgfVxyXG5cclxuICAgIHN1YmRlZnkoYmFzaWNUaWt6VG9rZW5zKXtcclxuXHJcbiAgICAgICAgY29uc3Qgc3F1YXJlQnJhY2tldEluZGV4ZXMgPSBtYXBCcmFja2V0cygnU3F1YXJlX2JyYWNrZXRzX29wZW4nLGJhc2ljVGlrelRva2VucylcclxuICAgICAgICBcclxuICAgICAgICBzcXVhcmVCcmFja2V0SW5kZXhlc1xyXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLm9wZW4gLSBhLm9wZW4pIC8vIFNvcnQgaW4gZGVzY2VuZGluZyBvcmRlciBvZiAnb3BlbidcclxuICAgICAgICAuZm9yRWFjaCgoaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZyA9IG5ldyBGb3JtYXR0aW5nKFxyXG4gICAgICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zLnNsaWNlKGluZGV4Lm9wZW4gKyAxLCBpbmRleC5jbG9zZSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCBmb3JtYXR0aW5nKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgcHJhbmVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nICxiYXNpY1Rpa3pUb2tlbnMpXHJcbiAgICAgICAgcHJhbmVJbmRleGVzXHJcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIub3BlbiAtIGEub3BlbikgXHJcbiAgICAgICAgLmZvckVhY2goKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmcgPSBuZXcgQ29vcmRpbmF0ZShcclxuICAgICAgICAgICAgICAgIGJhc2ljVGlrelRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGJhc2ljVGlrelRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgZm9ybWF0dGluZyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgfVxyXG4gICAgdG9rZW5pemUoKXtcclxuICAgICAgICAvKlxyXG4gICAgICAgIFRoZXkncmUgZ29pbmcgdG8gYmUgdGhyZWUgdHlwZXMgc3RyaW5nZWQgc3ludGF4IG51bWJlci5cclxuICAgICAgICAgSSB1c2UgdGhlbSB0byB0b2tlbml6ZS4gdXNpbmcgdGhlIHRpY2tzIGNvbW1hbmRzLiBPbmNlIHRva2VuaXplciB0YWtlcyBjb21tYW5kcy5cclxuICAgICAgICAgSSBtb3ZlIG9uIHRvIGFjdHVhbCBldmFsdWF0aW9uLlxyXG4gICAgICAgICovXHJcbiAgICAgICAgXHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBzdWJkZWZpbmVkVG9rZW5zPVtdO1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YmFzaWNUaWt6VG9rZW5zLmxlbmd0aDtpKyspe1xyXG5cclxuICAgICAgICB9Ki9cclxuICAgICAgICBjb25zb2xlLmxvZyhiYXNpY1Rpa3pUb2tlbnMpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aWR5VGlrelNvdXJjZSh0aWt6U291cmNlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xyXG4gICAgICAgIHRpa3pTb3VyY2UgPSB0aWt6U291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSB0aWt6U291cmNlLnNwbGl0KFwiXFxuXCIpO1xyXG4gICAgICAgIGxpbmVzID0gbGluZXMubWFwKGxpbmUgPT4gbGluZS50cmltKCkpO1xyXG4gICAgICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XHJcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpLnJlcGxhY2UoLyg/PD1bXlxcd10pIHwgKD89W15cXHddKS9nLCBcIlwiKS5yZXBsYWNlKC8oPzwhXFxcXCklLiokL2dtLCBcIlwiKS5yZXBsYWNlKC9cXG4vZyxcIlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRDb2RlKCl7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnNvdXJjZT09PVwic3RyaW5nXCImJnRoaXMuc291cmNlLm1hdGNoKC8odXNlcGFja2FnZXx1c2V0aWt6bGlicmFyeSkvKSlcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJvY2Vzc2VkQ29kZVxyXG4gICAgICAgIHJldHVybiAnJy8vZ2V0UHJlYW1ibGUoKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcclxuICAgICAgICBjb25zdCBmbGF0QXhlcz1mbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgZmxhdEF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xyXG4gICAgICAgICAgICBheGlzLmFkZFF1YWRyYW50KHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBmbGF0RHJhdz1mbGF0dGVuKHRoaXMudG9rZW5zLFtdLERyYXcpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBEcmF3KTtcclxuICAgICAgICBmbGF0RHJhdy5mb3JFYWNoKChkcmF3OiBEcmF3KSA9PiB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgIFtpbmRleCwgY29vcl0gb2YgZHJhdy5jb29yZGluYXRlcy5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgICAgIGlmIChjb29yIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3IuZm9ybWF0dGluZz8uYWRkU3Bsb3BBbmRQb3NpdGlvbihkcmF3LmNvb3JkaW5hdGVzLGluZGV4KVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcblxyXG4gICAgLypcclxuICAgIHRva2VuaXplKCkge1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzLSwuOnxgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXHJcbiAgICAgICAgY29uc3QgYyA9IFN0cmluZy5yYXdgWyQoXXswLDJ9WyR7Y2F9XStbKSRdezAsMn18XFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitdK1xcKFske2NhfV0rXFwpXFwkYDtcclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgd2l0aCBlc2NhcGVkIGNoYXJhY3RlcnMgZm9yIHNwZWNpZmljIG1hdGNoaW5nXHJcbiAgICAgICAgY29uc3QgY24gPSBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWA7IC8vIENvb3JkaW5hdGUgbmFtZVxyXG4gICAgICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxcXCI/XFwkW1xcd1xcZFxcc1xcLSwuOighKVxcLVxce1xcfVxcK1xcXFwgXl0qXFwkXFxcIj98W1xcd1xcZFxcc1xcLSwuOighKV9cXC1cXCtcXFxcXl0qYDsgLy8gVGV4dCB3aXRoIHNwZWNpZmljIGNoYXJhY3RlcnNcclxuICAgICAgICBjb25zdCBmID0gU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7LiYqXFx7XFx9JVxcLTw+XWA7IC8vIEZvcm1hdHRpbmcgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcblxyXG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB1c2luZyBlc2NhcGVkIGJyYWNlcyBhbmQgcGF0dGVybnNcclxuICAgICAgICBjb25zdCBjb29yUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgcGljUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHBpY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFx7KCR7Y30pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHNlID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFxzKlxcKCooJHtjbn0pXFwpKlxccyphdFxccypcXCgoJHtjfSlcXClcXHMqXFxbKCR7Zn0qKVxcXVxccypcXHsoJHt0fSlcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqKFxcW2xhYmVsPVxce1xcWyguKj8pXFxdOlxcXFxcXHcqXFxzKihbXFx3XFxzXSopXFx9XFxdKT9cXHMqXFwoKCR7Y259KylcXClcXHMqYXRcXHMqXFwoKCR7Y30pXFwpO2AsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBkcmF3UmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGRyYXdcXFsoJHtmfSopXFxdKFteO10qKTtgLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgeHlheGlzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHh5YXhpc3soJHt0fSl9eygke3R9KX1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgZ3JpZFJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxncmlkeyhbXFxkLS5dKyl9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGNpcmNsZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjaXJjbGVcXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoW1xcd1xcc1xcZF0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBtYXNzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG1hc3NcXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoLVxcfHxcXHx8Pil7MCwxfVxcfVxceyhbXFxkLl0qKVxcfWAsXCJnXCIpO1xyXG4gICAgICAgIC8vXFxwaWN7YW5jMn17YW5jMX17YW5jMH17NzVeXFxjaXJjIH17fTtcclxuICAgICAgICBjb25zdCB2ZWNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcdmVjXFx7KCR7Y30pXFx9XFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW2Nvb3JSZWdleCwgc2UsIHNzLCBub2RlUmVnZXgsIGRyYXdSZWdleCwgY2lyY2xlUmVnZXgsIG1hc3NSZWdleCwgdmVjUmVnZXgscGljUmVnZXhdO1xyXG4gICAgICAgIGxldCBtYXRjaGVzOiBhbnlbXT1bXTtcclxuICAgICAgICByZWdleFBhdHRlcm5zLmZvckVhY2goYWIgPT4ge1xyXG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiAoYS5pbmRleCB8fCAwKSAtIChiLmluZGV4IHx8IDApKTtcclxuXHJcbiAgICAgICAgW3h5YXhpc1JlZ2V4LGdyaWRSZWdleF0uZm9yRWFjaChhYiA9PiB7XHJcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XHJcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcbiAgICAgICAgICBpZiAobWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCAmJiBtYXRjaC5pbmRleCA+IGN1cnJlbnRJbmRleCkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHRoaXMuc291cmNlLnNsaWNlKGN1cnJlbnRJbmRleCwgbWF0Y2guaW5kZXgpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vclwiKSkge1xyXG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsyXSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbNF19XHJcbiAgICAgICAgICAgIGlmKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vcmRpbmF0ZVwiKSl7XHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFs1XSxjb29yZGluYXRlTmFtZTogbWF0Y2hbNF0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzJdfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCB7IGZvcm1hdHRpbmcsb3JpZ2luYWwsIC4uLnJlc3QgfSA9IGk7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwiY29vcmRpbmF0ZVwiLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG9yaWdpbmFsLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwiY29vcmRpbmF0ZVwiLCB1bmRlZmluZWQsZm9ybWF0dGluZyksLi4ucmVzdCx9KSk7XHJcblxyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHBpY1wiKSkge1xyXG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKVxyXG4gICAgICAgICAgICBjb25zdCBjMj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKVxyXG4gICAgICAgICAgICBjb25zdCBjMz1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFszXSx0aGlzKVxyXG5cclxuXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoe21vZGU6IFwicGljLWFuZ1wiLHRva2VuczogdGhpcyxmb3JtYXR0aW5nU3RyaW5nOiBtYXRjaFs1XSxmb3JtYXR0aW5nT2JqOiB7dGlrenNldDogXCJhbmdcIixpY1RleHQ6IG1hdGNoWzRdfSxkcmF3QXJyOiBbYzEsYzIsYzNdfSkpO1xyXG4gICAgICAgICAgfWVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZHJhd1wiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHVuZGVmaW5lZCxtYXRjaFsxXSxtYXRjaFsyXSwgdGhpcykpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHh5YXhpc1wiKSkge1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGdyaWRcIikpIHtcclxuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKHt0eXBlOiBcImdyaWRcIiwgcm90YXRlOiBtYXRjaFsxXX0pO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXG5vZGVcIikpIHtcclxuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbM10sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfVxyXG4gICAgICAgICAgICBpZiAobWF0Y2hbMF0ubWF0Y2goL1xcXFxub2RlXFxzKlxcKC8pKXtcclxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzJdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsxXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCB7IGZvcm1hdHRpbmcsb3JpZ2luYWwsIC4uLnJlc3QgfSA9IGk7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZVwiLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG9yaWdpbmFsLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZVwiLCB1bmRlZmluZWQsZm9ybWF0dGluZyksLi4ucmVzdCx9KSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7LypcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgdHlwZTogXCJjaXJjbGVcIixcclxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSxcclxuICAgICAgICAgICAgICBjb29yZGluYXRlczogW1xyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsxXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsyXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFszXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIH0pOypcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxtYXNzXCIpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZVwiLGxhYmVsOiBtYXRjaFsyXSxheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIix7dGlrenNldDogJ21hc3MnLGFuY2hvcjogbWF0Y2hbM10scm90YXRlOiBtYXRjaFs0XX0pfSkpXHJcblxyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHZlY1wiKSkge1xyXG4gICAgICAgICAgICBjb25zdCBhbmNlcj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKTtcclxuICAgICAgICAgICAgY29uc3QgYXhpczE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcyk7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vZGU9bmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZS1pbmxpbmVcIixmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZygnbm9kZS1pbmxpbmUnLHtjb2xvcjogXCJyZWRcIn0pfSlcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBDb29yZGluYXRlKFwibm9kZS1pbmxpbmVcIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHE9W2FuY2VyLCctLSsnLG5vZGUsYXhpczFdXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoe2Zvcm1hdHRpbmdPYmo6IHt0aWt6c2V0OiAndmVjJ30sdG9rZW5zOiB0aGlzLGRyYXdBcnI6IHF9KSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAobWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBjdXJyZW50SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA8IHRoaXMuc291cmNlLmxlbmd0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHRoaXMuc291cmNlLnNsaWNlKGN1cnJlbnRJbmRleCkpO1xyXG4gICAgICAgIH1cclxuICAgIH0qL1xyXG4gICAgZ2V0TWluKCl7cmV0dXJuIHRoaXMudmlld0FuY2hvcnMubWlufVxyXG4gICAgZ2V0TWF4KCl7cmV0dXJuIHRoaXMudmlld0FuY2hvcnMubWF4fVxyXG5cclxuICAgIGZpbmRWaWV3QW5jaG9ycygpIHtcclxuICAgICAgICBjb25zdCBheGVzID0gZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgc3VtT2ZYID0gMCwgc3VtT2ZZID0gMDtcclxuICAgICAgICBsZXQgbWF4WCA9IC1JbmZpbml0eSwgbWF4WSA9IC1JbmZpbml0eTtcclxuICAgICAgICBsZXQgbWluWCA9IEluZmluaXR5LCBtaW5ZID0gSW5maW5pdHk7XHJcbiAgICBcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzID0ge1xyXG4gICAgICAgICAgICBtYXg6IG5ldyBBeGlzKDAsIDApLFxyXG4gICAgICAgICAgICBtaW46IG5ldyBBeGlzKDAsIDApLFxyXG4gICAgICAgICAgICBhdmVNaWRQb2ludDogbmV3IEF4aXMoMCwgMClcclxuICAgICAgICB9O1xyXG4gICAgXHJcbiAgICAgICAgYXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgY2FydGVzaWFuWCwgY2FydGVzaWFuWSB9ID0gYXhpcztcclxuICAgIFxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgc3VtcyBmb3IgYXZlcmFnZSBjYWxjdWxhdGlvblxyXG4gICAgICAgICAgICBzdW1PZlggKz0gY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgc3VtT2ZZICs9IGNhcnRlc2lhblk7XHJcbiAgICBcclxuICAgICAgICAgICAgLy8gVXBkYXRlIG1heCBhbmQgbWluIGNvb3JkaW5hdGVzXHJcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5YID4gbWF4WCkgbWF4WCA9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5ZID4gbWF4WSkgbWF4WSA9IGNhcnRlc2lhblk7XHJcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5YIDwgbWluWCkgbWluWCA9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5ZIDwgbWluWSkgbWluWSA9IGNhcnRlc2lhblk7XHJcbiAgICAgICAgfSk7XHJcbiAgICBcclxuICAgICAgICBjb25zdCBsZW5ndGggPSBheGVzLmxlbmd0aCAhPT0gMCA/IGF4ZXMubGVuZ3RoIDogMTtcclxuICAgIFxyXG4gICAgICAgIC8vIFNldCB0aGUgdmlld0FuY2hvcnNcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLmF2ZU1pZFBvaW50ID0gbmV3IEF4aXMoc3VtT2ZYIC8gbGVuZ3RoLCBzdW1PZlkgLyBsZW5ndGgpO1xyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWF4ID0gbmV3IEF4aXMobWF4WCwgbWF4WSk7XHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5taW4gPSBuZXcgQXhpcyhtaW5YLCBtaW5ZKTtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIGZpbmRPcmlnaW5hbFZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBvZyA9IHRoaXMudG9rZW5zLnNsaWNlKCkucmV2ZXJzZSgpLmZpbmQoXHJcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XHJcbiAgICAgICAgICAgICAgICAodG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKSAmJiB0b2tlbi5jb29yZGluYXRlTmFtZSA9PT0gdmFsdWVcclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgdG9TdHJpbmcoKXtcclxuICAgICAgICBsZXQgY29kZUJsb2NrT3V0cHV0ID0gXCJcIjtcclxuICAgICAgICBjb25zdCBleHRyZW1lWFk9Z2V0RXh0cmVtZVhZKHRoaXMudG9rZW5zKTtcclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcblxyXG4gICAgICAgICAgICBpZih0b2tlbi50b1N0cmluZygpKXtcclxuICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPXRva2VuLnRvU3RyaW5nKClcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IHRva2VuO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBjb2RlQmxvY2tPdXRwdXQ7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBmbGF0dGVuKGRhdGE6IGFueSwgcmVzdWx0czogYW55W10gPSBbXSwgc3RvcENsYXNzPzogYW55KTogYW55W10ge1xyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcclxuICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGRhdGEpIHtcclxuICAgICAgICBmbGF0dGVuKGl0ZW0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnICYmIGRhdGEgIT09IG51bGwpIHtcclxuICAgICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbiBpbnN0YW5jZSBvZiB0aGUgc3RvcENsYXNzLCBhZGQgaXQgdG8gcmVzdWx0cyBhbmQgc3RvcCBmbGF0dGVuaW5nXHJcbiAgICAgIGlmIChzdG9wQ2xhc3MgJiYgZGF0YSBpbnN0YW5jZW9mIHN0b3BDbGFzcykge1xyXG4gICAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0cztcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICAvLyBBZGQgdGhlIGN1cnJlbnQgb2JqZWN0IHRvIHJlc3VsdHNcclxuICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xyXG4gIFxyXG4gICAgICAvLyBSZWN1cnNpdmVseSBmbGF0dGVuIHByb3BlcnRpZXMgb2YgdGhlIG9iamVjdFxyXG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBkYXRhKSB7XHJcbiAgICAgICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoa2V5KSkge1xyXG4gICAgICAgICAgZmxhdHRlbihkYXRhW2tleV0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0cztcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0RXh0cmVtZVhZKHRva2VuczogYW55KSB7XHJcbiAgICBsZXQgbWF4WCA9IC1JbmZpbml0eTtcclxuICAgIGxldCBtYXhZID0gLUluZmluaXR5O1xyXG4gICAgbGV0IG1pblggPSBJbmZpbml0eTtcclxuICAgIGxldCBtaW5ZID0gSW5maW5pdHk7XHJcbiAgICBcclxuICAgIHRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICAgICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcclxuICAgICAgICBpZiAodG9rZW4uWCA8IG1pblgpIG1pblggPSB0b2tlbi5YO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcclxuICAgICAgICBpZiAodG9rZW4uWSA8IG1pblkpIG1pblkgPSB0b2tlbi5ZO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIG1heFgsbWF4WSxtaW5YLG1pblksXHJcbiAgICB9O1xyXG59XHJcblxyXG5jb25zdCBwYXJzZU51bWJlciA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcclxufTtcclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRQcmVhbWJsZSgpOnN0cmluZ3tcclxuICAgIGNvbnN0IGFuZz1cIlxcXFx0aWt6c2V0e2FuZy8uc3R5bGUgMiBhcmdzPXtmaWxsPWJsYWNrITUwLG9wYWNpdHk9MC41LHRleHQgb3BhY2l0eT0wLjksZHJhdz1vcmFuZ2UsPC0+LGFuZ2xlIGVjY2VudHJpY2l0eT0jMSxhbmdsZSByYWRpdXM9IzJjbSx0ZXh0PW9yYW5nZSxmb250PVxcXFxsYXJnZX0sYW5nLy5kZWZhdWx0PXsxLjZ9ezAuNX19XCJcclxuICBcclxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXHJcbiAgXHJcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxyXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXHJcbiAgICBjb25zdCBzcHJpbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcc3ByaW5nfVs0XXtcXFxcdGlrem1hdGh7Y29vcmRpbmF0ZSBcXFxcc3RhcnQsIFxcXFxkb25lO1xcXFxzdGFydCA9ICgjMSk7XFxcXGRvbmUgPSAoIzIpO31cXFxcZHJhd1t0aGlja10gKCQoXFxcXHN0YXJ0KSArICgtMS41LDApJCkgLS0rKygzLDApO1xcXFxkcmF3IChcXFxcc3RhcnQpIC0tKyAoMCwtMC4yNWNtKTtcXFxcZHJhdyAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCswY20sXFxcXGRvbmV5KzAuMjVjbSkkKS0tKygwLC0wLjI1KTtcXFxcZHJhd1tkZWNvcmF0aW9uPXthc3BlY3Q9MC4zLCBzZWdtZW50IGxlbmd0aD0zLCBhbXBsaXR1ZGU9Mm1tLGNvaWwsfSxkZWNvcmF0ZV0gKFxcXFxzdGFydHgsXFxcXHN0YXJ0eS0wLjI1Y20pIC0tKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KzAuMjVjbSkkKW5vZGVbbWlkd2F5LHJpZ2h0PTAuMjVjbSxibGFja117IzR9O1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkpJCl7IzN9O31cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcclxuICAgIFxyXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcclxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcclxuICAgIC8vY29uc3QgbWFzcz1gXFxcXGRlZlxcXFxtYXNzIzEjMntcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCMxKXsjMn07fWBcclxuICAgIGNvbnN0IGR2ZWN0b3I9XCJcXFxcbmV3Y29tbWFuZHtcXFxcZHZlY3Rvcn1bMl17XFxcXGNvb3JkaW5hdGUgKHRlbXAxKSBhdCAoJCgwLDAgLXwgIzEpJCk7XFxcXGNvb3JkaW5hdGUgKHRlbXAyKSBhdCAoJCgwLDAgfC0gIzEpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MC43cHQsIzJdICgjMSktLSh0ZW1wMSkoIzEpLS0odGVtcDIpO31cIlxyXG4gICAgXHJcbiAgICBjb25zdCBwaWNBbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYW5nfVs1XXtcXFxcY29vcmRpbmF0ZSAoYW5nMSkgYXQgKCMxKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzIpIGF0ICgjMik7IFxcXFxjb29yZGluYXRlIChhbmczKSBhdCAoIzMpOyBcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nM317Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdDQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcxfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQUJcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXGFuZ0NCIC0gXFxcXGFuZ0FCfVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PDBwdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXHBnZm1hdGhyZXN1bHQgKyAzNjB9XFxcXGZpXFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ+MTgwcHRcXFxccGdmbWF0aHBhcnNlezM2MCAtIFxcXFxwZ2ZtYXRocmVzdWx0fVxcXFxmaVxcXFxsZXRcXFxcYW5nQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhzZXRtYWNyb3tcXFxcYW5nbGVDaGVja317YWJzKFxcXFxhbmdCIC0gOTApfVxcXFxpZnRoZW5lbHNle1xcXFxsZW5ndGh0ZXN0e1xcXFxhbmdsZUNoZWNrIHB0IDwgMC4xcHR9fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXtyaWdodCBhbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde2FuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O319XCJcclxuICAgIGNvbnN0IHByZWFtYmxlPVwiXFxcXHVzZXBhY2thZ2V7cGdmcGxvdHMsaWZ0aGVufVxcXFx1c2V0aWt6bGlicmFyeXthcnJvd3MubWV0YSxhbmdsZXMscXVvdGVzLHBvc2l0aW9uaW5nLCBjYWxjLCBpbnRlcnNlY3Rpb25zLGRlY29yYXRpb25zLm1hcmtpbmdzLG1hdGgsc3B5LG1hdHJpeCxwYXR0ZXJucyxzbmFrZXMsZGVjb3JhdGlvbnMucGF0aHJlcGxhY2luZyxkZWNvcmF0aW9ucy5wYXRobW9ycGhpbmcscGF0dGVybnMsc2hhZG93cyxzaGFwZXMuc3ltYm9sc31cIlxyXG4gICAgcmV0dXJuIHByZWFtYmxlK2FuZyttYXJrK2FycitsZW5lK3NwcmluZyt0cmVlK3RhYmxlK2Nvb3IrZHZlY3RvcitwaWNBbmcrXCJcXFxccGdmcGxvdHNzZXR7Y29tcGF0PTEuMTZ9XFxcXGJlZ2lue2RvY3VtZW50fVxcXFxiZWdpbnt0aWt6cGljdHVyZX1cIlxyXG59Il19