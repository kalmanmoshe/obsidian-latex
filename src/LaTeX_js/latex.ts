import { DEFAULT_CAT_CODES } from "./catCodes";

export class Latex{

}
type CatCode = {
    char: string;
    code: number;
}
enum ActiveState {

}
export class LatexParser {
    private active: string;
    private catCodes: CatCode[] = DEFAULT_CAT_CODES;
    private index: number = 0;
    getCatCode(char: string): number{
        const catCode = this.catCodes.find((cat) => cat.char === char);
        if (catCode) {
            return catCode.code;
        }
        return 12;
    }
    parse(latex: string): void {
        const chars = latex.split("");
        const codeActoinMap = {
            0: this.
        }
        while (this.index < chars.length) {
            const char = chars[this.index];
            const catCode = this.getCatCode(char);
            
            switch (catCode) {
                case 0:
                    this.active = char;
                    break;
                case 1:
                    this.active = char;
                    break;
                case 2:
                    this.active = char;
                    break;
                case 3:
                    this.active = char;
                    break;
                case 4:
                    this.active = char;
                    break;
                case 5:
                    this.active = char;
                    break;
                case 6:
                    this.active = char;
                    break;
                case 7:
                    this.active = char;
                    break;
                case 8:
                    this.active = char;
                    break;
                case 10:
                    this.active = char;
                    break;
                case 11:
                    this.active = char;
                    break;
                case 12:
                    this.active = char;
                    break;
                default:
                    throw new Error(`Unknown cat code: ${catCode}`);
            }
            this.index++;
        }
    }
}


export class Parser{
    
}

const macroRegexString = String.raw`\\[a-zA-Z]+`;
const bracketRegex = String.raw`[\{\}()[\]]`;

function latexStringToTokenArray(latex: string): string[] {
    const tokens: string[] = [];

    for (let i = 0; i < latex.length; i++) {
        const remaining = latex.slice(i);
        let match = remaining.match(new RegExp("^"+macroRegexString));
        if (!!match) {
            tokens.push(match[0]);
            i += match[0].length - 1;
            continue;
        }

        match = remaining.match(new RegExp("^"+bracketRegex));
        if (!!match) {
            tokens.push(match[0]);
            i += match[0].length - 1;
            continue;
        }

        let index = Math.min(
            ...[remaining.search(macroRegexString), remaining.search(bracketRegex)].filter(x => x >= 0)
        );

        // Fallback if no match ahead
        if (!isFinite(index)) index = remaining.length;

        tokens.push(remaining.slice(0, index));
        i += index - 1;
    }

    return tokens;
}
enum TokenType {
    Macro,
    Bracket,
    Text
}
enum TokenState {
    Open,
    Close,
}
const openBracket = ["{","(","["];
function isTokenOpenBracket(token: string): boolean |null{
    if (token.length !== 1 || !token.match(new RegExp(bracketRegex))) return null;
    return openBracket.includes(token);
}

function tokenArrayToObjArray(latex: string[]){
    const tokens: { type: TokenType, value: string, state?: TokenState }[] = [];
    
    for (let i = 0; i < latex.length; i++) {
        const token = latex[i];
        if (token.match(new RegExp("^"+macroRegexString))) {
            tokens.push({type: TokenType.Macro, value: token});
            continue;
        }
        const isOpenBracket = isTokenOpenBracket(token);
        if (isOpenBracket === null) {
            tokens.push({ type: TokenType.Text, value: token });
        }
        else {
            tokens.push({type: TokenType.Bracket,state: isOpenBracket?TokenState.Open:TokenState.Close, value: token});
        }
    }
    return tokens;
}



export function temp(){
    const stringTokens = latexStringToTokenArray(latex);
    console.log("stringTokens", latex, stringTokens);
    console.log("objTokens", tokenArrayToObjArray(stringTokens));
}

const latex=String.raw`
[scale=3pt, x=1cm, y=1cm,rotate=30]
\def\R{1}\def\alphaVal{58}\def\betaVal{47.14}\def\AO{1.887}
\coor{0,0}{O}{O}{}
\coor{-\alphaVal:\R}{D}{D}{}
\coor{\AO,0}{A}{A}{}
\coor{\betaVal:\R}{B}{B}{}
\draw [] (O)circle (\R);
\draw [] (O)--(B)(O)--(A)--(D) --cycle;
\draw [] (A)--($(A)!1.5!(B)$);
`;