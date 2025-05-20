// i cant use regex here because the catcodes have to be dynamic
const cat0 = ["\\"];
const cat1 = ["{"];
const cat2 = ["}"];
const cat3 = ["$"];
const cat4 = ["&"];
const cat5 = ["\n"];
const cat6 = ["#"];
const cat7 = ["^"];
const cat8 = ["_"];
const cat10 = [" ","\t"];
const cat11 = ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z",
    "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
];
const cat14 = ["%"];

function mapToCat(cat: string[],code: number) {
    return cat.map((c) => ({char: c, code}));
}

export const DEFAULT_CAT_CODES = [
    ...mapToCat(cat0, 0),
    ...mapToCat(cat1, 1),
    ...mapToCat(cat2, 2),
    ...mapToCat(cat3, 3),
    ...mapToCat(cat4, 4),
    ...mapToCat(cat5, 5),
    ...mapToCat(cat6, 6),
    ...mapToCat(cat7, 7),
    ...mapToCat(cat8, 8),
    ...mapToCat(cat10, 10),
    ...mapToCat(cat11, 11),
    ...mapToCat(cat14, 14),
];


