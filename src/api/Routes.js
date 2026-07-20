/**
 * WhatsApp Broadcast System - API Routes
 */
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const ConnectionManager = require("../whatsapp/Connection");
const BroadcastQueue = require("../queue/BroadcastQueue");
const Store = require("../models/Store");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// ===== CONNECTION =====
router.get("/connection/status", (req, res) => {
  res.json(ConnectionManager.getStatus());
});

router.post("/connection/reconnect", async (req, res) => {
  try {
    await ConnectionManager.initialize();
    res.json({ success: true, message: "Reconnecting..." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/connection/logout", async (req, res) => {
  try {
    await ConnectionManager.logout();
    res.json({ success: true, message: "Logged out" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== CONTACTS =====
router.get("/contacts", (req, res) => {
  const { tags } = req.query;
  const tagList = tags ? tags.split(",") : null;
  res.json(Store.getContacts(tagList));
});

router.post("/contacts", (req, res) => {
  const { name, phone, tags } = req.body;
  if (!phone) {
    return res.status(400).json({ error: "Phone number required" });
  }
  try {
    const contact = Store.addContact(name, phone, tags);
    res.json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  const contacts = [];
  
  const startIndex = lines[0].toLowerCase().includes('nama') || 
                     lines[0].toLowerCase().includes('name') || 
                     lines[0].toLowerCase().includes('phone') || 
                     lines[0].toLowerCase().includes('nomor') ? 1 : 0;
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
    
    if (parts.length >= 2) {
      contacts.push({
        name: parts[0] || 'Unknown',
        phone: parts[1],
        tags: parts[2] ? parts[2].split(';').map(t => t.trim()).filter(Boolean) : []
      });
    } else if (parts.length === 1 && parts[0]) {
      contacts.push({
        name: 'Unknown',
        phone: parts[0],
        tags: []
      });
    }
  }
  
  return contacts;
}

router.post("/contacts/bulk", upload.single("file"), (req, res) => {
  let contacts = [];
  
  if (req.file) {
    const fs = require("fs");
    try {
      const data = fs.readFileSync(req.file.path, "utf8");
      const ext = req.file.originalname.toLowerCase();
      
      if (ext.endsWith('.json')) {
        const parsed = JSON.parse(data);
        contacts = Array.isArray(parsed) ? parsed : [parsed];
      } else if (ext.endsWith('.csv')) {
        contacts = parseCSV(data);
      } else {
        try {
          const parsed = JSON.parse(data);
          contacts = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          contacts = parseCSV(data);
        }
      }
      
      fs.unlinkSync(req.file.path);
    } catch (err) {
      return res.status(400).json({ error: "Invalid file format: " + err.message });
    }
  } else if (req.body.contacts) {
    contacts = req.body.contacts;
  } else if (req.body.phones) {
    const phones = Array.isArray(req.body.phones) ? req.body.phones : req.body.phones.split(/\n|,/);
    contacts = phones.map(p => ({ name: 'Unknown', phone: p.trim(), tags: [] })).filter(c => c.phone);
  } else {
    return res.status(400).json({ error: "No contacts provided. Upload JSON/CSV file or send contacts array." });
  }

  const results = Store.addContactsBulk(contacts);
  res.json(results);
});

router.delete("/contacts/:id", (req, res) => {
  Store.deleteContact(req.params.id);
  res.json({ success: true });
});

// ===== TEMPLATES =====
router.get("/templates", (req, res) => {
  res.json(Store.getTemplates());
});

router.post("/templates", (req, res) => {
  const { name, content, variables } = req.body;
  if (!name || !content) {
    return res.status(400).json({ error: "Name and content required" });
  }
  const template = Store.addTemplate(name, content, variables);
  res.json(template);
});

router.delete("/templates/:id", (req, res) => {
  Store.deleteTemplate(req.params.id);
  res.json({ success: true });
});

// ===== BROADCAST =====
router.post("/broadcast", async (req, res) => {
  const { 
    contactIds, 
    tagFilter, 
    templateId, 
    message, 
    options = {} 
  } = req.body;

  let contacts = [];
  if (contactIds && contactIds.length > 0) {
    const allContacts = Store.getContacts();
    contacts = allContacts.filter(c => contactIds.includes(c.id));
  } else if (tagFilter) {
    contacts = Store.getContacts(tagFilter.split(","));
  } else {
    return res.status(400).json({ error: "No contacts selected" });
  }

  if (contacts.length === 0) {
    return res.status(400).json({ error: "No contacts found" });
  }

  let finalMessage = message;
  if (templateId) {
    const template = Store.getTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    finalMessage = template.content;
  }

  if (!finalMessage) {
    return res.status(400).json({ error: "Message required" });
  }

  const broadcastId = uuidv4();
  const broadcast = Store.addBroadcastHistory({
    id: broadcastId,
    name: options.name || `Broadcast ${new Date().toLocaleString()}`,
    contactCount: contacts.length,
    message: finalMessage,
    status: "queued",
    details: { sent: 0, failed: 0 }
  });

  try {
    BroadcastQueue.startBroadcast(broadcastId, contacts, { text: finalMessage }, options);
    res.json({ 
      success: true, 
      broadcastId,
      contactCount: contacts.length,
      message: "Broadcast started"
    });
  } catch (error) {
    Store.updateBroadcastStatus(broadcastId, "failed", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get("/broadcast/:id", (req, res) => {
  const broadcast = BroadcastQueue.getBroadcast(req.params.id);
  if (broadcast) {
    res.json(broadcast);
  } else {
    const history = Store.getHistory(1000).find(h => h.id === req.params.id);
    if (history) {
      res.json(history);
    } else {
      res.status(404).json({ error: "Broadcast not found" });
    }
  }
});

router.post("/broadcast/:id/pause", (req, res) => {
  const success = BroadcastQueue.pauseBroadcast(req.params.id);
  res.json({ success });
});

router.post("/broadcast/:id/resume", (req, res) => {
  const success = BroadcastQueue.resumeBroadcast(req.params.id);
  res.json({ success });
});

router.post("/broadcast/:id/stop", (req, res) => {
  const success = BroadcastQueue.stopBroadcast(req.params.id);
  res.json({ success });
});

// ===== HISTORY =====
router.get("/history", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(Store.getHistory(limit));
});

// ===== STATS =====
router.get("/stats", (req, res) => {
  res.json(Store.getStats());
});

// ===== SEND TEST - FIXED =====
router.post("/send/test", async (req, res) => {
  const { phone, message } = req.body;
  
  if (!phone || !message) {
    return res.status(400).json({ success: false, error: "Phone and message required" });
  }

  // Check connection
  if (ConnectionManager.status !== "connected") {
    return res.status(503).json({ success: false, error: "WhatsApp not connected. Please scan QR code first." });
  }

  try {
    // Normalize phone
    let phoneClean = String(phone).replace(/\D/g, '');
    if (phoneClean.startsWith('0')) {
      phoneClean = '62' + phoneClean.substring(1);
    }
    
    const jid = `${phoneClean}@s.whatsapp.net`;
    console.log(`[API] Test send to ${jid}: ${message}`);
    
    const result = await ConnectionManager.sendMessage(jid, { text: message });
    
    if (result.success) {
      res.json({ success: true, messageId: result.messageId, to: jid });
    } else {
      res.status(500).json({ success: false, error: result.error, details: result.details });
    }
  } catch (error) {
    console.error(`[API] Test send error:`, error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

module.exports = router;
