/**
 * lib/chain.js
 * ─────────────────────────────────────────────────────────────────────
 * Axiom — Full Onchain Engine
 * Ported from MemoryMesh AI pattern.
 *
 * - Konnex Testnet (Substrate) via @polkadot/api v16 (CDN ESM)
 * - Firebase Firestore — global persistent DB (all users see same data)
 * - Wallet: SubWallet / Talisman / Polkadot{.js} / Fearless
 * - All writes go through system.remark extrinsics (real onchain txns)
 *
 * Usage (client components only — 'use client'):
 *   import { CHAIN, WALLET, initChain, connectWallet, sendExtrinsic, ... } from '@/lib/chain';
 * ─────────────────────────────────────────────────────────────────────
 */

// ── Konnex Testnet config ─────────────────────────────────────────────
export const KONNEX_WS_ENDPOINTS = [
  'wss://testnet-rpc1.konnex.world:39944',
  'wss://testnet-rpc1.konnex.world',
  'wss://testnet-rpc1.konnex.world:443',
];
export const KONNEX_HTTP  = 'https://testnet-rpc1.konnex.world';
export const EXPLORER     = 'https://subnets.testnet.konnex.world';
export const TOKEN_DECIMALS = 9; // tKNX = 9 decimals

// Firebase config ─────────────────────────────────────────────────────
// Replace with your own Firebase project config
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAZ1eRiyICMcKPV94pIw-4QUmfyOMtoLjQ',
  authDomain:        'axiom-1e137.firebaseapp.com',
  projectId:         'axiom-1e137',
  storageBucket:     'axiom-1e137.firebasestorage.app',
  messagingSenderId: '877997801498',
  appId:             '1:877997801498:web:fdb2ca9afc5c71557811a3',
  measurementId:     'G-PNTLJMNYVR',
};

// ── Mutable state (module-level singletons) ───────────────────────────
export const CHAIN = {
  api:          null,
  connecting:   false,
  currentBlock: null,
  status:       'disconnected', // 'connecting' | 'connected' | 'error'
};

export const WALLET = {
  connected: false,
  address:   null,
  name:      null,
  balance:   null,
  signer:    null,
  readOnly:  false,
};

// In-memory DB mirror (Firebase is source of truth)
export const DB = {
  robots:     [],
  tasks:      [],
  memory:     [],
  reputation: {},
};

// ── Event bus (simple pub/sub so components can react to state changes) ─
const _listeners = {};
export function on(event, fn)  { (_listeners[event] = _listeners[event] || []).push(fn); }
export function off(event, fn) { _listeners[event] = (_listeners[event] || []).filter(f => f !== fn); }
export function emit(event, payload) { (_listeners[event] || []).forEach(fn => fn(payload)); }

// ── Utilities ─────────────────────────────────────────────────────────
export const now = () => new Date().toISOString();

export function chainHash(str) {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) | 0;
  const abs = n => (n >>> 0).toString(16).padStart(8, '0');
  return '0x' + abs(h) + abs(Math.imul(h, 0xdeadbeef) | 0) + abs(Math.imul(h, 0xcafebabe) | 0) + abs(Math.imul(h, 0xf00dcafe) | 0);
}

export const shortAddr = addr => addr ? addr.slice(0, 8) + '…' + addr.slice(-4) : '—';
export const shortId   = id   => id   ? id.slice(0, 16) + '…' : '—';
export const shortTx   = tx   => tx   ? tx.slice(0, 20) + '…' : '—';
export const explorerTxUrl = txHash => txHash ? `${EXPLORER}/explorer?tx=${txHash}` : null;
export const explorerBlockUrl = blk => `${EXPLORER}/block/${blk}`;

// ── Firebase init ─────────────────────────────────────────────────────
let _firestore = null;

