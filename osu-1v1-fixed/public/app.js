
let ws;

async function queue() {
  const name = document.getElementById("name").value;

  const res = await fetch("/api/queue", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({name})
  });

  const data = await res.json();

  if(data.code) {
    joinRoom(data.code);
    document.getElementById("status").innerText = "Matched!";
  } else {
    document.getElementById("status").innerText = "Waiting...";
  }
}

function joinRoomManual() {
  const code = document.getElementById("code").value.toUpperCase();
  joinRoom(code);
}

function joinRoom(code) {
  ws = new WebSocket(`wss://${location.host}/ws/${code}`);

  ws.onmessage = e => {
    const div = document.createElement("div");
    div.textContent = e.data;
    document.getElementById("chat").appendChild(div);
  };
}

function send() {
  const name = document.getElementById("name").value;
  const msg = document.getElementById("msg").value;
  ws.send(name + ": " + msg);
}
