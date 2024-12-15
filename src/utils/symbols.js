import { arrToRegexString, regExp } from "src/tikzjax/tikzjax";

export function searchSymbols(query) {
    const combinedData = [...latexOperators, ...symbolTranslator,...Brackets];
    return combinedData.find(item =>
        Object.values(item).some(value => 
            typeof value === 'string' && value.includes(query)
        )
    );
}


export function searchOperators(query) {
    return latexOperators.find(item =>
        Object.values(item).flat().some((value) =>
            typeof value === 'string' &&value?.includes(query),
        )
    );
}


export const escapeForRegex = (string) => {
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

export function getOperatorsByPriority(priorityLevel,toRegex) {
    const prioritized=latexOperators
    .filter(operator => operator.priority === priorityLevel)
    .map(operator => operator.name);
    return toRegex?regExp(prioritized):prioritized;
}
export function getOperatorsBySides(side) {
    const sides=latexOperators
    .filter(operator => operator.associativity === side)
    .map(operator => operator.name);
    return sides;
}
export function getOperatorsByBracket(bracket) {
    const brackets=latexOperators
    .filter(operator => operator.bracket === bracket)
    .map(operator => operator.name);
    return brackets;
}

export function hasImplicitMultiplication(operatorName) {
    const operator = latexOperators.find(op => op.name === operatorName);
    if (!operator) {return false;}
    return operatorsWithImplicitMultiplication.includes(operator.type);
}



