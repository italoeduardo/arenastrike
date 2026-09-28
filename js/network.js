const PREFIX = 'arenastrike-v1-';

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Star topology: the host relays everything, so clients only ever hold one connection.
export class Net {
  constructor() {
    this.mode = 'offline';
    this.myId = 'local';
    this.peer = null;
    this.conns = new Map();
    this.hostConn = null;
    this.onMessage = () => {};
    this.onPeerJoin = () => {};
    this.onPeerLeave = () => {};
    this.onDisconnected = () => {};
  }

  host() {
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt) => {
        const code = randomCode();
        const peer = new Peer(PREFIX + code, { debug: 1 });
        peer.on('open', id => {
          this.peer = peer;
          this.mode = 'host';
          this.myId = id;
          this.code = code;
          resolve(code);
        });
        peer.on('error', err => {
          if (err.type === 'unavailable-id' && attempt < 5) { peer.destroy(); tryOpen(attempt + 1); }
          else if (!this.peer) reject(err);
          else console.warn('peer error', err);
        });
        peer.on('connection', conn => this.acceptConn(conn));
        peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
      };
      tryOpen(0);
    });
  }

  acceptConn(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      this.onPeerJoin(conn.peer);
    });
    conn.on('data', msg => this.onMessage(conn.peer, msg));
    const drop = () => {
      if (!this.conns.has(conn.peer)) return;
      this.conns.delete(conn.peer);
      this.onPeerLeave(conn.peer);
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  join(code) {
    code = code.trim().toUpperCase().replace(PREFIX.toUpperCase(), '');
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 1 });
      let settled = false;
      const fail = (e) => { if (!settled) { settled = true; peer.destroy(); reject(e); } };
      const timer = setTimeout(() => fail(new Error('timeout')), 12000);
      peer.on('open', id => {
        const conn = peer.connect(PREFIX + code, { serialization: 'json', reliable: true });
        conn.on('open', () => {
          clearTimeout(timer);
          settled = true;
          this.peer = peer;
          this.mode = 'client';
          this.myId = id;
          this.hostConn = conn;
          this.code = code;
          resolve();
        });
        conn.on('data', msg => this.onMessage('host', msg));
        conn.on('close', () => this.onDisconnected());
        conn.on('error', () => this.onDisconnected());
      });
      peer.on('error', err => {
        if (err.type === 'peer-unavailable') fail(new Error('Sala não encontrada'));
        else fail(err);
      });
    });
  }

  send(msg) {
    if (this.mode === 'client' && this.hostConn?.open) this.hostConn.send(msg);
  }

  sendTo(id, msg) {
    const c = this.conns.get(id);
    if (c?.open) c.send(msg);
  }

  broadcast(msg, except) {
    for (const [id, c] of this.conns) if (id !== except && c.open) c.send(msg);
  }

  kick(id) {
    this.conns.get(id)?.close();
  }
}
