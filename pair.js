const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const { upload } = require('./mega');

let router = express.Router();

function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({ error: "Phone number is required" });
    }

    // Aluth request ekak enakota parana session folder eka delete karanawa
    removeFile('./session');

    async function HASHU_Pair_Logic() {
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);
        
        try {
            let HASHU_Socket = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                // Stable ma pairing configuration eka
                browser: ["Ubuntu", "Chrome", "20.0.04"],
            });

            // Pairing code request logic
            if (!HASHU_Socket.authState.creds.registered) {
                await delay(3000); // Connection eka stable wenna podi delay ekak
                num = num.replace(/[^0-9]/g, ''); // Number eka clean karanawa
                
                try {
                    const code = await HASHU_Socket.requestPairingCode(num);
                    if (!res.headersSent) {
                        return res.send({ code });
                    }
                } catch (codeErr) {
                    console.log("Pairing Code Generation Error: ", codeErr);
                    if (!res.headersSent) {
                        return res.send({ code: "Can't generate code. Try again." });
                    }
                }
            }

            HASHU_Socket.ev.on('creds.update', saveCreds);

            HASHU_Socket.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        await delay(5000); // creds.json eka save wenna welawa denawa
                        const auth_path = './session/creds.json';
                        const user_jid = jidNormalizedUser(HASHU_Socket.user.id);

                        // Random ID generator for Mega file
                        const randomID = (length = 8) => {
                            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                            let result = '';
                            for (let i = 0; i < length; i++) {
                                result += chars.charAt(Math.floor(Math.random() * chars.length));
                            }
                            return result;
                        };

                        // Mega Upload
                        const mega_url = await upload(fs.createReadStream(auth_path), `${randomID()}.json`);
                        const sid = mega_url.replace('https://mega.nz/file/', '');

                        // WhatsApp Message
                        await HASHU_Socket.sendMessage(user_jid, { 
                            text: `*HASHU-MD SESSION CONNECTED*\n\n*ID:* ${sid}\n\n> Don't share this code with anyone!` 
                        });

                        await delay(2000);
                        removeFile('./session'); // Session folder eka clean karanawa
                        
                        // Process eka iwara nisa pm2 restart oni wenne na
                    } catch (e) {
                        console.log("Connection Success but Error in Sending: ", e);
                    }
                } else if (connection === "close") {
                    let reason = lastDisconnect?.error?.output?.statusCode;
                    if (reason !== 401) {
                        // Logout nemei nam connection error ekak nisa reconnect wenda puluwan
                    }
                }
            });

        } catch (err) {
            console.log("Global Error: ", err);
            removeFile('./session');
            if (!res.headersSent) {
                res.send({ code: "Service Unavailable" });
            }
        }
    }

    return await HASHU_Pair_Logic();
});

module.exports = router;
