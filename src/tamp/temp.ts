import {Parser} from './Parser';

class Nerdamer{
    version = "1.1.16";
    _ = new Parser();
    bigInt = imports.bigInt;
    bigDec = imports.bigDec;
  
    bigDec.set({precision: 250,});
    Groups = {};
  
}



class Collection{
    elements: any[];
    constructor(){
        this.elements = [];
    }
    append(e){this.elements.push(e);}
    getItems(){return this.elements;}
    toString(){return _.pretty_print(this.elements);}
    dimensions(){return this.elements.length;}
    text(options){return "(" + this.elements.map((e) => e.text(options)).join(",") + ")";}
    create(e){var collection = new Collection();if (e) collection.append(e);return collection;}
    clonex(elements){const c = Collection.create();c.elements = this.elements.map((e) => e.clone());return c;}
    expand(options){this.elements = this.elements.map((e) => _.expand(e, options));return this;}
    evaluate(){this.elements = this.elements.map((e) => _.evaluate(e, options));return this;}
    map(lambda){const c2 = this.clone();c2.elements = c2.elements.map((x, i) => lambda(x, i + 1));return c2;}
    subtract(vector){return block("SAFE",function (){var V = vector.elements || vector;if (this.elements.length !== V.length) {return null;}return this.map(function (x, i) {return _.subtract(x, V[i - 1]);});},undefined,this);}
}


