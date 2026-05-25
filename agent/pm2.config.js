// pm2 start pm2.config.js
// 机器重启后自动拉起 agent，进程崩溃后自动重启
module.exports = {
  apps: [{
    name: 'auto-domain-agent',
    script: 'agent.js',
    // 修改这里的参数：--port=你的本地服务端口 --name=你的子域名
    args: '--port=3000 --name=myapp',
    restart_delay: 3000,
    max_restarts: 50,
    autorestart: true,
    watch: false,
    env: {
      // TG_BOT_TOKEN: 'xxx',
      // TG_CHAT_ID: 'xxx',
    },
  }],
};
