/**
 * WhatsApp Broadcast System - Store
 * Manages contacts, templates, and broadcast history
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../../data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Store {
  constructor() {
    this.contacts = this.loadJson(CONTACTS_FILE, []);
    this.templates = this.loadJson(TEMPLATES_FILE, []);
    this.history = this.loadJson(HISTORY_FILE, []);
  }

  loadJson(filePath, defaultValue) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (err) {
      console.error(`Error loading ${filePath}:`, err.message);
    }
    return defaultValue;
  }

  saveJson(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Error saving ${filePath}:`, err.message);
    }
  }

  // ===== CONTACTS =====
  addContact(name, phone, tags = []) {
    // const phoneClean = phone.replace(/\D/g, '');
    let phoneClean = phone.replace(/\D/g, '');
	if (phoneClean.startsWith('0')) {
  	phoneClean = '62' + phoneClean.substring(1);
	}
    const jid = `${phoneClean}@s.whatsapp.net`;
    
    // Check if exists
    const exists = this.contacts.find(c => c.jid === jid);
    if (exists) {
      exists.name = name;
      exists.tags = tags;
      exists.updatedAt = new Date().toISOString();
      this.saveContacts();
      return exists;
    }

    const contact = {
      id: uuidv4(),
      name,
      phone: phoneClean,
      jid,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.contacts.push(contact);
    this.saveContacts();
    return contact;
  }

  addContactsBulk(contactsArray) {
    const results = { added: 0, updated: 0, failed: 0, errors: [] };
    
    contactsArray.forEach(item => {
      try {
        if (!item.phone) {
          results.failed++;
          results.errors.push({ item, reason: 'No phone number' });
          return;
        }
        const existing = this.contacts.find(c => c.phone === item.phone.replace(/\D/g, ''));
        if (existing) {
          this.addContact(item.name || existing.name, item.phone, item.tags || existing.tags);
          results.updated++;
        } else {
          this.addContact(item.name || 'Unknown', item.phone, item.tags || []);
          results.added++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ item, reason: err.message });
      }
    });
    
    return results;
  }

  getContacts(tags = null) {
    if (tags && tags.length > 0) {
      return this.contacts.filter(c => 
        tags.some(tag => c.tags.includes(tag))
      );
    }
    return this.contacts;
  }

  deleteContact(id) {
    this.contacts = this.contacts.filter(c => c.id !== id);
    this.saveContacts();
  }

  saveContacts() {
    this.saveJson(CONTACTS_FILE, this.contacts);
  }

  // ===== TEMPLATES =====
  addTemplate(name, content, variables = []) {
    const template = {
      id: uuidv4(),
      name,
      content,
      variables,
      createdAt: new Date().toISOString()
    };
    this.templates.push(template);
    this.saveTemplates();
    return template;
  }

  getTemplates() {
    return this.templates;
  }

  getTemplate(id) {
    return this.templates.find(t => t.id === id);
  }

  deleteTemplate(id) {
    this.templates = this.templates.filter(t => t.id !== id);
    this.saveTemplates();
  }

  saveTemplates() {
    this.saveJson(TEMPLATES_FILE, this.templates);
  }

  // ===== HISTORY =====
  addBroadcastHistory(broadcast) {
    const history = {
      id: uuidv4(),
      ...broadcast,
      createdAt: new Date().toISOString()
    };
    this.history.unshift(history);
    // Keep only last 1000 records
    if (this.history.length > 1000) {
      this.history = this.history.slice(0, 1000);
    }
    this.saveHistory();
    return history;
  }

  getHistory(limit = 50) {
    return this.history.slice(0, limit);
  }

  updateBroadcastStatus(id, status, details = {}) {
    const item = this.history.find(h => h.id === id);
    if (item) {
      item.status = status;
      item.details = { ...item.details, ...details };
      item.updatedAt = new Date().toISOString();
      this.saveHistory();
    }
  }

  saveHistory() {
    this.saveJson(HISTORY_FILE, this.history);
  }

  // Stats
  getStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayBroadcasts = this.history.filter(h => 
      h.createdAt.startsWith(today)
    );
    
    return {
      totalContacts: this.contacts.length,
      totalTemplates: this.templates.length,
      totalBroadcasts: this.history.length,
      todayBroadcasts: todayBroadcasts.length,
      todaySent: todayBroadcasts.reduce((sum, b) => sum + (b.details?.sent || 0), 0),
      todayFailed: todayBroadcasts.reduce((sum, b) => sum + (b.details?.failed || 0), 0),
      connectionStatus: global.connectionStatus || 'disconnected'
    };
  }
}

module.exports = new Store();
