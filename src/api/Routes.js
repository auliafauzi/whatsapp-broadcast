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
  const contact = Store.addContact(name, phone, tags);
  res.json(contact);
});

router.post("/contacts/bulk", upload.single("file"), (req, res) => {
  // Expects JSON array in body, or CSV/JSON file upload
  let contacts = [];
  
  if (req.file) {
    // Handle file upload (simplified - assumes JSON)
    const fs = require("fs");
    try {
      const data = fs.readFileSync(req.file.path, "utf8");
      contacts = JSON.parse(data);
      fs.unlinkSync(req.file.path);
    } catch (err) {
      return res.status(400).json({ error: "Invalid file format" });
    }
  } else if (req.body.contacts) {
    contacts = req.body.contacts;
  } else {
    return res.status(400).json({ error: "No contacts provided" });
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

  // Get contacts
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

  // Build message
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

  // Create broadcast
  const broadcastId = uuidv4();
  const broadcast = Store.addBroadcastHistory({
    id: broadcastId,
    name: options.name || `Broadcast ${new Date().toLocaleString()}`,
    contactCount: contacts.length,
    message: finalMessage,
    status: "queued",
    details: { sent: 0, failed: 0 }
  });

  // Start queue
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
    // Check history
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

// ===== SEND TEST =====
router.post("/send/test", async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "Phone and message required" });
  }

  try {
    const jid = `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
    const result = await ConnectionManager.sendMessage(jid, { text: message });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
