/**
 * WhatsApp Broadcast System - Main Entry Point
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const ConnectionManager = require("./whatsapp/Connection");
const routes = require("./api/Routes");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== FIX CORS =====
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

// Handle preflight
app.options('*', cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));


// Middleware
//app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, "../public")));

// API routes
app.use("/api", routes);

// Serve main UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[API Error]", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   WhatsApp Broadcast System              ║`);
  console.log(`║   Server running on port ${PORT}            ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
  
  // Initialize WhatsApp connection
  try {
    await ConnectionManager.initialize();
  } catch (error) {
    console.error("[Startup] WhatsApp init failed:", error.message);
    console.log("[Startup] Will retry on manual reconnect");
  }
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Shutdown] SIGTERM received, closing gracefully...");
  await ConnectionManager.logout();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Shutdown] SIGINT received, closing gracefully...");
  await ConnectionManager.logout();
  process.exit(0);
});
