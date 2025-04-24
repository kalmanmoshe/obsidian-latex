export class Latex{

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
function tokenArrayToObjArray(latex: string[]){
    
}

export function temp(){
    const stringTokens = latexStringToTokenArray(latex);
    console.log("stringTokens",latex,stringTokens);
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