
const express = require("express");
const net = require("net");

const app = express();
const PORT = process.env.PORT || 3000;

const SERVER_IP = "160.202.130.101";
const SERVER_PORT = 7171;

const REQUEST = Buffer.from("0400FF012900", "hex");

app.use(express.static("public"));

// ==========================================
// LEITURA DOS DADOS DO PACOTE
// ==========================================

function readString(buffer, state) {
    if (state.offset + 2 > buffer.length) {
        throw new Error("Resposta incompleta ao ler texto.");
    }

    const length = buffer.readUInt16LE(state.offset);
    state.offset += 2;

    if (state.offset + length > buffer.length) {
        throw new Error("Texto incompleto na resposta.");
    }

    const value = buffer.toString(
        "utf8",
        state.offset,
        state.offset + length
    );

    state.offset += length;

    return value;
}

function readUInt32(buffer, state) {
    if (state.offset + 4 > buffer.length) {
        throw new Error("Resposta incompleta ao ler número.");
    }

    const value = buffer.readUInt32LE(state.offset);
    state.offset += 4;

    return value;
}

// ==========================================
// INTERPRETAÇÃO DA RESPOSTA DO PStory
// ==========================================

function decodeResponse(buffer) {
    if (buffer.length < 2) {
        throw new Error("Resposta muito curta.");
    }

    const packetLength = buffer.readUInt16LE(0);

    if (packetLength + 2 !== buffer.length) {
        throw new Error("Tamanho do pacote inválido.");
    }

    const state = { offset: 2 };

    // Opcode 0x10: informações do servidor

    if (buffer[state.offset++] !== 0x10) {
        throw new Error("Opcode 0x10 não encontrado.");
    }

    const serverName = readString(buffer, state);
    const serverIP = readString(buffer, state);
    const serverPort = readString(buffer, state);

    // Opcode 0x20: estatísticas

    if (buffer[state.offset++] !== 0x20) {
        throw new Error("Opcode 0x20 não encontrado.");
    }

    const online = readUInt32(buffer, state);
    const capacity = readUInt32(buffer, state);
    const record = readUInt32(buffer, state);

    // Opcode 0x21: lista de jogadores

    if (buffer[state.offset++] !== 0x21) {
        throw new Error("Opcode 0x21 não encontrado.");
    }

    const playerCount = readUInt32(buffer, state);
    const players = [];

    if (playerCount > 10000) {
        throw new Error("Quantidade de jogadores inválida.");
    }

    for (let i = 0; i < playerCount; i++) {
        const name = readString(buffer, state);
        const level = readUInt32(buffer, state);

        players.push({
            name,
            level
        });
    }

    if (state.offset !== buffer.length) {
        throw new Error("Existem dados extras no pacote.");
    }

    const valid =
        serverName === "PStory" &&
        serverIP === SERVER_IP &&
        serverPort === String(SERVER_PORT) &&
        online === playerCount &&
        players.length === playerCount;

    return {
        valid,
        serverName,
        serverIP,
        serverPort,
        online,
        capacity,
        record,
        playerCount,
        players
    };
}

// ==========================================
// CONSULTA TCP
// ==========================================

app.get("/api/status", (req, res) => {
    console.log("\n================================");
    console.log("Nova consulta ao PStory");
    console.log("================================");

    const socket = new net.Socket();

    let response = Buffer.alloc(0);
    let finished = false;
    let connected = false;

    function finish(data) {
        if (finished) return;

        finished = true;

        socket.destroy();

        if (!res.headersSent) {
            res.json(data);
        }
    }

    socket.setTimeout(10000);

    socket.connect(SERVER_PORT, SERVER_IP, () => {
        connected = true;

        console.log("TCP conectado!");
        console.log("Enviando:", REQUEST.toString("hex"));

        socket.write(REQUEST, (error) => {
            if (error) {
                console.log("Erro ao enviar:", error.message);
            } else {
                console.log("Requisição enviada com sucesso!");
            }
        });
    });

    // Recebe os dados

    socket.on("data", (chunk) => {
        console.log("Pacote recebido:", chunk.length, "bytes");

        response = Buffer.concat([
            response,
            chunk
        ]);

        if (response.length > 65536) {
            finish({
                connected: true,
                valid: false,
                error: "Resposta excedeu o limite permitido.",
                raw: response.toString("hex"),
                bytes: response.length
            });
        }
    });

    // Servidor encerrou a conexão

    socket.on("end", () => {
        console.log("Servidor encerrou a conexão.");
        console.log("Total de bytes recebidos:", response.length);
        console.log("Resposta HEX:", response.toString("hex"));

        if (response.length === 0) {
            console.log("AVISO: Nenhum dado recebido do servidor.");

            finish({
                connected: true,
                valid: false,
                error: "Servidor encerrou sem enviar dados. Tente novamente.",
                raw: "",
                bytes: 0
            });

            return;
        }

        try {
            const decoded = decodeResponse(response);

            console.log("Servidor:", decoded.serverName);
            console.log("Jogadores online:", decoded.online);
            console.log("Jogadores recebidos:", decoded.playerCount);
            console.log("Pacote validado:", decoded.valid);

            finish({
                connected: true,
                ...decoded,
                raw: response.toString("hex"),
                bytes: response.length
            });

        } catch (error) {
            console.log("Erro ao interpretar pacote:", error.message);

            finish({
                connected: true,
                valid: false,
                error: error.message,
                raw: response.toString("hex"),
                bytes: response.length
            });
        }
    });

    // Tempo limite

    socket.on("timeout", () => {
        console.log("Tempo limite da conexão excedido.");

        finish({
            connected,
            valid: false,
            error: "Tempo limite excedido. Tente novamente.",
            raw: response.toString("hex"),
            bytes: response.length
        });
    });

    // Erros de conexão

    socket.on("error", (error) => {
        console.log("Erro TCP:", error.message);

        finish({
            connected,
            valid: false,
            error: error.message,
            raw: response.toString("hex"),
            bytes: response.length
        });
    });
});

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR WEB
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log("PStory Monitor rodando na porta " + PORT);
    console.log("Servidor TCP: " + SERVER_IP + ":" + SERVER_PORT);
    console.log("--------------------------------");
});
