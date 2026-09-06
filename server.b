// Bantu Collaborative IDE v1.3.2 — chat + voice + code editing

print "=========================================";
print "  Bantu Collaborative IDE v1.3.2";
print "  Chat + Voice + Real-time Code Editing";
print "=========================================";

// ─── WebSocket handlers ────────────────────────────────────────────

sua.ws.on("connect", def($client) {
    print "[WS] Connected: " + $client.id;
    sua.ws.send($client.id, json.stringify({"type": "welcome", "id": $client.id}));
    sua.ws.broadcast(json.stringify({"type": "user-joined", "id": $client.id}));
});

sua.ws.on("message", def($msg) {
    // If not JSON, broadcast raw
    if (!$msg.json) {
        sua.ws.broadcast($msg.data);
        return;
    }

    string $type = $msg.json.type;

    // Chat message — relay to everyone
    if ($type == "chat") {
        sua.ws.broadcast(json.stringify({
            "type": "chat",
            "name": $msg.json.name,
            "text": $msg.json.text
        }));
    }

    // Set name
    if ($type == "set-name") {
        sua.ws.broadcast(json.stringify({
            "type": "name-change",
            "id": $msg.client,
            "name": $msg.json.name
        }));
    }

    // Code edit — relay to all OTHER clients
    if ($type == "code-edit") {
        list $all = sua.ws.clients();
        number $i = 0;
        while ($i < len($all)) {
            if ($all[$i] != $msg.client) {
                sua.ws.send($all[$i], json.stringify({
                    "type": "code-edit",
                    "changes": $msg.json.changes
                }));
            }
            $i = $i + 1;
        }
    }

    // Cursor position — relay to others
    if ($type == "cursor") {
        list $all = sua.ws.clients();
        number $i = 0;
        while ($i < len($all)) {
            if ($all[$i] != $msg.client) {
                sua.ws.send($all[$i], json.stringify({
                    "type": "cursor",
                    "from": $msg.client,
                    "line": $msg.json.line,
                    "ch": $msg.json.ch
                }));
            }
            $i = $i + 1;
        }
    }

    // Voice start/stop
    if ($type == "voice-start") {
        sua.ws.broadcast(json.stringify({"type": "voice-start", "id": $msg.client}));
    }
    if ($type == "voice-stop") {
        sua.ws.broadcast(json.stringify({"type": "voice-stop", "id": $msg.client}));
    }
});

sua.ws.on("disconnect", def($client) {
    print "[WS] Left: " + $client.id;
    sua.ws.broadcast(json.stringify({"type": "user-left", "id": $client.id}));
});

// ─── Static frontend ───────────────────────────────────────────────
sua.server.static("./public");

// ─── Health check ─────────────────────────────────────────────────
sua.server.get("/api/health", def($req, $res) {
    $res.json({"status": "ok", "version": "1.3.2", "ws": true});
});

// ─── Start ────────────────────────────────────────────────────────
string $port = env("PORT");
if (!$port) { $port = "10000"; }

print "";
print "========================================";
print "  Ready on port " + $port;
print "  Open http://localhost:" + $port;
print "========================================";

sua.server.listen(num($port));
