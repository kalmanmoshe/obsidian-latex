import { HEAP8, mmapAlloc } from "../../swiftlatexpdftex/mainSwiftlatex.worker";
import { FS, FSStream, StreamOps } from "./FS";
import { FSNode, Mount } from "./FSNode";

interface OpsTable {
  dir: {
    node: {
      getattr: (node: FSNode) => any;
      setattr: (node: FSNode, attr: any) => void;
      lookup: (parent: FSNode, name: string) => FSNode;
      mknod: (
        parent: FSNode,
        name: string,
        mode: number,
        dev: number,
      ) => FSNode;
      rename: (old_node: FSNode, new_dir: FSNode, new_name: string) => void;
      unlink: (
        parent: { contents: { [x: string]: any }; timestamp: number },
        name: string | number,
      ) => void;
      rmdir: (
        parent: { contents: { [x: string]: any }; timestamp: number },
        name: string,
      ) => void;
      readdir: (node: { contents: {} }) => string[];
      symlink: (parent: FSNode, newname: any, oldpath: any) => FSNode;
    };
    stream: {
      llseek?: (stream?: FSStream, offset?: number, whence?: number) => number;
    };
  };
  file?: {
    node?: {
      getattr?: (node?: FSNode) => any;
      setattr?: (node?: FSNode, attr?: any) => void;
    };
    stream?: StreamOps;
  };
  link?: {
    node?: {
      getattr?: (node?: FSNode) => any;
      setattr?: (node?: FSNode, attr?: any) => void;
      readlink?: (node?: FSNode) => string;
    };
    stream?: {};
  };
  chrdev?: {
    node?: {
      getattr?: (node?: FSNode) => any;
      setattr?: (node?: FSNode, attr?: any) => void;
    };
    stream?: StreamOps;
  };
}

export class MEMFS {
  FS: FS;
  ops_table!: OpsTable;

  constructor(FS: FS) {
    this.FS = FS;

    // Build ops_table once in constructor
    this.ops_table = {
      dir: {
        node: {
          getattr: (node) => this.getattr(node),
          setattr: (node, attr) => this.setattr(node, attr),
          lookup: (parent, name) => this.lookup(parent, name),
          mknod: (parent, name, mode, dev) =>
            this.mknod(parent, name, mode, dev),
          rename: (old_node, new_dir, new_name) =>
            this.rename(old_node, new_dir, new_name),
          unlink: (parent, name) => this.unlink(parent, name),
          rmdir: (parent, name) => this.rmdir(parent, name),
          readdir: (node) => this.readdir(node),
          symlink: (parent, newname, oldpath) =>
            this.symlink(parent, newname, oldpath),
          readlink: (node) => this.readlink(node),
        },
        stream: {
          llseek: (stream, offset, whence) =>
            this.llseek(stream, offset, whence),
        },
      },
      file: {
        node: {
          getattr: (node) => this.getattr(node),
          setattr: (node, attr) => this.setattr(node, attr),
        },
        stream: {
          llseek: (stream, offset, whence) =>
            this.llseek(stream, offset, whence),
          read: (stream, buffer, offset, length, position) =>
            this.read(stream, buffer, offset, length, position),
          write: (stream, buffer, offset, length, position, canOwn) =>
            this.write(stream, buffer, offset, length, position, canOwn),
          allocate: (stream, offset, length) =>
            this.allocate(stream, offset, length),
          mmap: (stream, length, position, prot, flags) =>
            this.mmap(stream, length, position, prot, flags),
          msync: (stream, buffer, offset, length, mmapFlags) =>
            this.msync(stream, buffer, offset, length, mmapFlags),
        },
      },
      link: {
        node: {
          getattr: (node) => this.getattr(node),
          setattr: (node, attr) => this.setattr(node, attr),
          readlink: (node) => this.readlink(node),
        },
        stream: {},
      },
      chrdev: {
        node: {
          getattr: (node) => this.getattr(node),
          setattr: (node, attr) => this.setattr(node, attr),
        },
        stream: this.FS.chrdev_stream_ops,
      },
    };
  }

  // The mount function stays safe:
  mount = (mount: Mount) => {
    return this.createNode(null, "/", 16384 | 511, 0);
  };

