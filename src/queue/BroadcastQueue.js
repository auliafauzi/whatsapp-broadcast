/**
 * WhatsApp Broadcast System - Broadcast Queue Manager
 * Handles batch sending with rate limiting and progress tracking
 */
const ConnectionManager = require("../whatsapp/Connection");
const Store = require("../models/Store");

class BroadcastQueue {
  constructor() {
    this.activeBroadcasts = new Map(); // id -> broadcast state
    this.isRunning = false;
  }

  async startBroadcast(broadcastId, contacts, message, options = {}) {
    if (this.activeBroadcasts.has(broadcastId)) {
      throw new Error("Broadcast already running");
    }

    const broadcast = {
      id: broadcastId,
      contacts: contacts.map(c => ({ ...c, status: "pending" })),
      message,
      options: {
        delay: options.delay || parseInt(process.env.RATE_LIMIT_DELAY) || 2000,
        batchSize: options.batchSize || parseInt(process.env.MAX_BATCH_SIZE) || 50,
        ...options
      },
      stats: {
        total: contacts.length,
        sent: 0,
        failed: 0,
        pending: contacts.length,
        startTime: Date.now(),
        endTime: null
      },
      status: "running", // running, paused, completed, failed
      currentIndex: 0
    };

    this.activeBroadcasts.set(broadcastId, broadcast);
    Store.updateBroadcastStatus(broadcastId, "running", { stats: broadcast.stats });
    
    // Start processing
    this.processBroadcast(broadcastId);
    
    return broadcast;
  }

  async processBroadcast(broadcastId) {
    const broadcast = this.activeBroadcasts.get(broadcastId);
    if (!broadcast || broadcast.status !== "running") return;

    const { contacts, message, options, stats } = broadcast;
    const delay = options.delay;

    console.log(`[Broadcast] Starting ${broadcastId}: ${stats.total} contacts`);

    for (let i = broadcast.currentIndex; i < contacts.length; i++) {
      if (broadcast.status !== "running") break;

      const contact = contacts[i];
      broadcast.currentIndex = i;

      try {
        // Check connection
        if (ConnectionManager.status !== "connected") {
          console.log(`[Broadcast] Waiting for connection...`);
          await this.waitForConnection();
        }

        // Send message
        const result = await ConnectionManager.sendMessage(
          contact.jid, 
          message, 
          { delay: 0 } // delay handled here
        );

        if (result.success) {
          contact.status = "sent";
          contact.messageId = result.messageId;
          contact.sentAt = new Date().toISOString();
          stats.sent++;
        } else {
          contact.status = "failed";
          contact.error = result.error;
          stats.failed++;
        }
      } catch (error) {
        contact.status = "failed";
        contact.error = error.message;
        stats.failed++;
      }

      stats.pending = stats.total - stats.sent - stats.failed;
      
      // Update store periodically (every 10 messages)
      if (i % 10 === 0 || i === contacts.length - 1) {
        Store.updateBroadcastStatus(broadcastId, "running", { 
          stats: { ...stats },
          progress: Math.round((i + 1) / stats.total * 100)
        });
      }

      // Rate limiting delay
      if (i < contacts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Mark complete
    if (broadcast.status === "running") {
      broadcast.status = "completed";
      stats.endTime = Date.now();
      stats.duration = stats.endTime - stats.startTime;
      
      Store.updateBroadcastStatus(broadcastId, "completed", { 
        stats,
        progress: 100,
        completedAt: new Date().toISOString()
      });
      
      console.log(`[Broadcast] ${broadcastId} completed: ${stats.sent} sent, ${stats.failed} failed`);
    }

    // Cleanup after 1 hour
    setTimeout(() => {
      this.activeBroadcasts.delete(broadcastId);
    }, 3600000);
  }

  async waitForConnection(timeout = 30000) {
    const start = Date.now();
    while (ConnectionManager.status !== "connected") {
      if (Date.now() - start > timeout) {
        throw new Error("Connection timeout");
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  pauseBroadcast(broadcastId) {
    const broadcast = this.activeBroadcasts.get(broadcastId);
    if (broadcast && broadcast.status === "running") {
      broadcast.status = "paused";
      Store.updateBroadcastStatus(broadcastId, "paused", { stats: broadcast.stats });
      return true;
    }
    return false;
  }

  resumeBroadcast(broadcastId) {
    const broadcast = this.activeBroadcasts.get(broadcastId);
    if (broadcast && broadcast.status === "paused") {
      broadcast.status = "running";
      Store.updateBroadcastStatus(broadcastId, "running", { stats: broadcast.stats });
      this.processBroadcast(broadcastId);
      return true;
    }
    return false;
  }

  stopBroadcast(broadcastId) {
    const broadcast = this.activeBroadcasts.get(broadcastId);
    if (broadcast) {
      broadcast.status = "stopped";
      Store.updateBroadcastStatus(broadcastId, "stopped", { 
        stats: broadcast.stats,
        stoppedAt: new Date().toISOString()
      });
      return true;
    }
    return false;
  }

  getBroadcast(broadcastId) {
    return this.activeBroadcasts.get(broadcastId);
  }

  getAllActive() {
    return Array.from(this.activeBroadcasts.values());
  }
}

module.exports = new BroadcastQueue();
