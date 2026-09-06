// Bantu Collaborative IDE v1.3.2
// Chat + Voice + Real-time Code Editing via sua.ws WebSocket

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
    // If no JSON, broadcast raw
    if (!$msg.json) {
        sua.ws.broadcast($msg.data);
        return;
    }

    string $type = $msg.json.type;

    // Chat — broadcast to everyone (including sender for echo)
    if ($type == "chat") {
        sua.ws.broadcast($msg.data);
    }

    // Set name — broadcast to everyone
    if ($type == "set-name") {
        sua.ws.broadcast($msg.data);
    }

    // Code edit — relay to all OTHER clients (not sender)
    if ($type == "code-edit") {
        list $all = sua.ws.clients();
        number $i = 0;
        while ($i < len($all)) {
            if ($all[$i] != $msg.client) {
                sua.ws.send($all[$i], $msg.data);
            }
            $i = $i + 1;
        }
    }

    // Cursor — relay to all OTHER clients
    if ($type == "cursor") {
        list $all = sua.ws.clients();
        number $i = 0;
        while ($i < len($all)) {
            if ($all[$i] != $msg.client) {
                sua.ws.send($all[$i], $msg.data);
            }
            $i = $i + 1;
        }
    }

    // Voice start/stop — broadcast to everyone
    if ($type == "voice-start") {
        sua.ws.broadcast($msg.data);
    }
    if ($type == "voice-stop") {
        sua.ws.broadcast($msg.data);
    }

    // Binary voice data — relay to all OTHER clients
    if ($msg.binary) {
        list $all = sua.ws.clients();
        number $i = 0;
        while ($i < len($all)) {
            if ($all[$i] != $msg.client) {
                sua.ws.send_binary($all[$i], $msg.bytes);
            }
            $i = $i + 1;
        }
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