  createNode = (
    parent: FSNode | null,
    name: string,
    mode: number,
    dev: number,
  ) => {
    const node = this.FS.createNode(parent, name, mode, dev);
    if (this.FS.isDir(node.mode)) {
      node.node_ops = this.ops_table.dir.node;
      node.stream_ops = this.ops_table.dir.stream;
      node.contents = {};
    } else if (this.FS.isFile(node.mode)) {
      node.node_ops = this.ops_table.file?.node;
      node.stream_ops = this.ops_table.file?.stream;
      node.usedBytes = 0;
      node.contents = null;
    } else if (this.FS.isLink(node.mode)) {
      node.node_ops = this.ops_table.link?.node;
      node.stream_ops = this.ops_table.link?.stream;
    } else if (this.FS.isChrdev(node.mode)) {
      node.node_ops = this.ops_table.chrdev?.node;
      node.stream_ops = this.ops_table.chrdev?.stream;
    }
    node.timestamp = Date.now();
    if (parent && parent.contents) {
      parent.contents[name] = node;
      parent.timestamp = node.timestamp;
    }
    return node;
  };

  // Now: the "pure" versions of all node_ops and stream_ops
  // They do not rely on "being called with correct this", because the ops_table binds them

  getattr(node: FSNode) {
    const attr: any = {};
    attr.dev = this.FS.isChrdev(node.mode) ? node.id : 1;
    attr.ino = node.id;
    attr.mode = node.mode;
    attr.nlink = 1;
    attr.uid = 0;
    attr.gid = 0;
    attr.rdev = node.rdev;
    if (this.FS.isDir(node.mode)) {
      attr.size = 4096;
    } else if (this.FS.isFile(node.mode)) {
      attr.size = node.usedBytes;
    } else if (this.FS.isLink(node.mode)) {
      attr.size = node.link.length;
    } else {
      attr.size = 0;
    }
    attr.atime = new Date(node.timestamp);
    attr.mtime = new Date(node.timestamp);
    attr.ctime = new Date(node.timestamp);
    attr.blksize = 4096;
    attr.blocks = Math.ceil(attr.size / attr.blksize);
    return attr;
  }

  setattr(node: FSNode, attr: any) {
    if (attr.mode !== undefined) {
      node.mode = attr.mode;
    }
    if (attr.timestamp !== undefined) {
      node.timestamp = attr.timestamp;
    }
    if (attr.size !== undefined) {
      this.resizeFileStorage(node, attr.size);
    }
  }

  lookup(parent: FSNode, name: string) {
    throw this.FS.genericErrors[44];
  }

  mknod(parent: FSNode, name: string, mode: number, dev: number) {
    return this.createNode(parent, name, mode, dev);
  }

  rename(old_node: FSNode, new_dir: FSNode, new_name: string) {
    if (this.FS.isDir(old_node.mode)) {
      let new_node;
      try {
        new_node = this.FS.lookupNode(new_dir, new_name);
      } catch (e) {}
      if (new_node) {
        for (const i in new_node.contents) {
          throw new this.FS.ErrnoError(55);
        }
      }
    }
    delete old_node.parent.contents[old_node.name];
    old_node.parent.timestamp = Date.now();
    old_node.name = new_name;
    new_dir.contents[new_name] = old_node;
    new_dir.timestamp = old_node.parent.timestamp;
    old_node.parent = new_dir;
  }

  unlink(parent: any, name: any) {
    delete parent.contents[name];
    parent.timestamp = Date.now();
  }

  rmdir(parent: any, name: any) {
    const node = this.FS.lookupNode(parent, name);
    for (const i in node.contents) {
      throw new this.FS.ErrnoError(55);
    }
    delete parent.contents[name];
    parent.timestamp = Date.now();
  }

  readdir(node: any) {
    const entries = [".", ".."];
    for (const key of Object.keys(node.contents)) {
      entries.push(key);
    }
    return entries;
  }

  symlink(parent: FSNode, newname: any, oldpath: any) {
    const node = this.createNode(parent, newname, 511 | 40960, 0);
    node.link = oldpath;
    return node;
  }

  readlink(node: FSNode) {
    if (!this.FS.isLink(node.mode)) {
      throw new this.FS.ErrnoError(28);
    }
    return node.link;
  }

