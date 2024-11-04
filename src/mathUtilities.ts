import settings from "../data.json";
export function calculateBinom(n: number, k: number, p: number): number {
    
    return calculateFactorial(n,k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

export function calculateFactorial(n: number, k: number): number {
    let factoriaN = 1, factoriaK = 1, factoriaNK = 1;
    for (let i = 1; i <= n; i++) {
      factoriaN *= i;
      if (i === k) factoriaK = factoriaN;
      if (i === n - k) factoriaNK = factoriaN;
    }
    return (factoriaN / (factoriaK * factoriaNK));
}

export function findAngleByCosineRule(side1:number, side2:number, oppositeSide:number) {
    // Law of Cosines: cos(C) = (a^2 + b^2 - c^2) / (2ab)
    const cosAngle = (Math.pow(side1, 2) + Math.pow(side2, 2) - Math.pow(oppositeSide, 2)) / (2 * side1 * side2);
    return radiansToDegrees(Math.acos(cosAngle));
}

export function degreesToRadians(degrees: number){
    return degrees * (Math.PI / 180);
}
export function radiansToDegrees(radians: number){
    return radians * (180 / Math.PI );
}

export function roundBySettings(input: any): number  {
    const number = Number(input);
    return isNaN(number) ? input : Math.round(number * Number(settings.numberFormatting)) / Number(settings.numberFormatting);
}


export function  quad(a: number,b: number,c:number,variable:number) {
    let x1 = (-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
    let x2 = (-b - Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
    x1=roundBySettings(x1);
    x2=roundBySettings(x2);
    return x1===x2?`${variable} = ${x1}`:`${variable}_1 = ${x1},${variable}_2 = ${x2}`;
}
