// ════════════════════════════════════════════════════════════════════
//  Bantu Collaborative IDE — chat + voice + real-time code editing
//  ════════════════════════════════════════════════════════════════════
//
//  Features:
//    • Real-time chat (WebSocket text messages)
//    • Voice transmission (WebSocket binary frames — audio chunks)
//    • Collaborative code editing (CodeMirror synced via WebSocket)
//    • Multiple participants see each other's cursors + edits live
//
//  All powered by Bantu v1.3.2 + sua.ws (WebSocket) + sua.ws.send_binary
// ════════════════════════════════════════════════════════════════════

print "═════════════════════════════════════════════";
print "  Bantu Collaborative IDE v1.3.2";
print "  Chat + Voice + Real-time Code Editing";
print "═════════════════════════════════════════════";

// ─── WebSocket event handlers ──────────────────────────────────────

dict $clients = {};  // clientId → {name, hasVoice}

sua.ws.on("connect", def($client) {
    print "[WS] Client connected: " + $client.id;
    $clients[$client.id] = {"name": "guest", "hasVoice": false};
    // Send current user list
    sua.ws.send($client.id, json.stringify({"type": "welcome", "id": $client.id}));
    sua.ws.broadcast(json.stringify({"type": "user-joined", "id": $client.id}));
});

sua.ws.on("message", def($msg) {
    // Parse the JSON message
    dict $json = $msg.json;
    if (!$json) {
        // Not JSON — treat as plain chat message
        sua.ws.broadcast(json.stringify({
            "type": "chat",
            "from": $msg.client,
            "text": $msg.data
        }));
        return;
    }

    string $type = $json.type;

    // Chat message
    if ($type == "chat") {
        sua.ws.broadcast(json.stringify({
            "type": "chat",
            "from": $msg.client,
            "name": $json.name,
            "text": $json.text
        }));
    }

    // Set name
    if ($type == "set-name") {
        $clients[$msg.client].name = $json.name;
        sua.ws.broadcast(json.stringify({
            "type": "name-change",
            "id": $msg.client,
            "name": $json.name
        }));
    }

    // Code edit (delta)
    if ($type == "code-edit") {
        // Broadcast to all OTHER clients
        list $allClients = sua.ws.clients();
        number $i = 0;
        while ($i < len($allClients)) {
            if ($allClients[$i] != $msg.client) {
                sua.ws.send($allClients[$i], json.stringify({
                    "type": "code-edit",
                    "from": $msg.client,
                    "changes": $json.changes
                }));
            }
            $i = $i + 1;
        }
    }

    // Cursor position
    if ($type == "cursor") {
        list $allClients = sua.ws.clients();
        number $i = 0;
        while ($i < len($allClients)) {
            if ($allClients[$i] != $msg.client) {
                sua.ws.send($allClients[$i], json.stringify({
                    "type": "cursor",
                    "from": $msg.client,
                    "line": $json.line,
                    "ch": $json.ch
                }));
            }
            $i = $i + 1;
        }
    }

    // Voice start
    if ($type == "voice-start") {
        $clients[$msg.client].hasVoice = true;
        sua.ws.broadcast(json.stringify({
            "type": "voice-start",
            "id": $msg.client,
            "name": $clients[$msg.client].name
        }));
    }

    // Voice stop
    if ($type == "voice-stop") {
        $clients[$msg.client].hasVoice = false;
        sua.ws.broadcast(json.stringify({
            "type": "voice-stop",
            "id": $msg.client
        }));
    }
});

sua.ws.on("disconnect", def($client) {
    print "[WS] Client left: " + $client.id;
    // Remove from clients dict (set to null — Bantu dicts can't delete)
    $clients[$client.id] = null;
    sua.ws.broadcast(json.stringify({
        "type": "user-left",
        "id": $client.id
    }));
});

// ─── Serve the IDE frontend ────────────────────────────────────────
sua.server.static("./public");

// ─── Health check endpoint (for Render) ───────────────────────────
sua.server.get("/api/health", def($req, $res) {
    $res.json({"status": "ok", "version": "1.3.2", "ws": true});
});

// ─── Start ────────────────────────────────────────────────────────
// Render automatically sets the PORT env var. Read it.
string $port = env("PORT");
if (!$port) { $port = "8080"; }

print "";
print "════════════════════════════════════════════════════════════════";
print "  Bantu Collaborative IDE ready on port " + $port;
print "";
print "  Open http://localhost:" + $port + " in 2+ browser tabs";
print "  • Chat: type in the chat box + Enter";
print "  • Voice: click the mic button to start/stop";
print "  • Code: edit in the CodeMirror editor — changes sync live";
print "════════════════════════════════════════════════════════════════";

sua.server.listen(num($port));