  read(
    stream: FSStream,
    buffer: any,
    offset: number,
    length: number,
    position: number,
  ) {
    const contents = stream.node.contents;
    if (position >= stream.node.usedBytes) return 0;
    const size = Math.min(stream.node.usedBytes - position, length);
    if (size > 8 && contents.subarray) {
      buffer.set(contents.subarray(position, position + size), offset);
    } else {
      for (let i = 0; i < size; i++)
        buffer[offset + i] = contents[position + i];
    }
    return size;
  }

  write(
    stream: FSStream,
    buffer: any,
    offset: number,
    length: number,
    position: number,
    canOwn: boolean,
  ) {
    if (buffer.buffer === HEAP8.buffer) {
      canOwn = false;
    }
    if (!length) return 0;
    const node = stream.node;
    node.timestamp = Date.now();
    if (buffer.subarray && (!node.contents || node.contents.subarray)) {
      if (canOwn) {
        node.contents = buffer.subarray(offset, offset + length);
        node.usedBytes = length;
        return length;
      } else if (node.usedBytes === 0 && position === 0) {
        node.contents = buffer.slice(offset, offset + length);
        node.usedBytes = length;
        return length;
      } else if (position + length <= node.usedBytes) {
        node.contents.set(buffer.subarray(offset, offset + length), position);
        return length;
      }
    }
    this.expandFileStorage(node, position + length);
    if (node.contents.subarray && buffer.subarray) {
      node.contents.set(buffer.subarray(offset, offset + length), position);
    } else {
      for (let i = 0; i < length; i++) {
        node.contents[position + i] = buffer[offset + i];
      }
    }
    node.usedBytes = Math.max(node.usedBytes, position + length);
    return length;
  }

  llseek(stream: FSStream, offset: number, whence: number) {
    let position = offset;
    if (whence === 1) {
      position += stream.position;
    } else if (whence === 2) {
      if (this.FS.isFile(stream.node.mode)) {
        position += stream.node.usedBytes;
      }
    }
    if (position < 0) {
      throw new this.FS.ErrnoError(28);
    }
    return position;
  }

  allocate(stream: FSStream, offset: number, length: number) {
    this.expandFileStorage(stream.node, offset + length);
    stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
  }

  mmap(
    stream: FSStream,
    length: number,
    position: number,
    prot: number,
    flags: number,
  ) {
    if (!this.FS.isFile(stream.node.mode)) {
      throw new this.FS.ErrnoError(43);
    }
    let ptr;
    let allocated;
    let contents = stream.node.contents;
    if (!(flags & 2) && contents.buffer === HEAP8.buffer) {
      allocated = false;
      ptr = contents.byteOffset;
    } else {
      if (position > 0 || position + length < contents.length) {
        if (contents.subarray) {
          contents = contents.subarray(position, position + length);
        } else {
          contents = Array.prototype.slice.call(
            contents,
            position,
            position + length,
          );
        }
      }
      allocated = true;
      ptr = mmapAlloc(length);
      if (!ptr) {
        throw new this.FS.ErrnoError(48);
      }
      HEAP8.set(contents, ptr);
    }
    return { ptr: ptr, allocated: allocated };
  }

  msync(
    stream: FSStream,
    buffer: any,
    offset: number,
    length: number,
    mmapFlags: number,
  ) {
    this.write(stream, buffer, 0, length, offset, false);
    return 0;
  }

  expandFileStorage(node: FSNode, newCapacity: number) {
    const prevCapacity = node.contents ? node.contents.length : 0;
    if (prevCapacity >= newCapacity) return;
    const CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(
      newCapacity,
      (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) >>> 0,
    );
    if (prevCapacity !== 0) newCapacity = Math.max(newCapacity, 256);
    const oldContents = node.contents;
    node.contents = new Uint8Array(newCapacity);
    if (node.usedBytes > 0)
      node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
  }

  resizeFileStorage(node: FSNode, newSize: number) {
    if (node.usedBytes === newSize) return;
    if (newSize === 0) {
      node.contents = null;
      node.usedBytes = 0;
    } else {
      const oldContents = node.contents;
      node.contents = new Uint8Array(newSize);
      if (oldContents) {
        node.contents.set(
          oldContents.subarray(0, Math.min(newSize, node.usedBytes)),
        );
      }
      node.usedBytes = newSize;
    }
  }
}
