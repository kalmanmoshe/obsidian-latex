import { regExp } from "src/tikzjax/tikzjax";
import { Brackets, latexOperators, operatorsWithImplicitMultiplication, symbolTranslator, tikzCommands, units } from "./staticData";


export function getAllTikzReferences() {
    return [...tikzCommands,...Brackets,...units]
        .map(operator => operator.references || []) 
        .flat()
        .map(escapeForRegex);
}

export function searchTizkCommands(query: string){
    return [...tikzCommands,...Brackets,...units]
    .find(item =>
        Object.values(item).flat().some((value) =>
            typeof value === 'string' &&value === query,
        )
    );
}
export function searchTizkForOgLatex(query: any){
    return [...tikzCommands,...Brackets,...units]
    .find(item =>
        item.name===query
    );
}



export function searchSymbols(query: string) {
    const combinedData = [...latexOperators, ...symbolTranslator,...Brackets];
    return combinedData.find(item =>
        Object.values(item).some(value => 
            typeof value === 'string' && value.includes(query)
        )
    );
}


export function searchOperators(query: string) {
    return latexOperators.find(item =>
        Object.values(item).flat().some((value) =>
            typeof value === 'string' &&value?.includes(query),
        )
    );
}


export const escapeForRegex = (string: string) => {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

export function getAllLatexReferences() {
    return [...latexOperators,...Brackets]
        .map(operator => operator.references || []) 
        .flat()
        .map(escapeForRegex);
}

export function getAllOperatorReferences() {
    return latexOperators
        .map(operator => operator.references || []) 
        .flat()
        .map(escapeForRegex);
}

export function getOperatorsByPriority(priorityLevel: number,toRegex: any) {
    const prioritized=latexOperators
    .filter(operator => operator.priority === priorityLevel)
    .map(operator => operator.name);
    return toRegex?regExp(prioritized):prioritized;
}
export function getOperatorsBySides(side: string) {
    const sides=latexOperators
    .filter(operator => operator.associativity === side)
    .map(operator => operator.name);
    return sides;
}
export function getOperatorsByBracket(bracket: any) {
    const brackets=latexOperators
    .filter(operator => operator.bracket === bracket)
    .map(operator => operator.name);
    return brackets;
}

export function hasImplicitMultiplication(operatorName: string) {
    const operator = latexOperators.find(op => op.name === operatorName);
    if (!operator) {return false;}
    return operatorsWithImplicitMultiplication.includes(operator.type);
}