export function getFirestore() {
  if (_firestore) return _firestore;
  if (typeof window === 'undefined') return null;

  const firebase = window.firebase;
  if (!firebase) throw new Error('Firebase SDK not loaded. Add firebase scripts to layout.js');

  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  _firestore = firebase.firestore();
  _firestore.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  return _firestore;
}

// ── Firebase write helpers ────────────────────────────────────────────
export async function fbSaveRobot(robot) {
  try { await getFirestore().collection('axiom_robots').doc(robot.robot_id).set(robot); }
  catch (e) { console.warn('[Firebase] saveRobot:', e.message); }
}

export async function fbSaveTask(task) {
  try { await getFirestore().collection('axiom_tasks').doc(task.task_id).set(task); }
  catch (e) { console.warn('[Firebase] saveTask:', e.message); }
}

export async function fbSaveMemory(entry) {
  try {
    const id = entry.robot_id.slice(2, 18) + '_' + entry.task_id.slice(2, 18) + '_' + Date.now();
    await getFirestore().collection('axiom_memory').doc(id).set(entry);
  } catch (e) { console.warn('[Firebase] saveMemory:', e.message); }
}

export async function fbSaveReputation(robotId, rep) {
  try { await getFirestore().collection('axiom_reputation').doc(robotId).set(rep); }
  catch (e) { console.warn('[Firebase] saveReputation:', e.message); }
}

export async function fbSaveValidator(validator) {
  try { await getFirestore().collection('axiom_validators').doc(validator.val_id).set(validator); }
  catch (e) { console.warn('[Firebase] saveValidator:', e.message); }
}

export async function fbUpdateTask(taskId, fields) {
  try {
    await getFirestore().collection('axiom_tasks').doc(taskId).update(fields);
    const t = DB.tasks.find(x => x.task_id === taskId);
    if (t) Object.assign(t, fields);
  } catch (e) { console.warn('[Firebase] updateTask:', e.message); }
}

// ── Firebase load all data ────────────────────────────────────────────
export async function loadDB() {
  const fs = getFirestore();
  if (!fs) return false;

  try {
    const [robotsSnap, tasksSnap, memSnap, repSnap] = await Promise.all([
      fs.collection('axiom_robots').orderBy('registered_at', 'asc').get(),
      fs.collection('axiom_tasks').orderBy('created_at', 'asc').get(),
      fs.collection('axiom_memory').orderBy('executed_at', 'asc').get(),
      fs.collection('axiom_reputation').get(),
    ]);
    DB.robots     = robotsSnap.docs.map(d => d.data());
    DB.tasks      = tasksSnap.docs.map(d => d.data());
    DB.memory     = memSnap.docs.map(d => d.data());
    DB.reputation = {};
    repSnap.docs.forEach(d => { DB.reputation[d.id] = d.data(); });
    emit('db:loaded', DB);
    return true;
  } catch (e) {
    console.warn('[Firebase] loadDB failed:', e.message);
    return false;
  }
}

// ── Firebase realtime listeners ───────────────────────────────────────
let _listenersAttached = false;
export function attachRealtimeListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  const fs = getFirestore();
  if (!fs) return;

  fs.collection('axiom_robots').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const d = change.doc.data();
      if (change.type === 'added') {
        if (!DB.robots.find(r => r.robot_id === d.robot_id)) {
          DB.robots.push(d);
          if (!DB.reputation[d.robot_id])
            DB.reputation[d.robot_id] = { score: 0, total_tasks: 0, successful_tasks: 0, last_updated: now() };
        }
      } else if (change.type === 'modified') {
        const i = DB.robots.findIndex(r => r.robot_id === d.robot_id);
        if (i >= 0) DB.robots[i] = d;
      } else if (change.type === 'removed') {
        DB.robots = DB.robots.filter(r => r.robot_id !== d.robot_id);
      }
    });
    emit('robots:updated', DB.robots);
  });

  fs.collection('axiom_tasks').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const d = change.doc.data();
      if (change.type === 'added') {
        if (!DB.tasks.find(t => t.task_id === d.task_id)) DB.tasks.push(d);
      } else if (change.type === 'modified') {
        const i = DB.tasks.findIndex(t => t.task_id === d.task_id);
        if (i >= 0) DB.tasks[i] = d;
      } else if (change.type === 'removed') {
        DB.tasks = DB.tasks.filter(t => t.task_id !== d.task_id);
      }
    });
    emit('tasks:updated', DB.tasks);
  });

  fs.collection('axiom_memory').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const d = change.doc.data();
      if (change.type === 'added') {
        if (!DB.memory.find(m => m.robot_id === d.robot_id && m.task_id === d.task_id && m.executed_at === d.executed_at))
          DB.memory.push(d);
      }
    });
    emit('memory:updated', DB.memory);
  });

  fs.collection('axiom_reputation').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      DB.reputation[change.doc.id] = change.doc.data();
    });
    emit('reputation:updated', DB.reputation);
  });
}

