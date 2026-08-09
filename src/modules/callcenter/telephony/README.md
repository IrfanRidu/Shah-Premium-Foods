# Telephony deployment guide

Everything in this module's application layer (models, services, API
routes, the Socket.IO layer, the softphone UI) is complete, verified for
syntax, and ready to run. **This one piece is different**: it needs a
real Asterisk server and real network access to actually place calls,
neither of which exist in the sandbox this was built in. This document
is the honest, complete path to making it real on your own VPS.

## What you're setting up

```
                    ┌─────────────────────────────┐
   Browser  ───wss──▶  Asterisk (PJSIP + ARI)      │
  (agent's             on your VPS, port 8088/8089 │
   softphone)          │                            │
                       └──────────┬──────────────────┘
                                  │ ARI (HTTP + WebSocket)
                                  ▼
                    Node: server.js (Next.js + Socket.IO)
                    + ariClient.js (call routing), same process
                                  │
                                  ▼
                              MongoDB
```

## 1. Install Asterisk 20 LTS on your VPS (Ubuntu 22.04/24.04 assumed)

```bash
sudo apt update && sudo apt install -y build-essential wget libssl-dev \
  libncurses5-dev libnewt-dev libxml2-dev linux-headers-$(uname -r) \
  libsqlite3-dev uuid-dev libjansson-dev libedit-dev

cd /usr/src
sudo wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
sudo tar xvf asterisk-20-current.tar.gz
cd asterisk-20*/
sudo contrib/scripts/get_mp3_source.sh
sudo ./configure --with-jansson-bundled
sudo make menuselect.makeopts
# In menuselect, confirm res_pjsip*, res_ari*, and app_mixmonitor are all
# selected (they are by default in a standard build).
sudo make -j"$(nproc)" && sudo make install && sudo make config
sudo ldconfig
```

## 2. Copy the config files from this folder

```bash
sudo cp asterisk-config/pjsip.conf    /etc/asterisk/pjsip.conf
sudo cp asterisk-config/extensions.conf /etc/asterisk/extensions.conf
sudo cp asterisk-config/http.conf     /etc/asterisk/http.conf
sudo cp asterisk-config/rtp.conf      /etc/asterisk/rtp.conf
sudo cp asterisk-config/ari.conf      /etc/asterisk/ari.conf
```

Each file has inline comments explaining every setting — read `pjsip.conf`
and `extensions.conf` first, they need the most deployment-specific
editing (your actual trunk name, TLS certificate paths).

**Before starting Asterisk**, edit:
- `ari.conf` — replace `CHANGE_ME_TO_A_REAL_SECRET` with a real password,
  and set the matching `ASTERISK_ARI_PASSWORD` in your app's `.env`.
- `http.conf` — point `tlscertfile`/`tlsprivatekey` at a real certificate
  (Let's Encrypt via certbot is the easiest free option). **A self-signed
  cert will make the browser silently refuse the WebSocket connection**
  — this is the single most common "nothing happens when I click Call"
  cause in a first WebRTC/Asterisk setup, worth ruling out first.
- `extensions.conf`'s `[from-trunk]` context — replace with your actual
  SIP trunk provider's context name (this varies per provider, so it's
  deliberately left as a clearly-marked placeholder rather than a guess).

## 3. Get a SIP trunk (for real inbound/outbound PSTN calls)

Asterisk itself is free and self-hosted (satisfying "no paid telephony
API"), but connecting to the actual phone network still requires *some*
trunk provider — there's no way around this, phone numbers and PSTN
termination aren't free anywhere. This is infrastructure, not a "paid
telephony API" in the Twilio/Plivo sense the spec ruled out — you're
choosing your own carrier and paying wholesale rates directly, with
Asterisk doing 100% of the actual call handling, rather than paying a
per-call markup to a hosted API. Any SIP trunk provider works; configure
it as a `PJSIP` trunk in `pjsip.conf` following your provider's docs
(this part is provider-specific, so it isn't included as a template).

## 4. Open your firewall / VPS security group

| Port | Protocol | Purpose |
|---|---|---|
| 8088 | TCP | ARI (Node service talks to Asterisk) |
| 8089 | TCP | WSS (browser softphone signaling) |
| 10000–20000 | UDP | RTP media (see `rtp.conf`) — **the #1 cause of "call connects but I hear silence"** if this range isn't open |

## 5. Generate per-agent PJSIP config

```bash
cd /path/to/this/project
node src/modules/callcenter/telephony/generatePjsipConfig.js
sudo asterisk -rx "pjsip reload"
```

Re-run this (or automate it) every time an agent is created/deleted.

## 6. Set your `.env`

```bash
ASTERISK_ARI_URL=http://127.0.0.1:8088
ASTERISK_ARI_USER=callcenter
ASTERISK_ARI_PASSWORD=<same as ari.conf>
ASTERISK_WS_URL=wss://your-domain.com:8089/ws
ASTERISK_SIP_DOMAIN=your-domain.com
ASTERISK_RECORDINGS_DIR=/var/spool/asterisk/monitor
JWT_SECRET_ACCESS=<your existing value — unchanged>
```

## 7. Start the app with telephony enabled

`server.js` should import and start `ariClient.js` **in the same
process** — this is the recommended setup and is what makes real-time
Socket.IO notifications (incoming-call toasts, live agent-status
updates) actually reach connected browsers; see the large comment at the
top of `ariClient.js`'s `start()` function for exactly why running it as
a fully separate process loses that (call routing still works, the
Socket.IO enrichment on top of it doesn't, unless you add a pub/sub
bridge like `socket.io-redis`).

```bash
npm install   # picks up socket.io, sip.js, ari-client from package.json
npm run start
```

## 8. NAT / no audio despite everything above looking right

Most VPS providers put you behind at least one layer of NAT even with a
"public" IP. If signaling works (softphone shows "connected", call
rings) but there's no audio, you need a TURN server so ICE can actually
establish a media path. [coturn](https://github.com/coturn/coturn) is
free, open-source, and self-hosted (same "no paid services" spirit as
Asterisk) — install it on the same or a second VPS and add its address
to `rtp.conf`'s ICE config, then to your PJSIP endpoint's ICE settings.
This is a real, separate piece of infrastructure, not a config toggle —
called out explicitly here rather than glossed over.

## Known simplifications worth revisiting once you can test against a live PBX

- **Hold** (`sipClient.js`'s `toggleHold`) mutes the local track rather
  than doing a proper SDP re-INVITE — the customer won't hear Asterisk's
  hold music during an agent-initiated hold, just silence. A real hold
  needs `session.invite()` with modified SDP, which is exactly the kind
  of thing worth verifying against a real call before relying on it.
- **`ariClient.js`'s `agentId` requirement on CallLog**: the schema has
  `agentId` as `required: true` from the original tel:-link flow, but a
  fresh inbound call has no agent until one answers — flagged in-code
  where this matters, worth deciding whether to relax that constraint
  once real inbound-call behavior is observed.
