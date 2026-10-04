/**
 * DrowsiGuard - Local LAN Development Server
 * Zero-dependency Node.js HTTP/HTTPS server binding to 0.0.0.0.
 * Automatically discovers local LAN IP addresses for instant phone testing.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HTTP_PORT = process.env.PORT || 8080;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.wasm': 'application/wasm'
};

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ips.push({ name, address: net.address });
            }
        }
    }
    return ips;
}

function requestHandler(req, res) {
    // CORS headers for WebSockets & MediaPipe cross-origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let parsedUrl = req.url.split('?')[0];
    if (parsedUrl === '/') parsedUrl = '/index.html';

    const safePath = path.normalize(parsedUrl).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(ROOT_DIR, safePath);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found: ' + safePath);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache'
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
    });
}

// 1. Start HTTP Server
const httpServer = http.createServer(requestHandler);
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    const ips = getLocalIPs();
    console.log('\n=============================================================');
    console.log('  DROWSIGUARD - LOCAL DEVELOPMENT SERVER RUNNING');
    console.log('=============================================================');
    console.log(`\n> Local Access (Laptop Browser):`);
    console.log(`  http://localhost:${HTTP_PORT}`);
    console.log(`\n> Android Mobile Access (Same Wi-Fi Network):`);
    if (ips.length > 0) {
        ips.forEach(ip => {
            console.log(`  http://${ip.address}:${HTTP_PORT}  (${ip.name})`);
        });
    } else {
        console.log(`  http://192.168.x.x:${HTTP_PORT}`);
    }

    console.log('\n-------------------------------------------------------------');
    console.log('  CAMERA ACCESS INSTRUCTIONS FOR ANDROID CHROME:');
    console.log('-------------------------------------------------------------');
    console.log('Method 1 (Recommended / Zero-Cert):');
    console.log('  Connect phone via USB with USB Debugging enabled, run:');
    console.log(`  adb reverse tcp:${HTTP_PORT} tcp:${HTTP_PORT}`);
    console.log(`  Then open http://localhost:${HTTP_PORT} on Android Chrome!`);
    console.log('  (Chrome natively treats localhost as a Secure Context with full camera access!)');
    console.log('\nMethod 2 (Wireless LAN via mkcert):');
    console.log('  Generate trusted cert with mkcert (see LAN_MOBILE_SETUP.md).');
    console.log('=============================================================\n');
});

// 2. Check for mkcert SSL files (cert.pem & key.pem)
const certPath = path.join(ROOT_DIR, 'cert.pem');
const keyPath = path.join(ROOT_DIR, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
        const httpsOptions = {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath)
        };
        const httpsServer = https.createServer(httpsOptions, requestHandler);
        httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
            console.log(`> HTTPS Server active on port ${HTTPS_PORT}`);
            const ips = getLocalIPs();
            ips.forEach(ip => {
                console.log(`  https://${ip.address}:${HTTPS_PORT}`);
            });
        });
    } catch (e) {
        console.warn('Could not start HTTPS server:', e.message);
    }
}
