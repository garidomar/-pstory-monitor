
const online = document.getElementById("online");
const capacity = document.getElementById("capacity");
const record = document.getElementById("record");

const status = document.getElementById("status");
const message = document.getElementById("message");
const raw = document.getElementById("raw");
const lastUpdate = document.getElementById("lastUpdate");
const refresh = document.getElementById("refresh");
const playersList = document.getElementById("playersList");

async function atualizarServidor() {
    refresh.disabled = true;
    message.textContent = "Consultando servidor PStory...";

    try {
        const response = await fetch("/api/status", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Erro HTTP: " + response.status);
        }

        const data = await response.json();

        raw.textContent = data.raw
            ? data.raw.match(/.{1,2}/g).join(" ").toUpperCase()
            : "Nenhum dado recebido.";

        if (data.connected && data.valid) {
            status.textContent = "PStory validado";
            status.className = "status online";

            online.textContent = data.online;
            capacity.textContent = data.capacity;
            record.textContent = data.record;

            message.textContent =
                "Servidor " + data.serverName +
                " validado. " + data.playerCount +
                " jogadores recebidos.";

            playersList.innerHTML = "";

            data.players.forEach(player => {
                const tr = document.createElement("tr");

                const name = document.createElement("td");
                name.textContent = player.name;

                const level = document.createElement("td");
                level.textContent = player.level;

                tr.appendChild(name);
                tr.appendChild(level);

                playersList.appendChild(tr);
            });

        } else {
            status.textContent = data.connected
                ? "Dados inválidos"
                : "Desconectado";

            status.className = "status offline";

            message.textContent =
                data.error || "Falha na validação.";

            online.textContent = "--";
            capacity.textContent = "--";
            record.textContent = "--";

            playersList.innerHTML =
                '<tr><td colspan="2">Não foi possível carregar os jogadores.</td></tr>';
        }

        lastUpdate.textContent =
            new Date().toLocaleTimeString("pt-BR");

    } catch (error) {
        status.textContent = "Erro";
        status.className = "status offline";
        message.textContent = error.message;

    } finally {
        refresh.disabled = false;
    }
}

refresh.addEventListener("click", atualizarServidor);

// Primeira consulta ao abrir a página
atualizarServidor();

// Atualização automática a cada 300 segundos (5 minutos)
setInterval(atualizarServidor, 300000);
