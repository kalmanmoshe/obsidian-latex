export var BracketType;
(function (BracketType) {
    BracketType["Parentheses"] = "parentheses";
    BracketType["SquareBrackets"] = "squareBrackets";
    BracketType["CurlyBraces"] = "curlyBracket";
    BracketType["None"] = "none";
})(BracketType || (BracketType = {}));
export var BracketState;
(function (BracketState) {
    BracketState["Open"] = "open";
    BracketState["Close"] = "close";
})(BracketState || (BracketState = {}));
export var Encasing;
(function (Encasing) {
    Encasing["None"] = "none";
    Encasing["Brackets"] = "brackets";
    Encasing["Parentheses"] = "parentheses";
    Encasing["SquareBrackets"] = "squareBrackets";
    Encasing["CurlyBraces"] = "curlyBraces";
    Encasing["Scope"] = "scope";
    Encasing["Tikzpicture"] = "tikzpicture";
})(Encasing || (Encasing = {}));
const partialEnvironments = [
    { name: 'tikzpicture', mathjax: false },
    { name: 'align', },
    { name: 'aligned', },
    { name: 'center', },
    { name: 'equation' },
    { name: 'equation*', },
    { name: 'figure', },
    { name: 'itemize', },
    { name: 'minipage', },
    { name: 'table', },
    { name: 'tabular', },
    { name: 'theorem', },
    { name: 'proof', },
    { name: 'lemma', },
    { name: 'definition', },
    { name: 'remark', },
    { name: 'proof', },
    { name: 'corollary', },
    { name: 'example', },
    { name: 'exercise', },
    { name: 'solution', },
    { name: 'proof', },
    { name: 'enumerate', },
    { name: 'description', },
    { name: 'quote', },
    { name: 'quotation', },
    { name: 'abstract', },
    { name: 'verbatim', },
    { name: 'flushleft', },
    { name: 'flushright', },
    { name: 'align*', },
    { name: 'aligned*', },
    { name: 'gather', },
    { name: 'gather*', },
    { name: 'multline', },
    { name: 'multline*', },
    { name: 'split', },
    { name: 'split*', },
    { name: 'flalign', },
    { name: 'flalign*', },
    { name: 'alignat', },
    { name: 'alignat*', },
    { name: 'alignedat', },
    { name: 'alignedat*', },
    { name: 'array', },
    { name: 'cases', },
    { name: 'CD', },
    { name: 'eqnarray', },
    { name: 'eqnarray*', },
    { name: 'IEEEeqnarray', },
    { name: 'IEEEeqnarray*', },
    { name: 'subequations', },
    { name: 'smallmatrix', },
    { name: 'matrix', },
    { name: 'pmatrix', },
];
export const brackets = [];
export const environments = [];
export const encasings = [];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5jYXNpbmdzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3N0YXRpY0RhdGEvZW5jYXNpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE1BQU0sQ0FBTixJQUFZLFdBS1g7QUFMRCxXQUFZLFdBQVc7SUFDbkIsMENBQTJCLENBQUE7SUFDM0IsZ0RBQWlDLENBQUE7SUFDakMsMkNBQTRCLENBQUE7SUFDNUIsNEJBQWEsQ0FBQTtBQUNqQixDQUFDLEVBTFcsV0FBVyxLQUFYLFdBQVcsUUFLdEI7QUFDRCxNQUFNLENBQU4sSUFBWSxZQUdYO0FBSEQsV0FBWSxZQUFZO0lBQ3BCLDZCQUFXLENBQUE7SUFDWCwrQkFBYSxDQUFBO0FBQ2pCLENBQUMsRUFIVyxZQUFZLEtBQVosWUFBWSxRQUd2QjtBQUVELE1BQU0sQ0FBTixJQUFZLFFBUVg7QUFSRCxXQUFZLFFBQVE7SUFDaEIseUJBQVcsQ0FBQTtJQUNYLGlDQUFtQixDQUFBO0lBQ25CLHVDQUF5QixDQUFBO0lBQ3pCLDZDQUErQixDQUFBO0lBQy9CLHVDQUF5QixDQUFBO0lBQ3pCLDJCQUFhLENBQUE7SUFDYix1Q0FBeUIsQ0FBQTtBQUM3QixDQUFDLEVBUlcsUUFBUSxLQUFSLFFBQVEsUUFRbkI7QUFRRCxNQUFNLG1CQUFtQixHQUFDO0lBQ3RCLEVBQUMsSUFBSSxFQUFDLGFBQWEsRUFBQyxPQUFPLEVBQUUsS0FBSyxFQUFDO0lBQ25DLEVBQUMsSUFBSSxFQUFDLE9BQU8sR0FBRTtJQUNmLEVBQUMsSUFBSSxFQUFDLFNBQVMsR0FBRTtJQUNqQixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsVUFBVSxFQUFDO0lBQ2pCLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsU0FBUyxHQUFFO0lBQ2pCLEVBQUMsSUFBSSxFQUFDLFVBQVUsR0FBRTtJQUNsQixFQUFDLElBQUksRUFBQyxPQUFPLEdBQUU7SUFDZixFQUFDLElBQUksRUFBQyxTQUFTLEdBQUU7SUFDakIsRUFBQyxJQUFJLEVBQUMsU0FBUyxHQUFFO0lBQ2pCLEVBQUMsSUFBSSxFQUFDLE9BQU8sR0FBRTtJQUNmLEVBQUMsSUFBSSxFQUFDLE9BQU8sR0FBRTtJQUNmLEVBQUMsSUFBSSxFQUFDLFlBQVksR0FBRTtJQUNwQixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsT0FBTyxHQUFFO0lBQ2YsRUFBQyxJQUFJLEVBQUMsV0FBVyxHQUFFO0lBQ25CLEVBQUMsSUFBSSxFQUFDLFNBQVMsR0FBRTtJQUNqQixFQUFDLElBQUksRUFBQyxVQUFVLEdBQUU7SUFDbEIsRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLE9BQU8sR0FBRTtJQUNmLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxhQUFhLEdBQUU7SUFDckIsRUFBQyxJQUFJLEVBQUMsT0FBTyxHQUFFO0lBQ2YsRUFBQyxJQUFJLEVBQUMsV0FBVyxHQUFFO0lBQ25CLEVBQUMsSUFBSSxFQUFDLFVBQVUsR0FBRTtJQUNsQixFQUFDLElBQUksRUFBQyxVQUFVLEdBQUU7SUFDbEIsRUFBQyxJQUFJLEVBQUMsV0FBVyxHQUFFO0lBQ25CLEVBQUMsSUFBSSxFQUFDLFlBQVksR0FBRTtJQUNwQixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLFFBQVEsR0FBRTtJQUNoQixFQUFDLElBQUksRUFBQyxTQUFTLEdBQUU7SUFDakIsRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxPQUFPLEdBQUU7SUFDZixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsU0FBUyxHQUFFO0lBQ2pCLEVBQUMsSUFBSSxFQUFDLFVBQVUsR0FBRTtJQUNsQixFQUFDLElBQUksRUFBQyxTQUFTLEdBQUU7SUFDakIsRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxZQUFZLEdBQUU7SUFDcEIsRUFBQyxJQUFJLEVBQUMsT0FBTyxHQUFFO0lBQ2YsRUFBQyxJQUFJLEVBQUMsT0FBTyxHQUFFO0lBQ2YsRUFBQyxJQUFJLEVBQUMsSUFBSSxHQUFFO0lBQ1osRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxjQUFjLEdBQUU7SUFDdEIsRUFBQyxJQUFJLEVBQUMsZUFBZSxHQUFFO0lBQ3ZCLEVBQUMsSUFBSSxFQUFDLGNBQWMsR0FBRTtJQUN0QixFQUFDLElBQUksRUFBQyxhQUFhLEdBQUU7SUFDckIsRUFBQyxJQUFJLEVBQUMsUUFBUSxHQUFFO0lBQ2hCLEVBQUMsSUFBSSxFQUFDLFNBQVMsR0FBRTtDQUVwQixDQUFBO0FBRUQsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFDLEVBRXJCLENBQUE7QUFDRCxNQUFNLENBQUMsTUFBTSxZQUFZLEdBQUMsRUFFekIsQ0FBQTtBQUNELE1BQU0sQ0FBQyxNQUFNLFNBQVMsR0FBQyxFQUV0QixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcmVmZXJlbmNlIH0gZnJvbSBcIkBwb3BwZXJqcy9jb3JlXCJcblxuZXhwb3J0IGVudW0gQnJhY2tldFR5cGUge1xuICAgIFBhcmVudGhlc2VzID0gJ3BhcmVudGhlc2VzJyxcbiAgICBTcXVhcmVCcmFja2V0cyA9ICdzcXVhcmVCcmFja2V0cycsXG4gICAgQ3VybHlCcmFjZXMgPSAnY3VybHlCcmFja2V0JyxcbiAgICBOb25lID0gJ25vbmUnLFxufVxuZXhwb3J0IGVudW0gQnJhY2tldFN0YXRle1xuICAgIE9wZW49J29wZW4nLFxuICAgIENsb3NlPSdjbG9zZScsXG59XG5cbmV4cG9ydCBlbnVtIEVuY2FzaW5nIHtcbiAgICBOb25lPSdub25lJyxcbiAgICBCcmFja2V0cz0nYnJhY2tldHMnLFxuICAgIFBhcmVudGhlc2VzPSdwYXJlbnRoZXNlcycsXG4gICAgU3F1YXJlQnJhY2tldHM9J3NxdWFyZUJyYWNrZXRzJyxcbiAgICBDdXJseUJyYWNlcz0nY3VybHlCcmFjZXMnLFxuICAgIFNjb3BlPSdzY29wZScsXG4gICAgVGlrenBpY3R1cmU9J3Rpa3pwaWN0dXJlJyxcbn1cbmludGVyZmFjZSBFbnZpcm9ubWVudHtcbiAgICBuYW1lOnN0cmluZztcbiAgICBtYXRoamF4Pzpib29sZWFuO1xuICAgIG9wZW46c3RyaW5nO1xuICAgIGNsb3NlOnN0cmluZztcbn1cblxuY29uc3QgcGFydGlhbEVudmlyb25tZW50cz1bXG4gICAge25hbWU6J3Rpa3pwaWN0dXJlJyxtYXRoamF4OiBmYWxzZX0sXG4gICAge25hbWU6J2FsaWduJyx9LFxuICAgIHtuYW1lOidhbGlnbmVkJyx9LFxuICAgIHtuYW1lOidjZW50ZXInLH0sXG4gICAge25hbWU6J2VxdWF0aW9uJ30sXG4gICAge25hbWU6J2VxdWF0aW9uKicsfSxcbiAgICB7bmFtZTonZmlndXJlJyx9LFxuICAgIHtuYW1lOidpdGVtaXplJyx9LFxuICAgIHtuYW1lOidtaW5pcGFnZScsfSxcbiAgICB7bmFtZTondGFibGUnLH0sXG4gICAge25hbWU6J3RhYnVsYXInLH0sXG4gICAge25hbWU6J3RoZW9yZW0nLH0sXG4gICAge25hbWU6J3Byb29mJyx9LFxuICAgIHtuYW1lOidsZW1tYScsfSxcbiAgICB7bmFtZTonZGVmaW5pdGlvbicsfSxcbiAgICB7bmFtZToncmVtYXJrJyx9LFxuICAgIHtuYW1lOidwcm9vZicsfSxcbiAgICB7bmFtZTonY29yb2xsYXJ5Jyx9LFxuICAgIHtuYW1lOidleGFtcGxlJyx9LFxuICAgIHtuYW1lOidleGVyY2lzZScsfSxcbiAgICB7bmFtZTonc29sdXRpb24nLH0sXG4gICAge25hbWU6J3Byb29mJyx9LFxuICAgIHtuYW1lOidlbnVtZXJhdGUnLH0sXG4gICAge25hbWU6J2Rlc2NyaXB0aW9uJyx9LFxuICAgIHtuYW1lOidxdW90ZScsfSxcbiAgICB7bmFtZToncXVvdGF0aW9uJyx9LFxuICAgIHtuYW1lOidhYnN0cmFjdCcsfSxcbiAgICB7bmFtZTondmVyYmF0aW0nLH0sXG4gICAge25hbWU6J2ZsdXNobGVmdCcsfSxcbiAgICB7bmFtZTonZmx1c2hyaWdodCcsfSxcbiAgICB7bmFtZTonYWxpZ24qJyx9LFxuICAgIHtuYW1lOidhbGlnbmVkKicsfSxcbiAgICB7bmFtZTonZ2F0aGVyJyx9LFxuICAgIHtuYW1lOidnYXRoZXIqJyx9LFxuICAgIHtuYW1lOidtdWx0bGluZScsfSxcbiAgICB7bmFtZTonbXVsdGxpbmUqJyx9LFxuICAgIHtuYW1lOidzcGxpdCcsfSxcbiAgICB7bmFtZTonc3BsaXQqJyx9LFxuICAgIHtuYW1lOidmbGFsaWduJyx9LFxuICAgIHtuYW1lOidmbGFsaWduKicsfSxcbiAgICB7bmFtZTonYWxpZ25hdCcsfSxcbiAgICB7bmFtZTonYWxpZ25hdConLH0sXG4gICAge25hbWU6J2FsaWduZWRhdCcsfSxcbiAgICB7bmFtZTonYWxpZ25lZGF0KicsfSxcbiAgICB7bmFtZTonYXJyYXknLH0sXG4gICAge25hbWU6J2Nhc2VzJyx9LFxuICAgIHtuYW1lOidDRCcsfSxcbiAgICB7bmFtZTonZXFuYXJyYXknLH0sXG4gICAge25hbWU6J2VxbmFycmF5KicsfSxcbiAgICB7bmFtZTonSUVFRWVxbmFycmF5Jyx9LFxuICAgIHtuYW1lOidJRUVFZXFuYXJyYXkqJyx9LFxuICAgIHtuYW1lOidzdWJlcXVhdGlvbnMnLH0sXG4gICAge25hbWU6J3NtYWxsbWF0cml4Jyx9LFxuICAgIHtuYW1lOidtYXRyaXgnLH0sXG4gICAge25hbWU6J3BtYXRyaXgnLH0sXG5cbl1cblxuZXhwb3J0IGNvbnN0IGJyYWNrZXRzPVtcblxuXVxuZXhwb3J0IGNvbnN0IGVudmlyb25tZW50cz1bXG5cbl1cbmV4cG9ydCBjb25zdCBlbmNhc2luZ3M9W1xuXG5dIl19