// ── @polkadot/api CDN loader ─────────────────────────────────────────
// This waits for the ESM module loaded via <script type="module"> in layout.js
async function waitForPolkadotApi(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.__polkadotApiLoaded && window.PolkadotApiPromise && window.PolkadotWsProvider) {
      return { ApiPromise: window.PolkadotApiPromise, WsProvider: window.PolkadotWsProvider };
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('@polkadot/api v16 ESM did not load. Check CDN in layout.js.');
}

// ── Chain connection ──────────────────────────────────────────────────
export async function initChain() {
  if (CHAIN.connecting || CHAIN.api) return CHAIN.api;
  CHAIN.connecting = true;
  CHAIN.status = 'connecting';
  emit('chain:status', 'connecting');

  let ApiPromise, WsProvider;
  try {
    ({ ApiPromise, WsProvider } = await waitForPolkadotApi());
  } catch (e) {
    CHAIN.connecting = false;
    CHAIN.status = 'error';
    emit('chain:status', 'error');
    console.error('[Chain] CDN load failed:', e.message);
    return null;
  }

  for (const wsUrl of KONNEX_WS_ENDPOINTS) {
    try {
      const provider = new WsProvider(wsUrl, 5000);
      const api = await ApiPromise.create({ provider, throwOnConnect: true, throwOnUnknown: false });
      await api.isReady;

      const chainName = (await api.rpc.system.chain()).toString();
      const specVer   = api.runtimeVersion.specVersion.toNumber();
      console.log(`[Chain] Connected: ${chainName} (spec v${specVer})`);

      CHAIN.api = api;
      CHAIN.connecting = false;
      CHAIN.status = 'connected';
      emit('chain:status', 'connected');
      emit('chain:name', chainName);

      // Subscribe to new blocks
      await api.rpc.chain.subscribeNewHeads(header => {
        CHAIN.currentBlock = header.number.toNumber();
        emit('chain:block', CHAIN.currentBlock);
      });

      return api;
    } catch (e) {
      console.warn(`[Chain] Failed (${wsUrl}):`, e.message);
    }
  }

  CHAIN.connecting = false;
  CHAIN.status = 'error';
  emit('chain:status', 'error');
  console.warn('[Chain] All RPC endpoints failed');
  return null;
}

// ── Transaction engine (system.remark) ───────────────────────────────
/**
 * Submit a real onchain extrinsic via system.remark.
 * Data is encoded as JSON: { p:'AXM/v1', m:palletMethod, d:data, t:timestamp }
 * Returns { txHash, blockNumber }
 */
