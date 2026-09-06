// Splannes Thumb Pal — Collaborative IDE v1.3.2

print "=========================================";
print "  Splannes Thumb Pal v1.3.2";
print "=========================================";

// Binary voice messages are relayed at C++ level (opcode 0x2).
// Text messages go through these handlers.

sua.ws.on("connect", def($client) {
    print "[WS] Connected: " + $client.id;
    sua.ws.send($client.id, json.stringify({"type": "welcome", "id": $client.id}));
    sua.ws.broadcast(json.stringify({"type": "user-joined", "id": $client.id}));
});

sua.ws.on("message", def($msg) {
    if (!$msg.json) {
        sua.ws.broadcast($msg.data);
        return;
    }

    string $type = $msg.json.type;

    if ($type == "chat") {
        sua.ws.broadcast($msg.data);
    }
    if ($type == "set-name") {
        sua.ws.broadcast($msg.data);
    }

    // Code edit — relay to all OTHER clients (content snapshot, not delta)
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

    // Cursor — relay to others
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
});

sua.ws.on("disconnect", def($client) {
    print "[WS] Left: " + $client.id;
    sua.ws.broadcast(json.stringify({"type": "user-left", "id": $client.id}));
});

sua.server.static("./public");

sua.server.get("/api/health", def($req, $res) {
    $res.json({"status": "ok", "version": "1.3.2", "app": "Splannes Thumb Pal"});
});

string $port = env("PORT");
if (!$port) { $port = "10000"; }

print "  Ready on port " + $port;
sua.server.listen(num($port));
