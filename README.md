# Veil — Temporary Chat Starter

A mobile-friendly two-person chat prototype. It relays text and small files through a Node.js server and keeps room state only in process memory.

## What this starter does
- One person creates a room and shares an 8-character invite code.
- Only two sockets can join a room.
- Text messages and supported files (image, video, PDF, plain text; up to 4 MiB) are relayed live.
- The server does not write messages or media to a database or disk.
- When either participant leaves or disconnects, the server destroys the room and disconnects the other participant.
- Rooms expire after 10 minutes as a fallback.
- Mobile-friendly responsive UI.

## Important limitations
**This is a prototype, not a security-audited private messenger.**
- It does **not** implement end-to-end encryption. The server can technically read text and media contents.
- Use a hosting provider that gives HTTPS/WSS. HTTPS protects traffic in transit, but does not stop the server from seeing content.
- The recipient can screenshot, copy, record, download, or otherwise retain content. This website cannot erase recipient-side copies.
- Browser/mobile network disconnect events may be delayed. The 10-minute expiry is a fallback.
- State is held in process memory. Restarting the server destroys active rooms; multiple server instances will not share rooms. Use one instance only for this starter.
- This starter has basic attempt throttling but is not hardened against targeted attacks, abuse, denial of service, or sophisticated code guessing.
- Uploaded files are relayed as base64 through server memory and are not persisted intentionally. Keep file limits low.
- Browser cache, OS-level captures, logs added by a hosting provider, or backups outside this app are not controlled by the app.

## Run locally
Requires Node.js 20+:
```bash
npm install
npm start
```
Open `http://localhost:3000`.

## Deploy using a phone
1. Create a GitHub account if you do not already have one.
2. Upload these project files to a new GitHub repository. Do not add secrets.
3. In a Node.js hosting provider that supports deploying from GitHub, create a Web Service from that repository.
4. Set the start command to `npm start`; the host should provide a `PORT` environment variable.
5. Use a single running instance and enable HTTPS. Open the deployed URL on your phone.
6. Test with two separate browsers/devices before sharing it.

Provider dashboards change; follow the host's current instructions. Free plans may sleep, limit traffic, or change their terms.

## Before real private use
1. Add reviewed end-to-end encryption (for example, a maintained Signal Protocol implementation) with a secure key-verification flow.
2. Have an experienced security engineer review room lifecycle, invitation entropy, abuse/rate limits, headers, deployment, logging, and dependency updates.
3. Decide and disclose how disconnects, reconnects, browser back/close, and mobile backgrounding should behave.
4. Test deletion behavior and make no claim that content is unrecoverable from recipient devices.
