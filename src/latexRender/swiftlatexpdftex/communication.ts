import { 
    compileLaTeXRoutine,
    compileFormatRoutine,
    setTexliveEndpoint,
    removeFileRoutine,
    mkdirRoutine,
    writeFileRoutine,
    cleanDir,
    transferCacheDataToHost,
    transferWorkFilesToHost,
    writeTexFileRoutine,
    transferTexFileToHost,
 } from "./mainSwiftlatex.worker";

import {EngineCommands as Commands} from "../engine";

export function onmessage(eventData: MessageEvent<any>) {
  let data = eventData.data;
  let cmd = data.cmd;
  switch (cmd) {
    case Commands.Compilelatex:
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
    case "removefile":
      removeFileRoutine(data["url"]);
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
      cleanDir(self.constants.TEXCACHEROOT);
      cleanDir(self.constants.WORKROOT);
      self.postMessage({ result: "ok", cmd: "flushCache" });
        break;
    case "flushworkcache":
      cleanDir(self.constants.WORKROOT);
      self.postMessage({ result: "ok", cmd: "flushworkcache" });
      break;
    case "fetchcache":
      transferCacheDataToHost();
      break;
    case "fetchWorkFiles":
      transferWorkFilesToHost();
      break;
    case "writetexfile":
      writeTexFileRoutine(data["url"], data["src"]);
      break;
    case "writecache":
        self.cacheRecord={
            texlive404: data["texlive404_cache"],
            texlive200: data["texlive200_cache"],
            pk404: data["pk404_cache"],
            pk200: data["pk200_cache"],
        }
      self.postMessage({ result: "ok", cmd: "writecache" });
      break;
    default:
      console.error("Unknown command " + cmd);
      self.postMessage({ result: "failed", cmd: cmd });
  }
};

