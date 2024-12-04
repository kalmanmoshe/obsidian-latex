import { cartesianToPolar, findIntersectionPoint, findSlope, polarToCartesian, toNumber } from "src/mathUtilities";
import { Axis, Coordinate, Draw, Tikzjax } from "./tikzjax";
import { FormatTikzjax } from "./interpret/tokenizeTikzjax";



export class TikzSvg {
    private source: string;
    private tikzjax: FormatTikzjax;
    private SVGtikzjax: any;
    private svg: SVGSVGElement;
    debugInfo = "";
    constructor(source: string) {
        this.source = source;
        this.tikzjax = new FormatTikzjax(this.source);
        this.debugInfo +=this.tikzjax.debugInfo;

        this.SVGtikzjax=new TikzjaxTosvg(this.tikzjax)
        this.debugInfo +=JSON.stringify(this.SVGtikzjax,null,1)

        this.setSVGenvironment();
        this.add()
    }
    add(){
        const a={x1: '0', y1:'0', x2:fromPt(1), y2:fromPt(1),stroke: "white",'stroke-width': fromPt(0.4)}
        this.svg.appendChild(this.createSVGElement('line',a))
    }//38.87 0.53  1pt=38.87 0.4pt=0.53 // 2pt=75.58 1pt=37.79

    private setSVGenvironment() {
        const min=this.tikzjax.getMin();
        const max=this.tikzjax.getMax();
        this.svg = this.createSVGElement('svg', {
            width: fromPt(min.cartesianX+max.cartesianX),
            height: 2//fromPt(min.cartesianY+max.cartesianY+0.2),
            //preserveAspectRatio: "none",
        }) as SVGSVGElement;
    }

    getSvg(): SVGSVGElement {return this.svg;}

    createSVGElement(tag: string, attributes: { [key: string]: any }): SVGElement {
        const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const [key, value] of Object.entries(attributes)) {
            // Convert numbers to strings before setting attributes
            element.setAttribute(key, String(value));
        }
        return element;
    }
    
}

class TikzjaxTosvg {
    svgEl: any
    constructor(t: any) {
        const axes=[
            {cartesianX: 0,cartesianY:0}as Axis,
            {cartesianX: 1,cartesianY:0}as Axis
        ]
        this.svgEl=this.c(axes)
    }



    c(axes: Array<Axis>): Record<string, number> {
        let result: Record<string, number> = {};
    
        axes.forEach((axis, index) => {
            result['x' + index] = axis.cartesianX;
            result['y' + index] = axis.cartesianY;
        });
    
        return result;
    }
}


function convert(){
    const a={mode: 'draw',formatting: '',coordinates: [
        {cartesianX: 0,cartesianY: 0},{cartesianX: 1,cartesianY: 0}
    ]}
}

function fromPt(pt: number){
    return pt*37.79;
}

function ptToPx(pt: number){
    return pt*1.33;
}
function pxToPt(pt: number){
    return pt*0.75;
}