

import {EngineCommands as Commands} from "../compilerBase/engine";

interface CommandHandlers{
  compileLaTeXRoutine?(): void;
  compileFormatRoutine?(): void;
  compilePDFRoutine?(): void;
  transferWorkFilesToHost?(): void;
  removeFileRoutine?(url: string): void;

  writeTexFileRoutine(filename: string, content: string): void;
  setTexliveEndpoint(url: string): void;
  mkdirRoutine(url: string): void;
  writeFileRoutine(url: string, src: string): void;
  transferCacheDataToHost(): void;
  

  cleanDir(url: string): void;
  transferTexFileToHost(filename: string): void;
}

export class Communicator{
  handlers: CommandHandlers;
  constructor(handlers: CommandHandlers) {
    this.handlers = handlers;
    this.onmessage = this.onmessage.bind(this);
  }
  onmessage(eventData: MessageEvent<any>) {
    let data = eventData.data;
    let cmd = data.cmd;
    //console.debug("Communicator received command:", cmd, data);
    switch (cmd) {
      case Commands.Compilelatex:
        this.hasHandler("compileLaTeXRoutine");
        this.handlers.compileLaTeXRoutine!();
        break;
      case Commands.Compileformat:
        this.hasHandler("compileFormatRoutine");
        this.handlers.compileFormatRoutine!();
        break;
      case Commands.Compilepdf:
        this.hasHandler("compilePDFRoutine");
        this.handlers.compilePDFRoutine!();
        break;
      case Commands.Settexliveurl:
        this.handlers.setTexliveEndpoint(data["url"]);
        self.postMessage({ result: "ok", cmd: Commands.Settexliveurl });
        break;
      case "mkdir":
        this.handlers.mkdirRoutine(data["url"]);
        break;
      case "writefile":
        this.handlers.writeFileRoutine(data["url"], data["src"]);
        break;
      case "removefile":
        this.hasHandler("removeFileRoutine");
        this.handlers.removeFileRoutine!(data["url"]);
        break;
      case "setmainfile":
        self.mainfile = data["url"];
        self.postMessage({ result: "ok", cmd: "setmainfile" });
        break;
      case "grace":
        console.warn("Gracefully Close");
        self.close();
        break;
      case "fetchfile":
        this.handlers.transferTexFileToHost(data["filename"]);
        break;
      case "flushCache":
        this.handlers.cleanDir(self.constants.TEXCACHEROOT);
        this.handlers.cleanDir(self.constants.WORKROOT);
        self.postMessage({ result: "ok", cmd: "flushCache" });
          break;
      case "flushworkcache":
        this.handlers.cleanDir(self.constants.WORKROOT);
        self.postMessage({ result: "ok", cmd: "flushworkcache" });
        break;
      case "fetchcache":
        this.handlers.transferCacheDataToHost();
        break;
      case "fetchWorkFiles":
        this.hasHandler("transferWorkFilesToHost");
        this.handlers.transferWorkFilesToHost!();
        break;
      case "writetexfile":
        this.handlers.writeTexFileRoutine(data["url"], data["src"]);
        break;
      case "writecache":
          self.cacheRecord={
              texlive404: data["texlive404_cache"],
              texlive200: data["texlive200_cache"],
              font404: data["font404_cache"],
              font200: data["font200_cache"],
          }
        self.postMessage({ result: "ok", cmd: "writecache" });
        break;
      default:
        console.error("Unknown command " + cmd);
        self.postMessage({ result: "failed", cmd: cmd });
    }
  }
  private hasHandler(key: keyof CommandHandlers)  {
    if(this.handlers[key] === undefined) {
      throw new Error(`Handler for command ${key} is not defined.`);
    }
  }
}