async function sendExtrinsicViaApi(api, signer, address, palletMethod, remarkData) {
  const payload = JSON.stringify({
    p: 'AXM/v1',
    m: palletMethod,
    d: remarkData || {},
    t: Math.floor(Date.now() / 1000),
  });
  const remark = payload.length > 400 ? payload.slice(0, 397) + '...' : payload;

  console.log(`[Chain] Signing: ${palletMethod} — approve in wallet`);

  return new Promise((resolve, reject) => {
    let resolved = false;
    let unsub = null;

    const done = val => {
      if (!resolved) {
        resolved = true;
        if (unsub) { try { unsub(); } catch (_) {} }
        if (val instanceof Error) reject(val); else resolve(val);
      }
    };

    api.tx.system.remark(remark)
      .signAndSend(address, { signer, nonce: -1 }, result => {
        const status       = result.status;
        const dispatchErr  = result.dispatchError;
        const txHash       = result.txHash?.toString() || '';

        if (dispatchErr) {
          let errMsg = 'Transaction dispatch error';
          if (dispatchErr.isModule) {
            try {
              const m = api.registry.findMetaError(dispatchErr.asModule);
              errMsg = `Chain error: ${m.section}.${m.name}` + (m.docs?.length ? ' — ' + m.docs.join(' ') : '');
            } catch (_) { errMsg = 'Module error: ' + dispatchErr.toString(); }
          } else if (dispatchErr.isBadOrigin) {
            errMsg = 'Bad origin — wrong account';
          } else {
            errMsg = dispatchErr.toString();
          }
          done(new Error(errMsg));
          return;
        }

        const statusStr = status.type || status.toString();

        if (status.isInBlock || statusStr === 'InBlock') {
          const blockHash = (status.asInBlock || status.value)?.toString() || '';
          emit('tx:inBlock', { palletMethod, txHash });
          api.rpc.chain.getHeader(blockHash || status.asInBlock)
            .then(h => done({ txHash, blockNumber: h.number.toNumber() }))
            .catch(() => done({ txHash, blockNumber: CHAIN.currentBlock || 0 }));
        }

        if (status.isFinalized || statusStr === 'Finalized') {
          emit('tx:finalized', { palletMethod, txHash });
        }

        if (['Invalid', 'Usurped', 'Dropped', 'FinalityTimeout'].includes(statusStr)) {
          done(new Error(`Transaction ${statusStr.toLowerCase()} — dobara try karo`));
        }
      })
      .then(u => { unsub = u; })
      .catch(e => {
        const msg = e?.message || String(e);
        const cancelled = /cancel|reject|denied|dismiss|1010/i.test(msg);
        done(new Error(cancelled
          ? 'Transaction cancel kar diya — wallet mein Approve dabao'
          : 'Signing failed: ' + msg
        ));
      });
  });
}

/**
 * Public sendExtrinsic — checks wallet + chain, then sends.
 * Throws if wallet not connected or chain offline.
 */
export async function sendExtrinsic(palletMethod, remarkData, label) {
  if (!WALLET.connected || !WALLET.signer || WALLET.readOnly) {
    const msg = !WALLET.connected
      ? 'Wallet connect karo pehle'
      : WALLET.readOnly
        ? 'Read-only wallet — SubWallet ya Talisman extension se connect karo'
        : 'Wallet signer nahi mila';
    throw new Error(msg);
  }

  if (!CHAIN.api) {
    console.warn('[Chain] Offline — reconnecting…');
    await initChain();
    if (!CHAIN.api) throw new Error('Konnex Testnet se connect nahi ho pa raha — network check karo');
  }

  emit('tx:pending', { palletMethod, label });
  try {
    const result = await sendExtrinsicViaApi(CHAIN.api, WALLET.signer, WALLET.address, palletMethod, remarkData);
    emit('tx:success', { palletMethod, label, ...result });
    return result;
  } catch (e) {
    emit('tx:error', { palletMethod, label, message: e.message });
    throw e;
  }
}

// ── Wallet connection ─────────────────────────────────────────────────
const EXT_KEYS  = { subwallet: 'subwallet-js', talisman: 'talisman', polkadotjs: 'polkadot-js', fearless: 'fearless' };
const EXT_NAMES = { subwallet: 'SubWallet', talisman: 'Talisman', polkadotjs: 'Polkadot{.js}', fearless: 'Fearless' };

