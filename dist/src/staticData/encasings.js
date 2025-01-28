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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5jYXNpbmdzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3N0YXRpY0RhdGEvZW5jYXNpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE1BQU0sQ0FBTixJQUFZLFdBS1g7QUFMRCxXQUFZLFdBQVc7SUFDbkIsMENBQTJCLENBQUE7SUFDM0IsZ0RBQWlDLENBQUE7SUFDakMsMkNBQTRCLENBQUE7SUFDNUIsNEJBQWEsQ0FBQTtBQUNqQixDQUFDLEVBTFcsV0FBVyxLQUFYLFdBQVcsUUFLdEI7QUFDRCxNQUFNLENBQU4sSUFBWSxZQUdYO0FBSEQsV0FBWSxZQUFZO0lBQ3BCLDZCQUFXLENBQUE7SUFDWCwrQkFBYSxDQUFBO0FBQ2pCLENBQUMsRUFIVyxZQUFZLEtBQVosWUFBWSxRQUd2QjtBQUVELE1BQU0sQ0FBTixJQUFZLFFBUVg7QUFSRCxXQUFZLFFBQVE7SUFDaEIseUJBQVcsQ0FBQTtJQUNYLGlDQUFtQixDQUFBO0lBQ25CLHVDQUF5QixDQUFBO0lBQ3pCLDZDQUErQixDQUFBO0lBQy9CLHVDQUF5QixDQUFBO0lBQ3pCLDJCQUFhLENBQUE7SUFDYix1Q0FBeUIsQ0FBQTtBQUM3QixDQUFDLEVBUlcsUUFBUSxLQUFSLFFBQVEsUUFRbkI7QUFRRCxNQUFNLG1CQUFtQixHQUFDO0lBQ3RCLEVBQUMsSUFBSSxFQUFDLGFBQWEsRUFBQyxPQUFPLEVBQUUsS0FBSyxFQUFDO0lBQ25DLEVBQUMsSUFBSSxFQUFDLE9BQU8sR0FBRTtJQUNmLEVBQUMsSUFBSSxFQUFDLFNBQVMsR0FBRTtJQUNqQixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsVUFBVSxFQUFDO0lBQ2pCLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsU0FBUyxHQUFFO0lBQ2pCLEVBQUMsSUFBSSxFQUFDLFVBQVUsR0FBRTtJQUNsQixFQUFDLElBQUksRUFBQyxPQUFPLEdBQUU7SUFDZixFQUFDLElBQUksRUFBQyxTQUFTLEdBQUU7SUFDakIsRUFBQyxJQUFJLEVBQUMsU0FBUyxHQUFFO0lBQ2pCLEVBQUMsSUFBSSxFQUFDLE9BQU8sR0FBRTtJQUNmLEVBQUMsSUFBSSxFQUFDLE9BQU8sR0FBRTtJQUNmLEVBQUMsSUFBSSxFQUFDLFlBQVksR0FBRTtJQUNwQixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsT0FBTyxHQUFFO0lBQ2YsRUFBQyxJQUFJLEVBQUMsV0FBVyxHQUFFO0lBQ25CLEVBQUMsSUFBSSxFQUFDLFNBQVMsR0FBRTtJQUNqQixFQUFDLElBQUksRUFBQyxVQUFVLEdBQUU7SUFDbEIsRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLE9BQU8sR0FBRTtJQUNmLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxhQUFhLEdBQUU7SUFDckIsRUFBQyxJQUFJLEVBQUMsT0FBTyxHQUFFO0lBQ2YsRUFBQyxJQUFJLEVBQUMsV0FBVyxHQUFFO0lBQ25CLEVBQUMsSUFBSSxFQUFDLFVBQVUsR0FBRTtJQUNsQixFQUFDLElBQUksRUFBQyxVQUFVLEdBQUU7SUFDbEIsRUFBQyxJQUFJLEVBQUMsV0FBVyxHQUFFO0lBQ25CLEVBQUMsSUFBSSxFQUFDLFlBQVksR0FBRTtJQUNwQixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLFFBQVEsR0FBRTtJQUNoQixFQUFDLElBQUksRUFBQyxTQUFTLEdBQUU7SUFDakIsRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxPQUFPLEdBQUU7SUFDZixFQUFDLElBQUksRUFBQyxRQUFRLEdBQUU7SUFDaEIsRUFBQyxJQUFJLEVBQUMsU0FBUyxHQUFFO0lBQ2pCLEVBQUMsSUFBSSxFQUFDLFVBQVUsR0FBRTtJQUNsQixFQUFDLElBQUksRUFBQyxTQUFTLEdBQUU7SUFDakIsRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxZQUFZLEdBQUU7SUFDcEIsRUFBQyxJQUFJLEVBQUMsT0FBTyxHQUFFO0lBQ2YsRUFBQyxJQUFJLEVBQUMsT0FBTyxHQUFFO0lBQ2YsRUFBQyxJQUFJLEVBQUMsSUFBSSxHQUFFO0lBQ1osRUFBQyxJQUFJLEVBQUMsVUFBVSxHQUFFO0lBQ2xCLEVBQUMsSUFBSSxFQUFDLFdBQVcsR0FBRTtJQUNuQixFQUFDLElBQUksRUFBQyxjQUFjLEdBQUU7SUFDdEIsRUFBQyxJQUFJLEVBQUMsZUFBZSxHQUFFO0lBQ3ZCLEVBQUMsSUFBSSxFQUFDLGNBQWMsR0FBRTtJQUN0QixFQUFDLElBQUksRUFBQyxhQUFhLEdBQUU7SUFDckIsRUFBQyxJQUFJLEVBQUMsUUFBUSxHQUFFO0lBQ2hCLEVBQUMsSUFBSSxFQUFDLFNBQVMsR0FBRTtDQUVwQixDQUFBO0FBRUQsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFDLEVBRXJCLENBQUE7QUFDRCxNQUFNLENBQUMsTUFBTSxZQUFZLEdBQUMsRUFFekIsQ0FBQTtBQUNELE1BQU0sQ0FBQyxNQUFNLFNBQVMsR0FBQyxFQUV0QixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcmVmZXJlbmNlIH0gZnJvbSBcIkBwb3BwZXJqcy9jb3JlXCJcclxuXHJcbmV4cG9ydCBlbnVtIEJyYWNrZXRUeXBlIHtcclxuICAgIFBhcmVudGhlc2VzID0gJ3BhcmVudGhlc2VzJyxcclxuICAgIFNxdWFyZUJyYWNrZXRzID0gJ3NxdWFyZUJyYWNrZXRzJyxcclxuICAgIEN1cmx5QnJhY2VzID0gJ2N1cmx5QnJhY2tldCcsXHJcbiAgICBOb25lID0gJ25vbmUnLFxyXG59XHJcbmV4cG9ydCBlbnVtIEJyYWNrZXRTdGF0ZXtcclxuICAgIE9wZW49J29wZW4nLFxyXG4gICAgQ2xvc2U9J2Nsb3NlJyxcclxufVxyXG5cclxuZXhwb3J0IGVudW0gRW5jYXNpbmcge1xyXG4gICAgTm9uZT0nbm9uZScsXHJcbiAgICBCcmFja2V0cz0nYnJhY2tldHMnLFxyXG4gICAgUGFyZW50aGVzZXM9J3BhcmVudGhlc2VzJyxcclxuICAgIFNxdWFyZUJyYWNrZXRzPSdzcXVhcmVCcmFja2V0cycsXHJcbiAgICBDdXJseUJyYWNlcz0nY3VybHlCcmFjZXMnLFxyXG4gICAgU2NvcGU9J3Njb3BlJyxcclxuICAgIFRpa3pwaWN0dXJlPSd0aWt6cGljdHVyZScsXHJcbn1cclxuaW50ZXJmYWNlIEVudmlyb25tZW50e1xyXG4gICAgbmFtZTpzdHJpbmc7XHJcbiAgICBtYXRoamF4Pzpib29sZWFuO1xyXG4gICAgb3BlbjpzdHJpbmc7XHJcbiAgICBjbG9zZTpzdHJpbmc7XHJcbn1cclxuXHJcbmNvbnN0IHBhcnRpYWxFbnZpcm9ubWVudHM9W1xyXG4gICAge25hbWU6J3Rpa3pwaWN0dXJlJyxtYXRoamF4OiBmYWxzZX0sXHJcbiAgICB7bmFtZTonYWxpZ24nLH0sXHJcbiAgICB7bmFtZTonYWxpZ25lZCcsfSxcclxuICAgIHtuYW1lOidjZW50ZXInLH0sXHJcbiAgICB7bmFtZTonZXF1YXRpb24nfSxcclxuICAgIHtuYW1lOidlcXVhdGlvbionLH0sXHJcbiAgICB7bmFtZTonZmlndXJlJyx9LFxyXG4gICAge25hbWU6J2l0ZW1pemUnLH0sXHJcbiAgICB7bmFtZTonbWluaXBhZ2UnLH0sXHJcbiAgICB7bmFtZTondGFibGUnLH0sXHJcbiAgICB7bmFtZTondGFidWxhcicsfSxcclxuICAgIHtuYW1lOid0aGVvcmVtJyx9LFxyXG4gICAge25hbWU6J3Byb29mJyx9LFxyXG4gICAge25hbWU6J2xlbW1hJyx9LFxyXG4gICAge25hbWU6J2RlZmluaXRpb24nLH0sXHJcbiAgICB7bmFtZToncmVtYXJrJyx9LFxyXG4gICAge25hbWU6J3Byb29mJyx9LFxyXG4gICAge25hbWU6J2Nvcm9sbGFyeScsfSxcclxuICAgIHtuYW1lOidleGFtcGxlJyx9LFxyXG4gICAge25hbWU6J2V4ZXJjaXNlJyx9LFxyXG4gICAge25hbWU6J3NvbHV0aW9uJyx9LFxyXG4gICAge25hbWU6J3Byb29mJyx9LFxyXG4gICAge25hbWU6J2VudW1lcmF0ZScsfSxcclxuICAgIHtuYW1lOidkZXNjcmlwdGlvbicsfSxcclxuICAgIHtuYW1lOidxdW90ZScsfSxcclxuICAgIHtuYW1lOidxdW90YXRpb24nLH0sXHJcbiAgICB7bmFtZTonYWJzdHJhY3QnLH0sXHJcbiAgICB7bmFtZTondmVyYmF0aW0nLH0sXHJcbiAgICB7bmFtZTonZmx1c2hsZWZ0Jyx9LFxyXG4gICAge25hbWU6J2ZsdXNocmlnaHQnLH0sXHJcbiAgICB7bmFtZTonYWxpZ24qJyx9LFxyXG4gICAge25hbWU6J2FsaWduZWQqJyx9LFxyXG4gICAge25hbWU6J2dhdGhlcicsfSxcclxuICAgIHtuYW1lOidnYXRoZXIqJyx9LFxyXG4gICAge25hbWU6J211bHRsaW5lJyx9LFxyXG4gICAge25hbWU6J211bHRsaW5lKicsfSxcclxuICAgIHtuYW1lOidzcGxpdCcsfSxcclxuICAgIHtuYW1lOidzcGxpdConLH0sXHJcbiAgICB7bmFtZTonZmxhbGlnbicsfSxcclxuICAgIHtuYW1lOidmbGFsaWduKicsfSxcclxuICAgIHtuYW1lOidhbGlnbmF0Jyx9LFxyXG4gICAge25hbWU6J2FsaWduYXQqJyx9LFxyXG4gICAge25hbWU6J2FsaWduZWRhdCcsfSxcclxuICAgIHtuYW1lOidhbGlnbmVkYXQqJyx9LFxyXG4gICAge25hbWU6J2FycmF5Jyx9LFxyXG4gICAge25hbWU6J2Nhc2VzJyx9LFxyXG4gICAge25hbWU6J0NEJyx9LFxyXG4gICAge25hbWU6J2VxbmFycmF5Jyx9LFxyXG4gICAge25hbWU6J2VxbmFycmF5KicsfSxcclxuICAgIHtuYW1lOidJRUVFZXFuYXJyYXknLH0sXHJcbiAgICB7bmFtZTonSUVFRWVxbmFycmF5KicsfSxcclxuICAgIHtuYW1lOidzdWJlcXVhdGlvbnMnLH0sXHJcbiAgICB7bmFtZTonc21hbGxtYXRyaXgnLH0sXHJcbiAgICB7bmFtZTonbWF0cml4Jyx9LFxyXG4gICAge25hbWU6J3BtYXRyaXgnLH0sXHJcblxyXG5dXHJcblxyXG5leHBvcnQgY29uc3QgYnJhY2tldHM9W1xyXG5cclxuXVxyXG5leHBvcnQgY29uc3QgZW52aXJvbm1lbnRzPVtcclxuXHJcbl1cclxuZXhwb3J0IGNvbnN0IGVuY2FzaW5ncz1bXHJcblxyXG5dIl19