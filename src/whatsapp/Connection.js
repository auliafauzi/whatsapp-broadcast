/**
 * WhatsApp Broadcast System - Connection Manager
 * Manages Baileys connection lifecycle
 */
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const P = require("pino")({ level: "silent" });
const qrcode = require("qrcode-terminal");
const path = require("path");

class ConnectionManager {
  constructor() {
    this.sock = null;
    this.qrCode = null;
    this.status = "disconnected"; // disconnected, connecting, qr_required, connected
    this.connectionInfo = {};
    this.messageQueue = [];
    this.isProcessing = false;
    this.onMessageReceived = null;
  }

  async initialize() {
    try {
      this.status = "connecting";
      global.connectionStatus = this.status;
      
      const { state, saveCreds } = await useMultiFileAuthState(
        path.join(__dirname, "../../auth_info")
      );
      
      const { version } = await fetchLatestBaileysVersion();
      
      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: P,
        browser: ["WhatsApp Broadcast", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 250
      });

      // Save credentials when updated
      this.sock.ev.on("creds.update", saveCreds);

      // Connection updates
      this.sock.ev.on("connection.update", (update) => {
        this.handleConnectionUpdate(update);
      });

      // Messages received (for monitoring)
      this.sock.ev.on("messages.upsert", (m) => {
        if (this.onMessageReceived) {
          this.onMessageReceived(m);
        }
      });

      console.log("[WhatsApp] Connection manager initialized");
      return this.sock;
    } catch (error) {
      console.error("[WhatsApp] Init error:", error);
      this.status = "disconnected";
      global.connectionStatus = this.status;
      throw error;
    }
  }

  handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.qrCode = qr;
      this.status = "qr_required";
      global.connectionStatus = this.status;
      console.log("[WhatsApp] QR Code generated - scan required");
      // Also print to terminal for convenience
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect = 
        (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
          : true;
      
      console.log(`[WhatsApp] Connection closed. Reconnect: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        this.status = "connecting";
        global.connectionStatus = this.status;
        setTimeout(() => this.initialize(), 5000);
      } else {
        this.status = "disconnected";
        global.connectionStatus = this.status;
        this.qrCode = null;
      }
    } else if (connection === "open") {
      this.status = "connected";
      global.connectionStatus = this.status;
      this.qrCode = null;
      this.connectionInfo = {
        user: this.sock.user,
        connectedAt: new Date().toISOString()
      };
      console.log(`[WhatsApp] Connected as ${this.sock.user?.id}`);
      
      // Process queued messages
      this.processQueue();
    }
  }

  async sendMessage(jid, message, options = {}) {
    if (!this.sock || this.status !== "connected") {
      throw new Error("WhatsApp not connected");
    }

    // Rate limiting
    const delay = options.delay || parseInt(process.env.RATE_LIMIT_DELAY) || 2000;
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const result = await this.sock.sendMessage(jid, message);
      return { success: true, messageId: result.key.id };
    } catch (error) {
      console.error(`[WhatsApp] Failed to send to ${jid}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) return;
    
    this.isProcessing = true;
    console.log(`[WhatsApp] Processing queue: ${this.messageQueue.length} messages`);
    
    while (this.messageQueue.length > 0 && this.status === "connected") {
      const item = this.messageQueue.shift();
      try {
        await this.sendMessage(item.jid, item.message, item.options);
        if (item.onSuccess) item.onSuccess();
      } catch (err) {
        if (item.onError) item.onError(err);
      }
    }
    
    this.isProcessing = false;
  }

  queueMessage(jid, message, options = {}, callbacks = {}) {
    this.messageQueue.push({ jid, message, options, ...callbacks });
    if (this.status === "connected" && !this.isProcessing) {
      this.processQueue();
    }
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      user: this.connectionInfo.user,
      queueSize: this.messageQueue.length
    };
  }

  async logout() {
    if (this.sock) {
      await this.sock.logout();
      this.sock = null;
    }
    this.status = "disconnected";
    global.connectionStatus = this.status;
    this.qrCode = null;
    this.connectionInfo = {};
  }
}

module.exports = new ConnectionManager();
