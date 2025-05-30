import { reference } from "@popperjs/core"

export enum BracketType {
    Parentheses = 'parentheses',
    SquareBrackets = 'squareBrackets',
    CurlyBraces = 'curlyBracket',
    None = 'none',
}
export enum BracketState{
    Open='open',
    Close='close',
}

export enum Encasing {
    None='none',
    Brackets='brackets',
    Parentheses='parentheses',
    SquareBrackets='squareBrackets',
    CurlyBraces='curlyBraces',
    Scope='scope',
    Tikzpicture='tikzpicture',
}
interface Environment{
    name:string;
    mathjax?:boolean;
    open:string;
    close:string;
}

const partialEnvironments=[
    {name:'tikzpicture',mathjax: false},
    {name:'align',},
    {name:'aligned',},
    {name:'center',},
    {name:'equation'},
    {name:'equation*',},
    {name:'figure',},
    {name:'itemize',},
    {name:'minipage',},
    {name:'table',},
    {name:'tabular',},
    {name:'theorem',},
    {name:'proof',},
    {name:'lemma',},
    {name:'definition',},
    {name:'remark',},
    {name:'proof',},
    {name:'corollary',},
    {name:'example',},
    {name:'exercise',},
    {name:'solution',},
    {name:'proof',},
    {name:'enumerate',},
    {name:'description',},
    {name:'quote',},
    {name:'quotation',},
    {name:'abstract',},
    {name:'verbatim',},
    {name:'flushleft',},
    {name:'flushright',},
    {name:'align*',},
    {name:'aligned*',},
    {name:'gather',},
    {name:'gather*',},
    {name:'multline',},
    {name:'multline*',},
    {name:'split',},
    {name:'split*',},
    {name:'flalign',},
    {name:'flalign*',},
    {name:'alignat',},
    {name:'alignat*',},
    {name:'alignedat',},
    {name:'alignedat*',},
    {name:'array',},
    {name:'cases',},
    {name:'CD',},
    {name:'eqnarray',},
    {name:'eqnarray*',},
    {name:'IEEEeqnarray',},
    {name:'IEEEeqnarray*',},
    {name:'subequations',},
    {name:'smallmatrix',},
    {name:'matrix',},
    {name:'pmatrix',},

]

export const brackets=[

]
export const environments=[

]
export const encasings=[

]