export async function connectWallet(name) {
  const walletName = EXT_NAMES[name] || name;
  const extKey     = EXT_KEYS[name];

  await new Promise(r => setTimeout(r, 300)); // give extensions time to inject
  const injected = window.injectedWeb3 || {};
  const ext      = injected[extKey];

  if (ext) {
    let injector;
    try { injector = await ext.enable('Axiom Robot Identity'); }
    catch (_) { throw new Error(walletName + ' authorization rejected'); }

    const inj = injector || ext;
    let rawAccs = [];
    if (inj.accounts?.get) rawAccs = await inj.accounts.get();
    else if (inj.accounts?.subscribe) {
      rawAccs = await new Promise(resolve => {
        const unsub = inj.accounts.subscribe(accs => { resolve(accs || []); try { unsub(); } catch (_) {} });
      });
    } else if (ext.accounts?.get) rawAccs = await ext.accounts.get();

    if (!rawAccs?.length) throw new Error('No accounts in ' + walletName + '. Create/import an account first.');

    const acc     = rawAccs[0];
    const address = typeof acc === 'string' ? acc : acc.address;
    const signer  = inj.signer || ext.signer || null;
    await setWalletConnected(address, walletName, signer);
    return;
  }

  // Extension not found
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  throw new Error(isMobile
    ? `Open this page inside the ${walletName} DApp browser`
    : `${walletName} extension not detected. Install it, then refresh this page.`
  );
}

export async function connectAnyWallet() {
  await new Promise(r => setTimeout(r, 500));
  const injected = window.injectedWeb3 || {};
  const allKeys  = Object.keys(injected);
  if (!allKeys.length) throw new Error('No wallet extension found. Install SubWallet or Polkadot.js, then refresh.');

  for (const key of allKeys) {
    try {
      const ext = injected[key];
      let injector;
      try { injector = await ext.enable('Axiom Robot Identity'); } catch (_) { continue; }
      const inj = injector || ext;
      let rawAccs = [];
      if (inj.accounts?.get) rawAccs = await inj.accounts.get();
      else if (ext.accounts?.get) rawAccs = await ext.accounts.get();
      if (rawAccs?.length) {
        const acc     = rawAccs[0];
        const address = typeof acc === 'string' ? acc : acc.address;
        const signer  = inj.signer || ext.signer || null;
        const walletLabel = { 'subwallet-js': 'SubWallet', talisman: 'Talisman', 'polkadot-js': 'Polkadot{.js}', fearless: 'Fearless' }[key] || key;
        await setWalletConnected(address, walletLabel, signer);
        return;
      }
    } catch (_) { /* try next */ }
  }
  throw new Error('Wallets found but no accounts. Add an account to your wallet first.');
}

export async function setWalletConnected(address, name, signer = null, readOnly = false) {
  WALLET.connected = true;
  WALLET.address   = address;
  WALLET.name      = name;
  WALLET.signer    = signer;
  WALLET.readOnly  = readOnly;
  WALLET.balance   = null;

  emit('wallet:connected', { address, name, readOnly });

  // Fetch balance
  try {
    const api = await initChain();
    if (api) {
      const acct    = await api.query.system.account(address);
      const free    = acct.data.free.toBigInt();
      const divisor = BigInt(10 ** TOKEN_DECIMALS);
      WALLET.balance = Number(free / divisor).toFixed(4);
      emit('wallet:balance', WALLET.balance);
    }
  } catch (_) { WALLET.balance = '?'; }
}

export function disconnectWallet() {
  WALLET.connected = false;
  WALLET.address   = null;
  WALLET.name      = null;
  WALLET.signer    = null;
  WALLET.readOnly  = false;
  WALLET.balance   = null;
  emit('wallet:disconnected', null);
}

// ── Core actions ──────────────────────────────────────────────────────

