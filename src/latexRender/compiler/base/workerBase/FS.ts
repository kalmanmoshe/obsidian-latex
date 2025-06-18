import {
  UTF8ArrayToString,
  lengthBytesUTF8,
  stringToUTF8Array,
  intArrayFromString,
} from "./encodingDecoding.";
import Module, {
  ENVIRONMENT_IS_WORKER,
  err,
  FS_getMode,
  FS_modeStringToFlags,
  HEAP8,
  mmapAlloc,
  out,
  PATH,
  PATH_FS,
  randomFill,
  read_,
  TTY,
} from "../../swiftlatexpdftex/mainSwiftlatex.worker";
import { FSNode, Mount } from "./FSNode";
import { MEMFS } from "./MEMFS";

export interface StreamOps {
  open?: (stream: FSStream) => void;
  close?: (stream: FSStream) => void;
  read?: (...args: any[]) => any;
  write?: (...args: any[]) => any;
  llseek?: (...args: any[]) => any;
  allocate?: (stream: FSStream, offset: number, length: number) => void;
  mmap?: (
    stream: FSStream,
    buffer: any,
    offset: number,
    length: number,
    position: number,
    mmapFlags: number,
  ) => { ptr: any; allocated: boolean };
  msync?: (
    stream: FSStream,
    buffer: any,
    offset: number,
    length: number,
    mmapFlags: number,
  ) => void;
}
export class FSStream {
  shared: any = {};
  node?: any;
  stream_ops?: StreamOps;
  path?: string;
  seekable: boolean;
  fd: number;
  ungotten: number[] = [];
  error: boolean;
  get object() {
    return this.node;
  }
  set object(val) {
    this.node = val;
  }
  get isRead() {
    return (this.flags & 2097155) !== 1;
  }
  get isWrite() {
    return (this.flags & 2097155) !== 0;
  }
  get isAppend() {
    return this.flags & 1024;
  }
  get flags() {
    return this.shared.flags;
  }
  set flags(val) {
    this.shared.flags = val;
  }
  get position() {
    return this.shared.position;
  }
  set position(val) {
    this.shared.position = val;
  }
}
type DeviceEntry = { stream_ops: StreamOps };

