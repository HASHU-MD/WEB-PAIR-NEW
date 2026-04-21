const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
let router = express.Router()
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

function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.send({ error: "Please provide a phone number" });

    // New request ekak enakota parana data clear karanawa
    removeFile('./session');

    async function PrabathPair() {
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);
        
        try {
            let PrabathPairWeb = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                // Desktop configuration ekata wada Linux/Chrome stable pairing walata
                browser: ["Ubuntu", "Chrome", "20.0.04"],
            });

            if (!PrabathPairWeb.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                
                try {
                    const code = await PrabathPairWeb.requestPairingCode(num);
                    if (!res.headersSent) {
                        res.send({ code });
                    }
                } catch (codeErr) {
                    console.error("Pairing Code Error:", codeErr);
                    if (!res.headersSent) {
                        res.send({ code: "Try again later" });
                    }
                }
            }

            PrabathPairWeb.ev.on('creds.update', saveCreds);
            PrabathPairWeb.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        await delay(5000); // File eka save wenna podi welawak denawa
                        const auth_path = './session/creds.json';
                        const user_jid = jidNormalizedUser(PrabathPairWeb.user.id);

                        function randomMegaId(length = 10) {
                            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                            let result = '';
                            for (let i = 0; i < length; i++) {
                                result += characters.charAt(Math.floor(Math.random() * characters.length));
                            }
                            return result;
                        }

                        // Mega Upload Logic
                        const mega_url = await upload(fs.createReadStream(auth_path), `${randomMegaId()}.json`);
                        const sid = mega_url.replace('https://mega.nz/file/', '');

                        // WhatsApp ekata session ID eka yawawa
                        await PrabathPairWeb.sendMessage(user_jid, { 
                            text: `HASHU-MD SESSION CONNECTED\n\nSESSION ID: ${sid}\n\nDon't share this ID with anyone!` 
                        });

                        await delay(2000);
                        // Cleanup
                        removeFile('./session');
                        // PM2 restart eka meyata awashya na session eka awata passe
                        
                    } catch (e) {
                        console.error("Session Processing Error:", e);
                    }
                } else if (connection === "close") {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
                    if (shouldReconnect) {
                        // Logout ekak nemei nam reconnect wenna try karanawa
                        // PrabathPair(); // Meka godak welata pair code ekata oni wenne na
                    }
                }
            });
        } catch (err) {
            console.error("Global Error:", err);
            removeFile('./session');
            if (!res.headersSent) {
                res.send({ code: "Service Error" });
            }
        }
    }
    return await PrabathPair();
});

module.exports = router;
