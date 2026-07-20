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
    this.status = "disconnected";
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

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("connection.update", (update) => {
        this.handleConnectionUpdate(update);
      });

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
      this.processQueue();
    }
  }

  async sendMessage(jid, message, options = {}) {
    if (!this.sock || this.status !== "connected") {
      throw new Error("WhatsApp not connected");
    }

    const delay = options.delay || parseInt(process.env.RATE_LIMIT_DELAY) || 2000;
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      console.log(`[WhatsApp] Sending message to ${jid}...`);
      const result = await this.sock.sendMessage(jid, message);
      console.log(`[WhatsApp] Message sent to ${jid}, ID: ${result?.key?.id}`);
      return { success: true, messageId: result?.key?.id };
    } catch (error) {
      console.error(`[WhatsApp] Failed to send to ${jid}:`, error.message);
      console.error(`[WhatsApp] Error details:`, error.stack);
      return { success: false, error: error.message, details: error.stack };
    }
  }

  async processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) return;
    
    this.isProcessing = true;
    console.log(`[WhatsApp] Processing queue: ${this.messageQueue.length} messages`);
    
    while (this.messageQueue.length > 0 && this.status === "connected") {
      const item = this.messageQueue.shift();
      try {
        const result = await this.sendMessage(item.jid, item.message, item.options);
        if (result.success && item.onSuccess) item.onSuccess();
        if (!result.success && item.onError) item.onError(result.error);
      } catch (err) {
        if (item.onError) item.onError(err.message);
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