/**
 * Register a robot — real onchain tx via system.remark + Firebase persist
 */
export async function registerRobotOnchain(owner, label, type, hwMeta = {}) {
  if (!owner) throw new Error('Owner address required');

  const hwStr  = JSON.stringify(Object.fromEntries(Object.entries(hwMeta).sort()));
  const hwHash = chainHash(hwStr + owner).slice(2, 66);
  const robotId = chainHash('axiom::' + hwHash + '::' + owner.toLowerCase());

  if (DB.robots.find(r => r.hardware_hash === hwHash))
    throw new Error('Hardware fingerprint already registered');

  const result = await sendExtrinsic(
    'axiom.registerRobot',
    { robotId, hwHash, label, type, owner },
    `registerRobot(${label})`
  );

  const robot = {
    robot_id:        robotId,
    hardware_hash:   hwHash,
    owner_address:   owner,
    registered_at:   now(),
    metadata:        { label: label || 'Robot', type: type || 'drone' },
    tx_hash:         result.txHash,
    block_number:    result.blockNumber,
  };

  DB.robots.push(robot);
  DB.reputation[robotId] = { score: 0, total_tasks: 0, successful_tasks: 0, last_updated: now() };
  await fbSaveRobot(robot);
  await fbSaveReputation(robotId, DB.reputation[robotId]);
  emit('robots:updated', DB.robots);
  return robot;
}

/**
 * Submit PoPW memory entry — real onchain tx + Firebase persist
 */
export async function submitPoPWOnchain({ robotId, taskId, taskType, instruction, popwScore, safetyScore, matchScore, effScore, strategy, telemetry }) {
  const instrHash = chainHash(instruction + robotId);

  const result = await sendExtrinsic(
    'axiom.submitPoPW',
    {
      robotId:    robotId.slice(0, 16),
      taskId:     taskId.slice(0, 16),
      taskType,
      popw:       popwScore,
      instrHash:  instrHash.slice(0, 16),
    },
    `submitPoPW(${taskType}, score=${popwScore.toFixed(3)})`
  );

  const entry = {
    entry_id:      DB.memory.length + 1,
    robot_id:      robotId,
    task_id:       taskId,
    task_type:     taskType,
    instruction,
    popw_score:    popwScore,
    safety_score:  safetyScore,
    task_match:    matchScore,
    efficiency:    effScore,
    validator_addr: WALLET.address,
    block_number:  result.blockNumber,
    executed_at:   now(),
    telemetry:     { ...(telemetry || {}), strategy },
    tx_hash:       result.txHash,
  };

  DB.memory.push(entry);
  updateRepLocal(robotId, { popw: popwScore, safety: safetyScore, match: matchScore, eff: effScore }, popwScore >= 0.5);
  await fbSaveMemory(entry);
  await fbSaveReputation(robotId, DB.reputation[robotId]);
  emit('memory:updated', DB.memory);
  emit('reputation:updated', DB.reputation);
  return entry;
}

const DECAY = 0.95;
const W     = { safety: 0.40, match: 0.35, efficiency: 0.25 };

function updateRepLocal(robotId, scores, success) {
  const rep = DB.reputation[robotId];
  if (!rep) return;
  const raw  = scores.safety * W.safety + scores.match * W.match + scores.eff * W.efficiency;
  rep.score  = +Math.min(1, Math.max(0, DECAY * rep.score + (1 - DECAY) * raw)).toFixed(4);
  rep.total_tasks++;
  if (success) rep.successful_tasks++;
  rep.last_updated = now();
}

// ── Faucet ────────────────────────────────────────────────────────────
export async function requestFaucet(address) {
  const response = await fetch('https://faucet.testnet.konnex.world/drip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, parachain_id: 0 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Faucet returned status ' + response.status);
  const data = await response.json();
  return data.hash || data.tx || data.txHash || chainHash(address + Date.now());
}
