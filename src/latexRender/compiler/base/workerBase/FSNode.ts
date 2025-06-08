import { FS } from "./FS";
// Constants for mode operations
const readMode = 292 | 73;
const writeMode = 146;

export type Mount = {
  type: any;
  opts: any;
  mountpoint: string;
  mounts: Mount[];
  root?: FSNode;
}

export class FSNode {
    parent: FSNode;
    mount: Mount; // Replace 'any' with a more specific type if available
    mounted: any;
    id: number;
    name: string;
    mode: number;
    node_ops: { [key: string]: any };
    stream_ops: { [key: string]: any };
    rdev: number;
    name_next: FSNode|undefined
    FS: FS;
    usedBytes: number = 0;
    contents: any//Record<string,FSNode|[]>|null=null;
    timestamp: number;

  constructor(FS: FS,parent: FSNode | undefined, name: string, mode: number, rdev: number) {
    // If no parent is provided, default to this instance.
    if (!parent) {
      parent = this;
    }
    this.FS = FS;
    this.parent = parent;
    this.mount = parent.mount;
    this.mounted = null;
    this.id = this.FS.nextInode++;
    this.name = name;
    this.mode = mode;
    this.node_ops = {};
    this.stream_ops = {};
    this.rdev = rdev;
  }

  get read(): boolean {
    return (this.mode & readMode) === readMode;
  }

  set read(val: boolean) {
    if (val) {
      this.mode |= readMode;
    } else {
      this.mode &= ~readMode;
    }
  }

  get write(): boolean {
    return (this.mode & writeMode) === writeMode;
  }

  set write(val: boolean) {
    if (val) {
      this.mode |= writeMode;
    } else {
      this.mode &= ~writeMode;
    }
  }

  get isFolder(): boolean {
    return FS.prototype.isDir(this.mode);
  }

  get isDevice(): boolean {
    return FS.prototype.isChrdev(this.mode);
  }
}
