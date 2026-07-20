module.exports = {
  apps: [{
    name: 'whatsapp-broadcast',
    script: './src/index.js',
    instances: 1,           // Jangan cluster, Baileys hanya 1 instance
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    autorestart: true,
    restart_delay: 5000,
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 10000
  }]
};