export class FS {
  root = null as FSNode | null;
  mounts: Mount[] = [];
  devices: Record<number, DeviceEntry> = {};
  streams: (FSStream | null)[] = [];
  nextInode = 1;
  nameTable: Array<FSNode | undefined> = [];
  currentPath = "/";
  initialized = false;
  ignorePermissions = true;
  ErrnoError = class {
    name: string;
    errno: number;
    constructor(errno: number) {
      this.name = "ErrnoError";
      this.errno = errno;
    }
  };
  genericErrors = {};
  filesystems = null;
  syncFSRequests = 0;
  MAX_OPEN_FDS = 4096;
  FSStream = FSStream;
  memfs: MEMFS;
  lookupPath(path: string, opts = {}): { path: string; node: FSNode | null } {
    path = PATH_FS.resolve(path);
    if (!path) return { path: "", node: null };
    var defaults: {
      follow_mount: boolean;
      recurse_count: number;
      parent?: boolean;
      follow?: boolean;
    } = { follow_mount: true, recurse_count: 0 };
    const options = Object.assign(defaults, opts);
    if (options.recurse_count > 8) {
      throw new this.ErrnoError(32);
    }
    var parts = path.split("/").filter((p: string) => !!p);
    if (this.root === null || parts.length === 0) {
      console.warn("moshe err lookupPath: root is null or parts is empty");
      throw new this.ErrnoError(44);
    }
    var current = this.root;
    var current_path = "/";
    for (var i = 0; i < parts.length; i++) {
      var islast = i === parts.length - 1;
      if (islast && options.parent) {
        break;
      }
      current = this.lookupNode(current, parts[i]);
      current_path = PATH.join2(current_path, parts[i]);
      if (this.isMountpoint(current)) {
        if (!islast || (islast && options.follow_mount)) {
          current = current.mounted.root;
        }
      }
      if (!islast || options.follow) {
        var count = 0;
        while (this.isLink(current.mode)) {
          var link = this.readlink(current_path);
          current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
          var lookup = this.lookupPath(current_path, {
            recurse_count: options.recurse_count + 1,
          });
          if (!lookup.node) {
            console.warn("moshe err lookupPath: lookup.node is null");
            throw new this.ErrnoError(44);
          }
          current = lookup.node;
          if (count++ > 40) {
            throw new this.ErrnoError(32);
          }
        }
      }
    }
    return { path: current_path, node: current };
  }
  getPath(node: FSNode): string {
    var path;
    while (true) {
      if (this.isRoot(node)) {
        var mount = node.mount.mountpoint;
        if (!path) return mount;
        return mount[mount.length - 1] !== "/"
          ? `${mount}/${path}`
          : mount + path;
      }
      path = path ? `${node.name}/${path}` : node.name;
      node = node.parent;
    }
  }
  hashName(parentid: number, name: string) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return ((parentid + hash) >>> 0) % this.nameTable.length;
  }
  hashAddNode(node: FSNode) {
    var hash = this.hashName(node.parent.id, node.name);
    node.name_next = this.nameTable[hash];
    this.nameTable[hash] = node;
  }
  hashRemoveNode(node: FSNode) {
    var hash = this.hashName(node.parent.id, node.name);
    if (this.nameTable[hash] === node) {
      this.nameTable[hash] = node.name_next;
    } else {
      var current = this.nameTable[hash];
      while (current) {
        if (current.name_next === node) {
          current.name_next = node.name_next;
          break;
        }
        current = current.name_next;
      }
    }
  }
  lookupNode(parent: FSNode, name: string) {
    var errCode = this.mayLookup(parent);
    if (errCode) {
      throw new this.ErrnoError(errCode);
    }
    var hash = this.hashName(parent.id, name);
    for (var node = this.nameTable[hash]; node; node = node.name_next) {
      var nodeName = node.name;
      if (node.parent.id === parent.id && nodeName === name) {
        return node;
      }
    }
    return this.lookup(parent, name);
  }
  createNode(
    parent: FSNode | null | undefined,
    name: string,
    mode: number,
    rdev: number,
  ) {
    parent = parent || undefined;
    var node = new FSNode(this, parent, name, mode, rdev);
    this.hashAddNode(node);
    return node;
  }
  destroyNode(node: FSNode) {
    this.hashRemoveNode(node);
  }
  isRoot(node: FSNode) {
    return node === node.parent;
  }
  isMountpoint(node: FSNode) {
    return !!node.mounted;
  }
  isFile(mode: number) {
    return (mode & 61440) === 32768;
  }
  isDir(mode: number) {
    return (mode & 61440) === 16384;
  }
  isLink(mode: number) {
    return (mode & 61440) === 40960;
  }
  isChrdev(mode: number) {
    return (mode & 61440) === 8192;
  }
  isBlkdev(mode: number) {
    return (mode & 61440) === 24576;
  }
  isFIFO(mode: number) {
    return (mode & 61440) === 4096;
  }
  isSocket(mode: number) {
    return (mode & 49152) === 49152;
  }
  flagsToPermissionString(flag: number) {
    var perms = ["r", "w", "rw"][flag & 3];
    if (flag & 512) {
      perms += "w";
    }
    return perms;
  }
  nodePermissions(node: FSNode, perms: string | string[]) {
    if (this.ignorePermissions) {
      return 0;
    }
    if (perms.includes("r") && !(node.mode & 292)) {
      return 2;
    } else if (perms.includes("w") && !(node.mode & 146)) {
      return 2;
    } else if (perms.includes("x") && !(node.mode & 73)) {
      return 2;
    }
    return 0;
  }
  mayLookup(dir: FSNode) {
    if (!this.isDir(dir.mode)) return 54;
    var errCode = this.nodePermissions(dir, "x");
    if (errCode) return errCode;
    if (!dir.node_ops.lookup) return 2;
    return 0;
  }
  mayCreate(dir: FSNode, name: string) {
    try {
      var node = this.lookupNode(dir, name);
      return 20;
    } catch (e) {}
    return this.nodePermissions(dir, "wx");
  }
  mayDelete(dir: FSNode, name: string, isdir: boolean) {
    var node;
    try {
      node = this.lookupNode(dir, name);
    } catch (e) {
      return e.errno;
    }
    var errCode = this.nodePermissions(dir, "wx");
    if (errCode) {
      return errCode;
    }
    if (isdir) {
      if (!this.isDir(node.mode)) {
        return 54;
      }
      if (this.isRoot(node) || this.getPath(node) === this.cwd()) {
        return 10;
      }
    } else {
      if (this.isDir(node.mode)) {
        return 31;
      }
    }
    return 0;
  }
  mayOpen(node: FSNode, flags: number) {
    if (!node) {
      return 44;
    }
    if (this.isLink(node.mode)) {
      return 32;
    } else if (this.isDir(node.mode)) {
      if (this.flagsToPermissionString(flags) !== "r" || flags & 512) {
        return 31;
      }
    }
    return this.nodePermissions(node, this.flagsToPermissionString(flags));
  }

  nextfd() {
    for (var fd = 0; fd <= this.MAX_OPEN_FDS; fd++) {
      if (!this.streams[fd]) {
        return fd;
      }
    }
    throw new this.ErrnoError(33);
  }
  getStreamChecked(fd: number) {
    var stream = this.getStream(fd);
    if (!stream) {
      throw new this.ErrnoError(8);
    }
    return stream;
  }

  getStream(fd: number) {
    return this.streams[fd];
  }

  createStream(stream: Partial<FSStream>, fd = -1): FSStream {
    stream = Object.assign(new this.FSStream(), stream);
    if (fd == -1) {
      fd = this.nextfd();
    }
    stream.fd = fd;
    this.streams[fd] = stream as FSStream;
    return stream as FSStream;
  }
  closeStream(fd: number) {
    this.streams[fd] = null;
  }
  chrdev_stream_ops = {
    open: (stream: FSStream) => {
      var device = this.getDevice(stream.node.rdev);
      stream.stream_ops = device.stream_ops;
      stream.stream_ops!.open?.(stream);
    },
    llseek() {
      throw new this.ErrnoError(70);
    },
  };
  major(dev: number) {
    return dev >> 8;
  }
  minor(dev: number) {
    return dev & 255;
  }
  makedev(ma: number, mi: number) {
    return (ma << 8) | mi;
  }

  registerDevice(dev: number, ops: StreamOps) {
    this.devices[dev] = { stream_ops: ops };
  }
  getDevice(dev: number) {
    return this.devices[dev];
  }

  getMounts(mount: Mount) {
    var mounts = [];
    var check = [mount];
    while (check.length) {
      var m = check.pop();
      if (m) {
        mounts.push(m);
        check.push(...m.mounts);
      }
    }
    return mounts;
  }
  syncfs(populate: boolean, callback: (err: any) => any) {
    // Allow callback as first argument
    if (typeof populate === "function") {
      callback = populate;
      populate = false;
    }
    this.syncFSRequests++;
    if (this.syncFSRequests > 1) {
      err(
        `warning: ${this.syncFSRequests} this.syncfs operations in flight at once, probably just doing extra work`,
      );
    }
    if (!this.root) {
      console.warn("moshe err syncfs: root is null");
      this.syncFSRequests--;
      return callback(new this.ErrnoError(10));
    }

    const mounts = this.getMounts(this.root.mount);
    let completed = 0;
    let errored = false;

    const doCallback = (errCode: number | null) => {
      this.syncFSRequests--;
      return callback(errCode);
    };

    const done = (errCode: number | null) => {
      if (errCode) {
        if (!errored) {
          errored = true;
          return doCallback(errCode);
        }
        return;
      }
      if (++completed >= mounts.length) {
        doCallback(null);
      }
    };

    mounts.forEach((mount) => {
      if (!mount.type.syncfs) {
        return done(null);
      }
      mount.type.syncfs(mount, populate, done);
    });
  }
  mount(type: MEMFS, opts: {}, mountpoint: string) {
    var root = mountpoint === "/";
    var pseudo = !mountpoint;
    var node;
    if (root && this.root) {
      throw new this.ErrnoError(10);
    } else if (!root && !pseudo) {
      var lookup = this.lookupPath(mountpoint, { follow_mount: false });
      mountpoint = lookup.path;
      node = lookup.node;
      if (!node) {
        console.warn("moshe err mount: node is null");
        throw new this.ErrnoError(44);
      }
      if (this.isMountpoint(node)) {
        throw new this.ErrnoError(10);
      }
      if (!this.isDir(node.mode)) {
        throw new this.ErrnoError(54);
      }
    }
    var mount: Mount = {
      type: type,
      opts: opts,
      mountpoint: mountpoint,
      mounts: [],
    };
    console.log("type", type, type.m);
    var mountRoot = type.mount(mount);
    mountRoot.mount = mount;
    mount.root = mountRoot;
    if (root) {
      this.root = mountRoot;
    } else if (node) {
      node.mounted = mount;
      if (node.mount) {
        node.mount.mounts.push(mount);
      }
    }
    return mountRoot;
  }
  unmount(mountpoint: string) {
    var lookup = this.lookupPath(mountpoint, { follow_mount: false });
    if (!lookup.node) {
      console.warn("moshe err unmount: lookup.node is null");
      throw new this.ErrnoError(44);
    }
    if (!this.isMountpoint(lookup.node)) {
      throw new this.ErrnoError(28);
    }
    var node = lookup.node;
    var mount = node.mounted;
    var mounts = this.getMounts(mount);
    for (let idx = 0; idx < this.nameTable.length; idx++) {
      var current = this.nameTable[idx];
      while (current) {
        var next = current.name_next;
        if (mounts.includes(current.mount)) {
          this.destroyNode(current);
        }
        current = next;
      }
    }
    node.mounted = null;
    var idx = node.mount.mounts.indexOf(mount);
    node.mount.mounts.splice(idx, 1);
  }
  lookup(parent: FSNode, name: string) {
    return parent.node_ops.lookup(parent, name);
  }
  mknod(path: string, mode: number, dev: number) {
    var lookup = this.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    if (!name || name === "." || name === "..") {
      throw new this.ErrnoError(28);
    }
    var errCode = this.mayCreate(parent, name);
    if (errCode) {
      throw new this.ErrnoError(errCode);
    }
    if (!parent?.node_ops.mknod) {
      throw new this.ErrnoError(63);
    }
    return parent.node_ops.mknod(parent, name, mode, dev);
  }
  create(path: string, mode?: number) {
    mode = mode !== undefined ? mode : 438;
    mode &= 4095;
    mode |= 32768;
    return this.mknod(path, mode, 0);
  }
  mkdir(path: string, mode?: number) {
    mode = mode !== undefined ? mode : 511;
    mode &= 511 | 512;
    mode |= 16384;
    return this.mknod(path, mode, 0);
  }
  mkdirTree(path: string, mode?: number) {
    var dirs = path.split("/");
    var d = "";
    for (var i = 0; i < dirs.length; ++i) {
      if (!dirs[i]) continue;
      d += "/" + dirs[i];
      try {
        this.mkdir(d, mode);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
    }
  }
  mkdev(path: string, mode: number, dev?: any) {
    if (typeof dev == "undefined") {
      dev = mode;
      mode = 438;
    }
    mode |= 8192;
    return this.mknod(path, mode, dev);
  }
  symlink(oldpath: string, newpath: string) {
    if (!PATH_FS.resolve(oldpath)) {
      throw new this.ErrnoError(44);
    }
    var lookup = this.lookupPath(newpath, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new this.ErrnoError(44);
    }
    var newname = PATH.basename(newpath);
    var errCode = this.mayCreate(parent, newname);
    if (errCode) {
      throw new this.ErrnoError(errCode);
    }
    if (!parent.node_ops.symlink) {
      throw new this.ErrnoError(63);
    }
    return parent.node_ops.symlink(parent, newname, oldpath);
  }
  rename(old_path: string, new_path: string) {
    var old_dirname = PATH.dirname(old_path);
    var new_dirname = PATH.dirname(new_path);
    var old_name = PATH.basename(old_path);
    var new_name = PATH.basename(new_path);
    var lookup, old_dir, new_dir;
    lookup = this.lookupPath(old_path, { parent: true });
    old_dir = lookup.node;
    lookup = this.lookupPath(new_path, { parent: true });
    new_dir = lookup.node;
    if (!old_dir || !new_dir) throw new this.ErrnoError(44);
    if (old_dir.mount !== new_dir.mount) {
      throw new this.ErrnoError(75);
    }
    var old_node = this.lookupNode(old_dir, old_name);
    var relative = PATH_FS.relative(old_path, new_dirname);
    if (relative.charAt(0) !== ".") {
      throw new this.ErrnoError(28);
    }
    relative = PATH_FS.relative(new_path, old_dirname);
    if (relative.charAt(0) !== ".") {
      throw new this.ErrnoError(55);
    }
    var new_node;
    try {
      new_node = this.lookupNode(new_dir, new_name);
    } catch (e) {}
    if (old_node === new_node) {
      return;
    }
    var isdir = this.isDir(old_node.mode);
    var errCode = this.mayDelete(old_dir, old_name, isdir);
    if (errCode) {
      throw new this.ErrnoError(errCode);
    }
    errCode = new_node
      ? this.mayDelete(new_dir, new_name, isdir)
      : this.mayCreate(new_dir, new_name);
    if (errCode) {
      throw new this.ErrnoError(errCode);
    }
    if (!old_dir.node_ops.rename) {
      throw new this.ErrnoError(63);
    }
    if (
      this.isMountpoint(old_node) ||
      (new_node && this.isMountpoint(new_node))
    ) {
      throw new this.ErrnoError(10);
    }
    if (new_dir !== old_dir) {
      errCode = this.nodePermissions(old_dir, "w");
      if (errCode) {
        throw new this.ErrnoError(errCode);
      }
    }
    this.hashRemoveNode(old_node);
    try {
      old_dir.node_ops.rename(old_node, new_dir, new_name);
    } catch (e) {
      throw e;
    } finally {
      this.hashAddNode(old_node);
    }
  }
  rmdir(path: string) {
    var lookup = this.lookupPath(path, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      console.warn("moshe err rmdir: parent is null");
      throw new this.ErrnoError(44);
    }
    var name = PATH.basename(path);
    var node = this.lookupNode(parent, name);
    var errCode = this.mayDelete(parent, name, true);
    if (errCode) {
      throw new this.ErrnoError(errCode);
    }
    if (!parent.node_ops.rmdir) {
      throw new this.ErrnoError(63);
    }
    if (this.isMountpoint(node)) {
      throw new this.ErrnoError(10);
    }
    parent.node_ops.rmdir(parent, name);
    this.destroyNode(node);
  }
  readdir(path: string) {
    var lookup = this.lookupPath(path, { follow: true });
    var node = lookup.node;
    if (!node) {
      console.warn("moshe err readdir: node is null");
      throw new this.ErrnoError(44);
    }
    if (!node.node_ops.readdir) {
      throw new this.ErrnoError(54);
    }
    return node.node_ops.readdir(node);
  }
  unlink(path: string) {
    var lookup = this.lookupPath(path, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new this.ErrnoError(44);
    }
    var name = PATH.basename(path);
    var node = this.lookupNode(parent, name);
    var errCode = this.mayDelete(parent, name, false);
    if (errCode) {
      throw new this.ErrnoError(errCode);
    }
    if (!parent.node_ops.unlink) {
      throw new this.ErrnoError(63);
    }
    if (this.isMountpoint(node)) {
      throw new this.ErrnoError(10);
    }
    parent.node_ops.unlink(parent, name);
    this.destroyNode(node);
  }
  readlink(path: string) {
    var lookup = this.lookupPath(path);
    var link = lookup.node;
    if (!link) {
      throw new this.ErrnoError(44);
    }
    if (!link.node_ops.readlink) {
      throw new this.ErrnoError(28);
    }
    return PATH_FS.resolve(
      this.getPath(link.parent),
      link.node_ops.readlink(link),
    );
  }
  stat(path: string, dontFollow?: any) {
    var lookup = this.lookupPath(path, { follow: !dontFollow });
    var node = lookup.node;
    if (!node) {
      throw new this.ErrnoError(44);
    }
    if (!node.node_ops.getattr) {
      throw new this.ErrnoError(63);
    }
    return node.node_ops.getattr(node);
  }
  lstat(path: string) {
    return this.stat(path, true);
  }
  chmod(path: string | FSNode, mode: number, dontFollow?: any) {
    let node;
    if (typeof path == "string") {
      var lookup = this.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node) {
      console.warn("moshe err chmod: node is null");
      throw new this.ErrnoError(44);
    }
    if (!node.node_ops.setattr) {
      throw new this.ErrnoError(63);
    }
    node.node_ops.setattr(node, {
      mode: (mode & 4095) | (node.mode & ~4095),
      timestamp: Date.now(),
    });
  }
  lchmod(path: string | FSNode, mode: number) {
    this.chmod(path, mode, true);
  }
  fchmod(fd: number, mode: number) {
    var stream = this.getStreamChecked(fd);
    this.chmod(stream.node, mode);
  }
  chown(path: string | FSNode, uid: any, gid: any, dontFollow?: any) {
    var node;
    if (typeof path == "string") {
      var lookup = this.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node) {
      console.warn("moshe err chown: node is null");
      throw new this.ErrnoError(44);
    }
    if (!node.node_ops.setattr) {
      throw new this.ErrnoError(63);
    }
    node.node_ops.setattr(node, { timestamp: Date.now() });
  }
  lchown(path: string | FSNode, uid: any, gid: any) {
    this.chown(path, uid, gid, true);
  }
  fchown(fd: number, uid: any, gid: any) {
    var stream = this.getStreamChecked(fd);
    this.chown(stream.node, uid, gid);
  }
  truncate(path: string, len: number) {
    if (len < 0) {
      throw new this.ErrnoError(28);
    }
    var node;
    if (typeof path == "string") {
      var lookup = this.lookupPath(path, { follow: true });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node) {
      console.warn("moshe err truncate: node is null");
      throw new this.ErrnoError(44);
    }
    if (!node.node_ops.setattr) {
      throw new this.ErrnoError(63);
    }
    if (this.isDir(node.mode)) {
      throw new this.ErrnoError(31);
    }
    if (!this.isFile(node.mode)) {
      throw new this.ErrnoError(28);
    }
    var errCode = this.nodePermissions(node, "w");
    if (errCode) {
      throw new this.ErrnoError(errCode);
    }
    node.node_ops.setattr(node, { size: len, timestamp: Date.now() });
  }
  ftruncate(fd: number, len: number) {
    var stream = this.getStreamChecked(fd);
    if ((stream.flags & 2097155) === 0) {
      throw new this.ErrnoError(28);
    }
    this.truncate(stream.node, len);
  }
  utime(path: string, atime: number, mtime: number) {
    const lookup = this.lookupPath(path, { follow: true });
    const node = lookup.node;
    if (!node) {
      console.warn("moshe err utime: node is null");
      throw new this.ErrnoError(44);
    }
    node.node_ops.setattr(node, { timestamp: Math.max(atime, mtime) });
  }
  open(path: string, flags: number, mode?: any) {
    if (path === "") {
      throw new this.ErrnoError(44);
    }
    flags = typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
    mode = typeof mode == "undefined" ? 438 : mode;
    if (flags & 64) {
      mode = (mode & 4095) | 32768;
    } else {
      mode = 0;
    }
    var node;
    if (typeof path == "object") {
      node = path;
    } else {
      path = PATH.normalize(path);
      try {
        var lookup = this.lookupPath(path, { follow: !(flags & 131072) });
        node = lookup.node;
      } catch (e) {}
    }
    var created = false;
    if (flags & 64) {
      if (node) {
        if (flags & 128) {
          throw new this.ErrnoError(20);
        }
      } else {
        node = this.mknod(path, mode, 0);
        created = true;
      }
    }
    if (!node) {
      throw new this.ErrnoError(44);
    }
    if (this.isChrdev(node.mode)) {
      flags &= ~512;
    }
    if (flags & 65536 && !this.isDir(node.mode)) {
      throw new this.ErrnoError(54);
    }
    if (!created) {
      var errCode = this.mayOpen(node, flags);
      if (errCode) {
        throw new this.ErrnoError(errCode);
      }
    }
    if (flags & 512 && !created) {
      this.truncate(node, 0);
    }
    flags &= ~(128 | 512 | 131072);
    var stream = this.createStream({
      node: node,
      path: this.getPath(node),
      flags: flags,
      seekable: true,
      position: 0,
      stream_ops: node.stream_ops,
      ungotten: [],
      error: false,
    });
    if (stream.stream_ops.open) {
      stream.stream_ops.open(stream);
    }
    if (Module["logReadFiles"] && !(flags & 1)) {
      if (!this.readFiles) this.readFiles = {};
      if (!(path in this.readFiles)) {
        this.readFiles[path] = 1;
      }
    }
    return stream;
  }
  close(stream) {
    if (this.isClosed(stream)) {
      throw new this.ErrnoError(8);
    }
    if (stream.getdents) stream.getdents = null;
    try {
      if (stream.stream_ops.close) {
        stream.stream_ops.close(stream);
      }
    } catch (e) {
      throw e;
    } finally {
      this.closeStream(stream.fd);
    }
    stream.fd = null;
  }
  isClosed(stream) {
    return stream.fd === null;
  }
  llseek(stream, offset, whence) {
    if (this.isClosed(stream)) {
      throw new this.ErrnoError(8);
    }
    if (!stream.seekable || !stream.stream_ops.llseek) {
      throw new this.ErrnoError(70);
    }
    if (whence != 0 && whence != 1 && whence != 2) {
      throw new this.ErrnoError(28);
    }
    stream.position = stream.stream_ops.llseek(stream, offset, whence);
    stream.ungotten = [];
    return stream.position;
  }
  read(stream, buffer, offset, length, position) {
    if (length < 0 || position < 0) {
      throw new this.ErrnoError(28);
    }
    if (this.isClosed(stream)) {
      throw new this.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new this.ErrnoError(8);
    }
    if (this.isDir(stream.node.mode)) {
      throw new this.ErrnoError(31);
    }
    if (!stream.stream_ops.read) {
      throw new this.ErrnoError(28);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new this.ErrnoError(70);
    }
    var bytesRead = stream.stream_ops.read(
      stream,
      buffer,
      offset,
      length,
      position,
    );
    if (!seeking) stream.position += bytesRead;
    return bytesRead;
  }
  write(stream, buffer, offset, length, position, canOwn?: any) {
    if (length < 0 || position < 0) {
      throw new this.ErrnoError(28);
    }
    if (this.isClosed(stream)) {
      throw new this.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new this.ErrnoError(8);
    }
    if (this.isDir(stream.node.mode)) {
      throw new this.ErrnoError(31);
    }
    if (!stream.stream_ops.write) {
      throw new this.ErrnoError(28);
    }
    if (stream.seekable && stream.flags & 1024) {
      this.llseek(stream, 0, 2);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new this.ErrnoError(70);
    }
    var bytesWritten = stream.stream_ops.write(
      stream,
      buffer,
      offset,
      length,
      position,
      canOwn,
    );
    if (!seeking) stream.position += bytesWritten;
    return bytesWritten;
  }
  allocate(stream, offset, length) {
    if (this.isClosed(stream)) {
      throw new this.ErrnoError(8);
    }
    if (offset < 0 || length <= 0) {
      throw new this.ErrnoError(28);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new this.ErrnoError(8);
    }
    if (!this.isFile(stream.node.mode) && !this.isDir(stream.node.mode)) {
      throw new this.ErrnoError(43);
    }
    if (!stream.stream_ops.allocate) {
      throw new this.ErrnoError(138);
    }
    stream.stream_ops.allocate(stream, offset, length);
  }
  mmap(stream, length, position, prot, flags) {
    if (
      (prot & 2) !== 0 &&
      (flags & 2) === 0 &&
      (stream.flags & 2097155) !== 2
    ) {
      throw new this.ErrnoError(2);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new this.ErrnoError(2);
    }
    if (!stream.stream_ops.mmap) {
      throw new this.ErrnoError(43);
    }
    return stream.stream_ops.mmap(stream, length, position, prot, flags);
  }
  msync(stream, buffer, offset, length, mmapFlags) {
    if (!stream.stream_ops.msync) {
      return 0;
    }
    return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
  }
  munmap: (stream) => 0;
  ioctl(stream, cmd, arg) {
    if (!stream.stream_ops.ioctl) {
      throw new this.ErrnoError(59);
    }
    return stream.stream_ops.ioctl(stream, cmd, arg);
  }
  readFile(path, opts = {}) {
    opts.flags = opts.flags || 0;
    opts.encoding = opts.encoding || "binary";
    if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
      throw new Error(`Invalid encoding type "${opts.encoding}"`);
    }
    var ret;
    var stream = this.open(path, opts.flags);
    var stat = this.stat(path);
    var length = stat.size;
    var buf = new Uint8Array(length);
    this.read(stream, buf, 0, length, 0);
    if (opts.encoding === "utf8") {
      ret = UTF8ArrayToString(buf, 0);
    } else if (opts.encoding === "binary") {
      ret = buf;
    }
    this.close(stream);
    return ret;
  }
  writeFile(path, data, opts = {}) {
    opts.flags = opts.flags || 577;
    var stream = this.open(path, opts.flags, opts.mode);
    if (typeof data == "string") {
      var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
      var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
      this.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
    } else if (ArrayBuffer.isView(data)) {
      this.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
    } else {
      throw new Error("Unsupported data type");
    }
    this.close(stream);
  }
  cwd() {
    return this.currentPath;
  }

  chdir(path) {
    var lookup = this.lookupPath(path, { follow: true });
    if (lookup.node === null) {
      throw new this.ErrnoError(44);
    }
    if (!this.isDir(lookup.node.mode)) {
      throw new this.ErrnoError(54);
    }
    var errCode = this.nodePermissions(lookup.node, "x");
    if (errCode) {
      throw new this.ErrnoError(errCode);
    }
    this.currentPath = lookup.path;
  }
  createDefaultDirectories() {
    this.mkdir("/tmp");
    this.mkdir("/home");
    this.mkdir("/home/web_user");
  }
  createDefaultDevices() {
    this.mkdir("/dev");
    this.registerDevice(this.makedev(1, 3), {
      read: () => 0,
      write: (stream, buffer, offset, length, pos) => length,
    });
    this.mkdev("/dev/null", this.makedev(1, 3));
    TTY.register(this.makedev(5, 0), TTY.default_tty_ops);
    TTY.register(this.makedev(6, 0), TTY.default_tty1_ops);
    this.mkdev("/dev/tty", this.makedev(5, 0));
    this.mkdev("/dev/tty1", this.makedev(6, 0));
    var randomBuffer = new Uint8Array(1024),
      randomLeft = 0;
    var randomByte = () => {
      if (randomLeft === 0) {
        randomLeft = randomFill(randomBuffer).byteLength;
      }
      return randomBuffer[--randomLeft];
    };
    this.createDevice("/dev", "random", randomByte);
    this.createDevice("/dev", "urandom", randomByte);
    this.mkdir("/dev/shm");
    this.mkdir("/dev/shm/tmp");
  }
  createSpecialDirectories() {
    this.mkdir("/proc");
    var proc_self = this.mkdir("/proc/self");
    this.mkdir("/proc/self/fd");
    const fs = this; // <-- capture FS instance
    const memfs = new MEMFS(this);
    memfs.mount = function (mount: Mount) {
      var node = fs.createNode(proc_self, "fd", 16384 | 511, 73);
      node.node_ops = {
        lookup(parent: FSNode, name: string): FSNode | null {
          const fd = +name;
          const stream = fs.getStreamChecked(fd);
          // Create a proper FSNode for the fd
          const node = new FSNode(this, parent, "fd:" + fd, 40960, 0);
          node.node_ops = {
            readlink: () => stream.path,
          };
          return node;
        },
      };
      return node;
    };
    this.mount(memfs, {}, "/proc/self/fd");
  }
  createStandardStreams() {
    if (Module["stdin"]) {
      this.createDevice("/dev", "stdin", Module["stdin"]);
    } else {
      this.symlink("/dev/tty", "/dev/stdin");
    }
    if (Module["stdout"]) {
      this.createDevice("/dev", "stdout", null, Module["stdout"]);
    } else {
      this.symlink("/dev/tty", "/dev/stdout");
    }
    if (Module["stderr"]) {
      this.createDevice("/dev", "stderr", null, Module["stderr"]);
    } else {
      this.symlink("/dev/tty1", "/dev/stderr");
    }
    var stdin = this.open("/dev/stdin", 0);
    var stdout = this.open("/dev/stdout", 1);
    var stderr = this.open("/dev/stderr", 1);
  }
  staticInit() {
    [44].forEach((code) => {
      this.genericErrors[code] = new this.ErrnoError(code);
      this.genericErrors[code].stack = "<generic error, no stack>";
    });
    this.nameTable = new Array(4096);
    this.mount(this.memfs, {}, "/");
    this.createDefaultDirectories();
    this.createDefaultDevices();
    this.createSpecialDirectories();
    this.filesystems = { MEMFS: MEMFS };
  }
  init(input?: any, output?: any, error?: any) {
    this.init.initialized = true;
    Module["stdin"] = input || Module["stdin"];
    Module["stdout"] = output || Module["stdout"];
    Module["stderr"] = error || Module["stderr"];
    this.createStandardStreams();
  }
  quit() {
    this.init.initialized = false;
    for (var i = 0; i < this.streams.length; i++) {
      var stream = this.streams[i];
      if (!stream) {
        continue;
      }
      this.close(stream);
    }
  }
  findObject(path, dontResolveLastLink) {
    var ret = this.analyzePath(path, dontResolveLastLink);
    if (!ret.exists) {
      return null;
    }
    return ret.object;
  }
  analyzePath(path, dontResolveLastLink) {
    try {
      var lookup = this.lookupPath(path, { follow: !dontResolveLastLink });
      path = lookup.path;
    } catch (e) {}
    var ret = {
      isRoot: false,
      exists: false,
      error: 0,
      name: null,
      path: null,
      object: null,
      parentExists: false,
      parentPath: null,
      parentObject: null,
    };
    try {
      var lookup = this.lookupPath(path, { parent: true });
      ret.parentExists = true;
      ret.parentPath = lookup.path;
      ret.parentObject = lookup.node;
      ret.name = PATH.basename(path);
      lookup = this.lookupPath(path, { follow: !dontResolveLastLink });
      ret.exists = true;
      ret.path = lookup.path;
      ret.object = lookup.node;
      ret.name = lookup.node.name;
      ret.isRoot = lookup.path === "/";
    } catch (e) {
      ret.error = e.errno;
    }
    return ret;
  }
  createPath(parent: string | FSNode, path: string) {
    parent = typeof parent == "string" ? parent : this.getPath(parent);
    var parts = path.split("/").reverse();
    var current;
    while (parts.length) {
      var part = parts.pop();
      if (!part) continue;
      current = PATH.join2(parent, part);
      try {
        this.mkdir(current);
      } catch (e) {}
      parent = current;
    }
    return current || null;
  }
  createFile(
    parent: string | FSNode,
    name: string,
    properties,
    canRead,
    canWrite,
  ) {
    var path = PATH.join2(
      typeof parent == "string" ? parent : this.getPath(parent),
      name,
    );
    var mode = FS_getMode(canRead, canWrite);
    return this.create(path, mode);
  }
  createDataFile(
    parent: string | FSNode,
    name,
    data,
    canRead,
    canWrite,
    canOwn,
  ) {
    var path = name;
    if (parent) {
      parent = typeof parent == "string" ? parent : this.getPath(parent);
      path = name ? PATH.join2(parent, name) : parent;
    }
    var mode = FS_getMode(canRead, canWrite);
    var node = this.create(path, mode);
    if (data) {
      if (typeof data == "string") {
        var arr = new Array(data.length);
        for (var i = 0, len = data.length; i < len; ++i)
          arr[i] = data.charCodeAt(i);
        data = arr;
      }
      this.chmod(node, mode | 146);
      var stream = this.open(node, 577);
      this.write(stream, data, 0, data.length, 0, canOwn);
      this.close(stream);
      this.chmod(node, mode);
    }
  }
  createDevice(parent, name, input, output?: any) {
    var path = PATH.join2(
      typeof parent == "string" ? parent : this.getPath(parent),
      name,
    );
    var mode = FS_getMode(!!input, !!output);
    if (!this.createDevice.major) this.createDevice.major = 64;
    var dev = this.makedev(this.createDevice.major++, 0);
    this.registerDevice(dev, {
      open(stream) {
        stream.seekable = false;
      },
      close(stream) {
        if (output?.buffer?.length) {
          output(10);
        }
      },
      read(stream, buffer, offset, length, pos) {
        var bytesRead = 0;
        for (var i = 0; i < length; i++) {
          var result;
          try {
            result = input();
          } catch (e) {
            throw new this.ErrnoError(29);
          }
          if (result === undefined && bytesRead === 0) {
            throw new this.ErrnoError(6);
          }
          if (result === null || result === undefined) break;
          bytesRead++;
          buffer[offset + i] = result;
        }
        if (bytesRead) {
          stream.node.timestamp = Date.now();
        }
        return bytesRead;
      },
      write(stream, buffer, offset, length, pos) {
        for (var i = 0; i < length; i++) {
          try {
            output(buffer[offset + i]);
          } catch (e) {
            throw new this.ErrnoError(29);
          }
        }
        if (length) {
          stream.node.timestamp = Date.now();
        }
        return i;
      },
    });
    return this.mkdev(path, mode, dev);
  }
  forceLoadFile(obj) {
    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
    if (typeof XMLHttpRequest != "undefined") {
      throw new Error(
        "Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.",
      );
    } else if (read_) {
      try {
        obj.contents = intArrayFromString(read_(obj.url), true);
        obj.usedBytes = obj.contents.length;
      } catch (e) {
        throw new this.ErrnoError(29);
      }
    } else {
      throw new Error("Cannot load without read() or XMLHttpRequest.");
    }
  }
  createLazyFile(parent, name, url, canRead, canWrite) {
    function LazyUint8Array() {
      this.lengthKnown = false;
      this.chunks = [];
    }
    LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
      if (idx > this.length - 1 || idx < 0) {
        return undefined;
      }
      var chunkOffset = idx % this.chunkSize;
      var chunkNum = (idx / this.chunkSize) | 0;
      return this.getter(chunkNum)[chunkOffset];
    };
    LazyUint8Array.prototype.setDataGetter =
      function LazyUint8Array_setDataGetter(getter) {
        this.getter = getter;
      };
    LazyUint8Array.prototype.cacheLength =
      function LazyUint8Array_cacheLength() {
        var xhr = new XMLHttpRequest();
        xhr.open("HEAD", url, false);
        xhr.send(null);
        if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
          throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
        var datalength = Number(xhr.getResponseHeader("Content-length"));
        var header;
        var hasByteServing =
          (header = xhr.getResponseHeader("Accept-Ranges")) &&
          header === "bytes";
        var usesGzip =
          (header = xhr.getResponseHeader("Content-Encoding")) &&
          header === "gzip";
        var chunkSize = 1024 * 1024;
        if (!hasByteServing) chunkSize = datalength;
        var doXHR = (from, to) => {
          if (from > to)
            throw new Error(
              "invalid range (" + from + ", " + to + ") or no bytes requested!",
            );
          if (to > datalength - 1)
            throw new Error(
              "only " + datalength + " bytes available! programmer error!",
            );
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          if (datalength !== chunkSize)
            xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
          xhr.responseType = "arraybuffer";
          if (xhr.overrideMimeType) {
            xhr.overrideMimeType("text/plain; charset=x-user-defined");
          }
          xhr.send(null);
          if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
            throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          if (xhr.response !== undefined) {
            return new Uint8Array(xhr.response || []);
          }
          return intArrayFromString(xhr.responseText || "", true);
        };
        var lazyArray = this;
        lazyArray.setDataGetter((chunkNum) => {
          var start = chunkNum * chunkSize;
          var end = (chunkNum + 1) * chunkSize - 1;
          end = Math.min(end, datalength - 1);
          if (typeof lazyArray.chunks[chunkNum] == "undefined") {
            lazyArray.chunks[chunkNum] = doXHR(start, end);
          }
          if (typeof lazyArray.chunks[chunkNum] == "undefined")
            throw new Error("doXHR failed!");
          return lazyArray.chunks[chunkNum];
        });
        if (usesGzip || !datalength) {
          chunkSize = datalength = 1;
          datalength = this.getter(0).length;
          chunkSize = datalength;
          out(
            "LazyFiles on gzip forces download of the whole file when length is accessed",
          );
        }
        this._length = datalength;
        this._chunkSize = chunkSize;
        this.lengthKnown = true;
      };
    if (typeof XMLHttpRequest != "undefined") {
      if (!ENVIRONMENT_IS_WORKER)
        throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
      var lazyArray = new LazyUint8Array();
      Object.defineProperties(lazyArray, {
        length: {
          get: function () {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          },
        },
        chunkSize: {
          get: function () {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          },
        },
      });
      var properties = { isDevice: false, contents: lazyArray };
    } else {
      var properties = { isDevice: false, url: url };
    }
    var node = this.createFile(parent, name, properties, canRead, canWrite);
    if (properties.contents) {
      node.contents = properties.contents;
    } else if (properties.url) {
      node.contents = null;
      node.url = properties.url;
    }
    Object.defineProperties(node, {
      usedBytes: {
        get: function () {
          return this.contents.length;
        },
      },
    });
    var stream_ops = {};
    var keys = Object.keys(node.stream_ops);
    keys.forEach((key) => {
      var fn = node.stream_ops[key];
      stream_ops[key] = (...args) => {
        this.forceLoadFile(node);
        return fn(...args);
      };
    });
    function writeChunks(
      stream: FSStream,
      buffer: Int8Array<ArrayBufferLike>,
      offset: number,
      length: number,
      position: number,
    ) {
      var contents = stream.node.contents;
      if (position >= contents.length) return 0;
      var size = Math.min(contents.length - position, length);
      if (contents.slice) {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents[position + i];
        }
      } else {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents.get(position + i);
        }
      }
      return size;
    }
    stream_ops.read = (
      stream: FSStream,
      buffer: Int8Array<ArrayBufferLike>,
      offset: number,
      length: number,
      position: number,
    ) => {
      this.forceLoadFile(node);
      return writeChunks(stream, buffer, offset, length, position);
    };
    stream_ops.mmap = (
      stream: FSStream,
      length: number,
      position: number,
      prot: any,
      flags: any,
    ) => {
      this.forceLoadFile(node);
      var ptr = mmapAlloc(length);
      if (!ptr) {
        throw new this.ErrnoError(48);
      }
      writeChunks(stream, HEAP8, ptr, length, position);
      return { ptr: ptr, allocated: true };
    };
    node.stream_ops = stream_ops;
    return node;
  }
}
