const DB_NAME = 'days-track';
const DB_VERSION = 1;
const STORE_EVENTS = 'events';
const STORE_SETTINGS = 'settings';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        db.createObjectStore(STORE_EVENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    return { store, transaction, db };
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const DB = {
  async getAllEvents() {
    const { store } = await tx(STORE_EVENTS);
    return reqToPromise(store.getAll());
  },

  async getEvent(id) {
    const { store } = await tx(STORE_EVENTS);
    return reqToPromise(store.get(id));
  },

  async saveEvent(event) {
    if (!event.id) event.id = crypto.randomUUID();
    if (!event.createdAt) event.createdAt = Date.now();
    event.updatedAt = Date.now();
    const { store } = await tx(STORE_EVENTS, 'readwrite');
    return reqToPromise(store.put(event));
  },

  async logEvent(id) {
    const event = await this.getEvent(id);
    if (!event) return;
    if (!event.logs) event.logs = [];
    const today = new Date().toISOString().split('T')[0];
    if (!event.logs.includes(today)) {
      event.logs.push(today);
      event.logs.sort().reverse();
    }
    event.updatedAt = Date.now();
    const { store } = await tx(STORE_EVENTS, 'readwrite');
    return reqToPromise(store.put(event));
  },

  async deleteEvent(id) {
    const { store } = await tx(STORE_EVENTS, 'readwrite');
    return reqToPromise(store.delete(id));
  },

  async clearAllEvents() {
    const { store } = await tx(STORE_EVENTS, 'readwrite');
    return reqToPromise(store.clear());
  },

  async getSetting(key) {
    const { store } = await tx(STORE_SETTINGS);
    const result = await reqToPromise(store.get(key));
    return result ? result.value : null;
  },

  async setSetting(key, value) {
    const { store } = await tx(STORE_SETTINGS, 'readwrite');
    return reqToPromise(store.put({ key, value }));
  },

  async exportData() {
    const events = await this.getAllEvents();
    return JSON.stringify(events, null, 2);
  },

  async importData(json) {
    const events = JSON.parse(json);
    if (!Array.isArray(events)) throw new Error('Invalid format: expected an array');
    const { store } = await tx(STORE_EVENTS, 'readwrite');
    for (const event of events) {
      if (!event.title || !event.date) continue;
      if (!event.id) event.id = crypto.randomUUID();
      store.put(event);
    }
  }
};
