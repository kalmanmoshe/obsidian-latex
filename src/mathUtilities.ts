import exp from "constants";
import settings from "../data.json";
import { Axis, Coordinate } from "./tikzjax/tikzjax";

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


export function getUsableDegrees(degrees: number): number {
    return ((degrees % 360) + 360) % 360;
}

export const cartesianToPolar=(x: number,y:number)=>{
    const length=Math.sqrt(x ** 2 +y ** 2);
    let angle;
    if (y>0)
        angle= radiansToDegrees(Math.atan2(x, y));
    else 
        angle=radiansToDegrees(Math.atan2(y, x))
    return {angle: angle, length: length,}
}


export const polarToCartesian = (angle: number, length: number) => {
    const radians = degreesToRadians(angle);
    //if ()
    return { X: length * Math.cos(radians), Y: length * Math.sin(radians) };
};


export function findIntersectionPoint(coordinate1: Axis, coordinate2: Axis, slope1: number, slope2: number) {
    const xValue = ((slope2 * coordinate2.cartesianX) - (slope1 * coordinate1.cartesianX) + (coordinate1.cartesianY - coordinate2.cartesianY)) / (slope2 - slope1);
    return {
        X: xValue, 
        Y: createLineFunction(coordinate1, slope1)(xValue)
    };
}

export function toNumber(input: string | number): number|undefined {
    if (typeof input === 'number') return input;
    const parsedNumber = Number(input);
    return isNaN(parsedNumber) ? undefined : parsedNumber;
}
  

function createLineFunction(coordinate: Axis, slope: number) {
    return function(x: number) {
        return slope * (x - coordinate.cartesianX) + coordinate.cartesianY;
    };
}


export function findSlope(coordinate1: Axis, coordinate2: Axis) {
    const deltaY = coordinate2.cartesianY - coordinate1.cartesianY;
    const deltaX = coordinate2.cartesianX - coordinate1.cartesianX;
    return deltaY / deltaX;
}


export function calculateCircle(point1: Axis, point2: Axis, point3: Axis) {
    const x1 = point1.cartesianX, y1 = point1.cartesianY;
    const x2 = point2.cartesianX, y2 = point2.cartesianY;
    const x3 = point3.cartesianX, y3 = point3.cartesianY;

    // Calculate the determinants needed for solving the system
    const A = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - y2 * x3);
    const B = (x1 ** 2 + y1 ** 2) * (y3 - y2) + (x2 ** 2 + y2 ** 2) * (y1 - y3) + (x3 ** 2 + y3 ** 2) * (y2 - y1);
    const C = (x1 ** 2 + y1 ** 2) * (x2 - x3) + (x2 ** 2 + y2 ** 2) * (x3 - x1) + (x3 ** 2 + y3 ** 2) * (x1 - x2);
    const D = (x1 ** 2 + y1 ** 2) * (x3 * y2 - x2 * y3) + (x2 ** 2 + y2 ** 2) * (x1 * y3 - x3 * y1) + (x3 ** 2 + y3 ** 2) * (x2 * y1 - x1 * y2);

    if (A === 0) {
        return null; // The points are collinear, no unique circle
    }

    // Calculate the center (h, k) of the circle
    const h = -B / (2 * A);
    const k = -C / (2 * A);

    // Calculate the radius of the circle
    const r = Math.sqrt((B ** 2 + C ** 2 - 4 * A * D) / (4 * A ** 2));

    return {
        center: { X: h, Y: k },
        radius: r,
        equation: `(x - ${h.toFixed(2)})^2 + (y - ${k.toFixed(2)})^2 = ${r.toFixed(2)}^2`
    };
}