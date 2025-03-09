import Module,{ cleanDir, compileFormatRoutine, compileLaTeXRoutine, mkdirRoutine, setTexliveEndpoint, TEXCACHEROOT, transferCacheDataToHost, transferTexFileToHost, transferWorkFilesToHost, WORKROOT, writeFileRoutine, writeTexFileRoutine } from "./mainSwiftlatex.worker";
declare global {
    interface Window {
      memlog: string;
      initmem?: any;
      mainfile: string;
      texlive_endpoint: string;
    }
}
export let texlive404_cache = {};
export let texlive200_cache = {};
export let pk404_cache = {};
export let pk200_cache = {};

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
      self.postMessage({ result: "ok", cmd: "setmainfile" });
      break;
    case "grace":
      console.error("Gracefully Close");
      self.close();
      break;
    case "fetchfile":
      transferTexFileToHost(data["filename"]);
      break;
    case "flushCache":
      cleanDir(TEXCACHEROOT);
      cleanDir(WORKROOT);
      self.postMessage({ result: "ok", cmd: "flushCache" });
    case "flushworkcache":
      cleanDir(WORKROOT);
      self.postMessage({ result: "ok", cmd: "flushworkcache" });
      break;
    case "fetchcache":
      transferCacheDataToHost();
      break;
    case "fetchWorkFiles":
      transferWorkFilesToHost();
    case "writetexfile":
      writeTexFileRoutine(data["url"], data["src"]);
      break;
    case "writecache":
      texlive404_cache = data["texlive404_cache"];
      texlive200_cache = data["texlive200_cache"];
      pk404_cache = data["pk404_cache"];
      pk200_cache = data["pk200_cache"];
      self.postMessage({ result: "ok", cmd: "writecache" });
      break;
    default:
      console.error("Unknown command " + cmd);
      self.postMessage({ result: "failed", cmd: cmd });
  }
};