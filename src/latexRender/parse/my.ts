class Document{
    documentClass: ;

}

class Environment{
    name: ;//name of the env
    args: Array<>// arr of args fo the env
    content: Array<>;//arr of nodes that go in the env

}

class Path{
    name: string;
    args: Array<>;// arr of args of the path
    content: Array<>; //arr of node that go in the path
}

class Macro{
    name: string;
    prams: Array<>;// in arr of the pramstos of the macro eatch with metadata sotch as opsnol defolt valus and so on
    content: Array<> //in arr of cintent 
}

class pram{
    opsnol: boolean;
    defValue?: node[]
}

class coordinit{
    xValue: number;
    yValue: number;
    reltivTo?: coordinit
    constructor(xValue: number, yValue: number) {
        
    }
}