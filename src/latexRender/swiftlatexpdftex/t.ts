import { cleanDir, compileFormatRoutine, compileLaTeXRoutine, FS, log, mkdirRoutine, pk200_cache as temp1, pk404_cache as temp2, setTexliveEndpoint, TEXCACHEROOT, texlive200_cache as temp3, texlive404_cache as temp4, transferCacheDataToHost, transferTexFileToHost, WORKROOT, writeFileRoutine, writeTexFileRoutine } from "./mainSwiftlatex.worker";

let [pk200_cache,pk404_cache,texlive200_cache,texlive404_cache] = [temp1,temp2,temp3,temp4];
declare global {
    interface Window {
      memlog: string;
      initmem?: any;
      mainfile: string;
      texlive_endpoint: string;
    }
}

var Module:any = typeof Module !== "undefined" ? Module : 
{
  print: function (text: string) {
    self.memlog += text + "\n";
    log.regular.push(text);
  },
  printErr: function (text: string) {
    self.memlog += text + "\n";
    log.errors.push(text);
    console.error(text);
  },
  preRun: function () {
    FS.mkdir(TEXCACHEROOT);
    FS.mkdir(WORKROOT);
  },
  onAbort: function () {
    self.memlog += "Engine crashed";
    self.postMessage({
      result: "failed",
      status: -254,
      log: self.memlog,
      myLog: log,
      cmd: "compile",
    });
    return;
  },
};
export default Module;




self["onmessage"] = function (ev) {
    let data = ev["data"];
    let cmd = data["cmd"];
    switch (cmd) {
      case "compilelatex":
        compileLaTeXRoutine();
        break;
      case "compileformat":
        compileFormatRoutine();
        break;
      case "settexliveurl":
        setTexliveEndpoint(data["url"]);
        break;
      case "mkdir":
        mkdirRoutine(data["url"]);
        break;
      case "writefile":
        writeFileRoutine(data["url"], data["src"]);
        break;
      case "setmainfile":
        self.mainfile = data["url"];
        break;
      case "grace":
        console.error("Gracefully Close");
        self.close();
        break;
      case "flushcache":
        cleanDir(WORKROOT);
        break;
      case "fetchfile":
        transferTexFileToHost(data["filename"]);
        break;
      case "fetchcache":
        transferCacheDataToHost();
        break;
      case "writetexfile":
        writeTexFileRoutine(data["url"], data["src"]);
        break;
      case "writecache":
        texlive404_cache = data["texlive404_cache"];
        texlive200_cache = data["texlive200_cache"];
        pk404_cache = data["pk404_cache"];
        pk200_cache = data["pk200_cache"];
        break;
      default:
        console.error("Unknown command " + cmd);
    }
  };